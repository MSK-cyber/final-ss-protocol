// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IPair.sol";

/**
 * @title NormalAuctionCalculations
 * @author State Protocol Team
 * @notice Library for normal auction calculations (users burn DAV to get auction tokens)
 * @dev Library functions called only by AuctionSwap.sol (not directly callable by users).
 * @custom:security Access control and validation enforced in AuctionSwap.sol
 * @custom:flow Burn DAV → Calculate burn amount (30% of airdrop) and STATE bonus (2x pool ratio) → Transfer tokens
 * @custom:precision 18 decimal precision (1e18), Solidity 0.8.20 overflow protection
 * @custom:bonus STATE_MULTIPLIER = 2 (users receive double market rate STATE tokens)
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
     * @param availableDav Amount of DAV tokens available for burning (18 decimals)
     * @return tokensToBurn Amount of auction tokens to burn (18 decimals)
     * @custom:formula tokensToBurn = (availableDav × 3000) ÷ 1e18
     * @custom:rate 3000 auction tokens per 1 DAV token
     */
    function calculateTokensToBurn(uint256 availableDav) internal pure returns (uint256 tokensToBurn) {
        return (availableDav * TOKENS_PER_DAV) / 1e18;
    }

    /**
     * @notice Calculate STATE tokens to give based on pool ratio and apply 2x bonus
     * @param tokensToBurn Amount of auction tokens being burned (18 decimals)
     * @param poolRatio Current pool ratio: STATE per auction token (18 decimals)
     * @return stateToGive Amount of STATE tokens to give with 2x multiplier (18 decimals)
     * @custom:formula stateToGive = (tokensToBurn × poolRatio × 2) ÷ 1e18
     * @custom:multiplier 2x bonus incentivizes DAV burning and participation
     */
    function calculateStateToGive(
        uint256 tokensToBurn, 
        uint256 poolRatio
    ) internal pure returns (uint256 stateToGive) {
        return (tokensToBurn * poolRatio * STATE_MULTIPLIER) / PRECISION_FACTOR;
    }

    /**
     * @notice Get price ratio from liquidity pool reserves
     * @param inputToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return ratio Amount of STATE tokens per 1 auction token (18 decimals)
     * @custom:formula ratio = (stateReserve × 1e18) ÷ auctionReserve
     * @custom:ordering Handles both Uniswap V2 token orderings (token0/token1)
     * @custom:zero-check Returns 0 if reserves are zero, reverts if pair invalid
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
     * @param stateAmountIn Amount of STATE tokens to swap (18 decimals)
     * @param stateToken The STATE token address
     * @param inputToken The auction token address to receive
     * @param pairAddress The Uniswap V2-style pair contract address
     * @return amountOut Amount of auction tokens to receive (18 decimals)
     * @custom:formula amountOut = (amountIn × 997 × reserveOut) ÷ (reserveIn × 1000 + amountIn × 997)
     * @custom:fee 0.3% Uniswap V2 trading fee (997/1000 effective input)
     * @custom:validation Reverts if amount is zero, reserves are zero, or pair is invalid
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