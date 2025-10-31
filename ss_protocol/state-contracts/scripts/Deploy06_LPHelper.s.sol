// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {LPHelper} from "../src/LPHelper.sol";

contract Deploy06_LPHelper is Script {
    // PulseChain Mainnet DEX addresses
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        console.log("=== DEPLOYING LPHELPER CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("PulseX Router:", PULSEX_ROUTER);
        console.log("PulseX Factory:", PULSEX_FACTORY);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying LPHelper...");
        LPHelper lpHelper = new LPHelper(PULSEX_ROUTER, PULSEX_FACTORY);
        
        console.log("SUCCESS: LPHelper deployed at:", address(lpHelper));
        console.log("");
        
        // Transfer ownership to governance
        lpHelper.transferOwnership(GOV_ADDRESS);
        console.log("Ownership transferred to governance:", GOV_ADDRESS);
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("LPHelper Address:", address(lpHelper));
        console.log("");
        console.log("Configuration:");
        console.log("- PulseX Router:", PULSEX_ROUTER);
        console.log("- PulseX Factory:", PULSEX_FACTORY);
        console.log("- Owner: deployer (", msg.sender, ")");
        console.log("");
        console.log("NEXT STEP: Deploy AirdropDistributor:");
        console.log("forge script temp_scripts/Deploy07_AirdropDistributor.s.sol:Deploy07_AirdropDistributor");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}