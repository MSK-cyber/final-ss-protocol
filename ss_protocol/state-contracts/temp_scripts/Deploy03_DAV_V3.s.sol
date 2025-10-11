// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {DAV_V3} from "../src/DavToken.sol";

contract Deploy03_DAV_V3 is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x9454Eb295d8E4d871d724013dffd2301C486FD07; // STATE_V3 deployed address
    address constant GOV_ADDRESS = 0x9FA004E13e780EF5b50ca225ad5DCD4D0Fe9ed70;
    address constant DEV_ADDRESS = 0x91Bd0000565f89DBf2D2D28c57db3E5c56873A77;

    function run() external {
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        
        console.log("=== DEPLOYING DAV_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("Liquidity Wallet:", DEV_ADDRESS);
        console.log("STATE Token Address:", STATE_V3_ADDRESS);
        console.log("Governance Address:", GOV_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying DAV_V3...");
        DAV_V3 davV3 = new DAV_V3(
            DEV_ADDRESS,        // _liquidityWallet
            STATE_V3_ADDRESS,   // _stateToken
            GOV_ADDRESS,        // _gov
            "PulseDAV",        // tokenName
            "pDAV"             // tokenSymbol
        );
        
        console.log("SUCCESS: DAV_V3 deployed at:", address(davV3));
        console.log("");
        
        // Transfer ownership to governance
        davV3.transferOwnership(GOV_ADDRESS);
        console.log("Ownership transferred to governance");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("DAV_V3 Address:", address(davV3));
        console.log("");
        console.log("Token Details:");
        console.log("- Name: PulseDAV");
        console.log("- Symbol: pDAV");
        console.log("- Initial governance mint: 2000 DAV tokens");
        console.log("- Liquidity wallet:", DEV_ADDRESS);
        console.log("- STATE token reference:", STATE_V3_ADDRESS);
        console.log("");
        console.log("NEXT STEP: Deploy LPHelper:");
        console.log("forge script temp_scripts/Deploy04_LPHelper.s.sol:Deploy04_LPHelper");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}