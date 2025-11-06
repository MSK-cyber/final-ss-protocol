// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// The Ownable contract from OpenZeppelin is used exclusively to manage ownership during deployment.
// Ownership enables the deployer to perform initial setup tasks and then renounce ownership immediately after.
// This ensures that no centralized control remains, increasing user trust and decentralization.
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title STATE Token V3 with Single Transaction Allocation
/// @author System State Protocol
/// @notice ERC20 token with 100% supply minted to auction contract in single transaction
/// @dev Uses OpenZeppelin ERC20 and Ownable contracts
/// @dev Ownership is renounced immediately after deployment to ensure full decentralization
/// @custom:security-contact security@systemstateprotocol.com

//-------------------------------Token name clarification----------------------------------
//NOTE: Mainnet token name is pSTATE1 (symbol: pSTATE1)

contract STATE_V3 is ERC20, Ownable(msg.sender) {
    
    // ============ Events ============
    
    /// @notice Emitted when the initial token supply is allocated during deployment
    /// @dev This event is emitted only once in the constructor
    /// @param recipient The address receiving the entire token supply (typically SWAP_V3 contract)
    /// @param totalAmount The total amount of tokens minted (100 trillion with 18 decimals)
    event InitialAllocation(
        address indexed recipient,
        uint256 totalAmount
    );
    
    // ============ Constants ============
    
    /// @notice Total supply of STATE tokens (100 trillion tokens with 18 decimals)
    /// @dev This is a compile-time constant and does not consume storage slots
    /// @dev Value: 100,000,000,000,000 * 10^18 = 100 trillion tokens
    uint256 public constant TOTAL_SUPPLY = 100000000000000 ether; // 100,000,000,000,000
    
    // ============ Constructor ============
    
    /// @notice Deploys the STATE_V3 token with entire supply minted to a single recipient
    /// @dev This constructor performs three critical operations in a single atomic transaction:
    ///      1. Validates the recipient address (must not be zero address)
    ///      2. Mints 100% of total supply (100 trillion tokens) to the recipient
    ///      3. Renounces ownership immediately to ensure decentralization
    /// @dev The Ownable pattern is used only for the deployment phase and is immediately renounced
    /// @dev Once deployed, no address has owner privileges - the token becomes fully decentralized
    /// @param tokenName The human-readable name of the token (e.g., "PulseState1")
    /// @param tokenSymbol The ticker symbol of the token (e.g., "pSTATE1")
    /// @param recipient Address receiving 100% of total supply (typically the SWAP_V3 auction contract)
    /// @custom:throws "Invalid recipient address" if recipient is the zero address
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address recipient
    ) ERC20(tokenName, tokenSymbol) {
        require(recipient != address(0), "Invalid recipient address");

        // Mint entire supply in single transaction
        _mint(recipient, TOTAL_SUPPLY);
        
        emit InitialAllocation(recipient, TOTAL_SUPPLY);
        
        // Auto-renounce ownership post-initialization to align with minimal governance
        renounceOwnership();
    }
}
