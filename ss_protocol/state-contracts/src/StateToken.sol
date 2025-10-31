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

//-------------------------------Token name clarification----------------------------------
//NOTE: Mainnet token name is pSTATE

contract STATE_V3 is ERC20, Ownable(msg.sender) {
    /// @notice Fixed initial supply allocated at deployment (100 trillion tokens, 18 decimals)
    event InitialAllocation(
        address indexed recipient,
        uint256 totalAmount
    );
    
    // Total supply: 100 trillion tokens (18 decimals)
    uint256 public constant TOTAL_SUPPLY = 100000000000000 ether; // 100,000,000,000,000
    
    /// @param tokenName The name of the token
    /// @param tokenSymbol The symbol of the token
    /// @param recipient Address receiving 100% of total supply (typically auction contract)
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address recipient
    ) ERC20(tokenName, tokenSymbol) {
        require(recipient != address(0), "Invalid recipient address");
        require(recipient != address(this), "Cannot mint to token contract");

        // Mint entire supply in single transaction
        _mint(recipient, TOTAL_SUPPLY);
        
        emit InitialAllocation(recipient, TOTAL_SUPPLY);
        
        // Auto-renounce ownership post-initialization to align with minimal governance
        renounceOwnership();
    }

    /// @notice Sanity check for deployment: verifies total supply is 100 trillion tokens.
    function verifyAllocations() external pure returns (bool ok, uint256 total) {
        total = TOTAL_SUPPLY;
        ok = (total == 100000000000000 ether);
    }
}
