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
    
    // ================= Development Fee Wallet System =================
    // Used by DAV token (5% PLS minting fee) and AuctionSwap (0.5% auction fees)
    
    struct DevFeeWalletInfo {
        address wallet;
        uint256 percentage; // Out of 100 (e.g., 40 = 40%)
        bool active;
    }
    
    mapping(uint256 => DevFeeWalletInfo) public developmentFeeWallets;
    mapping(address => uint256) public feeWalletToIndex; // Quick lookup: wallet address -> index
    uint256 public developmentFeeWalletsCount;
    uint256 public constant MAX_DEV_FEE_WALLETS = 5;
    
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
    event DevelopmentFeeWalletAdded(address indexed wallet, uint256 percentage);
    event DevelopmentFeeWalletRemoved(address indexed wallet);
    event DevelopmentFeeWalletPercentageUpdated(address indexed wallet, uint256 oldPercentage, uint256 newPercentage);

    modifier onlyMainContract() {
        require(msg.sender == address(mainContract), "Only main contract");
        _;
    }

    constructor(address _mainContract) Ownable(msg.sender) {
        mainContract = ISWAP_V3(_mainContract);
    }

    function setMainContract(address _mainContract) external onlyOwner {
        require(_mainContract != address(0), "Zero address");
        mainContract = ISWAP_V3(_mainContract);
    }

    // ================= Governance Functions (UI-Friendly - Auto-use mainContract) =================

    function pause() external onlyOwner {
        mainContract._setPaused(true);
        emit ContractPaused(msg.sender);
    }

    function unpause() external onlyOwner {
        mainContract._setPaused(false);
        emit ContractUnpaused(msg.sender);
    }

    function setMaxAuctionParticipants(uint256 newMax) external onlyOwner {
        mainContract._setMaxAuctionParticipants(newMax);
        emit MaxParticipantsUpdated(mainContract.maxAuctionParticipants(), newMax);
    }

    function setDexAddresses(address _router, address _factory) external onlyOwner {
        mainContract._setDexAddresses(_router, _factory);
        emit DexAddressesUpdated(_router, _factory);
    }


    function updateGovernance(address newGov) external onlyOwner {
        mainContract._setPendingGovernance(newGov, block.timestamp + mainContract.GOVERNANCE_UPDATE_DELAY());
        emit GovernanceUpdateProposed(newGov, block.timestamp);
    }

    function confirmGovernanceUpdate() external onlyOwner {
        address pendingGovernance = mainContract.pendingGovernance();
        uint256 timestamp = mainContract.governanceUpdateTimestamp();
        
        require(pendingGovernance != address(0), "No pending governance");
        require(block.timestamp >= timestamp, "Timelock not expired");
        
        mainContract._setGovernance(pendingGovernance);
        emit GovernanceUpdated(pendingGovernance);
    }

    function transferProtocolGovernance(address newGovernance) external onlyOwner {
        mainContract._setGovernance(newGovernance);
        
        address davToken = mainContract.davToken();
        if (davToken != address(0)) {
            IDAV(davToken).transferGovernanceImmediate(newGovernance);
        }
        emit ProtocolGovernanceTransferCompleted(newGovernance);
    }

    function setDavTokenAddress(address _davToken) external onlyOwner {
        // This would set DAV token address in the main contract
        // Implementation depends on main contract's setter
        emit DavTokenAddressSet(_davToken);
    }

    function depositTokens(
        address token,
        uint256 amount
    ) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(mainContract), amount);
        emit TokensDeposited(token, amount);
    }

    function deployUserToken(
        string memory name,
        string memory symbol,
        address recipient,
        address _owner
    ) external onlyOwner returns (address) {
        // Implementation would deploy token and register with main contract
        // recipient gets 100% of supply in single transaction
        address tokenAddress = address(new TOKEN_V3(name, symbol, recipient, _owner));
        
        // Register the deployed token with the main contract
        mainContract._registerDeployedToken(tokenAddress, name, _owner);
        
        emit TokenDeployed(name, tokenAddress, 0);
        return tokenAddress;
    }

    function createPoolForToken(
        address auctionToken,
        uint256 tokenAmount,
        uint256 stateAmount,
        address tokenOwner
    ) external onlyMainContract nonReentrant returns (address pair) {
        require(auctionToken != address(0), "Invalid token");
        require(tokenAmount > 0 && stateAmount > 0, "Invalid amounts");
        
        // Get the LPHelper from the main contract
        address lpHelper = mainContract.lpHelper();
        require(lpHelper != address(0), "LPHelper not set");
        
        // Get STATE token address
        address stateToken = mainContract.stateToken();
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

    function deployTokenOneClick(
        string memory name,
        string memory symbol
    ) external onlyMainContract returns (address tokenAddress) {
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Empty name or symbol");
        
        // Get governance address from the main contract
        address governance = mainContract.governanceAddress();
        
        // Deploy the token - 100% to SWAP treasury in SINGLE transaction
        TOKEN_V3 token = new TOKEN_V3(
            name,
            symbol,
            address(mainContract),   // recipient (100% to SWAP contract in single mint)
            governance               // _owner (governance as initial owner for setup only)
        );
        
        tokenAddress = address(token);
        
        // Register the token with the main contract
        mainContract._registerDeployedToken(tokenAddress, name, msg.sender);
        
        emit TokenDeployed(name, tokenAddress, 0); // tokenId will be set by main contract
        return tokenAddress;
    }

    /**
     * @notice IAuctionAdmin-compatible entrypoint invoked by SWAP_V3
     * @dev This matches the interface signature used by SWAP_V3: deployTokenOneClick(address,string,string)
     * @param swapContract The expected SWAP_V3 contract address initiating the call
     * @param name Token name
     * @param symbol Token symbol
     * @return tokenAddress Address of the newly deployed token
     */
    function deployTokenOneClick(
        address swapContract,
        string memory name,
        string memory symbol
    ) external returns (address tokenAddress) {
        // Ensure this is being called by the main contract and the provided address matches
        require(msg.sender == address(mainContract), "Only main contract");
        require(swapContract == address(mainContract), "Invalid swap contract");
        require(bytes(name).length > 0 && bytes(symbol).length > 0, "Empty name or symbol");

        // Get governance address from the main contract
        address governance = mainContract.governanceAddress();

        // Deploy the token - 100% to SWAP treasury in SINGLE transaction
        TOKEN_V3 token = new TOKEN_V3(
            name,
            symbol,
            address(mainContract),   // recipient (100% to SWAP contract in single mint)
            governance               // _owner (governance as initial owner for setup only)
        );

        tokenAddress = address(token);

        // Register the token with the main contract (deployer shown as governance for UI ownership mapping)
        mainContract._registerDeployedToken(tokenAddress, name, governance);

        emit TokenDeployed(name, tokenAddress, 0);
        return tokenAddress;
    }

    // ================= Development Fee Wallet Management =================
    
    /**
     * @notice Add a new development fee wallet with automatic equal distribution
     * @param wallet Address of the development wallet
     * @dev Automatically distributes percentages equally among all active wallets (including new one)
     */
    function addDevelopmentFeeWallet(address wallet) external onlyOwner {
        require(wallet != address(0), "Zero address");
        require(developmentFeeWalletsCount < MAX_DEV_FEE_WALLETS, "Max wallets reached");
        require(feeWalletToIndex[wallet] == 0 || !developmentFeeWallets[feeWalletToIndex[wallet]].active, "Wallet already exists");
        
        // Add new wallet with 0% initially
        uint256 index = developmentFeeWalletsCount;
        developmentFeeWallets[index] = DevFeeWalletInfo({
            wallet: wallet,
            percentage: 0,
            active: true
        });
        
        feeWalletToIndex[wallet] = index;
        developmentFeeWalletsCount++;
        
        // Automatically rebalance percentages equally among all active wallets
        _rebalanceAllWallets();
        
        emit DevelopmentFeeWalletAdded(wallet, developmentFeeWallets[index].percentage);
    }
    
    /**
     * @notice Remove a development fee wallet
     * @param wallet Address of the wallet to remove
     * @dev Automatically rebalances percentages equally among remaining wallets
     */
    function removeDevelopmentFeeWallet(address wallet) external onlyOwner {
        require(wallet != address(0), "Zero address");
        
        uint256 index = feeWalletToIndex[wallet];
        require(developmentFeeWallets[index].active, "Wallet not active");
        require(developmentFeeWallets[index].wallet == wallet, "Wallet mismatch");
        
        // Mark as inactive
        developmentFeeWallets[index].active = false;
        
        // Compact the array by moving last element to removed position
        uint256 lastIndex = developmentFeeWalletsCount - 1;
        if (index != lastIndex && developmentFeeWallets[lastIndex].active) {
            // Move last wallet to removed position
            developmentFeeWallets[index] = developmentFeeWallets[lastIndex];
            feeWalletToIndex[developmentFeeWallets[lastIndex].wallet] = index;
        }
        
        // Clear last position
        delete developmentFeeWallets[lastIndex];
        delete feeWalletToIndex[wallet];
        developmentFeeWalletsCount--;
        
        // Automatically rebalance percentages equally among remaining active wallets
        _rebalanceAllWallets();
        
        emit DevelopmentFeeWalletRemoved(wallet);
    }
    
    /**
     * @notice Update percentage for an existing development fee wallet
     * @param wallet Address of the wallet
     * @param newPercentage New percentage allocation (out of 100)
     * @dev Total percentage across all wallets must equal 100% (except when setting to 0% for removal)
     */
    function updateDevelopmentFeeWalletPercentage(address wallet, uint256 newPercentage) external onlyOwner {
        require(wallet != address(0), "Zero address");
        require(newPercentage <= 100, "Invalid percentage");
        
        uint256 index = feeWalletToIndex[wallet];
        require(developmentFeeWallets[index].active, "Wallet not active");
        require(developmentFeeWallets[index].wallet == wallet, "Wallet mismatch");
        
        uint256 oldPercentage = developmentFeeWallets[index].percentage;
        
        // Calculate total without this wallet
        uint256 otherWalletsTotal = _getTotalDevFeePercentage() - oldPercentage;
        
        // If setting to 0%, allow (for removal workflow)
        if (newPercentage == 0) {
            developmentFeeWallets[index].percentage = 0;
            emit DevelopmentFeeWalletPercentageUpdated(wallet, oldPercentage, 0);
            return;
        }
        
        // Otherwise, ensure total equals 100%
        require(otherWalletsTotal + newPercentage == 100, "Total must equal 100%");
        
        developmentFeeWallets[index].percentage = newPercentage;
        emit DevelopmentFeeWalletPercentageUpdated(wallet, oldPercentage, newPercentage);
    }
    
    /**
     * @notice Get all development fee wallets information
     * @return wallets Array of wallet addresses
     * @return percentages Array of percentage allocations
     * @return activeStatuses Array of active status flags
     */
    function getDevelopmentFeeWalletsInfo() external view returns (
        address[] memory wallets,
        uint256[] memory percentages,
        bool[] memory activeStatuses
    ) {
        wallets = new address[](developmentFeeWalletsCount);
        percentages = new uint256[](developmentFeeWalletsCount);
        activeStatuses = new bool[](developmentFeeWalletsCount);
        
        for (uint256 i = 0; i < developmentFeeWalletsCount; i++) {
            wallets[i] = developmentFeeWallets[i].wallet;
            percentages[i] = developmentFeeWallets[i].percentage;
            activeStatuses[i] = developmentFeeWallets[i].active;
        }
    }
    
    /**
     * @notice Get percentage allocation for a specific wallet
     * @param wallet Address of the wallet
     * @return percentage Percentage allocation (0-100)
     */
    function getWalletPercentage(address wallet) external view returns (uint256) {
        if (wallet == address(0)) return 0;
        
        uint256 index = feeWalletToIndex[wallet];
        if (!developmentFeeWallets[index].active) return 0;
        if (developmentFeeWallets[index].wallet != wallet) return 0;
        
        return developmentFeeWallets[index].percentage;
    }
    
    /**
     * @notice Get total percentage allocated across all active wallets
     * @return total The sum of all active wallet percentages
     */
    function _getTotalDevFeePercentage() internal view returns (uint256 total) {
        for (uint256 i = 0; i < developmentFeeWalletsCount; i++) {
            if (developmentFeeWallets[i].active) {
                total += developmentFeeWallets[i].percentage;
            }
        }
    }
    
    /**
     * @notice Automatically rebalance all active wallets to equal percentages
     * @dev Distributes 100% equally among all active wallets
     * Example: 1 wallet = 100%, 2 wallets = 50/50, 3 wallets = 33/33/34, etc.
     */
    function _rebalanceAllWallets() internal {
        if (developmentFeeWalletsCount == 0) return;
        
        // Calculate equal distribution
        uint256 basePercentage = 100 / developmentFeeWalletsCount;
        uint256 remainder = 100 % developmentFeeWalletsCount;
        
        // Distribute equally with remainder going to first wallet
        for (uint256 i = 0; i < developmentFeeWalletsCount; i++) {
            if (developmentFeeWallets[i].active) {
                if (i == 0) {
                    // First wallet gets base + remainder to ensure 100% total
                    developmentFeeWallets[i].percentage = basePercentage + remainder;
                } else {
                    developmentFeeWallets[i].percentage = basePercentage;
                }
            }
        }
    }
    
    /**
     * @notice Distribute fees to development wallets
     * @param token Address of the token to distribute (STATE, DAI, PLSX, etc.)
     * @param amount Amount of tokens to distribute
     * @dev Called by AuctionSwap to distribute 0.5% auction fees to dev wallets
     *      Only callable by mainContract (SWAP_V3) or owner (governance)
     */
    function distributeFeeToWallets(address token, uint256 amount) external {
        require(msg.sender == address(mainContract) || msg.sender == owner(), "Unauthorized");
        require(token != address(0), "Zero token address");
        require(amount > 0, "Zero amount");
        
        // If no wallets configured, do nothing (tokens stay in AuctionAdmin)
        if (developmentFeeWalletsCount == 0) return;
        
        uint256 totalDistributed = 0;
        
        // Distribute tokens based on percentages
        for (uint256 i = 0; i < developmentFeeWalletsCount; i++) {
            if (developmentFeeWallets[i].active && developmentFeeWallets[i].percentage > 0) {
                uint256 share = (amount * developmentFeeWallets[i].percentage) / 100;
                if (share > 0) {
                    IERC20(token).transfer(developmentFeeWallets[i].wallet, share);
                    totalDistributed += share;
                }
            }
        }
        
        // Handle dust (remainder due to rounding)
        uint256 dust = amount - totalDistributed;
        if (dust > 0 && developmentFeeWalletsCount > 0) {
            // Give dust to first active wallet with non-zero percentage
            for (uint256 i = 0; i < developmentFeeWalletsCount; i++) {
                if (developmentFeeWallets[i].active && developmentFeeWallets[i].percentage > 0) {
                    IERC20(token).transfer(developmentFeeWallets[i].wallet, dust);
                    break;
                }
            }
        }
    }
}
