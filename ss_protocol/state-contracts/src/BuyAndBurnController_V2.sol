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

interface ISWAP {
    function setVaultAllowance(address token, address spender, uint256 amount) external;
}



/**
 * @title BuyAndBurnController_V2
 * @notice Enhanced Buy & Burn Controller with optimal ratio-aware splitting
 * @dev Handles:
 *      1. Pool creation by governance
 *      2. PLS to WPLS conversion
 *      3. Dynamic ratio-aware buy & burn with 100% fund utilization
 */
contract BuyAndBurnController_V2 is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    
    // Core addresses
    address public immutable STATE;
    address public immutable WPLS;
    address public immutable ROUTER;
    address public immutable FACTORY;
    address public immutable SWAP_VAULT;
    address public immutable SWAP;
    
    // Pool management
    address public stateWplsPool;
    
    // Constants
    address private constant BURN_ADDRESS = 0x000000000000000000000000000000000000dEaD;
    uint256 private constant MAX_SLIPPAGE_BPS = 500; // 5% max slippage
    
    // Events
    event PoolCreated(address indexed pool, uint256 stateAmount, uint256 wplsAmount, uint256 liquidity);
    event BuyAndBurnExecuted(uint256 wplsUsed, uint256 stateBought, uint256 liquidityBurned);
    event PLSConverted(uint256 plsAmount, uint256 wplsAmount);
    event FullBuyAndBurnExecuted(uint256 plsConverted, uint256 wplsProcessed);
    event InitialPoolCreated(address indexed pool, uint256 stateAmount, uint256 totalWpls, uint256 plsSent);
    event SwapVaultAllowanceSet(uint256 amount);
    event LiquidityAdded(address indexed pool, uint256 stateAmount, uint256 wplsAmount, uint256 liquidityBurned);
    
    constructor(
        address _state,
        address _wpls,
        address _router,
        address _factory,
        address _swapVault,
        address _swap
    ) Ownable(msg.sender) {
        require(_state != address(0), "Invalid STATE");
        require(_wpls != address(0), "Invalid WPLS");
        require(_router != address(0), "Invalid router");
        require(_factory != address(0), "Invalid factory");
        require(_swapVault != address(0), "Invalid swap vault");
        require(_swap != address(0), "Invalid swap");
        
        STATE = _state;
        WPLS = _wpls;
        ROUTER = _router;
        FACTORY = _factory;
        SWAP_VAULT = _swapVault;
        SWAP = _swap;
    }
    
    /**
     * @notice Set the STATE/WPLS pool address (governance only)
     * @param poolAddress Address of the STATE/WPLS pool
     */
    function setStateWplsPool(address poolAddress) external onlyOwner {
        require(poolAddress != address(0), "Invalid pool address");
        stateWplsPool = poolAddress;
        emit PoolCreated(poolAddress, 0, 0, 0); // Emit with zero amounts since pool already exists
    }
    
    /**
     * @notice Setup SWAP vault allowance for this contract (governance only)
     * @dev Must be called by governance before using createPoolOneClick
     * @param amount Amount of STATE tokens to allow this contract to access from SWAP vault
     */
    function setupSwapVaultAllowance(uint256 amount) external onlyOwner {
        ISWAP(SWAP).setVaultAllowance(STATE, address(this), amount);
        emit SwapVaultAllowanceSet(amount);
    }
    
    /**
     * @notice ONE-CLICK Pool Creation: Create STATE/WPLS pool with tokens from SWAP vault
     * @dev Automatically sources STATE tokens from SWAP vault, only requires PLS/WPLS from governance
     * @param stateAmount STATE tokens for initial liquidity (sourced from SWAP vault)
     * @param wplsAmount WPLS tokens for initial liquidity (or send PLS as msg.value)
     */
    function createPoolOneClick(uint256 stateAmount, uint256 wplsAmount) external payable onlyOwner nonReentrant {
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
        
        // Transfer STATE tokens from SWAP vault (allowance must be pre-set by governance)
        ISTATE(STATE).transferFrom(SWAP, address(this), stateAmount);
        
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
     * @dev Allows governance to manually add liquidity to the buy & burn pool
     *      STATE tokens sourced from SWAP vault, PLS/WPLS from governance wallet
     *      LP tokens are automatically burned
     * @param stateAmount Amount of STATE tokens to add (from SWAP vault)
     * @param wplsAmount Amount of WPLS tokens to add (optional, from governance wallet)
     * @return liquidity Amount of LP tokens that were burned
     */
    function addMoreLiquidity(
        uint256 stateAmount,
        uint256 wplsAmount
    ) external payable onlyOwner nonReentrant returns (uint256 liquidity) {
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
        
        // Transfer STATE tokens from SWAP vault (allowance must be pre-set by governance)
        ISTATE(STATE).transferFrom(SWAP_VAULT, address(this), stateAmount);
        
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
     */
    function convertPLSToWPLS() external onlyOwner nonReentrant {
        uint256 plsBalance = address(this).balance;
        require(plsBalance > 0, "No PLS to convert");
        
        IWPLS(WPLS).deposit{value: plsBalance}();
        
        emit PLSConverted(plsBalance, plsBalance);
    }
    
    /**
     * @notice Execute optimal buy & burn with dynamic ratio calculation
     */
    function executeBuyAndBurn() external onlyOwner nonReentrant {
        require(stateWplsPool != address(0), "Pool not initialized");
        
        uint256 wplsBalance = IERC20(WPLS).balanceOf(address(this));
        require(wplsBalance > 0, "No WPLS available");
        
        // Get current pool reserves
        (uint256 stateReserve, uint256 wplsReserve) = getPoolReserves();
        require(stateReserve > 0 && wplsReserve > 0, "Invalid pool state");
        
        // Calculate optimal split considering ratio changes
        (uint256 wplsForSwap, uint256 expectedState, uint256 stateForLP, uint256 wplsForLP) = 
            calculateOptimalSplit(wplsBalance, stateReserve, wplsReserve);
        
        require(wplsForSwap > 0, "No WPLS for swap");
        require(wplsForLP > 0, "No WPLS for LP");
        
        // Step 1: Swap WPLS for STATE
        uint256 stateBought = _swapWPLSForSTATE(wplsForSwap, expectedState);
        require(stateBought >= stateForLP, "Insufficient STATE bought");
        
        // Step 2: Add liquidity and burn
        uint256 liquidityBurned = _addLiquidityAndBurn(stateForLP, wplsForLP);
        
        emit BuyAndBurnExecuted(wplsForSwap + wplsForLP, stateBought, liquidityBurned);
    }
    
    /**
     * @notice Calculate optimal WPLS split considering pool ratio changes
     */
    function calculateOptimalSplit(
        uint256 totalWPLS,
        uint256 stateReserve,
        uint256 wplsReserve
    ) public pure returns (
        uint256 wplsForSwap,
        uint256 expectedState,
        uint256 stateForLP,
        uint256 wplsForLP
    ) {
        uint256 k = stateReserve * wplsReserve;
        
        // Start with 70% for swap, 30% for LP (good starting point)
        wplsForSwap = (totalWPLS * 70) / 100;
        
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
            
            if (expectedState >= stateForLP) {
                // Perfect! We have enough STATE
                break;
            } else {
                // Need to reduce swap amount, increase LP amount
                uint256 deficit = stateForLP - expectedState;
                uint256 adjustment = (deficit * wplsReserve) / stateReserve;
                
                if (wplsForSwap > adjustment) {
                    wplsForSwap -= adjustment;
                } else {
                    wplsForSwap = wplsForSwap / 2; // Halve if adjustment too large
                }
            }
        }
        
        return (wplsForSwap, expectedState, stateForLP, wplsForLP);
    }
    
    /**
     * @notice Get current pool reserves (STATE, WPLS)
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
     * @notice Get controller status for UI
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
     * @dev This is the main function governance should use for routine operations
     */
    function executeFullBuyAndBurn() external onlyOwner nonReentrant {
        // Step 1: Convert any collected PLS to WPLS first
        uint256 plsBalance = address(this).balance;
        if (plsBalance > 0) {
            IWPLS(WPLS).deposit{value: plsBalance}();
            emit PLSConverted(plsBalance, plsBalance);
        }
        
        // Step 2: Execute buy & burn if we have WPLS
        uint256 wplsBalance = IERC20(WPLS).balanceOf(address(this));
        if (wplsBalance > 0 && stateWplsPool != address(0)) {
            // Get current pool reserves
            (uint256 stateReserve, uint256 wplsReserve) = getPoolReserves();
            
            if (stateReserve > 0 && wplsReserve > 0) {
                // Calculate optimal split considering ratio changes
                (uint256 wplsForSwap, uint256 expectedState, uint256 stateForLP, uint256 wplsForLP) = 
                    calculateOptimalSplit(wplsBalance, stateReserve, wplsReserve);
                
                if (wplsForSwap > 0 && wplsForLP > 0) {
                    // Step 2.1: Swap WPLS for STATE
                    uint256 stateBought = _swapWPLSForSTATE(wplsForSwap, expectedState);
                    
                    if (stateBought >= stateForLP) {
                        // Step 2.2: Add liquidity and burn
                        uint256 liquidityBurned = _addLiquidityAndBurn(stateForLP, wplsForLP);
                        emit BuyAndBurnExecuted(wplsForSwap + wplsForLP, stateBought, liquidityBurned);
                    }
                }
            }
        }
        
        emit FullBuyAndBurnExecuted(plsBalance, wplsBalance);
    }

    /**
     * @notice Emergency function to rescue tokens (owner only)
     */
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        require(token != address(0), "Invalid token");
        IERC20(token).safeTransfer(owner(), amount);
    }
    
    /**
     * @notice Emergency function to rescue native PLS (owner only)
     */
    function rescuePLS(uint256 amount) external onlyOwner {
        require(amount <= address(this).balance, "Insufficient balance");
        payable(owner()).transfer(amount);
    }
    
    // Receive PLS for buy & burn operations
    receive() external payable {
        // PLS received - will be converted to WPLS when needed
    }
}