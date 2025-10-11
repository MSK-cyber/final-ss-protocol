// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";

contract Deploy07_BuyAndBurnController is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x9454Eb295d8E4d871d724013dffd2301C486FD07; // STATE_V3 deployed
    address constant SWAP_V3_ADDRESS = 0xeA55dB9Ae0eAfD245720563583871CE9ED549772; // SWAP_V3 deployed
    
    // PulseChain Mainnet addresses
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant GOV_ADDRESS = 0x9FA004E13e780EF5b50ca225ad5DCD4D0Fe9ed70;

    function run() external {
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        
        console.log("=== DEPLOYING BUY AND BURN CONTROLLER CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("STATE Token:", STATE_V3_ADDRESS);
        console.log("WPLS Token:", WPLS);
        console.log("PulseX Router:", PULSEX_ROUTER);
        console.log("PulseX Factory:", PULSEX_FACTORY);
        console.log("SWAP Vault:", SWAP_V3_ADDRESS);
        console.log("SWAP Contract:", SWAP_V3_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying BuyAndBurnController_V2...");
        BuyAndBurnController_V2 buyAndBurnController = new BuyAndBurnController_V2(
            STATE_V3_ADDRESS,   // _state
            WPLS,              // _wpls  
            PULSEX_ROUTER,     // _router
            PULSEX_FACTORY,    // _factory
            SWAP_V3_ADDRESS,   // _swapVault
            SWAP_V3_ADDRESS    // _swap
        );
        
        console.log("SUCCESS: BuyAndBurnController_V2 deployed at:", address(buyAndBurnController));
        console.log("");
        
        // Transfer ownership to governance
        buyAndBurnController.transferOwnership(GOV_ADDRESS);
        console.log("Ownership transferred to governance");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("BuyAndBurnController_V2 Address:", address(buyAndBurnController));
        console.log("");
        console.log("Configuration:");
        console.log("- STATE Token:", STATE_V3_ADDRESS);
        console.log("- WPLS Token:", WPLS);
        console.log("- PulseX Router:", PULSEX_ROUTER);
        console.log("- PulseX Factory:", PULSEX_FACTORY);
        console.log("- SWAP Vault:", SWAP_V3_ADDRESS);
        console.log("- Owner:", GOV_ADDRESS);
        console.log("");
        console.log("NEXT STEP: Deploy SwapLens:");
        console.log("forge script temp_scripts/Deploy08_SwapLens.s.sol:Deploy08_SwapLens");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}