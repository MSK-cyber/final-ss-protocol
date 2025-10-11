// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "../interfaces/IPair.sol";

/**
 * @title ReverseAuctionCalculations
 * @notice Library containing ONLY calculation logic for reverse auctions
 * @dev Main contract handles all validation, state management, and transfers
 */
library ReverseAuctionCalculations {
    using SafeERC20 for IERC20;

    // Constants matching original contract
    uint256 constant STATE_MULTIPLIER = 2;
    uint256 constant PRECISION_FACTOR = 1e18;

    // Errors
    error InvalidReserves();
    error PairInvalid();
    error AmountZero();

    /**
     * @notice Calculate STATE output for reverse auction step 1 (auction token -> STATE)
     * @param tokenAmountIn Amount of auction tokens to swap
     * @param auctionToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The pair contract address
     * @return stateOutput Amount of STATE tokens to receive
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
     * @notice Calculate minimum STATE burn amount (50% of received in step 1)
     * @param stateFromStep1 Amount of STATE received in step 1
     * @return minimumBurn Minimum amount that must be burned (50%)
     */
    function calculateMinimumBurn(uint256 stateFromStep1) internal pure returns (uint256 minimumBurn) {
        return stateFromStep1 / 2; // 50%
    }

    /**
     * @notice Calculate auction tokens to give for burned STATE (step 2)
     * @param stateToBurn Amount of STATE tokens being burned
     * @param poolRatio Current pool ratio (STATE per auction token)
     * @return tokensToGive Amount of auction tokens to give (includes 2x multiplier)
     */
    function calculateTokensToGive(
        uint256 stateToBurn,
        uint256 poolRatio
    ) internal pure returns (uint256 tokensToGive) {
        if (poolRatio == 0) return 0;
        
        // tokensToGive = (stateToBurn / poolRatio) * 2
        return (stateToBurn * PRECISION_FACTOR * STATE_MULTIPLIER) / poolRatio;
    }
}