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
/// @dev AUDIT NOTES:
///      - Day index calculation uses GMT+3 17:00 (5 PM) boundary, consistent with SWAP contract's time alignment
///      - No inventory reservation system: race conditions will cleanly revert without state corruption
///      - Transfer failures are handled by SafeERC20 with automatic revert on insufficient balance
///      - All consumer/boost infrastructure removed as unused in production (future feature)
///      - Gas optimizations (struct packing, batching) intentionally deferred for clarity and upgradeability
contract AirdropDistributor is Ownable(msg.sender), ReentrancyGuard {
    using SafeERC20 for IERC20;

    SWAP_V3 public immutable swap;
    DAV_V3 public immutable dav;
    address public immutable stateToken;

    /// @notice Tracks DAV units consumed per token, per user, per auction cycle
    /// @dev Cycle-based tracking allows users to claim multiple times as they mint new DAV
    ///      This mapping is the source of truth for claim eligibility (no legacy mappings)
    mapping(address => mapping(address => mapping(uint256 => uint256))) public consumedDavUnitsByCycle;

    /// @notice Airdrop amount: 10,000 tokens per whole DAV unit (fractional DAV ignored)
    /// @dev Must match AuctionSwap.AIRDROP_PER_DAV for consistency in calculations
    uint256 public constant AIRDROP_PER_DAV = 10_000 ether;

    // ========== Admin analytics (17:00 GMT+3 / 5 PM GMT+3 aligned day index) ==========
    /// @dev Day index calculation: (calculateNextClaimStartGMTPlus3(timestamp) - 1 day) / 1 day
    ///      This aligns with SWAP contract's day boundary for consistent cross-contract analytics
    ///      AUDIT NOTE: Different calculation method than SWAP but produces identical day boundaries
    mapping(uint256 => uint256) public airdropAmountByDayIndex; // total tokens airdropped per day
    mapping(uint256 => uint256) public airdropUnitsByDayIndex;  // total DAV units consumed per day
    mapping(address => mapping(uint256 => uint256)) public airdropAmountByTokenDayIndex; // token => dayIndex => amount
    mapping(address => mapping(uint256 => uint256)) public airdropUnitsByTokenDayIndex;  // token => dayIndex => units

    /// @notice Emitted when user successfully claims airdrop tokens
    /// @param user Address that received the airdrop
    /// @param token Auction token address that was airdropped
    /// @param davUnitsConsumed Number of whole DAV units consumed for this claim
    /// @param amount Total token amount received (davUnitsConsumed * 10,000)
    event Airdropped(address indexed user, address indexed token, uint256 davUnitsConsumed, uint256 amount);

    /// @notice Initializes the AirdropDistributor with required contract addresses
    /// @param _swap SWAP_V3 contract address for auction coordination
    /// @param _dav DAV_V3 token contract for balance checks
    /// @param _stateToken STATE token address (for reference, not directly used)
    /// @param _owner Contract owner address for administrative functions
    /// @dev All addresses are immutable after deployment for security
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

    /// @notice Emergency pause flag to disable claims if needed
    /// @dev Simple boolean pause instead of OpenZeppelin Pausable to avoid dependency version conflicts
    bool public paused;
    
    /// @notice Pause all claim operations (owner only)
    /// @dev Emergency function for critical issues or maintenance
    function pause() external onlyOwner { paused = true; }
    
    /// @notice Resume claim operations (owner only)
    function unpause() external onlyOwner { paused = false; }

    /// @notice Main airdrop claim function - delivers tokens based on active DAV balance
    /// @dev AUDIT NOTES:
    ///      - Pre-checks SWAP balance/allowance for clearer error messages (not atomic reservation)
    ///      - Race conditions on low inventory will cleanly revert via SafeERC20, no state corruption
    ///      - Day index uses GMT+3 17:00 (5 PM) boundary via TimeUtilsLib for analytics consistency
    ///      - User auto-registration enforces 5000 participant cap before any state changes
    ///      - Multiple claims per cycle allowed if user mints more DAV between claims
    /// @custom:security nonReentrant protects against reentrancy, SafeERC20 handles transfer safety
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

        // Pre-check SWAP inventory and allowance for clearer failure than safeTransferFrom revert
        // AUDIT NOTE: No atomic reservation - race conditions will cause clean revert, acceptable tradeoff
        uint256 swapBalance = IERC20(token).balanceOf(address(swap));
        require(swapBalance >= amount, "Insufficient swap balance");
        uint256 allowance = IERC20(token).allowance(address(swap), address(this));
        require(allowance >= amount, "Insufficient allowance");

        // Effects: consume units for this cycle BEFORE external interaction (CEI pattern)
        consumedDavUnitsByCycle[token][msg.sender][currentCycle] = davUnits;

        // Admin analytics: compute aligned day index (same boundary as SWAP)
        // AUDIT NOTE: Uses GMT+3 17:00 (5 PM) boundary. Different calculation than SWAP's currentDayStart
        // but produces identical day boundaries for analytics alignment
        uint256 dayIndex = (TimeUtilsLib.calculateNextClaimStartGMTPlus3(block.timestamp) - 1 days) / 1 days;
        airdropAmountByDayIndex[dayIndex] += amount;
        airdropUnitsByDayIndex[dayIndex] += newUnits;
        airdropAmountByTokenDayIndex[token][dayIndex] += amount;
        airdropUnitsByTokenDayIndex[token][dayIndex] += newUnits;

        // Interaction: transfer from SWAP vault to user (inventory must be pre-deposited)
        IERC20(token).safeTransferFrom(address(swap), msg.sender, amount);
        emit Airdropped(msg.sender, token, newUnits, amount);
    }

    // ========== View helpers: admin stats ==========
    
    /// @notice Get total airdrop statistics for a specific day
    /// @param dayIndex Day index calculated as: (nextClaimStart - 1 day) / 1 day
    /// @return amount Total token amount airdropped across all tokens on this day
    /// @return units Total DAV units consumed across all tokens on this day
    /// @dev Used by admin dashboard for analytics and monitoring
    function getAirdropStatsForDay(uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByDayIndex[dayIndex], airdropUnitsByDayIndex[dayIndex]);
    }

    /// @notice Get airdrop statistics for a specific token on a specific day
    /// @param token Auction token address
    /// @param dayIndex Day index calculated as: (nextClaimStart - 1 day) / 1 day
    /// @return amount Total token amount airdropped for this token on this day
    /// @return units Total DAV units consumed for this token on this day
    /// @dev Used by admin dashboard for per-token analytics
    function getAirdropStatsForTokenDay(address token, uint256 dayIndex) external view returns (uint256 amount, uint256 units) {
        return (airdropAmountByTokenDayIndex[token][dayIndex], airdropUnitsByTokenDayIndex[token][dayIndex]);
    }

    /// @notice View helper: returns user's claimable amount for today's token on a normal day
    /// @param token Token address to check claimability for
    /// @param user User address to check
    /// @return davUnitsAvailable Total whole DAV units user currently has
    /// @return newUnits New DAV units available to claim (total - already consumed)
    /// @return amount Token amount claimable (newUnits * 10,000)
    /// @dev Returns (0,0,0) if: token not supported, not today's token, reverse day, or no new DAV
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
    /// @param token Auction token address
    /// @param user User address to check
    /// @param cycle Auction cycle number (1-20)
    /// @return Whole DAV units already consumed by this user for this token in this cycle
    /// @dev Used by SWAP contract's _hasCompletedStep1 to verify airdrop participation
    ///      Critical for auction step validation - do not remove or modify signature
    function getConsumedDavUnitsByCycle(address token, address user, uint256 cycle) external view returns (uint256) {
        return consumedDavUnitsByCycle[token][user][cycle];
    }
    
    /// @notice View helper: returns user's consumed DAV units for current cycle of a token
    /// @param token Auction token address
    /// @param user User address to check
    /// @return Whole DAV units consumed in the current active cycle
    /// @dev Convenience function for frontend to show current cycle progress
    function getConsumedDavUnitsCurrentCycle(address token, address user) external view returns (uint256) {
        uint256 currentCycle = swap.getCurrentAuctionCycle(token);
        return consumedDavUnitsByCycle[token][user][currentCycle];
    }
}
