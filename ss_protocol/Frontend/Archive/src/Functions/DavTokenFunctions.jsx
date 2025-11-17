import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

import PropTypes from "prop-types";
import { ethers } from "ethers";
import { useAccount, useChainId } from "wagmi";
import { ContractContext } from "./ContractInitialize";
import {
  getDAVContractAddress,
  getSTATEContractAddress,
  getAUCTIONContractAddress,
} from "../Constants/ContractAddresses";
import toast from "react-hot-toast";
import { ERC20_ABI, notifyError, notifySuccess } from "../Constants/Constants";
import { getRuntimeConfigSync } from "../Constants/RuntimeConfig";
import { truncateDecimals } from "../Constants/Utils";

export const DAVContext = createContext();

export const DavProvider = ({ children }) => {
  const { AllContracts, signer } = useContext(ContractContext);
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const [buttonTextStates, setButtonTextStates] = useState({});

  // Get contract addresses for the connected chain
  const getDavAddress = () => getDAVContractAddress(chainId);
  const getStateAddress = () => getSTATEContractAddress(chainId);
  const getAuctionAddress = () => getAUCTIONContractAddress(chainId);

  const [isLoading, setLoading] = useState(true);
  const [BurnClicked, setClicked] = useState(false);
  const [Claiming, setClaiming] = useState(false);
  const [users, setUsers] = useState([]);
  const [names, setNames] = useState([]);
  const [Emojies, setEmojies] = useState([]);
  const [TokenStatus, setTokenStatus] = useState([]);
  const [isUsed, setisUsed] = useState([]);
  const [isProcessing, setIsProcessing] = useState(null);
  const [isClaiming, setisClaiming] = useState(null);
  const [isProcessingToken, setProcessToken] = useState(false);

  const [data, setData] = useState({
    Supply: "0.0",
    stateHolding: "0.0",
    ReferralCodeOfUser: "0.0",
    ReferralAMount: "0.0",
    totalStateBurned: "0.0",
    TokenProcessing: "0.0",
    DavMintFee: "0.0",
    pendingToken: "0.0",
    claimableAmount: "0.0",
    currentBurnCycle: "0.0",
    userBurnedAmountInCycle: "0.0",
    usableTreasury: "0.0",
    tokenEntries: null,
    expectedClaim: "0.0",
    CanClaimNow: "false",
    claimableAmountForBurn: "0.0",
    UserPercentage: "0.0",
    TimeUntilNextClaim: "0.0",
    AllUserPercentage: "0.0",
    stateHoldingOfSwapContract: "0.0",
    ContractPls: "0.0",
    davHolds: "0.0",
    davExpireHolds: "0.0",
    totalInvestedPls: "0.0",
  });

  // Helper to truncate without rounding
  const fetchAndSet = async (
    label,
    fn,
    format = true,
    fixed = 2,
    type = "number"
  ) => {
    try {
      const res = await fn();
      let value;

      if (type === "boolean") {
        value = res ? "true" : "false";
      } else if (label === "UserPercentage") {
        const raw = Number(res) / 100;
        value = truncateDecimals(raw, fixed);
      } else if (label === "DavMintFee") {
        // Special handling for DavMintFee to preserve full decimal value
        const raw = parseFloat(ethers.formatUnits(res, 18));
        value = raw.toString(); // Keep full precision

      } else {
        const raw = format ? parseFloat(ethers.formatUnits(res, 18)) : res;
        value = format ? truncateDecimals(raw, fixed) : raw.toString();
      }

      setData((prev) => ({
        ...prev,
        [label]: value,
      }));
    } catch (err) {
      if (
        err?.reason?.includes("No previous cycle exists") ||
        err?.data?.message?.includes("No previous cycle exists")
      ) {
        console.log(`Suppressed error for ${label}: No previous cycle exists`);
        return; // Skip updating state for this error
      }
      console.error(`Error fetching ${label}:`, err);
    }
  };

  const fetchData = useCallback(async () => {
    if (!AllContracts?.davContract || !address) return;

    console.log("🔍 Fetching contract data for chain:", chainId);
    console.log("🏦 DAV Contract address:", getDavAddress());
    console.log("👤 User address:", address);

    setLoading(true);
    try {
      // Guard: Check if contracts are initialized
      if (!AllContracts?.davContract || !AllContracts?.stateContract) {
        console.warn("Contracts not initialized yet, skipping data fetch");
        setLoading(false);
        return;
      }

      // Guard: Check if address is valid
      if (!address || address === "0x0000000000000000000000000000000000000000") {
        console.warn("No valid wallet address, skipping data fetch");
        setLoading(false);
        return;
      }

      // Some networks may not have a claim cycle yet; don't abort other reads if this fails
      let currentCycle = 0;
      try {
        const currentCycleRaw = await AllContracts.davContract.getCurrentClaimCycle();
        currentCycle = parseInt(currentCycleRaw.toString());
      } catch (e) {
        console.warn("getCurrentClaimCycle not available yet; continuing", e?.reason || e?.message || e);
      }

      setData((prev) => ({
        ...prev,
        currentBurnCycle: currentCycle.toString(),
      }));

      await Promise.allSettled([
        fetchAndSet("Supply", () => AllContracts.davContract.totalSupply()),
        fetchAndSet("claimableAmount", () =>
          AllContracts.davContract.earned(address)
        ),
        // REMOVED: These functions don't exist in new DAV contract
        // fetchAndSet("userBurnedAmount", () => AllContracts.davContract.getUserBurnedAmount(address)),
        // fetchAndSet("userBurnedAmountInCycle", () => AllContracts.davContract.cycleTotalBurned(currentCycle)),
        // fetchAndSet("UserPercentage", () => AllContracts.davContract.getUserSharePercentage(address)),
        // fetchAndSet("totalStateBurned", () => AllContracts.davContract.totalStateBurned()),
        // fetchAndSet("pendingToken", () => AllContracts.davContract.getPendingTokenNames(address), false),
        // fetchAndSet("tokenEntries", () => AllContracts.davContract.getAllTokenEntries(), false),
        
        // Fees removed in new contracts; skip fetching TOKEN_PROCESSING_FEE/TOKEN_WITHIMAGE_PROCESS
        fetchAndSet("DavMintFee", () => {
          console.log("🎯 Fetching TOKEN_COST from contract...");
          return AllContracts.davContract.TOKEN_COST();
        }),
        fetchAndSet("davHolds", () =>
          AllContracts.davContract.getActiveBalance(address)
        ),
        fetchAndSet("davGovernanceHolds", () =>
          AllContracts.davContract.balanceOf(address)
        ),
        fetchAndSet("stateHolding", () =>
          AllContracts.stateContract.balanceOf(address)
        ),
        fetchAndSet("stateHoldingOfSwapContract", () =>
          AllContracts.stateContract.balanceOf(getAuctionAddress())
        ),
        fetchAndSet(
          "ReferralCodeOfUser",
          () => AllContracts.davContract.getUserReferralCode(address),
          false
        ),
        fetchAndSet("ReferralAMount", () =>
          AllContracts.davContract.referralRewards(address)
        ),
      ]);

      // Calculate total invested PLS
      await calculateTotalInvestedPls();
    } catch (error) {
      console.error("Error fetching contract data:", error);
    } finally {
      setLoading(false);
    }
  }, [AllContracts, address, chainId]);

  const fetchStateHolding = async () => {
    await fetchAndSet("stateHolding", () =>
      AllContracts.stateContract.balanceOf(address)
    );
  };
  //   console.log("dav entries", data.DavMintFee);
  const calculateTotalInvestedPls = async () => {
    try {
      const davBalanceRaw = await AllContracts.davContract.balanceOf(address);
      const davMintFeeRaw = await AllContracts.davContract.TOKEN_COST();

      // Convert BigInt → decimal values
      const davBalance = parseFloat(ethers.formatUnits(davBalanceRaw, 18));
      const davMintFee = parseFloat(ethers.formatUnits(davMintFeeRaw, 18));

      // Normal JS multiplication and division
      const totalInvestedPlsValue = (davBalance * davMintFee).toFixed(2);

      setData((prev) => ({
        ...prev,
        totalInvestedPls: parseFloat(totalInvestedPlsValue).toFixed(0),
      }));

      console.log("Total invested PLS:", totalInvestedPlsValue);
    } catch (error) {
      console.error("Error calculating total invested PLS:", error);
      setData((prev) => ({
        ...prev,
        totalInvestedPls: "0.0",
      }));
    }
  };

  const fetchAndStoreTokenEntries = async () => {
    try {
      // This function is disabled - getAllTokenEntries doesn't exist in current contract
      // Token entries are now managed through AuctionContract.autoRegisteredTokens
      console.warn("fetchAndStoreTokenEntries: Function disabled - use autoRegisteredTokens instead");
    } catch (error) {
      console.error("Error fetching token entries:", error);
    }
  };

  // Fix the isTokenDeployed function to check tokens properly
  const isTokenDeployed = async () => {
    if (!names || names.length === 0 || !AllContracts?.AuctionContract) {
      return;
    }

    try {
      const results = await Promise.all(
        names.map(async (name) => {
          try {
            // First check if token exists in registered tokens
            const tokenCount = Number(await AllContracts.AuctionContract.tokenCount?.().catch(() => 0));
            
            for (let i = 0; i < tokenCount; i++) {
              try {
                const tokenAddress = await AllContracts.AuctionContract.autoRegisteredTokens(i);
                if (!tokenAddress || tokenAddress === ethers.ZeroAddress) continue;
                
                // Get token name and check if it matches
                const tokenContract = new ethers.Contract(tokenAddress, [
                  'function name() view returns (string)'
                ], provider);
                
                const tokenName = await tokenContract.name().catch(() => '');
                if (tokenName.toLowerCase() === name.toLowerCase()) {
                  return true; // Token is deployed
                }
              } catch {}
            }
            
            return false; // Token not found
          } catch (error) {
            console.error(`Error checking deployment for ${name}:`, error);
            return false;
          }
        })
      );

      setisUsed(results);
    } catch (error) {
      console.error("Error in isTokenDeployed:", error);
    }
  };

  useEffect(() => {
    if (address && AllContracts?.davContract) fetchData();
  }, [address, AllContracts?.davContract, fetchData]);

  // Call isTokenDeployed when names array changes
  useEffect(() => {
    if (names && names.length > 0 && AllContracts?.AuctionContract) {
      isTokenDeployed();
    }
  }, [names, AllContracts?.AuctionContract]);

  const fetchTimeUntilNextClaim = useCallback(async () => {
    if (!AllContracts?.davContract || !address) return;
    try {
      await Promise.allSettled([
        // Expired token amount is in wei (18 decimals), needs formatting
        fetchAndSet(
          "davExpireHolds",
          () => AllContracts.davContract.getExpiredTokenCount(address),
          true // Apply 18-decimal formatting
        ),
        fetchAndSet("davHolds", () =>
          AllContracts.davContract.getActiveBalance(address)
        ),
      ]);
    } catch (error) {
      console.error("Error fetching DAV balances:", error);
    }
  }, [AllContracts, address]);

  useEffect(() => {
    if (!AllContracts?.davContract || !address) return;

    const interval = setInterval(() => {
      fetchTimeUntilNextClaim();
      fetchAndStoreTokenEntries();
      // Removed isTokenDeployed from frequent interval to prevent flickering
    }, 1000); // run every second

    return () => clearInterval(interval); // clean up on unmount
  }, [fetchTimeUntilNextClaim, AllContracts?.davContract, address]);

  // Separate interval for deployment status with longer frequency to prevent flickering
  useEffect(() => {
    if (!AllContracts?.AuctionContract || !names || names.length === 0) return;

    const deploymentInterval = setInterval(() => {
      isTokenDeployed();
    }, 10000); // Check deployment status every 10 seconds instead of every second

    return () => clearInterval(deploymentInterval);
  }, [names, AllContracts?.AuctionContract]);

  useEffect(() => {
    if (data.TimeUntilNextClaim === 0) {
      fetchData();
    }
  }, [data.TimeUntilNextClaim, fetchData]);

  useEffect(() => {
    if (isConnected && AllContracts?.davContract) {
      fetchData();
    }
  }, [isConnected, AllContracts, fetchData]);

  const [txStatus, setTxStatus] = useState("");

  const mintDAV = async (amount, ref = "") => {
    if (!AllContracts?.davContract) {
      notifyError('Contract not initialized');
      return;
    }
    // Preflight: governance cannot mint and wallet must be connected to the right chain
    try {
      const me = await signer?.getAddress?.();
      const gov = (await AllContracts?.AuctionContract?.governanceAddress?.())?.toLowerCase?.();
      if (me && gov && me.toLowerCase() === gov) {
        notifyError('Governance cannot mint DAV');
        throw new Error('Governance cannot mint DAV');
      }
    } catch {}
    try {
      if (!signer) {
        if (typeof window !== 'undefined' && window.ethereum?.request) {
          try { await window.ethereum.request({ method: 'eth_requestAccounts' }); } catch {}
        }
        throw new Error('Wallet not connected');
      }
      const hex = '0x' + Number(chainId).toString(16);
      try { await signer.provider?.send?.('wallet_switchEthereumChain', [{ chainId: hex }]); } catch {}
    } catch (e) {
      notifyError('Connect wallet on the correct chain');
      throw e;
    }
    // Validation & sanitation
    if (amount === undefined || amount === null || amount === "") {
      notifyError('Enter amount');
      throw new Error('No amount provided');
    }
    if (!/^[0-9]+$/.test(String(amount))) {
      notifyError('Amount must be whole number');
      throw new Error('Non whole number');
    }
    const whole = BigInt(amount);
    if (whole === 0n) {
      notifyError('Amount must be greater than zero');
      throw new Error('Zero amount');
    }
    const ethAmount = ethers.parseEther(amount.toString());

    // Convert DavMintFee from string to number and calculate cost
    const davMintFeeNumber = parseFloat(data.DavMintFee);
    const cost = ethers.parseEther(
      (amount * davMintFeeNumber).toString()
    );

    console.log("🔍 Minting Debug:", {
      amount,
      davMintFee: data.DavMintFee,
      davMintFeeNumber,
      calculatedCost: (amount * davMintFeeNumber).toString(),
      chainId
    });

    const referral = ref.trim() || "0x0000000000000000000000000000000000000000";

    try {
      setTxStatus("initiated");
      const tx = await AllContracts.davContract.mintDAV(ethAmount, referral, { value: cost });
      setTxStatus("pending");
      await tx.wait();
      setTxStatus("confirmed");
      notifySuccess(`${amount} token minted successfully!`);
      await fetchData();
      return tx;
    } catch (error) {
      setTxStatus("error");
      console.error("Minting error raw:", error);
      // Decode & surface reason
      let msg = 'Mint failed';
      const lower = (error?.message || '').toLowerCase();
      if (error?.reason) msg = error.reason;
      else if (error?.data?.message) msg = error.data.message;
      else if (lower.includes('pool not ready')) msg = 'Pool not ready - refresh later';
      else if (lower.includes('incorrect pls amount')) msg = 'Incorrect PLS value sent';
      else if (lower.includes('max holders')) msg = 'Maximum holders reached';
      else if (lower.includes('max supply')) msg = 'Max supply reached';
      else if (lower.includes('governance cannot mint')) msg = 'Governance wallet cannot mint';
      else if (lower.includes('rejected')) msg = 'User rejected transaction';
      else if (lower.includes('whole number')) msg = 'Amount must be whole number';
      notifyError(msg);
      throw error;
    } finally {
      setTxStatus("");
    }
  };

  const AddYourToken = async (amount, Emoji, isImage = false) => {
    if (!AllContracts?.davContract) return;
    let toastId = null;

    try {
      // Ensure wallet UI is opened and on the right chain
      const ready = await (async () => {
        try {
          if (!signer) {
            if (typeof window !== 'undefined' && window.ethereum?.request) {
              try { await window.ethereum.request({ method: 'eth_requestAccounts' }); } catch {}
            }
            throw new Error('Wallet not connected');
          }
          try { await signer.provider?.send?.('eth_requestAccounts', []); } catch {}
          const hex = '0x' + Number(chainId).toString(16);
          try {
            await signer.provider?.send?.('wallet_switchEthereumChain', [{ chainId: hex }]);
          } catch (err) {
            const code = err?.code ?? err?.data?.originalError?.code;
            if (code === 4902 || code === '4902') {
              try {
                const rc = getRuntimeConfigSync?.();
                await signer.provider?.send?.('wallet_addEthereumChain', [{
                  chainId: hex,
                  chainName: rc?.network?.name || `Chain ${chainId}`,
                  nativeCurrency: {
                    name: (rc?.dex?.baseToken?.symbol || 'PLS'),
                    symbol: (rc?.dex?.baseToken?.symbol || 'PLS'),
                    decimals: rc?.dex?.baseToken?.decimals || 18,
                  },
                  rpcUrls: [rc?.network?.rpcUrl].filter(Boolean),
                  blockExplorerUrls: [rc?.network?.explorerUrl].filter(Boolean),
                }]);
              } catch {}
            }
          }
          await signer.getAddress();
          return true;
        } catch(e) {
          notifyError('Connect wallet to proceed');
          return false;
        }
      })();
      if (!ready) return;

      setProcessToken(true);

      // Wait for user confirmation
      const tx = await AllContracts.davContract.processYourToken(amount, Emoji);

      toastId = toast.loading(
        `Processing token: ${amount}`,
        {
          position: "top-center",
        }
      );

      await tx.wait();
      toast.dismiss(toastId);
      toast.success(
        `Token listed: ${amount}`,
        {
          position: "top-center",
          autoClose: 5000,
        }
      );

      await fetchData();

      return tx;
    } catch (error) {
      console.error("Token listing error:", error, {
        reason: error.reason,
        data: error.data,
        message: error.message,
      });

      // Extract the contract error reason
      let errorMessage = "Transaction failed";
      const code = error?.code ?? error?.data?.originalError?.code;
      const msg = (error?.message || '').toLowerCase();
      if (code === 4001 || code === 'ACTION_REJECTED' || msg.includes('user rejected') || msg.includes('rejected')) {
        errorMessage = "Transaction rejected by user";
      } else if (error.reason) {
        errorMessage = error.reason; // Contract revert reason
      } else if (error.data?.message) {
        errorMessage = error.data.message; // RPC/MetaMask style
      }

      // Show error in alert
      alert(`Error: ${errorMessage}`);

      // Update toast notification
      toast.dismiss(toastId);
      if (!toastId) {
        notifyError(`❌ ${errorMessage}`)
      } else {
        notifyError(`❌ Error: ${errorMessage}`)
      }
      throw error;
    } finally {
      setProcessToken(false);
    }
  };
  const claimAmount = async () => {
    if (!AllContracts?.davContract) return;
    try {
      setisClaiming(true);
      const tx = await AllContracts.davContract.claimReward();
      await tx.wait();
      await fetchAndSet("claimableAmount", () =>
        AllContracts.davContract.earned(address)
      ); setisClaiming(false)
    } catch (err) {
      console.error("Claim error:", err);
      let errorMessage = "An unknown error occurred while claiming reward.";
      setisClaiming(false);
      if (err?.error?.message) {
        errorMessage = err.error.message;
      } else if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      alert(`Claim failed: ${errorMessage}`);
    } finally {
      setisClaiming(false)
    }
  };

  const deployWithMetaMask = async (name, symbol) => {
    if (!AllContracts?.AuctionContract) return;
    try {
      // Ensure wallet readiness
      try {
        if (!signer) {
          if (typeof window !== 'undefined' && window.ethereum?.request) {
            try { await window.ethereum.request({ method: 'eth_requestAccounts' }); } catch {}
          }
          throw new Error('Wallet not connected');
        }
        try { await signer.provider?.send?.('eth_requestAccounts', []); } catch {}
        const hex = '0x' + Number(chainId).toString(16);
        try {
          await signer.provider?.send?.('wallet_switchEthereumChain', [{ chainId: hex }]);
        } catch (err) {
          const code = err?.code ?? err?.data?.originalError?.code;
          if (code === 4902 || code === '4902') {
            try {
              const rc = getRuntimeConfigSync?.();
              await signer.provider?.send?.('wallet_addEthereumChain', [{
                chainId: hex,
                chainName: rc?.network?.name || `Chain ${chainId}`,
                nativeCurrency: {
                  name: (rc?.dex?.baseToken?.symbol || 'PLS'),
                  symbol: (rc?.dex?.baseToken?.symbol || 'PLS'),
                  decimals: rc?.dex?.baseToken?.decimals || 18,
                },
                rpcUrls: [rc?.network?.rpcUrl].filter(Boolean),
                blockExplorerUrls: [rc?.network?.explorerUrl].filter(Boolean),
              }]);
            } catch {}
          }
        }
        await signer.getAddress();
      } catch { notifyError('Connect wallet to proceed'); return; }

      // Validate inputs
      const tokenName = (name || '').trim();
      const tokenSymbol = (symbol || '').trim();
      if (!tokenName || !tokenSymbol) {
        notifyError('Enter token name and symbol');
        return;
      }

      // Governance-only gate for SWAP_V3.deployUserToken
      const govAddr = (await AllContracts.AuctionContract.governanceAddress()).toLowerCase();
      const me = (await signer.getAddress()).toLowerCase();
      if (me !== govAddr) {
        notifyError('Only governance wallet can deploy tokens');
        return;
      }

      // Resolve recipients: 1% to governance, 99% to treasury; owner can be governance
      const treasury = await AllContracts.AuctionContract.treasury();
      const owner = await signer.getAddress();

      setIsProcessing(name); // Start processing
      const tx = await AllContracts.AuctionContract.deployUserToken(
        tokenName,
        tokenSymbol,
        govAddr,
        treasury,
        owner
      );
      await tx.wait();
      await fetchData();
      await isTokenDeployed();
    } catch (err) {
      console.error("Deploy error:", err);
      let msg = 'Transaction failed';
      const lc = (err?.message || '').toLowerCase();
      if (err?.reason) msg = err.reason;
      else if (lc.includes('onlygovernance') || lc.includes('notgovernance')) msg = 'Only governance can deploy tokens';
      else if (err?.data?.message) msg = err.data.message;
      notifyError(msg);
    } finally {
      setIsProcessing(null);
    }
  };

  const claimBurnAmount = async () => {
    if (!AllContracts?.davContract) return;
    try {
      setClaiming(true);
      const tx = await AllContracts.davContract.claimPLS();
      await tx.wait();
      await fetchData();
      notifySuccess("Claimed PLS!")
    } catch (err) {
      console.error("Burn claim error:", err);
      // Try to extract a readable reason
      let message = "Transaction failed";
      if (err.reason) {
        message = err.reason; // ethers revert reason
      } else if (err.error?.message) {
        message = err.error.message; // MetaMask style
      } else if (err.data?.message) {
        message = err.data.message; // RPC provider style
      } else if (err.message) {
        message = err.message; // fallback
      }
      notifyError(message)
    } finally {
      setClaiming(false);
    }
  };

  const DepositStateBack = async (TokenAddress) => {
    try {
      const tokenContract = new ethers.Contract(
        getStateAddress(),
        ERC20_ABI,
        signer
      );
      const weiAmount = ethers.parseUnits("500000000".toString(), 18);

      await (await tokenContract.approve(getAuctionAddress(), weiAmount)).wait();

      const tx = await AllContracts.AuctionContract.depositStateForTokenOwner(
        TokenAddress
      );
      await tx.wait();
      await fetchData();
      notifySuccess("Deposited State tokens")
    } catch (err) {
      console.error("Deposit  error:", err);
    }
  };

  const BurnStateTokens = async (amount) => {
    if (!AllContracts?.davContract) return;
    try {
      setButtonTextStates("initiated");
      setClicked(true);
      const weiAmount = ethers.parseUnits(amount.toString(), 18);
      const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      const tokenContract = new ethers.Contract(
        getStateAddress(),
        ERC20_ABI,
        signer
      );
      const allowance = await tokenContract.allowance(address, getDavAddress());
      // 2. If allowance is not enough, approve
      if (BigInt(allowance) < BigInt(weiAmount)) {
        setButtonTextStates("Approving");
        await (await tokenContract.approve(getDavAddress(), maxUint256)).wait();
      }

      setButtonTextStates("Pending");
      await (await AllContracts.davContract.burnState(weiAmount)).wait();
      setButtonTextStates("confirmed");
      setClicked(false);
      notifySuccess(`${amount} of tokens Burned Successfully`)
      await fetchData();
      await fetchTimeUntilNextClaim();
    } catch (err) {
      console.error("Burn error:", err);
      setButtonTextStates("error");

      // Default error message
      let errorMessage = "An error occurred during burn.";

      // Extract message from different possible sources
      if (err?.reason) {
        errorMessage = err.reason;
      } else if (err?.data?.message) {
        errorMessage = err.data.message;
      } else if (err?.message) {
        errorMessage = err.message;
      }

      // Custom handling for specific known case
      if (errorMessage.includes("execution reverted (unknown custom error)")) {
        errorMessage = "Check state token balance";
      }
      notifyError(errorMessage)
      setClicked(false);
    } finally {
      setButtonTextStates("");
    }
  };

  DavProvider.propTypes = {
    children: PropTypes.node.isRequired,
  };

  return (
    <DAVContext.Provider
      value={{
        ...data,
        isLoading,
        BurnClicked,
        Claiming,
        mintDAV,
        BurnStateTokens,
        claimAmount,
        isClaiming,
        claimBurnAmount,
        AddYourToken,
        buttonTextStates,
        fetchData,
        fetchStateHolding,
        deployWithMetaMask,
        DepositStateBack,
        users,
        isProcessingToken,
        setProcessToken,
        names,
        Emojies,
        TokenStatus,
        isProcessing,
        txStatus,
        setTxStatus,
        isUsed,
      }}
    >
      {children}
    </DAVContext.Provider>
  );
};

export const useDAvContract = () => useContext(DAVContext);
