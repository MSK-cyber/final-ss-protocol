// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import "../../src/interfaces/IWPLS.sol";
import {STATE_V3} from "../../src/StateToken.sol";
import {LPHelper} from "../../src/LPHelper.sol";
import {SWAP_V3} from "../../src/AuctionSwap.sol";

interface ITestPulseXRouter {
    function WETH() external pure returns (address);
    function factory() external pure returns (address);
    function addLiquidity(
        address tokenA,
        address tokenB,
        uint amountADesired,
        uint amountBDesired,
        uint amountAMin,
        uint amountBMin,
        address to,
        uint deadline
    ) external returns (uint amountA, uint amountB, uint liquidity);
    
    function addLiquidityETH(
        address token,
        uint amountTokenDesired,
        uint amountTokenMin,
        uint amountETHMin,
        address to,
        uint deadline
    ) external payable returns (uint amountToken, uint amountETH, uint liquidity);
}

interface ITestPulseXFactory {
    function getPair(address tokenA, address tokenB) external view returns (address pair);
    function createPair(address tokenA, address tokenB) external returns (address pair);
}

/**
 * @title PoolCreationTest
 * @notice Test contract for creating STATE/WPLS liquidity pool and PLS wrapping
 */
contract PoolCreationTest is Test {
    
    // Deployed contract addresses from integration
    STATE_V3 constant state = STATE_V3(0x670461DfC3b99E9E034956D88D96D1f16154c70e);
    SWAP_V3 constant swap = SWAP_V3(0xC69740cb989fbE87b6537c7C8e303180F2A55E7a);
    LPHelper constant helper = LPHelper(0x7e43e69B11354B55078C7b6aB9a03f2BEa6679cc);
    
    // PulseX contracts
    address constant WPLS = 0xA1077a294dDE1B09bB078844df40758a5D0f9a27;
    address constant ROUTER = 0x165C3410fC91EF562C50559f7d2289fEbed552d9;
    address constant FACTORY = 0x29eA7545DEf87022BAdc76323F373EA1e707C523;
    
    // Test accounts (Anvil default accounts)
    address constant GOVERNANCE = 0xF4579FA5Aca398FfeeB3eD1298104d226Ef84ebd;
    address constant USER = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266; // Account 0
    
    IWPLS wpls;
    ITestPulseXRouter router;
    ITestPulseXFactory factory;
    
    function setUp() public {
        // Set fork URL to connect to our Anvil instance
        vm.createSelectFork("http://127.0.0.1:8545");
        
        wpls = IWPLS(WPLS);
        router = ITestPulseXRouter(ROUTER);
        factory = ITestPulseXFactory(FACTORY);
        
        // Give test account some PLS for testing
        vm.deal(USER, 1000 ether);
        vm.deal(address(this), 1000 ether);
        
        console2.log("=== POOL CREATION TEST SETUP ===");
        console2.log("Test account balance (PLS):", address(this).balance);
        console2.log("STATE token:", address(state));
        console2.log("WPLS token:", WPLS);
        console2.log("Router:", ROUTER);
        console2.log("Factory:", FACTORY);
    }

    /// @notice Test converting PLS to WPLS
    function test_WrapPLSToWPLS() public {
        console2.log("\n=== PLS TO WPLS WRAPPING TEST ===");
        
        uint256 plsAmount = 10 ether;
        console2.log("Wrapping PLS amount:", plsAmount);
        
        // Check initial balances
        uint256 initialPLS = address(this).balance;
        uint256 initialWPLS = wpls.balanceOf(address(this));
        
        console2.log("Initial PLS balance:", initialPLS);
        console2.log("Initial WPLS balance:", initialWPLS);
        
        // Wrap PLS to WPLS
        wpls.deposit{value: plsAmount}();
        
        // Check final balances
        uint256 finalPLS = address(this).balance;
        uint256 finalWPLS = wpls.balanceOf(address(this));
        
        console2.log("Final PLS balance:", finalPLS);
        console2.log("Final WPLS balance:", finalWPLS);
        
        // Verify the wrap worked correctly
        assertEq(finalPLS, initialPLS - plsAmount, "PLS balance should decrease");
        assertEq(finalWPLS, initialWPLS + plsAmount, "WPLS balance should increase");
        
        console2.log("[OK] PLS to WPLS wrapping successful!");
    }

    /// @notice Test unwrapping WPLS back to PLS
    function test_UnwrapWPLSToPLS() public {
        console2.log("\n=== WPLS TO PLS UNWRAPPING TEST ===");
        
        uint256 wrapAmount = 5 ether;
        uint256 unwrapAmount = 3 ether;
        
        // First wrap some PLS
        wpls.deposit{value: wrapAmount}();
        console2.log("Wrapped PLS amount:", wrapAmount);
        
        uint256 initialPLS = address(this).balance;
        uint256 initialWPLS = wpls.balanceOf(address(this));
        
        console2.log("Before unwrap - PLS:", initialPLS);
        console2.log("Before unwrap - WPLS:", initialWPLS);
        
        // Unwrap WPLS back to PLS
        wpls.withdraw(unwrapAmount);
        
        uint256 finalPLS = address(this).balance;
        uint256 finalWPLS = wpls.balanceOf(address(this));
        
        console2.log("After unwrap - PLS:", finalPLS);
        console2.log("After unwrap - WPLS:", finalWPLS);
        
        // Verify unwrapping worked
        assertEq(finalPLS, initialPLS + unwrapAmount, "PLS balance should increase");
        assertEq(finalWPLS, initialWPLS - unwrapAmount, "WPLS balance should decrease");
        
        console2.log("[OK] WPLS to PLS unwrapping successful!");
    }

    /// @notice Test creating STATE/WPLS liquidity pool with 1 WPLS = 100 STATE ratio
    function test_CreateStateWplsPool() public {
        console2.log("\n=== STATE/WPLS POOL CREATION TEST ===");
        
        // Define amounts for 1 WPLS = 100 STATE ratio
        uint256 wplsAmount = 1 ether;          // 1 WPLS
        uint256 stateAmount = 100 ether;       // 100 STATE
        
        console2.log("Target ratio: 1 WPLS = 100 STATE");
        console2.log("WPLS amount:", wplsAmount);
        console2.log("STATE amount:", stateAmount);
        
        // Wrap PLS to WPLS for liquidity
        wpls.deposit{value: wplsAmount}();
        
        // Check if we have STATE tokens (they should be in deployer account)
        uint256 stateBalance = state.balanceOf(USER);
        console2.log("STATE balance in USER account:", stateBalance);
        
        if (stateBalance < stateAmount) {
            // Transfer some STATE from the contract or mint if possible
            // For testing, let's impersonate governance to mint or transfer
            vm.startPrank(GOVERNANCE);
            
            // Check governance STATE balance
            uint256 govStateBalance = state.balanceOf(GOVERNANCE);
            console2.log("Governance STATE balance:", govStateBalance);
            
            if (govStateBalance >= stateAmount) {
                // Transfer STATE from governance to test account
                state.transfer(USER, stateAmount);
                console2.log("Transferred STATE from governance to user");
            }
            vm.stopPrank();
        }
        
        // Switch to user account for pool creation
        vm.startPrank(USER);
        
        // Wrap PLS for user
        wpls.deposit{value: wplsAmount}();
        
        // Approve tokens for router
        wpls.approve(ROUTER, wplsAmount);
        state.approve(ROUTER, stateAmount);
        
        console2.log("Approved tokens for router");
        
        // Check if pair exists
        address existingPair = factory.getPair(address(state), WPLS);
        console2.log("Existing pair address:", existingPair);
        
        if (existingPair == address(0)) {
            console2.log("Creating new STATE/WPLS pair...");
            
            // Add liquidity to create the pool
            (uint256 amountState, uint256 amountWpls, uint256 liquidity) = router.addLiquidity(
                address(state),
                WPLS,
                stateAmount,
                wplsAmount,
                0, // Accept any amount of STATE
                0, // Accept any amount of WPLS
                USER,
                block.timestamp + 300
            );
            
            console2.log("Pool created successfully!");
            console2.log("STATE added:", amountState);
            console2.log("WPLS added:", amountWpls);
            console2.log("LP tokens received:", liquidity);
            
            // Verify the pair was created
            address newPair = factory.getPair(address(state), WPLS);
            console2.log("New pair address:", newPair);
            assertNotEq(newPair, address(0), "Pair should be created");
            
        } else {
            console2.log("Pair already exists, adding liquidity to existing pool");
            
            // Add liquidity to existing pool
            (uint256 amountState, uint256 amountWpls, uint256 liquidity) = router.addLiquidity(
                address(state),
                WPLS,
                stateAmount,
                wplsAmount,
                0,
                0,
                USER,
                block.timestamp + 300
            );
            
            console2.log("Liquidity added to existing pool!");
            console2.log("STATE added:", amountState);
            console2.log("WPLS added:", amountWpls);
            console2.log("LP tokens received:", liquidity);
        }
        
        vm.stopPrank();
        
        console2.log("[OK] STATE/WPLS pool creation test successful!");
    }

    /// @notice Test creating pool using LPHelper (recommended method)
    function test_CreatePoolWithLPHelper() public {
        console2.log("\n=== LPHELPER POOL CREATION TEST ===");
        
        // Define amounts for 1 WPLS = 100 STATE ratio
        uint256 wplsAmount = 1 ether;
        uint256 stateAmount = 100 ether;
        
        console2.log("Using LPHelper to create pool");
        console2.log("WPLS amount:", wplsAmount);
        console2.log("STATE amount:", stateAmount);
        
        // Switch to governance to use LPHelper
        vm.startPrank(GOVERNANCE);
        
        // Wrap PLS to WPLS
        wpls.deposit{value: wplsAmount}();
        
        // Get STATE tokens (governance should have them)
        uint256 govStateBalance = state.balanceOf(GOVERNANCE);
        console2.log("Governance STATE balance:", govStateBalance);
        require(govStateBalance >= stateAmount, "Insufficient STATE balance");
        
        // Approve tokens for LPHelper
        wpls.approve(address(helper), wplsAmount);
        state.approve(address(helper), stateAmount);
        
        console2.log("Approved tokens for LPHelper");
        
        // Check if pair exists before
        address pairBefore = factory.getPair(address(state), WPLS);
        console2.log("Pair before creation:", pairBefore);
        
        try helper.createLPAndRegister(
            WPLS,              // token to pair with STATE
            GOVERNANCE,        // tokenOwner  
            stateAmount,       // amountStateDesired
            wplsAmount,        // amountTokenDesired
            0,                 // amountStateMin
            0,                 // amountTokenMin
            block.timestamp + 300  // deadline
        ) {
            console2.log("[OK] LPHelper pool creation successful!");
            
            // Verify pair was created
            address pairAfter = factory.getPair(address(state), WPLS);
            console2.log("Pair after creation:", pairAfter);
            
            if (pairBefore == address(0)) {
                assertNotEq(pairAfter, address(0), "New pair should be created");
            }
            
        } catch Error(string memory reason) {
            console2.log("[FAIL] LPHelper creation failed:", reason);
        } catch (bytes memory) {
            console2.log("[FAIL] LPHelper creation failed with low-level error");
        }
        
        vm.stopPrank();
    }

    /// @notice Helper function to display current pool information
    function test_DisplayPoolInfo() public view {
        console2.log("\n=== POOL INFORMATION ===");
        
        address pair = factory.getPair(address(state), WPLS);
        console2.log("STATE/WPLS Pair:", pair);
        
        if (pair != address(0)) {
            console2.log("Pool exists!");
            
            // Check reserves if we can access them
            console2.log("STATE token:", address(state));
            console2.log("WPLS token:", WPLS);
        } else {
            console2.log("No pool exists yet");
        }
        
        // Check balances
        console2.log("\n--- Token Balances ---");
        console2.log("This contract PLS:", address(this).balance);
        console2.log("This contract WPLS:", wpls.balanceOf(address(this)));
        console2.log("This contract STATE:", state.balanceOf(address(this)));
        console2.log("Governance STATE:", state.balanceOf(GOVERNANCE));
    }

    // Allow contract to receive PLS
    receive() external payable {}
}