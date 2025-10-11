// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {STATE_V3} from "../src/StateToken.sol";

contract Deploy02_STATE_V3 is Script {
    // Update this address after SWAP_V3 deployment
    address constant SWAP_V3_ADDRESS = 0xeA55dB9Ae0eAfD245720563583871CE9ED549772; // SWAP_V3 deployed address
    address constant GOV_ADDRESS = 0x9FA004E13e780EF5b50ca225ad5DCD4D0Fe9ed70;

    function run() external {
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        
        console.log("=== DEPLOYING STATE_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("Governance Address (5% recipient):", GOV_ADDRESS);
        console.log("SWAP_V3 Address (95% recipient):", SWAP_V3_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying STATE_V3...");
        STATE_V3 stateV3 = new STATE_V3("PulseState", "pSTATE", GOV_ADDRESS, SWAP_V3_ADDRESS);
        
        console.log("SUCCESS: STATE_V3 deployed at:", address(stateV3));
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("STATE_V3 Address:", address(stateV3));
        console.log("");
        console.log("Token Details:");
        console.log("- Name: PulseState");
        console.log("- Symbol: pSTATE");
        console.log("- Total Supply: 100 million tokens");
        console.log("- 5% (5M tokens) minted to governance");
        console.log("- 95% (95M tokens) minted to SWAP contract");
        console.log("");
        console.log("NEXT STEP: Deploy DAV_V3 using this address:");
        console.log("forge script temp_scripts/Deploy03_DAV_V3.s.sol:Deploy03_DAV_V3");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}