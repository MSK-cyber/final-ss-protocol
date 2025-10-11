// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "forge-std/console2.sol";

// Simple test contract to verify DAV expiration logic without full setup
contract DavExpirationLogicTest is Test {
    // Replicating the DAV expiration constants and logic
    uint256 constant DAV_TOKEN_EXPIRE = 2 days;
    
    struct MintBatch {
        uint256 amount;
        uint256 timestamp;
        bool fromGovernance;
    }
    
    mapping(address => MintBatch[]) public mintBatches;
    mapping(address => uint256) public balances;
    address public governance = makeAddr("governance");
    address public user1 = makeAddr("user1");
    
    function setUp() public {
        console2.log("=== DAV EXPIRATION LOGIC TEST ===");
    }
    
    function getActiveBalance(address user) public view returns (uint256) {
        // Governance exemption: treat all DAV as active for gating/UX flows
        if (user == governance) {
            return balances[user];
        }
        MintBatch[] storage batches = mintBatches[user];
        uint256 active = 0;
        for (uint256 i = 0; i < batches.length; i++) {
            if (block.timestamp <= batches[i].timestamp + DAV_TOKEN_EXPIRE) {
                active += batches[i].amount;
            }
        }
        return active;
    }
    
    function _addMintBatch(address user, uint256 amount, uint256 timestamp) internal {
        mintBatches[user].push(MintBatch(amount, timestamp, user == governance));
        balances[user] += amount;
    }
    
    function testDavExpirationLogic() public {
        console2.log("\n=== TESTING DAV EXPIRATION LOGIC ===");
        console2.log("Scenario: 8 DAV total, 5 expired, 3 active");
        
        uint256 startTime = block.timestamp;
        
        console2.log("\n--- Phase 1: Mint 5 DAV tokens (these will expire) ---");
        // Simulate minting 5 DAV at initial time
        _addMintBatch(user1, 5e18, startTime);
        
        uint256 totalDav1 = balances[user1];
        uint256 activeDav1 = getActiveBalance(user1);
        
        console2.log("First mint time:", startTime);
        console2.log("Total DAV after first mint:", totalDav1 / 1e18);
        console2.log("Active DAV after first mint:", activeDav1 / 1e18);
        
        // Verify first mint is working correctly
        assertEq(totalDav1 / 1e18, 5, "Should have 5 total DAV after first mint");
        assertEq(activeDav1 / 1e18, 5, "Should have 5 active DAV after first mint");
        
        console2.log("\n--- Phase 2: Advance time by 3 days (more than 2 days expiry) ---");
        vm.warp(startTime + 3 days);
        console2.log("Time advanced by 3 days");
        console2.log("Current timestamp:", block.timestamp);
        console2.log("First batch should be expired now...");
        
        // Check DAV after time advancement (first batch should be expired)
        uint256 totalDavAfterTime = balances[user1];
        uint256 activeDavAfterTime = getActiveBalance(user1);
        
        console2.log("Total DAV after time advance:", totalDavAfterTime / 1e18);
        console2.log("Active DAV after time advance:", activeDavAfterTime / 1e18);
        
        // After 3 days, the first batch should be expired (2 days expiry)
        assertEq(totalDavAfterTime / 1e18, 5, "Should still have 5 total DAV");
        assertEq(activeDavAfterTime / 1e18, 0, "Should have 0 active DAV (all expired)");
        
        console2.log("\n--- Phase 3: Mint 3 more DAV tokens (these will be active) ---");
        uint256 secondMintTime = block.timestamp;
        _addMintBatch(user1, 3e18, secondMintTime);
        
        uint256 totalDavFinal = balances[user1];
        uint256 activeDavFinal = getActiveBalance(user1);
        
        console2.log("\n--- Final Results ---");
        console2.log("Second mint time:", secondMintTime);
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
        
        // Test edge cases
        console2.log("\n--- Phase 4: Test edge case (1.9 days advance from second mint) ---");
        vm.warp(secondMintTime + 1.9 days);
        
        uint256 activeDavEdge = getActiveBalance(user1);
        console2.log("Active DAV after 1.9 more days:", activeDavEdge / 1e18);
        assertEq(activeDavEdge / 1e18, 3, "Should still have 3 active DAV");
        
        // Now advance past the 2-day expiry for second batch
        console2.log("\n--- Phase 5: Expire second batch too ---");
        vm.warp(secondMintTime + 2.1 days); // Total 2.1 days for second batch
        
        uint256 activeDavAllExpired = getActiveBalance(user1);
        console2.log("Active DAV after all expired:", activeDavAllExpired / 1e18);
        assertEq(activeDavAllExpired / 1e18, 0, "Should have 0 active DAV (all expired)");
        
        // Test exact boundary
        console2.log("\n--- Phase 6: Test exact 2-day boundary ---");
        uint256 thirdMintTime = block.timestamp;
        _addMintBatch(user1, 1e18, thirdMintTime);
        
        // At exactly 2 days
        vm.warp(thirdMintTime + 2 days);
        uint256 activeDavBoundary = getActiveBalance(user1);
        console2.log("Active DAV at exactly 2 days:", activeDavBoundary / 1e18);
        assertEq(activeDavBoundary / 1e18, 1, "Should have 1 active DAV at exactly 2 days");
        
        // At 2 days + 1 second (expired)
        vm.warp(thirdMintTime + 2 days + 1);
        uint256 activeDavExpired = getActiveBalance(user1);
        console2.log("Active DAV at 2 days + 1 second:", activeDavExpired / 1e18);
        assertEq(activeDavExpired / 1e18, 0, "Should have 0 active DAV after 2 days");
        
        console2.log("\n=== DAV EXPIRATION TEST COMPLETED SUCCESSFULLY ===");
    }
    
    function testDavGovernanceExemption() public {
        console2.log("\n=== TESTING DAV GOVERNANCE EXPIRATION EXEMPTION ===");
        
        uint256 startTime = block.timestamp;
        
        // Add DAV tokens for governance
        _addMintBatch(governance, 2e18, startTime);
        
        uint256 totalDav = balances[governance];
        uint256 activeDav = getActiveBalance(governance);
        
        console2.log("Governance DAV (before time advance):");
        console2.log("- Total:", totalDav / 1e18);
        console2.log("- Active:", activeDav / 1e18);
        
        // Advance time by 5 days (well past 2-day expiry)
        vm.warp(startTime + 5 days);
        
        uint256 totalDavAfter = balances[governance];
        uint256 activeDavAfter = getActiveBalance(governance);
        
        console2.log("Governance DAV (after 5 days):");
        console2.log("- Total:", totalDavAfter / 1e18);
        console2.log("- Active:", activeDavAfter / 1e18);
        
        // Governance should be exempt from expiration
        assertEq(totalDavAfter / 1e18, 2, "Governance should have 2 total DAV");
        assertEq(activeDavAfter / 1e18, 2, "Governance should have 2 active DAV (exempt from expiration)");
        
        console2.log("Governance expiration exemption working correctly!");
    }
    
    function testAuctionParticipationScenario() public {
        console2.log("\n=== TESTING AUCTION PARTICIPATION SCENARIO ===");
        console2.log("User has 8 DAV: 5 expired, 3 active - should be able to participate with 3 DAV only");
        
        uint256 startTime = block.timestamp;
        
        // Mint 5 DAV that will expire
        _addMintBatch(user1, 5e18, startTime);
        
        // Advance time by 3 days
        vm.warp(startTime + 3 days);
        
        // Mint 3 more DAV that will be active
        _addMintBatch(user1, 3e18, block.timestamp);
        
        uint256 totalDav = balances[user1];
        uint256 activeDav = getActiveBalance(user1);
        
        console2.log("Total DAV:", totalDav / 1e18);
        console2.log("Active DAV:", activeDav / 1e18);
        
        // Simulate airdrop calculation (10,000 tokens per active DAV)
        uint256 airdropAmount = (activeDav * 10000e18) / 1e18;
        console2.log("Airdrop amount based on active DAV:", airdropAmount / 1e18);
        
        assertEq(totalDav / 1e18, 8, "Should have 8 total DAV");
        assertEq(activeDav / 1e18, 3, "Should have 3 active DAV");
        assertEq(airdropAmount / 1e18, 30000, "Should get 30,000 tokens in airdrop");
        
        console2.log("Auction participation logic working correctly!");
        console2.log("- User can claim airdrop for 3 active DAV only");
        console2.log("- Airdrop amount: 30,000 tokens (3 * 10,000)");
        console2.log("- Expired DAV does not count towards auction participation");
    }
}