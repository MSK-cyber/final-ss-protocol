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

interface ILPHelper {
    function factory() external view returns (address);
    function createLPAndRegister(
        address token,
        address tokenOwner,
        uint256 amountStateDesired,
        uint256 amountTokenDesired,
        uint256 amountStateMin,
        uint256 amountTokenMin,
        uint256 deadline
    ) external;
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

contract SWAP_V3 is Ownable(msg.sender), ReentrancyGuard, SwapErrors, SwapEvents {
    using SafeERC20 for IERC20;
    using TimeUtilsLib for uint256;
    using AuctionLib for AuctionLib.AuctionCycle;
    using SwapCoreLib for SwapCoreLib.SwapParams;
    using BurnLib for BurnLib.BurnParams;
    using AuctionUtilsLib for AuctionUtilsLib.AuctionSchedule;
    
    error DeadlineExpired();
    error SlippageExceeded();

    // ================= State Variables =================
    
    IDAV public dav;
    
    // Constants
    uint256 public constant CLAIM_INTERVAL = 100 days;
    uint256 public constant MAX_SUPPLY = 500000000000 ether;
    uint256 constant MIN_DAV_REQUIRED = 1 ether;
    uint256 constant DAV_FACTOR = 5000000 ether;
    uint256 constant AIRDROP_AMOUNT = 10000 ether;
    uint256 constant TOKEN_OWNER_AIRDROP = 1000000 ether;
    uint256 constant GOV_OWNER_AIRDROP = 0 ether;
    uint256 constant PRECISION_FACTOR = 1e18;
    uint256 public constant percentage = 3;
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 constant TOKENS_PER_DAV = 3000 ether;
    uint256 constant STATE_MULTIPLIER = 2;
    uint256 public constant PROTOCOL_FEE_BPS = 50;
    uint256 public constant NORMAL_BURN_BPS = 3000;
    uint256 public constant GOVERNANCE_UPDATE_DELAY = 7 days;
    uint256 public constant MAX_TOTAL_AUCTIONS = 1000;
    
    // Core addresses
    address public stateToken;
    address public davToken;
    address public governanceAddress;
    address public DevAddress;
    address public airdropDistributor;
    IAuctionAdmin public auctionAdmin;
    address public pendingGovernance;
    address public pulseXRouter;
    address public pulseXFactory;
    address public lpHelper;
    address public treasury;
    
    // State variables
    uint256 public TotalBurnedStates;
    uint256 public governanceUpdateTimestamp;
    bool public paused = false;
    uint256 public maxAuctionParticipants = 5000;
    
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
    
    mapping(address => mapping(address => uint256)) private lastDavHolding;
    mapping(address => string[]) private userToTokenNames;
    mapping(address => mapping(string => address)) private deployedTokensByUser;
    mapping(address => address) private pairAddresses;
    mapping(address => bool) private usedPairAddresses;
    mapping(address => bool) private supportedTokens;
    mapping(address => address) private tokenOwners;
    mapping(address => address[]) private ownerToTokens;
    mapping(string => bool) private isTokenNameUsed;
    mapping(address => mapping(address => mapping(uint256 => bool))) private claimedBatches;
    mapping(address => mapping(address => uint256)) private lastClaimTime;
    uint256 public tokenCount;
    mapping(address => uint256) private tokenNumber;
    mapping(bytes32 => SwapCoreLib.UserSwapInfo) private userSwapTotalInfo;
    
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasUserBurnedTokens;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private userStateBalance;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private tokensBurnedByUser;
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasClaimedAirdrop;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private davTokensUsed;
    
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasCompletedReverseStep1;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private reverseStateBalance;
    mapping(address => mapping(address => mapping(uint256 => bool))) private hasCompletedReverseStep2;

    mapping(address => mapping(address => AuctionLib.AuctionCycle)) private auctionCycles;
    mapping(address => uint256) private TotalStateBurnedByUser;
    mapping(address => uint256) private TotalTokensBurned;
    mapping(address => mapping(address => bool)) private hasClaimed;
    mapping(address => uint256) private totalClaimedByUser;
    mapping(address => uint256) private totalClaimedByGovernance;

    mapping(address => uint256) private accruedProtocolFees;
    mapping(address => uint256) private accruedBurnBalances;

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
    
    modifier onlyGovOrLPHelper() {
        if (msg.sender != governanceAddress && msg.sender != lpHelper) revert NotGovernance();
        _;
    }

    // ================= Constructor =================
    
    constructor(address _gov, address _dev) {
        governanceAddress = _gov;
        DevAddress = _dev;
        currentDayStart = _calcCurrentDayStart(block.timestamp);
        treasury = _gov;
        auctionSchedule.scheduleSize = 3;
        auctionSchedule.auctionDaysLimit = 1000;
    }

    // ================= Core Auction Functions (Simplified) =================
    
    function swapTokens(address user, address inputToken) public nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
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
        
        if (!auctionSchedule.isAuctionActive(inputToken, block.timestamp, AuctionLib.AUCTION_DURATION)) 
            revert NotStarted();
        if (userSwapInfo.hasSwapped) revert AlreadySwapped();
        
        uint256 userStateFromBurn = userStateBalance[user][inputToken][currentAuctionCycle];
        if (userStateFromBurn == 0) revert Step2NotCompleted();
        
        // Check if user has approved this contract to spend their STATE tokens
        uint256 stateAllowance = IERC20(stateToken).allowance(user, address(this));
        if (stateAllowance < userStateFromBurn) revert InsufficientAllowance();
        
        // STEP 3: Execute actual swap through PulseX pool (not from contract balance)
        uint256 amountOut = _executePoolSwap(user, inputToken, userStateFromBurn);
        if (amountOut == 0) revert AmountZero();
        
        // Mark swap as completed
        userSwapInfo.hasSwapped = true;
        userStateBalance[user][inputToken][currentAuctionCycle] = 0;
        
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

    function burnTokensForState(address auctionToken) external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // User should already be registered from Step 1 (AirdropDistributor.claim)
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        // STEP 1 VALIDATION
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        if (!_hasCompletedStep1(msg.sender, auctionToken)) revert Step1NotCompleted();
        
        uint256 totalDavBalance = getDavBalance(msg.sender);
        if (totalDavBalance < MIN_DAV_REQUIRED) revert DavInsufficient();
        
        if (hasUserBurnedTokens[msg.sender][auctionToken][currentCycle]) revert AlreadySwapped();
        
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
        
        if (IERC20(stateToken).balanceOf(address(this)) < stateToGive) revert InsufficientVault();
        
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
        
        emit TokensSwapped(msg.sender, auctionToken, stateToken, tokensToBurn, stateToGive);
    }

