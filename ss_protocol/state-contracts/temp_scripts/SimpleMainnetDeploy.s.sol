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
import {AuctionMetrics} from "../src/AuctionMetrics.sol";

// Required interfaces
interface IPulseXRouter02 {
    function factory() external view returns (address);
    function WPLS() external view returns (address);
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
}

interface IWPLS {
    function deposit() external payable;
    function balanceOf(address) external view returns (uint256);
}

contract SimpleMainnetDeploy is Script {
    // PulseChain Mainnet addresses
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;

    // Deployed contract addresses (will be populated during deployment)
    SWAP_V3 public swapV3;
    STATE_V3 public stateV3;
    DAV_V3 public davV3;
    BuyAndBurnController_V2 public buyAndBurnController;
    LPHelper public lpHelper;
    AirdropDistributor public airdropDistributor;
    AuctionAdmin public auctionAdmin;
    SwapLens public swapLens;
    AuctionMetrics public auctionMetrics;

    // Environment variables
    address govAddress;
    address devAddress;
    
    // DEX contract interfaces
    IPulseXRouter02 public pulseXRouter;
    IPulseXFactory public pulseXFactory;
    IWPLS public wplsToken;

    function run() external {
        // Set specific wallet addresses
        govAddress = 0x9FA004E13e780EF5b50ca225ad5DCD4D0Fe9ed70;
        devAddress = 0x91Bd0000565f89DBf2D2D28c57db3E5c56873A77;
        
        // Ensure governance and dev are different addresses
        require(govAddress != devAddress, "Governance and dev addresses must be different");
        
        // Initialize PulseX contracts
        pulseXRouter = IPulseXRouter02(PULSEX_ROUTER);
        pulseXFactory = IPulseXFactory(PULSEX_FACTORY);
        wplsToken = IWPLS(WPLS);

        console.log("=== SS PROTOCOL V4 MAINNET DEPLOYMENT ===");
        console.log("Following NEW STRUCTURED DEPLOYMENT SEQUENCE");
        console.log("Deployer:", msg.sender);
        console.log("Governance Address:", govAddress);
        console.log("Development Address:", devAddress);
        console.log("Chain ID:", block.chainid);
        console.log("Current Balance:", msg.sender.balance / 1e18, "PLS");
        console.log("");

        // Start deployment with private key
        vm.startBroadcast();
        
        console.log("=== PROTOCOL CONTRACT DEPLOYMENT ===");
        deployAllContracts();
        
        vm.stopBroadcast();
        
        console.log("\n=== DEPLOYMENT COMPLETED ===");
        console.log("SUCCESS: All contracts deployed successfully!");
        console.log("NOTE: System integration will be done from UI using governance wallet");
        console.log("");
        console.log("NEXT STEPS FOR GOVERNANCE WALLET:");
        console.log("1. Call davV3.setSwapContract(address(swapV3))");
        console.log("2. Call swapV3.initializeCompleteSystem(...)");
        console.log("3. Create STATE/WPLS pool using BuyAndBurnController");
        console.log("4. Set up auction schedule and start the system");
        
        printDeploymentSummary();
    }

    function deployAllContracts() internal {
        console.log("\n--- Deploying Protocol Contracts ---");
        
        // Deploy main contracts following our tested sequence
        console.log("Deploying SWAP_V3...");
        swapV3 = new SWAP_V3(govAddress, devAddress);
        console.log("SWAP_V3 deployed:", address(swapV3));
        
        console.log("Deploying STATE_V3...");
        console.log("- governance (5% recipient):", govAddress);
        console.log("- swap (95% recipient):", address(swapV3));
        stateV3 = new STATE_V3("PulseState", "pSTATE", govAddress, address(swapV3));
        console.log("STATE_V3 deployed:", address(stateV3));
        
        console.log("Deploying DAV_V3...");
        davV3 = new DAV_V3(devAddress, address(stateV3), govAddress, "PulseDAV", "pDAV");
        console.log("DAV_V3 deployed:", address(davV3));
        
        console.log("Deploying LPHelper...");
        lpHelper = new LPHelper(PULSEX_ROUTER, PULSEX_FACTORY);
        console.log("LPHelper deployed:", address(lpHelper));
        
        console.log("Deploying AirdropDistributor...");
        airdropDistributor = new AirdropDistributor(swapV3, davV3, address(stateV3), govAddress);
        console.log("AirdropDistributor deployed:", address(airdropDistributor));
        
        console.log("Deploying AuctionAdmin...");
        auctionAdmin = new AuctionAdmin(address(swapV3));
        console.log("AuctionAdmin deployed:", address(auctionAdmin));
        
        console.log("Deploying BuyAndBurnController_V2...");
        buyAndBurnController = new BuyAndBurnController_V2(
            address(stateV3),
            WPLS,
            PULSEX_ROUTER,
            PULSEX_FACTORY,
            address(swapV3),
            address(swapV3)
        );
        console.log("BuyAndBurnController_V2 deployed:", address(buyAndBurnController));
        
        console.log("Deploying SwapLens...");
        swapLens = new SwapLens();
        console.log("SwapLens deployed:", address(swapLens));
        
        console.log("Deploying AuctionMetrics...");
        auctionMetrics = new AuctionMetrics();
        console.log("AuctionMetrics deployed:", address(auctionMetrics));
        
        console.log("=== TRANSFERRING OWNERSHIP TO GOVERNANCE ===");
        // Transfer ownerships to governance
        buyAndBurnController.transferOwnership(govAddress);
        console.log("BuyAndBurnController ownership transferred to governance");
        
        davV3.transferOwnership(govAddress);
        console.log("DAV ownership transferred to governance");
        
        swapV3.transferOwnership(govAddress);
        console.log("SWAP ownership transferred to governance");
    }

    function integrateSystem() internal {
        console.log("Using initializeCompleteSystem() for comprehensive contract integration");
        console.log("This replaces manual integration with one-click system setup");
        
        // Configure DAV to allow SWAP contract for automated integration
        davV3.setSwapContract(address(swapV3));
        console.log("DAV configured to allow SWAP contract for automated integration");
        
        // Use the enhanced initializeCompleteSystem() function for complete integration
        console.log("Calling swapV3.initializeCompleteSystem() - the MAIN integration function");
        swapV3.initializeCompleteSystem(
            address(stateV3),
            address(davV3),
            address(lpHelper),
            address(airdropDistributor),
            address(auctionAdmin),
            address(buyAndBurnController),
            PULSEX_ROUTER,
            PULSEX_FACTORY
        );
        
        console.log("SUCCESS: Complete system integration with initializeCompleteSystem()");
        console.log("- All contract addresses configured automatically");
        console.log("- STATE, DAV, LP Helper, Airdrop, Admin addresses set in SWAP");
        console.log("- PulseX DEX addresses configured");
        console.log("- BuyAndBurnController integrated with automatic allowances");
        console.log("- AuctionAdmin configured with DEX addresses");
        console.log("- DAV token automatically configured with BuyAndBurnController via SWAP");
        console.log("- System now ready for governance integration from UI");
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
        console.log("AuctionMetrics:", address(auctionMetrics));
        console.log("");
        
        console.log("=== GOVERNANCE INTEGRATION PARAMETERS ===");
        console.log("For davV3.setSwapContract():");
        console.log("- swapContract:", address(swapV3));
        console.log("");
        console.log("For swapV3.initializeCompleteSystem():");
        console.log("- stateToken:", address(stateV3));
        console.log("- davToken:", address(davV3));
        console.log("- lpHelper:", address(lpHelper));
        console.log("- airdropDistributor:", address(airdropDistributor));
        console.log("- auctionAdmin:", address(auctionAdmin));
        console.log("- buyBurnController:", address(buyAndBurnController));
        console.log("- pulseXRouter:", PULSEX_ROUTER);
        console.log("- pulseXFactory:", PULSEX_FACTORY);
        console.log("");
        
        console.log("=== WALLET ADDRESSES ===");
        console.log("Governance Wallet:", govAddress);
        console.log("Development Wallet:", devAddress);
        console.log("");
        
        console.log("Deployment completed successfully!");
        console.log("Ready for governance integration from UI!");
    }


}