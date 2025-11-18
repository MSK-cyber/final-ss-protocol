// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// OZ v5 moved Pausable; to avoid version mismatch, implement simple pause via governance flag
import {SWAP_V3} from "./AuctionSwap.sol";
import {DAV_V3} from "./DavToken.sol";
import {TimeUtilsLib} from "./libraries/TimeUtilsLib.sol";

/**
 * @title AirdropDistributor
 * @author State Protocol Team
 * @notice Distributes auction tokens to DAV holders during normal auction days
 * @dev Implements cycle-based airdrop system: 10,000 auction tokens per whole DAV unit
 *      DAV units permanently consumed upon claiming - airdrops disabled on reverse auction days
 *
 * @custom:security-model Autonomous contract with renounced ownership - no admin privileges after deployment
 * @custom:time-boundary All day calculations use GMT+3 17:00 (5 PM) boundary for consistency with SWAP_V3
 * @custom:inventory-model No reservation system - claims processed first-come-first-served with clean revert on insufficient inventory
 * @custom:integration Coordinates with SWAP_V3 for auction schedules and DAV_V3 for balance verification
 * @custom:consumption-model Tracks TOTAL consumed units per cycle (not incremental). DAV balance only increases
 *                           between claims (mint-only token economics), making assignment operator correct
 */
