// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// src/libraries/AuctionLib.sol

library AuctionLib {
    uint256 public constant AUCTION_DURATION = 2 hours; // 2 hours auction duration
    uint256 public constant AUCTION_INTERVAL = 0; // No gap between auctions
    
    struct AuctionCycle {
        uint256 firstAuctionStart;
        bool isInitialized;
        uint256 auctionCount;
    }
}

// lib/openzeppelin-contracts/contracts/utils/Context.sol

// OpenZeppelin Contracts (last updated v5.0.1) (utils/Context.sol)

/**
 * @dev Provides information about the current execution context, including the
 * sender of the transaction and its data. While these are generally available
 * via msg.sender and msg.data, they should not be accessed in such a direct
 * manner, since when dealing with meta-transactions the account sending and
 * paying for execution may not be the actual sender (as far as an application
 * is concerned).
 *
 * This contract is only required for intermediate, library-like contracts.
 */
abstract contract Context {
    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    function _contextSuffixLength() internal view virtual returns (uint256) {
        return 0;
    }
}

// src/interfaces/IAuctionAdmin.sol

interface IAuctionAdmin {
    function pause(address swapContract) external;
    function unpause(address swapContract) external;
    function setMaxAuctionParticipants(address swapContract, uint256 newMax) external;
    function setDexAddresses(address swapContract, address _router, address _factory) external;
    function deployTokenOneClick(address swapContract, string memory name, string memory symbol) external returns (address tokenAddress);
    function updateGovernance(address swapContract, address newGov) external;
    function confirmGovernanceUpdate(address swapContract) external;
    function transferProtocolGovernance(address swapContract, address newGovernance) external;
    function setDavTokenAddress(address swapContract, address _davToken) external;
    function depositTokens(address swapContract, address token, uint256 amount) external;
    function deployUserToken(address swapContract, string memory name, string memory symbol, address _One, address _swap, address _owner) external returns (address);
    function addToken(address swapContract, address token, address pairAddress, address _tokenOwner) external;
    function setAuctionSchedule(address swapContract, address[] calldata tokens) external;
    function setScheduleSize(address swapContract, uint256 newSize) external;
    function setAuctionDaysLimit(address swapContract, uint256 daysLimit) external;
    function setLPHelper(address swapContract, address helper) external;
    function setTreasury(address swapContract, address _treasury) external;
    function withdrawAccruedFees(address swapContract, address token, uint256 amount, address to) external;
    function setVaultAllowance(address swapContract, address token, address spender, uint256 amount) external;
    function setVaultAllowances(address swapContract, address[] calldata tokens, address spender, uint256 amount) external;
    function createPoolForToken(address swapContract, address auctionToken, uint256 tokenAmount, uint256 stateAmount, address tokenOwner) external returns (address pair);
    function startAutoAuction(address swapContract) external;
    function registerTokenWithPair(address swapContract, address token, address tokenOwner, address pairAddress) external;
    
    // Development Fee Wallet Management
    function addDevelopmentFeeWallet(address wallet, uint256 percentage) external;
    function removeDevelopmentFeeWallet(address wallet) external;
    function updateDevelopmentFeeWalletPercentage(address wallet, uint256 newPercentage) external;
    function getDevelopmentFeeWalletsInfo() external view returns (
        address[] memory wallets,
        uint256[] memory percentages,
        bool[] memory activeStatuses
    );
    function getWalletPercentage(address wallet) external view returns (uint256);
    function distributeFeeToWallets(address token, uint256 amount) external;
}

// lib/openzeppelin-contracts/contracts/utils/introspection/IERC165.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/introspection/IERC165.sol)

/**
 * @dev Interface of the ERC-165 standard, as defined in the
 * https://eips.ethereum.org/EIPS/eip-165[ERC].
 *
 * Implementers can declare support of contract interfaces, which can then be
 * queried by others ({ERC165Checker}).
 *
 * For an implementation, see {ERC165}.
 */
interface IERC165 {
    /**
     * @dev Returns true if this contract implements the interface defined by
     * `interfaceId`. See the corresponding
     * https://eips.ethereum.org/EIPS/eip-165#how-interfaces-are-identified[ERC section]
     * to learn more about how these ids are created.
     *
     * This function call must use less than 30 000 gas.
     */
    function supportsInterface(bytes4 interfaceId) external view returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/IERC20.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/IERC20.sol)

/**
 * @dev Interface of the ERC-20 standard as defined in the ERC.
 */
interface IERC20 {
    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);

    /**
     * @dev Returns the value of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the value of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address to, uint256 value) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the
     * allowance mechanism. `value` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

// src/interfaces/IPair.sol

interface IPair {
    function getReserves()
        external
        view
        returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
    function token1() external view returns (address);
}

// lib/openzeppelin-contracts/contracts/utils/ReentrancyGuard.sol

// OpenZeppelin Contracts (last updated v5.1.0) (utils/ReentrancyGuard.sol)

/**
 * @dev Contract module that helps prevent reentrant calls to a function.
 *
 * Inheriting from `ReentrancyGuard` will make the {nonReentrant} modifier
 * available, which can be applied to functions to make sure there are no nested
 * (reentrant) calls to them.
 *
 * Note that because there is a single `nonReentrant` guard, functions marked as
 * `nonReentrant` may not call one another. This can be worked around by making
 * those functions `private`, and then adding `external` `nonReentrant` entry
 * points to them.
 *
 * TIP: If EIP-1153 (transient storage) is available on the chain you're deploying at,
 * consider using {ReentrancyGuardTransient} instead.
 *
 * TIP: If you would like to learn more about reentrancy and alternative ways
 * to protect against it, check out our blog post
 * https://blog.openzeppelin.com/reentrancy-after-istanbul/[Reentrancy After Istanbul].
 */
abstract contract ReentrancyGuard {
    // Booleans are more expensive than uint256 or any type that takes up a full
    // word because each write operation emits an extra SLOAD to first read the
    // slot's contents, replace the bits taken up by the boolean, and then write
    // back. This is the compiler's defense against contract upgrades and
    // pointer aliasing, and it cannot be disabled.

    // The values being non-zero value makes deployment a bit more expensive,
    // but in exchange the refund on every call to nonReentrant will be lower in
    // amount. Since refunds are capped to a percentage of the total
    // transaction's gas, it is best to keep them low in cases like this one, to
    // increase the likelihood of the full refund coming into effect.
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;

    uint256 private _status;

    /**
     * @dev Unauthorized reentrant call.
     */
    error ReentrancyGuardReentrantCall();

    constructor() {
        _status = NOT_ENTERED;
    }

    /**
     * @dev Prevents a contract from calling itself, directly or indirectly.
     * Calling a `nonReentrant` function from another `nonReentrant`
     * function is not supported. It is possible to prevent this from happening
     * by making the `nonReentrant` function external, and making it call a
     * `private` function that does the actual work.
     */
    modifier nonReentrant() {
        _nonReentrantBefore();
        _;
        _nonReentrantAfter();
    }

    function _nonReentrantBefore() private {
        // On the first call to nonReentrant, _status will be NOT_ENTERED
        if (_status == ENTERED) {
            revert ReentrancyGuardReentrantCall();
        }

        // Any calls to nonReentrant after this point will fail
        _status = ENTERED;
    }

    function _nonReentrantAfter() private {
        // By storing the original value once again, a refund is triggered (see
        // https://eips.ethereum.org/EIPS/eip-2200)
        _status = NOT_ENTERED;
    }

    /**
     * @dev Returns true if the reentrancy guard is currently set to "entered", which indicates there is a
     * `nonReentrant` function in the call stack.
     */
    function _reentrancyGuardEntered() internal view returns (bool) {
        return _status == ENTERED;
    }
}

// src/interfaces/SwapErrors.sol

interface SwapErrors {
    error NotGovernance();
    error Unauthorized();
    error PausedErr();
    error UnsupportedToken();
    error ZeroAddr();
    error AlreadySet();
    error ScheduleNotSet();
    error NotStarted();
    error NotToday();
    error Ended();
    error AlreadySwapped();
    error AlreadyReverse();
    error StateNotSet();
    error DavInsufficient();
    error InvalidParam();
    error PairInvalid();
    error PairUsed();
    error TokenExists();
    error NoDAV();
    error InvalidReserves();
    error ReserveFetchFail();
    error InsufficientVault();
    error AmountZero();
    error TimelockNotExpired();
    error NoPendingGov();
    error BadTreasury();
    error ReverseDayLPOonly();
    error ParticipantCapReached();
    error InsufficientBalance();
    error InsufficientAllowance();
    error Step1NotCompleted();
    error Step2NotCompleted();
    error UserNotEligible();
    error NoNormalAuctionParticipation();
    error ExceedsReverseLimit();
    
