// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ISWAP_V3 Interface
/// @notice Interface for querying the SWAP_V3 auction contract state
/// @dev This interface provides read-only access to auction schedule, daily state, and user participation data
interface ISWAP_V3 {
    // ============ Core Schedule State ============
    
    /// @notice Check if the auction schedule has been configured
    /// @return True if the schedule is set, false otherwise
    function scheduleSet() external view returns (bool);
    
    /// @notice Get the timestamp when the auction schedule starts
    /// @return Unix timestamp of schedule start
    function scheduleStart() external view returns (uint256);
    
    /// @notice Get the maximum number of auction days configured
    /// @return Total number of days the auction will run
    function auctionDaysLimit() external view returns (uint256);
    
    /// @notice Get the token address scheduled for a specific day index
    /// @param index The day index in the schedule
    /// @return The token address scheduled for that day
    function scheduledTokens(uint256 index) external view returns (address);
    
    /// @notice Get the total number of unique tokens in the schedule
    /// @return Number of scheduled tokens
    function scheduledTokensLength() external view returns (uint256);
    
    /// @notice Get the schedule index for a specific token (1-based, 0 means not scheduled)
    /// @param token The token address to query
    /// @return The 1-based index of the token in the schedule, or 0 if not scheduled
    function scheduledIndex(address token) external view returns (uint256);

    // ============ Daily State Release ============
    
    /// @notice Get the start timestamp of the current day
    /// @return Unix timestamp of current day start
    function currentDayStart() external view returns (uint256);
    
    /// @notice Get the total STATE tokens released today
    /// @return Total STATE tokens released in the current day
    function dailyStateReleased() external view returns (uint256);
    
    /// @notice Get STATE tokens released through normal swaps today
    /// @return STATE tokens released via normal swaps in the current day
    function dailyStateReleasedNormal() external view returns (uint256);
    
    /// @notice Get STATE tokens released through reverse swaps today
    /// @return STATE tokens released via reverse swaps in the current day
    function dailyStateReleasedReverse() external view returns (uint256);
    
    /// @notice Get total STATE tokens released for a specific day
    /// @param dayIndex The day index to query
    /// @return Total STATE tokens released on that day
    function stateReleasedByDayIndex(uint256 dayIndex) external view returns (uint256);
    
    /// @notice Get STATE tokens released through normal swaps for a specific day
    /// @param dayIndex The day index to query
    /// @return STATE tokens released via normal swaps on that day
    function stateReleasedNormalByDayIndex(uint256 dayIndex) external view returns (uint256);
    
    /// @notice Get STATE tokens released through reverse swaps for a specific day
    /// @param dayIndex The day index to query
    /// @return STATE tokens released via reverse swaps on that day
    function stateReleasedReverseByDayIndex(uint256 dayIndex) external view returns (uint256);

    // ============ User Participation Flags ============
    
    /// @notice Check if a user has performed a normal swap for a specific token in the current cycle
    /// @param user The user address to check
    /// @param inputToken The token address to check
    /// @return True if the user has swapped, false otherwise
    function getUserHasSwapped(address user, address inputToken) external view returns (bool);
    
    /// @notice Check if a user has performed a reverse swap for a specific token in the current cycle
    /// @param user The user address to check
    /// @param inputToken The token address to check
    /// @return True if the user has reverse swapped, false otherwise
    function getUserHasReverseSwapped(address user, address inputToken) external view returns (bool);
}

