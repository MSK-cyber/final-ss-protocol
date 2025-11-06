// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title TOKEN_V3 - Generic ERC20 Token with Single Transaction Allocation
/// @author System State Protocol
/// @notice This contract creates a fixed-supply ERC20 token with 100% minted to a recipient at deployment
/// @dev Uses OpenZeppelin's audited ERC20 and Ownable implementations
/// @dev The entire supply (5 billion tokens) is minted in the constructor atomically
/// @dev Ownership is maintained for post-deployment configuration (e.g., token registration)
/// @dev Owner can renounce ownership after setup to achieve full decentralization
/// @custom:security-contact security@systemstateprotocol.com
contract TOKEN_V3 is ERC20, Ownable {
    
    // ============ Constants ============
    
    /// @notice The maximum total supply of tokens (5 billion tokens with 18 decimals)
    /// @dev This is a compile-time constant and does not consume storage slots
    /// @dev Value: 5,000,000,000 * 10^18 = 5 billion tokens
    uint256 public constant MAX_SUPPLY = 5000000000 ether; // 5 billion
    
    // ============ Events ============
    
    /// @notice Emitted when the initial token supply is allocated during deployment
    /// @dev This event is emitted only once in the constructor
    /// @param recipient The address receiving the entire token supply
    /// @param totalAmount The total amount of tokens minted (5 billion with 18 decimals)
    event InitialDistribution(
        address indexed recipient,
        uint256 totalAmount
    );

    // ============ Constructor ============
    
    /// @notice Deploys the TOKEN_V3 with entire supply minted to a single recipient
    /// @dev This constructor performs atomic token creation and supply distribution:
    ///      1. Validates recipient and owner addresses (must not be zero address)
    ///      2. Mints 100% of MAX_SUPPLY (5 billion tokens) to the recipient
    ///      3. Sets the owner for post-deployment configuration capability
    /// @dev The owner can later renounce ownership after completing setup tasks
    /// @dev All tokens are minted in a single transaction - no additional minting is possible
    /// @param name The human-readable name of the token (e.g., "MyToken")
    /// @param symbol The ticker symbol of the token (e.g., "MTK")
    /// @param recipient The address receiving 100% of total supply (typically SWAP_V3 or treasury)
    /// @param _owner The owner address for post-deployment administration (typically governance)
    /// @custom:throws "Invalid recipient address" if recipient is the zero address
    /// @custom:throws "Invalid owner address" if _owner is the zero address
    constructor(
        string memory name,
        string memory symbol,
        address recipient,
        address _owner
    ) ERC20(name, symbol) Ownable(_owner) {
        require(recipient != address(0), "Invalid recipient address");
        require(_owner != address(0), "Invalid owner address");
        
        // Mint entire supply in single atomic transaction
        _mint(recipient, MAX_SUPPLY);
        
        emit InitialDistribution(recipient, MAX_SUPPLY);
    }
}