    // Phase 2 Optimization - New Errors
    error NoActiveAuction();
    error ReverseAuctionActive();
    error NormalAuctionActive();
    error InvalidToken();
    error InvalidAmounts();
    error RouterNotSet();
    error FactoryNotSet();
    error InsufficientSTATE();
    error InsufficientToken();
    error OnlyAdmin();
    error TokensNotRegistered();
    error NoAutoTokens();
    error ScheduleAlreadySet();
    error InvalidStartTime();
    error ArrayLengthMismatch();
    error EmptyArrays();
    error AirdropNotSet();
    error TokenNotSupported();
    error UnauthorizedRegistration();
    error AuctionCyclesCompleted();
    error TokenDeploymentLimitReached();
}

// src/interfaces/SwapEvents.sol

interface SwapEvents {
    event DailyStateReleaseRolled(uint256 indexed dayIndex, uint256 amount, uint256 newDayStart);
    event AuctionStarted(uint256 startTime, uint256 endTime, address inputToken, address stateToken);
    event TokenDeployed(string name, address tokenAddress, uint256 tokenNo);
    event TokensDeposited(address indexed token, uint256 amount);
    event RewardDistributed(address indexed user, uint256 amount);
    event TokensSwapped(address indexed user, address indexed inputToken, address indexed stateToken, uint256 amountIn, uint256 amountOut);
    event TokenAdded(address indexed token, address pairAddress);
    event GovernanceUpdateProposed(address newGov, uint256 timestamp);
    event GovernanceUpdated(address newGov);
    event ContractPaused(address by);
    event ContractUnpaused(address by);
    event AuctionScheduleSet(uint256 startAt, uint256 count);
    event AuctionDaysLimitUpdated(uint256 newLimit);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeeAccrued(address indexed token, uint256 amount);
    event BurnAccrued(address indexed token, uint256 amount);
    event NewDayStarted(uint256 newDayStart);
    event AuctionAdminSet(address indexed admin);
    event AirdropDistributorSet(address indexed airdropDistributor);
    event DavTokenAddressSet(address indexed davToken);
    event DexAddressesUpdated(address router, address factory);
    event UserAutoRegistered(address indexed user, uint256 timestamp);
    event MaxParticipantsUpdated(uint256 oldMax, uint256 newMax);
    event RegistrationCapReached(uint256 maxParticipants);
    event LiquidityAdded(address indexed token, address indexed pair, uint256 amountState, uint256 amountToken, uint256 liquidity);
    event PoolCreated(address indexed token, address indexed pair, uint256 tokenAmount, uint256 stateAmount);
    event LPTokensBurned(address indexed pair, uint256 liquidity, address burnAddress);
    // Protocol governance transfer events
    event ProtocolGovernanceTransferInitiated(address indexed newGovernance, uint256 timestamp);
    event ProtocolGovernanceTransferCompleted(address indexed newGovernance);
    // Vault distribution events
    event VaultDistribution(address indexed token, address indexed recipient, uint256 amount);
    // Auction fee collection event
    event AuctionFeeCollected(address indexed token, uint256 feeAmount, address indexed user);
    // System initialization event
    event SystemInitialized(
        address indexed stateToken,
        address indexed davToken,
        address lpHelper,
        address airdropDistributor,
        address auctionAdmin,
        address buyBurnController,
        address pulseXRouter,
        address pulseXFactory
    );
}

// src/libraries/TimeUtilsLib.sol

