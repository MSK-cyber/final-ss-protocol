// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";

contract InitializeSystem is Script {
    // All deployed contract addresses
    address constant SWAP_V3_ADDRESS = 0xeA55dB9Ae0eAfD245720563583871CE9ED549772;
    address constant STATE_V3_ADDRESS = 0x9454Eb295d8E4d871d724013dffd2301C486FD07;
    address constant DAV_V3_ADDRESS = 0x42107c7441f0A3E1CB3Dba948597c39615765227;
    address constant LP_HELPER_ADDRESS = 0x967c15FcB0ED957ab8d406721E12C95BD859c898;
    address constant AIRDROP_DISTRIBUTOR_ADDRESS = 0x2C7725F02235BA3387369560A7Ea16a61778D6ff;
    address constant AUCTION_ADMIN_ADDRESS = 0x9a64Db2Eb8e6b01a517B1C96F325fa5103a589Ad;
    address constant BUY_BURN_CONTROLLER_ADDRESS = 0x1bEAfD2cdffCD2867914B3fD6cfe92883ad3A687;
    
    // PulseChain mainnet DEX addresses
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;

    function run() external {
        console.log("=== INITIALIZING COMPLETE SYSTEM ===");
        console.log("Chain ID:", block.chainid);
        console.log("Caller:", msg.sender);
        console.log("Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("");
        
        // Validate all addresses
        require(SWAP_V3_ADDRESS != address(0), "Invalid SWAP address");
        require(STATE_V3_ADDRESS != address(0), "Invalid STATE address");
        require(DAV_V3_ADDRESS != address(0), "Invalid DAV address");
        require(LP_HELPER_ADDRESS != address(0), "Invalid LP Helper address");
        require(AIRDROP_DISTRIBUTOR_ADDRESS != address(0), "Invalid Airdrop Distributor address");
        require(AUCTION_ADMIN_ADDRESS != address(0), "Invalid Auction Admin address");
        require(BUY_BURN_CONTROLLER_ADDRESS != address(0), "Invalid Buy Burn Controller address");
        
        console.log("Contract Addresses:");
        console.log("- SWAP_V3:", SWAP_V3_ADDRESS);
        console.log("- STATE_V3:", STATE_V3_ADDRESS);
        console.log("- DAV_V3:", DAV_V3_ADDRESS);
        console.log("- LP Helper:", LP_HELPER_ADDRESS);
        console.log("- Airdrop Distributor:", AIRDROP_DISTRIBUTOR_ADDRESS);
        console.log("- Auction Admin:", AUCTION_ADMIN_ADDRESS);
        console.log("- Buy & Burn Controller:", BUY_BURN_CONTROLLER_ADDRESS);
        console.log("- PulseX Router:", PULSEX_ROUTER);
        console.log("- PulseX Factory:", PULSEX_FACTORY);
        console.log("");

        vm.startBroadcast();
        
        SWAP_V3 swapContract = SWAP_V3(payable(SWAP_V3_ADDRESS));
        
        console.log("Calling initializeCompleteSystem...");
        swapContract.initializeCompleteSystem(
            STATE_V3_ADDRESS,
            DAV_V3_ADDRESS,
            LP_HELPER_ADDRESS,
            AIRDROP_DISTRIBUTOR_ADDRESS,
            AUCTION_ADMIN_ADDRESS,
            BUY_BURN_CONTROLLER_ADDRESS,
            PULSEX_ROUTER,
            PULSEX_FACTORY
        );
        
        console.log("SUCCESS: System initialization completed!");
        
        vm.stopBroadcast();
        
        console.log("");
        console.log("=== SYSTEM INITIALIZATION COMPLETED ===");
        console.log("SUCCESS: All contracts are now connected and configured");
        console.log("SUCCESS: Token allowances set for airdrop functionality");
        console.log("SUCCESS: Buy & burn controller has STATE token access");
        console.log("SUCCESS: System is ready for auction operations");
        console.log("");
        console.log("Next steps:");
        console.log("1. Deploy project tokens using createPoolOneClick()");
        console.log("2. Start auction schedule with startAuctionWithAutoTokens()");
        console.log("3. Begin auction operations");
    }
}