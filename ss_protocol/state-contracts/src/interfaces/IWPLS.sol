// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title IWPLS
 * @notice Interface for Wrapped PLS (WPLS) token
 */
interface IWPLS is IERC20 {
    /// @notice Deposit PLS to get WPLS
    function deposit() external payable;
    
    /// @notice Withdraw PLS by burning WPLS
    function withdraw(uint256 amount) external;
}