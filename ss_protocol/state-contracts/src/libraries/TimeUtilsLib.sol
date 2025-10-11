// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library TimeUtilsLib {
    uint256 internal constant SECONDS_IN_DAY = 86400;
    // Legacy defaults (kept for backward compatibility): 15:00 GMT
    uint256 internal constant TARGET_GMT_HOUR = 15;
    uint256 internal constant TARGET_GMT_MINUTE = 0;

    /// @dev Lightweight parameter validation to avoid pathological inputs.
    function _validateTimeParams(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) private pure {
        require(blockTimestamp > 0, "Invalid timestamp");
        // Practical TZ bounds in production: [-12, +14]; allow a slightly wider but safe range
        require(tzOffsetHours >= -14 && tzOffsetHours <= 14, "Invalid offset");
        require(targetLocalHour < 24, "Invalid hour");
        require(targetLocalMinute < 60, "Invalid minute");
        // Ensure safe signed cast ahead of time
        require(blockTimestamp <= uint256(type(int256).max), "Timestamp too large");
    }

    /**
     * @notice Calculates the next claim start time using a timezone offset and local-hour target.
     * @param blockTimestamp Current block timestamp (UTC seconds).
     * @param tzOffsetHours Signed hour offset from UTC (e.g. +3 for GMT+3, -4 for GMT-4).
     * @param targetLocalHour Target hour in the local timezone (0-23).
     * @param targetLocalMinute Target minute in the local timezone (0-59).
     * @return finalTimestamp UTC timestamp of the next target local-time boundary.
     */
    /**
     * @notice Calculates the next claim start time using a timezone offset and local-hour target.
     * @dev
     * - Uses fixed timezone offsets (does not account for DST).
     * - Miner timestamps can drift slightly; boundary behavior is resilient to small skews.
     * - Inputs are validated to avoid pathological over/underflow on signed math and casts.
     */
    function calculateNextClaimStartTZ(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) internal pure returns (uint256 finalTimestamp) {
        _validateTimeParams(blockTimestamp, tzOffsetHours, targetLocalHour, targetLocalMinute);
        // Convert UTC ts to local ts by adding offset
        int256 offsetSeconds = tzOffsetHours * int256(1 hours);
        int256 tsInt = int256(blockTimestamp);
        // Guard against overflow/underflow on signed addition
        if (offsetSeconds > 0) {
            require(tsInt <= type(int256).max - offsetSeconds, "Local overflow");
        } else if (offsetSeconds < 0) {
            require(tsInt >= type(int256).min - offsetSeconds, "Local underflow");
        }
        int256 localTs = tsInt + offsetSeconds;
        // Guard against negative local timestamps to avoid invalid uint casts
        require(localTs >= 0, "Local time < 0");
        // Normalize to day start in local time
        uint256 localTsUint = uint256(localTs);
        uint256 localDayStart = (localTsUint / SECONDS_IN_DAY) * SECONDS_IN_DAY;
        // Build target time in local day with overflow guards for diagnostics
        uint256 hoursSec = targetLocalHour * 1 hours;
        uint256 minutesSec = targetLocalMinute * 1 minutes;
        require(localDayStart <= type(uint256).max - hoursSec, "Target calc ovf (h)");
        uint256 targetLocal = localDayStart + hoursSec;
        require(targetLocal <= type(uint256).max - minutesSec, "Target calc ovf (m)");
        targetLocal += minutesSec;
        // If we've passed the target local time, move to next day
        if (localTsUint >= targetLocal) {
            require(targetLocal <= type(uint256).max - SECONDS_IN_DAY, "Next day ovf");
            targetLocal += SECONDS_IN_DAY;
        }
        // Convert back to UTC by subtracting offset
        require(targetLocal <= uint256(type(int256).max), "UTC cast ovf");
        int256 utcTs = int256(targetLocal) - offsetSeconds;
        require(utcTs >= 0, "UTC time < 0");
        finalTimestamp = uint256(utcTs);
        require(finalTimestamp > blockTimestamp, "Non-future ts");
    }

    /**
     * @notice Convenience helper for next 15:00 at GMT+3 (UTC+3).
     */
    /// @notice Convenience helper for next 15:00 at GMT+3 (UTC+3).
    /// @dev 15:00 in GMT+3 corresponds to 12:00 UTC.
    function calculateNextClaimStartGMTPlus3(uint256 blockTimestamp)
        internal
        pure
        returns (uint256)
    {
        return calculateNextClaimStartTZ(blockTimestamp, int256(3), 15, 0);
    }

    /// @notice Pakistan time (PKT: GMT+5) - 02:00 local (2 AM)
    function calculateNextClaimStartPakistan(uint256 blockTimestamp) internal pure returns (uint256) {
        return calculateNextClaimStartTZ(blockTimestamp, int256(5), 2, 0);
    }
}
