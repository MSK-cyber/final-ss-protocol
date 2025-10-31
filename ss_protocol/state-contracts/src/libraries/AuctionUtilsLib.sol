// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuctionLib.sol";

library AuctionUtilsLib {
    
    struct AuctionSchedule {
        mapping(uint256 => address) tokenByIndex; // index 0 = token1, index 1 = token2, etc.
        uint256 tokenCount; // actual number of tokens registered
        mapping(address => uint256) scheduledIndex;
        bool scheduleSet;
        uint256 scheduleStart;
        uint256 auctionDaysLimit;
        uint256 scheduleSize;
    }

    function getTodayToken(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (address tokenOfDay, bool active) 
    {
        if (!_auctionStarted(schedule, currentTime)) return (address(0), false);
        if (schedule.tokenCount == 0) return (address(0), false);
        
        // Calculate which auction slot we're in (15 min auction + 5 min interval = 20 min per slot)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 auctionSlot = timeSinceStart / slotDuration; // Each slot is 20 minutes (15 min auction + 5 min break)
        uint256 tokenIndex = auctionSlot % schedule.tokenCount; // Use tokenCount instead of array length
        
        tokenOfDay = schedule.tokenByIndex[tokenIndex]; // Use mapping access instead of array
        
        // Check if we're within the active 15-minute auction window (not in the 5-minute break)
        uint256 auctionStart = schedule.scheduleStart + (auctionSlot * slotDuration);
        uint256 auctionEnd = auctionStart + AuctionLib.AUCTION_DURATION;
        
        active = currentTime >= auctionStart && currentTime < auctionEnd;
    }

    function _auctionStarted(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (bool) {
        return schedule.scheduleSet && currentTime >= schedule.scheduleStart;
    }

    function _currentDayIndex(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (uint256) {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        return (currentTime - schedule.scheduleStart) / 1 days;
    }

    function _todayWindow(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (uint256 start, uint256 end) 
    {
        uint256 d = _currentDayIndex(schedule, currentTime);
        start = schedule.scheduleStart + d * 1 days;
        end = start + 1 days;
    }

    function _appearanceCount(AuctionSchedule storage schedule, address token, uint256 currentTime) 
        internal 
        view 
        returns (uint256) 
    {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        uint256 idx1 = schedule.scheduledIndex[token];
        if (idx1 == 0) return 0;
        uint256 idx = idx1 - 1;
        
        // Count completed auction slots (each slot is 20 minutes: 15 min auction + 5 min interval)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 completedSlots = timeSinceStart / slotDuration;
        
        // Calculate how many times this token has appeared
        if (completedSlots < idx) return 0;
        return (completedSlots - idx) / schedule.tokenCount + 1;
    }

    function _getCompletedSlots(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (uint256) 
    {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        return timeSinceStart / slotDuration;
    }

    function isAuctionActive(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (bool) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    function isReverseAuctionActive(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (bool) {
        if (!_isReverseToday(schedule, inputToken, currentTime)) return false;
        
        // Check if we're within the active 15-minute window
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    function _isReverseToday(AuctionSchedule storage schedule, address token, uint256 currentTime) internal view returns (bool) {
        (address today, bool active) = getTodayToken(schedule, currentTime);
        if (!active || today != token) return false;
        uint256 count = _appearanceCount(schedule, token, currentTime);
        // Reverse on 4,8,12,... (every 4th appearance)
        return count > 0 && (count % 4 == 0);
    }

    function getCurrentAuctionCycle(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime
    ) external view returns (uint256) {
        return _appearanceCount(schedule, inputToken, currentTime);
    }

    function getAuctionTimeLeft(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (uint256) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        if (!activeWindow || today != inputToken) return 0;
        
        // Calculate time left in current auction slot (15 min auction, not including 5 min interval)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 auctionSlot = timeSinceStart / slotDuration;
        uint256 auctionEnd = schedule.scheduleStart + (auctionSlot * slotDuration) + AuctionLib.AUCTION_DURATION;
        
        return auctionEnd > currentTime ? auctionEnd - currentTime : 0;
    }

    function setAuctionSchedule(
        AuctionSchedule storage schedule,
        address[] memory tokens,
        uint256 startAt,
        mapping(address => bool) storage supportedTokens
    ) external {
        require(!schedule.scheduleSet, "Schedule already set");
        require(tokens.length == schedule.scheduleSize, "Invalid token count");
        
        // Validate tokens are supported and unique
        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            require(t != address(0), "Zero address");
            require(supportedTokens[t], "Unsupported token");
            require(schedule.scheduledIndex[t] == 0, "Duplicate token");
            schedule.scheduledIndex[t] = i + 1; // store index+1
            schedule.tokenByIndex[i] = t; // Add token to mapping
        }
        
        schedule.tokenCount = tokens.length;
        schedule.scheduleStart = startAt;
        schedule.scheduleSet = true;
    }

    function setScheduleSize(AuctionSchedule storage schedule, uint256 newSize) external {
        require(!schedule.scheduleSet, "Schedule already set");
        require(newSize > 0 && newSize <= 50, "Invalid size");
        schedule.scheduleSize = newSize;
    }

    function setAuctionDaysLimit(AuctionSchedule storage schedule, uint256 daysLimit) external {
        require(daysLimit > 0, "Invalid limit");
        schedule.auctionDaysLimit = daysLimit;
    }
}