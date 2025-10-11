// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/libraries/TimeUtilsLib.sol";

/**
 * @title Test Pakistan 6 AM Timing
 * @notice Verifies Pakistan timing calculation works correctly for 6 AM
 */
contract TestPakistan6AM is Test {
    
    function test_PakistanTimingCalculation() public {
        // Test timestamp: Oct 9, 2024 00:00:00 UTC (1728432000)
        uint256 testTimestamp = 1728432000;
        
        // Calculate next Pakistan auction start
        uint256 nextStart = TimeUtilsLib.calculateNextClaimStartPakistan(testTimestamp);
        
        // Convert to Pakistan time (GMT+5 = +18000 seconds)
        uint256 pakistanTime = nextStart + 18000;
        
        // Extract hour and minute in Pakistan time
        uint256 pakistanHour = (pakistanTime % 86400) / 3600;
        uint256 pakistanMinute = (pakistanTime % 3600) / 60;
        
        // Verify it's 6:00 AM Pakistan time
        assertEq(pakistanHour, 6, "Should be 6 AM Pakistan time");
        assertEq(pakistanMinute, 0, "Should be exactly 6:00 (no minutes)");
        
        // Test another timestamp to ensure consistency
        testTimestamp = 1728450000; // 5 hours later
        nextStart = TimeUtilsLib.calculateNextClaimStartPakistan(testTimestamp);
        pakistanTime = nextStart + 18000;
        pakistanHour = (pakistanTime % 86400) / 3600;
        pakistanMinute = (pakistanTime % 3600) / 60;
        
        // Should still be 6:00 AM Pakistan time
        assertEq(pakistanHour, 6, "Should consistently be 6 AM Pakistan time");
        assertEq(pakistanMinute, 0, "Should consistently be exactly 6:00");
    }
    
    function test_PakistanVsUTCOffset() public {
        // Verify the timezone offset calculation
        uint256 testTimestamp = 1728432000; // Oct 9, 2024 00:00:00 UTC
        uint256 nextStart = TimeUtilsLib.calculateNextClaimStartPakistan(testTimestamp);
        
        // Pakistan is GMT+5, so 6 AM Pakistan = 1 AM UTC
        uint256 utcTime = nextStart;
        uint256 utcHour = (utcTime % 86400) / 3600;
        
        // 6 AM Pakistan time = 1 AM UTC (6 - 5 = 1)
        assertEq(utcHour, 1, "6 AM Pakistan should equal 1 AM UTC");
    }
}