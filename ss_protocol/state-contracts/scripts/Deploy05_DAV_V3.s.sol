// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {DAV_V3} from "../src/DavToken.sol";

contract Deploy05_DAV_V3 is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x294a2db4E0c321AF7c2223e9ce19c0127F1424F2; // STATE_V3 from Deploy02
    address constant AUCTION_ADMIN_ADDRESS = 0x1734433003a15eD69d16C5Db2DD8Cc8F8df05dC0; // AuctionAdmin from Deploy03
    address constant BUY_AND_BURN_ADDRESS = 0xD16798A26Fdf17AC7D0A45761ce071C1cE3b4073; // BuyAndBurn from Deploy04
    address constant GOV_ADDRESS = 0xBAaB2913ec979d9d21785063a0e4141e5B787D28;

    function run() external {
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        require(AUCTION_ADMIN_ADDRESS != address(0), "Must update AUCTION_ADMIN_ADDRESS first");
        require(BUY_AND_BURN_ADDRESS != address(0), "Must update BUY_AND_BURN_ADDRESS first");
        
        console.log("=== DEPLOYING DAV_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("STATE Token Address:", STATE_V3_ADDRESS);
        console.log("Governance Address:", GOV_ADDRESS);
        console.log("AuctionAdmin Address:", AUCTION_ADMIN_ADDRESS);
        console.log("BuyAndBurnController Address:", BUY_AND_BURN_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying DAV_V3...");
        DAV_V3 davV3 = new DAV_V3(
            STATE_V3_ADDRESS,         // _stateToken
            GOV_ADDRESS,              // _gov
            AUCTION_ADMIN_ADDRESS,    // _auctionAdmin (for dev fee wallet registry)
            BUY_AND_BURN_ADDRESS,     // _buyAndBurnController (receives 80% liquidity + ROI calculation)
            "PulseDAV",              // tokenName
            "pDAV"                   // tokenSymbol
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
        console.log("- 80% mint fees go to BuyAndBurnController");
        console.log("- 10% holder rewards");
        console.log("- 5% development fees");
        console.log("- 5% referral bonus");
        console.log("- STATE token reference:", STATE_V3_ADDRESS);
        console.log("");
        console.log("IMPORTANT: DAV minting is DISABLED until development wallets are configured in AuctionAdmin");
        console.log("");
        console.log("NEXT STEP: Deploy LPHelper:");
        console.log("forge script temp_scripts/Deploy06_LPHelper.s.sol:Deploy06_LPHelper");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}