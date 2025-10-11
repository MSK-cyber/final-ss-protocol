// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";

contract TokenRotationMathTest is Test {
    
    function testTokenRotationMath() public pure {
        console.log("\n=== TESTING TOKEN ROTATION MATH ===");
        
        // Simulate the token rotation logic from AuctionUtilsLib.getTodayToken()
        uint256 AUCTION_DURATION = 15 minutes; // 900 seconds
        uint256 scheduledTokensLength = 3; // We have 3 tokens
        
        address token1 = address(0x101);
        address token2 = address(0x102);
        address token3 = address(0x103);
        
        // Create a mock scheduledTokens array (we'll simulate it with if-else)
        
        uint256 startTime = 1700000000; // Auction start time
        
        console.log("Auction duration (seconds):", AUCTION_DURATION);
        console.log("Number of tokens:", scheduledTokensLength);
        console.log("Token1:", token1);
        console.log("Token2:", token2);
        console.log("Token3:", token3);
        console.log("Start time:", startTime);
        console.log("");
        
        // Test rotation for 10 slots (over 3 full cycles)
        for (uint256 slot = 0; slot < 10; slot++) {
            uint256 currentTime = startTime + slot * AUCTION_DURATION + 5 minutes; // +5 min to be mid-slot
            
            // Calculate which slot we're in (this is the core logic)
            uint256 timeSinceStart = currentTime - startTime;
            uint256 auctionSlot = timeSinceStart / AUCTION_DURATION;
            uint256 tokenIndex = auctionSlot % scheduledTokensLength;
            
            // Simulate getting the token from the array
            address currentToken;
            if (tokenIndex == 0) {
                currentToken = token1;
            } else if (tokenIndex == 1) {
                currentToken = token2;
            } else {
                currentToken = token3;
            }
            
            console.log("Slot:", slot);
            console.log("Time since start (min):", timeSinceStart / 60);
            console.log("Auction slot:", auctionSlot);
            console.log("Token index:", tokenIndex);
            console.log("Current token:", currentToken);
            console.log("Expected: Token", tokenIndex + 1);
            console.log("---");
        }
        
        console.log("\n=== SUMMARY ===");
        console.log("The rotation should be: Token1 -> Token2 -> Token3 -> Token1 -> Token2 -> Token3...");
        console.log("Token indices should be: 0 -> 1 -> 2 -> 0 -> 1 -> 2...");
    }
    
    function testReverseAuctionTiming() public pure {
        console.log("\n=== TESTING REVERSE AUCTION TIMING ===");
        console.log("User mentioned: 'reverse on 4th cycle'");
        console.log("If we have Token1->Token2->Token3 pattern, 4th cycle would be after 3*3=9 slots");
        console.log("But reverse auction timing might be different from token rotation...");
        
        // The "reverse on 4th cycle" might refer to a different concept
        // Let's see if there's a pattern every 4 tokens or every 4 cycles
        
        uint256 scheduledTokensLength = 3;
        
        for (uint256 slot = 0; slot < 15; slot++) {
            uint256 auctionSlot = slot;
            uint256 tokenIndex = auctionSlot % scheduledTokensLength;
            
            // Check if this might be a "reverse" auction
            bool isReverse = false;
            
            // Pattern 1: Every 4th slot is reverse
            if ((slot + 1) % 4 == 0) {
                isReverse = true;
            }
            
            console.log("Slot:", slot);
            console.log("Token index:", tokenIndex);
            console.log("Reverse:", isReverse);
            console.log("---");
        }
    }
}