// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IAuctionAdmin {
    function pause() external;
    function unpause() external;
    function setMaxAuctionParticipants(address swapContract, uint256 newMax) external;
    function setDexAddresses(address swapContract, address _router, address _factory) external;
    function deployTokenOneClick(address swapContract, string memory name, string memory symbol) external returns (address tokenAddress);
    function updateGovernance(address swapContract, address newGov) external;
    function confirmGovernanceUpdate(address swapContract) external;
    function transferProtocolGovernance(address swapContract, address newGovernance) external;
    function setDavTokenAddress(address swapContract, address _davToken) external;
    function depositTokens(address swapContract, address token, uint256 amount) external;
    function deployUserToken(address swapContract, string memory name, string memory symbol, address _One, address _swap, address _owner) external returns (address);
    function addToken(address swapContract, address token, address pairAddress, address _tokenOwner) external;
    function setAuctionSchedule(address swapContract, address[] calldata tokens) external;
    function setScheduleSize(address swapContract, uint256 newSize) external;
    function setAuctionDaysLimit(address swapContract, uint256 daysLimit) external;
    function setLPHelper(address swapContract, address helper) external;
    function setTreasury(address swapContract, address _treasury) external;
    function withdrawAccruedFees(address swapContract, address token, uint256 amount, address to) external;
    function setVaultAllowance(address swapContract, address token, address spender, uint256 amount) external;
    function setVaultAllowances(address swapContract, address[] calldata tokens, address spender, uint256 amount) external;
    function createPoolForToken(address swapContract, address auctionToken, uint256 tokenAmount, uint256 stateAmount, address tokenOwner) external returns (address pair);
    function startAutoAuction(address swapContract) external;
    function registerTokenWithPair(address swapContract, address token, address tokenOwner, address pairAddress) external;
    
    // Development Fee Wallet Management
    function addDevelopmentFeeWallet(address wallet, uint256 percentage) external;
    function removeDevelopmentFeeWallet(address wallet) external;
    function updateDevelopmentFeeWalletPercentage(address wallet, uint256 newPercentage) external;
    function getDevelopmentFeeWalletsInfo() external view returns (
        address[] memory wallets,
        uint256[] memory percentages,
        bool[] memory activeStatuses
    );
    function getWalletPercentage(address wallet) external view returns (uint256);
    function distributeFeeToWallets(address token, uint256 amount) external;
}