    function reverseSwapTokensForState(address auctionToken, uint256 tokenAmount) external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        // Auto-register user if not already registered
        _autoRegisterUser(msg.sender);
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        if (!isReverseAuctionActive(auctionToken)) revert NotStarted();
        
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        
        if (hasCompletedReverseStep1[msg.sender][auctionToken][currentCycle]) revert AlreadySwapped();
        
        uint256 davBalance = getDavBalance(msg.sender);
        if (davBalance < MIN_DAV_REQUIRED) revert DavInsufficient();
        
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

    function burnStateForTokens(address auctionToken, uint256 stateToBurn) external nonReentrant whenNotPaused {
        _rollDailyIfNeeded();
        
        if (!supportedTokens[auctionToken]) revert UnsupportedToken();
        if (stateToken == address(0)) revert StateNotSet();
        
        if (!isReverseAuctionActive(auctionToken)) revert NotStarted();
        
        uint256 currentCycle = getCurrentAuctionCycle(auctionToken);
        
        if (!hasCompletedReverseStep1[msg.sender][auctionToken][currentCycle]) revert Step1NotCompleted();
        if (hasCompletedReverseStep2[msg.sender][auctionToken][currentCycle]) revert AlreadySwapped();
        
        uint256 stateFromStep1 = reverseStateBalance[msg.sender][auctionToken][currentCycle];
        if (stateFromStep1 == 0) revert Step1NotCompleted();
        
        uint256 minimumBurn = ReverseAuctionCalculations.calculateMinimumBurn(stateFromStep1);
        if (stateToBurn < minimumBurn) revert InsufficientBalance();
        if (stateToBurn > stateFromStep1) revert InsufficientBalance();
        if (stateToBurn == 0) revert AmountZero();
        
        uint256 userCurrentStateBalance = IERC20(stateToken).balanceOf(msg.sender);
        if (userCurrentStateBalance < stateToBurn) revert InsufficientBalance();
        
        uint256 poolRatio = getRatioPrice(auctionToken);
        if (poolRatio == 0) revert InvalidParam();
        
        uint256 tokensToGive = ReverseAuctionCalculations.calculateTokensToGive(stateToBurn, poolRatio);
        if (tokensToGive == 0) revert AmountZero();
        
        if (IERC20(auctionToken).balanceOf(address(this)) < tokensToGive) revert InsufficientVault();
        
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
        
        emit TokensSwapped(msg.sender, stateToken, auctionToken, stateToBurn, tokensToGive);
    }

