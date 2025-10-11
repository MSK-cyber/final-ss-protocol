// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPair.sol";

/**
 * @title NormalAuctionCalculations
 * @notice Library containing ONLY calculation logic for normal auctions
 * @dev Main contract handles all validation, state management, and transfers
 */
library NormalAuctionCalculations {
    using SafeERC20 for IERC20;

    // Constants matching original contract
    uint256 constant TOKENS_PER_DAV = 3000 ether;
    uint256 constant STATE_MULTIPLIER = 2;
    uint256 constant PRECISION_FACTOR = 1e18;

    // Errors
    error InvalidReserves();
    error PairInvalid();
    error AmountZero();

    /**
     * @notice Calculate tokens to burn based on available DAV (Step 2 calculation)
     * @param availableDav Amount of DAV tokens available for burning
     * @return tokensToBurn Amount of auction tokens to burn (3000 per DAV)
     */
    function calculateTokensToBurn(uint256 availableDav) internal pure returns (uint256 tokensToBurn) {
        return (availableDav * TOKENS_PER_DAV) / 1e18;
    }

    /**
     * @notice Calculate STATE tokens to give based on pool ratio (Step 2 calculation) 
     * @param tokensToBurn Amount of auction tokens being burned
     * @param poolRatio Current pool ratio (STATE per auction token)
     * @return stateToGive Amount of STATE tokens to give (includes 2x multiplier)
     */
    function calculateStateToGive(
        uint256 tokensToBurn, 
        uint256 poolRatio
    ) internal pure returns (uint256 stateToGive) {
        return (tokensToBurn * poolRatio * STATE_MULTIPLIER) / PRECISION_FACTOR;
    }

    /**
     * @notice Get price ratio from pool reserves
     * @param inputToken The auction token address
     * @param stateToken The STATE token address  
     * @param pairAddress The pair contract address
     * @return ratio STATE per auction token (18 decimals)
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
     * @notice Calculate pool swap output (Step 3 calculation)
     * @param stateAmountIn Amount of STATE tokens to swap
     * @param stateToken The STATE token address
     * @param inputToken The auction token to receive
     * @param pairAddress The pair contract address
     * @return amountOut Amount of auction tokens to receive
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