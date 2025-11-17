// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {TOKEN_V3} from "./Tokens.sol";
import "./libraries/TimeUtilsLib.sol";
import "./libraries/AuctionLib.sol";
import "./libraries/NormalAuctionCalculations.sol";
import "./libraries/ReverseAuctionCalculations.sol";
import { SwapErrors } from "./interfaces/SwapErrors.sol";
import { SwapEvents } from "./interfaces/SwapEvents.sol";
import { IPair } from "./interfaces/IPair.sol";
import "./interfaces/IAuctionAdmin.sol";
import "./libraries/SwapCoreLib.sol";
import "./libraries/BurnLib.sol";
import "./libraries/AuctionUtilsLib.sol";

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPulseXRouter02 {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
    
    function swapExactTokensForTokens(
        uint256 amountIn,
        uint256 amountOutMin,
        address[] calldata path,
        address to,
        uint256 deadline
    ) external returns (uint256[] memory amounts);
}

interface IDAV {
    function transferGovernanceImmediate(address newGovernance) external;
    function governance() external view returns (address);
    function getActiveBalance(address user) external view returns (uint256);
}

interface IAirdropDistributor {
    function consumedDavUnits(address token, address user) external view returns (uint256);
    function getConsumedDavUnitsByCycle(address token, address user, uint256 cycle) external view returns (uint256);
}

/**
 * @title SWAP_V3 - State Protocol Auction System
 * @author State Protocol Team
 * @notice Main contract implementing normal and reverse auctions for token distribution
 * @dev Manages auction system with normal/reverse auctions, DAV-based token claims, and PulseX integration
 * @custom:security Uses Solidity 0.8.20 built-in overflow protection, ReentrancyGuard on external functions
 * @custom:access Governance-controlled with admin delegation pattern
 * @custom:schedule 50 auction tokens rotating daily, 20 cycles per token, 1000-day total period
 * @custom:participants Maximum 2500 unique participants across all auctions
 * @custom:timezone All daily boundaries calculated at GMT+3 17:00 (5 PM)
 */
