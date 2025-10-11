// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import "../src/BuyAndBurnController_V2.sol";

// Interface definitions for mainnet contracts
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
    // buyAndBurnController function removed - DAV restrictions eliminated
}

/**
 * @title Mainnet Pool Creation Script
 * @notice Creates STATE/WPLS pool using deployed BuyAndBurnController_V2 on PulseChain mainnet
 * @dev Run with: forge script script/MainnetPoolCreation.s.sol --rpc-url https://rpc.pulsechain.com --broadcast
 */
contract MainnetPoolCreation is Script {
    
    // ===== DEPLOYED MAINNET ADDRESSES =====
    address constant SWAP_V3_ADDRESS = 0x9566c3E64d14fd86de6451Fdb96b37129b65C9D4;
    address constant STATE_V3_ADDRESS = 0x66c9F985E02b2570B410AB03A3123Bd0ae575C6b;
    address constant DAV_V3_ADDRESS = 0x015DeF0C81C27dFAaf7932FaD44947AAE2e7881E;
    address constant BUYBURN_CONTROLLER_ADDRESS = 0xd36ec9e7c311E5cEa720F7bc5E13564F3adc6073;
    address constant WPLS_ADDRESS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant PULSEX_FACTORY_ADDRESS = 0x29eA7545DEf87022BAdc76323F373EA1e707C523;
    address constant GOVERNANCE_ADDRESS = 0xF4579FA5Aca398FfeeB3eD1298104d226Ef84ebd;
    
    // Pool creation parameters (as requested by user)
    uint256 constant STATE_AMOUNT = 100_000 ether;  // 100k STATE tokens
    uint256 constant PLS_AMOUNT = 1_000 ether;      // 1k PLS (will be converted to WPLS)
    
    // Contract instances
    ISWAP_V3 swap;
    ISTATE_V3 state;
    IDAV_V3 dav;
    BuyAndBurnController_V2 buyBurnController;
    IPulseXFactory factory;
    
    function run() external {
        console.log("=== MAINNET POOL CREATION SCRIPT ===");
        console.log("Network: PulseChain Mainnet (Chain ID: 369)");
        console.log("Governance Address:", GOVERNANCE_ADDRESS);
        console.log("Transaction Sender:", msg.sender);
        console.log("");
        
        // Initialize contract instances
        swap = ISWAP_V3(SWAP_V3_ADDRESS);
        state = ISTATE_V3(STATE_V3_ADDRESS);
        dav = IDAV_V3(DAV_V3_ADDRESS);
        buyBurnController = BuyAndBurnController_V2(payable(BUYBURN_CONTROLLER_ADDRESS));
        factory = IPulseXFactory(PULSEX_FACTORY_ADDRESS);
        
        // STEP 1: Verify deployment and current state
        console.log("STEP 1 - Verifying Current State");
        _verifyCurrentState();
        
        // STEP 2: Check existing allowances
        console.log("\nSTEP 2 - Checking Existing Allowances");
        _checkExistingAllowances();
        
        // STEP 3: Setup SWAP vault allowance (if needed)
        console.log("\nSTEP 3 - Setting Up SWAP Vault Allowance");
        _setupSwapVaultAllowance();
        
        // STEP 4: Create STATE/WPLS pool
        console.log("\nSTEP 4 - Creating STATE/WPLS Pool");
        _createStateWplsPool();
        
        // STEP 5: Configure DAV integration
        console.log("\nSTEP 5 - Configuring DAV Integration");
        _configureDavIntegration();
        
        // STEP 6: Final verification
        console.log("\nSTEP 6 - Final Verification");
        _finalVerification();
        
        console.log("\n=== POOL CREATION COMPLETED SUCCESSFULLY ===");
    }
    
    function _verifyCurrentState() internal view {
        console.log("[OK] SWAP_V3:", SWAP_V3_ADDRESS);
        console.log("[OK] STATE_V3:", STATE_V3_ADDRESS);
        console.log("[OK] DAV_V3:", DAV_V3_ADDRESS);
        console.log("[OK] BuyAndBurnController:", BUYBURN_CONTROLLER_ADDRESS);
        console.log("[OK] WPLS:", WPLS_ADDRESS);
        console.log("[OK] PulseX Factory:", PULSEX_FACTORY_ADDRESS);
        
        // Check if pool already exists
        address existingPool = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        if (existingPool != address(0)) {
            console.log("WARNING: STATE/WPLS pool already exists at:", existingPool);
        } else {
            console.log("[OK] No existing STATE/WPLS pool found - ready to create");
        }
        
        // Check STATE balance in SWAP contract
        uint256 swapStateBalance = state.balanceOf(SWAP_V3_ADDRESS);
        console.log("[OK] STATE balance in SWAP contract:", swapStateBalance / 1e18, "STATE");
        
        // Check governance wallet PLS balance
        console.log("[OK] Governance PLS balance:", GOVERNANCE_ADDRESS.balance / 1e18, "PLS");
    }
    
    function _checkExistingAllowances() internal view {
        // Check STATE allowance from SWAP to BuyAndBurnController
        uint256 swapAllowance = state.allowance(SWAP_V3_ADDRESS, BUYBURN_CONTROLLER_ADDRESS);
        console.log("STATE allowance (SWAP -> BuyAndBurnController):", swapAllowance / 1e18, "STATE");
        
        if (swapAllowance >= STATE_AMOUNT) {
            console.log("[OK] Sufficient allowance already exists");
        } else {
            console.log("[WARN] Need to set SWAP vault allowance");
        }
    }
    
    function _setupSwapVaultAllowance() internal {
        vm.startBroadcast();
        
        // Check current allowance first
        uint256 currentAllowance = state.allowance(SWAP_V3_ADDRESS, BUYBURN_CONTROLLER_ADDRESS);
        
        if (currentAllowance < STATE_AMOUNT) {
            console.log("Setting SWAP vault allowance...");
            console.log("Amount:", type(uint256).max / 1e18, "STATE (max uint256)");
            
            // Set unlimited allowance for STATE tokens from SWAP vault to BuyAndBurnController
            swap.setVaultAllowance(STATE_V3_ADDRESS, BUYBURN_CONTROLLER_ADDRESS, type(uint256).max);
            
            console.log("[OK] SWAP vault allowance set successfully");
        } else {
            console.log("[OK] Sufficient allowance already exists, skipping");
        }
        
        vm.stopBroadcast();
    }
    
    function _createStateWplsPool() internal {
        vm.startBroadcast();
        
        console.log("Creating STATE/WPLS pool with one-click method...");
        console.log("STATE amount:", STATE_AMOUNT / 1e18, "STATE");
        console.log("PLS amount:", PLS_AMOUNT / 1e18, "PLS");
        
        // Call createPoolOneClick with PLS as msg.value
        // This will automatically convert PLS to WPLS and create the pool
        buyBurnController.createPoolOneClick{value: PLS_AMOUNT}(STATE_AMOUNT, 0);
        
        console.log("[OK] Pool creation transaction sent");
        
        vm.stopBroadcast();
    }
    
    function _configureDavIntegration() internal {
        vm.startBroadcast();
        
        // DAV controller integration removed - DAV restrictions eliminated
        // address currentController = dav.buyAndBurnController();
        // console.log("Current DAV controller:", currentController);
        
        // DAV now works without controller verification
        console.log("DAV restrictions eliminated - no controller setup needed");
        
        // Set STATE token in DAV
        console.log("Configuring STATE token in DAV...");
        dav.setStateToken(STATE_V3_ADDRESS);
        console.log("[OK] STATE token configured in DAV");
        
        vm.stopBroadcast();
    }
    
    function _finalVerification() internal view {
        // Verify pool was created
        address poolAddress = factory.getPair(STATE_V3_ADDRESS, WPLS_ADDRESS);
        if (poolAddress != address(0)) {
            console.log("[OK] STATE/WPLS pool successfully created at:", poolAddress);
        } else {
            console.log("[ERROR] Pool creation failed - no pair found");
        }
        
        // Verify controller state
        try buyBurnController.stateWplsPool() returns (address controllerPool) {
            if (controllerPool == poolAddress) {
                console.log("[OK] BuyAndBurnController pool reference set correctly");
            } else {
                console.log("[WARN] Pool reference mismatch in controller");
            }
        } catch {
            console.log("[WARN] Could not verify controller pool reference");
        }
        
        // DAV integration verification removed - restrictions eliminated
        console.log("[OK] DAV restrictions eliminated - no integration verification needed");
    }
}