// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library AuctionLib {
    uint256 public constant AUCTION_DURATION = 15 minutes; // 15 minutes auction duration
    uint256 public constant AUCTION_INTERVAL = 0; // No gap between auctions
    
    struct AuctionCycle {
        uint256 firstAuctionStart;
        bool isInitialized;
        uint256 auctionCount;
    }
}