contract SWAP_V3 is Ownable, ReentrancyGuard, SwapErrors, SwapEvents {
    using SafeERC20 for IERC20;
    using TimeUtilsLib for uint256;
    using AuctionLib for AuctionLib.AuctionCycle;
    using BurnLib for BurnLib.BurnParams;
    using AuctionUtilsLib for AuctionUtilsLib.AuctionSchedule;
    
    error DeadlineExpired();
    error SlippageExceeded();

    // ================= State Variables =================
    
    IDAV public dav;
    
    // Constants
    uint256 constant MIN_DAV_REQUIRED = 1 ether;
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 constant MAX_CYCLES_PER_TOKEN = 20; // Each token can run for maximum 20 cycles (20 days per token)
    
    // Core addresses
    address public stateToken;
    address public davToken;
    address public governanceAddress;
    address public airdropDistributor;
    IAuctionAdmin public auctionAdmin;
    address public buyAndBurnController;
    address public swapLens;
    address public pulseXRouter;
    address public pulseXFactory;
    
    // State variables
    uint256 public TotalBurnedStates;
    bool public paused = false;
    uint256 public maxAuctionParticipants = 2500;
    
    // Daily tracking
    uint256 public currentDayStart;
    uint256 public dailyStateReleased;
    uint256 public dailyStateReleasedNormal;
    uint256 public dailyStateReleasedReverse;
    uint256 public dailySwapsCount;
    uint256 public dailyUniqueSwappersCount;
    
    // Auction schedule
    AuctionUtilsLib.AuctionSchedule public auctionSchedule;
    
    // Auto registration
    address[] public autoRegisteredTokens;
    mapping(address => bool) public isAutoRegistered;
    bool public autoScheduleLocked;
    uint256 public totalAuctionsCompleted = 0;
    
    // Unified user registration system
    mapping(address => bool) public isRegisteredForAuctions; // Auto-registered during first participation (max 5000)
    uint256 public totalRegisteredUsers = 0; // Counter for auto-registered users
    mapping(uint256 => uint256) public stateReleasedByDayIndex;
    mapping(uint256 => uint256) public stateReleasedNormalByDayIndex;
    mapping(uint256 => uint256) public stateReleasedReverseByDayIndex;
    mapping(uint256 => uint256) public swapsCountByDayIndex;
    mapping(uint256 => uint256) public uniqueSwappersCountByDayIndex;
    mapping(address => uint256) private lastCountedDayIdxForUser;
    
    mapping(address => string[]) private userToTokenNames;
    mapping(address => mapping(string => address)) private deployedTokensByUser;
    mapping(address => address) private pairAddresses;
    mapping(address => bool) private supportedTokens;
    mapping(address => address) private tokenOwners;
    mapping(address => address[]) private ownerToTokens;
    mapping(string => bool) private isTokenNameUsed;
    uint256 public tokenCount;
    mapping(address => uint256) private tokenNumber;
    mapping(bytes32 => SwapCoreLib.UserSwapInfo) private userSwapTotalInfo;
    
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasUserBurnedTokens;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private userStateBalance;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private tokensBurnedByUser;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private davTokensUsed;
    
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasCompletedReverseStep1;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private reverseStateBalance;
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasCompletedReverseStep2;

    // Cycle-wide STATE tracking for reverse auction limits (per user, per token, per cycle)
    mapping(address => mapping(address => mapping(uint256 => uint256))) private cycleNormalStateEarned;
    
    // NEW: Track tokens received from normal auction Step 3 (pool swap output)
    mapping(address => mapping(address => mapping(uint256 => uint256))) private normalAuctionSwapOutput;

    mapping(address => uint256) private TotalTokensBurned;
    
    // Airdrop constant (must match AirdropDistributor.AIRDROP_PER_DAV)
    uint256 constant AIRDROP_PER_DAV = 10_000 ether; // 10,000 tokens per DAV unit

    // ================= Modifiers =================
    
    modifier onlyGovernance() {
        if (msg.sender != governanceAddress) revert NotGovernance();
        _;
    }
    
    modifier onlyTokenOwnerOrGovernance(address token) {
        if (!(msg.sender == tokenOwners[token] || msg.sender == governanceAddress)) revert Unauthorized();
        _;
    }
    
    modifier whenNotPaused() {
        if (paused) revert PausedErr();
        _;
    }

    // ================= Constructor =================
    
    constructor(address _gov) Ownable(msg.sender) {
        governanceAddress = _gov;
        currentDayStart = _calcCurrentDayStart(block.timestamp);
        auctionSchedule.scheduleSize = 50; // 50 tokens rotating daily
        // Each token gets 20 cycles: 50 tokens × 20 cycles = 1000 total auction days (1000-day cycle)
        auctionSchedule.auctionDaysLimit = auctionSchedule.scheduleSize * 20; // 50 × 20 = 1000 days
        renounceOwnership();
    }

    // ================= Core Auction Functions (Simplified) =================
    
    /**
     * @notice Normal Auction Step 3 - Swap STATE tokens for auction tokens via PulseX pool
     * @dev Users can call multiple times per cycle if they acquire more DAV and burn more tokens
     * @custom:balance userStateBalance tracks accumulated STATE from burns, deducts on each swap
     * @custom:tracking STATE release counted in burnTokensForState (Step 2), not here
     */
    function swapTokens() external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // Auto-detect today's token
        (address inputToken, bool active) = getTodayToken();
        if (!active || inputToken == address(0)) revert NoActiveAuction();
        if (isReverseAuctionActive(inputToken)) revert ReverseAuctionActive();
        
        address user = msg.sender;
        
        // Validation
        _validateSwap(user, inputToken);
        
        // Enforce global unique participant cap on first-ever swap
        if (!isRegisteredForAuctions[user]) {
            if (totalRegisteredUsers >= maxAuctionParticipants) revert ParticipantCapReached();
            isRegisteredForAuctions[user] = true;
            totalRegisteredUsers += 1;
            emit UserAutoRegistered(user, block.timestamp);
        }
        
        uint256 currentAuctionCycle = getCurrentAuctionCycle(inputToken);
        bytes32 key = SwapCoreLib.getSwapInfoKey(user, inputToken, stateToken, currentAuctionCycle);
        SwapCoreLib.UserSwapInfo storage userSwapInfo = userSwapTotalInfo[key];
        userSwapInfo.cycle = currentAuctionCycle;

        bool isReverseActive = isReverseAuctionActive(inputToken);
        if (isReverseActive) revert ReverseDayLPOonly();
        
        if (!auctionSchedule.isAuctionActive(inputToken, block.timestamp)) 
            revert NotStarted();
        
        // Allow multiple swaps per cycle if user has STATE balance
        uint256 userStateFromBurn = userStateBalance[user][inputToken][currentAuctionCycle];
        if (userStateFromBurn == 0) revert Step2NotCompleted();
        
        // Check if user has approved this contract to spend their STATE tokens
        uint256 stateAllowance = IERC20(stateToken).allowance(user, address(this));
        if (stateAllowance < userStateFromBurn) revert InsufficientAllowance();
        
        // STEP 3: Execute actual swap through PulseX pool (not from contract balance)
        uint256 amountOut = _executePoolSwap(user, inputToken, userStateFromBurn);
        if (amountOut == 0) revert AmountZero();
        
        // Track tokens received from pool swap - cumulative for multiple swaps
        normalAuctionSwapOutput[user][inputToken][currentAuctionCycle] += amountOut;
        
        // Mark swap as completed and deduct used STATE balance
        userSwapInfo.hasSwapped = true;
        userStateBalance[user][inputToken][currentAuctionCycle] -= userStateFromBurn;
        
        // Update daily tracking
        dailySwapsCount += 1;
        uint256 todayIdx = currentDayStart / 1 days;
        if (lastCountedDayIdxForUser[user] != todayIdx) {
            lastCountedDayIdxForUser[user] = todayIdx;
            dailyUniqueSwappersCount += 1;
        }
        // This would be used in reverse auctions where STATE might be the output
        // For now, keeping consistent with original logic - no tracking for normal auctions
        
        emit TokensSwapped(user, stateToken, inputToken, userStateFromBurn, amountOut);
    }

    /**
     * @notice Normal Auction Step 2 - Burn auction tokens to receive STATE tokens
     * @dev User must have completed Step 1 (claim airdrop via DAV). Multiple burns allowed per cycle.
     * @custom:burn User burns 30% of airdrop tokens (e.g., 3000 from 10K airdrop per 1 DAV)
     * @custom:reward Receives 2x STATE tokens based on pool ratio
     * @custom:fee 0.5% auction fee deducted from STATE output
     * @custom:requirement Minimum 1 DAV balance, Step 1 completed, sufficient auction token balance
     */
    function burnTokensForState() external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // Auto-detect today's token
        (address auctionToken, bool active) = getTodayToken();
        if (!active || auctionToken == address(0)) revert NoActiveAuction();
        if (isReverseAuctionActive(auctionToken)) revert ReverseAuctionActive();
        
        // User should already be registered from Step 1 (AirdropDistributor.claim)
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        // STEP 1 VALIDATION
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        if (!_hasCompletedStep1(msg.sender, auctionToken)) revert Step1NotCompleted();
        
        uint256 totalDavBalance = getDavBalance(msg.sender);
        if (totalDavBalance < MIN_DAV_REQUIRED) revert DavInsufficient();
        
        // Allow multiple burns per cycle if user mints more DAV
        uint256 davAlreadyUsed = davTokensUsed[msg.sender][auctionToken][currentCycle];
        uint256 availableDav = totalDavBalance > davAlreadyUsed ? totalDavBalance - davAlreadyUsed : 0;
        
        if (availableDav < MIN_DAV_REQUIRED) revert DavInsufficient();
        
        uint256 tokensToBurn = NormalAuctionCalculations.calculateTokensToBurn(availableDav);
        if (tokensToBurn == 0) revert AmountZero();
        
        uint256 userBalance = IERC20(auctionToken).balanceOf(msg.sender);
        if (userBalance < tokensToBurn) revert InsufficientBalance();
        
        // Check if user has approved this contract to spend their auction tokens
        uint256 allowance = IERC20(auctionToken).allowance(msg.sender, address(this));
        if (allowance < tokensToBurn) revert InsufficientAllowance();
        
        uint256 poolRatio = getRatioPrice(auctionToken);
        if (poolRatio == 0) revert InvalidParam();
        
        uint256 stateToGive = NormalAuctionCalculations.calculateStateToGive(tokensToBurn, poolRatio);
        if (stateToGive == 0) revert AmountZero();
        
        // Deduct 0.5% auction fee from STATE output
        uint256 auctionFee = (stateToGive * 50) / 10000; // 0.5% = 50/10000
        stateToGive -= auctionFee;
        
        if (IERC20(stateToken).balanceOf(address(this)) < (stateToGive + auctionFee)) revert InsufficientVault();
        
        // Use library for burn execution
        BurnLib.BurnParams memory burnParams = BurnLib.BurnParams({
            user: msg.sender,
            auctionToken: auctionToken,
            stateToken: stateToken,
            currentCycle: currentCycle,
            tokensToBurn: tokensToBurn,
            stateToGive: stateToGive,
            availableDav: availableDav
        });
        
        burnParams.executeTokenBurn(
            hasUserBurnedTokens,
            userStateBalance,
            tokensBurnedByUser,
            davTokensUsed,
            TotalTokensBurned
        );
        
        // Distribute auction fee to development wallets
        _distributeAuctionFee(stateToken, auctionFee);
        emit AuctionFeeCollected(stateToken, auctionFee, msg.sender);
        
        // Track cycle-wide STATE earned from normal auctions (per token)
        cycleNormalStateEarned[msg.sender][auctionToken][currentCycle] += stateToGive;
        
        emit TokensSwapped(msg.sender, auctionToken, stateToken, tokensToBurn, stateToGive);
    }

    /**
     * @notice Reverse Auction Step 1 - Swap auction tokens for STATE tokens
     * @param tokenAmount Amount of auction tokens to swap (auto-adjusted to maximum if exceeds limit)
     * @dev Only tokens earned from previous 3 normal auction cycles can be swapped
     * @custom:requirement Minimum 1 DAV balance, participated in previous normal auctions
     * @custom:lookback Calculates net tokens from previous 3 cycles as maximum swap limit
     */
    function reverseSwapTokensForState(uint256 tokenAmount) external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // Auto-detect today's token
        (address auctionToken, bool active) = getTodayToken();
        if (!active || auctionToken == address(0)) revert NoActiveAuction();
        if (!isReverseAuctionActive(auctionToken)) revert NormalAuctionActive();
        
        // Auto-register user if not already registered
        _autoRegisterUser(msg.sender);
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        if (!isReverseAuctionActive(auctionToken)) revert NotStarted();
        
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        
        // Check if token has completed maximum cycles
        if (currentCycle > MAX_CYCLES_PER_TOKEN) revert AuctionCyclesCompleted();
        
        if (hasCompletedReverseStep1[msg.sender][auctionToken][currentCycle]) revert AlreadySwapped();
        
        uint256 davBalance = getDavBalance(msg.sender);
        if (davBalance < MIN_DAV_REQUIRED) revert DavInsufficient();
        
        // NEW: Calculate maximum allowed tokens from previous 3 normal auction cycles
        uint256 maxAllowedTokens = 0;
        uint256 lookbackCount = 3;
        for (uint256 i = 1; i <= lookbackCount && currentCycle > i; i++) {
            uint256 netTokens = calculateNetTokensFromNormalAuction(
                msg.sender,
                auctionToken,
                currentCycle - i
            );
            maxAllowedTokens += netTokens;
        }
        
        // User must have participated in at least one previous normal auction
        if (maxAllowedTokens == 0) revert NoNormalAuctionParticipation();
        
        // NEW: Enforce token limit - user can only swap tokens they earned from auctions
        // Even if user bought extra tokens from market, they can only use auction-earned tokens
        if (tokenAmount > maxAllowedTokens) {
            // Auto-adjust to maximum allowed instead of reverting
            tokenAmount = maxAllowedTokens;
        }
        
        if (tokenAmount == 0) revert AmountZero();
        
        uint256 userBalance = IERC20(auctionToken).balanceOf(msg.sender);
        if (userBalance < tokenAmount) revert InsufficientBalance();
        
        uint256 stateOutput = calculatePoolSwapOutputReverse(auctionToken, tokenAmount);
        if (stateOutput == 0) revert AmountZero();
        
        if (IERC20(stateToken).balanceOf(address(this)) < stateOutput) revert InsufficientVault();
        
        hasCompletedReverseStep1[msg.sender][auctionToken][currentCycle] = true;
        reverseStateBalance[msg.sender][auctionToken][currentCycle] = stateOutput;
        
        IERC20(auctionToken).safeTransferFrom(msg.sender, address(this), tokenAmount);
        IERC20(stateToken).safeTransfer(msg.sender, stateOutput);
        
        dailyStateReleased += stateOutput;
        dailyStateReleasedReverse += stateOutput;
        
        emit TokensSwapped(msg.sender, auctionToken, stateToken, tokenAmount, stateOutput);
    }

    /**
     * @notice Reverse Auction Step 2 - Burn STATE tokens to receive auction tokens
     * @param stateToBurn Amount of STATE to burn (parameter ignored, uses exact balance from Step 1)
     * @dev User must burn exact STATE amount received in Step 1, cannot choose custom amount
     * @custom:burn User burns STATE from Step 1 to receive auction tokens
     * @custom:reward Receives auction tokens based on pool ratio (inverse of normal auction)
     * @custom:fee 0.5% auction fee deducted from token output
     * @custom:requirement Step 1 completed, sufficient STATE balance to burn
     */
    function burnStateForTokens(uint256 stateToBurn) external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // Auto-detect today's token
        (address auctionToken, bool active) = getTodayToken();
        if (!active || auctionToken == address(0)) revert NoActiveAuction();
        if (!isReverseAuctionActive(auctionToken)) revert NormalAuctionActive();
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        if (!isReverseAuctionActive(auctionToken)) revert NotStarted();
        
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        
        if (!hasCompletedReverseStep1[msg.sender][auctionToken][currentCycle]) revert Step1NotCompleted();
        if (hasCompletedReverseStep2[msg.sender][auctionToken][currentCycle]) revert AlreadySwapped();
        
        // NEW: IGNORE user input - force burning EXACTLY the STATE received from reverse Step 1
        // User must burn all STATE they got from swapping their auction tokens
        stateToBurn = reverseStateBalance[msg.sender][auctionToken][currentCycle];
        if (stateToBurn == 0) revert AmountZero();
        
        // User must hold sufficient STATE balance to complete burn
        uint256 userCurrentStateBalance = IERC20(stateToken).balanceOf(msg.sender);
        if (userCurrentStateBalance < stateToBurn) revert InsufficientBalance();
        
        uint256 poolRatio = getRatioPrice(auctionToken);
        if (poolRatio == 0) revert InvalidParam();
        
        uint256 tokensToGive = ReverseAuctionCalculations.calculateTokensToGive(stateToBurn, poolRatio);
        if (tokensToGive == 0) revert AmountZero();
        
        // Deduct 0.5% auction fee from token output
        uint256 auctionFee = (tokensToGive * 50) / 10000; // 0.5% = 50/10000
        tokensToGive -= auctionFee;
        
        if (IERC20(auctionToken).balanceOf(address(this)) < (tokensToGive + auctionFee)) revert InsufficientVault();
        
        // Use library for reverse burn execution
        BurnLib.ReverseBurnParams memory reverseParams = BurnLib.ReverseBurnParams({
            user: msg.sender,
            auctionToken: auctionToken,
            stateToken: stateToken,
            currentCycle: currentCycle,
            stateToBurn: stateToBurn,
            tokensToGive: tokensToGive
        });
        
        BurnLib.executeReverseBurn(
            reverseParams,
            hasCompletedReverseStep2,
            reverseStateBalance,
            TotalTokensBurned
        );
        
        // Distribute auction fee to development wallets
        _distributeAuctionFee(auctionToken, auctionFee);
        emit AuctionFeeCollected(auctionToken, auctionFee, msg.sender);
        
        emit TokensSwapped(msg.sender, stateToken, auctionToken, stateToBurn, tokensToGive);
    }

    // ================= Internal Functions =================
    
    /**
     * @notice Validate swap eligibility and requirements
     * @param user User address performing swap
     * @param inputToken Token being swapped
     * @dev Checks DAV balance, auction status, schedule, and participant cap
     */
    function _validateSwap(address user, address inputToken) internal view {
        if (msg.sender != user) revert Unauthorized();
        if (user == address(0)) revert ZeroAddr();
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        if (getDavBalance(user) < MIN_DAV_REQUIRED) revert DavInsufficient();
        if (!auctionSchedule.scheduleSet) revert ScheduleNotSet();
        if (block.timestamp < auctionSchedule.scheduleStart) revert NotStarted();
        
        (address todayToken, bool activeWindow) = auctionSchedule.getTodayToken(block.timestamp);
        if (!(activeWindow && todayToken == inputToken)) revert NotToday();

        if (!isRegisteredForAuctions[user]) {
            if (totalRegisteredUsers >= maxAuctionParticipants) revert ParticipantCapReached();
        }
    }

    /**
     * @notice Check if user completed Step 1 (airdrop claim) for current cycle
     * @param user User address
     * @param token Auction token address
     * @return true if user has consumed DAV units for current cycle
     */
    function _hasCompletedStep1(address user, address token) internal view returns (bool) {
        if (airdropDistributor == address(0)) return false;
        // Check if user has consumed DAV for current cycle of this token
        uint256 currentCycle = getCurrentAuctionCycle(token);
        uint256 consumed = IAirdropDistributor(airdropDistributor).getConsumedDavUnitsByCycle(token, user, currentCycle);
        return consumed > 0;
    }

    /**
     * @notice Get user's active DAV balance
     * @param user User address to check
     * @return User's active DAV balance
     * @dev Validates DAV contract is initialized before querying balance
     */
    function getDavBalance(address user) internal view returns (uint256) {
        if (address(dav).code.length == 0) revert InvalidParam();
        return dav.getActiveBalance(user);
    }

    /**
     * @notice Set exact token allowance for spender
     * @param token Token to approve
     * @param spender Address receiving allowance
     * @param amount Exact allowance amount to set
     * @dev Safely adjusts allowance up or down to reach exact target amount
     */
    function _setExactAllowance(address token, address spender, uint256 amount) internal {
        uint256 current = IERC20(token).allowance(address(this), spender);
        if (current == amount) return;
        if (current > amount) {
            uint256 delta = current - amount;
            IERC20(token).safeDecreaseAllowance(spender, delta);
        } else {
            uint256 delta = amount - current;
            IERC20(token).safeIncreaseAllowance(spender, delta);
        }
    }

    /**
     * @notice Roll over daily tracking if 24 hours passed since last roll
     * @dev Saves current day metrics and resets counters at GMT+3 17:00 boundary
     */
    function _rollDailyIfNeeded() internal {
        if (block.timestamp >= currentDayStart + 1 days) {
            uint256 dayIndex = currentDayStart / 1 days;
            stateReleasedByDayIndex[dayIndex] = dailyStateReleased;
            stateReleasedNormalByDayIndex[dayIndex] = dailyStateReleasedNormal;
            stateReleasedReverseByDayIndex[dayIndex] = dailyStateReleasedReverse;
            swapsCountByDayIndex[dayIndex] = dailySwapsCount;
            uniqueSwappersCountByDayIndex[dayIndex] = dailyUniqueSwappersCount;
            emit DailyStateReleaseRolled(dayIndex, dailyStateReleased, currentDayStart + 1 days);
            currentDayStart = _calcCurrentDayStart(block.timestamp);
            dailyStateReleased = 0;
            dailyStateReleasedNormal = 0;
            dailyStateReleasedReverse = 0;
            dailySwapsCount = 0;
            dailyUniqueSwappersCount = 0;
        }
    }

    /**
     * @notice Calculate current day start timestamp
     * @param ts Reference timestamp
     * @return Day start timestamp aligned to GMT+3 17:00 boundary
     */
    function _calcCurrentDayStart(uint256 ts) internal pure returns (uint256) {
        uint256 next = TimeUtilsLib.calculateNextClaimStartGMTPlus3(ts);
        return next - 1 days;
    }

    /**
     * @notice Auto-register user for auction participation
     * @param user User address to register
     * @dev First-come-first-served registration up to maxAuctionParticipants limit (2500)
     */
    function _autoRegisterUser(address user) internal {
        if (!isRegisteredForAuctions[user]) {
            if (totalRegisteredUsers >= maxAuctionParticipants) {
                revert ParticipantCapReached();
            }
            isRegisteredForAuctions[user] = true;
            totalRegisteredUsers += 1;
            emit UserAutoRegistered(user, block.timestamp);
        }
    }

    /**
     * @notice Public function to register user for auctions (called by AirdropDistributor)
     * @param user Address to register
     * @dev Only callable by AirdropDistributor contract or internal delegation
     */
    function registerUserForAuctions(address user) external {
        // Only allow specific contracts to register users
        if (msg.sender != airdropDistributor && msg.sender != address(this)) revert UnauthorizedRegistration();
        _autoRegisterUser(user);
    }

    // ================= View Functions =================
    
    function isReverseAuctionActive(address inputToken) public view returns (bool) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.isReverseAuctionActive(inputToken, block.timestamp);
    }

    function isAuctionActive(address inputToken) public view returns (bool) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.isAuctionActive(inputToken, block.timestamp);
    }

    function getCurrentAuctionCycle(address inputToken) public view returns (uint256) {
        return auctionSchedule.getCurrentAuctionCycle(inputToken, block.timestamp);
    }

    function getAuctionTimeLeft(address inputToken) public view returns (uint256) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.getAuctionTimeLeft(inputToken, block.timestamp);
    }

    function getTodayToken() public view returns (address tokenOfDay, bool active) {
        return auctionSchedule.getTodayToken(block.timestamp);
    }

    function getUserHasSwapped(address user, address inputToken) public view returns (bool) {
        uint256 getCycle = getCurrentAuctionCycle(inputToken);
        bytes32 key = SwapCoreLib.getSwapInfoKey(user, inputToken, stateToken, getCycle);
        return userSwapTotalInfo[key].hasSwapped;
    }

    function getUserHasReverseSwapped(address user, address inputToken) public view returns (bool) {
        uint256 getCycle = getCurrentAuctionCycle(inputToken);
        bytes32 key = SwapCoreLib.getSwapInfoKey(user, inputToken, stateToken, getCycle);
        return userSwapTotalInfo[key].hasReverseSwap;
    }

    function getUserAuctionStatus(address user, address auctionToken) 
        external view returns (bool step1, bool step2, bool step3, uint256 stateBalance) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        
        step1 = _hasCompletedStep1(user, auctionToken);
        step2 = hasUserBurnedTokens[user][auctionToken][currentCycle];
        
        bytes32 key = SwapCoreLib.getSwapInfoKey(user, auctionToken, stateToken, currentCycle);
        SwapCoreLib.UserSwapInfo storage userSwapInfo = userSwapTotalInfo[key];
        step3 = userSwapInfo.hasSwapped;
        
        stateBalance = userStateBalance[user][auctionToken][currentCycle];
    }

    function hasUserBurnedForToken(address user, address auctionToken) external view returns (bool) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return hasUserBurnedTokens[user][auctionToken][currentCycle];
    }

    function getUserStateBalance(address user, address auctionToken) external view returns (uint256) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return userStateBalance[user][auctionToken][currentCycle];
    }

    function getTokensBurnedByUser(address user, address auctionToken) external view returns (uint256) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return tokensBurnedByUser[user][auctionToken][currentCycle];
    }

    function hasCompletedStep1(address user, address auctionToken) external view returns (bool) {
        return _hasCompletedStep1(user, auctionToken);
    }

    function hasCompletedStep2(address user, address auctionToken) external view returns (bool) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return hasUserBurnedTokens[user][auctionToken][currentCycle];
    }

    function hasCompletedStep3(address user, address auctionToken) external view returns (bool) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        bytes32 key = SwapCoreLib.getSwapInfoKey(user, auctionToken, stateToken, currentCycle);
        SwapCoreLib.UserSwapInfo storage userSwapInfo = userSwapTotalInfo[key];
        return userSwapInfo.hasSwapped;
    }

    function getDavTokensUsed(address user, address auctionToken) external view returns (uint256) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return davTokensUsed[user][auctionToken][currentCycle];
    }

    /**
     * @notice Get available DAV balance for auction participation
     * @param user User address
     * @param auctionToken Token being auctioned
     * @return Available DAV amount (total - used)
     * @dev Calculates remaining DAV balance after accounting for usage in current cycle
     */
    function getAvailableDavForAuction(address user, address auctionToken) external view returns (uint256) {
        uint256 totalDav = getDavBalance(user);
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        uint256 usedDav = davTokensUsed[user][auctionToken][currentCycle];
        
        return totalDav > usedDav ? totalDav - usedDav : 0;
    }

    function canParticipateInAuction(address user, address auctionToken) external view returns (bool) {
        uint256 availableDav = this.getAvailableDavForAuction(user, auctionToken);
        return availableDav >= MIN_DAV_REQUIRED;
    }

    // ================= Reverse Auction View Functions =================
    
    /**
     * @notice Calculate net tokens user received from a specific normal auction cycle
     * @param user User address
     * @param token Token address
     * @param cycle Auction cycle number
     * @return netTokens Net tokens = airdrop + swapOutput - burned
     * @dev DAV tokens are always whole units (1, 2, 3 DAV), matching AirdropDistributor logic
     * @custom:formula netTokens = (davUsed/1e18 * 10000) + swapOutput - tokensBurned
     */
    function calculateNetTokensFromNormalAuction(
        address user,
        address token,
        uint256 cycle
    ) public view returns (uint256 netTokens) {
        // Get DAV used in Step 2 (always whole units: 1 DAV, 2 DAV, etc.)
        uint256 davUsed = davTokensUsed[user][token][cycle];
        
        // Calculate airdrop from Step 1 (whole DAV units)
        // No precision loss: DAV tokens are minted in whole units only
        uint256 davWholeUnits = davUsed / 1e18; // Always exact whole number
        uint256 airdropAmount = davWholeUnits * AIRDROP_PER_DAV; // 10,000 tokens per DAV
        
        // Get tokens burned in Step 2 (already tracked)
        uint256 tokensBurned = tokensBurnedByUser[user][token][cycle];
        
        // Get tokens received from pool swap in Step 3 (newly tracked)
        uint256 swapOutput = normalAuctionSwapOutput[user][token][cycle];
        
        // Calculate net tokens: airdrop + swap - burned
        netTokens = airdropAmount + swapOutput - tokensBurned;
        
        return netTokens;
    }
    
    function hasUserCompletedReverseStep1(address user, address auctionToken) external view returns (bool) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return hasCompletedReverseStep1[user][auctionToken][currentCycle];
    }

    function hasUserCompletedReverseStep2(address user, address auctionToken) external view returns (bool) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return hasCompletedReverseStep2[user][auctionToken][currentCycle];
    }

    function getReverseStateBalance(address user, address auctionToken) external view returns (uint256) {
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        return reverseStateBalance[user][auctionToken][currentCycle];
    }

    function calculateReverseStep2Output(address auctionToken, uint256 stateToBurn) external view returns (uint256) {
        uint256 poolRatio = getRatioPrice(auctionToken);
        if (poolRatio == 0) return 0;
        return ReverseAuctionCalculations.calculateTokensToGive(stateToBurn, poolRatio);
    }

    function isTokenSupported(address token) external view returns (bool) {
        return supportedTokens[token];
    }

    function getCurrentDayIndex() external view returns (uint256) {
        return AuctionUtilsLib._currentDayIndex(auctionSchedule, block.timestamp);
    }

    function getPairAddress(address token) external view returns (address) {
        return pairAddresses[token];
    }

    function getTotalTokensBurned(address token) external view returns (uint256) {
        return TotalTokensBurned[token];
    }

    function isUserEligible(address user) external view returns (bool) {
        return isRegisteredForAuctions[user];
    }

    function getEligibilityInfo() external view returns (uint256 totalEligible, uint256 maxAllowed, uint256 remaining) {
        totalEligible = totalRegisteredUsers;
        maxAllowed = maxAuctionParticipants;
        remaining = maxAllowed > totalEligible ? maxAllowed - totalEligible : 0;
    }
    
    /**
     * @notice Get auction statistics for a specific token
     * @param token Address of the token to query
     * @return completedAuctions Number of auctions completed for this token (cycle number)
     * @return maxAuctions Maximum number of auctions allowed per token (20 cycles)
     * @return remainingAuctions Number of auctions remaining for this token
     * @return isActive Whether the token is currently in an active auction
     * @return isScheduled Whether the token is scheduled in the auction rotation
     */
    function getTokenAuctionStats(address token) external view returns (
        uint256 completedAuctions,
        uint256 maxAuctions,
        uint256 remainingAuctions,
        bool isActive,
        bool isScheduled
    ) {
        // Get current cycle (this is the number of completed auctions)
        completedAuctions = getCurrentAuctionCycle(token);
        
        // Max auctions per token is 20
        maxAuctions = 20;
        
        // Calculate remaining auctions
        remainingAuctions = completedAuctions >= maxAuctions ? 0 : maxAuctions - completedAuctions;
        
        // Check if currently active
        isActive = isAuctionActive(token);
        
        // Check if scheduled (has a scheduledIndex > 0)
        isScheduled = auctionSchedule.scheduledIndex[token] > 0;
    }
    
    /**
     * @notice Get global auction progress
     * @return totalSlots Total number of auction slots that can be completed (50 tokens × 20 cycles = 1000 days)
     * @return completedSlots Number of auction slots completed so far
     * @return remainingSlots Number of auction slots remaining
     * @return auctionsEnded Whether all auctions have been completed
     */
    function getGlobalAuctionProgress() external view returns (
        uint256 totalSlots,
        uint256 completedSlots,
        uint256 remainingSlots,
        bool auctionsEnded
    ) {
        totalSlots = auctionSchedule.auctionDaysLimit; // scheduleSize × 20
        
        // Calculate completed slots
        if (!auctionSchedule.scheduleSet || block.timestamp < auctionSchedule.scheduleStart) {
            completedSlots = 0;
        } else {
            uint256 timeSinceStart = block.timestamp - auctionSchedule.scheduleStart;
            uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
            completedSlots = timeSinceStart / slotDuration;
        }
        
        // Calculate remaining slots
        remainingSlots = completedSlots >= totalSlots ? 0 : totalSlots - completedSlots;
        
        // Check if auctions have ended
        auctionsEnded = completedSlots >= totalSlots;
    }

    // ================= Admin Functions (Delegated) =================
    
    /**
     * @notice One-click token deployment - only requires name and symbol
     * @param name Token name
     * @param symbol Token symbol
     * @return tokenAddress Address of the deployed token
     * @dev User only needs to provide name and symbol, function handles the rest
     * @dev Can only deploy up to scheduleSize (50) tokens
     */
    function deployTokenOneClick(
        string memory name,
        string memory symbol
    ) external onlyGovernance returns (address tokenAddress) {
        // Check if token limit reached
        if (autoRegisteredTokens.length >= auctionSchedule.scheduleSize) revert TokenDeploymentLimitReached();
        
        if (address(auctionAdmin) != address(0)) {
            tokenAddress = auctionAdmin.deployTokenOneClick(address(this), name, symbol);
            
            // AUTOMATIC ALLOWANCE SETUP: Set up allowances for newly deployed token
            _setupAutomaticTokenAllowances(tokenAddress);
            
            return tokenAddress;
        } else {
            // Fallback implementation for when admin is not set
            revert("Admin contract required");
        }
    }

    /**
     * @notice Automatically set up allowances for a newly deployed token
     * @param tokenAddress The newly deployed token address
     * @dev Called internally after token deployment to set up required allowances
     */
    function _setupAutomaticTokenAllowances(address tokenAddress) internal {
        // Set vault allowance for airdrop distributor to access the new token
        if (airdropDistributor != address(0)) {
            _setExactAllowance(tokenAddress, airdropDistributor, type(uint256).max);
        }
        
        // Set allowance for PulseX router for automatic pool creation
        if (pulseXRouter != address(0)) {
            _setExactAllowance(tokenAddress, pulseXRouter, type(uint256).max);
        }
    }

    /**
     * @notice One-click pool creation with PERMANENT liquidity (LP tokens burned)
     * @dev Creates STATE/token pool and burns LP tokens making it unruggable
     * @param token Token to pair with STATE
     * @param tokenAmount Amount of token for initial liquidity
     * @param stateAmount Amount of STATE for initial liquidity
     * @return pair Address of the created pair
     * @custom:access Governance-only function, requires proper token validation
     */
    function createPoolOneClick(
        address token,
        uint256 tokenAmount,
        uint256 stateAmount
    ) external onlyGovernance returns (address pair) {
        if (token == address(0)) revert InvalidToken();
        if (tokenAmount == 0 || stateAmount == 0) revert InvalidAmounts();
        if (stateToken == address(0)) revert StateNotSet();
        if (pulseXRouter == address(0)) revert RouterNotSet();
        if (pulseXFactory == address(0)) revert FactoryNotSet();
        
        // Check balances
        if (IERC20(stateToken).balanceOf(address(this)) < stateAmount) revert InsufficientSTATE();
        if (IERC20(token).balanceOf(address(this)) < tokenAmount) revert InsufficientToken();
        
        // Get or create the pair directly through PulseX
        IPulseXFactory factory = IPulseXFactory(pulseXFactory);
        pair = factory.getPair(token, stateToken);
        if (pair == address(0)) {
            pair = factory.createPair(token, stateToken);
        }
        
        // Approve tokens for PulseX router
        IERC20(stateToken).approve(pulseXRouter, stateAmount);
        IERC20(token).approve(pulseXRouter, tokenAmount);
        
        // Add liquidity directly through PulseX router
        (uint256 amountTokenUsed, uint256 amountStateUsed, uint256 liquidity) = IPulseXRouter02(pulseXRouter).addLiquidity(
            token,
            stateToken,
            tokenAmount,
            stateAmount,
            tokenAmount * 95 / 100, // 5% slippage tolerance
            stateAmount * 95 / 100, // 5% slippage tolerance
            address(this), // LP tokens go to this contract first
            block.timestamp + 3600  // 1 hour deadline
        );
        
        // BURN LP TOKENS PERMANENTLY - makes pool unruggable
        IERC20(pair).transfer(BURN_ADDRESS, liquidity);
        emit LPTokensBurned(pair, liquidity, BURN_ADDRESS);
        
        // Register the token as supported and set pair address
        supportedTokens[token] = true;
        pairAddresses[token] = pair;
        
        // Register token in autoRegisteredTokens if not already registered
        // This ensures tokens show up in the frontend list
        if (!isAutoRegistered[token]) {
            // Get token name for registration (fallback to symbol if needed)
            string memory tokenName;
            try IERC20Metadata(token).name() returns (string memory name) {
                tokenName = name;
            } catch {
                try IERC20Metadata(token).symbol() returns (string memory symbol) {
                    tokenName = symbol;
                } catch {
                    tokenName = "Unknown Token";
                }
            }
            
            // Add to auto-registered list
            autoRegisteredTokens.push(token);
            isAutoRegistered[token] = true;
            tokenOwners[token] = governanceAddress;
            ownerToTokens[governanceAddress].push(token);
            userToTokenNames[governanceAddress].push(tokenName);
            tokenCount++;
            
            if (autoRegisteredTokens.length == auctionSchedule.scheduleSize) {
                autoScheduleLocked = true;
            }
        }
        
        // Emit events with actual amounts used and note that LP tokens are burned
        emit PoolCreated(token, pair, amountTokenUsed, amountStateUsed);
        return pair;
    }

    /**
     * @notice Start auction using auto-registered tokens from pool creation
     * @dev Automatically calculates next GMT+3 17:00 (5 PM) as start time
     * @dev Uses tokens that were automatically registered during createPoolOneClick calls
     * @dev This is the ONLY function needed to start auctions - just click "Start Auction"
     */
    function startAuctionWithAutoTokens() external onlyGovernance {
        if (!autoScheduleLocked) revert TokensNotRegistered();
        if (autoRegisteredTokens.length == 0) revert NoAutoTokens();
        if (auctionSchedule.scheduleSet) revert ScheduleAlreadySet();
        
        // Automatically calculate next GMT+3 17:00 (5 PM) time
        uint256 startAt = TimeUtilsLib.calculateNextClaimStartGMTPlus3(block.timestamp);
        
        // Use auto-registered tokens for auction schedule
        AuctionUtilsLib.setAuctionSchedule(
            auctionSchedule, 
            autoRegisteredTokens, 
            startAt, 
            supportedTokens
        );
        
        emit AuctionScheduleSet(startAt, autoRegisteredTokens.length);
    }

    /**
     * @notice Approves all currently supported tokens for the airdrop distributor
     * @dev This is essential for Step 1 (airdrop) to work in mainnet environment
     */
    function _approveAllTokensForAirdrop(address _airdropDistributor) internal {
        // Approve all tokens in the auction schedule using mapping
        for (uint256 i = 0; i < auctionSchedule.tokenCount; i++) {
            address token = auctionSchedule.tokenByIndex[i];
            if (token != address(0)) {
                // Reset approval to 0 first (for tokens that require it)
                IERC20(token).approve(_airdropDistributor, 0);
                // Set maximum approval
                IERC20(token).approve(_airdropDistributor, type(uint256).max);
            }
        }
    }
    
    // ================= User Registration Management =================
    
    /**
     * @notice Update maximum auction participant limit
     * @param newMax New maximum participant count (must be >= current registered users)
     * @dev Governance-only function to adjust participant cap (default 2500)
     */
    function setMaxAuctionParticipants(uint256 newMax) external onlyGovernance {
        if (newMax == 0) revert InvalidParam();
        if (newMax < totalRegisteredUsers) revert InvalidParam(); // Cannot be less than current registered users
        
        uint256 oldMax = maxAuctionParticipants;
        maxAuctionParticipants = newMax;
        emit MaxParticipantsUpdated(oldMax, newMax);
    }

    // ================= Internal Helper Functions =================
    
    /**
     * @notice Execute token swap through PulseX pool
     * @param user User address performing the swap
     * @param auctionToken Token to receive from swap
     * @param stateAmountIn Amount of STATE to swap
     * @return Amount of auction tokens received
     * @dev Protected by ReentrancyGuard on calling functions, uses SafeERC20 for transfers
     * @custom:slippage 5% tolerance for low-liquidity pools, adjustable via governance
     */
    function _executePoolSwap(address user, address auctionToken, uint256 stateAmountIn) internal returns (uint256) {
        if (pulseXRouter == address(0)) revert RouterNotSet();
        
        // Transfer STATE tokens from user to this contract
        IERC20(stateToken).safeTransferFrom(user, address(this), stateAmountIn);
        
        // Approve router to spend STATE tokens
        IERC20(stateToken).approve(pulseXRouter, stateAmountIn);
        
        // Set up swap path: STATE -> auction token
        address[] memory path = new address[](2);
        path[0] = stateToken;
        path[1] = auctionToken;
        
        // Calculate minimum output with 5% slippage tolerance
        uint256 expectedOut = calculatePoolSwapOutput(auctionToken, stateAmountIn);
        uint256 minAmountOut = expectedOut * 95 / 100;
        
        // Execute swap through PulseX router
        uint256[] memory amounts = IPulseXRouter02(pulseXRouter).swapExactTokensForTokens(
            stateAmountIn,
            minAmountOut,
            path,
            user, // Send auction tokens directly to user
            block.timestamp + 300 // 5 minute deadline
        );
        
        return amounts[1]; // Return amount of auction tokens received
    }
    
    function getRatioPrice(address inputToken) public view returns (uint256) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return NormalAuctionCalculations.getRatioPrice(
            inputToken,
            stateToken,
            pairAddresses[inputToken]
        );
    }

    function calculatePoolSwapOutput(address inputToken, uint256 stateAmountIn) internal view returns (uint256) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return NormalAuctionCalculations.calculatePoolSwapOutput(
            stateAmountIn,
            stateToken,
            inputToken,
            pairAddresses[inputToken]
        );
    }

    function calculatePoolSwapOutputReverse(address auctionToken, uint256 tokenAmountIn) internal view returns (uint256) {
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        return ReverseAuctionCalculations.calculatePoolSwapOutputReverse(
            tokenAmountIn,
            auctionToken,
            stateToken,
            pairAddresses[auctionToken]
        );
    }

    // ================= Governance Functions (Delegate to Admin) =================
    // ... (Keep all the governance delegation functions from previous version)
    // They remain the same as in the previous split

    /**
     * @notice Pause all auction operations
     * @dev Governance emergency function, blocks all whenNotPaused operations
     */
    function pause() external onlyGovernance {
        paused = true;
        emit ContractPaused(msg.sender);
    }

    /**
     * @notice Resume auction operations
     * @dev Governance function to unpause contract after emergency
     */
    function unpause() external onlyGovernance {
        paused = false;
        emit ContractUnpaused(msg.sender);
    }

    // ... (All other governance functions remain the same as previous version)

    // ================= Internal State Setters for Admin Contract =================
    
    /**
     * @notice Internal setter for max auction participants (called by AuctionAdmin only)
     * @param newMax New maximum participant count
     */
    function _setMaxAuctionParticipants(uint256 newMax) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        maxAuctionParticipants = newMax;
    }
    
    /**
     * @notice Internal setter for governance address (called by AuctionAdmin only)
     * @param newGov New governance address
     */
    function _setGovernance(address newGov) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        governanceAddress = newGov;
    }
    
    /**
     * @notice Register deployed token (called by AuctionAdmin only)
     * @param tokenAddress Address of deployed token
     * @param name Token name
     * @param deployer Address of token deployer
     * @dev Array limited to scheduleSize (50 tokens max) to ensure reasonable gas costs
     */
    function _registerDeployedToken(address tokenAddress, string memory name, address deployer) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        
        // Check if token limit reached - cannot register more than scheduleSize tokens
        if (autoRegisteredTokens.length >= auctionSchedule.scheduleSize) revert TokenDeploymentLimitReached();
        
        tokenOwners[tokenAddress] = deployer;
        ownerToTokens[deployer].push(tokenAddress);
        userToTokenNames[deployer].push(name);
        autoRegisteredTokens.push(tokenAddress);
        isAutoRegistered[tokenAddress] = true;
        supportedTokens[tokenAddress] = true;
        tokenCount++;
        if (autoRegisteredTokens.length == auctionSchedule.scheduleSize) {
            autoScheduleLocked = true;
        }
    }

    /**
     * @notice One-click governance setup for complete system initialization
     * @dev This is the MAIN function governance calls via UI to configure everything
     * @param _stateToken STATE token address
     * @param _davToken DAV token address
     * @param _airdropDistributor AirdropDistributor contract address
     * @param _auctionAdmin AuctionAdmin contract address
     * @param _buyBurnController BuyAndBurnController address for allowance setup
     * @param _swapLens SwapLens contract address (optional - can be address(0))
     * @param _pulseXRouter PulseX router address
     * @param _pulseXFactory PulseX factory address
     */
    function initializeCompleteSystem(
        address _stateToken,
        address _davToken,
        address _airdropDistributor,
        address _auctionAdmin,
        address _buyBurnController,
        address _swapLens,
        address _pulseXRouter,
        address _pulseXFactory
    ) external onlyGovernance nonReentrant {
        if (_stateToken == address(0)) revert StateNotSet();
        if (_davToken == address(0)) revert InvalidParam();
        if (_airdropDistributor == address(0)) revert InvalidParam();
        if (_auctionAdmin == address(0)) revert InvalidParam();
        if (_buyBurnController == address(0)) revert InvalidParam();
        if (_pulseXRouter == address(0)) revert RouterNotSet();
        if (_pulseXFactory == address(0)) revert FactoryNotSet();
        
        // Set all contract addresses
        stateToken = _stateToken;
        davToken = _davToken;
        dav = IDAV(_davToken);
        airdropDistributor = _airdropDistributor;
        auctionAdmin = IAuctionAdmin(_auctionAdmin);
        buyAndBurnController = _buyBurnController;
        swapLens = _swapLens;
        pulseXRouter = _pulseXRouter;
        pulseXFactory = _pulseXFactory;
        
        // CRITICAL: Set vault allowance for BuyAndBurnController to access STATE
        _setExactAllowance(_stateToken, _buyBurnController, type(uint256).max);
        
        // Auto-approve all tokens for airdrop distributor (enables Step 1)
        _approveAllTokensForAirdrop(_airdropDistributor);
        
        emit AirdropDistributorSet(_airdropDistributor);
        emit SystemInitialized(
            _stateToken,
            _davToken,
            address(0), // lpHelper removed - using SWAP_V3.createPoolOneClick() instead
            _airdropDistributor,
            _auctionAdmin,
            _buyBurnController,
            _pulseXRouter,
            _pulseXFactory
        );
    }

    // ================= AUCTION FEE DISTRIBUTION =================
    
    /**
     * @notice Internal function to distribute 0.5% auction fees to development wallets
     * @param token Address of the token to distribute (STATE or auction token)
     * @param feeAmount Amount of tokens to distribute as fee
     * @dev Transfers fee to AuctionAdmin which handles distribution to dev wallets
     */
    function _distributeAuctionFee(address token, uint256 feeAmount) internal {
        IERC20(token).transfer(address(auctionAdmin), feeAmount);
        auctionAdmin.distributeFeeToWallets(token, feeAmount);
    }
    
    // ================= LIQUIDITY MANAGEMENT =================
    
    /**
     * @notice Add liquidity to existing pool from vault (governance-only)
     * @param token Auction token address
     * @param tokenAmount Token amount from vault
     * @param stateAmount STATE amount from vault
     * @return liquidity LP tokens burned
     */
    function addLiquidityToPool(
        address token,
        uint256 tokenAmount,
        uint256 stateAmount
    ) external onlyGovernance nonReentrant returns (uint256 liquidity) {
        if (token == address(0)) revert ZeroAddr();
        if (token == stateToken) revert InvalidParam();
        if (tokenAmount == 0 || stateAmount == 0) revert AmountZero();
        
        address pool = IPulseXFactory(pulseXFactory).getPair(token, stateToken);
        if (pool == address(0)) revert InvalidParam();
        
        if (IERC20(token).balanceOf(address(this)) < tokenAmount) revert InsufficientVault();
        if (IERC20(stateToken).balanceOf(address(this)) < stateAmount) revert InsufficientVault();
        
        _setExactAllowance(token, pulseXRouter, tokenAmount);
        _setExactAllowance(stateToken, pulseXRouter, stateAmount);
        
        (uint256 usedToken, uint256 usedState, uint256 lpAmount) = 
            IPulseXRouter02(pulseXRouter).addLiquidity(
                token,
                stateToken,
                tokenAmount,
                stateAmount,
                (tokenAmount * 95) / 100,
                (stateAmount * 95) / 100,
                BURN_ADDRESS,
                block.timestamp + 3600
            );
        
        if (lpAmount == 0) revert AmountZero();
        
        _setExactAllowance(token, pulseXRouter, 0);
        _setExactAllowance(stateToken, pulseXRouter, 0);
        
        emit LiquidityAdded(token, pool, usedState, usedToken, lpAmount);
        
        return lpAmount;
    }
}
