// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {SwapLens} from "../src/SwapLens.sol";

contract Deploy07_SwapLens is Script {
    
    function run() external {
        console.log("=== DEPLOYING SWAP LENS CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying SwapLens...");
        SwapLens swapLens = new SwapLens();
        
        console.log("SUCCESS: SwapLens deployed at:", address(swapLens));
        console.log("NOTE: Ownership renounced in constructor - pure view-only contract");
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("SwapLens Address:", address(swapLens));
        console.log("");
        console.log("SwapLens is a pure view-only immutable contract for querying auction data");
        console.log("No configuration needed - ownership renounced at deployment");
        console.log("");
        console.log("=== ALL CONTRACTS DEPLOYED! ===");
        console.log("");
        console.log("FINAL STEP: Update VerifyAll.sh with all deployed addresses and run:");
        console.log("chmod +x scripts/VerifyAll.sh");
        console.log("./scripts/VerifyAll.sh");
        console.log("");
        console.log("This will verify all contracts on Sourcify.");
    }
}