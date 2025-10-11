// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";
import {DAV_V3} from "../src/DavToken.sol";
import {STATE_V3} from "../src/StateToken.sol";
import {BuyAndBurnController_V2} from "../src/BuyAndBurnController_V2.sol";

contract DavExpirationTest is Test {
    DAV_V3 public dav;
    STATE_V3 public state;
    BuyAndBurnController_V2 public buyBurnController;
    
    // Test accounts
    address public governance = makeAddr("governance");
    address public user1 = makeAddr("user1");
    address public recipient5percent = makeAddr("recipient5percent");
    
    uint256 constant INITIAL_BALANCE = 1000 ether;
    
    function setUp() public {
        // Give everyone PLS
        vm.deal(governance, INITIAL_BALANCE);
        vm.deal(user1, INITIAL_BALANCE);
        vm.deal(recipient5percent, INITIAL_BALANCE);
        
        vm.startPrank(governance);
        
        // Deploy STATE token first
        state = new STATE_V3("STATE", "STATE", recipient5percent, governance); // 5% to separate address, 95% to governance
        console2.log("STATE token deployed:", address(state));
        
        // For this test, we can use mock addresses for the buy and burn controller
        address mockWpls = makeAddr("mockWpls");
        address mockRouter = makeAddr("mockRouter");
        address mockFactory = makeAddr("mockFactory");
        address mockSwapVault = makeAddr("mockSwapVault");
        address mockSwap = makeAddr("mockSwap");
        
        // Deploy BuyAndBurnController (needed for DAV)
        buyBurnController = new BuyAndBurnController_V2(
            address(state),
            mockWpls,
            mockRouter,
            mockFactory,
            mockSwapVault,
            mockSwap
        );
        console2.log("BuyAndBurnController deployed:", address(buyBurnController));
        
        // Deploy DAV token
        dav = new DAV_V3(
            address(buyBurnController),
            address(state),
            governance,
            "pDAV",
            "pDAV"
        );
        console2.log("DAV token deployed:", address(dav));
        
        vm.stopPrank();
        
        console2.log("=== SETUP COMPLETE ===");
        console2.log("Governance balance:", governance.balance / 1e18, "PLS");
        console2.log("User1 balance:", user1.balance / 1e18, "PLS");
    }
    
    function testDavExpirationLogic() public {
        console2.log("\n=== TESTING DAV EXPIRATION LOGIC ===");
        console2.log("Scenario: 8 DAV total, 5 expired, 3 active");
        
        vm.startPrank(user1);
        
        console2.log("\n--- Phase 1: Mint 5 DAV tokens (these will expire) ---");
        uint256 cost1 = 2500 * 500e18; // 5 DAV * 500 PLS per DAV
        dav.mintDAV{value: cost1}(5e18, "");
        
        uint256 firstMintTime = block.timestamp;
        uint256 totalDav1 = dav.balanceOf(user1);
        uint256 activeDav1 = dav.getActiveBalance(user1);
        
        console2.log("First mint time:", firstMintTime);
        console2.log("Total DAV after first mint:", totalDav1 / 1e18);
        console2.log("Active DAV after first mint:", activeDav1 / 1e18);
        
        // Verify first mint is working correctly
        assertEq(totalDav1 / 1e18, 5, "Should have 5 total DAV after first mint");
        assertEq(activeDav1 / 1e18, 5, "Should have 5 active DAV after first mint");
        
        console2.log("\n--- Phase 2: Advance time by 3 days (more than 2 days expiry) ---");
        vm.warp(block.timestamp + 3 days);
        console2.log("Time advanced by 3 days");
        console2.log("Current timestamp:", block.timestamp);
        console2.log("First batch should be expired now...");
        
        // Check DAV after time advancement (first batch should be expired)
        uint256 totalDavAfterTime = dav.balanceOf(user1);
        uint256 activeDavAfterTime = dav.getActiveBalance(user1);
        
        console2.log("Total DAV after time advance:", totalDavAfterTime / 1e18);
        console2.log("Active DAV after time advance:", activeDavAfterTime / 1e18);
        
        // After 3 days, the first batch should be expired (2 days expiry)
        assertEq(totalDavAfterTime / 1e18, 5, "Should still have 5 total DAV");
        assertEq(activeDavAfterTime / 1e18, 0, "Should have 0 active DAV (all expired)");
        
        console2.log("\n--- Phase 3: Mint 3 more DAV tokens (these will be active) ---");
        uint256 cost2 = 1500 * 500e18; // 3 DAV * 500 PLS per DAV
        dav.mintDAV{value: cost2}(3e18, "");
        
        uint256 totalDavFinal = dav.balanceOf(user1);
        uint256 activeDavFinal = dav.getActiveBalance(user1);
        
        console2.log("\n--- Final Results ---");
        console2.log("Total DAV after second mint:", totalDavFinal / 1e18);
        console2.log("Active DAV after second mint:", activeDavFinal / 1e18);
        console2.log("Expected: 8 total, 3 active (5 expired)");
        
        // Final verification
        assertEq(totalDavFinal / 1e18, 8, "Should have 8 total DAV");
        assertEq(activeDavFinal / 1e18, 3, "Should have 3 active DAV");
        
        console2.log("\nDAV expiration logic working correctly!");
        console2.log("- Total DAV: 8");
        console2.log("- Active DAV: 3");
        console2.log("- Expired DAV: 5");
        
        // Test edge case: advance time by just under 2 days for second batch
        console2.log("\n--- Phase 4: Test edge case (1.9 days advance) ---");
        vm.warp(block.timestamp + 1.9 days);
        
        uint256 activeDavEdge = dav.getActiveBalance(user1);
        console2.log("Active DAV after 1.9 more days:", activeDavEdge / 1e18);
        assertEq(activeDavEdge / 1e18, 3, "Should still have 3 active DAV");
        
        // Now advance past the 2-day expiry for second batch
        console2.log("\n--- Phase 5: Expire second batch too ---");
        vm.warp(block.timestamp + 0.2 days); // Total 2.1 days for second batch
        
        uint256 activeDavAllExpired = dav.getActiveBalance(user1);
        console2.log("Active DAV after all expired:", activeDavAllExpired / 1e18);
        assertEq(activeDavAllExpired / 1e18, 0, "Should have 0 active DAV (all expired)");
        
        vm.stopPrank();
        
        console2.log("\n=== DAV EXPIRATION TEST COMPLETED SUCCESSFULLY ===");
    }
    
    function testDavGovernanceExemption() public {
        console2.log("\n=== TESTING DAV GOVERNANCE EXPIRATION EXEMPTION ===");
        
        vm.startPrank(governance);
        
        // Mint DAV tokens as governance
        uint256 cost = 1000 * 500e18; // 2 DAV * 500 PLS per DAV
        dav.mintDAV{value: cost}(2e18, "");
        
        uint256 totalDav = dav.balanceOf(governance);
        uint256 activeDav = dav.getActiveBalance(governance);
        
        console2.log("Governance DAV (before time advance):");
        console2.log("- Total:", totalDav / 1e18);
        console2.log("- Active:", activeDav / 1e18);
        
        // Advance time by 5 days (well past 2-day expiry)
        vm.warp(block.timestamp + 5 days);
        
        uint256 totalDavAfter = dav.balanceOf(governance);
        uint256 activeDavAfter = dav.getActiveBalance(governance);
        
        console2.log("Governance DAV (after 5 days):");
        console2.log("- Total:", totalDavAfter / 1e18);
        console2.log("- Active:", activeDavAfter / 1e18);
        
        // Governance should be exempt from expiration
        assertEq(totalDavAfter / 1e18, 2, "Governance should have 2 total DAV");
        assertEq(activeDavAfter / 1e18, 2, "Governance should have 2 active DAV (exempt from expiration)");
        
        vm.stopPrank();
        
        console2.log("Governance expiration exemption working correctly!");
    }
}