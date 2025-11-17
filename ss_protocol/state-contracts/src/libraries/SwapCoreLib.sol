// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SwapCoreLib
 * @author State Protocol Team
 * @notice Core data structures and utilities for the auction swap system
 * @dev Pure data/utility library with no state modification logic
 * @custom:security Access control enforced in AuctionSwap.sol
 * @custom:storage Struct instances stored in AuctionSwap contract storage
 * @custom:functions Pure/view only - no state changes, key generation uses fixed-length types
 */
library SwapCoreLib {
    
    /**
     * @notice Tracks user's swap completion status for a specific auction cycle
     * @dev Stored in AuctionSwap's userSwapTotalInfo mapping, keyed by getSwapInfoKey()
     * @custom:storage Optimally packed into single storage slot (2 bools + 1 uint256)
     * @custom:flags hasSwapped (normal auction), hasReverseSwap (reverse auction)
     */
    struct UserSwapInfo {
        bool hasSwapped;        // Normal auction swap completed
        bool hasReverseSwap;    // Reverse auction swap completed
        uint256 cycle;          // Auction cycle number
    }

    /**
     * @notice Generates a unique key for tracking user swap info across cycles
     * @param user The address of the user performing the swap
     * @param inputToken The token being swapped (auction token)
     * @param stateToken The STATE token address
     * @param cycle The current auction cycle number
     * @return bytes32 A unique deterministic hash key for this swap instance
     * @custom:encoding Uses abi.encodePacked with fixed-length types (no collision risk)
     * @custom:gas More efficient than abi.encode for fixed-length types
     */
    function getSwapInfoKey(
        address user,
        address inputToken,
        address stateToken,
        uint256 cycle
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, inputToken, stateToken, cycle));
    }
}