library TimeUtilsLib {
    uint256 internal constant SECONDS_IN_DAY = 86400;
    // Legacy defaults (kept for backward compatibility): 15:00 GMT
    uint256 internal constant TARGET_GMT_HOUR = 15;
    uint256 internal constant TARGET_GMT_MINUTE = 0;

    /// @dev Lightweight parameter validation to avoid pathological inputs.
    function _validateTimeParams(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) private pure {
        require(blockTimestamp > 0, "Invalid timestamp");
        // Practical TZ bounds in production: [-12, +14]; allow a slightly wider but safe range
        require(tzOffsetHours >= -14 && tzOffsetHours <= 14, "Invalid offset");
        require(targetLocalHour < 24, "Invalid hour");
        require(targetLocalMinute < 60, "Invalid minute");
        // Ensure safe signed cast ahead of time
        require(blockTimestamp <= uint256(type(int256).max), "Timestamp too large");
    }

    /**
     * @notice Calculates the next claim start time using a timezone offset and local-hour target.
     * @param blockTimestamp Current block timestamp (UTC seconds).
     * @param tzOffsetHours Signed hour offset from UTC (e.g. +3 for GMT+3, -4 for GMT-4).
     * @param targetLocalHour Target hour in the local timezone (0-23).
     * @param targetLocalMinute Target minute in the local timezone (0-59).
     * @return finalTimestamp UTC timestamp of the next target local-time boundary.
     */
    /**
     * @notice Calculates the next claim start time using a timezone offset and local-hour target.
     * @dev
     * - Uses fixed timezone offsets (does not account for DST).
     * - Miner timestamps can drift slightly; boundary behavior is resilient to small skews.
     * - Inputs are validated to avoid pathological over/underflow on signed math and casts.
     */
    function calculateNextClaimStartTZ(
        uint256 blockTimestamp,
        int256 tzOffsetHours,
        uint256 targetLocalHour,
        uint256 targetLocalMinute
    ) internal pure returns (uint256 finalTimestamp) {
        _validateTimeParams(blockTimestamp, tzOffsetHours, targetLocalHour, targetLocalMinute);
        // Convert UTC ts to local ts by adding offset
        int256 offsetSeconds = tzOffsetHours * int256(1 hours);
        int256 tsInt = int256(blockTimestamp);
        // Guard against overflow/underflow on signed addition
        if (offsetSeconds > 0) {
            require(tsInt <= type(int256).max - offsetSeconds, "Local overflow");
        } else if (offsetSeconds < 0) {
            require(tsInt >= type(int256).min - offsetSeconds, "Local underflow");
        }
        int256 localTs = tsInt + offsetSeconds;
        // Guard against negative local timestamps to avoid invalid uint casts
        require(localTs >= 0, "Local time < 0");
        // Normalize to day start in local time
        uint256 localTsUint = uint256(localTs);
        uint256 localDayStart = (localTsUint / SECONDS_IN_DAY) * SECONDS_IN_DAY;
        // Build target time in local day with overflow guards for diagnostics
        uint256 hoursSec = targetLocalHour * 1 hours;
        uint256 minutesSec = targetLocalMinute * 1 minutes;
        require(localDayStart <= type(uint256).max - hoursSec, "Target calc ovf (h)");
        uint256 targetLocal = localDayStart + hoursSec;
        require(targetLocal <= type(uint256).max - minutesSec, "Target calc ovf (m)");
        targetLocal += minutesSec;
        // If we've passed the target local time, move to next day
        if (localTsUint >= targetLocal) {
            require(targetLocal <= type(uint256).max - SECONDS_IN_DAY, "Next day ovf");
            targetLocal += SECONDS_IN_DAY;
        }
        // Convert back to UTC by subtracting offset
        require(targetLocal <= uint256(type(int256).max), "UTC cast ovf");
        int256 utcTs = int256(targetLocal) - offsetSeconds;
        require(utcTs >= 0, "UTC time < 0");
        finalTimestamp = uint256(utcTs);
        require(finalTimestamp > blockTimestamp, "Non-future ts");
    }

    /**
     * @notice Convenience helper for next 15:00 at GMT+3 (UTC+3).
     */
    /// @notice Convenience helper for next 15:00 at GMT+3 (UTC+3).
    /// @dev 15:00 in GMT+3 corresponds to 12:00 UTC.
    function calculateNextClaimStartGMTPlus3(uint256 blockTimestamp)
        internal
        pure
        returns (uint256)
    {
        return calculateNextClaimStartTZ(blockTimestamp, int256(3), 15, 0);
    }

    /// @notice Pakistan Standard Time (UTC+5) - 23:00 local (11:00 PM)
    /// @dev 11:00 PM in PKT (UTC+5) corresponds to 18:00 UTC (6:00 PM UTC same day)
    function calculateNextClaimStartPakistan(uint256 blockTimestamp) internal pure returns (uint256) {
        return calculateNextClaimStartTZ(blockTimestamp, int256(5), 23, 0);
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/draft-IERC6093.sol

// OpenZeppelin Contracts (last updated v5.1.0) (interfaces/draft-IERC6093.sol)

/**
 * @dev Standard ERC-20 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-20 tokens.
 */
interface IERC20Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC20InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC20InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `spender`’s `allowance`. Used in transfers.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     * @param allowance Amount of tokens a `spender` is allowed to operate with.
     * @param needed Minimum amount required to perform a transfer.
     */
    error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC20InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `spender` to be approved. Used in approvals.
     * @param spender Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC20InvalidSpender(address spender);
}

/**
 * @dev Standard ERC-721 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-721 tokens.
 */
interface IERC721Errors {
    /**
     * @dev Indicates that an address can't be an owner. For example, `address(0)` is a forbidden owner in ERC-20.
     * Used in balance queries.
     * @param owner Address of the current owner of a token.
     */
    error ERC721InvalidOwner(address owner);

    /**
     * @dev Indicates a `tokenId` whose `owner` is the zero address.
     * @param tokenId Identifier number of a token.
     */
    error ERC721NonexistentToken(uint256 tokenId);

    /**
     * @dev Indicates an error related to the ownership over a particular token. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param tokenId Identifier number of a token.
     * @param owner Address of the current owner of a token.
     */
    error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC721InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC721InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`’s approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param tokenId Identifier number of a token.
     */
    error ERC721InsufficientApproval(address operator, uint256 tokenId);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC721InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC721InvalidOperator(address operator);
}

/**
 * @dev Standard ERC-1155 Errors
 * Interface of the https://eips.ethereum.org/EIPS/eip-6093[ERC-6093] custom errors for ERC-1155 tokens.
 */
interface IERC1155Errors {
    /**
     * @dev Indicates an error related to the current `balance` of a `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     * @param balance Current balance for the interacting account.
     * @param needed Minimum amount required to perform a transfer.
     * @param tokenId Identifier number of a token.
     */
    error ERC1155InsufficientBalance(address sender, uint256 balance, uint256 needed, uint256 tokenId);

    /**
     * @dev Indicates a failure with the token `sender`. Used in transfers.
     * @param sender Address whose tokens are being transferred.
     */
    error ERC1155InvalidSender(address sender);

    /**
     * @dev Indicates a failure with the token `receiver`. Used in transfers.
     * @param receiver Address to which tokens are being transferred.
     */
    error ERC1155InvalidReceiver(address receiver);

    /**
     * @dev Indicates a failure with the `operator`’s approval. Used in transfers.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     * @param owner Address of the current owner of a token.
     */
    error ERC1155MissingApprovalForAll(address operator, address owner);

    /**
     * @dev Indicates a failure with the `approver` of a token to be approved. Used in approvals.
     * @param approver Address initiating an approval operation.
     */
    error ERC1155InvalidApprover(address approver);

    /**
     * @dev Indicates a failure with the `operator` to be approved. Used in approvals.
     * @param operator Address that may be allowed to operate on tokens without being their owner.
     */
    error ERC1155InvalidOperator(address operator);

    /**
     * @dev Indicates an array length mismatch between ids and values in a safeBatchTransferFrom operation.
     * Used in batch transfers.
     * @param idsLength Length of the array of token identifiers
     * @param valuesLength Length of the array of token amounts
     */
    error ERC1155InvalidArrayLength(uint256 idsLength, uint256 valuesLength);
}

// src/libraries/AuctionUtilsLib.sol

library AuctionUtilsLib {
    
    struct AuctionSchedule {
        mapping(uint256 => address) tokenByIndex; // index 0 = token1, index 1 = token2, etc.
        uint256 tokenCount; // actual number of tokens registered
        mapping(address => uint256) scheduledIndex;
        bool scheduleSet;
        uint256 scheduleStart;
        uint256 auctionDaysLimit;
        uint256 scheduleSize;
    }

    function getTodayToken(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (address tokenOfDay, bool active) 
    {
        if (!_auctionStarted(schedule, currentTime)) return (address(0), false);
        if (schedule.tokenCount == 0) return (address(0), false);
        
        // Calculate which auction slot we're in (15 min auction + 5 min interval = 20 min per slot)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 auctionSlot = timeSinceStart / slotDuration; // Each slot is 20 minutes (15 min auction + 5 min break)
        uint256 tokenIndex = auctionSlot % schedule.tokenCount; // Use tokenCount instead of array length
        
        tokenOfDay = schedule.tokenByIndex[tokenIndex]; // Use mapping access instead of array
        
        // Check if we're within the active 15-minute auction window (not in the 5-minute break)
        uint256 auctionStart = schedule.scheduleStart + (auctionSlot * slotDuration);
        uint256 auctionEnd = auctionStart + AuctionLib.AUCTION_DURATION;
        
        active = currentTime >= auctionStart && currentTime < auctionEnd;
    }

    function _auctionStarted(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (bool) {
        return schedule.scheduleSet && currentTime >= schedule.scheduleStart;
    }

    function _currentDayIndex(AuctionSchedule storage schedule, uint256 currentTime) internal view returns (uint256) {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        return (currentTime - schedule.scheduleStart) / 1 days;
    }

    function _todayWindow(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (uint256 start, uint256 end) 
    {
        uint256 d = _currentDayIndex(schedule, currentTime);
        start = schedule.scheduleStart + d * 1 days;
        end = start + 1 days;
    }

    function _appearanceCount(AuctionSchedule storage schedule, address token, uint256 currentTime) 
        internal 
        view 
        returns (uint256) 
    {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        uint256 idx1 = schedule.scheduledIndex[token];
        if (idx1 == 0) return 0;
        uint256 idx = idx1 - 1;
        
        // Count completed auction slots (each slot is 20 minutes: 15 min auction + 5 min interval)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 completedSlots = timeSinceStart / slotDuration;
        
        // Calculate how many times this token has appeared
        if (completedSlots < idx) return 0;
        return (completedSlots - idx) / schedule.tokenCount + 1;
    }

    function _getCompletedSlots(AuctionSchedule storage schedule, uint256 currentTime) 
        internal 
        view 
        returns (uint256) 
    {
        if (!_auctionStarted(schedule, currentTime)) return 0;
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        return timeSinceStart / slotDuration;
    }

    function isAuctionActive(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (bool) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    function isReverseAuctionActive(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (bool) {
        if (!_isReverseToday(schedule, inputToken, currentTime)) return false;
        
        // Check if we're within the active 15-minute window
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        return activeWindow && today == inputToken;
    }

    function _isReverseToday(AuctionSchedule storage schedule, address token, uint256 currentTime) internal view returns (bool) {
        (address today, bool active) = getTodayToken(schedule, currentTime);
        if (!active || today != token) return false;
        uint256 count = _appearanceCount(schedule, token, currentTime);
        // Reverse on 4,8,12,... (every 4th appearance)
        return count > 0 && (count % 4 == 0);
    }

    function getCurrentAuctionCycle(
        AuctionSchedule storage schedule, 
        address inputToken, 
        uint256 currentTime
    ) external view returns (uint256) {
        return _appearanceCount(schedule, inputToken, currentTime);
    }

    function getAuctionTimeLeft(
        AuctionSchedule storage schedule,
        address inputToken,
        uint256 currentTime,
        uint256 /* AUCTION_DURATION */
    ) external view returns (uint256) {
        (address today, bool activeWindow) = getTodayToken(schedule, currentTime);
        if (!activeWindow || today != inputToken) return 0;
        
        // Calculate time left in current auction slot (15 min auction, not including 5 min interval)
        uint256 timeSinceStart = currentTime - schedule.scheduleStart;
        uint256 slotDuration = AuctionLib.AUCTION_DURATION + AuctionLib.AUCTION_INTERVAL;
        uint256 auctionSlot = timeSinceStart / slotDuration;
        uint256 auctionEnd = schedule.scheduleStart + (auctionSlot * slotDuration) + AuctionLib.AUCTION_DURATION;
        
        return auctionEnd > currentTime ? auctionEnd - currentTime : 0;
    }

    function setAuctionSchedule(
        AuctionSchedule storage schedule,
        address[] memory tokens,
        uint256 startAt,
        mapping(address => bool) storage supportedTokens
    ) external {
        require(!schedule.scheduleSet, "Schedule already set");
        require(tokens.length == schedule.scheduleSize, "Invalid token count");
        
        // Validate tokens are supported and unique
        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            require(t != address(0), "Zero address");
            require(supportedTokens[t], "Unsupported token");
            require(schedule.scheduledIndex[t] == 0, "Duplicate token");
            schedule.scheduledIndex[t] = i + 1; // store index+1
            schedule.tokenByIndex[i] = t; // Add token to mapping
        }
        
        schedule.tokenCount = tokens.length;
        schedule.scheduleStart = startAt;
        schedule.scheduleSet = true;
    }

    function setScheduleSize(AuctionSchedule storage schedule, uint256 newSize) external {
        require(!schedule.scheduleSet, "Schedule already set");
        require(newSize > 0 && newSize <= 50, "Invalid size");
        schedule.scheduleSize = newSize;
    }

    function setAuctionDaysLimit(AuctionSchedule storage schedule, uint256 daysLimit) external {
        require(daysLimit > 0, "Invalid limit");
        schedule.auctionDaysLimit = daysLimit;
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC165.sol

// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC165.sol)

// lib/openzeppelin-contracts/contracts/interfaces/IERC20.sol

// OpenZeppelin Contracts (last updated v5.0.0) (interfaces/IERC20.sol)

// lib/openzeppelin-contracts/contracts/token/ERC20/extensions/IERC20Metadata.sol

// OpenZeppelin Contracts (last updated v5.1.0) (token/ERC20/extensions/IERC20Metadata.sol)

/**
 * @dev Interface for the optional metadata functions from the ERC-20 standard.
 */
interface IERC20Metadata is IERC20 {
    /**
     * @dev Returns the name of the token.
     */
    function name() external view returns (string memory);

    /**
     * @dev Returns the symbol of the token.
     */
    function symbol() external view returns (string memory);

    /**
     * @dev Returns the decimals places of the token.
     */
    function decimals() external view returns (uint8);
}

// lib/openzeppelin-contracts/contracts/access/Ownable.sol

// OpenZeppelin Contracts (last updated v5.0.0) (access/Ownable.sol)

/**
 * @dev Contract module which provides a basic access control mechanism, where
 * there is an account (an owner) that can be granted exclusive access to
 * specific functions.
 *
 * The initial owner is set to the address provided by the deployer. This can
 * later be changed with {transferOwnership}.
 *
 * This module is used through inheritance. It will make available the modifier
 * `onlyOwner`, which can be applied to your functions to restrict their use to
 * the owner.
 */
abstract contract Ownable is Context {
    address private _owner;

    /**
     * @dev The caller account is not authorized to perform an operation.
     */
    error OwnableUnauthorizedAccount(address account);

    /**
     * @dev The owner is not a valid owner account. (eg. `address(0)`)
     */
    error OwnableInvalidOwner(address owner);

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    /**
     * @dev Initializes the contract setting the address provided by the deployer as the initial owner.
     */
    constructor(address initialOwner) {
        if (initialOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(initialOwner);
    }

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        _checkOwner();
        _;
    }

    /**
     * @dev Returns the address of the current owner.
     */
    function owner() public view virtual returns (address) {
        return _owner;
    }

    /**
     * @dev Throws if the sender is not the owner.
     */
    function _checkOwner() internal view virtual {
        if (owner() != _msgSender()) {
            revert OwnableUnauthorizedAccount(_msgSender());
        }
    }

    /**
     * @dev Leaves the contract without owner. It will not be possible to call
     * `onlyOwner` functions. Can only be called by the current owner.
     *
     * NOTE: Renouncing ownership will leave the contract without an owner,
     * thereby disabling any functionality that is only available to the owner.
     */
    function renounceOwnership() public virtual onlyOwner {
        _transferOwnership(address(0));
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Can only be called by the current owner.
     */
    function transferOwnership(address newOwner) public virtual onlyOwner {
        if (newOwner == address(0)) {
            revert OwnableInvalidOwner(address(0));
        }
        _transferOwnership(newOwner);
    }

    /**
     * @dev Transfers ownership of the contract to a new account (`newOwner`).
     * Internal function without access restriction.
     */
    function _transferOwnership(address newOwner) internal virtual {
        address oldOwner = _owner;
        _owner = newOwner;
        emit OwnershipTransferred(oldOwner, newOwner);
    }
}

// lib/openzeppelin-contracts/contracts/token/ERC20/ERC20.sol

// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/ERC20.sol)

/**
 * @dev Implementation of the {IERC20} interface.
 *
 * This implementation is agnostic to the way tokens are created. This means
 * that a supply mechanism has to be added in a derived contract using {_mint}.
 *
 * TIP: For a detailed writeup see our guide
 * https://forum.openzeppelin.com/t/how-to-implement-erc20-supply-mechanisms/226[How
 * to implement supply mechanisms].
 *
 * The default value of {decimals} is 18. To change this, you should override
 * this function so it returns a different value.
 *
 * We have followed general OpenZeppelin Contracts guidelines: functions revert
 * instead returning `false` on failure. This behavior is nonetheless
 * conventional and does not conflict with the expectations of ERC-20
 * applications.
 */
abstract contract ERC20 is Context, IERC20, IERC20Metadata, IERC20Errors {
    mapping(address account => uint256) private _balances;

    mapping(address account => mapping(address spender => uint256)) private _allowances;

    uint256 private _totalSupply;

    string private _name;
    string private _symbol;

    /**
     * @dev Sets the values for {name} and {symbol}.
     *
     * Both values are immutable: they can only be set once during construction.
     */
    constructor(string memory name_, string memory symbol_) {
        _name = name_;
        _symbol = symbol_;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view virtual returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view virtual returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the default value returned by this function, unless
     * it's overridden.
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public view virtual returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-totalSupply}.
     */
    function totalSupply() public view virtual returns (uint256) {
        return _totalSupply;
    }

    /**
     * @dev See {IERC20-balanceOf}.
     */
    function balanceOf(address account) public view virtual returns (uint256) {
        return _balances[account];
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `value`.
     */
    function transfer(address to, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _transfer(owner, to, value);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender) public view virtual returns (uint256) {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `value` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 value) public virtual returns (bool) {
        address owner = _msgSender();
        _approve(owner, spender, value);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Skips emitting an {Approval} event indicating an allowance update. This is not
     * required by the ERC. See {xref-ERC20-_approve-address-address-uint256-bool-}[_approve].
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `value`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `value`.
     */
    function transferFrom(address from, address to, uint256 value) public virtual returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, value);
        _transfer(from, to, value);
        return true;
    }

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to`.
     *
     * This internal function is equivalent to {transfer}, and can be used to
     * e.g. implement automatic token fees, slashing mechanisms, etc.
     *
     * Emits a {Transfer} event.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _transfer(address from, address to, uint256 value) internal {
        if (from == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        if (to == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(from, to, value);
    }

    /**
     * @dev Transfers a `value` amount of tokens from `from` to `to`, or alternatively mints (or burns) if `from`
     * (or `to`) is the zero address. All customizations to transfers, mints, and burns should be done by overriding
     * this function.
     *
     * Emits a {Transfer} event.
     */
    function _update(address from, address to, uint256 value) internal virtual {
        if (from == address(0)) {
            // Overflow check required: The rest of the code assumes that totalSupply never overflows
            _totalSupply += value;
        } else {
            uint256 fromBalance = _balances[from];
            if (fromBalance < value) {
                revert ERC20InsufficientBalance(from, fromBalance, value);
            }
            unchecked {
                // Overflow not possible: value <= fromBalance <= totalSupply.
                _balances[from] = fromBalance - value;
            }
        }

        if (to == address(0)) {
            unchecked {
                // Overflow not possible: value <= totalSupply or value <= fromBalance <= totalSupply.
                _totalSupply -= value;
            }
        } else {
            unchecked {
                // Overflow not possible: balance + value is at most totalSupply, which we know fits into a uint256.
                _balances[to] += value;
            }
        }

        emit Transfer(from, to, value);
    }

    /**
     * @dev Creates a `value` amount of tokens and assigns them to `account`, by transferring it from address(0).
     * Relies on the `_update` mechanism
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead.
     */
    function _mint(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidReceiver(address(0));
        }
        _update(address(0), account, value);
    }

    /**
     * @dev Destroys a `value` amount of tokens from `account`, lowering the total supply.
     * Relies on the `_update` mechanism.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * NOTE: This function is not virtual, {_update} should be overridden instead
     */
    function _burn(address account, uint256 value) internal {
        if (account == address(0)) {
            revert ERC20InvalidSender(address(0));
        }
        _update(account, address(0), value);
    }

    /**
     * @dev Sets `value` as the allowance of `spender` over the `owner`'s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     *
     * Overrides to this logic should be done to the variant with an additional `bool emitEvent` argument.
     */
    function _approve(address owner, address spender, uint256 value) internal {
        _approve(owner, spender, value, true);
    }

    /**
     * @dev Variant of {_approve} with an optional flag to enable or disable the {Approval} event.
     *
     * By default (when calling {_approve}) the flag is set to true. On the other hand, approval changes made by
     * `_spendAllowance` during the `transferFrom` operation set the flag to false. This saves gas by not emitting any
     * `Approval` event during `transferFrom` operations.
     *
     * Anyone who wishes to continue emitting `Approval` events on the`transferFrom` operation can force the flag to
     * true using the following override:
     *
     * ```solidity
     * function _approve(address owner, address spender, uint256 value, bool) internal virtual override {
     *     super._approve(owner, spender, value, true);
     * }
     * ```
     *
     * Requirements are the same as {_approve}.
     */
    function _approve(address owner, address spender, uint256 value, bool emitEvent) internal virtual {
        if (owner == address(0)) {
            revert ERC20InvalidApprover(address(0));
        }
        if (spender == address(0)) {
            revert ERC20InvalidSpender(address(0));
        }
        _allowances[owner][spender] = value;
        if (emitEvent) {
            emit Approval(owner, spender, value);
        }
    }

    /**
     * @dev Updates `owner`'s allowance for `spender` based on spent `value`.
     *
     * Does not update the allowance value in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Does not emit an {Approval} event.
     */
    function _spendAllowance(address owner, address spender, uint256 value) internal virtual {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance < type(uint256).max) {
            if (currentAllowance < value) {
                revert ERC20InsufficientAllowance(spender, currentAllowance, value);
            }
            unchecked {
                _approve(owner, spender, currentAllowance - value, false);
            }
        }
    }
}

// lib/openzeppelin-contracts/contracts/interfaces/IERC1363.sol

// OpenZeppelin Contracts (last updated v5.1.0) (interfaces/IERC1363.sol)

/**
 * @title IERC1363
 * @dev Interface of the ERC-1363 standard as defined in the https://eips.ethereum.org/EIPS/eip-1363[ERC-1363].
 *
 * Defines an extension interface for ERC-20 tokens that supports executing code on a recipient contract
 * after `transfer` or `transferFrom`, or code on a spender contract after `approve`, in a single transaction.
 */
interface IERC1363 is IERC20, IERC165 {
    /*
     * Note: the ERC-165 identifier for this interface is 0xb0202a11.
     * 0xb0202a11 ===
     *   bytes4(keccak256('transferAndCall(address,uint256)')) ^
     *   bytes4(keccak256('transferAndCall(address,uint256,bytes)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256)')) ^
     *   bytes4(keccak256('transferFromAndCall(address,address,uint256,bytes)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256)')) ^
     *   bytes4(keccak256('approveAndCall(address,uint256,bytes)'))
     */

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from the caller's account to `to`
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferAndCall(address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value) external returns (bool);

    /**
     * @dev Moves a `value` amount of tokens from `from` to `to` using the allowance mechanism
     * and then calls {IERC1363Receiver-onTransferReceived} on `to`.
     * @param from The address which you want to send tokens from.
     * @param to The address which you want to transfer to.
     * @param value The amount of tokens to be transferred.
     * @param data Additional data with no specified format, sent in call to `to`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function transferFromAndCall(address from, address to, uint256 value, bytes calldata data) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value) external returns (bool);

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens and then calls {IERC1363Spender-onApprovalReceived} on `spender`.
     * @param spender The address which will spend the funds.
     * @param value The amount of tokens to be spent.
     * @param data Additional data with no specified format, sent in call to `spender`.
     * @return A boolean value indicating whether the operation succeeded unless throwing.
     */
    function approveAndCall(address spender, uint256 value, bytes calldata data) external returns (bool);
}

// lib/openzeppelin-contracts/contracts/token/ERC20/utils/SafeERC20.sol

// OpenZeppelin Contracts (last updated v5.3.0) (token/ERC20/utils/SafeERC20.sol)

/**
 * @title SafeERC20
 * @dev Wrappers around ERC-20 operations that throw on failure (when the token
 * contract returns false). Tokens that return no value (and instead revert or
 * throw on failure) are also supported, non-reverting calls are assumed to be
 * successful.
 * To use this library you can add a `using SafeERC20 for IERC20;` statement to your contract,
 * which allows you to call the safe operations as `token.safeTransfer(...)`, etc.
 */
library SafeERC20 {
    /**
     * @dev An operation with an ERC-20 token failed.
     */
    error SafeERC20FailedOperation(address token);

    /**
     * @dev Indicates a failed `decreaseAllowance` request.
     */
    error SafeERC20FailedDecreaseAllowance(address spender, uint256 currentAllowance, uint256 requestedDecrease);

    /**
     * @dev Transfer `value` amount of `token` from the calling contract to `to`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     */
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Transfer `value` amount of `token` from `from` to `to`, spending the approval given by `from` to the
     * calling contract. If `token` returns no value, non-reverting calls are assumed to be successful.
     */
    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        _callOptionalReturn(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Variant of {safeTransfer} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransfer(IERC20 token, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transfer, (to, value)));
    }

    /**
     * @dev Variant of {safeTransferFrom} that returns a bool instead of reverting if the operation is not successful.
     */
    function trySafeTransferFrom(IERC20 token, address from, address to, uint256 value) internal returns (bool) {
        return _callOptionalReturnBool(token, abi.encodeCall(token.transferFrom, (from, to, value)));
    }

    /**
     * @dev Increase the calling contract's allowance toward `spender` by `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeIncreaseAllowance(IERC20 token, address spender, uint256 value) internal {
        uint256 oldAllowance = token.allowance(address(this), spender);
        forceApprove(token, spender, oldAllowance + value);
    }

    /**
     * @dev Decrease the calling contract's allowance toward `spender` by `requestedDecrease`. If `token` returns no
     * value, non-reverting calls are assumed to be successful.
     *
     * IMPORTANT: If the token implements ERC-7674 (ERC-20 with temporary allowance), and if the "client"
     * smart contract uses ERC-7674 to set temporary allowances, then the "client" smart contract should avoid using
     * this function. Performing a {safeIncreaseAllowance} or {safeDecreaseAllowance} operation on a token contract
     * that has a non-zero temporary allowance (for that particular owner-spender) will result in unexpected behavior.
     */
    function safeDecreaseAllowance(IERC20 token, address spender, uint256 requestedDecrease) internal {
        unchecked {
            uint256 currentAllowance = token.allowance(address(this), spender);
            if (currentAllowance < requestedDecrease) {
                revert SafeERC20FailedDecreaseAllowance(spender, currentAllowance, requestedDecrease);
            }
            forceApprove(token, spender, currentAllowance - requestedDecrease);
        }
    }

    /**
     * @dev Set the calling contract's allowance toward `spender` to `value`. If `token` returns no value,
     * non-reverting calls are assumed to be successful. Meant to be used with tokens that require the approval
     * to be set to zero before setting it to a non-zero value, such as USDT.
     *
     * NOTE: If the token implements ERC-7674, this function will not modify any temporary allowance. This function
     * only sets the "standard" allowance. Any temporary allowance will remain active, in addition to the value being
     * set here.
     */
    function forceApprove(IERC20 token, address spender, uint256 value) internal {
        bytes memory approvalCall = abi.encodeCall(token.approve, (spender, value));

        if (!_callOptionalReturnBool(token, approvalCall)) {
            _callOptionalReturn(token, abi.encodeCall(token.approve, (spender, 0)));
            _callOptionalReturn(token, approvalCall);
        }
    }

    /**
     * @dev Performs an {ERC1363} transferAndCall, with a fallback to the simple {ERC20} transfer if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            safeTransfer(token, to, value);
        } else if (!token.transferAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} transferFromAndCall, with a fallback to the simple {ERC20} transferFrom if the target
     * has no code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * Reverts if the returned value is other than `true`.
     */
    function transferFromAndCallRelaxed(
        IERC1363 token,
        address from,
        address to,
        uint256 value,
        bytes memory data
    ) internal {
        if (to.code.length == 0) {
            safeTransferFrom(token, from, to, value);
        } else if (!token.transferFromAndCall(from, to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Performs an {ERC1363} approveAndCall, with a fallback to the simple {ERC20} approve if the target has no
     * code. This can be used to implement an {ERC721}-like safe transfer that rely on {ERC1363} checks when
     * targeting contracts.
     *
     * NOTE: When the recipient address (`to`) has no code (i.e. is an EOA), this function behaves as {forceApprove}.
     * Opposedly, when the recipient address (`to`) has code, this function only attempts to call {ERC1363-approveAndCall}
     * once without retrying, and relies on the returned value to be true.
     *
     * Reverts if the returned value is other than `true`.
     */
    function approveAndCallRelaxed(IERC1363 token, address to, uint256 value, bytes memory data) internal {
        if (to.code.length == 0) {
            forceApprove(token, to, value);
        } else if (!token.approveAndCall(to, value, data)) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturnBool} that reverts if call fails to meet the requirements.
     */
    function _callOptionalReturn(IERC20 token, bytes memory data) private {
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            let success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            // bubble errors
            if iszero(success) {
                let ptr := mload(0x40)
                returndatacopy(ptr, 0, returndatasize())
                revert(ptr, returndatasize())
            }
            returnSize := returndatasize()
            returnValue := mload(0)
        }

        if (returnSize == 0 ? address(token).code.length == 0 : returnValue != 1) {
            revert SafeERC20FailedOperation(address(token));
        }
    }

    /**
     * @dev Imitates a Solidity high-level call (i.e. a regular function call to a contract), relaxing the requirement
     * on the return value: the return value is optional (but if data is returned, it must not be false).
     * @param token The token targeted by the call.
     * @param data The call data (encoded using abi.encode or one of its variants).
     *
     * This is a variant of {_callOptionalReturn} that silently catches all reverts and returns a bool instead.
     */
    function _callOptionalReturnBool(IERC20 token, bytes memory data) private returns (bool) {
        bool success;
        uint256 returnSize;
        uint256 returnValue;
        assembly ("memory-safe") {
            success := call(gas(), token, 0, add(data, 0x20), mload(data), 0, 0x20)
            returnSize := returndatasize()
            returnValue := mload(0)
        }
        return success && (returnSize == 0 ? address(token).code.length > 0 : returnValue == 1);
    }
}

// src/libraries/BurnLib.sol

library BurnLib {
    using SafeERC20 for IERC20;
    
    // Events
    event TokensBurned(address indexed token, uint256 amount, address indexed user);
    event StateTokensIssued(address indexed user, uint256 amount, uint256 indexed cycle);
    event ReverseStateTokensBurned(address indexed user, uint256 amount, uint256 indexed cycle);
    event AuctionTokensIssued(address indexed user, uint256 amount, uint256 indexed cycle);

    struct BurnParams {
        address user;
        address auctionToken;
        address stateToken;
        uint256 currentCycle;
        uint256 tokensToBurn;
        uint256 stateToGive;
        uint256 availableDav;
    }

    struct ReverseBurnParams {
        address user;
        address auctionToken;
        address stateToken;
        uint256 currentCycle;
        uint256 stateToBurn;
        uint256 tokensToGive;
    }

    function executeTokenBurn(
        BurnParams memory params,
        mapping(address => mapping(address => mapping(uint256 => bool))) storage hasUserBurnedTokens,
        mapping(address => mapping(address => mapping(uint256 => uint256))) storage userStateBalance,
        mapping(address => mapping(address => mapping(uint256 => uint256))) storage tokensBurnedByUser,
        mapping(address => mapping(address => mapping(uint256 => uint256))) storage davTokensUsed,
        mapping(address => uint256) storage TotalTokensBurned
    ) external {
        // Input validation
        require(params.user != address(0), "BurnLib: Invalid user address");
        require(params.auctionToken != address(0), "BurnLib: Invalid auction token");
        require(params.stateToken != address(0), "BurnLib: Invalid state token");
        require(params.tokensToBurn > 0, "BurnLib: Invalid burn amount");
        require(params.stateToGive > 0, "BurnLib: Invalid state amount");
        
        // Allow multiple burns per cycle - accumulate values
        hasUserBurnedTokens[params.user][params.auctionToken][params.currentCycle] = true;
        userStateBalance[params.user][params.auctionToken][params.currentCycle] += params.stateToGive;
        tokensBurnedByUser[params.user][params.auctionToken][params.currentCycle] += params.tokensToBurn;
        davTokensUsed[params.user][params.auctionToken][params.currentCycle] += params.availableDav;
        
        // Burn the auction tokens (transfer to contract and track as permanently burned)
        IERC20(params.auctionToken).safeTransferFrom(params.user, address(this), params.tokensToBurn);
        TotalTokensBurned[params.auctionToken] += params.tokensToBurn;
        
        // Give STATE tokens to user
        IERC20(params.stateToken).safeTransfer(params.user, params.stateToGive);
        
        // Emit burn event to track the burning of auction tokens
        emit TokensBurned(params.auctionToken, params.tokensToBurn, params.user);
        emit StateTokensIssued(params.user, params.stateToGive, params.currentCycle);
    }

    function executeReverseBurn(
        ReverseBurnParams memory params,
        mapping(address => mapping(address => mapping(uint256 => bool))) storage hasCompletedReverseStep2,
        mapping(address => mapping(address => mapping(uint256 => uint256))) storage reverseStateBalance,
        mapping(address => uint256) storage TotalTokensBurned
    ) external {
        // Input validation
        require(params.user != address(0), "BurnLib: Invalid user address");
        require(params.auctionToken != address(0), "BurnLib: Invalid auction token");
        require(params.stateToken != address(0), "BurnLib: Invalid state token");
        require(params.stateToBurn > 0, "BurnLib: Invalid burn amount");
        require(params.tokensToGive > 0, "BurnLib: Invalid token amount");
        
        // Check for double execution
        require(!hasCompletedReverseStep2[params.user][params.auctionToken][params.currentCycle], "BurnLib: Already completed reverse step 2");
        
        hasCompletedReverseStep2[params.user][params.auctionToken][params.currentCycle] = true;
        
        // Safe subtraction with underflow protection
        uint256 currentBalance = reverseStateBalance[params.user][params.auctionToken][params.currentCycle];
        require(currentBalance >= params.stateToBurn, "BurnLib: Insufficient reverse balance");
        reverseStateBalance[params.user][params.auctionToken][params.currentCycle] = currentBalance - params.stateToBurn;
        
        // Burn STATE tokens (transfer to contract and track as permanently burned)
        IERC20(params.stateToken).safeTransferFrom(params.user, address(this), params.stateToBurn);
        TotalTokensBurned[params.stateToken] += params.stateToBurn;
        
        // Give auction tokens to user
        IERC20(params.auctionToken).safeTransfer(params.user, params.tokensToGive);
        
        // Emit burn event to track the burning of STATE tokens in reverse auction
        emit TokensBurned(params.stateToken, params.stateToBurn, params.user);
        emit ReverseStateTokensBurned(params.user, params.stateToBurn, params.currentCycle);
        emit AuctionTokensIssued(params.user, params.tokensToGive, params.currentCycle);
    }
}

// src/libraries/SwapCoreLib.sol

library SwapCoreLib {
    using SafeERC20 for IERC20;
    
    struct SwapData {
        address user;
        address inputToken;
        address stateToken;
        uint256 userStateFromBurn;
        uint256 amountOut;
        uint256 feeIn;
        uint256 burnIn;
        uint256 currentDayStart;
        uint256 todayIdx;
    }

    struct SwapParams {
        address user;
        address inputToken;
        address stateToken;
        uint256 currentCycle;
        uint256 dailyStateReleased;
        uint256 dailyStateReleasedNormal;
        uint256 dailySwapsCount;
        uint256 dailyUniqueSwappersCount;
        uint256 currentDayStart;
        uint256 userStateFromBurn;
        uint256 amountOut;
    }

    struct UserSwapInfo {
        bool hasSwapped;
        bool hasReverseSwap;
        uint256 cycle;
    }

    function getSwapInfoKey(
        address user,
        address inputToken,
        address stateToken,
        uint256 cycle
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(user, inputToken, stateToken, cycle));
    }
}

// src/Tokens.sol

/// @title Token V3 - ERC20 token with single transaction allocation
/// @author System State Protocol
/// @notice This contract mints entire supply to auction contract in a single transaction
/// @dev The contract inherits from OpenZeppelin's ERC20 and Ownable contracts.
contract TOKEN_V3 is ERC20, Ownable {
    /// @notice The maximum total supply of tokens (5 billion tokens with 18 decimals)
    uint256 public constant MAX_SUPPLY = 5000000000 ether; // 5 billion
    bool private _mintingFinalized = false; // Flag to prevent re-minting after initial distribution

    modifier onlyDuringConstructor() {
        require(!_mintingFinalized, "Minting has already been finalized");
        _;
    }
    
    event InitialDistribution(
        address indexed recipient,
        uint256 totalAmount
    );

    /**
     * @notice Constructs the Token contract and mints all tokens in single transaction
     * @param name The name of the ERC20 token
     * @param symbol The symbol of the ERC20 token
     * @param recipient The address receiving 100% of total supply (typically auction contract)
     * @param _owner The owner of the contract (Ownable)
     * @dev Requires valid non-zero addresses for recipient and owner.
     *      Mints 100% of MAX_SUPPLY to recipient in a single transaction.
     */
    constructor(
        string memory name,
        string memory symbol,
        address recipient,
        address _owner
    ) ERC20(name, symbol) Ownable(_owner) {
        require(recipient != address(0), "Invalid recipient address");
        require(_owner != address(0), "Invalid owner address");
        require(recipient != address(this), "Cannot mint to token contract");
        
        _mintingFinalized = true; // Set flag to prevent further minting
        
        // Mint entire supply in single transaction
        _mint(recipient, MAX_SUPPLY);
        
        emit InitialDistribution(recipient, MAX_SUPPLY);
        
        // Note: Ownership can be renounced later by the owner if desired
        // This allows proper registration and setup before renouncement
    }
}

// src/libraries/NormalAuctionCalculations.sol

/**
 * @title NormalAuctionCalculations
 * @notice Library containing ONLY calculation logic for normal auctions
 * @dev Main contract handles all validation, state management, and transfers
 */
library NormalAuctionCalculations {
    using SafeERC20 for IERC20;

    // Constants matching original contract
    uint256 constant TOKENS_PER_DAV = 3000 ether;
    uint256 constant STATE_MULTIPLIER = 2;
    uint256 constant PRECISION_FACTOR = 1e18;

    // Errors
    error InvalidReserves();
    error PairInvalid();
    error AmountZero();

    /**
     * @notice Calculate tokens to burn based on available DAV (Step 2 calculation)
     * @param availableDav Amount of DAV tokens available for burning
     * @return tokensToBurn Amount of auction tokens to burn (3000 per DAV)
     */
    function calculateTokensToBurn(uint256 availableDav) internal pure returns (uint256 tokensToBurn) {
        return (availableDav * TOKENS_PER_DAV) / 1e18;
    }

    /**
     * @notice Calculate STATE tokens to give based on pool ratio (Step 2 calculation) 
     * @param tokensToBurn Amount of auction tokens being burned
     * @param poolRatio Current pool ratio (STATE per auction token)
     * @return stateToGive Amount of STATE tokens to give (includes 2x multiplier)
     */
    function calculateStateToGive(
        uint256 tokensToBurn, 
        uint256 poolRatio
    ) internal pure returns (uint256 stateToGive) {
        return (tokensToBurn * poolRatio * STATE_MULTIPLIER) / PRECISION_FACTOR;
    }

    /**
     * @notice Get price ratio from pool reserves
     * @param inputToken The auction token address
     * @param stateToken The STATE token address  
     * @param pairAddress The pair contract address
     * @return ratio STATE per auction token (18 decimals)
     */
    function getRatioPrice(
        address inputToken,
        address stateToken, 
        address pairAddress
    ) internal view returns (uint256 ratio) {
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) return 0;

        if (token0 == inputToken && token1 == stateToken) {
            ratio = (uint256(reserve1) * PRECISION_FACTOR) / uint256(reserve0);
        } else if (token0 == stateToken && token1 == inputToken) {
            ratio = (uint256(reserve0) * PRECISION_FACTOR) / uint256(reserve1);
        } else {
            revert PairInvalid();
        }

        return ratio;
    }

    /**
     * @notice Calculate pool swap output (Step 3 calculation)
     * @param stateAmountIn Amount of STATE tokens to swap
     * @param stateToken The STATE token address
     * @param inputToken The auction token to receive
     * @param pairAddress The pair contract address
     * @return amountOut Amount of auction tokens to receive
     */
    function calculatePoolSwapOutput(
        uint256 stateAmountIn,
        address stateToken,
        address inputToken,
        address pairAddress
    ) internal view returns (uint256 amountOut) {
        if (stateAmountIn == 0) revert AmountZero();
        
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidReserves();
        
        uint256 stateReserve;
        uint256 tokenReserve;
        
        if (token0 == stateToken && token1 == inputToken) {
            stateReserve = uint256(reserve0);
            tokenReserve = uint256(reserve1);
        } else if (token0 == inputToken && token1 == stateToken) {
            stateReserve = uint256(reserve1);
            tokenReserve = uint256(reserve0);
        } else {
            revert PairInvalid();
        }
        
        // AMM formula with 0.3% fee: amountOut = (amountIn * 997 * reserveOut) / (reserveIn * 1000 + amountIn * 997)
        uint256 amountInWithFee = stateAmountIn * 997;
        uint256 numerator = amountInWithFee * tokenReserve;
        uint256 denominator = (stateReserve * 1000) + amountInWithFee;
        
        return numerator / denominator;
    }
}

// src/libraries/ReverseAuctionCalculations.sol

/**
 * @title ReverseAuctionCalculations
 * @notice Library containing ONLY calculation logic for reverse auctions
 * @dev Main contract handles all validation, state management, and transfers
 */
library ReverseAuctionCalculations {
    using SafeERC20 for IERC20;

    // Constants matching original contract
    uint256 constant STATE_MULTIPLIER = 2;
    uint256 constant PRECISION_FACTOR = 1e18;

    // Errors
    error InvalidReserves();
    error PairInvalid();
    error AmountZero();

    /**
     * @notice Calculate STATE output for reverse auction step 1 (auction token -> STATE)
     * @param tokenAmountIn Amount of auction tokens to swap
     * @param auctionToken The auction token address
     * @param stateToken The STATE token address
     * @param pairAddress The pair contract address
     * @return stateOutput Amount of STATE tokens to receive
     */
    function calculatePoolSwapOutputReverse(
        uint256 tokenAmountIn,
        address auctionToken,
        address stateToken,
        address pairAddress
    ) internal view returns (uint256 stateOutput) {
        if (tokenAmountIn == 0) revert AmountZero();
        
        IPair pair = IPair(pairAddress);
        (uint112 reserve0, uint112 reserve1, ) = pair.getReserves();
        
        address token0 = pair.token0();
        address token1 = pair.token1();
        
        if (reserve0 == 0 || reserve1 == 0) revert InvalidReserves();
        
        uint256 tokenReserve;
        uint256 stateReserve;
        
        if (token0 == auctionToken && token1 == stateToken) {
            tokenReserve = uint256(reserve0);
            stateReserve = uint256(reserve1);
        } else if (token0 == stateToken && token1 == auctionToken) {
            tokenReserve = uint256(reserve1);
            stateReserve = uint256(reserve0);
        } else {
            revert PairInvalid();
        }
        
        // AMM formula with 0.3% fee: stateOut = (tokenIn * 997 * stateReserve) / (tokenReserve * 1000 + tokenIn * 997)
        uint256 tokenInWithFee = tokenAmountIn * 997;
        uint256 numerator = tokenInWithFee * stateReserve;
        uint256 denominator = (tokenReserve * 1000) + tokenInWithFee;
        
        return numerator / denominator;
    }

    /**
     * @notice Calculate minimum STATE burn amount (50% of received in step 1)
     * @param stateFromStep1 Amount of STATE received in step 1
     * @return minimumBurn Minimum amount that must be burned (50%)
     */
    function calculateMinimumBurn(uint256 stateFromStep1) internal pure returns (uint256 minimumBurn) {
        return stateFromStep1 / 2; // 50%
    }

    /**
     * @notice Calculate auction tokens to give for burned STATE (step 2)
     * @param stateToBurn Amount of STATE tokens being burned
     * @param poolRatio Current pool ratio (STATE per auction token)
     * @return tokensToGive Amount of auction tokens to give (includes 2x multiplier)
     */
    function calculateTokensToGive(
        uint256 stateToBurn,
        uint256 poolRatio
    ) internal pure returns (uint256 tokensToGive) {
        if (poolRatio == 0) return 0;
        
        // tokensToGive = (stateToBurn / poolRatio) * 2
        return (stateToBurn * PRECISION_FACTOR * STATE_MULTIPLIER) / poolRatio;
    }
}

// src/AuctionSwap.sol

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
    uint256 constant MIN_DAV_REQUIRED = 1 ether;
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 public constant GOVERNANCE_UPDATE_DELAY = 7 days;
    uint256 constant MAX_CYCLES_PER_TOKEN = 20; // Each token can run for maximum 20 cycles
    
    // Core addresses
    address public stateToken;
    address public davToken;
    address public governanceAddress;
    address public airdropDistributor;
    IAuctionAdmin public auctionAdmin;
    address public pendingGovernance;
    address public pulseXRouter;
    address public pulseXFactory;
    address public lpHelper;
    
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
    
    constructor(address _gov) {
        governanceAddress = _gov;
        currentDayStart = _calcCurrentDayStart(block.timestamp);
        auctionSchedule.scheduleSize = 2;
        // Each token gets 20 auctions: 2 tokens × 20 = 40 total auction slots
        auctionSchedule.auctionDaysLimit = auctionSchedule.scheduleSize * 20;
    }

    // ================= Core Auction Functions (Simplified) =================
    
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
        
        if (!auctionSchedule.isAuctionActive(inputToken, block.timestamp, AuctionLib.AUCTION_DURATION)) 
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
        if (msg.sender != airdropDistributor && msg.sender != address(this)) revert UnauthorizedRegistration();
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
    
    /**
     * @notice Calculate net tokens user received from a specific normal auction cycle
     * @param user User address
     * @param token Token address
     * @param cycle Auction cycle number
     * @return netTokens Net tokens = airdrop + swapOutput - burned
     */
    function calculateNetTokensFromNormalAuction(
        address user,
        address token,
        uint256 cycle
    ) public view returns (uint256 netTokens) {
        // Get DAV used in Step 2 (full precision, e.g., 5.3 DAV = 5.3e18)
        uint256 davUsed = davTokensUsed[user][token][cycle];
        
        // Calculate airdrop from Step 1 (based on whole DAV units)
        // AirdropDistributor uses: davUnits = activeDav / 1e18 (whole units only)
        uint256 davWholeUnits = davUsed / 1e18;
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
     * @return maxAuctions Maximum number of auctions allowed per token (20)
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
     * @return totalSlots Total number of auction slots that can be completed (scheduleSize × 20)
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
     * @dev Can only deploy up to scheduleSize (2) tokens
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
     * @dev Automatically calculates next Pakistan 11:30 PM as start time
     * @dev Uses tokens that were automatically registered during createPoolOneClick calls
     * @dev This is the ONLY function needed to start auctions - just click "Start Auction"
     */
    function startAuctionWithAutoTokens() external onlyGovernance {
        if (!autoScheduleLocked) revert TokensNotRegistered();
        if (autoRegisteredTokens.length == 0) revert NoAutoTokens();
        if (auctionSchedule.scheduleSet) revert ScheduleAlreadySet();
        
        // Automatically calculate next Pakistan 11:00 PM time
        uint256 startAt = TimeUtilsLib.calculateNextClaimStartPakistan(block.timestamp);
        
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
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        paused = _paused;
    }
    
    function _setMaxAuctionParticipants(uint256 newMax) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        maxAuctionParticipants = newMax;
    }
    
    function _setDexAddresses(address _router, address _factory) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        pulseXRouter = _router;
        pulseXFactory = _factory;
    }
    
    function _setGovernance(address newGov) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        governanceAddress = newGov;
    }
    
    function _setPendingGovernance(address pending, uint256 timestamp) external {
        if (msg.sender != address(auctionAdmin)) revert OnlyAdmin();
        pendingGovernance = pending;
        governanceUpdateTimestamp = timestamp;
    }
    
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

    /// @notice Approve a spender to pull tokens from the SWAP vault (required by BuyAndBurnController)
    /// @dev Resets allowance to 0 before setting the new amount to comply with non-standard ERC20s
    function setVaultAllowance(address token, address spender, uint256 amount) external onlyGovernance nonReentrant {
        if (token == address(0) || spender == address(0)) revert ZeroAddr();
        _setExactAllowance(token, spender, amount);
    }

    /// @notice Batch-approve a single spender for multiple tokens from the SWAP vault
    function setVaultAllowances(address[] calldata tokens, address spender, uint256 amount) external onlyGovernance nonReentrant {
        if (spender == address(0)) revert ZeroAddr();
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            if (token == address(0)) revert ZeroAddr();
            _setExactAllowance(token, spender, amount);
        }
    }

    /// @notice Governance function to directly distribute tokens from SWAP vault to recipients
    /// @dev This is the proper UI-based governance function that handles distribution internally
    /// @param token The token address to distribute
    /// @param recipient The address to receive the tokens
    /// @param amount The amount of tokens to distribute
    function distributeFromVault(address token, address recipient, uint256 amount) external onlyGovernance nonReentrant {
        if (token == address(0)) revert ZeroAddr();
        if (recipient == address(0)) revert ZeroAddr();
        if (amount == 0) revert AmountZero();
        
        // Check vault balance
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        if (vaultBalance < amount) revert InsufficientVault();
        
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
        if (token == address(0)) revert ZeroAddr();
        if (recipients.length != amounts.length) revert ArrayLengthMismatch();
        if (recipients.length == 0) revert EmptyArrays();
        
        uint256 totalAmount = 0;
        for (uint256 i = 0; i < amounts.length; i++) {
            if (recipients[i] == address(0)) revert ZeroAddr();
            if (amounts[i] == 0) revert AmountZero();
            totalAmount += amounts[i];
        }
        
        // Check vault balance for total amount
        uint256 vaultBalance = IERC20(token).balanceOf(address(this));
        if (vaultBalance < totalAmount) revert InsufficientVault();
        
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
        if (_stateToken == address(0)) revert StateNotSet();
        if (_davToken == address(0)) revert InvalidParam();
        if (_lpHelper == address(0)) revert InvalidParam();
        if (_airdropDistributor == address(0)) revert InvalidParam();
        if (_auctionAdmin == address(0)) revert InvalidParam();
        if (_buyBurnController == address(0)) revert InvalidParam();
        if (_pulseXRouter == address(0)) revert RouterNotSet();
        if (_pulseXFactory == address(0)) revert FactoryNotSet();
        
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
        if (airdropDistributor == address(0)) revert AirdropNotSet();
        
        for (uint256 i = 0; i < tokens.length; i++) {
            address token = tokens[i];
            if (token == address(0)) revert ZeroAddr();
            if (!supportedTokens[token]) revert TokenNotSupported();
            
            // Reset approval to 0 first (for tokens that require it)
            IERC20(token).approve(airdropDistributor, 0);
            // Set maximum approval
            IERC20(token).approve(airdropDistributor, type(uint256).max);
        }
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

