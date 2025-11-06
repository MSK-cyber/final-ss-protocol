// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./AuctionLib.sol";

/**
 * @title AuctionUtilsLib
 * @notice Library for auction scheduling and timing calculations
 * @dev ARCHITECTURE NOTE - Separation of Concerns:
 *      This library provides CALCULATION FUNCTIONS ONLY. It does NOT enforce business rules.
 *      Business rule enforcement (limits, validations) happens at the APPLICATION LAYER (AuctionSwap.sol).
 *      
 *      This separation is intentional and follows best practices:
 *      - Library Layer: Reusable time/math calculations
 *      - Application Layer: Business logic enforcement (MAX_CYCLES_PER_TOKEN = 20)
 *      
 *      TIMING SYSTEM (Configurable via AuctionLib):
 *      - Each auction slot duration = AuctionLib.AUCTION_DURATION (configurable)
 *      - Interval between auctions = AuctionLib.AUCTION_INTERVAL (configurable)
 *      - Tokens rotate continuously through schedule: Token1 → Token2 → Token1 → Token2...
 *      - Each token runs for maximum cycles (enforced in AuctionSwap.sol line 361)
 *      
 *      AUDIT CLARIFICATION:
 *      This library was designed for flexible calculations. Limit enforcement is intentionally
 *      delegated to AuctionSwap.sol which checks:
 *      - MAX_CYCLES_PER_TOKEN = 20 (line 96)
 *      - if (currentCycle > MAX_CYCLES_PER_TOKEN) revert (line 361)
 *      - auctionDaysLimit = scheduleSize * 20 (line 196)
 *      
 *      If you're auditing this library in isolation, you MUST examine AuctionSwap.sol
 *      to understand the complete system design.
 */
