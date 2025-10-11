// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {TOKEN_V3} from "./Tokens.sol";
import "./interfaces/ISWAP_V3.sol";
import "./libraries/TimeUtilsLib.sol";

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPulseXRouter02 {
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IDAV {
    function transferGovernanceImmediate(address newGovernance) external;
}

interface ILPHelper {
    function factory() external view returns (address);
    function createLPAndRegister(
        address token,
        address tokenOwner,
        uint256 amountStateDesired,
        uint256 amountTokenDesired,
        uint256 amountStateMin,
        uint256 amountTokenMin,
        uint256 deadline
    ) external;
}

contract AuctionAdmin is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISWAP_V3 public mainContract;
    
    event ContractPaused(address indexed pauser);
    event ContractUnpaused(address indexed unpauser);
    event MaxParticipantsUpdated(uint256 oldValue, uint256 newValue);
    event DexAddressesUpdated(address indexed router, address indexed factory);
    event TokenDeployed(string name, address indexed token, uint256 tokenId);
    event AuctionStarted(uint256 startTime, uint256 endTime, address indexed token, address indexed stateToken);
    event GovernanceUpdateProposed(address indexed newGovernance, uint256 timestamp);
    event GovernanceUpdated(address indexed newGovernance);
    event ProtocolGovernanceTransferCompleted(address indexed newGovernance);
    event DavTokenAddressSet(address indexed davToken);
    event TokensDeposited(address indexed token, uint256 amount);
    event ProtocolFeeAccrued(address indexed token, uint256 amount);
    event BurnAccrued(address indexed token, uint256 amount);
    event PoolCreated(address indexed token, address indexed pair, uint256 tokenAmount, uint256 stateAmount);
    event DailyStateReleaseRolled(uint256 dayIndex, uint256 amountReleased, uint256 nextWindowStart);

    modifier onlyMainContract() {
        require(msg.sender == address(mainContract), "Only main contract");
        _;
    }

    modifier onlyValidContract(address swapContract) {
        require(swapContract == address(mainContract), "Invalid swap contract");
        _;
    }

    constructor(address _mainContract) Ownable(msg.sender) {
        mainContract = ISWAP_V3(_mainContract);
    }

    function setMainContract(address _mainContract) external onlyOwner {
        require(_mainContract != address(0), "Zero address");
        mainContract = ISWAP_V3(_mainContract);
    }

    // ================= Governance Functions =================

    function pause(address swapContract) external onlyOwner {
        ISWAP_V3(swapContract)._setPaused(true);
        emit ContractPaused(msg.sender);
    }

    function unpause(address swapContract) external onlyOwner {
        ISWAP_V3(swapContract)._setPaused(false);
        emit ContractUnpaused(msg.sender);
    }

    function setMaxAuctionParticipants(address swapContract, uint256 newMax) external onlyOwner {
        ISWAP_V3(swapContract)._setMaxAuctionParticipants(newMax);
        emit MaxParticipantsUpdated(ISWAP_V3(swapContract).maxAuctionParticipants(), newMax);
    }

    function setDexAddresses(address swapContract, address _router, address _factory) external onlyOwner {
        ISWAP_V3(swapContract)._setDexAddresses(_router, _factory);
        emit DexAddressesUpdated(_router, _factory);
    }

    function deployTokenOneClick(
        address swapContract,
        string memory name,
        string memory symbol
    ) external onlyMainContract onlyValidContract(swapContract) returns (address tokenAddress) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Empty name or symbol");
        
        // Get governance address from the swap contract
        address governance = ISWAP_V3(swapContract).governanceAddress();
        
        // Deploy the token with proper parameters
        TOKEN_V3 token = new TOKEN_V3(
            name,
            symbol,
            governance,   // _gov (governance gets 1%)
            swapContract, // _swapTreasury (swap contract gets 99%)
            governance    // _owner (governance as initial owner)
        );
        
        tokenAddress = address(token);
        
        // Register the token with the main contract
        ISWAP_V3(swapContract)._registerDeployedToken(tokenAddress, name, msg.sender);
        
        emit TokenDeployed(name, tokenAddress, 0); // tokenId will be set by main contract
        return tokenAddress;
    }

    function updateGovernance(address swapContract, address newGov) external onlyOwner {
        ISWAP_V3(swapContract)._setPendingGovernance(newGov, block.timestamp + ISWAP_V3(swapContract).GOVERNANCE_UPDATE_DELAY());
        emit GovernanceUpdateProposed(newGov, block.timestamp);
    }

    function confirmGovernanceUpdate(address swapContract) external onlyOwner {
        address pendingGovernance = ISWAP_V3(swapContract).pendingGovernance();
        uint256 timestamp = ISWAP_V3(swapContract).governanceUpdateTimestamp();
        
        require(pendingGovernance != address(0), "No pending governance");
        require(block.timestamp >= timestamp, "Timelock not expired");
        
        ISWAP_V3(swapContract)._setGovernance(pendingGovernance);
        emit GovernanceUpdated(pendingGovernance);
    }

    function transferProtocolGovernance(address swapContract, address newGovernance) external onlyOwner {
        ISWAP_V3(swapContract)._setGovernance(newGovernance);
        
        address davToken = ISWAP_V3(swapContract).davToken();
        if (davToken != address(0)) {
            IDAV(davToken).transferGovernanceImmediate(newGovernance);
        }
        emit ProtocolGovernanceTransferCompleted(newGovernance);
    }

    function setDavTokenAddress(address swapContract, address _davToken) external onlyOwner {
        // This would set DAV token address in the main contract
        // Implementation depends on main contract's setter
        emit DavTokenAddressSet(_davToken);
    }

    function depositTokens(
        address swapContract,
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, swapContract, amount);
        emit TokensDeposited(token, amount);
    }

    function deployUserToken(
        address swapContract,
        string memory name,
        string memory symbol,
        address _One,
        address _swap,
        address _owner
    ) external onlyOwner returns (address) {
        // Implementation would deploy token and register with main contract
        address tokenAddress = address(new TOKEN_V3(name, symbol, _One, _swap, _owner));
        
        // Register the deployed token with the main contract
        ISWAP_V3(swapContract)._registerDeployedToken(tokenAddress, name, _owner);
        
        emit TokenDeployed(name, tokenAddress, 0);
        return tokenAddress;
    }

    function createPoolForToken(
        address swapContract,
        address auctionToken,
        uint256 tokenAmount,
        uint256 stateAmount,
        address tokenOwner
    ) external onlyMainContract nonReentrant returns (address pair) {
        require(auctionToken != address(0), "Invalid token");
        require(tokenAmount > 0 && stateAmount > 0, "Invalid amounts");
        
        // Get the LPHelper from the swap contract
        address lpHelper = ISWAP_V3(swapContract).lpHelper();
        require(lpHelper != address(0), "LPHelper not set");
        
        // Get STATE token address
        address stateToken = ISWAP_V3(swapContract).stateToken();
        require(stateToken != address(0), "STATE token not set");
        
        // Transfer tokens to LPHelper for pool creation
        IERC20(stateToken).transfer(lpHelper, stateAmount);
        IERC20(auctionToken).transfer(lpHelper, tokenAmount);
        
        // Create the pool through LPHelper
        // Note: LPHelper will create pair, add liquidity, and register with swap contract
        ILPHelper(lpHelper).createLPAndRegister(
            auctionToken,
            tokenOwner,
            stateAmount,
            tokenAmount,
            stateAmount * 95 / 100, // 5% slippage tolerance
            tokenAmount * 95 / 100, // 5% slippage tolerance
            block.timestamp + 3600  // 1 hour deadline
        );
        
        // Get the created pair address
        IPulseXFactory factory = IPulseXFactory(ILPHelper(lpHelper).factory());
        pair = factory.getPair(auctionToken, stateToken);
        
        emit PoolCreated(auctionToken, pair, tokenAmount, stateAmount);
        return pair;
    }
}