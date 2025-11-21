// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";

contract Deploy01_SWAP_V3 is Script {
    // PulseChain Mainnet addresses
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        console.log("=== DEPLOYING SWAP_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("Governance Address:", GOV_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying SWAP_V3...");
        SWAP_V3 swapV3 = new SWAP_V3(GOV_ADDRESS);
        
        console.log("SUCCESS: SWAP_V3 deployed at:", address(swapV3));
        console.log("NOTE: Ownership renounced in constructor - governance address has direct admin rights");
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("SWAP_V3 Address:", address(swapV3));
        console.log("");
        console.log("NEXT STEP: Deploy STATE_V3 using this address:");
        console.log("forge script scripts/Deploy02_STATE_V3.s.sol:Deploy02_STATE_V3");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}