contract AirdropDistributor is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    SWAP_V3 public immutable swap;
    DAV_V3 public immutable dav;
    address public immutable stateToken;

    /// @notice Tracks DAV units consumed per token, per user, per auction cycle
    /// @dev Three-dimensional mapping: token => user => cycle => consumed units
    ///      Stores TOTAL consumed units (not incremental delta) - mathematically equivalent given DAV mint-only economics
    ///      Users can claim multiple times per cycle if they mint additional DAV between claims
    ///      Each cycle (1-20) maintains independent consumption tracking for the same token
    mapping(address => mapping(address => mapping(uint256 => uint256))) public consumedDavUnitsByCycle;

    /// @notice Airdrop multiplier: 10,000 tokens per whole DAV unit
    /// @dev Fractional DAV amounts are ignored (integer division). DAV tokens can only be minted in whole units.
    ///      This constant must remain synchronized with SWAP_V3.AIRDROP_PER_DAV for system consistency
    uint256 public constant AIRDROP_PER_DAV = 10_000 ether;

    // ========== Analytics Tracking (GMT+3 17:00 Daily Boundary) ==========
    /// @dev Day index calculation: (calculateNextClaimStartGMTPlus3(timestamp) - 1 day) / 1 day
    ///      Produces identical day boundaries as SWAP_V3 despite different calculation method
    ///      Used for dashboard analytics and monitoring system health
    
    /// @notice Total tokens airdropped across all tokens on a given day
    mapping(uint256 => uint256) public airdropAmountByDayIndex;
    
    /// @notice Total DAV units consumed across all tokens on a given day
    mapping(uint256 => uint256) public airdropUnitsByDayIndex;
    
    /// @notice Tokens airdropped for a specific token on a given day
    mapping(address => mapping(uint256 => uint256)) public airdropAmountByTokenDayIndex;
    
    /// @notice DAV units consumed for a specific token on a given day
    mapping(address => mapping(uint256 => uint256)) public airdropUnitsByTokenDayIndex;

    /// @notice Emitted when user successfully claims airdrop tokens
    /// @param user Address that received the airdrop
    /// @param token Auction token address that was airdropped
    /// @param davUnitsConsumed Number of whole DAV units consumed for this claim
    /// @param amount Total token amount received (davUnitsConsumed * 10,000)
    event Airdropped(address indexed user, address indexed token, uint256 davUnitsConsumed, uint256 amount);

    /// @notice Initializes the AirdropDistributor with required contract addresses
    /// @param _swap SWAP_V3 contract address for auction coordination and schedule management
    /// @param _dav DAV_V3 token contract for user balance verification and consumption tracking
    /// @param _stateToken STATE token address for protocol reference (not directly used in airdrop logic)
    /// @dev Immutable addresses prevent upgrade attacks. Ownership renounced immediately for full decentralization.
    ///      No administrative functions available after deployment - contract operates autonomously
    constructor(SWAP_V3 _swap, DAV_V3 _dav, address _stateToken) {
        require(
            address(_swap) != address(0) && 
            address(_dav) != address(0) && 
            _stateToken != address(0),
            "bad addr"
        );
        swap = _swap;
        dav = _dav;
        stateToken = _stateToken;
        
        // Renounce ownership immediately - contract is fully autonomous
        renounceOwnership();
    }

    /// @notice Claims airdrop tokens for the caller based on their active DAV balance
    /// @dev Claim process follows these steps:
    ///      1. Verify system is not paused and auto-register user (enforces 2500 wallet cap)
    ///      2. Validate today's auction token is active and not a reverse auction day
    ///      3. Calculate claimable DAV units (total active DAV - already consumed this cycle)
    ///      4. Pre-check SWAP inventory and allowance for user-friendly error messages
    ///      5. Update consumption state following CEI pattern
    ///      6. Transfer tokens from SWAP to user via SafeERC20
    ///
    /// @custom:behavior Multiple claims per cycle are permitted when users mint additional DAV between claims
    /// @custom:time-tracking Uses GMT+3 17:00 boundary for day index analytics via TimeUtilsLib
    /// @custom:safety Atomic transaction guarantees - all state changes revert on any failure
    /// @custom:security Protected by nonReentrant guard and SafeERC20 transfer safety
    function claim() external nonReentrant {
        require(!swap.paused(), "paused");
        
        // Auto-register user if not already registered (enforces 2500 wallet participation cap)
        swap.registerUserForAuctions(msg.sender);
        
        // Auto-detect today's token
        (address token, bool active) = swap.getTodayToken();
        require(active && token != address(0), "No active auction today");
        
        // Validate token is supported and auction is active (includes reverse day check)
        require(swap.isTokenSupported(token), "Token not supported");
        // isAuctionActive returns false on reverse days - airdrops only available on normal auction days
        require(swap.isAuctionActive(token), "Reverse day or inactive auction");

        // Calculate whole DAV units available (integer division is exact - DAV only mints in whole units)
        uint256 activeDav = dav.getActiveBalance(msg.sender);
        uint256 davUnits = activeDav / 1e18; // Fractional DAV ignored, enforced by DAV minting constraints
        require(davUnits >= 1, "Need >=1 whole DAV");

        // Verify token is within its 20-cycle lifetime (1 token cycles through 20 separate auctions)
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        require(currentCycle <= 20, "Token auction cycles completed");
        
        uint256 already = consumedDavUnitsByCycle[token][msg.sender][currentCycle];
        require(davUnits > already, "No new DAV units");

        uint256 newUnits = davUnits - already;
        uint256 amount = newUnits * AIRDROP_PER_DAV;

        // Pre-validate SWAP has sufficient inventory and allowance (provides clear error messages)
        // Note: No inventory reservation - atomic transactions guarantee clean revert on race conditions
        uint256 swapBalance = IERC20(token).balanceOf(address(swap));
        require(swapBalance >= amount, "Insufficient swap balance");
        uint256 allowance = IERC20(token).allowance(address(swap), address(this));
        require(allowance >= amount, "Insufficient allowance");

        // Update consumption state before external calls (CEI pattern)
        // Stores total consumed units: consumed = already + newUnits = davUnits (DAV mint-only economics)
        consumedDavUnitsByCycle[token][msg.sender][currentCycle] = davUnits;

        // Record analytics with GMT+3 17:00 day boundary alignment
        uint256 dayIndex = (TimeUtilsLib.calculateNextClaimStartGMTPlus3(block.timestamp) - 1 days) / 1 days;
        airdropAmountByDayIndex[dayIndex] += amount;
        airdropUnitsByDayIndex[dayIndex] += newUnits;
        airdropAmountByTokenDayIndex[token][dayIndex] += amount;
        airdropUnitsByTokenDayIndex[token][dayIndex] += newUnits;

        // Transfer tokens from SWAP to user (SafeERC20 ensures atomic revert on failure)
        IERC20(token).safeTransferFrom(address(swap), msg.sender, amount);
        emit Airdropped(msg.sender, token, newUnits, amount);
    }

    // ========== View Functions ==========
    
    /// @notice Retrieves total airdrop statistics for a specific day across all tokens
    /// @param dayIndex Day index calculated using GMT+3 17:00 boundary: (nextClaimStart - 1 day) / 1 day
    /// @return amount Total token amount airdropped across all tokens on this day
    /// @return units Total DAV units consumed across all tokens on this day
    /// @dev Used for analytics dashboards and system monitoring
    function getAirdropStatsForDay(uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByDayIndex[dayIndex], airdropUnitsByDayIndex[dayIndex]);
    }

    /// @notice Retrieves airdrop statistics for a specific token on a specific day
    /// @param token Auction token address to query
    /// @param dayIndex Day index calculated using GMT+3 17:00 boundary: (nextClaimStart - 1 day) / 1 day
    /// @return amount Total token amount airdropped for this specific token on this day
    /// @return units Total DAV units consumed for this specific token on this day
    /// @dev Used for per-token analytics and performance monitoring
    function getAirdropStatsForTokenDay(address token, uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByTokenDayIndex[token][dayIndex], airdropUnitsByTokenDayIndex[token][dayIndex]);
    }

    /// @notice Calculates the claimable airdrop amount for a user on today's auction token
    /// @param token Token address to check claimability for
    /// @param user User address to check
    /// @return davUnitsAvailable Total whole DAV units the user currently holds
    /// @return newUnits New DAV units available to claim (total active - already consumed this cycle)
    /// @return amount Token amount claimable (newUnits × 10,000)
    /// @dev Returns (0,0,0) in the following cases:
    ///      - Token is not supported by the auction system
    ///      - Token is not today's scheduled auction token
    ///      - Today is a reverse auction day (airdrops disabled)
    ///      - Auction is currently inactive
    ///      - User has no new DAV units to claim
    function getClaimable(address token, address user) external view returns (
        uint256 davUnitsAvailable,
        uint256 newUnits,
        uint256 amount
    ) {
        if (!swap.isTokenSupported(token)) return (0, 0, 0);
        (address today, bool active) = swap.getTodayToken();
        if (!(active && today == token && swap.isAuctionActive(token))) return (0, 0, 0);
        uint256 activeDav = dav.getActiveBalance(user);
        uint256 davUnits = activeDav / 1e18;
        if (davUnits == 0) return (0, 0, 0);
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        uint256 already = consumedDavUnitsByCycle[token][user][currentCycle];
        if (davUnits <= already) return (davUnits, 0, 0);
        uint256 newU = davUnits - already;
        return (davUnits, newU, newU * AIRDROP_PER_DAV);
    }
    
    /// @notice Retrieves consumed DAV units for a specific user, token, and cycle
    /// @param token Auction token address to query
    /// @param user User address to query
    /// @param cycle Auction cycle number (1-20)
    /// @return consumed Whole DAV units already consumed by this user for this token in the specified cycle
    /// @dev Called by SWAP_V3 contract to verify airdrop participation before allowing auction bids
    ///      This function is critical for multi-step auction validation - signature must remain stable
    function getConsumedDavUnitsByCycle(address token, address user, uint256 cycle) external view returns (uint256) {
        return consumedDavUnitsByCycle[token][user][cycle];
    }
    
    /// @notice Retrieves consumed DAV units for the current auction cycle of a token
    /// @param token Auction token address to query
    /// @param user User address to query
    /// @return consumed Whole DAV units consumed in the current active cycle for this token
    /// @dev Convenience function for UI to display current cycle participation status
    ///      Internally calls getCurrentAuctionCycle from SWAP_V3 for cycle determination
    function getConsumedDavUnitsCurrentCycle(address token, address user) external view returns (uint256) {
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        return consumedDavUnitsByCycle[token][user][currentCycle];
    }
}
