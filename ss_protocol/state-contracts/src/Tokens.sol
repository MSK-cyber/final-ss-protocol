// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TOKEN_V3 - Auction Token Contract
 * @author State Protocol Team
 * @notice Generic ERC20 token with fixed 5 billion supply minted at deployment
 * @dev Used for auction tokens in State Protocol ecosystem
 *
 * @custom:supply 5 billion tokens (5,000,000,000 with 18 decimals)
 * @custom:allocation Entire supply minted to recipient (typically SWAP_V3) in constructor
 * @custom:ownership Deployed ownerless - constructor accepts address(0) for _owner parameter
 * @custom:ownable-modification Uses modified OpenZeppelin Ownable.sol with constructor validation removed
 *                               to allow address(0) as initial owner (ownerless from deployment)
 */
contract TOKEN_V3 is ERC20, Ownable {
    
    // ============ Constants ============
    
    /// @notice Total supply of auction tokens
    /// @dev 5 billion tokens: 5,000,000,000 × 10^18 wei
    ///      Compile-time constant - does not consume storage slot
    uint256 public constant MAX_SUPPLY = 5000000000 ether;
    
    // ============ Events ============
    
    /// @notice Emitted when initial supply is minted during deployment
    /// @param recipient Address receiving the entire token supply
    /// @param totalAmount Total tokens minted (5 billion with 18 decimals)
    event InitialDistribution(
        address indexed recipient,
        uint256 totalAmount
    );

    // ============ Constructor ============
    
    /// @notice Deploys auction token with entire supply minted to recipient
    /// @param name Human-readable token name (e.g., "MyToken")
    /// @param symbol Token ticker symbol (e.g., "MTK")
    /// @param recipient Address receiving 100% of supply (typically SWAP_V3 auction contract)
    /// @param _owner Owner address - pass address(0) for ownerless deployment (standard practice)
    /// @dev Constructor operations (atomic transaction):
    ///      1. Validate recipient address (non-zero)
    ///      2. Mint 5 billion tokens to recipient
    ///      3. Set owner (address(0) for ownerless tokens - modified OZ Ownable accepts this)
    ///      4. Emit InitialDistribution event
    /// @custom:ownerless-design Tokens deployed with _owner = address(0) have no owner from birth
    ///                          Modified Ownable.sol constructor allows this (standard OZ v5 would revert)
    ///                          This is intentional - saves gas vs deploying with owner then renouncing
    constructor(
        string memory name,
        string memory symbol,
        address recipient,
        address _owner
    ) ERC20(name, symbol) Ownable(_owner) {
        require(recipient != address(0), "Invalid recipient address");
        
        // Mint entire supply to auction contract
        _mint(recipient, MAX_SUPPLY);
        
        emit InitialDistribution(recipient, MAX_SUPPLY);
    }
}
