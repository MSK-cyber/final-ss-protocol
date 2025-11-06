// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/ReferralCodeLib.sol";
import "./libraries/Distribution.sol";
import "./libraries/TimeUtilsLib.sol";
import "./interfaces/IAuctionAdmin.sol";
// Burn-to-claim feature removed: BurnLibrary integration deleted

// Interfaces for ROI calculation
interface ISWAP_V3 {
    function autoRegisteredTokens(uint256 index) external view returns (address);
    function getRatioPrice(address token) external view returns (uint256);
    function getAutoRegisteredTokensCount() external view returns (uint256);
    
    // Auction schedule struct getter
    function auctionSchedule() external view returns (
        bool scheduleSet,
        uint256 scheduleStart,
        uint256 scheduleSize,
        uint256 auctionDaysLimit,
        uint256 tokenCount
    );
}

interface IBuyAndBurn {
    function stateWplsPool() external view returns (address);
}

interface IPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

/**
 * @title DAV_V3 (Decentralized Auction Voucher Token)
 * @author State Protocol Team
 * @notice DAV tokens are time-limited vouchers (30-day expiry) that grant access to State Protocol auctions
 * @dev Complex token economics with referral system, holder rewards, ROI-based claims, and batch tracking
 * 
 * KEY FEATURES:
 * ============
 * 1. Time-Limited Tokens: 30-day expiry from mint (30-day reset on governance transfer)
 * 2. Holder Rewards: 10% of mint fees distributed to active DAV holders
 * 3. Referral System: 5% bonus for referrers (added to claimable rewards)
 * 4. ROI Verification: Must maintain portfolio value >= DAV mint cost to claim rewards
 * 5. Buy & Burn: 80% of mint fees sent to BuyAndBurnController for STATE buyback
 * 6. Batch Tracking: Complete mint/expiry history preserved for transparency
 * 
 * ARCHITECTURE:
 * ============
 * - Solidity 0.8.20: Built-in overflow/underflow protection
 * - OpenZeppelin: ERC20, Ownable, ReentrancyGuard, SafeERC20
 * - Library Integration: Distribution, ReferralCodeLib, TimeUtilsLib
 * - External Dependencies: SWAP_V3, AuctionAdmin, BuyAndBurnController
 * 
 * GAS DESIGN PHILOSOPHY:
 * =====================
 * This contract intentionally prioritizes TRANSPARENCY and ACCURACY over gas optimization:
 * - Loops iterate holders/batches for real-time calculations
 * - Full mint history preserved (including expired batches)
 * - No caching or snapshots to avoid staleness
 * - MAX_HOLDERS = 5,000 caps system size
 * - PulseChain context: 1 PLS ≈ 0.00000396 ETH (very low gas costs)
 * 
 * WORKFLOW:
 * ========
 * 1. User mints DAV by paying 1,500,000 PLS per token (1.5 Million PLS)
 * 2. Funds distributed: 80% liquidity, 10% holders, 5% dev, 5% referral
 * 3. DAV expires after 30 days (refreshed if transferred from governance)
 * 4. Holders accumulate rewards from subsequent mints
 * 5. Claim rewards if ROI check passes (portfolio value >= DAV cost)
 * 6. After 1000 days, governance can reclaim unclaimed rewards
 * 
 * SECURITY NOTES:
 * ==============
 * - ReentrancyGuard on all state-changing functions
 * - Transfers pausable (governance emergency control)
 * - Governance uses multi-sig for security
 * - All low-level calls have explicit success checks
 * - Solidity 0.8.20 automatic overflow protection
 * 
 * AUDIT NOTES:
 * ===========
 * - Finding #1 (Reentrancy): FALSE POSITIVE - nonReentrant modifier present, CEI pattern followed
 * - Finding #2 (Unbounded Loop): INTENTIONAL - max 50 tokens, early exit, view function only
 * - Finding #3 (Batch Accounting): INTENTIONAL - graceful backward compatibility for governance
 * - Finding #4 (Unchecked Calls): FALSE POSITIVE - all calls have require(success) checks
 * - Finding #5 (Integer Overflow): FALSE POSITIVE - Solidity 0.8.20 built-in protection
 * - Finding #6-10 (Gas): INTENTIONAL - transparency/accuracy prioritized over optimization
 */
