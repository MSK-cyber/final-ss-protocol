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
import "./interfaces/IPulseXRouter02.sol";
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
 * @title DAV_V3 - Decentralized Auction Voucher Token
 * @author State Protocol Team
 * @notice Time-limited voucher tokens (30-day expiry) granting access to State Protocol auctions
 * @dev Implements token economics with referral system, holder rewards, ROI-based claims, and batch tracking
 *
 * @custom:features
 * - Time-Limited Access: 30-day expiry from mint (refreshed on governance transfers)
 * - Holder Rewards: 10% of mint fees distributed proportionally to active DAV holders
 * - Referral System: 5% bonus added to referrer's claimable rewards
 * - ROI Verification: Portfolio value must meet or exceed DAV mint cost to claim rewards
 * - Buy & Burn: 80% of mint fees sent to BuyAndBurnController for STATE buyback
 * - Batch Tracking: Complete mint/expiry history preserved for transparency
 *
 * @custom:architecture
 * - Solidity 0.8.20 with built-in overflow/underflow protection
 * - OpenZeppelin: ERC20, Ownable, ReentrancyGuard, SafeERC20
 * - Libraries: Distribution, ReferralCodeLib, TimeUtilsLib
 * - External: SWAP_V3, AuctionAdmin, BuyAndBurnController
 *
 * @custom:design-philosophy
 * Intentionally prioritizes transparency and accuracy over gas optimization:
 * - Real-time calculations via iteration (no caching)
 * - Complete mint history preserved (including expired batches)
 * - Bounded by MAX_HOLDERS = 2,500 wallets
 * - PulseChain context: extremely low gas costs (1 PLS ≈ 0.00000396 ETH)
 *
 * @custom:workflow
 * 1. User mints DAV by paying 1,500,000 PLS per token
 * 2. Funds distributed: 80% buyback, 10% holders, 5% dev, 5% referral
 * 3. DAV expires after 30 days (refreshed if transferred from governance)
 * 4. Holders accumulate rewards from subsequent mints
 * 5. Claim rewards after ROI check (portfolio value >= DAV cost)
 * 6. After 1000 days, governance can reclaim unclaimed rewards
 *
 * @custom:security
 * - ReentrancyGuard on all state-changing functions
 * - Pausable transfers (governance emergency control)
 * - Multi-sig governance
 * - Explicit success checks on all low-level calls
 * - Solidity 0.8.20 automatic overflow protection
 */
