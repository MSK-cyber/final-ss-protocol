import { ethers } from "ethers";
import { createContext, useEffect, useState } from "react";
// Import ABIs to re-instantiate contracts at resolved on-chain addresses (fresh)
import DavTokenABI from "../ABI/DavToken.json";
import StateTokenABI from "../ABI/StateToken.json";
import PropTypes from "prop-types";
import {
  getContractConfigs,
  setChainId,
  isChainSupported,
} from "../Constants/ContractConfig";
import { CHAIN_IDS, getContractAddresses } from "../Constants/ContractAddresses";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { getRuntimeConfigSync } from "../Constants/RuntimeConfig";

const ContractContext = createContext(null);

export const ContractProvider = ({ children }) => {
  ContractProvider.propTypes = {
    children: PropTypes.node.isRequired,
  };

  const { isConnected, address } = useAccount();
  const chainId = useChainId();
  const { data: walletClient } = useWalletClient();

  const [loading, setLoading] = useState(true);
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [account, setAccount] = useState(null);
  const [AllContracts, setContracts] = useState({});

  useEffect(() => {
    // Always initialize contracts so the app works in read-only mode even without a wallet
    let desiredChainId = isChainSupported(chainId) ? chainId : CHAIN_IDS.PULSECHAIN;

    // If the chain is "supported" but we don't have core contract addresses, fallback to PulseChain
    try {
      const addresses = getContractAddresses(desiredChainId);
      if (!addresses?.AUCTION || !addresses?.DAV_TOKEN || !addresses?.STATE_TOKEN) {
        if (desiredChainId !== CHAIN_IDS.PULSECHAIN) {
          console.warn(`No core contracts configured for chain ${desiredChainId}. Falling back to PulseChain.`);
        }
        desiredChainId = CHAIN_IDS.PULSECHAIN;
      }
    } catch {}

    if (!isChainSupported(chainId)) {
      console.warn(`Connected chain ${chainId} is not supported. Falling back to PulseChain.`);
    }
    setChainId(desiredChainId);

    initializeContracts();
    // Re-init on wallet connect/disconnect, chain changes, or wallet client changes
  }, [isConnected, address, chainId, walletClient]);
  const initializeContracts = async () => {
    try {
      setLoading(true);
  // Resolve a reliable read RPC URL from runtime config
      const runtimeCfg = getRuntimeConfigSync();
      const fallbackRpcUrl = runtimeCfg?.network?.rpcUrl || "https://rpc.pulsechain.com";

      // Build an EIP-1193 provider from available sources (walletClient or window.ethereum)
      let browserProvider = null;
      let signer = null;
      let userAddress = null;
      try {
        // Prefer walletClient if available (viem wallet client implements request and works as EIP-1193)
        if (walletClient && typeof walletClient.request === "function") {
          browserProvider = new ethers.BrowserProvider(walletClient);
        } else if (walletClient?.transport && typeof walletClient.transport.request === "function") {
          browserProvider = new ethers.BrowserProvider(walletClient.transport);
        } else if (typeof window !== "undefined" && window.ethereum) {
          browserProvider = new ethers.BrowserProvider(window.ethereum);
        }
        // Try to get signer only if we have a browser provider and a connected wallet
        if (browserProvider && isConnected) {
          signer = await browserProvider.getSigner().catch(() => null);
          if (signer) {
            userAddress = await signer.getAddress().catch(() => null);
          }
        }
      } catch (provErr) {
        console.warn("BrowserProvider not available or signer not accessible; continuing in read-only mode.", provErr);
      }

      // Always have a read-only provider as a fallback (PulseChain)
      const readOnlyProvider = new ethers.JsonRpcProvider(fallbackRpcUrl);

      // Determine the active chain we intend to use for contracts
      let activeChainId = isChainSupported(chainId) ? chainId : CHAIN_IDS.PULSECHAIN;
      try {
        const addrs = getContractAddresses(activeChainId);
        if (!addrs?.AUCTION || !addrs?.DAV_TOKEN || !addrs?.STATE_TOKEN) {
          activeChainId = CHAIN_IDS.PULSECHAIN;
        }
      } catch {}

      // Only use signer for contracts if the wallet is on the active chain; otherwise use read-only provider
      const execProvider = (signer && chainId === activeChainId) ? signer : readOnlyProvider;

      const contractInstances = Object.fromEntries(
        Object.entries(getContractConfigs()).map(([key, { address, abi }]) => {
          if (!address) return [key, null];
          try {
            return [key, new ethers.Contract(address, abi, execProvider)];
          } catch (e) {
            console.warn(`Contract init failed for ${key} at ${address}`);
            return [key, null];
          }
        })
      );

      // Resolve DAV/STATE from on-chain Auction (SWAP) contract to avoid stale config
      try {
        const swap = contractInstances.AuctionContract;
        if (swap) {
          const [onChainDav, onChainState, onChainAirdrop] = await Promise.all([
            swap.dav?.().catch(() => null),
            swap.stateToken?.().catch(() => null),
            swap.airdropDistributor?.().catch(() => null),
          ]);

          if (onChainDav && ethers.isAddress(onChainDav)) {
            contractInstances.davContract = new ethers.Contract(
              onChainDav,
              DavTokenABI,
              execProvider
            );
            // Stash resolved address for consumers that need raw values
            contractInstances._davAddress = onChainDav;
          }
          if (onChainState && ethers.isAddress(onChainState)) {
            contractInstances.stateContract = new ethers.Contract(
              onChainState,
              StateTokenABI,
              execProvider
            );
            contractInstances._stateAddress = onChainState;
          }
          if (onChainAirdrop && ethers.isAddress(onChainAirdrop) && onChainAirdrop !== ethers.ZeroAddress) {
            // Prefer the distributor address configured on-chain over static config
            contractInstances.airdropDistributor = new ethers.Contract(
              onChainAirdrop,
              (await import("../ABI/AirdropDistributor.json")).default,
              execProvider
            );
            contractInstances._airdropDistributorAddress = onChainAirdrop;
          } else if (contractInstances.airdropDistributor) {
            // Keep the static config instance if on-chain resolution failed
            console.log("Using static airdropDistributor config (on-chain resolution failed or returned zero address)");
          }
        }
      } catch (e) {
        console.warn("Failed to resolve on-chain DAV/STATE addresses from Auction contract", e);
      }

      try {
        console.debug("Contract initialization complete:", {
          account: userAddress || "read-only",
          auction: contractInstances?.AuctionContract?.target,
          dav: contractInstances?.davContract?.target,
          state: contractInstances?.stateContract?.target,
          mode: signer ? "signer" : "read-only",
        });
      } catch {}

  // Expose the read-only provider for consistent reads (even if a signer exists on another chain)
  setProvider(readOnlyProvider);
      setSigner(signer || null);
      setAccount(userAddress || null);
      setContracts(contractInstances);
    } catch (err) {
      console.error("Failed to initialize contracts:", err);
    } finally {
      setLoading(false);
    }
  };


  const contracts = {
    state: AllContracts.stateContract,
    dav: AllContracts.davContract,
    Fluxin: AllContracts.FluxinContract,
    Xerion: AllContracts.XerionContract,
    // Admin-only extras
    auction: AllContracts.AuctionContract,
    swapLens: AllContracts.swapLens,
    lpHelper: AllContracts.lpHelper,
    liquidityManager: AllContracts.liquidityManager,
    buyBurnController: AllContracts.buyBurnController,
    auctionMetrics: AllContracts.auctionMetrics,
  airdropDistributor: AllContracts.airdropDistributor,
    // Expose resolved addresses when available (ethers v6 Contract.target also works)
    addresses: {
      dav: AllContracts?._davAddress || AllContracts?.davContract?.target,
      state: AllContracts?._stateAddress || AllContracts?.stateContract?.target,
      airdropDistributor: AllContracts?._airdropDistributorAddress || AllContracts?.airdropDistributor?.target,
    },
  };

  return (
    <ContractContext.Provider
      value={{ loading, provider, signer, account, AllContracts, contracts }}
    >
      {children}
    </ContractContext.Provider>
  );
};

export { ContractContext };
