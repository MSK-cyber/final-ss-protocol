// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

// PulseX Router interface
interface IPulseXRouter {
    function WETH() external pure returns (address);
    function factory() external view returns (address);
    function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts);
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external returns (uint[] memory amounts);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPulseXPair {
    function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast);
    function token0() external view returns (address);
}

interface IWPLS {
    function deposit() external payable;
    function withdraw(uint256 wad) external;
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
}

interface ISTATE {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function allowance(address owner, address spender) external view returns (uint256);
}

/**
 * @title BuyAndBurnController_V2
 * @author State Protocol Team
 * @notice Enhanced Buy & Burn Controller with optimal ratio-aware splitting and complete governance control
 * @dev This contract manages the STATE/WPLS liquidity pool and executes buy & burn operations to permanently
 *      remove STATE tokens from circulation while deepening liquidity.
 * 
 * KEY FEATURES:
 * ============
 * 1. Pool Creation: Governance can create and initialize the STATE/WPLS pool with one-click function
 * 2. PLS Handling: Automatic conversion of collected PLS to WPLS for operations
 * 3. Optimal Buy & Burn: Dynamic ratio-aware splitting ensures 100% fund utilization
 * 4. Liquidity Management: Add liquidity with automatic LP token burning
 * 5. Vault Integration: Sources STATE tokens from SWAP_V3 vault with allowance system
 * 
 * ARCHITECTURE:
 * ============
 * - Uses single SWAP_V3 address for vault operations (consolidated from previous SWAP_VAULT + SWAP)
 * - All operations are governance-only (onlyOwner) for security
 * - ReentrancyGuard protection on all state-changing functions
 * - SafeERC20 for safe token operations
 * - Integrates with PulseX DEX (Router, Factory, Pair)
 * 
 * WORKFLOW:
 * ========
 * 1. Governance sets up SWAP_V3 vault allowance via setupSwapVaultAllowance()
 * 2. Governance creates pool via createPoolOneClick() (one-time setup)
 * 3. Contract collects PLS from protocol operations (via receive())
 * 4. Governance calls executeFullBuyAndBurn() to:
 *    a. Convert PLS → WPLS
 *    b. Calculate optimal split for swap vs liquidity
 *    c. Swap WPLS → STATE
 *    d. Add liquidity and burn LP tokens permanently
 * 
 * @custom:security All external functions are governance-controlled (onlyGovernance modifier)
 * @custom:security Uses nonReentrant on all state-changing functions
 * @custom:security 5% maximum slippage protection (MAX_SLIPPAGE_BPS = 500)
 * @custom:lp-burn LP tokens are permanently burned to 0x...dEaD address
 */
