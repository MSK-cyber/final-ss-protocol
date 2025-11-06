// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPair.sol";

/**
 * @title ReverseAuctionCalculations
 * @notice Library containing ONLY calculation logic for reverse (backward) auctions
 * @dev ARCHITECTURE NOTE - Library Access Control:
 *      This is a LIBRARY, not a standalone contract. Library functions can ONLY be called
 *      by contracts that import them (in this case, AuctionSwap.sol).
 *      
 *      Security Model:
 *      - Library functions are NOT directly callable by users on-chain
 *      - Only AuctionSwap.sol can invoke these functions
 *      - AuctionSwap.sol provides all access control and validation
 *      - Library focuses on pure mathematical calculations
 *      
      Reverse Auction Flow (User provides auction tokens to get STATE):
      Step 1: User deposits auction tokens
      Step 2: Swap auction tokens for STATE in pool (AMM swap)
      Step 3: User must burn 100% of received STATE (all of it)
      Step 4: Calculate auction tokens to return (2x pool ratio for burned STATE)
      Step 5: AuctionSwap.sol executes burns and transfers
 *      
 *      Key Difference from Normal Auction:
 *      - Normal: User burns DAV → Gets auction tokens
 *      - Reverse: User deposits auction tokens → Burns STATE → Gets auction tokens back
 *      
 *      Precision Handling:
 *      - All calculations use 18 decimal precision (1e18)
 *      - Integer division may cause truncation (expected behavior)
 *      - Truncation always favors the protocol (conservative)
 *      - Solidity 0.8.20 provides automatic overflow protection
 *      
 *      AUDIT CLARIFICATION:
 *      If you're auditing this library in isolation, you MUST examine AuctionSwap.sol
 *      to understand the complete security model and validation logic.
 */
