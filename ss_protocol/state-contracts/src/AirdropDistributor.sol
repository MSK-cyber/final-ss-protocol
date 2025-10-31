// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
// OZ v5 moved Pausable; to avoid version mismatch, implement simple pause via Ownable flag
import {SWAP_V3} from "./AuctionSwap.sol";
import {DAV_V3} from "./DavToken.sol";
import {TimeUtilsLib} from "./libraries/TimeUtilsLib.sol";

/// @title AirdropDistributor
/// @notice Stage 1: on normal days, deliver 10,000 auction tokens per whole active DAV unit to user wallet.
///         Consumes DAV units permanently; reverse days are disabled (LP-only).
contract AirdropDistributor is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    SWAP_V3 public immutable swap;
    DAV_V3 public immutable dav;
    address public immutable stateToken;

    // token => user => cycle => DAV units already consumed for airdrop (per token per cycle)
    mapping(address => mapping(address => mapping(uint256 => uint256))) public consumedDavUnitsByCycle;
    
    // Backward compatibility: legacy mapping (deprecated but kept for interface compatibility)
    mapping(address => mapping(address => uint256)) public consumedDavUnits;
    mapping(address => bool) public isConsumer;
    // user => consumer => remaining DAV units the consumer is allowed to consume (explicit user approval)
    mapping(address => mapping(address => uint256)) public consumerAllowances;

    uint256 public constant AIRDROP_PER_DAV = 10_000 ether;

    // ========== Admin analytics (15:00 GMT+3 aligned day index) ==========
    mapping(uint256 => uint256) public airdropAmountByDayIndex; // total tokens airdropped per day
    mapping(uint256 => uint256) public airdropUnitsByDayIndex;  // total DAV units consumed per day
    mapping(address => mapping(uint256 => uint256)) public airdropAmountByTokenDayIndex; // token => dayIndex => amount
    mapping(address => mapping(uint256 => uint256)) public airdropUnitsByTokenDayIndex;  // token => dayIndex => units

    event Airdropped(address indexed user, address indexed token, uint256 davUnitsConsumed, uint256 amount);
    event ConsumerSet(address indexed consumer, bool allowed);
    event ConsumerApproved(address indexed user, address indexed consumer, uint256 maxDavUnits);
    event ConsumerEmergencyRemoved(address indexed consumer, uint256 at);
    event BoostConsumed(address indexed consumer, address indexed user, address indexed token, uint256 davUnits);

    constructor(SWAP_V3 _swap, DAV_V3 _dav, address _stateToken, address _owner) {
        require(address(_swap) != address(0) && address(_dav) != address(0) && _stateToken != address(0), "bad addr");
        swap = _swap;
        dav = _dav;
        stateToken = _stateToken;
        // Ownership configured via Ownable(msg.sender) pattern; transfer if different
        if (_owner != msg.sender) {
            _transferOwnership(_owner);
        }
    }

    bool public paused;
    function pause() external onlyOwner { paused = true; }
    function unpause() external onlyOwner { paused = false; }

    function claim() external nonReentrant {
        require(!paused, "paused");
        
        // STEP 1: Auto-register user for auctions (consistent with reverse auction)
        swap.registerUserForAuctions(msg.sender);
        
        // Auto-detect today's token
        (address token, bool active) = swap.getTodayToken();
        require(active && token != address(0), "No active auction today");
        
        // Only if token is today's token and normal day
        require(swap.isTokenSupported(token), "Token not supported");
        require(swap.isAuctionActive(token), "Reverse day or inactive auction"); // false on reverse days

        // Determine whole DAV units available minus already consumed for this token in this cycle
        uint256 activeDav = dav.getActiveBalance(msg.sender);
        uint256 davUnits = activeDav / 1e18; // whole units
        require(davUnits >= 1, "Need >=1 whole DAV");

        // Get current cycle for this token
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        
        // Check if token has completed maximum cycles
        require(currentCycle <= 20, "Token auction cycles completed");
        
        uint256 already = consumedDavUnitsByCycle[token][msg.sender][currentCycle];
        require(davUnits > already, "No new DAV units");

        uint256 newUnits = davUnits - already;
        uint256 amount = newUnits * AIRDROP_PER_DAV;

        // Pre-check SWAP inventory and allowance for a clearer failure than safeTransferFrom revert
        uint256 swapBalance = IERC20(token).balanceOf(address(swap));
        require(swapBalance >= amount, "Insufficient swap balance");
        uint256 allowance = IERC20(token).allowance(address(swap), address(this));
        require(allowance >= amount, "Insufficient allowance");

        // Effects: consume units for this cycle BEFORE external interaction
        consumedDavUnitsByCycle[token][msg.sender][currentCycle] = davUnits;

        // Admin analytics: compute aligned day index (same boundary as SWAP)
        uint256 dayIndex = (TimeUtilsLib.calculateNextClaimStartGMTPlus3(block.timestamp) - 1 days) / 1 days;
        airdropAmountByDayIndex[dayIndex] += amount;
        airdropUnitsByDayIndex[dayIndex] += newUnits;
        airdropAmountByTokenDayIndex[token][dayIndex] += amount;
        airdropUnitsByTokenDayIndex[token][dayIndex] += newUnits;

        // Interaction: transfer from SWAP vault to user (inventory must be pre-deposited)
        IERC20(token).safeTransferFrom(address(swap), msg.sender, amount);
        emit Airdropped(msg.sender, token, newUnits, amount);
    }

    function setConsumer(address consumer, bool allowed) external onlyOwner {
        isConsumer[consumer] = allowed;
        emit ConsumerSet(consumer, allowed);
    }

    /// @notice User grants (or updates) an allowance of DAV units that a given consumer can spend on their behalf.
    function approveConsumer(address consumer, uint256 maxDavUnits) external {
        require(consumer != address(0), "bad consumer");
        require(isConsumer[consumer], "not allowed consumer");
        consumerAllowances[msg.sender][consumer] = maxDavUnits;
        emit ConsumerApproved(msg.sender, consumer, maxDavUnits);
    }

    /// @notice User revokes a previously granted allowance to a consumer (sets to 0).
    function revokeConsumer(address consumer) external {
        consumerAllowances[msg.sender][consumer] = 0;
        emit ConsumerApproved(msg.sender, consumer, 0);
    }

    /// @notice Owner emergency removal of a consumer from the allowlist.
    function emergencyRemoveConsumer(address consumer) external onlyOwner {
        isConsumer[consumer] = false;
        emit ConsumerEmergencyRemoved(consumer, block.timestamp);
    }

    function consumeFromBoost(address token, address user, uint256 davUnits) external {
        require(isConsumer[msg.sender], "not allowed");
        require(davUnits > 0, "Invalid amount");
        // Require explicit user approval/allowance for this consumer (units-based)
        uint256 allowanceLeft = consumerAllowances[user][msg.sender];
        require(allowanceLeft >= davUnits, "Insufficient allowance");
        // Enforce same-day and same-token constraints as Stage 1 airdrop
        require(swap.isTokenSupported(token), "Token not supported");
        (address today, bool active) = swap.getTodayToken();
        require(active && today == token, "Not today's token");
        require(swap.isAuctionActive(token), "Reverse day or inactive auction");
        // Compute user's available DAV units using active balance for fairness/consistency
        uint256 activeDav = dav.getActiveBalance(user);
        uint256 available = activeDav / 1e18;
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        uint256 current = consumedDavUnitsByCycle[token][user][currentCycle];
        uint256 newVal = current + davUnits;
        require(newVal <= available, "Exceeds available DAV");
        consumedDavUnitsByCycle[token][user][currentCycle] = newVal;
        consumerAllowances[user][msg.sender] = allowanceLeft - davUnits;
        emit BoostConsumed(msg.sender, user, token, davUnits);
    }

    // ========== View helpers: admin stats ==========
    function getAirdropStatsForDay(uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByDayIndex[dayIndex], airdropUnitsByDayIndex[dayIndex]);
    }

    function getAirdropStatsForTokenDay(address token, uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByTokenDayIndex[token][dayIndex], airdropUnitsByTokenDayIndex[token][dayIndex]);
    }

    /// @notice View helper: returns user's claimable amount for today's token on a normal day
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
    
    /// @notice View helper: returns user's consumed DAV units for a specific token and cycle
    function getConsumedDavUnitsByCycle(address token, address user, uint256 cycle) external view returns (uint256) {
        return consumedDavUnitsByCycle[token][user][cycle];
    }
    
    /// @notice View helper: returns user's consumed DAV units for current cycle of a token
    function getConsumedDavUnitsCurrentCycle(address token, address user) external view returns (uint256) {
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        return consumedDavUnitsByCycle[token][user][currentCycle];
    }
}
