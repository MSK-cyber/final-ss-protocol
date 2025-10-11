// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/BuyAndBurnController_V2.sol";

interface IPulseXFactoryOld {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IPulseXRouterOld {
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

/**
 * @title Fix Pool For DAV Script
 * @notice Creates STATE/WPLS pool in the factory that DAV contract expects
 * @dev DAV contract checks factory 0x1715a3E4A142d8b698131108995174F37aEBA10D
 */
contract FixPoolForDAV is Script {
    
    // DAV contract's expected factory (hardcoded in DAV)
    address constant OLD_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant OLD_ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9; // This router should work with old factory
    
    // Token addresses
    address constant STATE_V3 = 0x66c9F985E02b2570B410AB03A3123Bd0ae575C6b;
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant SWAP_V3 = 0x9566c3E64d14fd86de6451Fdb96b37129b65C9D4;
    
    // Pool amounts (smaller amounts for DAV factory)
    uint256 constant STATE_AMOUNT = 10_000 ether;  // 10k STATE tokens
    uint256 constant PLS_AMOUNT = 100 ether;       // 100 PLS
    
    function run() external {
        console.log("=== FIXING POOL FOR DAV CONTRACT ===");
        console.log("Creating pool in DAV's expected factory:", OLD_FACTORY);
        console.log("STATE:", STATE_V3);
        console.log("WPLS:", WPLS);
        
        vm.startBroadcast();
        
        // Check if pool already exists in old factory
        address existingPool = IPulseXFactoryOld(OLD_FACTORY).getPair(STATE_V3, WPLS);
        console.log("Existing pool in old factory:", existingPool);
        
        if (existingPool == address(0)) {
            console.log("Creating new pool in old factory...");
            
            // Step 1: Get STATE tokens from SWAP vault
            ISWAP_V3(SWAP_V3).setVaultAllowance(STATE_V3, address(this), STATE_AMOUNT);
            ISTATE_V3(STATE_V3).transferFrom(SWAP_V3, address(this), STATE_AMOUNT);
            
            // Step 2: Convert PLS to WPLS
            IWPLS(WPLS).deposit{value: PLS_AMOUNT}();
            
            // Step 3: Create pair in old factory
            address newPool = IPulseXFactoryOld(OLD_FACTORY).createPair(STATE_V3, WPLS);
            console.log("New pool created:", newPool);
            
            // Step 4: Add initial liquidity
            ISTATE_V3(STATE_V3).approve(OLD_ROUTER, STATE_AMOUNT);
            IERC20(WPLS).approve(OLD_ROUTER, PLS_AMOUNT);
            
            (uint256 amountState, uint256 amountWpls, uint256 liquidity) = IPulseXRouterOld(OLD_ROUTER).addLiquidity(
                STATE_V3,
                WPLS,
                STATE_AMOUNT,
                PLS_AMOUNT,
                (STATE_AMOUNT * 95) / 100, // 5% slippage
                (PLS_AMOUNT * 95) / 100,
                address(this), // We hold the LP tokens
                block.timestamp + 300
            );
            
            console.log("Liquidity added:");
            console.log("- STATE:", amountState / 1e18, "tokens");
            console.log("- WPLS:", amountWpls / 1e18, "tokens");
            console.log("- LP tokens:", liquidity);
            
            // Step 5: Burn LP tokens to dead address
            IERC20(newPool).transfer(0x000000000000000000000000000000000000dEaD, liquidity);
            console.log("LP tokens burned to dead address");
            
        } else {
            console.log("Pool already exists in old factory - no action needed");
        }
        
        vm.stopBroadcast();
        
        // Final verification
        address finalPool = IPulseXFactoryOld(OLD_FACTORY).getPair(STATE_V3, WPLS);
        console.log("Final pool address in old factory:", finalPool);
        console.log("DAV isPoolReady should now return true!");
    }
}

// Required interfaces
interface ISWAP_V3 {
    function setVaultAllowance(address token, address spender, uint256 amount) external;
}

interface ISTATE_V3 {
    function transferFrom(address from, address to, uint256 amount) external;
    function approve(address spender, uint256 amount) external returns (bool);
}

// IWPLS interface already imported from BuyAndBurnController_V2.sol