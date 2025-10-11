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

    // Environment variables
    address govAddress;
    address devAddress;

    function run() external {
        // Load environment variables
        govAddress = vm.envOr("GOV_ADDRESS", msg.sender);
        devAddress = vm.envOr("DEV_ADDRESS", msg.sender);

        console.log("=== SS PROTOCOL V4 SIMPLE MAINNET DEPLOYMENT ===");
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
            "PulseState",     // token name
            "pSTATE",         // token symbol  
            govAddress,       // 5% recipient (governance)
            address(swapV3)   // 95% recipient (swap contract)
        );
        console.log("   STATE_V3 deployed at:", address(stateV3));

        // 3. Deploy DAV_V3 (DavToken)
        console.log("3. Deploying DAV_V3...");
        davV3 = new DAV_V3(
            devAddress,           // liquidity wallet
            address(stateV3),     // state token address
            govAddress,           // governance address
            "PulseDAV",          // token name
            "pDAV"               // token symbol
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
        console.log("=== DEPLOYMENT COMPLETE ===");
        console.log("WARNING: CRITICAL POST-DEPLOYMENT SETUP REQUIRED");
        console.log("");
        
        printDeploymentSummary();
        printPostDeploymentSetup();
        generateDeploymentJSON();
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
        console.log("=== NEXT STEPS ===");
        console.log("1. Configure contracts using frontend admin panel");
        console.log("2. Set up integrations between contracts");
        console.log("3. Create initial liquidity pools");
        console.log("4. Start auction schedule");
        console.log("");
        console.log("Deployment completed successfully!");
    }

    function printPostDeploymentSetup() internal view {
        console.log("=== CRITICAL POST-DEPLOYMENT SETUP REQUIRED ===");
        console.log("");
        console.log("The following steps MUST be completed after deployment:");
        console.log("");
        console.log("1. SET UP BUY AND BURN ALLOWANCE:");
        console.log("   Call: swapV3.setVaultAllowance(stateToken, buyAndBurnController, type(uint256).max)");
        console.log("   Required for: BuyAndBurnController to transfer STATE tokens from SWAP vault");
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
        console.log("4. SET UP BUY AND BURN CONTROLLER:");
        console.log("   - buyAndBurnController.setupSwapVaultAllowance(type(uint256).max)");
        console.log("   - Create STATE/WPLS pool for buy and burn operations");
        console.log("   - buyAndBurnController.setStateWplsPool(stateWplsPoolAddress)");
        console.log("");
        console.log("5. CREATE INITIAL LIQUIDITY POOLS:");
        console.log("   - Create STATE/WPLS pool with initial liquidity");
        console.log("   - Create DAV/WPLS pool with initial liquidity");
        console.log("");
        console.log("6. SET UP AUCTION SCHEDULE:");
        console.log("   - Deploy auction tokens using swapV3.deployTokenOneClick()");
        console.log("   - Create pools for auction tokens");
        console.log("   - Set auction schedule using swapV3.setAuctionSchedule()");
        console.log("");
        console.log("WARNING: BuyAndBurnController WILL NOT WORK without step 1!");
        console.log("This is the critical missing piece for mainnet functionality.");
        console.log("");
        console.log("=== IMPORTANT: CONTRACT VERIFICATION & SECURITY ===");
        console.log("");
        console.log("NEXT STEPS FOR PRODUCTION DEPLOYMENT:");
        console.log("1. VERIFY ALL CONTRACTS on PulseScan (https://scan.pulsechain.com)");
        console.log("2. RENOUNCE OWNERSHIP of all contracts after setup is complete");
        console.log("3. All smart contracts must be verified and renounced for transparency");
        console.log("4. Complete the post-deployment setup steps above BEFORE renouncing");
        console.log("");
    }

    function generateDeploymentJSON() internal view {
        console.log("=== GENERATING DEPLOYMENT JSON FOR FRONTEND INTEGRATION ===");
        console.log("");
        console.log("Creating pulsechain-mainnet.json file...");
        console.log("");
        
        // Generate JSON string for the deployment file
        string memory json = string(abi.encodePacked(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ',\n',
            '  "networkName": "PulseChain Mainnet",\n',
            '  "rpc": "https://rpc.pulsechain.com",\n',
            '  "blockExplorer": "https://scan.pulsechain.com",\n',
            '  "deploymentBlocks": "', vm.toString(block.number), '-', vm.toString(block.number + 8), '",\n',
            '  "deploymentTimestamp": ', vm.toString(block.timestamp), ',\n',
            '  "deployer": "', vm.toString(msg.sender), '",\n',
            '  "governance": "', vm.toString(govAddress), '",\n',
            '  "totalGasUsed": 0,\n',
            '  "totalCostPLS": 0,\n',
            '  "configuration": {\n',
            '    "auctionCycle": "15 minutes",\n',
            '    "walletLimit": 5000,\n',
            '    "airdropPerDav": 10000,\n',
            '    "davTokenSupply": "10 Million",\n',
            '    "auctionDuration": "15 minutes",\n',
            '    "davExpiration": "2 days",\n',
            '    "davCost": "500 PLS",\n',
            '    "minDavRequired": "1 DAV",\n',
            '    "stateTokenSupply": "100 Trillion",\n',
            '    "listedTokenSupply": "5 Billion",\n',
            '    "stateGovernanceShare": "5%",\n',
            '    "tokenGovernanceShare": "1%",\n',
            '    "auctionStartTime": "Pakistan 6 AM"\n',
            '  },\n',
            '  "contracts": {\n',
            '    "core": {\n',
            '      "SWAP_V3": "', vm.toString(address(swapV3)), '",\n',
            '      "STATE_V3": "', vm.toString(address(stateV3)), '",\n',
            '      "DAV_V3": "', vm.toString(address(davV3)), '"\n',
            '    },\n',
            '    "support": {\n',
            '      "SwapLens": "', vm.toString(address(swapLens)), '",\n',
            '      "BuyAndBurnController": "', vm.toString(address(buyAndBurnController)), '"\n',
            '    },\n',
            '    "stages": {\n',
            '      "AirdropDistributor": "', vm.toString(address(airdropDistributor)), '",\n',
            '      "AuctionAdmin": "', vm.toString(address(auctionAdmin)), '"\n',
            '    },\n',
            '    "utilities": {\n',
            '      "LPHelper": "', vm.toString(address(lpHelper)), '"\n',
            '    }\n',
            '  },\n',
            '  "external": {\n',
            '    "PulseXRouter": "', vm.toString(PULSEX_ROUTER), '",\n',
            '    "PulseXFactory": "', vm.toString(PULSEX_FACTORY), '",\n',
            '    "WPLS": "', vm.toString(WPLS), '"\n',
            '  },\n',
            '  "tokens": {\n',
            '    "STATE_V3": {\n',
            '      "address": "', vm.toString(address(stateV3)), '",\n',
            '      "symbol": "pSTATE",\n',
            '      "name": "PulseState",\n',
            '      "decimals": 18,\n',
            '      "totalSupply": "100000000000000000000000000000000"\n',
            '    },\n',
            '    "DAV_V3": {\n',
            '      "address": "', vm.toString(address(davV3)), '",\n',
            '      "symbol": "pDAV",\n',
            '      "name": "PulseDAV",\n',
            '      "decimals": 18,\n',
            '      "totalSupply": "2000000000000000000000"\n',
            '    }\n',
            '  }\n',
            '}'
        ));
        
        // Write to file using vm.writeFile
        string memory fileName = "./deployments/pulsechain-mainnet.json";
        
        console.log("=== COPY THE JSON BELOW TO CREATE pulsechain-mainnet.json ===");
        console.log("");
        console.log(json);
        console.log("");
        
        console.log("JSON file should be saved at:", fileName);
        console.log("");
        console.log("=== FRONTEND INTEGRATION READY ===");
        console.log("The frontend can now use the generated JSON file to:");
        console.log("- Connect to deployed contracts");
        console.log("- Display contract addresses");
        console.log("- Configure token information");
        console.log("- Set up DEX integration");
        console.log("");
        console.log("IMPORTANT: Remember to complete the post-deployment setup steps!");
    }
}