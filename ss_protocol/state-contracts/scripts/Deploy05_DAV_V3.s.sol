// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {DAV_V3} from "../src/DavToken.sol";

contract Deploy05_DAV_V3 is Script {
    // Update these addresses after previous deployments
    address constant STATE_V3_ADDRESS = 0x4e90670b4cDE8FF7cdDEeAf99AEFD68a114d9C01; // STATE_V3 from Deploy02
    address constant AUCTION_ADMIN_ADDRESS = 0xEab50ADaB223f96f139B75430dF7274aE66560Db; // AuctionAdmin from Deploy03
    address constant BUY_AND_BURN_ADDRESS = 0xf1Df5CD347A498768A44F7e0549F833525e3b751; // BuyAndBurn from Deploy04
    address constant SWAP_V3_ADDRESS = 0x8172716bD7117461D4b20bD0434358F74244d4ec; // SWAP_V3 from Deploy01
    address constant PULSEX_ROUTER_ADDRESS = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02; // PulseX Router V2 (matches SWAP_V3)
    address constant WPLS_ADDRESS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27; // WPLS token address
    address constant GOV_ADDRESS = 0x0f7F24c7F22e2Ca7052f051A295e1a5D3369cAcE;

    function run() external {
        require(STATE_V3_ADDRESS != address(0), "Must update STATE_V3_ADDRESS first");
        require(AUCTION_ADMIN_ADDRESS != address(0), "Must update AUCTION_ADMIN_ADDRESS first");
        require(BUY_AND_BURN_ADDRESS != address(0), "Must update BUY_AND_BURN_ADDRESS first");
        require(SWAP_V3_ADDRESS != address(0), "Must update SWAP_V3_ADDRESS first");
        
        console.log("=== DEPLOYING DAV_V3 CONTRACT ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("STATE Token Address:", STATE_V3_ADDRESS);
        console.log("Governance Address:", GOV_ADDRESS);
        console.log("AuctionAdmin Address:", AUCTION_ADMIN_ADDRESS);
        console.log("BuyAndBurnController Address:", BUY_AND_BURN_ADDRESS);
        console.log("SWAP_V3 Address:", SWAP_V3_ADDRESS);
        console.log("PulseX Router Address:", PULSEX_ROUTER_ADDRESS);
        console.log("WPLS Address:", WPLS_ADDRESS);
        console.log("");

        vm.startBroadcast();
        
        console.log("Deploying DAV_V3...");
        DAV_V3 davV3 = new DAV_V3(
            STATE_V3_ADDRESS,         // _stateToken
            GOV_ADDRESS,              // _gov
            AUCTION_ADMIN_ADDRESS,    // _auctionAdmin (for dev fee wallet registry)
            BUY_AND_BURN_ADDRESS,     // _buyAndBurnController (receives 80% liquidity + ROI calculation)
            SWAP_V3_ADDRESS,          // _swapContract (for ROI calculations)
            PULSEX_ROUTER_ADDRESS,    // _pulsexRouter (for AMM price calculations)
            WPLS_ADDRESS,             // _wpls (for STATE->PLS conversions)
            "PulseDAV1",              // tokenName
            "pDAV1"                   // tokenSymbol
        );
        
        console.log("SUCCESS: DAV_V3 deployed at:", address(davV3));
        console.log("NOTE: Ownership renounced in constructor - governance address has direct admin rights");
        console.log("");
        
        vm.stopBroadcast();
        
        console.log("=== DEPLOYMENT COMPLETED ===");
        console.log("DAV_V3 Address:", address(davV3));
        console.log("");
        console.log("Token Details:");
        console.log("- Name: PulseDAV1");
        console.log("- Symbol: pDAV1");
        console.log("- Initial governance mint: 100 DAV tokens");
        console.log("- 80% mint fees go to BuyAndBurnController");
        console.log("- 10% holder rewards");
        console.log("- 5% development fees");
        console.log("- 5% referral bonus");
        console.log("- STATE token reference:", STATE_V3_ADDRESS);
        console.log("");
        console.log("IMPORTANT: DAV minting is DISABLED until development wallets are configured in AuctionAdmin");
        console.log("");
        console.log("Deployment complete! DAV_V3 is ready to use.");
        console.log("Note: LPHelper is no longer used - use SWAP_V3.createPoolOneClick() directly for pool creation");
        console.log("");
        console.log("NEXT STEP: Deploy AirdropDistributor:");
        console.log("forge script scripts/Deploy06_AirdropDistributor.s.sol:Deploy06_AirdropDistributor");
        console.log("  --rpc-url https://rpc.pulsechain.com");
        console.log("  --private-key $PRIVATE_KEY");
        console.log("  --broadcast");
        console.log("  --legacy");
    }
}