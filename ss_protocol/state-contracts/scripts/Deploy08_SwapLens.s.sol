// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {SwapLens} from "../src/SwapLens.sol";

contract Deploy08_SwapLens is Script {
    function run() external {
        console.log("=== DEPLOYING SWAP LENS CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("");
        console.log("NOTE: SwapLens has no constructor parameters");

        vm.startBroadcast();
        
        console.log("Deploying SwapLens...");
        SwapLens swapLens = new SwapLens();
        
        console.log("SUCCESS: SwapLens deployed at:", address(swapLens));
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("SwapLens Address:", address(swapLens));
        console.log("");
        console.log("SwapLens is a view-only contract for querying auction data");
        console.log("No configuration or ownership transfer needed");
        console.log("");
        console.log("NEXT STEP: Deploy AuctionMetrics:");
        console.log("forge script temp_scripts/Deploy09_AuctionMetrics.s.sol:Deploy09_AuctionMetrics");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}