    // ================= Internal Functions =================
    
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
        
        uint256 dayIndex = auctionSchedule._currentDayIndex(block.timestamp);
        if (dayIndex >= auctionSchedule.auctionDaysLimit) revert Ended();

        if (!isRegisteredForAuctions[user]) {
            if (totalRegisteredUsers >= maxAuctionParticipants) revert ParticipantCapReached();
        }
    }

    function _hasCompletedStep1(address user, address token) internal view returns (bool) {
        if (airdropDistributor == address(0)) return false;
        // Check if user has consumed DAV for current cycle of this token
        uint256 currentCycle = getCurrentAuctionCycle(token);
        uint256 consumed = IAirdropDistributor(airdropDistributor).getConsumedDavUnitsByCycle(token, user, currentCycle);
        return consumed > 0;
    }

    function getDavBalance(address user) internal view returns (uint256) {
        if (address(dav).code.length == 0) revert InvalidParam();
        return dav.getActiveBalance(user);
    }

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

    function _calcCurrentDayStart(uint256 ts) internal pure returns (uint256) {
        uint256 next = TimeUtilsLib.calculateNextClaimStartPakistan(ts);
        return next - 1 days;
    }

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
     */
    function registerUserForAuctions(address user) external {
        // Only allow specific contracts to register users
        require(msg.sender == airdropDistributor || msg.sender == address(this), "Unauthorized registration");
        _autoRegisterUser(user);
    }

    // ================= View Functions =================
    
    function isReverseAuctionActive(address inputToken) public view returns (bool) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.isReverseAuctionActive(inputToken, block.timestamp, AuctionLib.AUCTION_DURATION);
    }

    function isAuctionActive(address inputToken) public view returns (bool) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.isAuctionActive(inputToken, block.timestamp, AuctionLib.AUCTION_DURATION);
    }

    function getCurrentAuctionCycle(address inputToken) public view returns (uint256) {
        return auctionSchedule.getCurrentAuctionCycle(inputToken, block.timestamp);
    }

    function getAuctionTimeLeft(address inputToken) public view returns (uint256) {
        if (!supportedTokens[inputToken]) revert UnsupportedToken();
        return auctionSchedule.getAuctionTimeLeft(inputToken, block.timestamp, AuctionLib.AUCTION_DURATION);
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

    // ================= Admin Functions (Delegated) =================
    
    /**
     * @notice One-click token deployment - only requires name and symbol
     * @param name Token name
     * @param symbol Token symbol
     * @return tokenAddress Address of the deployed token
     * @dev User only needs to provide name and symbol, function handles the rest
     */
    function deployTokenOneClick(
        string memory name,
        string memory symbol
    ) external onlyGovernance returns (address tokenAddress) {
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

    function setPairAddress(address token, address pair) external onlyGovernance {
        auctionAdmin.registerTokenWithPair(address(this), token, governanceAddress, pair);
    }

    /**
     * @notice One-click pool creation with PERMANENT liquidity (LP tokens burned)
     * @dev Creates STATE/token pool and burns LP tokens making it UNRUGGABLE
     * @param token Token to pair with STATE
     * @param tokenAmount Amount of token for initial liquidity
     * @param stateAmount Amount of STATE for initial liquidity
     * @return pair Address of the created pair
     */
    function createPoolOneClick(
        address token,
        uint256 tokenAmount,
        uint256 stateAmount
    ) external onlyGovernance returns (address pair) {
        require(token != address(0), "Invalid token");
        require(tokenAmount > 0 && stateAmount > 0, "Invalid amounts");
        require(stateToken != address(0), "STATE token not set");
        require(pulseXRouter != address(0), "Router not set");
        require(pulseXFactory != address(0), "Factory not set");
        
        // Check balances
        require(IERC20(stateToken).balanceOf(address(this)) >= stateAmount, "Insufficient STATE");
        require(IERC20(token).balanceOf(address(this)) >= tokenAmount, "Insufficient token");
        
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


    function setAuctionSchedule(address[] calldata tokens, uint256 startAt) external onlyGovernance {
        AuctionUtilsLib.setAuctionSchedule(auctionSchedule, tokens, startAt, supportedTokens);
    }

    /**
     * @notice Start auction using auto-registered tokens from pool creation
     * @dev Uses tokens that were automatically registered during createPoolOneClick calls
     * @param startAt Timestamp when auction should start (can be future time)
     */
    function startAuctionWithAutoTokens(uint256 startAt) external onlyGovernance {
        require(autoScheduleLocked, "Not all tokens registered yet");
        require(autoRegisteredTokens.length > 0, "No auto-registered tokens");
        require(!auctionSchedule.scheduleSet, "Auction schedule already set");
        require(startAt >= block.timestamp, "Start time must be in future or now");
        
        // Use auto-registered tokens for auction schedule
        AuctionUtilsLib.setAuctionSchedule(
            auctionSchedule, 
            autoRegisteredTokens, 
            startAt, 
            supportedTokens
        );
        
        emit AuctionScheduleSet(startAt, autoRegisteredTokens.length);
    }


    function setAirdropDistributor(address _airdropDistributor) external onlyGovernance {
        if (_airdropDistributor == address(0)) revert ZeroAddr();
        airdropDistributor = _airdropDistributor;
        
        // CRITICAL: Auto-approve all supported tokens for the airdrop distributor
        // This ensures Step 1 works in real mainnet deployment without manual intervention
        _approveAllTokensForAirdrop(_airdropDistributor);
        
        emit AirdropDistributorSet(_airdropDistributor);
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
    
    function setMaxAuctionParticipants(uint256 newMax) external onlyGovernance {
        if (newMax == 0) revert InvalidParam();
        if (newMax < totalRegisteredUsers) revert InvalidParam(); // Cannot be less than current registered users
        
        uint256 oldMax = maxAuctionParticipants;
        maxAuctionParticipants = newMax;
        emit MaxParticipantsUpdated(oldMax, newMax);
    }

    // ================= Internal Helper Functions =================
    
    function _executePoolSwap(address user, address auctionToken, uint256 stateAmountIn) internal returns (uint256) {
        require(pulseXRouter != address(0), "Router not set");
        
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

    function pause() external onlyGovernance {
        if (address(auctionAdmin) != address(0)) {
            auctionAdmin.pause(address(this));
        } else {
            paused = true;
            emit ContractPaused(msg.sender);
        }
    }

    function unpause() external onlyGovernance {
        if (address(auctionAdmin) != address(0)) {
            auctionAdmin.unpause(address(this));
        } else {
            paused = false;
            emit ContractUnpaused(msg.sender);
        }
    }

    // ... (All other governance functions remain the same as previous version)

    // ================= Internal State Setters for Admin Contract =================
    
    function _setPaused(bool _paused) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
        paused = _paused;
    }
    
    function _setMaxAuctionParticipants(uint256 newMax) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
        maxAuctionParticipants = newMax;
    }
    
    function _setDexAddresses(address _router, address _factory) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
        pulseXRouter = _router;
        pulseXFactory = _factory;
    }
    
    function _setGovernance(address newGov) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
        governanceAddress = newGov;
    }
    
    function _setPendingGovernance(address pending, uint256 timestamp) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
        pendingGovernance = pending;
        governanceUpdateTimestamp = timestamp;
    }
    
    function _registerDeployedToken(address tokenAddress, string memory name, address deployer) external {
        require(msg.sender == address(auctionAdmin), "Only admin");
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


    /// @notice Approve a spender to pull tokens from the SWAP vault (required by BuyAndBurnController)
    /// @dev Resets allowance to 0 before setting the new amount to comply with non-standard ERC20s
    function setVaultAllowance(address token, address spender, uint256 amount) external onlyGovernance nonReentrant {
        require(token != address(0) && spender != address(0), "Zero address");
        _setExactAllowance(token, spender, amount);
    }

    /// @notice Batch-approve a single spender for multiple tokens from the SWAP vault
    function setVaultAllowances(address[] calldata tokens, address spender, uint256 amount) external onlyGovernance nonReentrant {
        require(spender != address(0), "Zero spender address");
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            require(token != address(0), "Zero token address");
            _setExactAllowance(token, spender, amount);
        }
    }

    /// @notice Governance function to directly distribute tokens from SWAP vault to recipients
    /// @dev This is the proper UI-based governance function that handles distribution internally
    /// @param token The token address to distribute
    /// @param recipient The address to receive the tokens
    /// @param amount The amount of tokens to distribute
    function distributeFromVault(address token, address recipient, uint256 amount) external onlyGovernance nonReentrant {
        require(token != address(0), "Zero token address");
        require(recipient != address(0), "Zero recipient address");
        require(amount > 0, "Zero amount");
        
        // Check vault balance
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        require(vaultBalance >= amount, "Insufficient vault balance");
        
        // Direct transfer from vault to recipient
        IERC20(token).transfer(recipient, amount);
        
        emit VaultDistribution(token, recipient, amount);
    }

    /// @notice Batch distribute tokens from SWAP vault to multiple recipients
    /// @dev Governance function for efficient batch distributions
    /// @param token The token address to distribute
    /// @param recipients Array of recipient addresses
    /// @param amounts Array of amounts corresponding to each recipient
    function batchDistributeFromVault(address token, address[] calldata recipients, uint256[] calldata amounts) external onlyGovernance nonReentrant {
        require(token != address(0), "Zero token address");
        require(recipients.length == amounts.length, "Array length mismatch");
        require(recipients.length > 0, "Empty arrays");
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            require(recipients[i] != address(0), "Zero recipient address");
            require(amounts[i] > 0, "Zero amount");
            totalAmount += amounts[i];
        }
        
        // Check vault balance for total amount
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        require(vaultBalance >= totalAmount, "Insufficient vault balance");
        
        // Execute all transfers
        for (uint256 i = 0; i < recipients.length; i++) {
            IERC20(token).transfer(recipients[i], amounts[i]);
            emit VaultDistribution(token, recipients[i], amounts[i]);
        }
    }
    
    /**
     * @notice One-click governance setup for complete system initialization
     * @dev This is the MAIN function governance calls via UI to configure everything
     * @param _stateToken STATE token address
     * @param _davToken DAV token address  
     * @param _lpHelper LPHelper contract address
     * @param _airdropDistributor AirdropDistributor contract address
     * @param _auctionAdmin AuctionAdmin contract address
     * @param _buyBurnController BuyAndBurnController address for allowance setup
     * @param _pulseXRouter PulseX router address
     * @param _pulseXFactory PulseX factory address
     */
    function initializeCompleteSystem(
        address _stateToken,
        address _davToken,
        address _lpHelper,
        address _airdropDistributor,
        address _auctionAdmin,
        address _buyBurnController,
        address _pulseXRouter,
        address _pulseXFactory
    ) external onlyGovernance nonReentrant {
        require(_stateToken != address(0), "Invalid STATE token");
        require(_davToken != address(0), "Invalid DAV token");
        require(_lpHelper != address(0), "Invalid LP Helper");
        require(_airdropDistributor != address(0), "Invalid airdrop distributor");
        require(_auctionAdmin != address(0), "Invalid auction admin");
        require(_buyBurnController != address(0), "Invalid buy burn controller");
        require(_pulseXRouter != address(0), "Invalid PulseX router");
        require(_pulseXFactory != address(0), "Invalid PulseX factory");
        
        // Set all contract addresses
        stateToken = _stateToken;
        dav = IDAV(_davToken);
        lpHelper = _lpHelper;
        airdropDistributor = _airdropDistributor;
        auctionAdmin = IAuctionAdmin(_auctionAdmin);
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
            _lpHelper,
            _airdropDistributor,
            _auctionAdmin,
            _buyBurnController,
            _pulseXRouter,
            _pulseXFactory
        );
    }
    
    /**
     * @notice Setup token allowances for airdrop distributor - governance UI function
     * @dev Call this after deploying new tokens to enable Step 1 (airdrop)
     * @param tokens Array of token addresses to approve for airdrop
     */
    function setupTokenAllowancesForAirdrop(address[] calldata tokens) external onlyGovernance nonReentrant {
        require(airdropDistributor != address(0), "Airdrop distributor not set");
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            require(token != address(0), "Zero token address");
            require(supportedTokens[token], "Token not supported");
            
            // Reset approval to 0 first (for tokens that require it)
            IERC20(token).approve(airdropDistributor, 0);
            // Set maximum approval
            IERC20(token).approve(airdropDistributor, type(uint256).max);
        }
    }

    // Additional view functions and events...
}