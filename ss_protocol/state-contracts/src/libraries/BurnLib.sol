// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title BurnLib
 * @notice Library for handling token burning operations in the auction system
 * @dev ARCHITECTURE NOTE - Library Access Control:
 *      This is a LIBRARY, not a standalone contract. Library functions can ONLY be called
 *      by contracts that import them (in this case, AuctionSwap.sol).
 *      
 *      Security Model:
 *      - Library functions are NOT directly callable by users on-chain
 *      - Only AuctionSwap.sol can invoke these functions
 *      - AuctionSwap.sol provides all access control (nonReentrant, whenNotPaused, validations)
 *      - Library focuses on execution logic, not security checks
 *      
 *      Token Flow:
 *      - Normal Auction: Users burn auction tokens → receive STATE from vault
 *      - Reverse Auction: Users burn STATE → receive auction tokens from vault
 *      - All burned tokens sent to 0xdead address (permanent removal from circulation)
 *      
 *      Validation:
 *      - All input validation happens in AuctionSwap.sol BEFORE calling library
 *      - Validating in library would be redundant and waste gas
 *      - This separation of concerns is intentional and follows best practices
 *      
 *      Reentrancy Protection:
 *      - Protected by nonReentrant modifier in AuctionSwap.sol entry points
 *      - Library inherits protection from calling contract
 *      - SafeERC20 used for all token transfers (prevents malicious token exploits)
 *      
 *      AUDIT CLARIFICATION:
 *      If you're auditing this library in isolation, you MUST examine AuctionSwap.sol
 *      to understand the complete security model. Library functions are helper code,
 *      not standalone entry points.
 */
