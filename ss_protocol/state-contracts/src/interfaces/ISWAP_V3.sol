// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface ISWAP_V3 {
    // Governance state variables
    function governanceAddress() external view returns (address);
    function paused() external view returns (bool);
    function maxAuctionParticipants() external view returns (uint256);
    function treasury() external view returns (address);
    function davToken() external view returns (address);
    function stateToken() external view returns (address);
    function airdropDistributor() external view returns (address);
    function buyAndBurnController() external view returns (address);
    function swapLens() external view returns (address);
    function pulseXRouter() external view returns (address);
    function pulseXFactory() external view returns (address);
    
    // Admin-only state setters
    function _setPaused(bool _paused) external;
    function _setMaxAuctionParticipants(uint256 newMax) external;
    function _setDexAddresses(address _router, address _factory) external;
    function _setGovernance(address newGov) external;
    function _registerDeployedToken(address tokenAddress, string memory name, address deployer) external;
    function transferOwnershipByAdmin(address newOwner) external;
    
    // Vault allowance management
    function setVaultAllowance(address token, address spender, uint256 amount) external;
}