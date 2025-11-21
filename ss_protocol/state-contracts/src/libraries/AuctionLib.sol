// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title AuctionLib
 * @author State Protocol Team
 * @notice Core constants for auction timing configuration
 * @dev Centralized constants used across auction system for timing calculations
 * @custom:duration 24 hours per auction (production configuration)
 * @custom:interval 0 minutes between auctions (continuous rotation)
 */
library AuctionLib {
    uint256 public constant AUCTION_DURATION = 24 hours; // 24 hours auction duration
    uint256 public constant AUCTION_INTERVAL = 0; // No gap between auctions
    
    struct AuctionCycle {
        uint256 firstAuctionStart;
        bool isInitialized;
        uint256 auctionCount;
    }
}