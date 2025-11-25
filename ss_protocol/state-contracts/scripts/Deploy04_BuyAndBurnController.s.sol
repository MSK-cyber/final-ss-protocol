// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";

contract Deploy04_BuyAndBurnController is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x834A4eE2849E25b94A4aB6bC19D3CD0542256244; // STATE_V3 from Deploy02
    address constant SWAP_V3_ADDRESS = 0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A; // SWAP_V3 from Deploy01
    address constant AUCTION_ADMIN_ADDRESS = 0xA001442C5147BBCbA73CafA86Ef90225086cF7e1; // AuctionAdmin from Deploy03

    // PulseChain Mainnet addresses
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        require(AUCTION_ADMIN_ADDRESS != address(0), "Must update AUCTION_ADMIN_ADDRESS first");
        
        console.log("=== DEPLOYING BUY AND BURN CONTROLLER CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("STATE Token:", STATE_V3_ADDRESS);
        console.log("WPLS Token:", WPLS);
        console.log("PulseX Router:", PULSEX_ROUTER);
        console.log("PulseX Factory:", PULSEX_FACTORY);
        console.log("SWAP_V3 Contract:", SWAP_V3_ADDRESS);
        console.log("AuctionAdmin Address:", AUCTION_ADMIN_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying BuyAndBurnController_V2...");
        BuyAndBurnController_V2 buyAndBurnController = new BuyAndBurnController_V2(
            STATE_V3_ADDRESS,       // _state
            WPLS,                  // _wpls  
            PULSEX_ROUTER,         // _router
            PULSEX_FACTORY,        // _factory
            SWAP_V3_ADDRESS,       // _swapV3
            AUCTION_ADMIN_ADDRESS, // _auctionAdmin
            GOV_ADDRESS            // _governance
        );
        
        console.log("SUCCESS: BuyAndBurnController_V2 deployed at:", address(buyAndBurnController));
        console.log("NOTE: Ownership renounced in constructor - governance address has direct admin rights");
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("BuyAndBurnController_V2 Address:", address(buyAndBurnController));
        console.log("");
        console.log("Configuration:");
        console.log("- STATE Token:", STATE_V3_ADDRESS);
        console.log("- WPLS Token:", WPLS);
        console.log("- PulseX Router:", PULSEX_ROUTER);
        console.log("- PulseX Factory:", PULSEX_FACTORY);
        console.log("- SWAP_V3 Contract:", SWAP_V3_ADDRESS);
        console.log("- Owner:", GOV_ADDRESS);
        console.log("");
        console.log("NEXT STEP: Deploy DAV_V3:");
        console.log("forge script scripts/Deploy05_DAV_V3.s.sol:Deploy05_DAV_V3");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}