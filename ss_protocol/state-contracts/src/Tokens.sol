// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

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
