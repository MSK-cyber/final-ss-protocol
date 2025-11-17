// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title STATE_V3 - State Protocol Token
 * @author State Protocol Team
 * @notice ERC20 token with 100% supply minted to auction contract at deployment
 * @dev Simple, immutable token with no admin functions after deployment
 *
 * @custom:supply 100 trillion tokens (100,000,000,000,000 with 18 decimals)
 * @custom:allocation Entire supply minted to SWAP_V3 auction contract in constructor
 * @custom:governance Ownership renounced immediately - fully decentralized from deployment
 * @custom:security No mint, burn, or admin functions - pure ERC20 implementation
 */
contract STATE_V3 is ERC20, Ownable(msg.sender) {
    
    // ============ Events ============
    
    /// @notice Emitted when initial supply is minted during deployment
    /// @param recipient Address receiving the entire token supply (SWAP_V3 contract)
    /// @param totalAmount Total tokens minted (100 trillion with 18 decimals)
    event InitialAllocation(
        address indexed recipient,
        uint256 totalAmount
    );
    
    // ============ Constants ============
    
    /// @notice Total supply of STATE tokens
    /// @dev 100 trillion tokens: 100,000,000,000,000 × 10^18 wei
    ///      Compile-time constant - does not consume storage slot
    uint256 public constant TOTAL_SUPPLY = 100000000000000 ether;
    
    // ============ Constructor ============
    
    /// @notice Deploys STATE token with entire supply minted to recipient
    /// @param tokenName Human-readable token name (e.g., "PulseState1")
    /// @param tokenSymbol Token ticker symbol (e.g., "pSTATE1")
    /// @param recipient Address receiving 100% of supply (SWAP_V3 auction contract)
    /// @dev Constructor operations (atomic transaction):
    ///      1. Validate recipient address (non-zero)
    ///      2. Mint 100 trillion tokens to recipient
    ///      3. Emit InitialAllocation event
    ///      4. Renounce ownership (permanent decentralization)
    /// @dev After deployment, no address has admin privileges - pure ERC20 functionality only
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address recipient
    ) ERC20(tokenName, tokenSymbol) {
        require(recipient != address(0), "Invalid recipient address");

        // Mint entire supply to auction contract
        _mint(recipient, TOTAL_SUPPLY);
        
        emit InitialAllocation(recipient, TOTAL_SUPPLY);
        
        // Renounce ownership for permanent decentralization
        renounceOwnership();
    }
}
