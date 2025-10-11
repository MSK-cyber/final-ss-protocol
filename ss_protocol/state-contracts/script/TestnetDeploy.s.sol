// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";

// Contract imports - using specific path imports to avoid conflicts
import {SWAP_V3} from "../src/AuctionSwap.sol";
import {STATE_V3} from "../src/StateToken.sol";  
import {DAV_V3} from "../src/DavToken.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";
import {LPHelper} from "../src/LPHelper.sol";
import {AirdropDistributor} from "../src/AirdropDistributor.sol";
import {AuctionAdmin} from "../src/AuctionAdmin.sol";
import {SwapLens} from "../src/SwapLens.sol";

contract TestnetDeploy is Script {
    // PulseChain Testnet v4 addresses
    address constant PULSEX_ROUTER = 0xDaE9dd3d1A52CfCe9d5F2fAC7fDe164D500E50f7;
    address constant PULSEX_FACTORY = 0xe4d4c68B03c02f2f7EBd3E1e2a721d2799f1e5A3;
    address constant WPLS = 0x70499adEBB11Efd915E3b69E700c331778628707;

    // Deployed contract addresses (will be populated during deployment)
    SWAP_V3 public swapV3;
    STATE_V3 public stateV3;
    DAV_V3 public davV3;
    BuyAndBurnController_V2 public buyAndBurnController;
    LPHelper public lpHelper;
    AirdropDistributor public airdropDistributor;
    AuctionAdmin public auctionAdmin;
    SwapLens public swapLens;

    // Environment variables
    address govAddress;
    address devAddress;

    function run() external {
        // Load environment variables
        govAddress = vm.envOr("GOV_ADDRESS", msg.sender);
        devAddress = vm.envOr("DEV_ADDRESS", msg.sender);

        console.log("=== SS PROTOCOL V4 TESTNET DEPLOYMENT ===");
        console.log("Deployer:", msg.sender);
        console.log("Governance Address:", govAddress);
        console.log("Development Address:", devAddress);
        console.log("Chain ID:", block.chainid);
        console.log("");
        console.log("=== CONFIGURATION SUMMARY ===");
        console.log("Auction Cycle: Every 15 minutes");
        console.log("Wallet Limit: 5,000 wallets");
        console.log("Airdrop per DAV: 10,000 listed tokens");
        console.log("DAV Token Supply: 10 Million");
        console.log("Auction Duration: 15 minutes");
        console.log("DAV Expiration: 2 days");
        console.log("DAV Cost: 500 PLS per DAV");
        console.log("Min DAV Required: 1 DAV");
        console.log("STATE Token Supply: 100 Trillion");
        console.log("Listed Token Supply: 5 Billion");
        console.log("STATE Governance Share: 5% / SWAP: 95%");
        console.log("Token Governance Share: 1% / SWAP: 99%");
        console.log("Auction Start Time: Pakistan 6 AM daily");
        console.log("");

        vm.startBroadcast();

        // 1. Deploy SWAP_V3 (AuctionSwap)
        console.log("1. Deploying SWAP_V3...");
        swapV3 = new SWAP_V3(
            govAddress,  // governance address
            devAddress   // development address
        );
        console.log("   SWAP_V3 deployed at:", address(swapV3));

        // 2. Deploy STATE_V3 (StateToken)
        console.log("2. Deploying STATE_V3...");
        stateV3 = new STATE_V3(
            "TestPulseState",     // token name
            "tpSTATE",           // token symbol  
            govAddress,          // 5% recipient (governance)
            address(swapV3)      // 95% recipient (swap contract)
        );
        console.log("   STATE_V3 deployed at:", address(stateV3));

        // 3. Deploy DAV_V3 (DavToken)
        console.log("3. Deploying DAV_V3...");
        davV3 = new DAV_V3(
            devAddress,          // liquidity wallet
            address(stateV3),    // state token address
            govAddress,          // governance address
            "TestPulseDAV",      // token name
            "tpDAV"              // token symbol
        );
        console.log("   DAV_V3 deployed at:", address(davV3));

        // 4. Deploy BuyAndBurnController_V2
        console.log("4. Deploying BuyAndBurnController_V2...");
        buyAndBurnController = new BuyAndBurnController_V2(
            address(stateV3),     // state token
            WPLS,                 // WPLS token
            PULSEX_ROUTER,        // PulseX router
            PULSEX_FACTORY,       // PulseX factory
            address(swapV3),      // swap vault
            address(swapV3)       // swap contract
        );
        console.log("   BuyAndBurnController_V2 deployed at:", address(buyAndBurnController));

        // 5. Deploy LPHelper
        console.log("5. Deploying LPHelper...");
        lpHelper = new LPHelper(
            PULSEX_ROUTER,        // PulseX router
            PULSEX_FACTORY        // PulseX factory
        );
        console.log("   LPHelper deployed at:", address(lpHelper));

        // 6. Deploy AirdropDistributor
        console.log("6. Deploying AirdropDistributor...");
        airdropDistributor = new AirdropDistributor(
            swapV3,               // swap contract
            davV3,                // DAV token
            address(stateV3),     // state token
            govAddress            // owner
        );
        console.log("   AirdropDistributor deployed at:", address(airdropDistributor));

        // 7. Deploy AuctionAdmin
        console.log("7. Deploying AuctionAdmin...");
        auctionAdmin = new AuctionAdmin(
            address(swapV3)       // main contract address
        );
        console.log("   AuctionAdmin deployed at:", address(auctionAdmin));

        // 8. Deploy SwapLens
        console.log("8. Deploying SwapLens...");
        swapLens = new SwapLens();
        console.log("   SwapLens deployed at:", address(swapLens));

        vm.stopBroadcast();

        console.log("");
        console.log("=== TESTNET DEPLOYMENT COMPLETE ===");
        console.log("");
        
        printDeploymentSummary();
        printPostDeploymentSetup();
    }

    function printDeploymentSummary() internal view {
        console.log("=== CONTRACT ADDRESSES ===");
        console.log("SWAP_V3:", address(swapV3));
        console.log("STATE_V3:", address(stateV3));
        console.log("DAV_V3:", address(davV3));
        console.log("BuyAndBurnController_V2:", address(buyAndBurnController));
        console.log("LPHelper:", address(lpHelper));
        console.log("AirdropDistributor:", address(airdropDistributor));
        console.log("AuctionAdmin:", address(auctionAdmin));
        console.log("SwapLens:", address(swapLens));
        console.log("");
        console.log("=== CONFIGURATION ===");
        console.log("PulseX Router:", PULSEX_ROUTER);
        console.log("PulseX Factory:", PULSEX_FACTORY);
        console.log("WPLS:", WPLS);
        console.log("Governance Address:", govAddress);
        console.log("Development Address:", devAddress);
        console.log("");
        console.log("Testnet deployment completed successfully!");
    }

    function printPostDeploymentSetup() internal view {
        console.log("=== POST-DEPLOYMENT SETUP STEPS ===");
        console.log("");
        console.log("1. SET UP BUY AND BURN ALLOWANCE:");
        console.log("   Call: swapV3.setVaultAllowance(stateToken, buyAndBurnController, type(uint256).max)");
        console.log("");
        console.log("2. CONFIGURE CONTRACT INTEGRATIONS:");
        console.log("   - swapV3.setStateTokenAddress(", address(stateV3), ")");
        console.log("   - swapV3.setDavTokenAddress(", address(davV3), ")");
        console.log("   - swapV3.setLPHelperAddress(", address(lpHelper), ")");
        console.log("   - swapV3.setAirdropDistributor(", address(airdropDistributor), ")");
        console.log("   - swapV3.setAuctionAdmin(", address(auctionAdmin), ")");
        console.log("   - swapV3.setPulseXRouter(", PULSEX_ROUTER, ")");
        console.log("   - swapV3.setPulseXFactory(", PULSEX_FACTORY, ")");
        console.log("");
        console.log("3. LINK DAV TO BUY AND BURN:");
        console.log("   - davV3.setBuyAndBurnController(", address(buyAndBurnController), ")");
        console.log("   - davV3.setStateToken(", address(stateV3), ")");
        console.log("");
        console.log("=== TESTNET VERIFICATION ===");
        console.log("Test the following functionality:");
        console.log("- Mint DAV tokens");
        console.log("- Create auction tokens");
        console.log("- Participate in auctions");
        console.log("- Verify Pakistan 6 AM timing");
        console.log("- Test buy and burn functionality");
        console.log("");
        console.log("If all tests pass, proceed with mainnet deployment!");
    }
}