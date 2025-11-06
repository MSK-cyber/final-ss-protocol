// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title SwapCoreLib
 * @notice Core data structures and utilities for the auction swap system
 * @dev This library provides structs for tracking user swap states and a key generation
 *      utility for creating unique identifiers in the swap tracking mappings.
 *
 * Architecture:
 * - This is a pure data/utility library with no state modification logic
 * - Access control and validation logic reside in the parent AuctionSwap contract
 * - Struct instances are stored in AuctionSwap contract storage, not in the library
 *
 * Security Model:
 * - Library functions are pure/view only - no state changes
 * - Parent contract (AuctionSwap) enforces all business logic and access controls
 * - Key generation uses fixed-length types to prevent hash collision risks
 */
library SwapCoreLib {
    
    /**
     * @notice Tracks user's swap completion status for a specific auction cycle
     * @dev Stored in AuctionSwap's userSwapTotalInfo mapping, keyed by getSwapInfoKey()
     *      This struct is optimally packed into a single storage slot (2 bools + 1 uint256)
     *
     * Storage Layout:
     * - hasSwapped: Set to true when user completes step 3 (normal auction swap)
     * - hasReverseSwap: Set to true when user completes reverse auction swap
     * - cycle: The auction cycle number when this swap occurred
     *
     * Usage:
     * - Used in swapTokens() to mark normal auction completion
     * - Used in getUserAuctionStatus() to check step 3 completion
     * - Used in hasCompletedStep3() view function
     */
    struct UserSwapInfo {
        bool hasSwapped;        // Normal auction swap completed
        bool hasReverseSwap;    // Reverse auction swap completed
        uint256 cycle;          // Auction cycle number
    }

    /**
     * @notice Generates a unique key for tracking user swap info across cycles
     * @dev Creates a deterministic hash key from user address, tokens, and cycle number
     *      Used as the mapping key in AuctionSwap's userSwapTotalInfo mapping
     *
     * Security:
     * - Uses abi.encodePacked with FIXED-LENGTH types only (no collision risk)
     * - All parameters are fixed 32 bytes each in the encoding
     * - More gas efficient than abi.encode for fixed-length types
     *
     * @param user The address of the user performing the swap
     * @param inputToken The token being swapped (auction token)
     * @param stateToken The STATE token address
     * @param cycle The current auction cycle number
     * @return bytes32 A unique deterministic hash key for this swap instance
     *
     * @custom:usage Called in AuctionSwap at:
     *               - swapTokens() line 223
     *               - getUserAuctionStatus() line 610
     *               - hasUserBurnedForToken() line 616
     *               - reverseSwap() line 627
     *               - hasCompletedStep3() line 661
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