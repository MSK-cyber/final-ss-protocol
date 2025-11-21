// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title TimeUtilsLib
 * @author State Protocol Team
 * @notice Utility library for timezone-aware time calculations
 * @dev Provides functions to calculate time boundaries with timezone offsets
 * @custom:timezone Default: GMT+3 (17:00 local = 14:00 UTC for DAV mint timing)
 * @custom:validation Bounds checking for timezone offsets (-14 to +14 hours)
 */
library TimeUtilsLib {
    uint256 internal constant SECONDS_IN_DAY = 86400;
    // Default time boundary: 17:00 GMT+3 (5:00 PM GMT+3)
    uint256 internal constant TARGET_GMT_HOUR = 17;
    uint256 internal constant TARGET_GMT_MINUTE = 0;

    /**
     * @notice Validates time calculation parameters
     * @custom:bounds Timezone offset: -14 to +14 hours, Hour: 0-23, Minute: 0-59
     * @custom:safety Prevents overflow in signed integer operations
     */
    function _validateTimeParams(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) private pure {
        require(blockTimestamp > 0, "Invalid timestamp");
        require(tzOffsetHours >= -14 && tzOffsetHours <= 14, "Invalid offset");
        require(targetLocalHour < 24, "Invalid hour");
        require(targetLocalMinute < 60, "Invalid minute");
        require(blockTimestamp <= uint256(type(int256).max), "Timestamp too large");
    }

    /**
     * @notice Calculates the next claim start time using a timezone offset and local-hour target
     * @param blockTimestamp Current block timestamp (UTC seconds)
     * @param tzOffsetHours Signed hour offset from UTC (e.g. +3 for GMT+3, -4 for GMT-4)
     * @param targetLocalHour Target hour in the local timezone (0-23)
     * @param targetLocalMinute Target minute in the local timezone (0-59)
     * @return finalTimestamp UTC timestamp of the next target local-time boundary
     * @custom:timezone Fixed offsets (does not account for DST)
     * @custom:safety Overflow protection on all signed math operations
     */
    function calculateNextClaimStartTZ(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) internal pure returns (uint256 finalTimestamp) {
        _validateTimeParams(blockTimestamp, tzOffsetHours, targetLocalHour, targetLocalMinute);
        
        int256 offsetSeconds = tzOffsetHours * int256(1 hours);
        int256 tsInt = int256(blockTimestamp);
        
        if (offsetSeconds > 0) {
            require(tsInt <= type(int256).max - offsetSeconds, "Local overflow");
        } else if (offsetSeconds < 0) {
            require(tsInt >= type(int256).min - offsetSeconds, "Local underflow");
        }
        
        int256 localTs = tsInt + offsetSeconds;
        require(localTs >= 0, "Local time < 0");
        
        uint256 localTsUint = uint256(localTs);
        uint256 localDayStart = (localTsUint / SECONDS_IN_DAY) * SECONDS_IN_DAY;
        
        uint256 hoursSec = targetLocalHour * 1 hours;
        uint256 minutesSec = targetLocalMinute * 1 minutes;
        require(localDayStart <= type(uint256).max - hoursSec, "Target calc ovf (h)");
        uint256 targetLocal = localDayStart + hoursSec;
        require(targetLocal <= type(uint256).max - minutesSec, "Target calc ovf (m)");
        targetLocal += minutesSec;
        
        if (localTsUint >= targetLocal) {
            require(targetLocal <= type(uint256).max - SECONDS_IN_DAY, "Next day ovf");
            targetLocal += SECONDS_IN_DAY;
        }
        
        require(targetLocal <= uint256(type(int256).max), "UTC cast ovf");
        int256 utcTs = int256(targetLocal) - offsetSeconds;
        require(utcTs >= 0, "UTC time < 0");
        finalTimestamp = uint256(utcTs);
        require(finalTimestamp > blockTimestamp, "Non-future ts");
    }

    /**
     * @notice Calculate next 17:00 GMT+3 (5:00 PM GMT+3)
     * @custom:utc 17:00 GMT+3 = 14:00 UTC (2:00 PM UTC)
     */
    function calculateNextClaimStartGMTPlus3(uint256 blockTimestamp)
        internal
        pure
        returns (uint256)
    {
        return calculateNextClaimStartTZ(blockTimestamp, int256(3), 17, 0);
    }

    /**
     * @notice LEGACY: Calculate next 23:00 Pakistan Standard Time (11:00 PM UTC+5)
     * @dev Not used in current protocol. Use calculateNextClaimStartGMTPlus3() instead
     * @custom:utc 23:00 UTC+5 = 18:00 UTC (6:00 PM UTC)
     */
    function calculateNextClaimStartPakistan(uint256 blockTimestamp) internal pure returns (uint256) {
        return calculateNextClaimStartTZ(blockTimestamp, int256(5), 23, 0);
    }
}