contract DAV_V3 is
    ERC20,
    Ownable,
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
    /// @dev Hard cap prevents unlimited inflation - enforced in mintDAV() function
    ///      Total available for public minting: 9,998,000 DAV (MAX_SUPPLY - INITIAL_GOV_MINT)
    uint256 public constant MAX_SUPPLY = 10000000 ether;
    
    /// @notice Maximum number of unique DAV holders allowed
    /// @dev Caps system size to keep gas costs manageable for iteration-based calculations
    ///      All holder loops are bounded by this constant to prevent unbounded gas consumption
    ///      Enforced in mintDAV() and Distribution.updateDAVHolderStatus()
    uint256 public constant MAX_HOLDERS = 2500;
    
    /// @notice Cost to mint 1 DAV token in PLS
    /// @dev PulseChain native token: 1 PLS ≈ 0.00000396 ETH
    ///      Cost is 1,500,000 PLS per DAV token minted
    uint256 public constant TOKEN_COST = 1500000 ether;
    
    /// @notice Referral bonus percentage (5% of mint fees)
    /// @dev Added to referrer's claimable holder rewards (not immediately distributed)
    ///      Referrer must have active DAV to claim accumulated rewards
    uint256 public constant REFERRAL_BONUS = 5;
    
    /// @notice Liquidity/buyback share percentage (80% of mint fees)
    /// @dev Sent to BuyAndBurnController for STATE token buyback and burn operations
    ///      This is the primary mechanism for creating STATE demand and reducing supply
    uint256 public constant LIQUIDITY_SHARE = 80;
    
    /// @notice Development share percentage (5% of mint fees)
    /// @dev Distributed proportionally to dev wallets registered in AuctionAdmin
    ///      Distribution percentages and wallet addresses managed by AuctionAdmin contract
    uint256 public constant DEVELOPMENT_SHARE = 5;
    
    /// @notice Holder rewards share percentage (10% of mint fees)
    /// @dev Distributed proportionally to all active DAV holders at time of each mint
    ///      Rewards accumulate in holderRewards mapping and can be claimed via claimReward()
    uint256 public constant HOLDER_SHARE = 10;
    
    /// @notice Basis points for percentage calculations (100%)
    /// @dev Used to validate total percentage allocations equal 100%
    ///      HOLDER_SHARE + LIQUIDITY_SHARE + DEVELOPMENT_SHARE + REFERRAL_BONUS = 100
    uint256 public constant BASIS_POINTS = 10000;
    
    /// @notice Initial governance allocation minted at deployment
    /// @dev Marked as fromGovernance=true to exclude from holder reward distributions
    ///      Used for initial protocol setup, testing, and promotional activities
    ///      These tokens do not earn holder rewards to prevent unfair advantage
    uint256 public constant INITIAL_GOV_MINT = 2000 ether;
    
    /// @notice STATE token contract address
    /// @dev Set automatically in constructor from deployment parameter
    ///      Used for ROI calculations and portfolio value assessment
    address public STATE_TOKEN;
    
    /// @notice DAV token expiry period (30 days from mint)
    /// @dev Tokens become inactive after expiry but complete history is preserved for transparency
    ///      Expiry tracked per-batch, allowing mixed active/expired tokens in same wallet
    ///      Governance transfers reset expiry timer to fresh 30 days
    uint256 public constant DAV_TOKEN_EXPIRE = 30 days;
    
    // ============ Analytics & Tracking ============
    
    /// @notice Cumulative referral rewards distributed to referrers (lifetime analytics)
    /// @dev Tracks total PLS allocated as referral bonuses since contract deployment
    ///      Used for analytics and transparency - actual claimable amounts in holderRewards mapping
    uint256 public totalReferralRewardsDistributed;
    
    /// @notice Total DAV tokens minted via mintDAV() function (public minting)
    /// @dev Excludes INITIAL_GOV_MINT (2,000 DAV) which is tracked separately
    ///      Combined with INITIAL_GOV_MINT equals total circulating supply
    uint256 public mintedSupply;
    
    /// @notice Total PLS allocated to buyback operations (80% of all mint fees)
    /// @dev Cumulative amount sent to BuyAndBurnController for STATE token buyback and burn
    ///      Primary deflationary mechanism reducing STATE supply over time
    uint256 public totalLiquidityAllocated;
    
    /// @notice Total PLS allocated to development team (5% of all mint fees)
    /// @dev Cumulative amount distributed to dev wallets based on AuctionAdmin configuration
    ///      Distribution percentages and wallet addresses managed by AuctionAdmin contract
    uint256 public totalDevelopmentAllocated;
    // ============ Governance & Protocol Addresses ============
    
    /// @notice Governance address with administrative privileges
    /// @dev Controls emergency pause functions and development wallet management
    ///      Governance transfers ONLY through AuctionAdmin.proposeProtocolGovernance() with 7-day timelock
    ///      When governance transfers DAV to users, expiry timer resets to fresh 30 days
    address public governance;
    
    /// @notice SWAP_V3 (AuctionSwap) contract address
    /// @dev Used for ROI calculations: reads auction token prices, cycles, and schedule information
    ///      Critical for portfolio value assessment in claimReward() ROI verification
    address public swapContract;
    
    /// @notice PulseX Router address for AMM price calculations
    /// @dev Used in getROI() to calculate actual swap values via getAmountsOut()
    address public pulsexRouter;
    
    /// @notice AuctionAdmin contract address
    /// @dev Manages development fee wallet registry and protocol-wide governance transfers
    ///      Only AuctionAdmin can call transferGovernanceImmediate() with 7-day timelock enforcement
    ///      Reads dev wallet configuration via IAuctionAdmin.getDevelopmentFeeWalletsInfo()
    address public auctionAdmin;
    
    /// @notice BuyAndBurnController contract address
    /// @dev Dual purpose: (1) Receives 80% of mint fees for STATE buyback and burn operations
    ///                     (2) Provides STATE/WPLS pool address for ROI price calculations
    ///      Primary mechanism for creating STATE demand and deflationary pressure
    address public buyAndBurnController;
    
    // ============ Control Flags ============
    
    /// @notice Transfer pause flag (governance emergency control)
    /// @dev When true, only governance can transfer DAV tokens (all other transfers blocked)
    ///      Used for emergency situations, security incidents, or protocol migrations
    ///      Does not affect minting or reward claiming (controlled separately by 'paused' flag)
    bool public transfersPaused = false;
    
    /// @notice Contract pause flag (governance emergency control)
    /// @dev When true, minting (mintDAV) and reward claiming (claimReward) are disabled
    ///      Transfers are controlled separately by 'transfersPaused' flag
    ///      Used for emergency maintenance or security incident response
    bool public paused = false;

    // ============ Data Structures ============
    
    /// @notice Nonce for referral code generation (ensures uniqueness)
    /// @dev Incremented each time a referral code is generated for a user
    mapping(address => uint256) private userNonce;

    /// @notice Tracks lifetime referral rewards earned by each address
    /// @dev Analytics only - actual claimable rewards stored in holderState.holderRewards
    ///      Sum of all referral bonuses earned since contract deployment
    mapping(address => uint256) public referralRewards;
    
    /// @notice Mint batch structure for tracking individual DAV mints
    /// @dev Each mint creates a new batch with timestamp for 30-day expiry tracking
    ///      fromGovernance flag excludes promotional/airdrop tokens from reward distributions
    struct MintBatch {
        uint256 amount;         // DAV tokens in this batch
        uint256 timestamp;      // Mint timestamp (expiry = timestamp + 30 days)
        bool fromGovernance;    // If true, tokens don't earn holder rewards
    }

    /// @notice Complete mint history for each user (all batches preserved)
    /// @dev Intentionally preserves expired batches for full transparency and audit trail
    ///      Growth naturally bounded by MAX_SUPPLY cap and 30-day expiry turnover
    ///      Enables users to view complete mint/expiry history via getMintTimestamps()
    mapping(address => MintBatch[]) public mintBatches;
    
    /// @notice Daily mint tracking aligned to GMT+3 17:00 (5 PM) boundary
    /// @dev Maps day index to total DAV minted that day for analytics
    ///      Day calculation: (calculateNextClaimStartGMTPlus3(timestamp) - 1 day) / 1 day
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
        address _pulsexRouter,
        string memory tokenName,
        string memory tokenSymbol // Should be "pDAV1" for mainnet
    ) ERC20(tokenName, tokenSymbol) Ownable(msg.sender) {
        require(
            _stateToken != address(0) &&
                _auctionAdmin != address(0) &&
                _buyAndBurnController != address(0) &&
                _swapContract != address(0) &&
                _pulsexRouter != address(0),
            "Addresses cannot be zero"
        );
        governance = _gov;
        auctionAdmin = _auctionAdmin;
        buyAndBurnController = _buyAndBurnController;
        swapContract = _swapContract;
        pulsexRouter = _pulsexRouter;
        
        // Mint initial governance allocation (2,000 DAV)
        _mint(_gov, INITIAL_GOV_MINT);
        mintedSupply += INITIAL_GOV_MINT;
        
        // Create initial batch for governance allocation to enable batch-based accounting
        // Without this, governance transfers would fail batch accounting validation
        mintBatches[_gov].push(
            MintBatch({
                amount: INITIAL_GOV_MINT,
                timestamp: block.timestamp,
                fromGovernance: true
            })
        );
        StateToken = IERC20(_stateToken);
        
        // Set STATE_TOKEN address for ROI calculations
        STATE_TOKEN = _stateToken;
        renounceOwnership();
    }
    // Burn-to-claim removed: setSwapAddress no longer needed

    modifier onlyGovernance() {
        require(msg.sender == governance, "Caller is not governance");
        _;
    }
    
    modifier onlyGovernanceOrSwap() {
        require(
            msg.sender == governance || msg.sender == swapContract,
            "Caller is not governance or swap"
        );
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
    
    /// @notice Transfer governance via AuctionAdmin (for centralized governance transfer)
    /// @dev Only callable by AuctionAdmin during protocol-wide governance transfer
    /// @dev No timelock here - timelock enforced in AuctionAdmin.proposeProtocolGovernance()
    /// @param newGovernance Address of new governance
    function transferGovernanceImmediate(address newGovernance) external {
        require(msg.sender == auctionAdmin, "Only admin");
        require(newGovernance != address(0), "Invalid governance address");
        
        address oldGovernance = governance;
        governance = newGovernance;

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
     * @notice Internal function to transfer mint batches between accounts
     * @dev Preserves complete mint history while moving tokens FIFO (first-in-first-out)
     *      Special handling for governance transfers to refresh expiry and enable rewards
     * 
     * @param from Address transferring tokens
     * @param to Address receiving tokens
     * @param amount Amount of tokens to transfer
     *
     * @custom:batch-logic
     * - Processes batches in chronological order (oldest first)
     * - Sets consumed batches to amount=0 (avoids mid-loop array shifts)
     * - Post-processing cleanup removes zero-amount batches
     *
     * @custom:governance-transfers
     * When governance transfers to regular users:
     * - Timestamp reset to current time (starts fresh 30-day expiry)
     * - fromGovernance flag set to false (makes tokens reward-eligible)
     * - Enables governance to reactivate expired tokens
     *
     * @custom:regular-transfers
     * For all other transfers:
     * - Original timestamp preserved (expiry cannot be extended)
     * - fromGovernance flag preserved
     * - Self-transfers also preserve original timestamp
     *
     * @custom:backward-compatibility
     * If governance has no source batches (edge case):
     * - Creates synthetic batch with fromGovernance=true
     * - Prevents transfer revert while maintaining reward exclusion
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
            
            // Governance to user transfer: Reset expiry and enable rewards
            if (from == governance && to != governance) {
                dst.push(MintBatch({ 
                    amount: take, 
                    timestamp: block.timestamp,  // Fresh 30-day countdown
                    fromGovernance: false        // Enable rewards
                }));
            } else {
                // Preserve original metadata (timestamp cannot be extended)
                dst.push(MintBatch({ amount: take, timestamp: src[i].timestamp, fromGovernance: src[i].fromGovernance }));
            }
            remaining -= take;
        }
        // Backward compatibility: Handle governance edge case with no source batches
        if (remaining > 0 && from == governance && src.length == 0) {
            dst.push(MintBatch({ amount: remaining, timestamp: block.timestamp, fromGovernance: true }));
            remaining = 0;
        }
        require(remaining == 0, "Batch accounting mismatch");
    }

    function earned(address account) public view returns (uint256) {
        return holderState._earned(account, governance);
    }
    /// @notice Mints DAV tokens and distributes PLS fees to protocol stakeholders
    /// @param amount DAV tokens to mint (must be whole numbers in wei, e.g., 1 ether = 1 DAV)
    /// @param referralCode Optional referral code for 5% bonus to referrer
    /// @dev Minting process:
    ///      1. Validates amount (whole numbers only), supply cap, holder cap
    ///      2. Calculates fee distribution: 80% buyback, 10% holders, 5% dev, 5% referral
    ///      3. Updates holder status and creates new mint batch with 30-day expiry
    ///      4. Distributes fees to respective destinations
    ///      5. Mints DAV tokens to caller
    ///
    /// @custom:requirements
    /// - Contract not paused
    /// - Amount must be whole DAV tokens (no fractions)
    /// - Under 2,500 holder cap
    /// - Caller is not governance
    /// - Under MAX_SUPPLY cap
    /// - Exact PLS payment (amount × 1,500,000 PLS)
    ///
    /// @custom:distribution
    /// - 80% → BuyAndBurnController for STATE buyback
    /// - 10% → Distributed to active DAV holders
    /// - 5% → Development wallets via AuctionAdmin
    /// - 5% → Referrer's claimable rewards (if valid code provided)
    ///
    /// @custom:security Protected by nonReentrant and whenNotPaused modifiers
    function mintDAV(
        uint256 amount,
        string memory referralCode
    ) external payable nonReentrant whenNotPaused {
        // Validate minting parameters
        Distribution.updateDAVHolderStatus(holderState, msg.sender, governance, getActiveBalance);
        require(amount > 0, "Amount must be greater than zero");
        require(getDAVHoldersCount() < MAX_HOLDERS, "Max holders reached");
        require(msg.sender != governance, "Governance cannot mint");
        require(amount % 1 ether == 0, "Amount must be a whole number");
        require(mintedSupply + amount <= MAX_SUPPLY, "Max supply reached");
        uint256 cost = (amount * TOKEN_COST) / 1 ether;
        require(msg.value == cost, "Incorrect PLS amount sent");

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

        // Record mint in batch system with 30-day expiry tracking
        mintedSupply += amount;
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

        // Transfer protocol remainder to BuyAndBurnController for STATE buyback
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
        
        // Distribute holder rewards proportionally to active DAV holders
        holderState.distributeHolderShare(
            holderShare,
            governance,
            getActiveMintedBalance
        );
        
        // Add referral rewards to referrer's claimable balance (if valid referrer)
        // Add referral rewards to referrer's claimable balance (EOA wallets only)
        if (referrer != address(0) && referralShare > 0) {
            if (address(referrer).code.length == 0) {
                // Referrer is EOA - add to their claimable holder rewards
                referralRewards[referrer] += referralShare;
                totalReferralRewardsDistributed += referralShare;
                
                holderState.holderRewards[referrer] += referralShare;
                holderState.holderFunds += referralShare;
            } else {
                // Referrer is contract - redirect to BuyAndBurnController
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

    /**
     * @notice Get user's active DAV balance eligible for holder reward distributions
     * @dev Excludes governance-minted tokens from reward calculations
     * 
     * @param account Address to check
     * @return active Sum of non-expired, non-governance DAV tokens
     *
     * @custom:governance-exclusion
     * - Tokens with fromGovernance=true don't earn holder rewards
     * - Prevents unfair advantage from promotional/airdrop tokens
     * - Only user-purchased DAV (fromGovernance=false) earns rewards
     *
     * @custom:examples
     * - User mints 100 DAV with PLS → fromGovernance=false → earns rewards
     * - Governance airdrops 50 DAV → fromGovernance=true → no rewards
     * - User receives transfer → fromGovernance=false → earns rewards
     */
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
     * @dev Iterates all holders and sums their active balances
     * 
     * @return total Sum of all active (non-expired) DAV tokens
     *
     * @custom:loop-bounds
     * - Bounded by MAX_HOLDERS = 2,500 wallets
     * - Enforced in mintDAV() and Distribution.updateDAVHolderStatus()
     * - Each getActiveBalance() loops user's batches (typically 1-10)
     *
     * @custom:design-philosophy
     * Intentional tradeoff: Real-time accuracy over gas optimization
     * - No caching or snapshots (avoids staleness)
     * - No complex optimizations (maintains clarity)
     * - View function (gas not paid by users)
     * - PulseChain context (extremely low gas costs)
     * - Transparency priority (exact real-time values)
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
     * @notice Claim accumulated holder rewards (from 10% mint distributions + referral bonuses)
     * @dev Requires ROI verification: user's portfolio value must >= total DAV mint cost
     * 
     * @custom:requirements
     * - Caller has active (non-expired) DAV balance
     * - Claimable rewards > 0
     * - Portfolio value >= DAV mint cost (ROI check)
     * - Sufficient contract balance
     * - Contract not paused
     * - Caller is not governance
     *
     * @custom:roi-components
     * Portfolio includes:
     * - STATE tokens (wallet balance)
     * - Auction tokens (converted to STATE at pool ratio)
     * - Unclaimed rewards (already accumulated PLS)
     *
     * @custom:process
     * 1. Update holder status (check for expired DAV)
     * 2. Calculate claimable reward amount
     * 3. Verify ROI threshold (view function - read-only)
     * 4. Validate sufficient funds
     * 5. Update state (zero rewards, deduct from holderFunds)
     * 6. Transfer PLS to user
     *
     * @custom:security nonReentrant + whenNotPaused + CEI pattern + explicit success check
     */
    function claimReward() external payable nonReentrant whenNotPaused {
        address user = msg.sender;
        require(user != address(0), "Invalid user");
        require(msg.sender != governance, "Not eligible to claim rewards");
        
        // Update holder status to check for expiration
        Distribution.updateDAVHolderStatus(holderState, msg.sender, governance, getActiveBalance);
        
        // Calculate claimable reward
        uint256 reward = earned(msg.sender);
        require(reward > 0, "No rewards to claim");
        
        // ROI verification (view function - read-only)
        (, , bool meetsROI, ) = getROI(msg.sender);
        require(meetsROI, "Insufficient ROI: portfolio value must exceed DAV mint cost");
        
        // Validate sufficient funds
        require(holderState.holderFunds >= reward, "Insufficient holder funds");
        require(address(this).balance >= reward, "Insufficient contract balance");
        
        // Update state before external call (CEI pattern)
        holderState.holderRewards[msg.sender] = 0;
        holderState.holderFunds -= reward;
        
        // Transfer PLS to user with explicit success check
        (bool success, ) = user.call{value: reward}("");
        require(success, "Reward transfer failed");
        
        emit RewardsClaimed(msg.sender, reward);
    }
    
    /**
     * @notice Reclaim all unclaimed holder rewards after 1000 days from auction start
     * @dev Only callable by governance after 1000-day period expires
     * 
     * @custom:requirements
     * - Caller is governance
     * - Auction schedule initialized in SWAP_V3
     * - 1000 days passed since auction start
     * - Unclaimed rewards > 0
     * - Sufficient contract balance
     *
     * @custom:process
     * 1. Verify auction started and 1000 days elapsed
     * 2. Get total unclaimed rewards from holderFunds
     * 3. Reset holderFunds to zero
     * 4. Reset all individual holder rewards to zero
     * 5. Transfer total to BuyAndBurnController
     *
     * @custom:destination All reclaimed funds sent to BuyAndBurnController for STATE buyback
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
     * @notice Get total lifetime referral rewards earned by a user
     * @dev This shows the cumulative amount earned from referrals (not current claimable balance)
     * @dev Actual claimable rewards are in holderState.holderRewards (includes both holder distributions + referrals)
     * @param user Address of the user to check
     * @return totalReferralEarnings Total PLS earned from referrals over lifetime
     */
    function getReferralRewards(address user) external view returns (uint256 totalReferralEarnings) {
        return referralRewards[user];
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
     * @dev View function - read-only, no state changes, safe for external calls
     * 
     * @param user Address to calculate ROI for
     * @return totalValueInPLS Total portfolio value in PLS
     * @return requiredValue Required value based on DAV balance (DAV × 1,500,000 PLS)
     * @return meetsROI Whether portfolio value >= required value
     * @return roiPercentage ROI as percentage (totalValue × 100 / requiredValue)
     *
     * @custom:calculation-components
     * 1. STATE Holdings: User's STATE token wallet balance
     * 2. Auction Tokens: Converted to STATE value using pool ratios
     * 3. Claimable Rewards: Accumulated holder distributions + referral bonuses
     * 4. Total Portfolio: STATE value (in PLS) + claimable rewards
     * 5. Required Value: Total DAV balance × 1,500,000 PLS
     * 6. ROI Check: Portfolio value >= required value
     *
     * @custom:loop-bounds
     * - Maximum 50 iterations (current auction tokens)
     * - Early exit when no more tokens found
     * - Try-catch prevents reverts from failed calls
     * - View function - gas not paid by users
     *
     * @custom:security View function with automatic Solidity 0.8.20 overflow protection
     */
    function getROI(address user) public view returns (
        uint256 totalValueInPLS,
        uint256 requiredValue,
        bool meetsROI,
        uint256 roiPercentage
    ) {
        // STEP 1: Calculate STATE value from user's wallet
        uint256 totalStateValue = StateToken.balanceOf(user);
        
        // Add auction token values converted to STATE using AMM
        if (swapContract != address(0) && pulsexRouter != address(0)) {
            ISWAP_V3 swap = ISWAP_V3(swapContract);
            IPulseXRouter02 router = IPulseXRouter02(pulsexRouter);
            
            // Loop through registered auction tokens (max 50, early exit when exhausted)
            for (uint256 i = 0; i < 50; i++) {
                try swap.autoRegisteredTokens(i) returns (address auctionToken) {
                    if (auctionToken == address(0)) break;
                    
                    // Get user's balance of this auction token
                    uint256 userTokenBalance = IERC20(auctionToken).balanceOf(user);
                    
                    if (userTokenBalance > 0) {
                        // Use AMM to get actual swap value (Token -> STATE)
                        address[] memory path = new address[](2);
                        path[0] = auctionToken;
                        path[1] = STATE_TOKEN;
                        
                        try router.getAmountsOut(userTokenBalance, path) returns (uint[] memory amounts) {
                            if (amounts.length > 1 && amounts[1] > 0) {
                                totalStateValue += amounts[1];
                            }
                        } catch {
                            // Skip tokens with no pool or AMM errors
                        }
                    }
                } catch {
                    // Out of bounds - no more tokens
                    break;
                }
            }
        }
        
        // Convert total STATE to PLS value
        uint256 stateValueInPLS = _convertStateToPLS(totalStateValue);
        
        // Add claimable rewards (holder distributions + referral bonuses)
        uint256 claimableRewards = holderState.holderRewards[user];
        
        totalValueInPLS = stateValueInPLS + claimableRewards;
        
        // Calculate required value (all DAV including expired)
        uint256 totalDAV = balanceOf(user);
        requiredValue = (totalDAV * TOKEN_COST) / 1e18;
        
        // Check ROI threshold
        meetsROI = totalValueInPLS >= requiredValue;
        
        // Calculate ROI percentage (Solidity 0.8.20 has built-in overflow protection)
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