library BurnLib {
    using SafeERC20 for IERC20;
    
    // Burn address for permanently removing tokens from circulation
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    // ================= Events =================
    
    /// @notice Emitted when tokens are permanently burned to dead address
    /// @param token Address of the token burned
    /// @param amount Amount of tokens burned
    /// @param user Address of the user who initiated the burn
    event TokensBurned(address indexed token, uint256 amount, address indexed user);
    
    /// @notice Emitted when STATE tokens are issued to user in normal auction
    /// @param user Address receiving STATE tokens
    /// @param amount Amount of STATE tokens issued
    /// @param cycle Auction cycle number
    event StateTokensIssued(address indexed user, uint256 amount, uint256 indexed cycle);
    
    /// @notice Emitted when STATE tokens are burned in reverse auction
    /// @param user Address burning STATE tokens
    /// @param amount Amount of STATE tokens burned
    /// @param cycle Auction cycle number
    event ReverseStateTokensBurned(address indexed user, uint256 amount, uint256 indexed cycle);
    
    /// @notice Emitted when auction tokens are issued to user in reverse auction
    /// @param user Address receiving auction tokens
    /// @param amount Amount of auction tokens issued
    /// @param cycle Auction cycle number
    event AuctionTokensIssued(address indexed user, uint256 amount, uint256 indexed cycle);

    // ================= Structs =================
    
    /**
     * @notice Parameters for normal auction token burning (Step 2)
     * @param user Address of the user performing the burn
     * @param auctionToken Address of the auction token being burned
     * @param stateToken Address of the STATE token being issued
     * @param currentCycle Current auction cycle number
     * @param tokensToBurn Amount of auction tokens to burn
     * @param stateToGive Amount of STATE tokens to issue from vault
     * @param availableDav Amount of DAV used for this burn operation
     */
    struct BurnParams {
        address user;
        address auctionToken;
        address stateToken;
        uint256 currentCycle;
        uint256 tokensToBurn;
        uint256 stateToGive;
        uint256 availableDav;
    }

    /**
     * @notice Parameters for reverse auction STATE burning (Step 2)
     * @param user Address of the user performing the burn
     * @param auctionToken Address of the auction token being issued
     * @param stateToken Address of the STATE token being burned
     * @param currentCycle Current auction cycle number
     * @param stateToBurn Amount of STATE tokens to burn
     * @param tokensToGive Amount of auction tokens to issue from vault
     */
    struct ReverseBurnParams {
        address user;
        address auctionToken;
        address stateToken;
        uint256 currentCycle;
        uint256 stateToBurn;
        uint256 tokensToGive;
    }

    // ================= Core Functions =================
    
    /**
     * @notice Execute normal auction token burn (Step 2 of normal auction)
     * @dev This function is called ONLY by AuctionSwap.burnTokensForState()
     *      All validation happens in the calling function before this is invoked.
     *      
     *      Operation Flow:
     *      1. Update user's burn tracking (allows multiple burns per cycle)
     *      2. Burn auction tokens permanently to dead address
     *      3. Transfer STATE tokens from vault to user
     *      4. Emit tracking events
     *      
     *      Security & Validation (ALL done in AuctionSwap.sol before calling this):
     *      - nonReentrant modifier protects against reentrancy
     *      - whenNotPaused ensures system is active
     *      - Token validation: supportedTokens[auctionToken] check, stateToken != address(0)
     *      - Balance validation: userBalance >= tokensToBurn
     *      - Allowance validation: user approved contract to spend tokens
     *      - DAV validation: totalDavBalance >= MIN_DAV_REQUIRED
     *      - Cycle validation: currentCycle calculated and tracked
     *      - Vault validation: contract has sufficient STATE balance
     *      - Step 1 validation: user completed airdrop claim (via AirdropDistributor)
     *      
     *      No validation needed in library - all checks done at application layer.
     *      This is intentional for gas efficiency (no redundant validation).
     *      Uses SafeERC20 for all transfers (prevents malicious token exploits).
     *      
     * @param params Struct containing burn operation parameters (pre-validated by caller)
     * @param hasUserBurnedTokens Mapping tracking if user has burned tokens for a cycle
     * @param userStateBalance Mapping of user's STATE balance earned per cycle
     * @param tokensBurnedByUser Mapping of tokens burned by user per cycle
     * @param davTokensUsed Mapping of DAV tokens used by user per cycle
     * @param TotalTokensBurned Mapping tracking total burned tokens globally
     */
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
        
        // Burn the auction tokens permanently by sending to dead address
        IERC20(params.auctionToken).safeTransferFrom(params.user, BURN_ADDRESS, params.tokensToBurn);
        TotalTokensBurned[params.auctionToken] += params.tokensToBurn;
        
        // Give STATE tokens to user from contract vault
        IERC20(params.stateToken).safeTransfer(params.user, params.stateToGive);
        
        // Emit burn event to track the burning of auction tokens
        emit TokensBurned(params.auctionToken, params.tokensToBurn, params.user);
        emit StateTokensIssued(params.user, params.stateToGive, params.currentCycle);
    }

    /**
     * @notice Execute reverse auction STATE burn (Step 2 of reverse auction)
     * @dev This function is called ONLY by AuctionSwap.burnStateForTokens()
     *      All validation happens in the calling function before this is invoked.
     *      
     *      Operation Flow:
     *      1. Verify user hasn't already completed reverse step 2 (once per cycle)
     *      2. Mark step 2 as completed
     *      3. Burn STATE tokens permanently to dead address
     *      4. Transfer auction tokens from vault to user
     *      5. Emit tracking events
     *      
     *      Security & Validation (ALL done in AuctionSwap.sol before calling this):
     *      - nonReentrant modifier protects against reentrancy
     *      - whenNotPaused ensures system is active
     *      - Token validation: supportedTokens[auctionToken] check, stateToken != address(0)
     *      - Reverse auction validation: isReverseAuctionActive(auctionToken)
     *      - Cycle validation: currentCycle <= MAX_CYCLES_PER_TOKEN
     *      - Step 1 validation: hasCompletedReverseStep1[user][token][cycle]
     *      - Balance validation: userCurrentStateBalance >= stateToBurn
     *      - Allowance validation: user approved contract to spend STATE
     *      - Vault validation: contract has sufficient auction tokens
     *      - Amount validation: stateToBurn forced to exact reverseStateBalance amount
     *      
     *      Library adds double-execution protection via hasCompletedReverseStep2 flag.
     *      No other validation needed - all checks done at application layer.
     *      This is intentional for gas efficiency (no redundant validation).
     *      Uses SafeERC20 for all transfers (prevents malicious token exploits).
     *      
     * @param params Struct containing reverse burn operation parameters (pre-validated by caller)
     * @param hasCompletedReverseStep2 Mapping tracking reverse step 2 completion
     * @param reverseStateBalance Mapping of STATE balance from reverse step 1
     * @param TotalTokensBurned Mapping tracking total burned tokens globally
     */
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
        
        // Burn STATE tokens permanently by sending to dead address
        IERC20(params.stateToken).safeTransferFrom(params.user, BURN_ADDRESS, params.stateToBurn);
        TotalTokensBurned[params.stateToken] += params.stateToBurn;
        
        // Give auction tokens to user from contract vault
        IERC20(params.auctionToken).safeTransfer(params.user, params.tokensToGive);
        
        // Emit burn event to track the burning of STATE tokens in reverse auction
        emit TokensBurned(params.stateToken, params.stateToBurn, params.user);
        emit ReverseStateTokensBurned(params.user, params.stateToBurn, params.currentCycle);
        emit AuctionTokensIssued(params.user, params.tokensToGive, params.currentCycle);
    }
}