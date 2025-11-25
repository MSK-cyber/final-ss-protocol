// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {STATE_V3} from "../src/StateToken.sol";

contract Deploy02_STATE_V3 is Script {
    // Update this address after SWAP_V3 deployment
    address constant SWAP_V3_ADDRESS = 0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A; // SWAP_V3 from Deploy01
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        
        console.log("=== DEPLOYING STATE_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("SWAP_V3 Address (100% recipient):", SWAP_V3_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying STATE_V3...");
        // Mint 100% of supply to SWAP contract in single transaction
        STATE_V3 stateV3 = new STATE_V3("PulseSTATE1", "pSTATE1", SWAP_V3_ADDRESS);
        
        console.log("SUCCESS: STATE_V3 deployed at:", address(stateV3));
        console.log("NOTE: Ownership automatically renounced in constructor");
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("STATE_V3 Address:", address(stateV3));
        console.log("");
        console.log("Token Details:");
        console.log("- Name: PulseSTATE1");
        console.log("- Symbol: pSTATE1");
        console.log("- Total Supply: 100 trillion tokens");
        console.log("- 100% (100 trillion tokens) minted to SWAP contract");
        console.log("");
        console.log("NEXT STEP: Deploy AuctionAdmin using this address:");
        console.log("forge script scripts/Deploy03_AuctionAdmin.s.sol:Deploy03_AuctionAdmin");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}