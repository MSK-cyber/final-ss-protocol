// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./libraries/ReferralCodeLib.sol";
import "./libraries/Distribution.sol";
import "./libraries/TimeUtilsLib.sol";
// Burn-to-claim feature removed: BurnLibrary integration deleted

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
    //Global unit256 Variables
    // DAV TOken
    // NOTE: // This contract is intended for PulseChain, not Ethereum.
    uint256 public constant MAX_SUPPLY = 10000000 ether; // 10,000,000 DAV Tokens (hard cap, includes 2,000 gov mint)
    uint256 public constant MAX_HOLDERS = 5000; // 5,000 wallets limit per requirements
    // Mint price per whole DAV (1e18) in PLS units
    // Updated per requirements: 500 PLS per DAV
    uint256 public constant TOKEN_COST = 500 ether; // 500 PLS per DAV
    uint256 public constant REFERRAL_BONUS = 5; // 5% bonus for referrers
    uint256 public constant LIQUIDITY_SHARE = 80; // 80% LIQUIDITY SHARE
    uint256 public constant DEVELOPMENT_SHARE = 5; // 5% DEV SHARE
    uint256 public constant HOLDER_SHARE = 10; // 10% HOLDER SHARE
    uint256 public constant BASIS_POINTS = 10000;
    uint256 public constant INITIAL_GOV_MINT = 2000 ether;
    
    address public STATE_TOKEN; // Configurable by governance
    uint256 public constant MAX_TOKEN_PER_USER = 100;
    uint256 public constant DAV_TOKEN_EXPIRE = 2 days; // 2 days expiry per requirements

    //cycle assinging to 10. not want to update or configure later
    uint256 public constant CYCLE_ALLOCATION_COUNT = 10;
    /// @notice Token processing fee required to execute certain operations.
    /// @dev Intentionally set to 100000 tokens in full native unit (i.e., 100000 ether).
    ///      ⚠️ This is NOT a unit error — the fee is meant to be very high, either for testing,
    ///      access restriction, or deterrence. Adjust only if this is NOT the intended behavior.
    // This contract is intended for PulseChain, not Ethereum.
    // Please note that the value of PLS is significantly lower compared to ETH,
    // Token registry/image/emoji removed. No processing fees.
    uint256 public totalReferralRewardsDistributed;
    uint256 public mintedSupply; // Total Minted DAV Tokens
    uint256 public totalLiquidityAllocated;
    uint256 public totalDevelopmentAllocated;
    // Burn-to-claim removed: related constants and state deleted
    // @notice The governance address with special privileges, set at deployment
    // @dev Intentionally immutable to enforce a fixed governance structure; cannot be updated
    //Governance Privilage
    /*This implementation introduces a ratio-based liquidity provisioning (LP) mechanism, which is currently in beta and undergoing testing. 
	The design is experimental and aims to collect meaningful data to inform and refine the concept. Due to its early-stage nature, certain centralized elements remain in place to ensure flexibility during the testing phase. 
	These will be reviewed and potentially decentralized as the model matures.*/

    //NOTE: Governance is using multi-sig method to ensure security of that wallet address.
    address public governance;
    address public liquidityWallet;
    address public developmentWallet;
    address public swapContract; // SWAP contract can transfer governance for protocol-wide changes
    // @notice Transfers are permanently paused for non-governance addresses to enforce a no-transfer policy
    // @dev This is an intentional design choice to restrict token transfers and ensure the integrity of the airdrop mechanism.
    bool public transfersPaused = false;  // Enable transfers
    bool public paused = false;

    // @notice Mapping to track nonce for each user to ensure unique referral code generation
    // @dev Incremented each time a referral code is generated for a user
    mapping(address => uint256) private userNonce;
    // Burn-to-claim removed: UserBurn struct deleted
    struct GovernanceProposal {
        address newGovernance;
        uint256 proposedAt;
    }
    GovernanceProposal public pendingGovernance;

    mapping(address => uint256) public referralRewards; // Tracks referral rewards earned
    struct MintBatch {
        uint256 amount;
        uint256 timestamp; // mint time
        bool fromGovernance; // true = disqualified from rewards
    }
    struct WalletUpdateProposal {
        address newWallet;
        uint256 proposedAt;
    }

    WalletUpdateProposal public pendingLiquidityWallet;
    WalletUpdateProposal public pendingDevelopmentWallet;

    mapping(address => MintBatch[]) public mintBatches;
    // Admin analytics: mint counters per day (aligned to 15:00 GMT+3 like SWAP)
    mapping(uint256 => uint256) public mintedByDayIndex;

    event RewardsClaimed(address indexed user, uint256 amount);
    event ReferralCodeGenerated(address indexed user, string referralCode);
    // Token name/emoji registry events removed
    event GovernanceUpdated(address oldGovernance, address newGovernance);
    event LiquidityWalletUpdated(address newWallet);
    event DevelopmentWalletUpdated(address newWallet);
    event ContractPaused(address by);
    event ContractUnpaused(address by);
    // Registry status update event removed
    // Burn-to-claim removed: SwapAddressUpdated event deleted
    event ReferralPayoutSkipped(address indexed user, address indexed referrer, uint256 amount, string reason);
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
        address _liquidityWallet,
        address _stateToken,
        address _gov,
        string memory tokenName,
        string memory tokenSymbol // Should be "pDAV" for mainnet
    ) ERC20(tokenName, tokenSymbol) {
        require(
            _liquidityWallet != address(0) &&
                _stateToken != address(0),
            "Wallet addresses cannot be zero"
        );
        liquidityWallet = _liquidityWallet;
        developmentWallet = msg.sender; // Deployer becomes initial development wallet
        governance = _gov;
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

    // Function to set SWAP contract address (only governance)
    function setSwapContract(address _swapContract) external onlyGovernance {
        require(_swapContract != address(0), "Invalid swap contract address");
        swapContract = _swapContract;
    }
    
    function proposeLiquidityWallet(address _newLiquidityWallet) external onlyGovernance {
        require(_newLiquidityWallet != address(0), "Invalid wallet address");
        pendingLiquidityWallet = WalletUpdateProposal(_newLiquidityWallet, block.timestamp + 7 days);
    }

    function confirmLiquidityWallet() external onlyGovernance {
        require(pendingLiquidityWallet.newWallet != address(0), "No pending proposal");
        require(block.timestamp >= pendingLiquidityWallet.proposedAt, "Timelock not expired");
        liquidityWallet = pendingLiquidityWallet.newWallet;
        delete pendingLiquidityWallet;
        emit LiquidityWalletUpdated(liquidityWallet);
    }

    function proposeDevelopmentWallet(address _newDevelopmentWallet) external onlyGovernance {
        require(_newDevelopmentWallet != address(0), "Invalid wallet address");
        pendingDevelopmentWallet = WalletUpdateProposal(_newDevelopmentWallet, block.timestamp + 7 days);
    }

    function confirmDevelopmentWallet() external onlyGovernance {
        require(pendingDevelopmentWallet.newWallet != address(0), "No pending proposal");
        require(block.timestamp >= pendingDevelopmentWallet.proposedAt, "Timelock not expired");
        developmentWallet = pendingDevelopmentWallet.newWallet;
        delete pendingDevelopmentWallet;
        emit DevelopmentWalletUpdated(developmentWallet);
    }
    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }
    function pause() external onlyGovernance {
        paused = true;
        emit ContractPaused(msg.sender);
    }
    
    /// ================= SAFETY FUNCTIONS =================
    

    
    /**
     * @notice Set the STATE token address (governance only, for deployment configuration)
     * @param _stateToken Address of the STATE token contract
     * @dev DEPRECATED: STATE_TOKEN is now set automatically in constructor
     */
    function setStateToken(address _stateToken) external onlyGovernance {
        require(_stateToken != address(0), "Invalid STATE token address");
        STATE_TOKEN = _stateToken;
        // NOTE: This function is now redundant but kept for backward compatibility
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
    /// @dev Move `amount` worth of minted batches from `from` to `to` while preserving
    ///      original timestamp and governance-origin flags. Consumes from oldest batches first (FIFO).
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
                // Reset timestamp to current time for fresh 30-day expiry countdown
                // Remove fromGovernance flag to make tokens eligible for rewards
                dst.push(MintBatch({ 
                    amount: take, 
                    timestamp: block.timestamp,  // Fresh timestamp starts 30-day countdown
                    fromGovernance: false        // Make eligible for rewards
                }));
            } else {
                // Preserve original metadata for all other transfers
                dst.push(MintBatch({ amount: take, timestamp: src[i].timestamp, fromGovernance: src[i].fromGovernance }));
            }
            remaining -= take;
        }
        // Graceful backfill: if governance has no source batches (e.g., initial
        // constructor mint before this fix) allow transfer by synthesizing a
        // batch for the recipient with current timestamp and fromGovernance=true.
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
        // record mint against current day index aligned to SWAP's GMT+3 boundary
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

        // Burn-to-claim removed: redirect protocol remainder to liquidity
        if (stateLPShare > 0) {
            totalLiquidityAllocated += stateLPShare;
            address remainderDestination = liquidityWallet;
            (bool successLiquidityRemainder, ) = remainderDestination.call{ value: stateLPShare }("");
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
        // Interactions
        if (referrer != address(0) && referralShare > 0) {
            if (address(referrer).code.length == 0) {
                // Try direct referral payout to EOA
                referralRewards[referrer] += referralShare;
                totalReferralRewardsDistributed += referralShare;
                (bool successRef, ) = referrer.call{value: referralShare}("");
                if (!successRef) {
                    // Soft-fail: redirect to liquidity wallet
                    totalLiquidityAllocated += referralShare;
                    address fallbackDestination = liquidityWallet;
                    (bool successLiqFallback, ) = fallbackDestination.call{value: referralShare}("");
                    require(successLiqFallback, "Referral fallback transfer failed");
                    emit ReferralPayoutSkipped(msg.sender, referrer, referralShare, "Referrer payout failed - redirected to Liquidity");
                }
            } else {
                // Referrer is a contract – skip payout and redirect to liquidity
                totalLiquidityAllocated += referralShare;
                address contractReferrerDestination = liquidityWallet;
                (bool successLiq, ) = contractReferrerDestination.call{value: referralShare}("");
                require(successLiq, "Contract referrer transfer failed");
                emit ReferralPayoutSkipped(msg.sender, referrer, referralShare, "Referrer is contract - redirected to Liquidity");
            }
        }

        if (liquidityShare > 0) {
            totalLiquidityAllocated += liquidityShare;
            
            // Send 80% fees to liquidity wallet
            address feeDestination = liquidityWallet;
            (bool successLiquidity, ) = feeDestination.call{
                value: liquidityShare
            }("");
            require(successLiquidity, "Fee transfer failed");
        }
        if (developmentShare > 0) {
            totalDevelopmentAllocated += developmentShare;
            (bool successDev, ) = developmentWallet.call{ value: developmentShare }("");
            require(successDev, "Development transfer failed");
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

    function claimReward() external payable nonReentrant whenNotPaused {
        address user = msg.sender;
        require(user != address(0), "Invalid user");
        require(msg.sender != governance, "Not eligible to claim rewards");
        // Update holder status to check for expiration
        Distribution.updateDAVHolderStatus(holderState, 
            msg.sender,
            governance,
            getActiveBalance
        ); // Calculate claimable reward
        uint256 reward = earned(msg.sender);
        require(reward > 0, "No rewards to claim");
        require(holderState.holderFunds >= reward, "Insufficient holder funds");
        require(address(this).balance >= reward, "Insufficient contract balance");
        // Update state
        holderState.holderRewards[msg.sender] = 0;
        holderState.holderFunds -= reward;
            // Transfer reward (no fixed 30k gas; CEI and nonReentrant already applied)
            (bool success, ) = user.call{value: reward}("");
        require(success, "Reward transfer failed");
        emit RewardsClaimed(msg.sender, reward);
    }

    function getDAVHoldersCount() public view returns (uint256) {
        return holderState.davHoldersCount;
    }
    /// @notice Returns the total DAV minted during the day window that contains the provided timestamp (aligned to 15:00 GMT+3)
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
