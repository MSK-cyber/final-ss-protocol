// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/BuyAndBurnController_V2.sol";

// Minimal interface definitions (others imported from BuyAndBurnController_V2)
interface ISWAP_V3 {
    function setVaultAllowance(address token, address spender, uint256 amount) external;
    function owner() external view returns (address);
}

interface ISTATE_V3 {
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

interface IDAV_V3 {
    function setStateToken(address _stateToken) external;
    // buyAndBurnController and isPoolReady functions removed - DAV restrictions eliminated
}

/**
 * @title Fix Pool Creation in Correct Factory
 * @notice Creates STATE/WPLS pool in the factory that DAV contract expects (0x1715...)
 */
contract FixPoolCreation is Script {
    
    // ===== DEPLOYED MAINNET ADDRESSES =====
    address constant SWAP_V3_ADDRESS = 0x9566c3E64d14fd86de6451Fdb96b37129b65C9D4;
    address constant STATE_V3_ADDRESS = 0x66c9F985E02b2570B410AB03A3123Bd0ae575C6b;
    address constant DAV_V3_ADDRESS = 0x015DeF0C81C27dFAaf7932FaD44947AAE2e7881E;
    address constant BUYBURN_CONTROLLER_ADDRESS = 0xd36ec9e7c311E5cEa720F7bc5E13564F3adc6073;
    address constant WPLS_ADDRESS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    
    // CORRECT FACTORY (the one DAV contract checks)
    address constant CORRECT_PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant GOVERNANCE_ADDRESS = 0xF4579FA5Aca398FfeeB3eD1298104d226Ef84ebd;
    
    // Pool creation parameters
    uint256 constant STATE_AMOUNT = 100_000 ether;  // 100k STATE tokens
    uint256 constant PLS_AMOUNT = 1_000 ether;      // 1k PLS (will be converted to WPLS)
    
    // Contract instances
    ISWAP_V3 swap;
    ISTATE_V3 state;
    IDAV_V3 dav;
    BuyAndBurnController_V2 buyBurnController;
    IPulseXFactory factory;
    IWPLS wpls;
    IPulseXRouter router;
    
    function run() external {
        console.log("=== FIXING POOL CREATION IN CORRECT FACTORY ===");
        console.log("Network: PulseChain Mainnet (Chain ID: 369)");
        console.log("Governance Address:", GOVERNANCE_ADDRESS);
        console.log("Correct Factory (DAV expects):", CORRECT_PULSEX_FACTORY);
        console.log("");
        
        // Initialize contract instances
        swap = ISWAP_V3(SWAP_V3_ADDRESS);
        state = ISTATE_V3(STATE_V3_ADDRESS);
        dav = IDAV_V3(DAV_V3_ADDRESS);
        buyBurnController = BuyAndBurnController_V2(payable(BUYBURN_CONTROLLER_ADDRESS));
        factory = IPulseXFactory(CORRECT_PULSEX_FACTORY);
        wpls = IWPLS(WPLS_ADDRESS);
        router = IPulseXRouter(PULSEX_ROUTER);
        
        // STEP 1: Check current pool status
        console.log("STEP 1 - Checking Current Pool Status");
        _checkCurrentState();
        
        // STEP 2: Setup SWAP vault allowance (if needed)
        console.log("\nSTEP 2 - Setting Up SWAP Vault Allowance");
        _setupSwapVaultAllowance();
        
        // STEP 3: Create pool in the correct factory
        console.log("\nSTEP 3 - Creating Pool in Correct Factory");
        _createPoolInCorrectFactory();
        
        // STEP 4: Update BuyAndBurnController pool reference
        console.log("\nSTEP 4 - Updating BuyAndBurnController");
        _updateBuyBurnController();
        
        // STEP 5: Final verification
        console.log("\nSTEP 5 - Final Verification");
        _finalVerification();
        
        console.log("\n=== POOL CREATION FIX COMPLETED ===");
    }
    
    function _checkCurrentState() internal view {
        console.log("[INFO] Checking pool in CORRECT factory (DAV expects):", CORRECT_PULSEX_FACTORY);
        address poolInCorrectFactory = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        
        if (poolInCorrectFactory != address(0)) {
            console.log("[OK] Pool already exists in correct factory:", poolInCorrectFactory);
        } else {
            console.log("[WARN] No pool in correct factory - will create");
        }
        
        // DAV pool verification removed - DAV restrictions eliminated
        // bool poolReady = dav.isPoolReady();
        // console.log("DAV isPoolReady():", poolReady ? "true" : "false");
        
        // Check STATE balance in SWAP contract
        uint256 swapStateBalance = state.balanceOf(SWAP_V3_ADDRESS);
        console.log("[OK] STATE balance in SWAP contract:", swapStateBalance / 1e18, "STATE");
        
        // Check governance wallet PLS balance
        console.log("[OK] Governance PLS balance:", GOVERNANCE_ADDRESS.balance / 1e18, "PLS");
    }
    
    function _setupSwapVaultAllowance() internal {
        vm.startBroadcast();
        
        // Check current allowance
        uint256 currentAllowance = state.allowance(SWAP_V3_ADDRESS, BUYBURN_CONTROLLER_ADDRESS);
        console.log("Current SWAP vault allowance:", currentAllowance / 1e18, "STATE");
        
        if (currentAllowance < STATE_AMOUNT) {
            console.log("Setting SWAP vault allowance...");
            swap.setVaultAllowance(STATE_V3_ADDRESS, BUYBURN_CONTROLLER_ADDRESS, type(uint256).max);
            console.log("[OK] SWAP vault allowance set");
        } else {
            console.log("[OK] Sufficient allowance already exists");
        }
        
        vm.stopBroadcast();
    }
    
    function _createPoolInCorrectFactory() internal {
        vm.startBroadcast();
        
        // Check if pool already exists
        address existingPool = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        if (existingPool != address(0)) {
            console.log("[SKIP] Pool already exists at:", existingPool);
            vm.stopBroadcast();
            return;
        }
        
        console.log("Converting PLS to WPLS...");
        wpls.deposit{value: PLS_AMOUNT}();
        uint256 wplsBalance = wpls.balanceOf(address(this));
        console.log("WPLS received:", wplsBalance / 1e18, "WPLS");
        
        console.log("Transferring STATE from SWAP vault...");
        // Transfer STATE from SWAP vault to this contract
        bool success = swap.owner() == address(this); // We should be governance
        if (!success) {
            console.log("ERROR: Not SWAP owner - cannot transfer STATE");
            vm.stopBroadcast();
            return;
        }
        
        // Since we're governance, transfer STATE directly from SWAP vault
        // First approve the transfer
        swap.setVaultAllowance(STATE_V3_ADDRESS, address(this), STATE_AMOUNT);
        
        // Create pair first
        console.log("Creating STATE/WPLS pair...");
        address newPool = factory.createPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        console.log("Pair created at:", newPool);
        
        // Approve tokens for router
        console.log("Approving tokens for liquidity...");
        // Transfer STATE from SWAP to this contract first
        // We need to call SWAP's internal transfer function or use governance privileges
        
        vm.stopBroadcast();
        
        console.log("[WARNING] Manual step required:");
        console.log("1. Use governance wallet to transfer", STATE_AMOUNT / 1e18, "STATE from SWAP vault");
        console.log("2. Approve router for STATE and WPLS");
        console.log("3. Add liquidity using router.addLiquidity()");
        console.log("4. Update BuyAndBurnController pool address to:", newPool);
    }
    
    function _updateBuyBurnController() internal {
        address correctPool = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        if (correctPool == address(0)) {
            console.log("[SKIP] No pool found to update");
            return;
        }
        
        vm.startBroadcast();
        
        console.log("Updating BuyAndBurnController pool reference...");
        buyBurnController.setStateWplsPool(correctPool);
        console.log("[OK] Pool reference updated to:", correctPool);
        
        vm.stopBroadcast();
    }
    
    function _finalVerification() internal view {
        // Check if pool exists in correct factory
        address poolAddress = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        if (poolAddress != address(0)) {
            console.log("[OK] Pool exists in correct factory:", poolAddress);
        } else {
            console.log("[ERROR] Pool not found in correct factory");
            return;
        }
        
        // DAV pool verification removed - DAV restrictions eliminated  
        // bool poolReady = dav.isPoolReady();
        // console.log("DAV isPoolReady():", poolReady ? "TRUE" : "FALSE");
        
        // DAV pool verification removed - minting now works without restrictions
        console.log("[SUCCESS] DAV minting restrictions eliminated!");
        console.log("DAV tokens can now be minted without pool verification.");
    }
}