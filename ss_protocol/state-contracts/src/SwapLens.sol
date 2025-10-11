// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISWAP_V3 {
    // core schedule state
    function scheduleSet() external view returns (bool);
    function scheduleStart() external view returns (uint256);
    function auctionDaysLimit() external view returns (uint256);
    function scheduledTokens(uint256) external view returns (address);
    function scheduledTokensLength() external view returns (uint256);
    function scheduledIndex(address) external view returns (uint256);

    // daily state release
    function currentDayStart() external view returns (uint256);
    function dailyStateReleased() external view returns (uint256);
    function dailyStateReleasedNormal() external view returns (uint256);
    function dailyStateReleasedReverse() external view returns (uint256);
    function stateReleasedByDayIndex(uint256) external view returns (uint256);
    function stateReleasedNormalByDayIndex(uint256) external view returns (uint256);
    function stateReleasedReverseByDayIndex(uint256) external view returns (uint256);

    // user flags
    function getUserHasSwapped(address user, address inputToken) external view returns (bool);
    function getUserHasReverseSwapped(address user, address inputToken) external view returns (bool);
}

contract SwapLens {
    // Custom errors for lightweight, clear failures
    error InvalidContract();

    struct TodayStatus {
        address tokenOfDay;
        bool activeWindow;
        bool isReverse;
        uint256 appearanceCount;
        uint256 secondsLeft;
    }

    // --- internal validation helpers ---
    function _validate(ISWAP_V3 s) internal view {
        // Ensure a contract is deployed at the provided address.
        if (address(s).code.length == 0) revert InvalidContract();
    }

    function _auctionStarted(ISWAP_V3 s) internal view returns (bool) {
        return s.scheduleSet() && block.timestamp >= s.scheduleStart();
    }
    function _currentDayIndex(ISWAP_V3 s) internal view returns (uint256) {
        if (!_auctionStarted(s)) return 0;
        return (block.timestamp - s.scheduleStart()) / 1 days;
    }
    function _todayWindow(ISWAP_V3 s) internal view returns (uint256 start, uint256 end) {
        uint256 d = _currentDayIndex(s);
        start = s.scheduleStart() + d * 1 days;
        end = start + 1 days;
    }
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
    function _appearanceCount(ISWAP_V3 s, address token) internal view returns (uint256) {
        if (!_auctionStarted(s)) return 0;
        uint256 idx1 = s.scheduledIndex(token);
        if (idx1 == 0) return 0;
        uint256 idx = idx1 - 1;
        uint256 d = _currentDayIndex(s);
        if (d < idx) return 0;
        uint256 n = s.scheduledTokensLength();
        // Defensive guard: if no tokens are scheduled, there can be no appearances.
        if (n == 0) return 0; // prevents division by zero below
        return (d - idx) / n + 1;
    }

    // Shared computation used by multiple views to avoid duplication
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

    function getTodayStatus(ISWAP_V3 s) external view returns (TodayStatus memory ts) {
        _validate(s);
        (ts.tokenOfDay, ts.activeWindow, ts.isReverse, ts.appearanceCount, ts.secondsLeft) = _statusForToday(s);
        if (!ts.activeWindow || ts.tokenOfDay == address(0)) {
            // Explicit initialization for clarity to downstream consumers
            ts.tokenOfDay = address(0);
            ts.activeWindow = false;
            ts.isReverse = false;
            ts.appearanceCount = 0;
            ts.secondsLeft = 0;
        }
    }

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

    function getScheduledTokens(ISWAP_V3 s) external view returns (address[] memory list) {
        _validate(s);
        uint256 n = s.scheduledTokensLength();
        list = new address[](n);
        for (uint256 i = 0; i < n; i++) {
            list[i] = s.scheduledTokens(i);
        }
    }

    // Paginated variant for scalability in UIs
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

    function getUserSwapStatus(ISWAP_V3 s, address user, address inputToken)
        external
        view
        returns (bool hasSwapped, bool hasReverseSwapped, uint256 cycle)
    {
        _validate(s);
        hasSwapped = s.getUserHasSwapped(user, inputToken);
        hasReverseSwapped = s.getUserHasReverseSwapped(user, inputToken);
        // Cycle equals appearance count of the token
        cycle = _appearanceCount(s, inputToken);
    }

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
