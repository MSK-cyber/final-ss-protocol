// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";
import {STATE_V3} from "../src/StateToken.sol";
import {DAV_V3} from "../src/DavToken.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";
import {AirdropDistributor} from "../src/AirdropDistributor.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// PulseX interfaces
interface IPulseXRouter02 {
    function factory() external pure returns (address);
    function WPLS() external pure returns (address);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint256 amountADesired,
        uint256 amountBDesired,
        uint256 amountAMin,
        uint256 amountBMin,
        address to,
        uint256 deadline
    ) external returns (uint256 amountA, uint256 amountB, uint256 liquidity);
}

interface IPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

interface IWPLS {
    function deposit() external payable;
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

contract PulseChainForkedTest is Test {
    // PulseChain mainnet addresses
    address constant PULSEX_ROUTER = 0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02;
    address constant PULSEX_FACTORY = 0x1715a3E4A142d8b698131108995174F37aEBA10D;
    address constant WPLS_TOKEN = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    
    // Protocol contracts
    SWAP_V3 public swap;
    STATE_V3 public state;
    DAV_V3 public dav;
    BuyAndBurnController_V2 public buyBurnController;
    AirdropDistributor public airdrop;
    
    // PulseX contracts
    IPulseXRouter02 public router;
    IPulseXFactory public factory;
    IWPLS public wpls;
    
    // Test accounts
    address public governance = address(0x1);
    address public user1 = address(0x2);
    address public user2 = address(0x3);
    address public recipient5percent = address(0x4);
    
    uint256 constant INITIAL_BALANCE = 1000_000 ether; // 1M PLS per user
    
    function setUp() public {
        // Set up accounts with 1M PLS each
        vm.deal(governance, INITIAL_BALANCE);
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(user2, INITIAL_BALANCE);
        vm.deal(recipient5percent, INITIAL_BALANCE);
        
        // Setup PulseX contracts
        router = IPulseXRouter02(PULSEX_ROUTER);
        factory = IPulseXFactory(PULSEX_FACTORY);
        wpls = IWPLS(WPLS_TOKEN);
        
        console2.log("=== PULSECHAIN FORKED TEST SETUP ===");
        console2.log("Fork block:", block.number);
        console2.log("Chain ID:", block.chainid);
        console2.log("PulseX Router:", PULSEX_ROUTER);
        console2.log("PulseX Factory:", PULSEX_FACTORY);
        console2.log("WPLS Token:", WPLS_TOKEN);
        console2.log("Governance balance:", governance.balance / 1e18, "PLS");
    }
    
    function testPulseChainForkConnection() public {
        console2.log("\n=== TESTING PULSECHAIN FORK CONNECTION ===");
        
        // Test PulseX factory
        console2.log("Testing PulseX factory...");
        address factoryAddress = router.factory();
        console2.log("Router factory address:", factoryAddress);
        console2.log("Expected factory address:", PULSEX_FACTORY);
        assertEq(factoryAddress, PULSEX_FACTORY, "Factory address mismatch");
        
        // Test WPLS
        console2.log("Testing WPLS...");
        address wplsFromRouter = router.WPLS();
        console2.log("Router WPLS address:", wplsFromRouter);
        console2.log("Expected WPLS address:", WPLS_TOKEN);
        assertEq(wplsFromRouter, WPLS_TOKEN, "WPLS address mismatch");
        
        // Test WPLS deposit
        vm.startPrank(user1);
        uint256 depositAmount = 1000 ether;
        wpls.deposit{value: depositAmount}();
        uint256 wplsBalance = wpls.balanceOf(user1);
        console2.log("WPLS balance after deposit:", wplsBalance / 1e18, "WPLS");
        assertEq(wplsBalance, depositAmount, "WPLS deposit failed");
        vm.stopPrank();
        
        console2.log("PulseChain fork connection working correctly!");
    }
    
    function testDeployProtocolContracts() public {
        console2.log("\n=== DEPLOYING PROTOCOL CONTRACTS ===");
        
        vm.startPrank(governance);
        
        // Deploy STATE token
        state = new STATE_V3("STATE", "STATE", recipient5percent, governance);
        console2.log("STATE token deployed:", address(state));
        
        // Deploy BuyAndBurnController
        buyBurnController = new BuyAndBurnController_V2(
            address(state),
            WPLS_TOKEN,
            PULSEX_ROUTER,
            PULSEX_FACTORY,
            governance, // swap vault (will be updated)
            governance  // swap contract (will be updated)
        );
        console2.log("BuyAndBurnController deployed:", address(buyBurnController));
        
        // Deploy SWAP contract
        swap = new SWAP_V3(governance, user1);
        console2.log("SWAP_V3 deployed:", address(swap));
        
        // Deploy DAV token
        dav = new DAV_V3(
            address(buyBurnController),
            address(state),
            governance,
            "pDAV",
            "pDAV"
        );
        console2.log("DAV token deployed:", address(dav));
        
        // Deploy Airdrop Distributor
        airdrop = new AirdropDistributor(
            swap,
            dav,
            address(state),
            governance
        );
        console2.log("AirdropDistributor deployed:", address(airdrop));
        
        vm.stopPrank();
        
        console2.log("All protocol contracts deployed successfully!");
    }
    
    function testCreateStateWplsPool() public {
        testDeployProtocolContracts();
        
        console2.log("\n=== CREATING STATE/WPLS POOL ===");
        
        vm.startPrank(governance);
        
        // Convert PLS to WPLS for pool
        uint256 plsForPool = 100_000 ether; // 100k PLS
        wpls.deposit{value: plsForPool}();
        console2.log("Converted", plsForPool / 1e18, "PLS to WPLS");
        
        // Prepare STATE tokens for pool
        uint256 stateForPool = 1000 ether; // 1k STATE
        console2.log("STATE balance:", state.balanceOf(governance) / 1e18);
        console2.log("WPLS balance:", wpls.balanceOf(governance) / 1e18);
        
        // Approve tokens for router
        state.approve(PULSEX_ROUTER, stateForPool);
        wpls.approve(PULSEX_ROUTER, plsForPool);
        
        // Create STATE/WPLS pool
        (uint256 amountA, uint256 amountB, uint256 liquidity) = router.addLiquidity(
            address(state),
            WPLS_TOKEN,
            stateForPool,
            plsForPool,
            stateForPool * 95 / 100, // 5% slippage
            plsForPool * 95 / 100,   // 5% slippage
            governance,
            block.timestamp + 3600
        );
        
        console2.log("STATE/WPLS pool created:");
        console2.log("- STATE added:", amountA / 1e18);
        console2.log("- WPLS added:", amountB / 1e18);
        console2.log("- LP tokens:", liquidity / 1e18);
        
        // Verify pool exists
        address stateWplsPool = factory.getPair(address(state), WPLS_TOKEN);
        console2.log("STATE/WPLS pool address:", stateWplsPool);
        require(stateWplsPool != address(0), "Pool creation failed");
        
        vm.stopPrank();
        
        console2.log("STATE/WPLS pool created successfully!");
    }
    
    function testDAVExpirationOnFork() public {
        testCreateStateWplsPool();
        
        console2.log("\n=== TESTING DAV EXPIRATION ON FORK ===");
        
        // Debug ownership
        vm.startPrank(governance);
        console2.log("BuyBurnController owner:", buyBurnController.owner());
        console2.log("Governance address:", governance);
        console2.log("Is governance owner?", buyBurnController.owner() == governance);
        
        // Set the pool in buy and burn controller
        address stateWplsPool = factory.getPair(address(state), WPLS_TOKEN);
        console2.log("Setting STATE/WPLS pool:", stateWplsPool);
        
        buyBurnController.setStateWplsPool(stateWplsPool);
        console2.log("STATE/WPLS pool set in controller successfully");
        
        // Verify pool is set
        address setPool = buyBurnController.stateWplsPool();
        console2.log("Pool retrieved from controller:", setPool);
        console2.log("Pool matches:", setPool == stateWplsPool);
        
        // Check if DAV thinks pool is ready
        // console2.log("DAV isPoolReady():", dav.isPoolReady()); // Removed - DAV restrictions eliminated
        console2.log("DAV restrictions eliminated - minting works without verification");
        
        // Debug the safety check manually
        console2.log("\n=== DEBUGGING POOL SAFETY CHECK ===");
        console2.log("Controller address:", address(buyBurnController));
        console2.log("Factory address:", PULSEX_FACTORY);
        console2.log("STATE token:", address(state));
        console2.log("WPLS token:", WPLS_TOKEN);
        
        // Check each part of the verification
        address controllerPool = buyBurnController.stateWplsPool();
        address factoryPool = factory.getPair(address(state), WPLS_TOKEN);
        
        console2.log("Controller pool:", controllerPool);
        console2.log("Factory pool:", factoryPool);
        console2.log("Pools match:", controllerPool == factoryPool);
        console2.log("Both non-zero:", controllerPool != address(0) && factoryPool != address(0));
        
        vm.stopPrank();
        
        vm.startPrank(user1);
        
        // Mint DAV tokens
        console2.log("Minting 5 DAV tokens...");
        uint256 davCost = 5 * 500 ether; // 5 DAV * 500 PLS each
        dav.mintDAV{value: davCost}(5 ether, "");
        
        uint256 totalDav1 = dav.balanceOf(user1);
        uint256 activeDav1 = dav.getActiveBalance(user1);
        console2.log("After first mint - Total:", totalDav1 / 1e18, "Active:", activeDav1 / 1e18);
        
        // Advance time by 3 days
        vm.warp(block.timestamp + 3 days);
        console2.log("Advanced time by 3 days");
        
        // Check expiration
        uint256 activeDavAfterTime = dav.getActiveBalance(user1);
        console2.log("Active DAV after time advance:", activeDavAfterTime / 1e18);
        
        // Mint more DAV
        console2.log("Minting 3 more DAV tokens...");
        uint256 davCost2 = 3 * 500 ether;
        dav.mintDAV{value: davCost2}(3 ether, "");
        
        uint256 totalDavFinal = dav.balanceOf(user1);
        uint256 activeDavFinal = dav.getActiveBalance(user1);
        console2.log("Final - Total:", totalDavFinal / 1e18, "Active:", activeDavFinal / 1e18);
        
        vm.stopPrank();
        
        console2.log("DAV expiration test completed on fork!");
    }
}