/// @title SwapLens - View-Only Utility for SWAP_V3 Auction System
/// @author State Protocol Team
/// @notice Provides comprehensive, gas-efficient read-only access to auction state and user data
/// @dev This contract is purely for data aggregation and querying - it contains no state and performs no writes
/// @dev All functions are view-only and can be called off-chain without gas costs
/// @custom:alignment Logic EXACTLY replicates SWAP_V3 time calculations and auction mechanics from AuctionUtilsLib
/// @custom:security Solidity 0.8.20 automatic overflow/underflow protection
/// @custom:design Zero-value returns for invalid inputs allow graceful degradation in frontend queries
contract SwapLens is Ownable {
    
    /// @notice Initializes SwapLens with deployer as owner and renounces ownership immediately
    /// @dev Ownership renounced since this is a pure view-only contract with no state-changing functions
    constructor() Ownable(msg.sender) {
        renounceOwnership();
    }
    
    // ============ Errors ============
    
    /// @notice Thrown when the provided SWAP_V3 address has no deployed contract
    /// @dev Prevents calls to invalid or non-existent contracts
    error InvalidContract();

    // ============ Structs ============
    
    /// @notice Comprehensive status information for the current auction day
    /// @dev Used by getTodayStatus() to return all relevant daily information
    /// @param tokenOfDay The token being auctioned today (address(0) if no active auction)
    /// @param activeWindow Whether the auction window is currently active
    /// @param isReverse Whether today is a reverse auction (every 4th appearance)
    /// @param appearanceCount How many times this token has appeared in the schedule
    /// @param secondsLeft Seconds remaining until the current day's auction ends
    struct TodayStatus {
        address tokenOfDay;
        bool activeWindow;
        bool isReverse;
        uint256 appearanceCount;
        uint256 secondsLeft;
    }

    // ============ Internal Validation & Helper Functions ============
    
    /// @notice Validates that a contract exists at the given SWAP_V3 address
    /// @dev Checks if bytecode exists at the address to prevent calls to EOAs or non-existent contracts
    /// @param s The SWAP_V3 interface instance to validate
    /// @custom:throws InvalidContract if no contract code exists at the address
    function _validate(ISWAP_V3 s) internal view {
        if (address(s).code.length == 0) revert InvalidContract();
    }

    /// @notice Checks if the auction has started
    /// @dev Auction is considered started when schedule is set AND current time >= schedule start time
    /// @param s The SWAP_V3 interface instance
    /// @return True if auction has started, false otherwise
    function _auctionStarted(ISWAP_V3 s) internal view returns (bool) {
        return s.scheduleSet() && block.timestamp >= s.scheduleStart();
    }
    
    /// @notice Calculates the current day index in the auction schedule
    /// @dev Day index is 0-based, calculated as (current_time - start_time) / 1 day
    /// @param s The SWAP_V3 interface instance
    /// @return The current day index, or 0 if auction hasn't started
    function _currentDayIndex(ISWAP_V3 s) internal view returns (uint256) {
        if (!_auctionStarted(s)) return 0;
        return (block.timestamp - s.scheduleStart()) / 1 days;
    }
    
    /// @notice Calculates the start and end timestamps for today's auction window
    /// @dev Each day is exactly 24 hours (86400 seconds)
    /// @param s The SWAP_V3 interface instance
    /// @return start Unix timestamp when today's window started
    /// @return end Unix timestamp when today's window ends
    /// @custom:timezone GMT+3 17:00 boundary encoded in scheduleStart, matches SWAP_V3 AuctionUtilsLib calculation
    function _todayWindow(ISWAP_V3 s) internal view returns (uint256 start, uint256 end) {
        uint256 d = _currentDayIndex(s);
        start = s.scheduleStart() + d * 1 days;
        end = start + 1 days;
    }
    
    /// @notice Gets the token scheduled for today and checks if the auction window is active
    /// @dev Tokens cycle through the schedule array using modulo operation
    /// @param s The SWAP_V3 interface instance
    /// @return tokenOfDay The token address for today (address(0) if no active auction)
    /// @return active True if we're currently within today's auction window
    function _getTodayToken(ISWAP_V3 s) internal view returns (address tokenOfDay, bool active) {
        if (!_auctionStarted(s)) return (address(0), false);
        uint256 d = _currentDayIndex(s);
        if (d >= s.auctionDaysLimit()) return (address(0), false);
        uint256 n = s.scheduledTokensLength();
        if (n == 0) return (address(0), false);
        tokenOfDay = s.scheduledTokens(d % n);
        (uint256 st, uint256 en) = _todayWindow(s);
        active = block.timestamp >= st && block.timestamp < en;
    }
    
    /// @notice Calculates how many times a token has appeared in the auction schedule
    /// @dev Used to determine if current appearance is a reverse auction (every 4th appearance)
    /// @dev Includes protection against division by zero
    /// @param s The SWAP_V3 interface instance
    /// @param token The token address to check
    /// @return The number of times this token has appeared (0 if not scheduled or auction not started)
    /// @custom:formula count = (currentDay - tokenIndex) / totalTokens + 1, matches AuctionUtilsLib
    function _appearanceCount(ISWAP_V3 s, address token) internal view returns (uint256) {
        if (!_auctionStarted(s)) return 0;
        uint256 idx1 = s.scheduledIndex(token);
        if (idx1 == 0) return 0; // Token not scheduled (index is 1-based)
        uint256 idx = idx1 - 1; // Convert to 0-based index (safe because idx1 > 0)
        uint256 d = _currentDayIndex(s);
        if (d < idx) return 0; // Token's first day hasn't arrived yet
        uint256 n = s.scheduledTokensLength();
        if (n == 0) return 0; // Defensive guard: prevents division by zero below
        return (d - idx) / n + 1;
    }

    /// @notice Shared computation for aggregating today's auction status
    /// @dev Used by multiple public view functions to avoid code duplication
    /// @param s The SWAP_V3 interface instance
    /// @return tokenOfDay The token being auctioned today
    /// @return active Whether the auction window is currently active
    /// @return isReverse Whether today is a reverse auction (every 4th appearance)
    /// @return appearance How many times this token has appeared
    /// @return secondsLeft Seconds remaining in today's auction window
    /// @custom:reverse Reverse auction occurs when appearance % 4 == 0 (cycles 4, 8, 12, 16, 20)
    function _statusForToday(ISWAP_V3 s)
        internal
        view
        returns (
            address tokenOfDay,
            bool active,
            bool isReverse,
            uint256 appearance,
            uint256 secondsLeft
        )
    {
        (tokenOfDay, active) = _getTodayToken(s);
        if (!active || tokenOfDay == address(0)) {
            return (address(0), false, false, 0, 0);
        }
        appearance = _appearanceCount(s, tokenOfDay);
        isReverse = (appearance > 0 && (appearance % 4 == 0));
        (, uint256 end) = _todayWindow(s);
        secondsLeft = end > block.timestamp ? end - block.timestamp : 0;
    }

    // ============ Public View Functions ============
    
    /// @notice Get comprehensive status for today's auction
    /// @dev Returns a struct with all relevant information about the current day's auction
    /// @dev Explicitly initializes all fields to zero values if no active auction
    /// @param s The SWAP_V3 contract address to query
    /// @return ts TodayStatus struct containing tokenOfDay, activeWindow, isReverse, appearanceCount, and secondsLeft
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getTodayStatus(ISWAP_V3 s) external view returns (TodayStatus memory ts) {
        _validate(s);
        (ts.tokenOfDay, ts.activeWindow, ts.isReverse, ts.appearanceCount, ts.secondsLeft) = _statusForToday(s);
        if (!ts.activeWindow || ts.tokenOfDay == address(0)) {
            // Explicit initialization for clarity to downstream consumers (frontends, indexers)
            ts.tokenOfDay = address(0);
            ts.activeWindow = false;
            ts.isReverse = false;
            ts.appearanceCount = 0;
            ts.secondsLeft = 0;
        }
    }

    /// @notice Get the core configuration of the auction schedule
    /// @dev Provides high-level schedule parameters without iterating through tokens
    /// @param s The SWAP_V3 contract address to query
    /// @return isSet True if the schedule has been configured
    /// @return start Unix timestamp when the schedule begins
    /// @return daysLimit Maximum number of auction days
    /// @return scheduledCount Number of unique tokens in the rotation schedule
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getScheduleConfig(ISWAP_V3 s)
        external
        view
        returns (bool isSet, uint256 start, uint256 daysLimit, uint256 scheduledCount)
    {
        _validate(s);
        isSet = s.scheduleSet();
        start = s.scheduleStart();
        daysLimit = s.auctionDaysLimit();
        scheduledCount = s.scheduledTokensLength();
    }

    /// @notice Get the complete list of all scheduled tokens
    /// @dev Returns all tokens in the rotation schedule order
    /// @dev WARNING: Can be gas-intensive for large schedules. Use getScheduledTokensPaginated for large lists
    /// @param s The SWAP_V3 contract address to query
    /// @return list Array of all scheduled token addresses in order
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    /// @custom:gas View-only function (zero gas for off-chain calls), paginated alternative available
    /// @custom:limit Max 50 tokens enforced in SWAP_V3 deployment
    function getScheduledTokens(ISWAP_V3 s) external view returns (address[] memory list) {
        _validate(s);
        uint256 n = s.scheduledTokensLength();
        list = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = s.scheduledTokens(i);
        }
    }

    /// @notice Get a paginated subset of scheduled tokens
    /// @dev Use this for large schedules to avoid gas limits. More efficient for frontend pagination
    /// @param s The SWAP_V3 contract address to query
    /// @param start The starting index (0-based) for pagination
    /// @param limit The maximum number of tokens to return
    /// @return list Array of token addresses from start to start+limit (or end of list)
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getScheduledTokensPaginated(ISWAP_V3 s, uint256 start, uint256 limit)
        external
        view
        returns (address[] memory list)
    {
        _validate(s);
        uint256 n = s.scheduledTokensLength();
        if (start >= n) return new address[](0);
        uint256 end = start + limit;
        if (end > n) end = n;
        uint256 size = end - start;
        list = new address[](size);
        for (uint256 i = 0; i < size; i++) {
            list[i] = s.scheduledTokens(start + i);
        }
    }

    /// @notice Get detailed schedule information for a specific token
    /// @dev Provides the token's position in schedule and appearance history
    /// @param s The SWAP_V3 contract address to query
    /// @param token The token address to look up
    /// @return isScheduled True if the token is in the rotation schedule
    /// @return index The 1-based schedule index (0 if not scheduled)
    /// @return appearancesToDate Number of times this token has appeared so far
    /// @return isReverseToday True if the current/next appearance is a reverse auction (every 4th)
    /// @return currentDay The current day index in the auction
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getTokenScheduleInfo(ISWAP_V3 s, address token)
        external
        view
        returns (bool isScheduled, uint256 index, uint256 appearancesToDate, bool isReverseToday, uint256 currentDay)
    {
        _validate(s);
        index = s.scheduledIndex(token);
        isScheduled = index != 0;
        appearancesToDate = _appearanceCount(s, token);
        isReverseToday = appearancesToDate > 0 && (appearancesToDate % 4 == 0);
        currentDay = _auctionStarted(s) ? _currentDayIndex(s) : 0;
    }

    /// @notice Get the breakdown of STATE tokens released in the current day
    /// @dev Separates normal swaps from reverse swaps for analytics
    /// @param s The SWAP_V3 contract address to query
    /// @return dayIndex The current day index
    /// @return total Total STATE tokens released today (normal + reverse)
    /// @return normal STATE tokens released through normal swaps today
    /// @return reverse STATE tokens released through reverse swaps today
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getDailyStateReleaseBreakdown(ISWAP_V3 s)
        external
        view
        returns (uint256 dayIndex, uint256 total, uint256 normal, uint256 reverse)
    {
        _validate(s);
        dayIndex = s.currentDayStart() / 1 days;
        total = s.dailyStateReleased();
        normal = s.dailyStateReleasedNormal();
        reverse = s.dailyStateReleasedReverse();
    }

    /// @notice Get STATE token release data for a specific historical day
    /// @dev Allows querying past days for historical analysis and charts
    /// @param s The SWAP_V3 contract address to query
    /// @param dayIndex The day index to query (0 = first day)
    /// @return total Total STATE tokens released on that day
    /// @return normal STATE tokens released through normal swaps on that day
    /// @return reverse STATE tokens released through reverse swaps on that day
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    /// @custom:behavior Returns zero for invalid/future days rather than reverting (enables batch queries)
    function getStateReleasedByDay(ISWAP_V3 s, uint256 dayIndex)
        external
        view
        returns (uint256 total, uint256 normal, uint256 reverse)
    {
        _validate(s);
        total = s.stateReleasedByDayIndex(dayIndex);
        normal = s.stateReleasedNormalByDayIndex(dayIndex);
        reverse = s.stateReleasedReverseByDayIndex(dayIndex);
    }

    /// @notice Get a user's swap participation status for a specific token
    /// @dev Tracks whether user has performed normal/reverse swaps in the current cycle
    /// @param s The SWAP_V3 contract address to query
    /// @param user The user address to check
    /// @param inputToken The token to check swap status for
    /// @return hasSwapped True if user has performed a normal swap in this cycle
    /// @return hasReverseSwapped True if user has performed a reverse swap in this cycle
    /// @return cycle The current appearance count (cycle number) for this token
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getUserSwapStatus(ISWAP_V3 s, address user, address inputToken)
        external
        view
        returns (bool hasSwapped, bool hasReverseSwapped, uint256 cycle)
    {
        _validate(s);
        hasSwapped = s.getUserHasSwapped(user, inputToken);
        hasReverseSwapped = s.getUserHasReverseSwapped(user, inputToken);
        cycle = _appearanceCount(s, inputToken);
    }

    /// @notice Get a comprehensive dashboard view combining today's status with user participation
    /// @dev Optimized single-call function for frontend dashboards - reduces RPC calls
    /// @param s The SWAP_V3 contract address to query
    /// @param user The user address to check participation for
    /// @return tokenOfDay The token being auctioned today
    /// @return active Whether the auction window is currently active
    /// @return isReverse Whether today is a reverse auction
    /// @return secondsLeft Seconds remaining in today's auction window
    /// @return appearance Number of times today's token has appeared
    /// @return userHasSwapped Whether the user has performed a normal swap today
    /// @return userHasReverseSwapped Whether the user has performed a reverse swap today
    /// @custom:throws InvalidContract if the provided address is not a deployed contract
    function getTodayDashboard(ISWAP_V3 s, address user)
        external
        view
        returns (address tokenOfDay, bool active, bool isReverse, uint256 secondsLeft, uint256 appearance, bool userHasSwapped, bool userHasReverseSwapped)
    {
        _validate(s);
        (tokenOfDay, active, isReverse, appearance, secondsLeft) = _statusForToday(s);
        if (!active || tokenOfDay == address(0)) {
            return (address(0), false, false, 0, 0, false, false);
        }
        userHasSwapped = s.getUserHasSwapped(user, tokenOfDay);
        userHasReverseSwapped = s.getUserHasReverseSwapped(user, tokenOfDay);
    }
}