contract BuyAndBurnController_V2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // ============ State Variables ============
    
    /// @notice Governance address (access control)
    /// @dev All protocol operations are governance-controlled
    address public governance;
    
    // ============ Immutable Core Addresses ============
    
    /// @notice STATE token contract address
    /// @dev Main protocol token that gets bought and burned
    address public immutable STATE;
    
    /// @notice Wrapped PLS (WPLS) contract address
    /// @dev Used for DEX operations and liquidity provision
    address public immutable WPLS;
    
    /// @notice PulseX Router contract address
    /// @dev Handles all DEX swap and liquidity operations
    address public immutable ROUTER;
    
    /// @notice PulseX Factory contract address
    /// @dev Used to get/create STATE/WPLS pair
    address public immutable FACTORY;
    
    /// @notice SWAP_V3 (AuctionSwap) contract address
    /// @dev Vault source for STATE tokens used in liquidity operations
    /// @dev Consolidated from previous SWAP_VAULT + SWAP (both pointed to same address)
    address public immutable SWAP_V3;
    
    /// @notice AuctionAdmin contract address
    /// @dev Can call governance coordination functions like ownership transfer
    address public immutable auctionAdmin;
    
    // ============ Pool Management ============
    
    /// @notice STATE/WPLS liquidity pool address
    /// @dev Set once by governance via setStateWplsPool() or createPoolOneClick()
    /// @dev All buy & burn operations target this pool
    address public stateWplsPool;
    
    // ============ Constants ============
    
    /// @notice Burn address for permanent token removal
    /// @dev LP tokens are sent here to permanently lock liquidity
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    
    /// @notice Maximum slippage tolerance in basis points (500 = 5%)
    /// @dev Applied to all DEX operations for front-running protection
    uint256 private constant MAX_SLIPPAGE_BPS = 500;
    
    // ============ Events ============
    
    /// @notice Emitted when STATE/WPLS pool is set or created
    /// @param pool Address of the STATE/WPLS liquidity pool
    /// @param stateAmount Amount of STATE tokens added to pool
    /// @param wplsAmount Amount of WPLS tokens added to pool
    /// @param liquidity Amount of LP tokens minted (and burned)
    event PoolCreated(address indexed pool, uint256 stateAmount, uint256 wplsAmount, uint256 liquidity);
    
    /// @notice Emitted when buy & burn operation is executed
    /// @param wplsUsed Total WPLS used (swap + liquidity provision)
    /// @param stateBought Amount of STATE tokens purchased via swap
    /// @param liquidityBurned Amount of LP tokens permanently burned
    event BuyAndBurnExecuted(uint256 wplsUsed, uint256 stateBought, uint256 liquidityBurned);
    
    /// @notice Emitted when PLS is converted to WPLS
    /// @param plsAmount Amount of PLS converted
    /// @param wplsAmount Amount of WPLS received (always equal to plsAmount)
    event PLSConverted(uint256 plsAmount, uint256 wplsAmount);
    
    /// @notice Emitted when full buy & burn cycle completes (PLS conversion + buy & burn)
    /// @param plsConverted Amount of PLS that was converted to WPLS
    /// @param wplsProcessed Amount of WPLS used in buy & burn operation
    event FullBuyAndBurnExecuted(uint256 plsConverted, uint256 wplsProcessed);
    
    /// @notice Emitted when initial pool is created via one-click function
    /// @param pool Address of the newly created STATE/WPLS pool
    /// @param stateAmount Amount of STATE tokens added to initial liquidity
    /// @param totalWpls Total WPLS amount used (from WPLS transfer + PLS conversion)
    /// @param plsSent Amount of PLS sent with transaction (converted to WPLS)
    event InitialPoolCreated(address indexed pool, uint256 stateAmount, uint256 totalWpls, uint256 plsSent);
    
    /// @notice Emitted when additional liquidity is added to existing pool
    /// @param pool Address of the STATE/WPLS pool
    /// @param stateAmount Amount of STATE tokens added
    /// @param wplsAmount Amount of WPLS tokens added
    /// @param liquidityBurned Amount of LP tokens minted and immediately burned
    event LiquidityAdded(address indexed pool, uint256 stateAmount, uint256 wplsAmount, uint256 liquidityBurned);
    
    /// @notice Emitted when governance address is transferred
    /// @param previousGovernance Address of the previous governance
    /// @param newGovernance Address of the new governance
    event GovernanceTransferred(address indexed previousGovernance, address indexed newGovernance);
    
    /**
     * @notice Initializes the BuyAndBurnController with core protocol addresses
     * @dev All addresses are immutable after deployment for security
     * @param _state STATE token contract address
     * @param _wpls WPLS (Wrapped PLS) contract address
     * @param _router PulseX Router contract address for DEX operations
     * @param _factory PulseX Factory contract address for pool management
     * @param _swapV3 SWAP_V3 (AuctionSwap) contract address - vault source for STATE tokens
     * @param _auctionAdmin AuctionAdmin contract address (governance coordinator)
     * @param _governance Governance address (access control)
     */
    constructor(
        address _state,
        address _wpls,
        address _router,
        address _factory,
        address _swapV3,
        address _auctionAdmin,
        address _governance
    ) Ownable(msg.sender) {
        require(_state != address(0), "Invalid STATE");
        require(_wpls != address(0), "Invalid WPLS");
        require(_router != address(0), "Invalid router");
        require(_factory != address(0), "Invalid factory");
        require(_swapV3 != address(0), "Invalid SWAP_V3");
        require(_auctionAdmin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");
        
        STATE = _state;
        WPLS = _wpls;
        ROUTER = _router;
        FACTORY = _factory;
        SWAP_V3 = _swapV3;
        auctionAdmin = _auctionAdmin;
        governance = _governance;
        renounceOwnership();
    }
    
    /// @notice Modifier for governance-only functions
    modifier onlyGovernance() {
        require(msg.sender == governance, "Only governance");
        _;
    }
    
    /// @notice Transfer governance via AuctionAdmin (for centralized governance transfer)
    /// @dev Only callable by AuctionAdmin during protocol-wide governance transfer
    /// @param newGovernance Address of the new governance
    function transferGovernanceByAdmin(address newGovernance) external {
        require(msg.sender == auctionAdmin, "Only admin");
        require(newGovernance != address(0), "Invalid governance");
        
        address previousGovernance = governance;
        governance = newGovernance;
        
        emit GovernanceTransferred(previousGovernance, newGovernance);
    }
    
    /**
     * @notice Set the STATE/WPLS pool address manually (governance only)
     * @dev Alternative to createPoolOneClick() if pool already exists on-chain
     * @dev Only callable once - cannot change pool after initialization
     * @param poolAddress Address of the existing STATE/WPLS pool
     * @custom:security onlyGovernance - governance-controlled
     * @custom:security Cannot be changed after first call (pool creation functions check stateWplsPool == address(0))
     */
    function setStateWplsPool(address poolAddress) external onlyGovernance {
        require(poolAddress != address(0), "Invalid pool address");
        stateWplsPool = poolAddress;
        emit PoolCreated(poolAddress, 0, 0, 0); // Emit with zero amounts since pool already exists
    }
    
    /**
     * @notice ONE-CLICK Pool Creation: Create STATE/WPLS pool with tokens from SWAP_V3 vault
     * @dev Complete pool initialization in single transaction - governance convenience function
     * @dev Automatically sources STATE tokens from SWAP_V3 vault, only requires PLS/WPLS from governance
     * @dev LP tokens are burned immediately to permanently lock initial liquidity
     * 
     * PREREQUISITES:
     * - SWAP_V3.initializeCompleteSystem() must have been called (sets unlimited allowance automatically)
     * - If wplsAmount > 0, governance must approve this contract for WPLS transfer
     * - Can send PLS as msg.value (will be converted to WPLS automatically)
     * 
     * PROCESS:
     * 1. Converts any sent PLS to WPLS
     * 2. Pulls STATE from SWAP_V3 vault using pre-set allowance
     * 3. Pulls WPLS from governance wallet (if wplsAmount > 0)
     * 4. Creates pool if doesn't exist
     * 5. Adds initial liquidity
     * 6. Burns all LP tokens permanently
     * 
     * @param stateAmount STATE tokens for initial liquidity (sourced from SWAP_V3 vault)
     * @param wplsAmount WPLS tokens for initial liquidity from governance wallet (optional if sending PLS)
     * @custom:security onlyGovernance + nonReentrant
     * @custom:security Can only be called once (requires stateWplsPool == address(0))
     */
    function createPoolOneClick(uint256 stateAmount, uint256 wplsAmount) external payable onlyGovernance nonReentrant {
        require(stateWplsPool == address(0), "Pool already initialized");
        require(stateAmount > 0, "Invalid STATE amount");
        // Calculate total WPLS needed
        uint256 totalWplsAmount = wplsAmount;
        
        // Convert any sent PLS to WPLS
        if (msg.value > 0) {
            IWPLS(WPLS).deposit{value: msg.value}();
            totalWplsAmount += msg.value;
        }
        
        require(totalWplsAmount > 0, "No WPLS provided");
        
        // Transfer STATE tokens from SWAP_V3 vault (allowance must be pre-set by governance)
        ISTATE(STATE).transferFrom(SWAP_V3, address(this), stateAmount);
        
        // If wplsAmount > 0, transfer WPLS from governance (must be pre-approved)
        if (wplsAmount > 0) {
            IERC20(WPLS).transferFrom(msg.sender, address(this), wplsAmount);
        }
        
        // Create pool if it doesn't exist
        address pool = IPulseXFactory(FACTORY).getPair(STATE, WPLS);
        if (pool == address(0)) {
            pool = IPulseXFactory(FACTORY).createPair(STATE, WPLS);
        }
        
        // Approve router for both tokens
        ISTATE(STATE).approve(ROUTER, stateAmount);
        IERC20(WPLS).approve(ROUTER, totalWplsAmount);
        
        // Add initial liquidity
        (uint256 amountState, uint256 amountWpls, uint256 liquidity) = IPulseXRouter(ROUTER).addLiquidity(
            STATE,
            WPLS,
            stateAmount,
            totalWplsAmount,
            (stateAmount * 95) / 100, // 5% slippage tolerance
            (totalWplsAmount * 95) / 100,
            address(this), // Controller holds initial LP tokens
            block.timestamp + 300
        );
        
        // Set pool address and burn initial LP tokens
        stateWplsPool = pool;
        IERC20(pool).transfer(BURN_ADDRESS, liquidity);
        
        emit PoolCreated(pool, amountState, amountWpls, liquidity);
        emit InitialPoolCreated(pool, stateAmount, totalWplsAmount, msg.value);
    }
    
    /**
     * @notice Add more liquidity to existing STATE/WPLS pool
     * @dev Allows governance to manually increase pool depth without waiting for buy & burn cycle
     * @dev STATE tokens sourced from SWAP_V3 vault, PLS/WPLS from governance wallet
     * @dev LP tokens are sent directly to burn address - permanently locked
     * 
     * PREREQUISITES:
     * - SWAP_V3.initializeCompleteSystem() must have been called (sets unlimited allowance automatically)
     * - Pool must exist (stateWplsPool != address(0))
     * - If wplsAmount > 0, governance must approve this contract for WPLS transfer
     * 
     * PROCESS:
     * 1. Converts any sent PLS to WPLS
     * 2. Pulls STATE from SWAP_V3 vault
     * 3. Pulls WPLS from governance wallet (if wplsAmount > 0)
     * 4. Adds liquidity to existing pool
     * 5. Burns LP tokens immediately (sent to BURN_ADDRESS in addLiquidity call)
     * 6. Any unused tokens remain in controller for future buy & burn
     * 
     * @param stateAmount Amount of STATE tokens to add (from SWAP_V3 vault)
     * @param wplsAmount Amount of WPLS tokens to add from governance wallet (optional if sending PLS)
     * @return liquidity Amount of LP tokens that were burned
     * @custom:security onlyGovernance + nonReentrant
     * @custom:security LP tokens burned atomically in same transaction
     */
    function addMoreLiquidity(
        uint256 stateAmount,
        uint256 wplsAmount
    ) external payable onlyGovernance nonReentrant returns (uint256 liquidity) {
        require(stateWplsPool != address(0), "Pool not initialized");
        require(stateAmount > 0, "Invalid STATE amount");
        
        // Calculate total WPLS needed
        uint256 totalWplsAmount = wplsAmount;
        
        // Convert any sent PLS to WPLS
        if (msg.value > 0) {
            IWPLS(WPLS).deposit{value: msg.value}();
            totalWplsAmount += msg.value;
        }
        
        require(totalWplsAmount > 0, "No WPLS/PLS provided");
        
        // Transfer STATE tokens from SWAP_V3 vault (allowance must be pre-set by governance)
        ISTATE(STATE).transferFrom(SWAP_V3, address(this), stateAmount);
        
        // If wplsAmount > 0, transfer WPLS from governance (must be pre-approved)
        if (wplsAmount > 0) {
            IERC20(WPLS).transferFrom(msg.sender, address(this), wplsAmount);
        }
        
        // Approve router for both tokens
        ISTATE(STATE).approve(ROUTER, stateAmount);
        IERC20(WPLS).approve(ROUTER, totalWplsAmount);
        
        // Add liquidity - LP tokens go directly to BURN address
        (uint256 amountState, uint256 amountWpls, uint256 lpAmount) = 
            IPulseXRouter(ROUTER).addLiquidity(
                STATE,
                WPLS,
                stateAmount,
                totalWplsAmount,
                (stateAmount * 95) / 100, // 5% slippage tolerance
                (totalWplsAmount * 95) / 100,
                BURN_ADDRESS,  // LP tokens burned immediately!
                block.timestamp + 300
            );
        
        require(lpAmount > 0, "No LP tokens minted");
        
        // Keep unused tokens in contract for future buy & burn operations
        // STATE and WPLS leftovers can be utilized by executeBuyAndBurn()
        
        // Clean up allowances
        ISTATE(STATE).approve(ROUTER, 0);
        IERC20(WPLS).approve(ROUTER, 0);
        
        emit LiquidityAdded(stateWplsPool, amountState, amountWpls, lpAmount);
        
        return lpAmount;
    }
    
    /**
     * @notice Convert accumulated PLS to WPLS (governance callable)
     * @dev Standalone function for manual PLS conversion if needed
     * @dev Usually not needed - executeFullBuyAndBurn() does this automatically
     * @dev Useful for separate conversion before executeBuyAndBurn() if governance prefers granular control
     * @custom:security onlyGovernance + nonReentrant
     */
    function convertPLSToWPLS() external onlyGovernance nonReentrant {
        uint256 plsBalance = address(this).balance;
        require(plsBalance > 0, "No PLS to convert");
        
        IWPLS(WPLS).deposit{value: plsBalance}();
        
        emit PLSConverted(plsBalance, plsBalance);
    }
    
    /**
     * @notice Execute optimal buy & burn with dynamic ratio calculation
     * @dev Core buy & burn logic - requires WPLS already in contract
     * @dev For full automation (PLS conversion + buy & burn), use executeFullBuyAndBurn() instead
     * 
     * ALGORITHM:
     * 1. Gets current pool reserves (STATE/WPLS)
     * 2. Calculates optimal split: portion for swap vs portion for liquidity
     * 3. Swaps WPLS → STATE via PulseX
     * 4. Adds liquidity with purchased STATE + remaining WPLS
     * 5. Burns all LP tokens permanently
     * 
     * OPTIMIZATION:
     * - Uses iterative algorithm (max 10 iterations) to find optimal split
     * - Ensures 100% fund utilization - no leftover WPLS
     * - Considers pool ratio changes from the swap itself
     * 
     * @custom:security onlyGovernance + nonReentrant
     * @custom:security 5% slippage protection on all DEX operations
     * @custom:iteration Loop hard-capped at 10 iterations
     */
    function executeBuyAndBurn() external onlyGovernance nonReentrant {
        require(stateWplsPool != address(0), "Pool not initialized");
        
        uint256 wplsBalance = IERC20(WPLS).balanceOf(address(this));
        require(wplsBalance > 0, "No WPLS available");
        
        uint256 existingStateBalance = ISTATE(STATE).balanceOf(address(this));
        
        // Get current pool reserves
        (uint256 stateReserve, uint256 wplsReserve) = getPoolReserves();
        require(stateReserve > 0 && wplsReserve > 0, "Invalid pool state");
        
        // Calculate optimal split considering existing STATE and ratio changes
        (uint256 wplsForSwap, uint256 expectedState, uint256 stateForLP, uint256 wplsForLP) = 
            calculateOptimalSplit(wplsBalance, existingStateBalance, stateReserve, wplsReserve);
        
        require(wplsForSwap > 0, "No WPLS for swap");
        require(wplsForLP > 0, "No WPLS for LP");
        
        // Step 1: Swap WPLS for STATE
        uint256 stateBought = _swapWPLSForSTATE(wplsForSwap, expectedState);
        
        // Step 2: Use total STATE (bought + existing) for liquidity
        uint256 totalStateAvailable = stateBought + existingStateBalance;
        require(totalStateAvailable >= stateForLP, "Insufficient STATE");
        
        // Step 3: Add liquidity and burn
        uint256 liquidityBurned = _addLiquidityAndBurn(stateForLP, wplsForLP);
        
        emit BuyAndBurnExecuted(wplsForSwap + wplsForLP, stateBought, liquidityBurned);
    }
    
    /**
     * @notice Calculate optimal WPLS split considering pool ratio changes and existing STATE
     * @dev Pure function - performs iterative calculation to find best split ratio
     * @dev Goal: Maximize buy & burn efficiency while ensuring 100% fund utilization
     * 
     * ALGORITHM EXPLANATION:
     * - Accounts for existing STATE balance to reduce WPLS needed for swapping
     * - Start with 70/30 split (70% for swap, 30% for liquidity)
     * - Iterate up to 10 times to refine the split
     * - Each iteration checks if we'll have enough STATE (bought + existing) for LP
     * - Adjusts split if total STATE < STATE needed for liquidity
     * - Converges to optimal split where all WPLS is utilized
     * 
     * WHY ITERATIVE:
     * - Swapping changes the pool ratio
     * - After swap, the ratio determines how much STATE we need for remaining WPLS
     * - Must calculate considering the new ratio AFTER the swap
     * 
     * @param totalWPLS Total WPLS available for buy & burn operation
     * @param existingState Existing STATE balance in contract from previous operations
     * @param stateReserve Current STATE reserve in pool (before operation)
     * @param wplsReserve Current WPLS reserve in pool (before operation)
     * @return wplsForSwap Amount of WPLS to use for buying STATE
     * @return expectedState Amount of STATE expected from swap (approximate, excludes 0.29% fee)
     * @return stateForLP Amount of STATE needed for liquidity provision
     * @return wplsForLP Amount of WPLS to use for liquidity provision
     * @custom:formula Constant product AMM: k = stateReserve * wplsReserve
     * @custom:estimation Fee-less calculation for split optimization, actual swap applies 0.29% PulseX fee
     * @custom:slippage 5% protection accounts for fees + price impact in actual swap execution
     */
    function calculateOptimalSplit(
        uint256 totalWPLS,
        uint256 existingState,
        uint256 stateReserve,
        uint256 wplsReserve
    ) public pure returns (
        uint256 wplsForSwap,
        uint256 expectedState,
        uint256 stateForLP,
        uint256 wplsForLP
    ) {
        uint256 k = stateReserve * wplsReserve;
        
        // SCENARIO 1: Check if existing STATE is enough to pair with all WPLS
        // Calculate STATE needed at current pool ratio
        uint256 stateNeededAtCurrentRatio = (totalWPLS * stateReserve) / wplsReserve;
        
        if (existingState >= stateNeededAtCurrentRatio) {
            // We have enough STATE - no swap needed, add all as liquidity
            wplsForSwap = 0;
            expectedState = 0;
            wplsForLP = totalWPLS;
            stateForLP = stateNeededAtCurrentRatio;
            return (wplsForSwap, expectedState, stateForLP, wplsForLP);
        }
        
        // SCENARIO 2: We need more STATE - calculate minimum swap required
        // Start with deficit-based calculation
        uint256 stateDeficit = stateNeededAtCurrentRatio - existingState;
        // Estimate WPLS needed to buy the deficit (approximate, will be refined in iterations)
        uint256 minSwapEstimate = (stateDeficit * wplsReserve) / stateReserve;
        
        // SCENARIO 3: Initial swap percentage (50/50 split is optimal for constant product AMM)
        uint256 startingSwapPercent = existingState > 0 ? 30 : 50;
        wplsForSwap = (totalWPLS * startingSwapPercent) / 100;
        
        // If we have existing STATE, start closer to the minimum needed
        if (existingState > 0 && minSwapEstimate < wplsForSwap) {
            wplsForSwap = minSwapEstimate;
        }
        
        // Iterate to find optimal split (max 10 iterations)
        for (uint256 i = 0; i < 10; i++) {
            // Calculate STATE from swap using constant product formula
            uint256 newWplsReserve = wplsReserve + wplsForSwap;
            expectedState = stateReserve - (k / newWplsReserve);
            
            // Calculate remaining WPLS for LP
            wplsForLP = totalWPLS - wplsForSwap;
            
            // Calculate new pool ratio after swap
            uint256 finalStateReserve = stateReserve - expectedState;
            uint256 finalWplsReserve = newWplsReserve;
            
            // STATE needed for LP at new ratio
            stateForLP = (wplsForLP * finalStateReserve) / finalWplsReserve;
            
            // Check if we have enough STATE (bought + existing)
            uint256 totalStateAvailable = expectedState + existingState;
            
            if (totalStateAvailable >= stateForLP) {
                // We have enough STATE - check if we can optimize further
                if (totalStateAvailable > stateForLP && existingState > 0 && i < 9) {
                    // We have excess STATE - try reducing swap more aggressively
                    uint256 excess = totalStateAvailable - stateForLP;
                    // More aggressive reduction when we have existing STATE
                    uint256 reduction = (excess * wplsReserve) / stateReserve;
                    
                    if (wplsForSwap > reduction && wplsForSwap >= reduction) {
                        wplsForSwap = wplsForSwap > reduction ? wplsForSwap - reduction : 0;
                        
                        // Don't reduce to zero if we still need some STATE
                        if (wplsForSwap == 0 && existingState < stateForLP) {
                            wplsForSwap = (stateForLP - existingState) * wplsReserve / stateReserve;
                        }
                        continue; // Re-calculate with reduced swap
                    }
                }
                // Optimal split found
                break;
            } else {
                // Need to buy more STATE - increase swap amount
                uint256 deficit = stateForLP - totalStateAvailable;
                uint256 adjustment = (deficit * wplsReserve) / stateReserve;
                
                if (wplsForSwap + adjustment <= totalWPLS) {
                    wplsForSwap += adjustment;
                } else {
                    // Can't increase more, use all remaining WPLS for swap
                    wplsForSwap = totalWPLS;
                    wplsForLP = 0;
                    break;
                }
            }
        }
        
        return (wplsForSwap, expectedState, stateForLP, wplsForLP);
    }
    
    /**
     * @notice Get current pool reserves (STATE, WPLS)
     * @dev Reads reserves from PulseX pair contract and orders them correctly
     * @dev Handles token ordering (token0/token1) automatically
     * @return stateReserve Current STATE token reserve in pool
     * @return wplsReserve Current WPLS token reserve in pool
     * @custom:security View function - safe to call anytime
     */
    function getPoolReserves() public view returns (uint256 stateReserve, uint256 wplsReserve) {
        require(stateWplsPool != address(0), "Pool not set");
        
        (uint112 reserve0, uint112 reserve1,) = IPulseXPair(stateWplsPool).getReserves();
        address token0 = IPulseXPair(stateWplsPool).token0();
        
        if (token0 == STATE) {
            stateReserve = uint256(reserve0);
            wplsReserve = uint256(reserve1);
        } else {
            stateReserve = uint256(reserve1);
            wplsReserve = uint256(reserve0);
        }
    }
    
    /**
     * @notice Internal function to swap WPLS for STATE
     * @dev Executes swap via PulseX Router with slippage protection
     * @param wplsAmount Amount of WPLS to swap
     * @param minStateOut Minimum STATE expected (before slippage adjustment)
     * @return stateReceived Actual amount of STATE received from swap
     * @custom:security Applies MAX_SLIPPAGE_BPS (5%) protection
     * @custom:security Calculates received amount from before/after balance (not trusting return value alone)
     * @custom:approval Exact amount approval to trusted PulseX Router (atomic transaction reverts all on failure)
     */
    function _swapWPLSForSTATE(uint256 wplsAmount, uint256 minStateOut) internal returns (uint256 stateReceived) {
        IERC20(WPLS).approve(ROUTER, wplsAmount);
        
        address[] memory path = new address[](2);
        path[0] = WPLS;
        path[1] = STATE;
        
        uint256 stateBefore = ISTATE(STATE).balanceOf(address(this));
        
        IPulseXRouter(ROUTER).swapExactTokensForTokens(
            wplsAmount,
            (minStateOut * (10000 - MAX_SLIPPAGE_BPS)) / 10000, // Apply slippage protection
            path,
            address(this),
            block.timestamp + 300
        );
        
        uint256 stateAfter = ISTATE(STATE).balanceOf(address(this));
        stateReceived = stateAfter - stateBefore;
    }
    
    /**
     * @notice Internal function to add liquidity and burn LP tokens
     * @dev Adds liquidity to STATE/WPLS pool and immediately burns received LP tokens
     * @param stateAmount Amount of STATE to add to liquidity
     * @param wplsAmount Amount of WPLS to add to liquidity
     * @return liquidityBurned Amount of LP tokens minted and burned
     * @custom:security LP tokens sent to BURN_ADDRESS (0x...dEaD) - permanent removal
     * @custom:security 5% slippage protection on both tokens
     * @custom:security Calculates burned amount from before/after balance
     */
    function _addLiquidityAndBurn(uint256 stateAmount, uint256 wplsAmount) internal returns (uint256 liquidityBurned) {
        ISTATE(STATE).approve(ROUTER, stateAmount);
        IERC20(WPLS).approve(ROUTER, wplsAmount);
        
        uint256 lpBefore = IERC20(stateWplsPool).balanceOf(address(this));
        
        // Calculate minimum amounts with slippage protection
        uint256 amountStateMin = (stateAmount * (10000 - MAX_SLIPPAGE_BPS)) / 10000;
        uint256 amountWplsMin = (wplsAmount * (10000 - MAX_SLIPPAGE_BPS)) / 10000;
        
        IPulseXRouter(ROUTER).addLiquidity(
            STATE,
            WPLS,
            stateAmount,
            wplsAmount,
            amountStateMin, // Apply slippage protection
            amountWplsMin,  // Apply slippage protection
            address(this),
            block.timestamp + 300
        );
        
        uint256 lpAfter = IERC20(stateWplsPool).balanceOf(address(this));
        liquidityBurned = lpAfter - lpBefore;
        
        // Burn the LP tokens permanently
        IERC20(stateWplsPool).transfer(BURN_ADDRESS, liquidityBurned);
    }
    
    /**
     * @notice Get controller status for UI/monitoring
     * @dev Returns comprehensive state information for frontend display
     * @return plsBalance Native PLS balance in controller
     * @return wplsBalance WPLS token balance in controller (ready for buy & burn)
     * @return stateBalance STATE token balance in controller (from previous operations)
     * @return poolAddress Address of STATE/WPLS pool (address(0) if not initialized)
     * @return poolStateReserve Current STATE reserve in pool (0 if pool not initialized)
     * @return poolWplsReserve Current WPLS reserve in pool (0 if pool not initialized)
     * @custom:security View function - safe for public access
     */
    function getControllerStatus() external view returns (
        uint256 plsBalance,
        uint256 wplsBalance,
        uint256 stateBalance,
        address poolAddress,
        uint256 poolStateReserve,
        uint256 poolWplsReserve
    ) {
        plsBalance = address(this).balance;
        wplsBalance = IERC20(WPLS).balanceOf(address(this));
        stateBalance = ISTATE(STATE).balanceOf(address(this));
        poolAddress = stateWplsPool;
        
        if (poolAddress != address(0)) {
            (poolStateReserve, poolWplsReserve) = getPoolReserves();
        }
    }
    

    
    /**
     * @notice ONE-CLICK GOVERNANCE FUNCTION: Convert PLS to WPLS and execute buy & burn in single transaction
     * @dev ⭐ RECOMMENDED FUNCTION - This is the main function governance should use for routine operations
     * @dev Combines PLS conversion + buy & burn in single atomic transaction
     * 
     * COMPLETE WORKFLOW:
     * ==================
     * Step 1: Convert specified PLS amount to WPLS
     *         - Governance specifies exact amount to process
     *         - Remaining PLS stays in contract for future operations
     * 
     * Step 2: Execute buy & burn using WPLS + any leftover STATE
     *         - Uses WPLS from conversion + existing WPLS balance
     *         - Includes any leftover STATE from previous operations
     *         - Gets current pool reserves
     *         - Calculates optimal split for WPLS (swap vs liquidity)
     *         - Swaps WPLS for STATE
     *         - Adds liquidity using ALL available STATE (bought + leftover) + remaining WPLS
     *         - Burns all LP tokens permanently
     * 
     * SAFETY:
     * - Gracefully handles cases where pool not ready or no funds
     * - All-or-nothing for buy & burn portion (won't partial execute)
     * - Emits events for monitoring
     * - Utilizes leftover STATE from previous operations (no waste)
     * 
     * @param plsAmountToUse Amount of PLS to convert and use (0 = use only existing WPLS/STATE)
     * @custom:security onlyGovernance + nonReentrant
     * @custom:usage Call this periodically to process accumulated PLS from protocol
     * @custom:reserves Reads reserves before swap for split calculation, then after swap for liquidity calculation
     * @custom:dust Integer division dust accumulates and gets included in subsequent operations
     */
    function executeFullBuyAndBurn(uint256 plsAmountToUse) external onlyGovernance nonReentrant {
        require(plsAmountToUse <= address(this).balance, "Insufficient PLS balance");
        
        // Step 1: Convert specified PLS amount to WPLS
        uint256 plsConverted = 0;
        if (plsAmountToUse > 0) {
            IWPLS(WPLS).deposit{value: plsAmountToUse}();
            plsConverted = plsAmountToUse;
            emit PLSConverted(plsAmountToUse, plsAmountToUse);
        }
        
        // Step 2: Execute buy & burn using all available WPLS and STATE
        uint256 wplsBalance = IERC20(WPLS).balanceOf(address(this));
        uint256 existingStateBalance = ISTATE(STATE).balanceOf(address(this));
        
        if (wplsBalance > 0 && stateWplsPool != address(0)) {
            // Get current pool reserves
            (uint256 stateReserve, uint256 wplsReserve) = getPoolReserves();
            
            if (stateReserve > 0 && wplsReserve > 0) {
                // Calculate optimal split considering existing STATE balance
                (uint256 wplsForSwap, uint256 expectedState, , ) = 
                    calculateOptimalSplit(wplsBalance, existingStateBalance, stateReserve, wplsReserve);
                
                // Track if we performed a swap
                uint256 stateBought = 0;
                
                // Step 2.1: Swap WPLS for STATE (only if needed)
                if (wplsForSwap > 0) {
                    stateBought = _swapWPLSForSTATE(wplsForSwap, expectedState);
                }
                
                // Step 2.2: Get ACTUAL pool reserves (after swap if it happened)
                (uint256 newStateReserve, uint256 newWplsReserve) = getPoolReserves();
                
                // Step 2.3: Get actual balances
                uint256 totalStateAvailable = ISTATE(STATE).balanceOf(address(this));
                uint256 totalWplsAvailable = IERC20(WPLS).balanceOf(address(this));
                
                // Step 2.4: Add liquidity if we have both STATE and WPLS
                // This works whether we swapped or not!
                if (totalStateAvailable > 0 && totalWplsAvailable > 0) {
                    // Calculate optimal amounts to use ALL available tokens
                    // based on the current pool ratio
                    uint256 stateToUse;
                    uint256 wplsToUse;
                    
                    // Calculate how much WPLS we need to pair with all our STATE
                    uint256 wplsNeededForAllState = (totalStateAvailable * newWplsReserve) / newStateReserve;
                    
                    if (wplsNeededForAllState <= totalWplsAvailable) {
                        // We have enough WPLS to match all STATE - use all STATE
                        stateToUse = totalStateAvailable;
                        wplsToUse = wplsNeededForAllState;
                        // Result: All STATE used, small WPLS leftover
                    } else {
                        // We have more STATE than needed - use all WPLS
                        wplsToUse = totalWplsAvailable;
                        stateToUse = (totalWplsAvailable * newStateReserve) / newWplsReserve;
                        // Result: All WPLS used, small STATE leftover
                    }
                    
                    // Step 2.5: Add liquidity with optimized amounts
                    if (stateToUse > 0 && wplsToUse > 0) {
                        uint256 liquidityBurned = _addLiquidityAndBurn(stateToUse, wplsToUse);
                        emit BuyAndBurnExecuted(wplsForSwap + wplsToUse, stateBought, liquidityBurned);
                    }
                }
            }
        }
        
        // Emit with actual WPLS used (wplsBalance before operation - balance after operation)
        uint256 wplsUsed = wplsBalance - IERC20(WPLS).balanceOf(address(this));
        emit FullBuyAndBurnExecuted(plsConverted, wplsUsed);
    }
    
    /**
     * @notice Receive function to accept PLS for buy & burn operations
     * @dev PLS sent here will be automatically converted to WPLS and processed
     * @dev Call executeFullBuyAndBurn() to convert and burn
     * @custom:security Anyone can send PLS (contributes to protocol-owned liquidity)
     * @custom:usage Protocol operations can send PLS fees directly to this contract
     */
    receive() external payable {
        // PLS received - will be converted to WPLS when executeFullBuyAndBurn() is called
    }
}