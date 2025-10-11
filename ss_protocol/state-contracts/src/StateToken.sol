// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
// The Ownable contract from OpenZeppelin is used exclusively to manage ownership during deployment.
// Ownership enables the deployer to perform initial setup tasks and then renounce ownership immediately after.
// This ensures that no centralized control remains, increasing user trust and decentralization.
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title STATE Token V2.1 with Ratio-Based Initial Supply Allocation
/// @author System State Protocol
/// @notice ERC20 token with 5/95 minting distribution between two addresses at deployment
/// @dev Uses OpenZeppelin ERC20 and Ownable contracts

//-------------------------------Token name clarification----------------------------------
//NOTE: Mainnet token name is pSTATE

contract STATE_V3 is ERC20, Ownable(msg.sender) {
    /// @notice Fixed initial supply allocated at deployment (100 trillion tokens, 18 decimals)
    event InitialAllocation(
        address indexed fivePercentRecipient,
        address indexed ninetyFivePercentRecipient,
        uint256 fivePercentAmount,
        uint256 ninetyFivePercentAmount
    );
    // Total supply target: 100 trillion tokens (18 decimals)
    // 5% = 5 trillion, 95% = 95 trillion
    uint256 public constant FIVE_PERCENT_ALLOCATION = 5000000000000 ether; // 5,000,000,000,000
    uint256 public constant NINETY_FIVE_PERCENT_ALLOCATION = 95000000000000 ether; // 95,000,000,000,000
    /// @param tokenName The name of the token
    /// @param tokenSymbol The symbol of the token
    /// @param recipientFivePercent Address receiving 5% of total supply
    /// @param recipientNinetyFivePercent Address receiving 95% of total supply
    constructor(
        string memory tokenName,
        string memory tokenSymbol,
        address recipientFivePercent,
        address recipientNinetyFivePercent
    ) ERC20(tokenName, tokenSymbol) {
        require(recipientFivePercent != address(0), "Invalid 5% address");
        require(
            recipientFivePercent != recipientNinetyFivePercent,
            "Recipients must be different"
        );
        require(
            recipientNinetyFivePercent != address(0),
            "Invalid 95% address"
        );
        require(recipientFivePercent != address(this), "Cannot mint to token contract");
        require(recipientNinetyFivePercent != address(this), "Cannot mint to token contract");

        _mint(recipientFivePercent, FIVE_PERCENT_ALLOCATION);
        _mint(recipientNinetyFivePercent, NINETY_FIVE_PERCENT_ALLOCATION);
        emit InitialAllocation(
            recipientFivePercent,
            recipientNinetyFivePercent,
            FIVE_PERCENT_ALLOCATION,
            NINETY_FIVE_PERCENT_ALLOCATION
        );
        // Auto-renounce ownership post-initialization to align with minimal governance
        renounceOwnership();
    }

    /// @notice Sanity check for deployment: verifies that allocations sum to 100 trillion and 5% proportion holds.
    function verifyAllocations() external pure returns (bool ok, uint256 total) {
        total = FIVE_PERCENT_ALLOCATION + NINETY_FIVE_PERCENT_ALLOCATION;
        bool sumOk = (total == 100000000000000 ether);
        bool ratioOk = (FIVE_PERCENT_ALLOCATION * 100 / total == 5);
        ok = (sumOk && ratioOk);
    }
}
