// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface SwapEvents {
    event DailyStateReleaseRolled(uint256 indexed dayIndex, uint256 amount, uint256 newDayStart);
    event AuctionStarted(uint256 startTime, uint256 endTime, address inputToken, address stateToken);
    event TokenDeployed(string name, address tokenAddress, uint256 tokenNo);
    event TokensDeposited(address indexed token, uint256 amount);
    event RewardDistributed(address indexed user, uint256 amount);
    event TokensSwapped(address indexed user, address indexed inputToken, address indexed stateToken, uint256 amountIn, uint256 amountOut);
    event TokenAdded(address indexed token, address pairAddress);
    event GovernanceUpdateProposed(address newGov, uint256 timestamp);
    event GovernanceUpdated(address newGov);
    event ContractPaused(address by);
    event ContractUnpaused(address by);
    event AuctionScheduleSet(uint256 startAt, uint256 count);
    event AuctionDaysLimitUpdated(uint256 newLimit);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event ProtocolFeeAccrued(address indexed token, uint256 amount);
    event BurnAccrued(address indexed token, uint256 amount);
    event NewDayStarted(uint256 newDayStart);
    event AuctionAdminSet(address indexed admin);
    event AirdropDistributorSet(address indexed airdropDistributor);
    event DavTokenAddressSet(address indexed davToken);
    event DexAddressesUpdated(address router, address factory);
    event UserAutoRegistered(address indexed user, uint256 timestamp);
    event MaxParticipantsUpdated(uint256 oldMax, uint256 newMax);
    event RegistrationCapReached(uint256 maxParticipants);
    event LiquidityAdded(address indexed token, address indexed pair, uint256 amountState, uint256 amountToken, uint256 liquidity);
    event PoolCreated(address indexed token, address indexed pair, uint256 tokenAmount, uint256 stateAmount);
    event LPTokensBurned(address indexed pair, uint256 liquidity, address burnAddress);
    // Protocol governance transfer events
    event ProtocolGovernanceTransferInitiated(address indexed newGovernance, uint256 timestamp);
    event ProtocolGovernanceTransferCompleted(address indexed newGovernance);
    // Vault distribution events
    event VaultDistribution(address indexed token, address indexed recipient, uint256 amount);
    // Auction fee collection event
    event AuctionFeeCollected(address indexed token, uint256 feeAmount, address indexed user);
    // System initialization event
    event SystemInitialized(
        address indexed stateToken,
        address indexed davToken,
        address lpHelper,
        address airdropDistributor,
        address auctionAdmin,
        address buyBurnController,
        address pulseXRouter,
        address pulseXFactory
    );
}