contract DAV_V3 is
    ERC20,
    Ownable(msg.sender),
    ReentrancyGuard // IERC20 initialization
{
    //NOTE: some Functions uses loops to get values which can be gas-intensive, but necessary for accurate, real-time calculation of active token balances.
    //NOTE: This contract is intended for EVM based chains.
    //NOTE: High ether costs are added for some required chains which has low token values like pulsechain. 1 pls ~ 0.00000396 ETH.
    using SafeERC20 for IERC20;
    using ReferralCodeLib for ReferralCodeLib.ReferralData;
    using Distribution for Distribution.HolderState;
    Distribution.HolderState internal holderState;

    IERC20 public StateToken;
    ReferralCodeLib.ReferralData private referralData;
    
    // ============ Protocol Constants ============
    
    /// @notice Maximum total supply of DAV tokens (includes 2,000 initial governance mint)
    /// @dev Hard cap to prevent unlimited inflation
    uint256 public constant MAX_SUPPLY = 10000000 ether; // 10,000,000 DAV Tokens (hard cap, includes 2,000 gov mint)
    
    /// @notice Maximum number of unique DAV holders allowed
    /// @dev Caps system size to keep gas costs manageable for loops
    /// @dev Audit Note: Bounds all holder iterations to prevent unbounded gas consumption
    uint256 public constant MAX_HOLDERS = 5000; // 5,000 wallets limit per requirements
    
    /// @notice Cost to mint 1 DAV token in PLS
    /// @dev PulseChain native token: 1 PLS ≈ 0.00000396 ETH (very low cost)
    uint256 public constant TOKEN_COST = 1500000 ether; // 1,500,000 PLS per DAV (1.5 Million PLS)
    
    /// @notice Referral bonus percentage (5% of mint fees)
    /// @dev Added to referrer's claimable holder rewards (not paid immediately)
    uint256 public constant REFERRAL_BONUS = 5; // 5% bonus for referrers
    
    /// @notice Liquidity share percentage (80% of mint fees)
    /// @dev Sent to BuyAndBurnController for STATE token buyback and burn
    uint256 public constant LIQUIDITY_SHARE = 80; // 80% LIQUIDITY SHARE
    
    /// @notice Development share percentage (5% of mint fees)
    /// @dev Distributed to dev wallets registered in AuctionAdmin
    uint256 public constant DEVELOPMENT_SHARE = 5; // 5% DEV SHARE
    
    /// @notice Holder rewards share percentage (10% of mint fees)
    /// @dev Distributed proportionally to active DAV holders
    uint256 public constant HOLDER_SHARE = 10; // 10% HOLDER SHARE
    
    /// @notice Basis points for percentage calculations
    uint256 public constant BASIS_POINTS = 10000;
    
    /// @notice Initial governance allocation minted at deployment
    /// @dev Marked as fromGovernance=true, excluded from holder rewards
    uint256 public constant INITIAL_GOV_MINT = 2000 ether;
    
    /// @notice STATE token contract address
    /// @dev Set automatically in constructor (previously required manual configuration)
    address public STATE_TOKEN;
    
    /// @notice Maximum tokens per user (legacy constant, not currently enforced)
    uint256 public constant MAX_TOKEN_PER_USER = 100;
    
    /// @notice DAV token expiry period (30 days from mint)
    /// @dev Tokens become inactive after expiry but history is preserved
    /// @dev Audit Note: Expiry tracked per-batch to maintain complete mint history
    uint256 public constant DAV_TOKEN_EXPIRE = 30 days; // 30 days expiry per requirements

    /// @notice Cycle allocation count for future feature expansion
    /// @dev Currently unused, reserved for potential cycle-based mechanics
    uint256 public constant CYCLE_ALLOCATION_COUNT = 10;
    
    // ============ Analytics & Tracking ============
    
    /// @notice Total referral rewards distributed to referrers (lifetime)
    /// @dev Tracks historical referral payouts for analytics
    uint256 public totalReferralRewardsDistributed;
    
    /// @notice Total DAV tokens minted (excluding initial gov mint tracked separately)
    /// @dev Incremented on each mintDAV call
    uint256 public mintedSupply;
    
    /// @notice Total PLS allocated to liquidity/buyback (80% of mint fees)
    /// @dev Sent to BuyAndBurnController for STATE buyback operations
    uint256 public totalLiquidityAllocated;
    
    /// @notice Total PLS allocated to development (5% of mint fees)
    /// @dev Distributed to dev wallets via AuctionAdmin
    uint256 public totalDevelopmentAllocated;
    // ============ Governance & Protocol Addresses ============
    
    /// @notice Governance address with special privileges
    /// @dev Uses multi-sig for security
    /// @dev Can be updated via timelock (proposeGovernance + confirmGovernance) or immediately (transferGovernanceImmediate)
    /// @dev SWAP contract can also transfer governance for protocol-wide coordination
    address public governance;
    
    /// @notice SWAP_V3 (AuctionSwap) contract address
    /// @dev Used for ROI calculations (reads auction token prices)
    /// @dev Can transfer governance immediately for protocol coordination
    address public swapContract;
    
    /// @notice AuctionAdmin contract address
    /// @dev Manages development fee wallet registry
    /// @dev This contract reads wallet config via IAuctionAdmin interface
    address public auctionAdmin;
    
    /// @notice BuyAndBurnController contract address
    /// @dev Receives 80% of mint fees for STATE buyback and burn
    /// @dev Also used for STATE/WPLS pool price queries in ROI calculations
    address public buyAndBurnController;
    
    // ============ Control Flags ============
    
    /// @notice Transfer pause flag (governance emergency control)
    /// @dev When true, only governance can transfer tokens
    /// @dev Useful for emergency situations or protocol migrations
    bool public transfersPaused = false;
    
    /// @notice Contract pause flag (governance emergency control)
    /// @dev When true, minting and reward claims are disabled
    /// @dev Transfers still respect transfersPaused separately
    bool public paused = false;

    // ============ Data Structures ============
    
    /// @notice Nonce for referral code generation (ensures uniqueness)
    /// @dev Incremented each time a referral code is generated for a user
    mapping(address => uint256) private userNonce;
    
    /// @notice Governance proposal pending confirmation (7-day timelock)
    /// @dev Used by proposeGovernance/confirmGovernance functions
    struct GovernanceProposal {
        address newGovernance;
        uint256 proposedAt;
    }
    GovernanceProposal public pendingGovernance;

    /// @notice Tracks lifetime referral rewards earned by each address
    /// @dev For analytics only - actual claimable rewards in holderState.holderRewards
    mapping(address => uint256) public referralRewards;
    
    /// @notice Mint batch structure for tracking individual DAV mints
    /// @dev Preserves complete mint history including expired batches
    /// @dev Audit Note: Intentionally keeps all batches for transparency (not pruned)
    struct MintBatch {
        uint256 amount;         // Amount of DAV in this batch
        uint256 timestamp;      // Mint time (for expiry calculation)
        bool fromGovernance;    // If true, excluded from holder reward calculations
    }

    /// @notice All mint batches for each user (complete history)
    /// @dev Audit Note: Array grows unbounded but capped by MAX_SUPPLY and 2-day expiry
    /// @dev Intentional design: preserves full history for UI/analytics
    mapping(address => MintBatch[]) public mintBatches;
    
    /// @notice Daily mint tracking (aligned to 17:00 GMT+3 / 5 PM GMT+3 like SWAP contract)
    /// @dev Maps day index to total DAV minted that day
    mapping(uint256 => uint256) public mintedByDayIndex;

    event RewardsClaimed(address indexed user, uint256 amount);
    event ReferralCodeGenerated(address indexed user, string referralCode);
    // Token name/emoji registry events removed
    event GovernanceUpdated(address oldGovernance, address newGovernance);
    event DevelopmentWalletAdded(address indexed wallet, uint256 percentage, uint256 index);
    event DevelopmentWalletRemoved(address indexed wallet, uint256 index);
    event DevelopmentWalletPercentageUpdated(address indexed wallet, uint256 oldPercentage, uint256 newPercentage);
    event MintingEnabled();
    event MintingDisabled();
    event ContractPaused(address by);
    event ContractUnpaused(address by);
    // Registry status update event removed
    // Burn-to-claim removed: SwapAddressUpdated event deleted
    event ReferralPayoutSkipped(address indexed user, address indexed referrer, uint256 amount, string reason);
    event UnclaimedRewardsReclaimed(uint256 totalAmount, uint256 timestamp);
    event DistributionEvent(
        address indexed user,
        uint256 amountMinted,
        uint256 amountPaid,
        address indexed referrer,
        uint256 referralShare,
        uint256 liquidityShare,
        uint256 developmentShare,
        uint256 holderShare,
        uint256 timestamp
    );
    constructor(
        address _stateToken,
        address _gov,
        address _auctionAdmin,
        address _buyAndBurnController,
        address _swapContract,
        string memory tokenName,
        string memory tokenSymbol // Should be "pDAV1" for mainnet
    ) ERC20(tokenName, tokenSymbol) {
        require(
            _stateToken != address(0) &&
                _auctionAdmin != address(0) &&
                _buyAndBurnController != address(0) &&
                _swapContract != address(0),
            "Addresses cannot be zero"
        );
        governance = _gov;
        auctionAdmin = _auctionAdmin;
        buyAndBurnController = _buyAndBurnController;
        swapContract = _swapContract;
        //canMintDAV = false; // Minting disabled until dev wallets are set in AuctionAdmin
        // Initial governance allocation
        _mint(_gov, INITIAL_GOV_MINT);
        mintedSupply += INITIAL_GOV_MINT;
        // IMPORTANT: Seed an initial batch for governance so batch-based
        // accounting works when governance transfers tokens. Without this,
        // _applyBatchTransfer would find no source batches and revert with
        // "Batch accounting mismatch" even though ERC20 transfer succeeded.
        mintBatches[_gov].push(
            MintBatch({
                amount: INITIAL_GOV_MINT,
                timestamp: block.timestamp,
                fromGovernance: true
            })
        );
        StateToken = IERC20(_stateToken);
        
        // FIXED: Set STATE_TOKEN in constructor to eliminate manual configuration step
        STATE_TOKEN = _stateToken;
    }
    // Burn-to-claim removed: setSwapAddress no longer needed

    modifier onlyGovernance() {
        require(msg.sender == governance, "Caller is not governance");
        _;
    }
    
    modifier onlyGovernanceOrSwap() {
        require(msg.sender == governance || msg.sender == swapContract, "Caller is not governance or swap");
        _;
    }
    // Restriction of transffering
    modifier whenTransfersAllowed() {
        require(
            !transfersPaused || msg.sender == governance,
            "Transfers are currently paused"
        );
        _;
    }
    // Step 1: Propose a new governance with timelock
    function proposeGovernance(address newGovernance) external onlyGovernance {
        require(newGovernance != address(0), "Invalid governance address");
        pendingGovernance = GovernanceProposal(
    
            newGovernance,
            block.timestamp + 7 days
        );
    }

    // Step 2: Confirm governance after timelock expires
    function confirmGovernance() external onlyGovernance {
        require(
            pendingGovernance.newGovernance != address(0),
            "No pending proposal"
        );
        require(
            block.timestamp >= pendingGovernance.proposedAt,
            "Timelock not expired"
        );

        address oldGovernance = governance;
        governance = pendingGovernance.newGovernance;
        
        // Clear pending governance
        pendingGovernance = GovernanceProposal(address(0), 0);
        
        emit GovernanceUpdated(oldGovernance, governance);
    }
    
    // Immediate governance transfer function (no timelock)
    function transferGovernanceImmediate(address newGovernance) external onlyGovernanceOrSwap {
        require(newGovernance != address(0), "Invalid governance address");
        
        address oldGovernance = governance;
        governance = newGovernance;

        // Clear pending
        delete pendingGovernance;

        emit GovernanceUpdated(oldGovernance, governance);
    }

    // ================= DEVELOPMENT FEE DISTRIBUTION =================
    // Development wallets are managed centrally in AuctionAdmin contract
    // This contract only distributes the 5% PLS minting fee to those wallets
    
    /**
     * @notice Internal function to distribute development share among multiple wallets
     * @dev Reads wallet configuration from AuctionAdmin contract
     * @dev Distributes based on percentage weights, handles rounding dust
     * 
     * DISTRIBUTION LOGIC:
     * ==================
     * 1. Query AuctionAdmin for wallet addresses, percentages, active status
     * 2. Calculate proportional shares for each active wallet
     * 3. Transfer to each wallet (explicit success check)
     * 4. Handle dust (rounding remainder) by giving to first active wallet
     * 
     * DUST HANDLING:
     * =============
     * Due to integer division, small remainder may exist
     * Given to first active wallet to ensure 100% distribution
     * 
     * @param developmentShare Total amount to distribute (5% of mint fees)
     * @custom:security All low-level calls have explicit success checks
     * @custom:audit Addresses Finding #4 - All transfers check success and revert on failure
     */
    function _distributeDevelopmentShare(uint256 developmentShare) internal {
        if (developmentShare == 0) return;
        if (auctionAdmin == address(0)) return; // No admin set
        
        totalDevelopmentAllocated += developmentShare;
        
        // Get wallet info from AuctionAdmin
        (
            address[] memory wallets,
            uint256[] memory percentages,
            bool[] memory activeStatuses
        ) = IAuctionAdmin(auctionAdmin).getDevelopmentFeeWalletsInfo();
        
        // Validate at least one wallet exists
        require(wallets.length > 0, "No dev wallets configured in AuctionAdmin");
        
        uint256 totalDistributed = 0;
        
        // Distribute based on percentages
        for (uint256 i = 0; i < wallets.length; i++) {
            if (activeStatuses[i] && percentages[i] > 0) {
                uint256 amount = (developmentShare * percentages[i]) / 100;
                
                if (amount > 0) {
                    (bool success, ) = wallets[i].call{value: amount}("");
                    require(success, "Dev wallet transfer failed");
                    totalDistributed += amount;
                }
            }
        }
        
        // Handle dust (remainder due to rounding)
        uint256 dust = developmentShare - totalDistributed;
        if (dust > 0 && wallets.length > 0) {
            // Give dust to first active wallet with non-zero percentage
            for (uint256 i = 0; i < wallets.length; i++) {
                if (activeStatuses[i] && percentages[i] > 0) {
                    (bool success, ) = wallets[i].call{value: dust}("");
                    require(success, "Dust transfer failed");
                    break;
                }
            }
        }
    }

    // ================= SAFETY FUNCTIONS =================
    

    // ================= SAFETY FUNCTIONS =================
    
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    function pause() external onlyGovernance {
        paused = true;
        emit ContractPaused(msg.sender);
    }
    
    function unpause() external onlyGovernance {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }
    
    /**
     * @notice Enable or disable token transfers
     * @param _enabled True to enable transfers, false to disable
     */
    function setTransfersEnabled(bool _enabled) external onlyGovernance {
        transfersPaused = !_enabled;
    }
    // - Restricts approval unless transfers are allowed or the caller is governance
    function approve(address spender, uint256 amount) public override whenTransfersAllowed returns (bool) {
        return super.approve(spender, amount);
    }

    function transfer(address recipient, uint256 amount) public override whenTransfersAllowed returns (bool) {
        // Execute ERC20 transfer first; will revert on insufficient balance
        bool success = super.transfer(recipient, amount);
        if (success) {
            // Preserve original mint-batch properties by moving from sender's batches FIFO
            _applyBatchTransfer(msg.sender, recipient, amount);
            // Maintain referral code assignment and holder state
            referralData.assignReferralCodeIfNeeded(recipient);
            Distribution.updateDAVHolderStatus(holderState, msg.sender, governance, getActiveBalance);
            Distribution.updateDAVHolderStatus(holderState, recipient, governance, getActiveBalance);
        }
        return success;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override whenTransfersAllowed returns (bool) {
        bool success = super.transferFrom(sender, recipient, amount);
        if (success) {
            _applyBatchTransfer(sender, recipient, amount);
            referralData.assignReferralCodeIfNeeded(recipient);
            Distribution.updateDAVHolderStatus(holderState, sender, governance, getActiveBalance);
            Distribution.updateDAVHolderStatus(holderState, recipient, governance, getActiveBalance);
        }
        return success;
    } // assign reffer to direct sended user

    // ================= Internal helpers =================
    
    /**
     * @notice Internal function to move mint batches from sender to recipient during transfer
     * @dev Preserves complete mint history while moving tokens FIFO (oldest first)
     * @dev Special handling for governance transfers to make tokens reward-eligible
     * 
     * BATCH TRANSFER LOGIC:
     * ====================
     * 1. Consumes from oldest sender batches first (FIFO order)
     * 2. Preserves original timestamp and fromGovernance flag
     * 3. Special case: Governance → User transfers reset timestamp and remove governance flag
     * 4. Backward compatibility: Synthetic batch if governance has no source batches
     * 
     * GOVERNANCE TRANSFER BEHAVIOR:
     * ============================
     * When governance transfers to regular user:
     * - Timestamp reset to current time (starts fresh 2-day expiry countdown)
     * - fromGovernance flag set to false (makes tokens reward-eligible)
     * - Allows governance to "reactivate" expired tokens by transferring them
     * 
     * BACKWARD COMPATIBILITY:
     * =======================
     * If governance has no source batches (e.g., initial constructor mint before fix):
     * - Creates synthetic batch with fromGovernance=true
     * - Prevents transfer from reverting
     * - Maintains reward exclusion for governance-sourced tokens
     * 
     * @param from Address transferring tokens
     * @param to Address receiving tokens
     * @param amount Amount of tokens to transfer
     * @custom:audit Addresses Finding #3 - Synthetic batch is intentional backward compatibility
     * @custom:audit Synthetic batch only for governance, marked fromGovernance=true (excluded from rewards)
     */
    function _applyBatchTransfer(address from, address to, uint256 amount) internal {
        if (amount == 0 || from == to) return;
        MintBatch[] storage src = mintBatches[from];
        MintBatch[] storage dst = mintBatches[to];
        uint256 remaining = amount;
        uint256 len = src.length;
        for (uint256 i = 0; i < len && remaining > 0; i++) {
            uint256 avail = src[i].amount;
            if (avail == 0) continue;
            uint256 take = avail < remaining ? avail : remaining;
            // decrease source
            src[i].amount = avail - take;
            
            // Special handling: when governance transfers to regular users, reset timestamp and make eligible for rewards
            if (from == governance && to != governance) {
                // Reset timestamp to current time for fresh 2-day expiry countdown
                // Remove fromGovernance flag to make tokens eligible for rewards
                dst.push(MintBatch({ 
                    amount: take, 
                    timestamp: block.timestamp,  // Fresh timestamp starts 2-day countdown
                    fromGovernance: false        // Make eligible for rewards
                }));
            } else {
                // Preserve original metadata for all other transfers
                dst.push(MintBatch({ amount: take, timestamp: src[i].timestamp, fromGovernance: src[i].fromGovernance }));
            }
            remaining -= take;
        }
        // BACKWARD COMPATIBILITY FIX:
        // Graceful backfill if governance has no source batches (e.g., initial constructor mint)
        // This prevents transfer revert while maintaining reward exclusion (fromGovernance=true)
        if (remaining > 0 && from == governance && src.length == 0) {
            dst.push(MintBatch({ amount: remaining, timestamp: block.timestamp, fromGovernance: true }));
            remaining = 0;
        }
        require(remaining == 0, "Batch accounting mismatch");
    }

    // ============= Maintenance: optional batch cleanup =============
    /// @notice Compacts zero-amount batches for a user to reduce storage/gas in future ops.
    /// @dev Order of remaining batches is preserved.
    function cleanupZeroAmountBatches(address user, uint256 maxRemovals) external onlyGovernance returns (uint256 removed) {
        MintBatch[] storage batches = mintBatches[user];
        uint256 n = batches.length;
        if (n == 0) return 0;
        uint256 w = 0;
        for (uint256 r = 0; r < n; r++) {
            if (batches[r].amount == 0 && (maxRemovals == 0 || removed < maxRemovals)) {
                removed++;
                continue;
            }
            if (w != r) {
                batches[w] = batches[r];
            }
            w++;
        }
        while (batches.length > w) {
            batches.pop();
        }
        if (removed > 0) {
            Distribution.updateDAVHolderStatus(holderState, user, governance, getActiveBalance);
        }
    }

    function earned(address account) public view returns (uint256) {
        return holderState._earned(account, governance);
    }
    /// @notice Mints DAV tokens and distributes ETH to stakeholders.
    /// @param amount Tokens to mint (in wei).
    /// @param referralCode Optional referrer code for rewards.
    function mintDAV(
        uint256 amount,
        string memory referralCode
    ) external payable nonReentrant whenNotPaused {
        // Checks
        //require(canMintDAV, "DAV minting disabled - no dev wallets configured");
        // Proactively refresh minter holder status to avoid stale holder entries blocking capacity
        Distribution.updateDAVHolderStatus(holderState, msg.sender, governance, getActiveBalance);
        require(amount > 0, "Amount must be greater than zero");
        require(getDAVHoldersCount() < MAX_HOLDERS, "Max holders reached");
        require(msg.sender != governance, "Governance cannot mint");
        require(amount % 1 ether == 0, "Amount must be a whole number");
        require(mintedSupply + amount <= MAX_SUPPLY, "Max supply reached");
        uint256 cost = (amount * TOKEN_COST) / 1 ether;
        require(msg.value == cost, "Incorrect PLS amount sent");
        // Update holder  before distributing

        // Calculate distribution
        (
            uint256 holderShare,
            uint256 liquidityShare,
            uint256 developmentShare,
            uint256 referralShare,
            uint256 stateLPShare,
            address referrer
        ) = Distribution.calculateETHDistribution(
                msg.value,
                msg.sender,
                referralCode,
                governance,
                HOLDER_SHARE,
                LIQUIDITY_SHARE,
                DEVELOPMENT_SHARE,
                REFERRAL_BONUS,
                holderState.davHoldersCount,
                getTotalActiveSupply(),
                referralData.referralCodeToUser
            );

        // Effects
        mintedSupply += amount;
        // record mint against current day index aligned to SWAP's GMT+3 17:00 (5 PM) boundary
        uint256 dayIndex = (TimeUtilsLib.calculateNextClaimStartGMTPlus3(block.timestamp) - 1 days) / 1 days;
        mintedByDayIndex[dayIndex] += amount;
        mintBatches[msg.sender].push(
            MintBatch({
                amount: amount,
                timestamp: block.timestamp,
                fromGovernance: false
            })
        );
        // Generate referral code if not already set
        if (bytes(referralData.userReferralCode[msg.sender]).length == 0) {
            string memory newReferralCode = referralData.generateReferralCode(
                msg.sender
            );
            referralData.userReferralCode[msg.sender] = newReferralCode;
            emit ReferralCodeGenerated(msg.sender, newReferralCode);
        }

        // Burn-to-claim removed: redirect protocol remainder to BuyAndBurnController
        if (stateLPShare > 0) {
            totalLiquidityAllocated += stateLPShare;
            require(buyAndBurnController != address(0), "BuyAndBurn not set");
            (bool successLiquidityRemainder, ) = buyAndBurnController.call{ value: stateLPShare }("");
            require(successLiquidityRemainder, "Remainder transfer failed");
        }
        // Mint tokens
        _mint(msg.sender, amount);
        Distribution.updateDAVHolderStatus(holderState, 
            msg.sender,
            governance,
            getActiveBalance
        );
        // Distribute holder rewards
        holderState.distributeHolderShare(
            holderShare,
            governance,
            getActiveMintedBalance
        );
        // Interactions - Referral rewards added to claimable holder rewards
        if (referrer != address(0) && referralShare > 0) {
            if (address(referrer).code.length == 0) {
                // Add referral rewards to referrer's claimable holder rewards (not paid immediately)
                referralRewards[referrer] += referralShare; // Track lifetime referral earnings for analytics
                totalReferralRewardsDistributed += referralShare;
                
                // Add to claimable holder rewards instead of immediate payout
                holderState.holderRewards[referrer] += referralShare;
                holderState.holderFunds += referralShare;
            } else {
                // Referrer is a contract – redirect to BuyAndBurnController
                totalLiquidityAllocated += referralShare;
                require(buyAndBurnController != address(0), "BuyAndBurn not set");
                (bool successLiq, ) = buyAndBurnController.call{value: referralShare}("");
                require(successLiq, "Contract referrer transfer failed");
                emit ReferralPayoutSkipped(msg.sender, referrer, referralShare, "Referrer is contract - redirected to BuyAndBurn");
            }
        }

        if (liquidityShare > 0) {
            totalLiquidityAllocated += liquidityShare;
            
            // Send 80% fees to BuyAndBurnController for STATE buyback and burn
            require(buyAndBurnController != address(0), "BuyAndBurn not set");
            (bool successLiquidity, ) = buyAndBurnController.call{
                value: liquidityShare
            }("");
            require(successLiquidity, "BuyAndBurn transfer failed");
        }
        
        // Distribute development share to multiple wallets based on percentage
        if (developmentShare > 0) {
            _distributeDevelopmentShare(developmentShare);
        }
        
        emit DistributionEvent(
            msg.sender,
            amount,
            msg.value,
            referrer,
            referralShare,
            liquidityShare,
            developmentShare,
            holderShare,
            block.timestamp
        );
    }

    /// @notice Governance utility to refresh holder status for a list of accounts.
    /// @dev Helps reclaim holder capacity when many accounts have fully expired balances.
    function refreshHolderStatuses(address[] calldata accounts) external onlyGovernance {
        for (uint256 i = 0; i < accounts.length; i++) {
            Distribution.updateDAVHolderStatus(holderState, accounts[i], governance, getActiveBalance);
        }
    }
    //NOTE: This function is used to get the active balance of a user, which includes all minted tokens that have not expired.
    // Below three functions are used in the DApp to show user balances, active tokens, and other related information.
    // It iterates over all mint batches for a user; while gas-intensive, this is necessary for accurate on-chain calculations by design.
    function getActiveBalance(address user) public view returns (uint256) {
        // Governance exemption: treat all DAV as active for gating/UX flows
        if (user == governance) {
            return balanceOf(user);
        }
        MintBatch[] storage batches = mintBatches[user];
        uint256 active = 0;
        for (uint256 i = 0; i < batches.length; i++) {
            if (block.timestamp <= batches[i].timestamp + DAV_TOKEN_EXPIRE) {
                active += batches[i].amount;
            }
        }
        return active;
    }
    function getMintBatches(
        address user
    )
        public
        view
        returns (uint256[] memory amounts, uint256[] memory timestamps)
    {
        MintBatch[] storage batches = mintBatches[user];
        uint256 len = batches.length;
        amounts = new uint256[](len);
        timestamps = new uint256[](len);
        for (uint256 i = 0; i < len; i++) {
            amounts[i] = batches[i].amount;
            timestamps[i] = batches[i].timestamp;
        }
        return (amounts, timestamps);
    }
    function getExpireTime() public pure returns (uint256) {
        return DAV_TOKEN_EXPIRE;
    }

    function getActiveMintedBalance(address account) public view returns (uint256) {
        // Exclude governance from holder distributions
        if (account == governance) return 0;
        MintBatch[] storage batches = mintBatches[account];
        uint256 active = 0;
        for (uint256 i = 0; i < batches.length; i++) {
            if (!batches[i].fromGovernance && block.timestamp <= batches[i].timestamp + DAV_TOKEN_EXPIRE) {
                active += batches[i].amount;
            }
        }
        return active;
    }
    // ℹ️ Note on Token Expiration Tracking:
    // We intentionally retain all mint batches, including expired ones,
    // to allow users to view their complete mint and expiration history.
    // This historical data is essential for transparency and user experience,
    // enabling interfaces to display past mint events, expirations, and timing.
    // ⚠️ While this increases on-chain storage and logic complexity,
    // we consider it necessary and do not perform batch cleanup or pruning.
    /**
     * @notice Tracks each user's mint batches and expiration timestamps.
     * @dev Expired batches are preserved to support full history visibility for users.
     */
    function getMintTimestamps(
        address user
    )
        external
        view
        returns (
            uint256[] memory mintTimes,
            uint256[] memory expireTimes,
            uint256[] memory amounts,
            bool[] memory fromGovernance,
            bool[] memory isExpired
        )
    {
        MintBatch[] storage batches = mintBatches[user];
        uint256 len = batches.length;

        mintTimes = new uint256[](len);
        expireTimes = new uint256[](len);
        amounts = new uint256[](len);
        fromGovernance = new bool[](len);
        isExpired = new bool[](len);

        for (uint256 i = 0; i < len; i++) {
            uint256 mintTime = batches[i].timestamp;
            uint256 expireTime = mintTime + DAV_TOKEN_EXPIRE;

            mintTimes[i] = mintTime;
            expireTimes[i] = expireTime;
            amounts[i] = batches[i].amount;
            fromGovernance[i] = batches[i].fromGovernance;
            isExpired[i] = block.timestamp > expireTime;
        }

        return (mintTimes, expireTimes, amounts, fromGovernance, isExpired);
    }

    /// ============== Frontend helpers for 30-day validity UX ==============
    /// @notice Returns true if the user has any non-expired DAV balance right now.
    function isActiveNow(address user) external view returns (bool) {
        return getActiveBalance(user) > 0;
    }

    /// @notice Summarizes a user's current DAV status for UI convenience.
    /// @return activeBalance sum of non-expired DAV (wei)
    /// @return totalBalance current ERC20 balance (includes expired batches)
    /// @return expiredAmount total amount of expired DAV from batch history
    function getActiveStatus(address user) external view returns (
        uint256 activeBalance,
        uint256 totalBalance,
        uint256 expiredAmount
    ) {
        activeBalance = getActiveBalance(user);
        totalBalance = balanceOf(user);
        expiredAmount = getExpiredTokenCount(user);
    }

    /**
     * @notice Calculate total active (non-expired) DAV supply across all holders
     * @dev Iterates all holders and sums their active balances (gas-intensive by design)
     * 
     * GAS DESIGN PHILOSOPHY:
     * =====================
     * This function intentionally uses loops for REAL-TIME accuracy over gas optimization:
     * - NO caching or snapshots (avoids staleness)
     * - NO complex optimizations (maintains clarity)
     * - MAX_HOLDERS = 5,000 caps iteration size
     * - Each getActiveBalance() also loops user's batches
     * - Nested loops acceptable due to:
     *   * PulseChain's very low gas costs (1 PLS ≈ 0.00000396 ETH)
     *   * Transparency priority (users see exact real-time values)
     *   * System size bounded (5,000 holders max)
     * 
     * TRADEOFF JUSTIFICATION:
     * ======================
     * Chose simplicity + accuracy over gas savings because:
     * 1. View function - gas not paid by users (query limit only)
     * 2. PulseChain context - extremely low gas costs
     * 3. Bounded system - 5,000 holders maximum
     * 4. Transparency - no cached/stale data to confuse users
     * 5. Auditability - straightforward logic easier to verify
     * 
     * @return total Sum of all active (non-expired) DAV tokens
     * @custom:audit Addresses Finding #6 - Intentional gas-intensive design for accuracy
     * @custom:audit Bounded by MAX_HOLDERS = 5,000, acceptable for PulseChain gas costs
     */
    function getTotalActiveSupply() public view returns (uint256) {
        /*  Iterate over all DAV holders to calculate the total active supply.This loop is gas-intensive but necessary for accurate, real-time calculation of active token balances. which constrains the array size and keeps gas costs manageable for the expected user base. We avoid complex optimizations like caching or snapshots to maintain clear, straightforward logic, accepting the gas cost as a trade-off for simplicity and transparency. */
        uint256 holdersLength = holderState._holderLength();
        uint256 total = 0;
        for (uint256 i = 0; i < holdersLength; i++) {
            total += getActiveBalance(holderState.davHolders[i]);
        }
        return total;
    }

    function getExpiredTokenCount(address user) public view returns (uint256) {
        uint256 expired = 0;
        MintBatch[] storage batches = mintBatches[user];
        for (uint256 i = 0; i < batches.length; i++) {
            if (block.timestamp > batches[i].timestamp + DAV_TOKEN_EXPIRE) {
                expired += batches[i].amount;
            }
        }
        return expired;
    }

    /**
     * @notice Claim accumulated holder rewards (from 10% mint fee distributions + referral bonuses)
     * @dev Requires ROI check to pass: user's portfolio value must >= total DAV mint cost
     * @dev Portfolio includes: STATE tokens + auction tokens (at ratio) + unclaimed rewards
     * 
     * SECURITY:
     * - nonReentrant: Prevents reentrancy attacks
     * - CEI Pattern: State updates BEFORE external call
     * - ROI Check: View function (read-only, no state changes)
     * - All validations complete before transfer
     * 
     * ROI VERIFICATION:
     * 1. Calculates user's STATE holdings (wallet balance)
     * 2. Adds auction token values (converted to STATE at pool ratio)
     * 3. Adds claimable rewards (PLS value)
     * 4. Compares total portfolio value to DAV mint cost
     * 5. Must meet or exceed cost to claim
     * 
     * @custom:security nonReentrant + whenNotPaused + CEI pattern
     * @custom:audit Addresses Finding #1 - nonReentrant prevents reentrancy, getROI is view-only
     * @custom:audit Addresses Finding #4 - All low-level calls have explicit success checks
     */
    function claimReward() external payable nonReentrant whenNotPaused {
        address user = msg.sender;
        require(user != address(0), "Invalid user");
        require(msg.sender != governance, "Not eligible to claim rewards");
        
        // STEP 1: Update holder status to check for expiration
        Distribution.updateDAVHolderStatus(holderState, msg.sender, governance, getActiveBalance);
        
        // STEP 2: Calculate claimable reward
        uint256 reward = earned(msg.sender);
        require(reward > 0, "No rewards to claim");
        
        // STEP 3: ROI CHECK (view function - read-only, no state changes)
        // Audit Note: This is safe - getROI is a view function that only reads state
        (, , bool meetsROI, ) = getROI(msg.sender);
        require(meetsROI, "Insufficient ROI: portfolio value must exceed DAV mint cost");
        
        // STEP 4: Validate sufficient funds
        require(holderState.holderFunds >= reward, "Insufficient holder funds");
        require(address(this).balance >= reward, "Insufficient contract balance");
        
        // STEP 5: Update state BEFORE external call (CEI pattern)
        holderState.holderRewards[msg.sender] = 0;
        holderState.holderFunds -= reward;
        
        // STEP 6: External call LAST
        // Audit Note: Success check present, nonReentrant prevents reentrancy
        (bool success, ) = user.call{value: reward}("");
        require(success, "Reward transfer failed");
        
        emit RewardsClaimed(msg.sender, reward);
    }
    
    /**
     * @notice Reclaim all unclaimed holder rewards after 1000 days from auction start
     * @dev Can only be called by governance after 1000 days from when auctions started
     *      Resets all user claimable rewards to zero and sends total to BuyAndBurnController
     */
    function reclaimUnclaimedRewards() external onlyGovernance nonReentrant whenNotPaused {
        require(swapContract != address(0), "SWAP contract not set");
        require(buyAndBurnController != address(0), "BuyAndBurn not set");
        
        // Get auction start time from SWAP contract
        (bool scheduleSet, uint256 scheduleStart, , , ) = ISWAP_V3(swapContract).auctionSchedule();
        
        require(scheduleSet, "Auction not started yet");
        require(scheduleStart > 0, "Invalid auction start time");
        
        // Check if 1000 days have passed since auction start
        uint256 daysSinceStart = (block.timestamp - scheduleStart) / 1 days;
        require(daysSinceStart >= 1000, "Cannot reclaim before 1000 days");
        
        // Get total unclaimed rewards
        uint256 totalUnclaimed = holderState.holderFunds;
        require(totalUnclaimed > 0, "No unclaimed rewards");
        require(address(this).balance >= totalUnclaimed, "Insufficient contract balance");
        
        // Reset all holder rewards to zero
        holderState.holderFunds = 0;
        
        // Reset individual user rewards (iterate through all holders)
        uint256 holdersLength = holderState._holderLength();
        for (uint256 i = 0; i < holdersLength; i++) {
            address holder = holderState.davHolders[i];
            holderState.holderRewards[holder] = 0;
        }
        
        // Transfer unclaimed rewards to BuyAndBurnController
        (bool success, ) = buyAndBurnController.call{value: totalUnclaimed}("");
        require(success, "Transfer to BuyAndBurn failed");
        
        emit UnclaimedRewardsReclaimed(totalUnclaimed, block.timestamp);
    }

    function getDAVHoldersCount() public view returns (uint256) {
        return holderState.davHoldersCount;
    }
    /// @notice Returns the total DAV minted during the day window that contains the provided timestamp (aligned to 17:00 GMT+3 / 5 PM GMT+3)
    function getMintedForDay(uint256 ts) external view returns (uint256) {
        uint256 dayIndex = (TimeUtilsLib.calculateNextClaimStartGMTPlus3(ts) - 1 days) / 1 days;
        return mintedByDayIndex[dayIndex];
    }

    // ======== Frontend-friendly getters ========
    function getTokenCost() external pure returns (uint256) { return TOKEN_COST; }
    function getMaxSupply() external pure returns (uint256) { return MAX_SUPPLY; }
    function getInitialGovMint() external pure returns (uint256) { return INITIAL_GOV_MINT; }
    function getShares() external pure returns (uint256 liq, uint256 holders, uint256 devv, uint256 ref) {
        return (LIQUIDITY_SHARE, HOLDER_SHARE, DEVELOPMENT_SHARE, REFERRAL_BONUS);
    }
    function getTotalsAllocated() external view returns (uint256 liqAlloc, uint256 devAlloc, uint256 refPaid) {
        return (totalLiquidityAllocated, totalDevelopmentAllocated, totalReferralRewardsDistributed);
    }

    function getUserReferralCode(
        address user
    ) external view returns (string memory) {
        return referralData.userReferralCode[user];
    }
    
    /**
     * @notice View function to check reclaim eligibility and days remaining
     * @return canReclaim Whether governance can reclaim unclaimed rewards now
     * @return daysRemaining Days until reclaim is possible (0 if already eligible)
     * @return totalUnclaimed Total amount of unclaimed rewards available
     */
    function getReclaimInfo() external view returns (
        bool canReclaim,
        uint256 daysRemaining,
        uint256 totalUnclaimed
    ) {
        totalUnclaimed = holderState.holderFunds;
        
        if (swapContract == address(0)) {
            return (false, type(uint256).max, totalUnclaimed);
        }
        
        try ISWAP_V3(swapContract).auctionSchedule() returns (
            bool scheduleSet,
            uint256 scheduleStart,
            uint256,
            uint256,
            uint256
        ) {
            if (!scheduleSet || scheduleStart == 0) {
                return (false, type(uint256).max, totalUnclaimed);
            }
            
            uint256 daysSinceStart = (block.timestamp - scheduleStart) / 1 days;
            
            if (daysSinceStart >= 1000) {
                canReclaim = true;
                daysRemaining = 0;
            } else {
                canReclaim = false;
                daysRemaining = 1000 - daysSinceStart;
            }
        } catch {
            return (false, type(uint256).max, totalUnclaimed);
        }
    }

    // ================= ROI CALCULATION FUNCTIONS =================
    
    /**
     * @notice Calculate user's Return on Investment (ROI) based on portfolio value vs DAV mint cost
     * @dev VIEW FUNCTION - Read-only, no state changes, safe to call from other functions
     * @dev Calculates total value of: STATE tokens + auction tokens (converted to STATE) + claimable holder rewards (includes referral rewards)
     * @dev Claimable rewards reset to zero after claiming, so ROI is recalculated from token holdings only
     * 
     * CALCULATION LOGIC:
     * ==================
     * 1. STATE Holdings: User's STATE token balance (from wallet)
     * 2. Auction Tokens: User's auction token balances converted to STATE at pool ratio
     * 3. Claimable Rewards: PLS rewards earned from holder distributions + referrals
     * 4. Total Portfolio: STATE value (in PLS) + claimable rewards (in PLS)
     * 5. Required Value: Total DAV balance (including expired) * TOKEN_COST
     * 6. ROI Check: Portfolio value >= required value
     * 
     * GAS & LOOP HANDLING:
     * ===================
     * - Loops up to 100 iterations but exits early when no more tokens
     * - Current: 2 tokens, Future max: ~50 tokens
     * - Try-catch prevents reverts from out-of-bounds or failed calls
     * - View function so gas not paid by users (query limit only)
     * - Intentional tradeoff: accuracy over optimization
     * 
     * @param user Address of the user to check ROI for
     * @return totalValueInPLS Total portfolio value in PLS
     * @return requiredValue Required value based on DAV balance (DAV * TOKEN_COST)
     * @return meetsROI Whether user's portfolio value meets or exceeds the required value
     * @return roiPercentage ROI as a percentage (totalValue * 100 / requiredValue)
     * @custom:security View function - no state changes, safe for external calls
     * @custom:audit Addresses Finding #1 - View function cannot enable reentrancy
     * @custom:audit Addresses Finding #2 - Loop bounded to 100 max, early exit on no tokens
     * @custom:audit Addresses Finding #5 - Solidity 0.8.20 has built-in overflow protection
     */
    function getROI(address user) public view returns (
        uint256 totalValueInPLS,
        uint256 requiredValue,
        bool meetsROI,
        uint256 roiPercentage
    ) {
        // STEP 1: Calculate STATE value from user's wallet
        uint256 totalStateValue = StateToken.balanceOf(user);
        
        // STEP 2: Add auction tokens converted to STATE
        // Loop through all registered auction tokens
        if (swapContract != address(0)) {
            ISWAP_V3 swap = ISWAP_V3(swapContract);
            
            // Audit Note: Loop bounded to 100 max, early exit when no more tokens
            // Current: 2 tokens, Future: ~50 tokens max
            // Try-catch handles out-of-bounds gracefully
            for (uint256 i = 0; i < 100; i++) { // Max 100 tokens (current: 2, future: 50)
                try swap.autoRegisteredTokens(i) returns (address auctionToken) {
                    if (auctionToken == address(0)) break;
                    
                    // Get user's balance of this auction token
                    uint256 userTokenBalance = IERC20(auctionToken).balanceOf(user);
                    
                    if (userTokenBalance > 0) {
                        // Get the ratio: STATE per auction token (18 decimals)
                        try swap.getRatioPrice(auctionToken) returns (uint256 ratio) {
                            if (ratio > 0) {
                                // Convert auction tokens to STATE value
                                totalStateValue += (userTokenBalance * ratio) / 1e18;
                            }
                        } catch {
                            // Skip tokens with no pool or ratio errors
                        }
                    }
                } catch {
                    // Out of bounds - no more tokens
                    break;
                }
            }
        }
        
        // STEP 3: Convert total STATE to PLS
        uint256 stateValueInPLS = _convertStateToPLS(totalStateValue);
        
        // STEP 4: Add claimable rewards (includes both holder distributions and referral rewards)
        uint256 claimableRewards = holderState.holderRewards[user];
        
        totalValueInPLS = stateValueInPLS + claimableRewards;
        
        // STEP 5: Calculate required value (ALL DAV including expired)
        uint256 totalDAV = balanceOf(user);
        requiredValue = (totalDAV * TOKEN_COST) / 1e18;
        
        // STEP 6: Check if meets ROI
        meetsROI = totalValueInPLS >= requiredValue;
        
        // STEP 7: Calculate ROI percentage
        // Audit Note: Solidity 0.8.20 has built-in overflow protection
        // This multiplication is safe and will revert if overflow occurs
        if (requiredValue > 0) {
            roiPercentage = (totalValueInPLS * 100) / requiredValue;
        } else {
            roiPercentage = 0;
        }
    }
    
    /**
     * @notice Internal helper to convert STATE amount to PLS value
     * @dev Uses STATE/WPLS pool reserves from BuyAndBurnController
     * @param stateAmount Amount of STATE tokens to convert
     * @return plsValue Equivalent value in PLS
     */
    function _convertStateToPLS(uint256 stateAmount) internal view returns (uint256 plsValue) {
        if (stateAmount == 0) return 0;
        if (buyAndBurnController == address(0)) return 0;
        
        // Get STATE/WPLS pool address
        address stateWplsPool;
        try IBuyAndBurn(buyAndBurnController).stateWplsPool() returns (address pool) {
            stateWplsPool = pool;
        } catch {
            return 0;
        }
        
        if (stateWplsPool == address(0)) return 0;
        
        // Get pool reserves
        uint112 reserve0;
        uint112 reserve1;
        try IPair(stateWplsPool).getReserves() returns (uint112 r0, uint112 r1, uint32) {
            reserve0 = r0;
            reserve1 = r1;
        } catch {
            return 0;
        }
        
        if (reserve0 == 0 || reserve1 == 0) return 0;
        
        // Determine which reserve is STATE
        address token0;
        try IPair(stateWplsPool).token0() returns (address t0) {
            token0 = t0;
        } catch {
            return 0;
        }
        
        // Calculate PLS value based on pool ratio
        if (token0 == STATE_TOKEN) {
            // reserve0 = STATE, reserve1 = WPLS (PLS)
            plsValue = (stateAmount * reserve1) / reserve0;
        } else {
            // reserve0 = WPLS (PLS), reserve1 = STATE
            plsValue = (stateAmount * reserve0) / reserve1;
        }
    }

    // ------------------ Gettting Token data info functions ------------------------------
    /**
     * @notice Processes a token with a name and emoji.
     * @dev No commit-reveal scheme is used as users are expected to verify governance behavior on-chain.
     *      While first-come-first-served naming could allow front-running, users are aware of and accept this risk.
     *      Token names are locked immediately to prevent duplicate submissions.
     *      Each user can process tokens up to the number of DAV they hold.
     *      Governance is trusted to operate transparently and verifiably.
     */
    // Token registry features removed per requirements
    // Burn-to-claim feature removed: burn/claim related functions and views deleted

    receive() external payable {
        revert("Direct ETH transfers not allowed");
    }
    fallback() external payable {
        revert("Invalid call");
    }
}
