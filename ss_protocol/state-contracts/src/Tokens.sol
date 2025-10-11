// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @title Token - ERC20 token with initial distribution between governance and swap treasury
/// @author System State Protocol
/// @notice This contract mints a fixed maximum supply and distributes initial tokens to governance and swap treasury addresses.
/// @dev The contract inherits from OpenZeppelin's ERC20 and Ownable contracts.
contract TOKEN_V3 is ERC20, Ownable {
    /// @notice The maximum total supply of tokens (5 billion tokens with 18 decimals)
    uint256 public constant MAX_SUPPLY = 5000000000 ether; // 5 billion
    uint256 public constant ONE_PERCENT = 50000000 ether;
    uint256 public constant NINETY_NINE_PERCENT = 4950000000 ether;
    bool private _mintingFinalized = false; // Flag to prevent re-minting after initial distribution

    modifier onlyDuringConstructor() {
        require(!_mintingFinalized, "Minting has already been finalized");
        _;
    }
    event InitialDistribution(
        address indexed gov,
        address indexed treasury,
        uint256 govAmount,
        uint256 treasuryAmount
    );

    /**
     * @notice Constructs the Token contract and mints initial tokens
     * @param name The name of the ERC20 token
     * @param symbol The symbol of the ERC20 token
     * @param _gov The address of the governance wallet receiving 1% of total supply
     * @param _swapTreasury The address of the swap treasury wallet receiving 99% of total supply
     * @param _owner The owner of the contract (Ownable)
     * @dev Requires valid non-zero addresses for governance, swap treasury, and owner.
     *      Mints 1% of MAX_SUPPLY to governance address, 99% to swap treasury.
     */
    constructor(
        string memory name,
        string memory symbol,
        address _gov,
        address _swapTreasury,
        address _owner
    ) ERC20(name, symbol) Ownable(_owner) {
        require(
            _gov != address(0) &&
                _swapTreasury != address(0) &&
                _gov != _swapTreasury &&
                _owner != address(0),
            "Invalid address"
        );
        _mintingFinalized = true; // Set flag to prevent further minting
        _mint(_gov, ONE_PERCENT);
        _mint(_swapTreasury, NINETY_NINE_PERCENT);
        emit InitialDistribution(
            _gov,
            _swapTreasury,
            ONE_PERCENT,
            NINETY_NINE_PERCENT
        );
    }
}
