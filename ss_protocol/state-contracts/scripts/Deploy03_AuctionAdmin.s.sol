// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {AuctionAdmin} from "../src/AuctionAdmin.sol";

contract Deploy03_AuctionAdmin is Script {
    // Update this address after SWAP_V3 deployment
    address constant SWAP_V3_ADDRESS = 0x1062D1bBD322781Be2a701698e8DD62E4D3aBCd4; // SWAP_V3 from Deploy01
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        
        console.log("=== DEPLOYING AUCTION ADMIN CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("SWAP_V3 Address:", SWAP_V3_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying AuctionAdmin...");
        AuctionAdmin auctionAdmin = new AuctionAdmin(SWAP_V3_ADDRESS);
        
        console.log("SUCCESS: AuctionAdmin deployed at:", address(auctionAdmin));
        console.log("");
        
        // Transfer ownership to governance
        auctionAdmin.transferOwnership(GOV_ADDRESS);
        console.log("Ownership transferred to governance:", GOV_ADDRESS);
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("AuctionAdmin Address:", address(auctionAdmin));
        console.log("");
        console.log("Configuration:");
        console.log("- Main Contract (SWAP):", SWAP_V3_ADDRESS);
        console.log("- Owner: deployer (", msg.sender, ")");
        console.log("");
        console.log("NEXT STEP: Deploy BuyAndBurnController_V2:");
        console.log("forge script temp_scripts/Deploy04_BuyAndBurnController.s.sol:Deploy04_BuyAndBurnController");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}