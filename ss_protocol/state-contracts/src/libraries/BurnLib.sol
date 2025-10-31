// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

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