// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";
import {STATE_V3} from "../src/StateToken.sol";

contract TokenRotationTest is Test {
    SWAP_V3 public swap;
    address public governance = address(0x1);
    
    function setUp() public {
        // Use a timestamp that won't cause underflow in time calculations
        uint256 safeTimestamp = 1704067200; // Jan 1, 2024 00:00:00 UTC
        vm.warp(safeTimestamp);
        
        vm.startPrank(governance);
        
        // Deploy AuctionSwap with minimal constructor parameters
        swap = new SWAP_V3(governance, governance);
        
        vm.stopPrank();
    }
    
    function testTokenRotationDebug() public {
        vm.startPrank(governance);
        
        console.log("\n=== TESTING TOKEN ROTATION CORE LOGIC ===");
        
        // Test getTodayToken() at different times to understand the logic
        uint256 baseTime = 1700000000; // Some timestamp
        
        console.log("Testing token rotation with base time:", baseTime);
        
        for (uint256 i = 0; i < 10; i++) {
            uint256 testTime = baseTime + i * 15 minutes;
            vm.warp(testTime);
            
            // Call getTodayToken directly
            (address token, bool active) = swap.getTodayToken();
            
            console.log("Time offset (minutes):", i * 15);
            console.log("Token address:", token);
            console.log("Active:", active);
            console.log("Current timestamp:", testTime);
            console.log("---");
        }
        
        vm.stopPrank();
    }
    
    function testAuctionScheduleInspection() public {
        vm.startPrank(governance);
        
        console.log("\n=== INSPECTING AUCTION SCHEDULE STATE ===");
        
        // Check if autoScheduleLocked
        bool locked = swap.autoScheduleLocked();
        console.log("Auto schedule locked:", locked);
        
        // Try to access autoRegisteredTokens array (if public)
        // This might fail if array is empty or not public
        try swap.autoRegisteredTokens(0) returns (address token) {
            console.log("Auto token 0:", token);
        } catch {
            console.log("No auto tokens registered or array not accessible");
        }
        
        vm.stopPrank();
    }
}