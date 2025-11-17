// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPair.sol";

/**
 * @title ReverseAuctionCalculations
 * @author State Protocol Team
 * @notice Library for reverse auction calculations (users swap auction tokens back to STATE)
 * @dev Library functions called only by AuctionSwap.sol (not directly callable by users).
 * @custom:security Access control and validation enforced in AuctionSwap.sol
 * @custom:flow Step 1: User deposits auction tokens → Step 2: Swap for STATE → Step 3: Burn 100% STATE → Step 4: Return 2x pool ratio auction tokens
 * @custom:precision All calculations use 18 decimal precision (1e18), Solidity 0.8.20 overflow protection
 * @custom:bonus STATE_MULTIPLIER = 2 (users receive double market rate for burned STATE)
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

    /**
     * @notice Calculate STATE output from swapping auction tokens in pool
     * @param tokenAmountIn Amount of auction tokens to swap (in wei, 18 decimals)
     * @param auctionToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return stateOutput Amount of STATE tokens to receive (in wei, 18 decimals)
     * @dev Step 2 of reverse auction: swaps auction tokens for STATE using Uniswap V2 AMM
     * @custom:formula stateOut = (tokenIn × 997 × stateReserve) ÷ (tokenReserve × 1000 + tokenIn × 997)
     * @custom:fee 0.3% trading fee (997/1000 = 99.7% effective)
     * @custom:flow User deposits tokens → Calculate STATE → Must burn 100% STATE → Receive 2x auction tokens
     * @custom:precision 18 decimals, integer division truncation favors pool
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
     * @param stateToBurn Amount of STATE tokens being burned (in wei, 18 decimals)
     * @param poolRatio Current pool ratio: STATE per auction token (in wei, 18 decimals)
     * @return tokensToGive Amount of auction tokens to return (includes 2x multiplier, in wei, 18 decimals)
     * @dev Step 4 of reverse auction: calculates final reward with 2x multiplier
     * @custom:formula tokensToGive = (stateToBurn × 1e18 × 2) ÷ poolRatio
     * @custom:multiplier 2x bonus incentivizes STATE burning (deflationary mechanism)
     * @custom:requirement User must burn 100% of received STATE (enforced by AuctionSwap.sol)
     * @custom:precision Multiplies before dividing to minimize precision loss
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