// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import {SWAP_V3} from "../src/AuctionSwap.sol";

/**
 * @title ContractSizeChecker
 * @notice Simple script to check contract deployment sizes
 */
contract ContractSizeChecker is Script {
    
    function run() external {
        // Deploy main contract to check size
        vm.startBroadcast();
        
        // Create a dummy deployment to get bytecode size
        SWAP_V3 swap = new SWAP_V3(address(0x123), address(0x456));
        uint256 codeSize = address(swap).code.length;
        
        vm.stopBroadcast();
        
        console2.log("=== CONTRACT SIZE ANALYSIS ===");
        console2.log("SWAP_V3 deployed bytecode size:", codeSize, "bytes");
        console2.log("EVM deployment limit:", 24576, "bytes (24KB)");
        
        if (codeSize <= 24576) {
            console2.log("CONTRACT SIZE OK - Under 24KB limit");
            console2.log("Remaining bytes:", 24576 - codeSize);
        } else {
            console2.log("CONTRACT TOO LARGE - Exceeds 24KB limit");
            console2.log("Excess bytes:", codeSize - 24576);
        }
        
        console2.log("Utilization:", (codeSize * 100) / 24576, "%");
    }
}