library ReverseAuctionCalculations {

    /// @notice STATE token bonus multiplier: 2x the pool ratio
    /// @dev Users receive double the market rate for burned STATE tokens
    uint256 internal constant STATE_MULTIPLIER = 2;
    
    /// @notice Precision factor for decimal calculations
    /// @dev Standard 18 decimal precision used throughout DeFi
    uint256 internal constant PRECISION_FACTOR = 1e18;

    // ================= Errors =================
    
    /// @notice Thrown when liquidity pool reserves are zero
    error InvalidReserves();
    
    /// @notice Thrown when pair tokens don't match expected auction/STATE tokens
    error PairInvalid();
    
    /// @notice Thrown when swap amount is zero
    error AmountZero();

    // ================= Core Calculation Functions =================

    /**
     * @notice Calculate STATE output from swapping auction tokens in pool
     * @dev This is Step 2 of the reverse auction flow (after user deposits auction tokens)
     *      Uses Uniswap V2 constant product formula with 0.3% trading fee
     *      
     *      AMM Formula (Constant Product):
     *      stateOut = (tokenIn × 997 × stateReserve) ÷ (tokenReserve × 1000 + tokenIn × 997)
     *      
     *      Fee Explanation:
     *      - 0.3% fee on input amount (997/1000 = 99.7% goes to swap)
     *      - Fee stays in pool to increase reserves for liquidity providers
     *      
     *      Example:
     *      - User deposits 1000 auction tokens
     *      - Pool reserves: 5000 auction tokens, 2500 STATE
     *      - After fee: 1000 × 997 = 997,000 (effective input)
     *      - Numerator: 997,000 × 2500 = 2,492,500,000
     *      - Denominator: (5000 × 1000) + 997,000 = 5,997,000
     *      - Output: 2,492,500,000 ÷ 5,997,000 ≈ 415.6 STATE tokens
     *      
     *      User Flow:
     *      1. Deposits auction tokens to AuctionSwap
     *      2. This function calculates STATE received
     *      3. User must burn 100% of STATE (all received STATE)
     *      4. No STATE can be kept (full burn required)
     *      5. User receives auction tokens back (2x bonus on all burned STATE)
     *      
     *      Token Ordering:
     *      - Handles both possible Uniswap V2 token orderings
     *      - Correctly identifies which reserve is STATE vs auction token
     *      
     *      Edge Cases:
     *      - Zero amount: Reverts with AmountZero error
     *      - Zero reserves: Reverts with InvalidReserves error
     *      - Invalid pair: Reverts with PairInvalid error
     *      
     *      Precision Notes:
     *      - All amounts use 18 decimal precision
     *      - Integer division causes small truncation (expected)
     *      - Truncation always favors the pool (conservative)
     *      
     *      Validation:
     *      - Input validation done here (amount > 0, reserves > 0)
     *      - AuctionSwap.sol validates user deposits and slippage
     *      
     * @param tokenAmountIn Amount of auction tokens to swap (in wei, 18 decimals)
     * @param auctionToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return stateOutput Amount of STATE tokens to receive (in wei, 18 decimals)
     */
    function calculatePoolSwapOutputReverse(
        uint256 tokenAmountIn,
        address auctionToken,
        address stateToken,
        address pairAddress
    ) internal view returns (uint256 stateOutput) {
        if (tokenAmountIn == 0) revert AmountZero();
        
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidReserves();
        
        uint256 tokenReserve;
        uint256 stateReserve;
        
        if (token0 == auctionToken && token1 == stateToken) {
            tokenReserve = uint256(reserve0);
            stateReserve = uint256(reserve1);
        } else if (token0 == stateToken && token1 == auctionToken) {
            tokenReserve = uint256(reserve1);
            stateReserve = uint256(reserve0);
        } else {
            revert PairInvalid();
        }
        
        // AMM formula with 0.3% fee: stateOut = (tokenIn * 997 * stateReserve) / (tokenReserve * 1000 + tokenIn * 997)
        uint256 tokenInWithFee = tokenAmountIn * 997;
        uint256 numerator = tokenInWithFee * stateReserve;
        uint256 denominator = (tokenReserve * 1000) + tokenInWithFee;
        
        return numerator / denominator;
    }

    /**
     * @notice Calculate auction tokens to return based on burned STATE and apply 2x bonus
     * @dev This is Step 4 of the reverse auction flow (final reward calculation)
     *      
     *      Reward Formula:
     *      tokensToGive = (stateToBurn ÷ poolRatio) × 2
     *      
     *      Implementation (to avoid precision loss):
     *      tokensToGive = (stateToBurn × 1e18 × 2) ÷ poolRatio
     *      
     *      Example:
     *      - User burns 415.6 STATE (100% of received STATE)
     *      - Pool ratio: 0.5 STATE per auction token (poolRatio = 0.5e18)
     *      - Base value: 415.6 ÷ 0.5 = 831.2 auction tokens
     *      - With 2x multiplier: 831.2 × 2 = 1662.4 auction tokens
     *      - Calculation: (415.6e18 × 1e18 × 2) ÷ 0.5e18 = 1662.4e18
     *      
     *      Why 2x Multiplier:
     *      - Incentivizes users to participate in reverse auction
     *      - Creates STATE token burn mechanism (deflationary)
     *      - Users get double the market rate for burning STATE
     *      - Balances with normal auction (which also has 2x)
     *      
     *      Burn Requirement:
     *      - User MUST burn 100% of STATE received (enforced by AuctionSwap.sol)
     *      - No partial burns allowed (design simplified from original 50% minimum)
     *      - All STATE from step 1 must be burned in step 2
     *      
     *      Precision Notes:
     *      - Multiplies before dividing to minimize precision loss
     *      - PRECISION_FACTOR (1e18) maintains decimal accuracy
     *      - Integer division causes small truncation (always favors protocol)
     *      - For typical amounts, precision loss is < 0.0001%
     *      
     *      Edge Cases:
     *      - poolRatio = 0: Returns 0 (pool not initialized)
     *      - stateToBurn = 0: Returns 0 (no burn, no reward)
     *      - Large amounts: Protected by Solidity 0.8.20 overflow checks
     *      
     *      Validation:
     *      - poolRatio comes from getRatioPrice() (validated in library)
     *      - AuctionSwap.sol enforces: stateToBurn = 100% of STATE from step 1
     *      - AuctionSwap.sol checks contract has enough tokens to give
     *      
     * @param stateToBurn Amount of STATE tokens being burned (in wei, 18 decimals)
     * @param poolRatio Current pool ratio: STATE per auction token (in wei, 18 decimals)
     * @return tokensToGive Amount of auction tokens to return (includes 2x multiplier, in wei, 18 decimals)
     */
    function calculateTokensToGive(
        uint256 stateToBurn,
        uint256 poolRatio
    ) internal pure returns (uint256 tokensToGive) {
        if (poolRatio == 0) return 0;
        
        // tokensToGive = (stateToBurn / poolRatio) * 2
        // Rewritten to avoid precision loss: (stateToBurn * 1e18 * 2) / poolRatio
        return (stateToBurn * PRECISION_FACTOR * STATE_MULTIPLIER) / poolRatio;
    }
}