/**
 * Contract Connection Diagnostic Tool
 * Tests all contract connections and reports any issues
 */

import { ethers } from "ethers";
import { getContractAddresses, CHAIN_IDS } from "../Constants/ContractAddresses";
import { getContractConfigs } from "../Constants/ContractConfig";
import { getRuntimeConfigSync } from "../Constants/RuntimeConfig";

export const runDiagnostics = async () => {
  const results = {
    timestamp: new Date().toISOString(),
    chainId: CHAIN_IDS.PULSECHAIN,
    rpcUrl: null,
    rpcConnection: null,
    contracts: {},
    summary: {
      total: 0,
      connected: 0,
      failed: 0,
      warnings: 0,
    },
  };

  console.group("🔍 Contract Connection Diagnostics");

  try {
    // 1. Test RPC Connection
    console.group("1️⃣ Testing RPC Connection");
    const runtimeCfg = getRuntimeConfigSync();
    results.rpcUrl = runtimeCfg?.network?.rpcUrl || "https://rpc.pulsechain.com";
    
    try {
      const provider = new ethers.JsonRpcProvider(results.rpcUrl);
      const network = await provider.getNetwork();
      const blockNumber = await provider.getBlockNumber();
      
      results.rpcConnection = {
        status: "✅ Connected",
        chainId: Number(network.chainId),
        blockNumber,
        rpcUrl: results.rpcUrl,
      };
      console.log("✅ RPC Connected:", results.rpcConnection);
    } catch (error) {
      results.rpcConnection = {
        status: "❌ Failed",
        error: error.message,
        rpcUrl: results.rpcUrl,
      };
      console.error("❌ RPC Connection Failed:", error);
    }
    console.groupEnd();

    // 2. Test Contract Addresses
    console.group("2️⃣ Testing Contract Addresses");
    const addresses = getContractAddresses(CHAIN_IDS.PULSECHAIN);
    const configs = getContractConfigs();

    const contractTests = [
      { name: "DAV_TOKEN", key: "davContract", address: addresses.DAV_TOKEN },
      { name: "STATE_TOKEN", key: "stateContract", address: addresses.STATE_TOKEN },
      { name: "AUCTION", key: "AuctionContract", address: addresses.AUCTION },
      { name: "SWAP_LENS", key: "swapLens", address: addresses.SWAP_LENS },
      { name: "LP_HELPER", key: "lpHelper", address: addresses.LP_HELPER },
      { name: "LIQUIDITY_MANAGER", key: "liquidityManager", address: addresses.LIQUIDITY_MANAGER },
      { name: "BUY_BURN_CONTROLLER", key: "buyBurnController", address: addresses.BUY_BURN_CONTROLLER },
      { name: "AUCTION_METRICS", key: "auctionMetrics", address: addresses.AUCTION_METRICS },
      { name: "AIRDROP_DISTRIBUTOR", key: "airdropDistributor", address: addresses.AIRDROP_DISTRIBUTOR },
      { name: "AUCTION_ADMIN", key: "auctionAdmin", address: addresses.AUCTION_ADMIN },
    ];

    for (const test of contractTests) {
      results.summary.total++;
      const contractResult = {
        address: test.address,
        hasAddress: !!test.address && test.address !== "",
        hasABI: !!configs[test.key]?.abi,
        abiLength: configs[test.key]?.abi?.length || 0,
        isDeployed: false,
        onChainCode: null,
        testCall: null,
      };

      // Check if address is valid
      if (!contractResult.hasAddress) {
        contractResult.status = "⚠️ No Address";
        results.summary.warnings++;
        console.warn(`⚠️ ${test.name}: No address configured`);
      } else if (!ethers.isAddress(test.address)) {
        contractResult.status = "❌ Invalid Address";
        results.summary.failed++;
        console.error(`❌ ${test.name}: Invalid address format`);
      } else if (!contractResult.hasABI) {
        contractResult.status = "⚠️ No ABI";
        results.summary.warnings++;
        console.warn(`⚠️ ${test.name}: No ABI configured`);
      } else if (results.rpcConnection?.status === "✅ Connected") {
        // Test on-chain connection
        try {
          const provider = new ethers.JsonRpcProvider(results.rpcUrl);
          const code = await provider.getCode(test.address);
          contractResult.onChainCode = code.length > 2; // "0x" means no contract
          contractResult.isDeployed = code.length > 2;

          if (!contractResult.isDeployed) {
            contractResult.status = "❌ Not Deployed";
            results.summary.failed++;
            console.error(`❌ ${test.name}: Contract not deployed at ${test.address}`);
          } else {
            // Try a simple read call
            const contract = new ethers.Contract(
              test.address,
              configs[test.key].abi,
              provider
            );

            // Try common view functions
            const testFunctions = ["owner", "paused", "totalSupply", "tokenCount", "dav", "stateToken"];
            let callSuccess = false;

            for (const fn of testFunctions) {
              if (typeof contract[fn] === "function") {
                try {
                  const result = await contract[fn]();
                  contractResult.testCall = {
                    function: fn,
                    result: result?.toString?.() || String(result),
                  };
                  callSuccess = true;
                  break;
                } catch (e) {
                  // Try next function
                }
              }
            }

            if (callSuccess) {
              contractResult.status = "✅ Connected";
              results.summary.connected++;
              console.log(
                `✅ ${test.name}: Connected (${test.address})`,
                contractResult.testCall
              );
            } else {
              contractResult.status = "⚠️ Deployed (no test call succeeded)";
              results.summary.warnings++;
              console.warn(
                `⚠️ ${test.name}: Deployed but test calls failed (${test.address})`
              );
            }
          }
        } catch (error) {
          contractResult.status = "❌ RPC Error";
          contractResult.error = error.message;
          results.summary.failed++;
          console.error(`❌ ${test.name}: RPC error:`, error);
        }
      }

      results.contracts[test.name] = contractResult;
    }
    console.groupEnd();

    // 3. Test Cross-Contract References
    console.group("3️⃣ Testing Cross-Contract References");
    if (results.contracts.AUCTION?.status === "✅ Connected") {
      try {
        const provider = new ethers.JsonRpcProvider(results.rpcUrl);
        const auctionContract = new ethers.Contract(
          addresses.AUCTION,
          configs.AuctionContract.abi,
          provider
        );

        const [onChainDav, onChainState, onChainAirdrop] = await Promise.all([
          auctionContract.dav().catch(() => null),
          auctionContract.stateToken().catch(() => null),
          auctionContract.airdropDistributor().catch(() => null),
        ]);

        results.crossReferences = {
          dav: {
            configured: addresses.DAV_TOKEN,
            onChain: onChainDav,
            match: onChainDav?.toLowerCase() === addresses.DAV_TOKEN?.toLowerCase(),
          },
          state: {
            configured: addresses.STATE_TOKEN,
            onChain: onChainState,
            match: onChainState?.toLowerCase() === addresses.STATE_TOKEN?.toLowerCase(),
          },
          airdrop: {
            configured: addresses.AIRDROP_DISTRIBUTOR,
            onChain: onChainAirdrop,
            match: onChainAirdrop?.toLowerCase() === addresses.AIRDROP_DISTRIBUTOR?.toLowerCase(),
          },
        };

        console.log("Cross-references:", results.crossReferences);

        if (!results.crossReferences.dav.match) {
          console.error(
            "❌ DAV address mismatch! Configured:",
            addresses.DAV_TOKEN,
            "On-chain:",
            onChainDav
          );
        }
        if (!results.crossReferences.state.match) {
          console.error(
            "❌ STATE address mismatch! Configured:",
            addresses.STATE_TOKEN,
            "On-chain:",
            onChainState
          );
        }
        if (!results.crossReferences.airdrop.match) {
          console.warn(
            "⚠️ AIRDROP address mismatch! Configured:",
            addresses.AIRDROP_DISTRIBUTOR,
            "On-chain:",
            onChainAirdrop
          );
        }
      } catch (error) {
        console.error("❌ Cross-reference test failed:", error);
      }
    }
    console.groupEnd();

    // 4. Summary
    console.group("📊 Summary");
    console.log("Total contracts tested:", results.summary.total);
    console.log("✅ Connected:", results.summary.connected);
    console.log("⚠️ Warnings:", results.summary.warnings);
    console.log("❌ Failed:", results.summary.failed);
    
    const healthScore = (results.summary.connected / results.summary.total) * 100;
    results.summary.healthScore = healthScore.toFixed(1) + "%";
    console.log("Health Score:", results.summary.healthScore);
    
    if (healthScore === 100) {
      console.log("🎉 All contracts are properly connected!");
    } else if (healthScore >= 80) {
      console.log("✅ Most contracts connected, some warnings");
    } else if (healthScore >= 50) {
      console.log("⚠️ Partial connectivity, several issues");
    } else {
      console.log("❌ Critical: Most contracts are disconnected!");
    }
    console.groupEnd();

  } catch (error) {
    console.error("Fatal diagnostic error:", error);
    results.fatalError = error.message;
  }

  console.groupEnd();
  return results;
};

export const printSimpleDiagnostics = (results) => {
  console.log("\n========================================");
  console.log("CONTRACT CONNECTION REPORT");
  console.log("========================================");
  console.log(`Timestamp: ${results.timestamp}`);
  console.log(`RPC: ${results.rpcConnection?.status || "Not tested"}`);
  console.log(`Health Score: ${results.summary.healthScore}`);
  console.log("----------------------------------------");
  
  Object.entries(results.contracts).forEach(([name, data]) => {
    const status = data.status || "Unknown";
    console.log(`${status} ${name}`);
    if (data.status?.includes("❌") || data.status?.includes("⚠️")) {
      console.log(`  └─ Address: ${data.address || "None"}`);
      if (data.error) console.log(`  └─ Error: ${data.error}`);
    }
  });
  
  console.log("========================================\n");
};
