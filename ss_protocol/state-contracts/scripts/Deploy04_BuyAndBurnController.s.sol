// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";

contract Deploy04_BuyAndBurnController is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x4e90670b4cDE8FF7cdDEeAf99AEFD68a114d9C01; // STATE_V3 from Deploy02
    address constant SWAP_V3_ADDRESS = 0x8172716bD7117461D4b20bD0434358F74244d4ec; // SWAP_V3 from Deploy01
    address constant AUCTION_ADMIN_ADDRESS = 0xEab50ADaB223f96f139B75430dF7274aE66560Db; // AuctionAdmin from Deploy03

    // PulseChain Mainnet addresses
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant GOV_ADDRESS = 0x0f7F24c7F22e2Ca7052f051A295e1a5D3369cAcE;

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