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
import { CHAIN_IDS } from "../Constants/ContractAddresses";
import { useAccount, useChainId, useWalletClient } from "wagmi";

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
    if (!isConnected || !address || !chainId || !walletClient) return;

    // check supported chain
    if (!isChainSupported(chainId)) {
      console.warn(
        `Connected chain ${chainId} is not supported. Using default chain.`
      );
      setChainId(CHAIN_IDS.PULSECHAIN);
    } else {
      setChainId(chainId);
    }

    initializeContracts();
  }, [isConnected, address, chainId, walletClient]);
  const initializeContracts = async () => {
    try {
      setLoading(true);

      if (!walletClient) {
        throw new Error("Wallet client not available");
      }

      // ✅ Correct: wrap wagmi's walletClient transport
      const browserProvider = new ethers.BrowserProvider(walletClient.transport);

      const signer = await browserProvider.getSigner();
      const userAddress = await signer.getAddress();

      const contractInstances = Object.fromEntries(
        Object.entries(getContractConfigs()).map(([key, { address, abi }]) => {
          if (!address) return [key, null];
          try {
            return [key, new ethers.Contract(address, abi, signer)];
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
              signer
            );
            // Stash resolved address for consumers that need raw values
            contractInstances._davAddress = onChainDav;
          }
          if (onChainState && ethers.isAddress(onChainState)) {
            contractInstances.stateContract = new ethers.Contract(
              onChainState,
              StateTokenABI,
              signer
            );
            contractInstances._stateAddress = onChainState;
          }
          if (onChainAirdrop && ethers.isAddress(onChainAirdrop)) {
            // Prefer the distributor address configured on-chain over static config
            contractInstances.airdropDistributor = new ethers.Contract(
              onChainAirdrop,
              (await import("../ABI/AirdropDistributor.json")).default,
              signer
            );
            contractInstances._airdropDistributorAddress = onChainAirdrop;
          }
        }
      } catch (e) {
        console.warn("Failed to resolve on-chain DAV/STATE addresses from Auction contract", e);
      }

      console.log("Detected providers:", window.ethereum?.providers);

      setProvider(browserProvider);
      setSigner(signer);
      setAccount(userAddress);
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
    boostedRedemption: AllContracts.boostedRedemption,
    reverseBurnRedemption: AllContracts.reverseBurnRedemption,
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
