// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {AirdropDistributor} from "../src/AirdropDistributor.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";
import {DAV_V3} from "../src/DavToken.sol";

contract Deploy07_AirdropDistributor is Script {
    // Update these addresses after previous deployments
    address constant SWAP_V3_ADDRESS = 0x1062D1bBD322781Be2a701698e8DD62E4D3aBCd4; // SWAP_V3 from Deploy01
    address constant DAV_V3_ADDRESS = 0x77A646A30295bBfC50c2D32cc0E26840935d30B7; // DAV_V3 from Deploy05
    address constant STATE_V3_ADDRESS = 0x294a2db4E0c321AF7c2223e9ce19c0127F1424F2; // STATE_V3 from Deploy02
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        require(DAV_V3_ADDRESS != address(0), "Must update DAV_V3_ADDRESS first");
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        
        console.log("=== DEPLOYING AIRDROP DISTRIBUTOR CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("SWAP_V3 Address:", SWAP_V3_ADDRESS);
        console.log("DAV_V3 Address:", DAV_V3_ADDRESS);
        console.log("STATE_V3 Address:", STATE_V3_ADDRESS);
        console.log("Governance Address:", GOV_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying AirdropDistributor...");
        AirdropDistributor airdropDistributor = new AirdropDistributor(
            SWAP_V3(payable(SWAP_V3_ADDRESS)),     // _swap
            DAV_V3(payable(DAV_V3_ADDRESS)),       // _dav
            STATE_V3_ADDRESS,                      // _stateToken
            GOV_ADDRESS                            // _owner
        );
        
        console.log("SUCCESS: AirdropDistributor deployed at:", address(airdropDistributor));
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("AirdropDistributor Address:", address(airdropDistributor));
        console.log("");
        console.log("Configuration:");
        console.log("- SWAP Contract:", SWAP_V3_ADDRESS);
        console.log("- DAV Token:", DAV_V3_ADDRESS);
        console.log("- STATE Token:", STATE_V3_ADDRESS);
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