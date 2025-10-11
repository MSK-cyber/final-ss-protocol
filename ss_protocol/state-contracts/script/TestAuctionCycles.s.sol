// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "forge-std/console.sol";

interface ISWAP_V3 {
    function getTodayToken() external view returns (address, bool);
    function isAuctionActive(address token) external view returns (bool);
    function burnTokensForState(address auctionToken) external;
    function swapTokens(address user, address inputToken) external;
}

interface IAirdropDistributor {
    function claim(address token) external;
}

interface IDAV_V3 {
    function mintDAV(uint256 amount, string memory referralCode) external payable;
    function balanceOf(address account) external view returns (uint256);
    function getActiveBalance(address account) external view returns (uint256);
}

interface IERC20 {
    function balanceOf(address) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

interface ISTATE_V3 {
    function balanceOf(address) external view returns (uint256);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract TestAuctionCycles is Script {
    // Deployed contract addresses (from previous deployment)
    address constant SWAP_V3 = 0x89ec9355b1Bcc964e576211c8B011BD709083f8d;
    address constant STATE_V3 = 0x72662E4da74278430123cE51405c1e7A1B87C294;
    address constant DAV_V3 = 0x52bad4A8584909895C22bdEcf8DBF33314468Fb0;
    address constant AIRDROP = 0x1B25157F05B25438441bF7CDe38A95A55ccf8E50;
    
    // Auction tokens
    address constant TOKEN1 = 0x734C334AE1a81Af53cDacF590dBe9ae6128DAcfF;
    address constant TOKEN2 = 0x9F122c79a426017DB59209f884b773C51241A21e;
    address constant TOKEN3 = 0xE67A2042A6F48Ad842a9682A01a6AeBcD5EB051a;
    
    ISWAP_V3 swap = ISWAP_V3(SWAP_V3);
    IAirdropDistributor airdrop = IAirdropDistributor(AIRDROP);
    IDAV_V3 dav = IDAV_V3(DAV_V3);
    ISTATE_V3 state = ISTATE_V3(STATE_V3);
    
    address user;
    
    function run() external {
        user = msg.sender; // Use the deployer as test user
        
        console.log("=== TESTING 10 AUCTION CYCLES ===");
        console.log("Test user:", user);
        console.log("User PLS balance:", user.balance / 1e18);
        
        vm.startBroadcast();
        
        // Test the auction for 10 cycles
        _testMultipleAuctionCycles();
        
        vm.stopBroadcast();
        
        console.log("\n=== AUCTION TESTING COMPLETED ===");
    }
    
    function _testMultipleAuctionCycles() internal {
        console.log("\n--- Starting 10 Auction Cycles ---");
        
        // Get current time and block for baseline
        uint256 startTime = block.timestamp;
        
        for (uint256 cycle = 1; cycle <= 10; cycle++) {
            console.log("\n=== AUCTION CYCLE", cycle, "===");
            
            // Advance to the correct day for this cycle
            uint256 cycleTime = startTime + (cycle - 1) * 1 days;
            vm.warp(cycleTime);
            
            // Determine which token should be active today
            address currentToken = _getTokenForCycle(cycle);
            
            console.log("Time:", block.timestamp);
            console.log("Expected token for cycle:", currentToken);
            
            // Check what the contract thinks is today's token
            try swap.getTodayToken() returns (address todayToken, bool isActive) {
                console.log("Contract says today's token:", todayToken);
                console.log("Auction active:", isActive);
                
                if (todayToken == address(0) || !isActive) {
                    console.log("No active auction today, skipping cycle", cycle);
                    continue;
                }
                
                // Participate in the auction
                bool success = _participateInAuction(cycle, todayToken);
                
                if (success) {
                    console.log("Cycle", cycle, "completed successfully");
                } else {
                    console.log("Cycle", cycle, "failed");
                }
            } catch Error(string memory reason) {
                console.log("getTodayToken failed:", reason);
                continue;
            } catch {
                console.log("getTodayToken failed with unknown error");
                continue;
            }
            
            // Show user balances after each cycle
            _showBalances();
        }
    }
    
    function _getTokenForCycle(uint256 cycle) internal pure returns (address) {
        // Token rotation: cycle 1,4,7,10 = TOKEN1, cycle 2,5,8 = TOKEN2, cycle 3,6,9 = TOKEN3
        uint256 tokenIndex = (cycle - 1) % 3;
        if (tokenIndex == 0) return TOKEN1;
        if (tokenIndex == 1) return TOKEN2;
        return TOKEN3;
    }
    
    function _participateInAuction(uint256 cycle, address auctionToken) internal returns (bool) {
        console.log("\n--- Participating in Auction ---");
        console.log("Cycle:", cycle);
        console.log("Token:", auctionToken);
        
        // Step 0: Mint DAV tokens for participation
        uint256 davToMint = 2 ether; // 2 DAV
        uint256 plsCost = davToMint * 500; // 500 PLS per DAV
        
        console.log("Minting DAV tokens...");
        console.log("DAV amount:", davToMint / 1e18);
        console.log("PLS cost:", plsCost / 1e18);
        
        try dav.mintDAV{value: plsCost}(davToMint, "") {
            console.log("DAV minted successfully");
        } catch {
            console.log("Failed to mint DAV");
            return false;
        }
        
        uint256 davBalance = dav.balanceOf(user);
        uint256 activeDav = dav.getActiveBalance(user);
        console.log("Total DAV balance:", davBalance / 1e18);
        console.log("Active DAV balance:", activeDav / 1e18);
        
        // Step 1: Claim airdrop
        console.log("\nSTEP 1: Claiming airdrop...");
        uint256 tokenBalanceBefore = IERC20(auctionToken).balanceOf(user);
        
        try airdrop.claim(auctionToken) {
            uint256 tokenBalanceAfter = IERC20(auctionToken).balanceOf(user);
            uint256 claimed = tokenBalanceAfter - tokenBalanceBefore;
            console.log("Airdrop SUCCESS - claimed", claimed / 1e18, "tokens");
        } catch Error(string memory reason) {
            console.log("Airdrop FAILED:", reason);
            return false;
        }
        
        // Step 2: Burn auction tokens for STATE
        console.log("\nSTEP 2: Burning tokens for STATE...");
        uint256 tokenBalance = IERC20(auctionToken).balanceOf(user);
        
        if (tokenBalance > 0) {
            // Approve the swap contract to spend auction tokens
            IERC20(auctionToken).approve(SWAP_V3, tokenBalance);
            console.log("Approved", tokenBalance / 1e18, "tokens for burning");
            
            uint256 stateBalanceBefore = state.balanceOf(user);
            
            try swap.burnTokensForState(auctionToken) {
                uint256 stateBalanceAfter = state.balanceOf(user);
                uint256 stateReceived = stateBalanceAfter - stateBalanceBefore;
                console.log("Burn SUCCESS - received", stateReceived / 1e18, "STATE");
            } catch Error(string memory reason) {
                console.log("Burn FAILED:", reason);
                return false;
            }
        } else {
            console.log("No tokens to burn");
            return false;
        }
        
        // Step 3: Swap STATE for auction tokens
        console.log("\nSTEP 3: Swapping STATE for tokens...");
        uint256 stateBalance = state.balanceOf(user);
        
        if (stateBalance > 0) {
            // Approve the swap contract to spend STATE tokens
            state.approve(SWAP_V3, stateBalance);
            console.log("Approved", stateBalance / 1e18, "STATE for swapping");
            
            uint256 tokenBalanceBeforeSwap = IERC20(auctionToken).balanceOf(user);
            
            try swap.swapTokens(user, auctionToken) {
                uint256 tokenBalanceAfter = IERC20(auctionToken).balanceOf(user);
                uint256 tokensReceived = tokenBalanceAfter - tokenBalanceBeforeSwap;
                console.log("Swap SUCCESS - received", tokensReceived / 1e18, "tokens");
                return true;
            } catch Error(string memory reason) {
                console.log("Swap FAILED:", reason);
                return false;
            }
        } else {
            console.log("No STATE to swap");
            return false;
        }
    }
    
    function _showBalances() internal view {
        console.log("\n--- Current Balances ---");
        console.log("PLS:", user.balance / 1e18);
        console.log("DAV:", dav.balanceOf(user) / 1e18);
        console.log("Active DAV:", dav.getActiveBalance(user) / 1e18);
        console.log("STATE:", state.balanceOf(user) / 1e18);
        console.log("Token1:", IERC20(TOKEN1).balanceOf(user) / 1e18);
        console.log("Token2:", IERC20(TOKEN2).balanceOf(user) / 1e18);
        console.log("Token3:", IERC20(TOKEN3).balanceOf(user) / 1e18);
    }
}