// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPair.sol";

/**
 * @title NormalAuctionCalculations
 * @notice Library containing ONLY calculation logic for normal (forward) auctions
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
 *      Normal Auction Flow (User burns DAV to get auction tokens):
 *      Step 1: User provides DAV tokens to burn
 *      Step 2: Calculate tokens to burn (3000 per DAV) and STATE bonus (2x pool ratio)
 *      Step 3: Calculate pool swap output for STATE tokens
 *      Step 4: AuctionSwap.sol executes burns and transfers
 *      
 *      Precision Handling:
 *      - All calculations use 18 decimal precision (1e18)
 *      - Integer division may cause truncation (expected behavior)
 *      - Solidity 0.8.20 provides automatic overflow protection
 *      
 *      AUDIT CLARIFICATION:
 *      If you're auditing this library in isolation, you MUST examine AuctionSwap.sol
 *      to understand the complete security model and validation logic.
 */
library NormalAuctionCalculations {

    /// @notice Conversion rate: 3000 auction tokens per 1 DAV token
    /// @dev Fixed rate set by protocol design (18 decimals)
    uint256 constant TOKENS_PER_DAV = 3000 ether;
    
    /// @notice STATE token bonus multiplier: 2x the pool ratio
    /// @dev Users receive double the market rate as incentive for burning DAV
    uint256 constant STATE_MULTIPLIER = 2;
    
    /// @notice Precision factor for decimal calculations
    /// @dev Standard 18 decimal precision used throughout DeFi
    uint256 constant PRECISION_FACTOR = 1e18;

    // ================= Errors =================
    
    /// @notice Thrown when liquidity pool reserves are zero
    error InvalidReserves();
    
    /// @notice Thrown when pair tokens don't match expected auction/STATE tokens
    error PairInvalid();
    
    /// @notice Thrown when swap amount is zero
    error AmountZero();

    // ================= Core Calculation Functions =================

    /**
     * @notice Calculate auction tokens to burn based on available DAV
     * @dev This is Step 2 of the normal auction flow
     *      
     *      Conversion Formula:
     *      tokensToBurn = (availableDav × 3000) ÷ 1e18
     *      
     *      Example:
     *      - User has 1 DAV (1e18 wei)
     *      - Calculation: (1e18 × 3000e18) ÷ 1e18 = 3000e18 tokens
     *      - Result: 3000 auction tokens to burn
     *      
     *      Precision Notes:
     *      - Uses 18 decimal precision throughout
     *      - Integer division may truncate small amounts (expected behavior)
     *      - For amounts < 1e15 wei, result may be 0 due to truncation
     *      
     *      Validation:
     *      - AuctionSwap.sol validates availableDav > 0 before calling
     *      - No overflow risk with Solidity 0.8.20 built-in protection
     *      
     * @param availableDav Amount of DAV tokens available for burning (in wei, 18 decimals)
     * @return tokensToBurn Amount of auction tokens to burn (in wei, 18 decimals)
     */
    function calculateTokensToBurn(uint256 availableDav) internal pure returns (uint256 tokensToBurn) {
        return (availableDav * TOKENS_PER_DAV) / 1e18;
    }

    /**
     * @notice Calculate STATE tokens to give based on pool ratio and apply 2x bonus
     * @dev This is Step 2 of the normal auction flow (bonus calculation)
     *      
     *      Bonus Formula:
     *      stateToGive = (tokensToBurn × poolRatio × 2) ÷ 1e18
     *      
     *      Example:
     *      - Burning 3000 auction tokens (tokensToBurn = 3000e18)
     *      - Pool ratio: 0.5 STATE per auction token (poolRatio = 0.5e18)
     *      - Base value: 3000 × 0.5 = 1500 STATE
     *      - With 2x multiplier: 1500 × 2 = 3000 STATE
     *      - Calculation: (3000e18 × 0.5e18 × 2) ÷ 1e18 = 3000e18
     *      
     *      Why 2x Multiplier:
     *      - Incentivizes users to burn DAV tokens
     *      - Users get double the market rate for participating in auction
     *      - Helps maintain DAV token price stability through burning
     *      
     *      Precision Notes:
     *      - poolRatio comes from getRatioPrice() (18 decimals)
     *      - Final division by PRECISION_FACTOR normalizes result
     *      - Integer division may cause small truncation (acceptable)
     *      
     *      Validation:
     *      - AuctionSwap.sol validates tokensToBurn > 0 before calling
     *      - poolRatio validated in getRatioPrice() (reverts if pool invalid)
     *      
     * @param tokensToBurn Amount of auction tokens being burned (in wei, 18 decimals)
     * @param poolRatio Current pool ratio: STATE per auction token (in wei, 18 decimals)
     * @return stateToGive Amount of STATE tokens to give (includes 2x multiplier, in wei, 18 decimals)
     */
    function calculateStateToGive(
        uint256 tokensToBurn, 
        uint256 poolRatio
    ) internal pure returns (uint256 stateToGive) {
        return (tokensToBurn * poolRatio * STATE_MULTIPLIER) / PRECISION_FACTOR;
    }

    /**
     * @notice Get price ratio from liquidity pool reserves
     * @dev Calculates how much STATE tokens per 1 auction token based on pool reserves
     *      
     *      Price Ratio Formula:
     *      ratio = (stateReserve × 1e18) ÷ auctionReserve
     *      
     *      Example:
     *      - Pool has 1000 STATE tokens and 2000 auction tokens
     *      - Ratio: (1000e18 × 1e18) ÷ 2000e18 = 0.5e18
     *      - Meaning: 1 auction token = 0.5 STATE tokens
     *      
     *      Token Ordering:
     *      - Uniswap V2 pairs order tokens by address (token0 < token1)
     *      - This function handles both possible orderings:
     *        1. token0 = auction, token1 = STATE
     *        2. token0 = STATE, token1 = auction
     *      
     *      Edge Cases:
     *      - Zero reserves: Returns 0 (pool not initialized or drained)
     *      - Invalid pair: Reverts with PairInvalid error
     *      
     *      Gas Optimization:
     *      - Caches token0 and token1 in local variables (saves gas)
     *      - Single getReserves() call to read both reserves
     *      
     *      Validation:
     *      - Checks reserves are non-zero
     *      - Validates token addresses match expected pair
     *      - AuctionSwap.sol checks ratio > 0 before using
     *      
     * @param inputToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return ratio Amount of STATE tokens per 1 auction token (18 decimals precision)
     */
    function getRatioPrice(
        address inputToken,
        address stateToken, 
        address pairAddress
    ) internal view returns (uint256 ratio) {
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) return 0;

        if (token0 == inputToken && token1 == stateToken) {
            ratio = (uint256(reserve1) * PRECISION_FACTOR) / uint256(reserve0);
        } else if (token0 == stateToken && token1 == inputToken) {
            ratio = (uint256(reserve0) * PRECISION_FACTOR) / uint256(reserve1);
        } else {
            revert PairInvalid();
        }

        return ratio;
    }

    /**
     * @notice Calculate expected output from swapping STATE tokens for auction tokens in pool
     * @dev This is Step 3 of the normal auction flow
     *      Uses Uniswap V2 constant product formula with 0.3% trading fee
     *      
     *      AMM Formula (Constant Product):
     *      amountOut = (amountIn × 997 × reserveOut) ÷ (reserveIn × 1000 + amountIn × 997)
     *      
     *      Fee Explanation:
     *      - 0.3% fee on input amount (997/1000 = 99.7% goes to swap)
     *      - Fee stays in pool to increase reserves for liquidity providers
     *      
     *      Example:
     *      - Swap 100 STATE tokens for auction tokens
     *      - Pool reserves: 1000 STATE, 2000 auction tokens
     *      - After fee: 100 × 997 = 99,700 (effective input)
     *      - Numerator: 99,700 × 2000 = 199,400,000
     *      - Denominator: (1000 × 1000) + 99,700 = 1,099,700
     *      - Output: 199,400,000 ÷ 1,099,700 ≈ 181.35 auction tokens
     *      
     *      Why This Formula:
     *      - Maintains constant product: k = reserveIn × reserveOut
     *      - Larger swaps cause more slippage (price impact)
     *      - Protects against draining the pool
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
     *      Gas Optimization:
     *      - Caches token addresses and reserves in local variables
     *      - Single getReserves() call
     *      
     *      Precision Notes:
     *      - All amounts use 18 decimal precision
     *      - Integer division causes small truncation (expected)
     *      - Truncation always favors the pool (conservative)
     *      
     *      Validation:
     *      - Input validation done here (amount > 0, reserves > 0)
     *      - AuctionSwap.sol validates slippage and user balances
     *      
     * @param stateAmountIn Amount of STATE tokens to swap (in wei, 18 decimals)
     * @param stateToken The STATE token address
     * @param inputToken The auction token address to receive
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return amountOut Amount of auction tokens to receive (in wei, 18 decimals)
     */
    function calculatePoolSwapOutput(
        uint256 stateAmountIn,
        address stateToken,
        address inputToken,
        address pairAddress
    ) internal view returns (uint256 amountOut) {
        if (stateAmountIn == 0) revert AmountZero();
        
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidReserves();
        
        uint256 stateReserve;
        uint256 tokenReserve;
        
        if (token0 == stateToken && token1 == inputToken) {
            stateReserve = uint256(reserve0);
            tokenReserve = uint256(reserve1);
        } else if (token0 == inputToken && token1 == stateToken) {
            stateReserve = uint256(reserve1);
            tokenReserve = uint256(reserve0);
        } else {
            revert PairInvalid();
        }
        
        // AMM formula with 0.3% fee: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        uint256 amountInWithFee = stateAmountIn * 997;
        uint256 numerator = amountInWithFee * tokenReserve;
        uint256 denominator = (stateReserve * 1000) + amountInWithFee;
        
        return numerator / denominator;
    }
}