library AuctionUtilsLib {
    
    /**
     * @notice Auction schedule configuration and state tracking
     * @dev This struct manages the rotation schedule for auction tokens
     * @param tokenByIndex Mapping from index to token address (0-based: 0 = token1, 1 = token2)
     * @param tokenCount Number of tokens currently registered in the schedule
     * @param scheduledIndex Mapping from token address to its position (1-based, 0 = not scheduled)
     * @param scheduleSet Whether the auction schedule has been initialized
     * @param scheduleStart Unix timestamp when auctions begin (typically GMT+3 17:00 / 5 PM)
     * @param auctionDaysLimit Total number of auction slots available (scheduleSize × MAX_CYCLES_PER_TOKEN)
     * @param scheduleSize Maximum number of tokens that can be scheduled (configurable, testing with various values)
     */
    struct AuctionSchedule {
        mapping(uint256 => address) tokenByIndex; // index 0 = token1, index 1 = token2, etc.
        uint256 tokenCount; // actual number of tokens registered
        mapping(address => uint256) scheduledIndex;
        bool scheduleSet;
        uint256 scheduleStart;
        uint256 auctionDaysLimit;
        uint256 scheduleSize;
    }

    /**
     * @notice Get the currently active auction token
     * @param schedule Auction schedule storage reference
     * @param currentTime Current block timestamp
     * @return tokenOfDay Address of the token scheduled for current slot (address(0) if none)
     * @return active Whether we're currently within an active auction window (not in interval)
     * @dev Calculates which auction slot we're in based on AUCTION_DURATION + AUCTION_INTERVAL.
     *      Duration and interval are configurable via AuctionLib constants.
     *      Tokens rotate through schedule continuously.
     */
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

    /**
     * @notice Check if auctions have started
     * @param schedule Auction schedule storage reference
     * @param currentTime Current block timestamp
     * @return True if schedule is set and current time is past start time
     */
    function _auctionStarted(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (bool) {
        return schedule.scheduleSet && currentTime >= schedule.scheduleStart;
    }

    /**
     * @notice Calculate current day index since auction start
     * @param schedule Auction schedule storage reference
     * @param currentTime Current block timestamp
     * @return Day index (0-based) for analytics tracking
     * @dev Used for daily statistics aggregation (GMT+3 17:00 / 5 PM timezone boundaries)
     */
    function _currentDayIndex(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (uint256) {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        return (currentTime - schedule.scheduleStart) / 1 days;
    }

    /**
     * @notice Calculate start and end timestamps for current day window
     * @param schedule Auction schedule storage reference
     * @param currentTime Current block timestamp
     * @return start Unix timestamp for start of current day
     * @return end Unix timestamp for end of current day
     * @dev Used for daily analytics boundaries (GMT+3 17:00 / 5 PM timezone)
     */
    function _todayWindow(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (uint256 start, uint256 end) 
    {
        uint256 d = _currentDayIndex(schedule, currentTime);
        start = schedule.scheduleStart + d * 1 days;
        end = start + 1 days;
    }

    /**
     * @notice Calculate how many times a token has appeared in auction rotation
     * @param schedule Auction schedule storage reference
     * @param token Token address to check
     * @param currentTime Current block timestamp
     * @return Number of completed auction cycles for this token (1-based count)
     * @dev This is the "cycle number" used throughout the system.
     *      With N tokens in schedule: each token appears every N slots.
     *      IMPORTANT: This function only COUNTS cycles. The cycle limit is enforced
     *      in AuctionSwap.sol (line 361: if currentCycle > MAX_CYCLES_PER_TOKEN revert)
     */
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

    /**
     * @notice Calculate total number of completed auction slots across all tokens
     * @param schedule Auction schedule storage reference
     * @param currentTime Current block timestamp
     * @return Number of completed auction slots
     * @dev Total slots = MAX_CYCLES_PER_TOKEN × scheduleSize
     *      Used for global progress tracking in AuctionSwap.getGlobalAuctionProgress()
     */
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

    /**
     * @notice Check if a specific token has an active normal auction right now
     * @param schedule Auction schedule storage reference
     * @param inputToken Token to check
     * @param currentTime Current block timestamp
     * @return True if it's this token's turn AND we're within the auction window
     * @dev This checks TIMING only. Business rules (max cycles, participant limits) are
     *      enforced in AuctionSwap.sol. See contract header for architecture explanation.
     */
    function isAuctionActive(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime
    ) external view returns (bool) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    /**
     * @notice Check if a specific token has an active reverse auction right now
     * @param schedule Auction schedule storage reference
     * @param inputToken Token to check
     * @param currentTime Current block timestamp
     * @return True if it's this token's turn AND it's a reverse cycle (every 4th appearance)
     * @dev Reverse auctions happen on cycles 4, 8, 12, 16, 20 for each token.
     *      Users can swap earned tokens back to STATE during these cycles.
     *      Business rules (token limits) enforced in AuctionSwap.reverseSwapTokensForState()
     */
    function isReverseAuctionActive(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime
    ) external view returns (bool) {
        if (!_isReverseToday(schedule, inputToken, currentTime)) return false;
        
        // Check if we're within the active 2-hour window
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    /**
     * @notice Internal check if today is a reverse auction day for specific token
     * @param schedule Auction schedule storage reference
     * @param token Token to check
     * @param currentTime Current block timestamp
     * @return True if token is scheduled today AND cycle count is divisible by 4
     * @dev Reverse auction pattern: every 4th cycle (cycles 4, 8, 12, 16, 20...)
     *      Normal auction pattern: all other cycles (1, 2, 3, 5, 6, 7, 9, 10, 11...)
     */
    function _isReverseToday(AuctionSchedule storage schedule, address token, uint256 currentTime) internal view returns (bool) {
        (address today, bool active) = getTodayToken(schedule, currentTime);
        if (!active || today != token) return false;
        uint256 count = _appearanceCount(schedule, token, currentTime);
        // Reverse on 4,8,12,... (every 4th appearance)
        return count > 0 && (count % 4 == 0);
    }

    /**
     * @notice Get current auction cycle number for a specific token
     * @param schedule Auction schedule storage reference
     * @param inputToken Token to check
     * @param currentTime Current block timestamp
     * @return Cycle number (1-based count)
     * @dev This is the primary cycle counter used throughout the system.
     *      Returns 0 if auctions haven't started or token not scheduled.
     *      Maximum value is enforced at application layer (see AuctionSwap.MAX_CYCLES_PER_TOKEN)
     */
    function getCurrentAuctionCycle(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime
    ) external view returns (uint256) {
        return _appearanceCount(schedule, inputToken, currentTime);
    }

    /**
     * @notice Get remaining time in current auction slot
     * @param schedule Auction schedule storage reference
     * @param inputToken Token to check
     * @param currentTime Current block timestamp
     * @return Seconds remaining in current auction window (0 if not active)
     * @dev Used by frontend to display countdown timer.
     *      Returns 0 if it's not this token's turn or auction not active.
     *      Duration is configurable via AuctionLib.AUCTION_DURATION
     */
    function getAuctionTimeLeft(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime
    ) external view returns (uint256) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        if (!activeWindow || today != inputToken) return 0;
        
        // Calculate time left in current auction slot
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 auctionSlot = timeSinceStart / slotDuration;
        uint256 auctionEnd = schedule.scheduleStart + (auctionSlot * slotDuration) + AuctionLib.AUCTION_DURATION;
        
        return auctionEnd > currentTime ? auctionEnd - currentTime : 0;
    }

    /**
     * @notice Initialize auction schedule with token rotation
     * @param schedule Auction schedule storage reference
     * @param tokens Array of token addresses to rotate (must equal scheduleSize)
     * @param startAt Unix timestamp when auctions begin (typically GMT+3 17:00 / 5 PM)
     * @param supportedTokens Mapping to verify tokens are supported
     * @dev Can only be called once (schedule.scheduleSet prevents re-initialization).
     *      Validates tokens are supported, unique, and non-zero.
     *      Sets up 1-based indexing for cycle counting (scheduledIndex[token] = position + 1)
     * @dev OPTIONAL SECURITY: Consider adding `require(startAt >= block.timestamp)` to prevent
     *      accidentally setting start time in the past. Currently omitted as governance
     *      is trusted to provide correct timestamps via UI.
     */
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

    /**
     * @notice Set maximum number of tokens that can participate in rotation
     * @param schedule Auction schedule storage reference
     * @param newSize New schedule size (1-50)
     * @dev Can only be called before schedule initialization (scheduleSet = false).
     *      Size is configurable for testing and deployment (limit is 50 tokens maximum).
     *      Total auction slots = scheduleSize × MAX_CYCLES_PER_TOKEN
     */
    function setScheduleSize(AuctionSchedule storage schedule, uint256 newSize) external {
        require(!schedule.scheduleSet, "Schedule already set");
        require(newSize > 0 && newSize <= 50, "Invalid size");
        schedule.scheduleSize = newSize;
    }

    /**
     * @notice Set total number of auction slots available
     * @param schedule Auction schedule storage reference
     * @param daysLimit Total auction slots (typically scheduleSize × MAX_CYCLES_PER_TOKEN)
     * @dev In AuctionSwap constructor: auctionDaysLimit = scheduleSize * MAX_CYCLES_PER_TOKEN
     *      This represents the GLOBAL auction capacity, not per-token limit.
     *      Per-token limit is enforced in AuctionSwap.sol line 361.
     */
    function setAuctionDaysLimit(AuctionSchedule storage schedule, uint256 daysLimit) external {
        require(daysLimit > 0, "Invalid limit");
        schedule.auctionDaysLimit = daysLimit;
    }
}