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

interface IBuyAndBurnController {
    function transferGovernanceByAdmin(address newGovernance) external;
}

/**
 * @title AuctionAdmin
 * @author State Protocol Team
 * @notice Administrative contract managing auction operations, token deployment, and fee distribution
 * @dev Handles governance transfers, development fee wallet management, and token deployment
 * @custom:governance 7-day timelock for governance transfers across all protocol contracts
 * @custom:fees Distributes DAV minting fees (5% PLS) and auction fees (0.5%) to dev wallets
 * @custom:wallets Maximum 5 development fee wallets, percentages must sum to 100
 * @custom:centralization Single governance address controls protocol - intended for launchpad model with timelock protection
 */
contract AuctionAdmin is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    ISWAP_V3 public mainContract;
    address public governance;
    
    // ================= Governance Transfer System =================
    
    /// @notice Pending governance proposal with timelock
    struct GovernanceProposal {
        address newGovernance;
        uint256 timestamp;
    }
    GovernanceProposal public pendingProtocolGovernance;
    
    /// @notice Timelock duration for governance transfers (7 days)
    uint256 public constant GOVERNANCE_TIMELOCK = 7 days;
    
    // ================= Development Fee Wallet System =================
    // Used by DAV token (5% PLS minting fee) and AuctionSwap (0.5% auction fees)
    
    /// @notice Information for a development fee recipient wallet
    /// @dev Percentage must sum to 100 across all active wallets
    struct DevFeeWalletInfo {
        address wallet;         // Recipient address
        uint256 percentage;     // Allocation out of 100 (e.g., 40 = 40%)
        bool active;            // Whether this wallet is currently active
    }
    
    /// @notice Mapping of development fee wallet configurations by index
    /// @dev Uses index-based mapping for efficient iteration and compaction
    mapping(uint256 => DevFeeWalletInfo) public developmentFeeWallets;
    
    /// @notice Reverse mapping for quick wallet address to index lookup
    /// @dev Updated during add/remove operations to maintain consistency
    mapping(address => uint256) public feeWalletToIndex;
    
    /// @notice Current number of registered development fee wallets
    /// @dev Maximum of 5 wallets allowed (MAX_DEV_FEE_WALLETS)
    uint256 public developmentFeeWalletsCount;
    
    /// @notice Maximum number of development fee wallets allowed
    /// @dev Set to 5 to prevent excessive gas costs in distribution loops
    uint256 public constant MAX_DEV_FEE_WALLETS = 5;
    
    event ContractPaused(address indexed pauser);
    event ContractUnpaused(address indexed unpauser);
    event MaxParticipantsUpdated(uint256 oldValue, uint256 newValue);
    event DexAddressesUpdated(address indexed router, address indexed factory);
    event TokenDeployed(string name, address indexed token, uint256 tokenId);
    event AuctionStarted(uint256 startTime, uint256 endTime, address indexed token, address indexed stateToken);
    event DavTokenAddressSet(address indexed davToken);
    event TokensDeposited(address indexed token, uint256 amount);
    event ProtocolFeeAccrued(address indexed token, uint256 amount);
    event BurnAccrued(address indexed token, uint256 amount);
    event PoolCreated(address indexed token, address indexed pair, uint256 tokenAmount, uint256 stateAmount);
    event DailyStateReleaseRolled(uint256 dayIndex, uint256 amountReleased, uint256 nextWindowStart);
    event DevelopmentFeeWalletAdded(address indexed wallet, uint256 percentage);
    event DevelopmentFeeWalletRemoved(address indexed wallet);
    event DevelopmentFeeWalletPercentageUpdated(address indexed wallet, uint256 oldPercentage, uint256 newPercentage);
    event ProtocolGovernanceProposed(address indexed newGovernance, uint256 executeAfter);
    event ProtocolGovernanceTransferred(address indexed newGovernance);
    event ProtocolGovernanceProposalCancelled(address indexed cancelledGovernance);

    modifier onlyMainContract() {
        require(msg.sender == address(mainContract), "Only main contract");
        _;
    }
    
    modifier onlyGovernance() {
        require(msg.sender == governance, "Only governance");
        _;
    }

    constructor(address _mainContract, address _governance) Ownable(msg.sender) {
        require(_mainContract != address(0) && _governance != address(0), "Zero address");
        mainContract = ISWAP_V3(_mainContract);
        governance = _governance;
        
        // Renounce ownership immediately - governance has direct admin rights
        renounceOwnership();
    }

    // ================= Centralized Governance Transfer (7-Day Timelock) =================
    
    /**
     * @notice Propose new governance for entire protocol (7-day timelock)
     * @param newGovernance Address of new governance (typically a multisig)
     * @dev Starts timelock - must call confirmProtocolGovernance() after 7 days
     * @dev Transfers governance for all protocol contracts:
     *      - AuctionSwap: governance
     *      - DavToken: governance
     *      - BuyAndBurnController: governance
     *      - AuctionAdmin: governance (self)
     *      
     *      NOTE: All contracts renounce ownership in constructor
     *            AirdropDistributor is fully autonomous (no governance)
     */
    function proposeProtocolGovernance(address newGovernance) external onlyGovernance {
        require(newGovernance != address(0), "Zero address");
        
        pendingProtocolGovernance = GovernanceProposal({
            newGovernance: newGovernance,
            timestamp: block.timestamp + GOVERNANCE_TIMELOCK
        });
        
        emit ProtocolGovernanceProposed(newGovernance, block.timestamp + GOVERNANCE_TIMELOCK);
    }

    /**
     * @notice Confirm governance transfer after timelock expires
     * @dev Transfers governance for ALL protocol contracts atomically:
     *      1. AuctionSwap (SWAP_V3) - transfers governance
     *      2. DavToken (DAV_V3) - transfers governance
     *      3. BuyAndBurnController_V2 - transfers governance (read from SWAP)
     *      4. AuctionAdmin - transfers own governance (last)
     * @custom:security All transfers atomic - if any fails, entire transaction reverts
     * @custom:excluded SwapLens (renounced ownership), AirdropDistributor (autonomous)
     */
    function confirmProtocolGovernance() external onlyGovernance {
        require(pendingProtocolGovernance.newGovernance != address(0), "No pending governance");
        require(block.timestamp >= pendingProtocolGovernance.timestamp, "Timelock not expired");
        
        address newGov = pendingProtocolGovernance.newGovernance;
        
        // 1. Transfer AuctionSwap governance (ownership renounced in constructor)
        mainContract._setGovernance(newGov);
        
        // 2. Transfer DavToken governance (ownership renounced in constructor)
        address davToken = mainContract.davToken();
        if (davToken != address(0)) {
            IDAV(davToken).transferGovernanceImmediate(newGov);
        }
        
        // 3. Transfer BuyAndBurnController governance (ownership renounced in constructor)
        address buyAndBurn = mainContract.buyAndBurnController();
        if (buyAndBurn != address(0)) {
            IBuyAndBurnController(buyAndBurn).transferGovernanceByAdmin(newGov);
        }
        
        // 4. SwapLens - ownership renounced, no transfer needed
        // 5. AirdropDistributor - fully autonomous, no governance
        
        // 6. Transfer own governance (last operation)
        governance = newGov;
        
        // Clear pending proposal
        delete pendingProtocolGovernance;
        
        emit ProtocolGovernanceTransferred(newGov);
    }
    
    /**
     * @notice Cancel pending governance proposal (emergency)
     * @dev Only callable by current governance before timelock expires
     */
    function cancelProtocolGovernanceProposal() external onlyGovernance {
        require(pendingProtocolGovernance.newGovernance != address(0), "No pending governance");
        address cancelledGovernance = pendingProtocolGovernance.newGovernance;
        delete pendingProtocolGovernance;
        emit ProtocolGovernanceProposalCancelled(cancelledGovernance);
    }
    
    /**
     * @notice View pending governance proposal details
     * @return newGovernance Proposed new governance address
     * @return executeAfter Timestamp when proposal can be executed
     * @return isReady Whether timelock has passed and proposal is ready
     */
    function getPendingGovernance() external view returns (
        address newGovernance,
        uint256 executeAfter,
        bool isReady
    ) {
        newGovernance = pendingProtocolGovernance.newGovernance;
        executeAfter = pendingProtocolGovernance.timestamp;
        isReady = newGovernance != address(0) && block.timestamp >= executeAfter;
    }
    
    /**
     * @notice One-click token deployment with automatic SWAP registration
     * @param swapContract The SWAP_V3 contract address initiating the call (must match mainContract)
     * @param name Token name for the new token
     * @param symbol Token symbol for the new token
     * @return tokenAddress Address of the newly deployed token (100% supply minted to SWAP vault)
     * @custom:security Only callable by mainContract, all tokens minted to SWAP treasury atomically
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
        address swapGovernance = mainContract.governanceAddress();

        // Deploy the token - 100% to SWAP treasury in SINGLE transaction
        // NOTE: _owner = address(0) makes token ownerless from deployment (modified OZ Ownable allows this)
        //       This is intentional and more efficient than deploying with owner then calling renounceOwnership()
        TOKEN_V3 token = new TOKEN_V3(
            name,
            symbol,
            address(mainContract),   // recipient (100% to SWAP contract in single mint)
            address(0)               // _owner (ownerless deployment - custom OZ modification)
        );

        tokenAddress = address(token);

        // Register the token with the main contract (deployer shown as governance for UI ownership mapping)
        mainContract._registerDeployedToken(tokenAddress, name, swapGovernance);

        emit TokenDeployed(name, tokenAddress, 0);
        return tokenAddress;
    }

    // ================= Development Fee Wallet Management =================
    
    /**
     * @notice Add a new development fee wallet with automatic equal distribution
     * @param wallet Address of the development wallet to add
     * @dev Automatically rebalances all wallets to equal percentages (e.g., 3 wallets = 33/33/34)
     * @custom:limit Maximum 5 wallets enforced to prevent excessive gas costs
     * @custom:security Validates wallet not already registered and count below MAX_DEV_FEE_WALLETS
     */
    function addDevelopmentFeeWallet(address wallet) external onlyGovernance {
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
     * @dev Uses swap-and-pop pattern for array compaction with proper mapping updates
     * @custom:pattern Moves last wallet to removed position, updates mappings, decrements count
     * @custom:security Validates wallet exists and is active before removal
     */
    function removeDevelopmentFeeWallet(address wallet) external onlyGovernance {
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
    function updateDevelopmentFeeWalletPercentage(address wallet, uint256 newPercentage) external onlyGovernance {
        require(wallet != address(0), "Zero address");
        require(newPercentage <= 100, "Invalid percentage");
        
        uint256 index = feeWalletToIndex[wallet];
        require(developmentFeeWallets[index].active, "Wallet not active");
        require(developmentFeeWallets[index].wallet == wallet, "Wallet mismatch");
        
        uint256 oldPercentage = developmentFeeWallets[index].percentage;
        
        // Calculate total without this wallet
        uint256 otherWalletsTotal = _getTotalDevFeePercentage() - oldPercentage;
        
        // Allow setting to 0% as part of wallet removal workflow
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
     * @custom:formula basePercentage = 100 / count, remainder goes to first wallet
     * @custom:example 1 wallet = 100%, 2 wallets = 50/50, 3 wallets = 33/33/34
     * @custom:remainder First wallet (index 0) receives remainder to ensure total equals 100%
     *                   This is intentional - provides deterministic distribution with minimal complexity
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
     * @notice Distribute fees to development wallets based on configured percentages
     * @param token Address of the token to distribute (STATE, auction tokens, PLS, etc.)
     * @param amount Total amount of tokens to distribute among dev wallets
     * @dev Called automatically by AuctionSwap (0.5% fees) and DAV (5% mint fees)
     * @custom:caller Callable by mainContract or governance for manual distributions
     * @custom:distribution Shares based on wallet percentages, dust goes to first active wallet
     * @custom:security Uses SafeERC20, reverts if insufficient balance
     * @custom:integration DAV distributes PLS fees directly, this handles ERC20 token fees
     */
    function distributeFeeToWallets(address token, uint256 amount) external {
        require(msg.sender == address(mainContract) || msg.sender == governance, "Unauthorized");
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
                    IERC20(token).safeTransfer(developmentFeeWallets[i].wallet, share);
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
                    IERC20(token).safeTransfer(developmentFeeWallets[i].wallet, dust);
                    break;
                }
            }
        }
    }
}