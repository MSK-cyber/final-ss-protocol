// SwapContractContext.js
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { ethers } from "ethers";
import PropTypes from "prop-types";
import toast from "react-hot-toast";
import { ContractContext } from "./ContractInitialize";
import {
  getDAVContractAddress,
  getSTATEContractAddress,
  getAUCTIONContractAddress,
} from "../Constants/ContractAddresses";
import { useAccount, useChainId, useWalletClient } from "wagmi";
import { useDAvContract } from "./DavTokenFunctions";
import { notifyError, notifySuccess, PULSEX_ROUTER_ABI, PULSEX_ROUTER_ADDRESS, WPLS_ADDRESS } from "../Constants/Constants";
import { geckoPoolsForTokenApiUrl } from "../Constants/ExternalLinks";

const SwapContractContext = createContext();

export const useSwapContract = () => useContext(SwapContractContext);

export const SwapContractProvider = ({ children }) => {
  const { fetchStateHolding } = useDAvContract();
  const chainId = useChainId();
  const { loading, provider, signer, AllContracts } =
    useContext(ContractContext);
  const { address, connector } = useAccount();
  const { data: walletClient } = useWalletClient();
  const toastId = useRef(null);
  useEffect(() => {
    if (!walletClient) return;

    walletClient.transport?.on?.('chainChanged', () => {
      window.location.reload();
    });

    // For injected providers like MetaMask
    connector?.getProvider().then((provider) => {
      if (provider?.on) {
        provider.on('chainChanged', () => {
          window.location.reload();
        });
      }
    });
  }, [walletClient, connector]);
  // Get contract addresses for the connected chain
  const getDavAddress = () => getDAVContractAddress(chainId);
  const getStateAddress = () => getSTATEContractAddress(chainId);
  const getAuctionAddress = () => getAUCTIONContractAddress(chainId);

  const [claiming, setClaiming] = useState(false);
  const [txStatusForSwap, setTxStatusForSwap] = useState("");
  const [txStatusForAdding, setTxStatusForAdding] = useState("");
  const [TotalCost, setTotalCost] = useState(null);
  const [DaipriceChange, setDaiPriceChange] = useState("0.0");
  const [InputAmount, setInputAmount] = useState({});
  const [AirDropAmount, setAirdropAmount] = useState("0.0");
  const [AuctionTime, setAuctionTime] = useState({});
  const [TokenPariAddress, setPairAddresses] = useState({});
  const [CurrentCycleCount, setCurrentCycleCount] = useState({});
  const [OutPutAmount, setOutputAmount] = useState({});
  const [TokenRatio, setTokenRatio] = useState({});
  const [TimeLeftClaim, setTimeLeftClaim] = useState({});
  const [burnedAmount, setBurnedAmount] = useState({});
  const [burnedLPAmount, setBurnLpAmount] = useState({});
  const [TokenBalance, setTokenbalance] = useState({});
  const [StateBalance, setStateBalance] = useState("");
  const [isReversed, setIsReverse] = useState({});
  const [IsAuctionActive, setisAuctionActive] = useState({});
  const [isTokenRenounce, setRenonced] = useState({});
  const [tokenMap, setTokenMap] = useState({});
  const [TokenNames, setTokenNames] = useState([]);

  const [buttonTextStates, setButtonTextStates] = useState({});
  const [DexbuttonTextStates, setDexButtonTextStates] = useState({});
  const [swappingStates, setSwappingStates] = useState({});
  const [DexswappingStates, setDexSwappingStates] = useState({});

  const [userHashSwapped, setUserHashSwapped] = useState({});
  const [DavAddress, setDavAddress] = useState("");
  const [supportedToken, setIsSupported] = useState(false);
  const [UsersSupportedTokens, setUsersSupportedTokens] = useState("");
  const [StateAddress, setStateAddress] = useState("");
  const [AirdropClaimed, setAirdropClaimed] = useState({});
  const [userHasReverseSwapped, setUserHasReverseSwapped] = useState({});

  const [isCliamProcessing, setIsCllaimProccessing] = useState(null);

  // Add new state variables for token value calculations
  const [pstateToPlsRatio, setPstateToPlsRatio] = useState("0.0");

  const CalculationOfCost = async (amount) => {
    if (chainId == 146) {
      setTotalCost(ethers.parseEther((amount * 100).toString()));
    } else {
      try {
        // Get DavMintFee directly from the contract
        const davMintFee = await AllContracts.davContract.TOKEN_COST();
        const davMintFeeFormatted = parseFloat(ethers.formatUnits(davMintFee, 18));
        setTotalCost(ethers.parseEther((amount * davMintFeeFormatted).toString()));
      } catch (error) {
        console.error("Error getting DavMintFee:", error);
        // Fallback to a default value
        setTotalCost(ethers.parseEther((amount * 10).toString()));
      }
    }
  };

  const ReturnfetchUserTokenAddresses = async () => {
    if (!AllContracts?.AuctionContract || !AllContracts?.swapLens || !provider) {
      console.warn("Contracts or provider not ready");
      return {};
    }

    try {
      const swapAddress = AllContracts.AuctionContract.target || AllContracts.AuctionContract.getAddress?.() || getAuctionAddress();
      const scheduled = await AllContracts.swapLens.getScheduledTokens(swapAddress);
      const addresses = Array.isArray(scheduled) ? [...scheduled] : Object.values(scheduled);

      const map = {};
      const nameAbi = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
      ];
      for (const addr of addresses) {
        try {
          if (!addr || addr === ethers.ZeroAddress) continue;
          const erc20 = new ethers.Contract(addr, nameAbi, provider);
          let name;
          try { name = await erc20.name(); } catch (_) { try { name = await erc20.symbol(); } catch { name = addr; } }
          let key = name || addr;
          if (map[key]) key = `${name}-${addr.slice(0,6)}`;
          map[key] = addr;
        } catch (inner) {
          console.warn("Token metadata read failed for", addr, inner?.message || inner);
        }
      }

      setTokenNames(Object.keys(map));
      setTokenMap(map);
      return map;
    } catch (error) {
      console.error("Error fetching tokens via lens:", error);
      return {};
    }
  };
  const fetchTokenData = async ({
    contractMethod,
    setState,
    formatFn = (v) => v.toString(),
    includeTestState = false,
    buildArgs,
    useAddressAsKey = false, // New: Control whether to key results by address
  }) => {
    try {
      const results = {};
      const tokenMap = await ReturnfetchUserTokenAddresses();

      const extendedMap = includeTestState
        ? { ...tokenMap, state: getStateAddress() }
        : tokenMap;

      for (const [tokenName, tokenAddress] of Object.entries(extendedMap)) {
        try {
          const contract = AllContracts.AuctionContract;

          if (!contract || typeof contract[contractMethod] !== "function") {
            throw new Error(`Method ${contractMethod} not found on contract`);
          }

          const args = buildArgs
            ? buildArgs(tokenAddress, tokenName)
            : [tokenAddress];
          const rawResult = await contract[contractMethod](...args);
          const formattedResult = formatFn(rawResult);

          const key = useAddressAsKey ? tokenAddress : tokenName;
          results[key] = formattedResult;
        } catch (err) {
          const reason =
            err?.reason || // ethers v5 style
            err?.shortMessage || // ethers v6 style
            err?.error?.errorName ||
            err?.message ||
            "";

          const unsupported = /unsupported token/i.test(reason);

          const key = useAddressAsKey ? tokenAddress : tokenName;
          if (unsupported) {
            results[key] = "not listed";
          } else {
            results[key] = "not started";
          }

          console.error(
            `Error calling ${contractMethod} for ${tokenName} (${tokenAddress}):`,
            reason || err
          );
        }
      }

      setState(results);
      return results;
    } catch (err) {
      console.error("Top-level error in fetchTokenData:", err);
      return {};
    }
  };

  const getInputAmount = async () => {
    await fetchTokenData({
      contractMethod: "getAvailableDavForAuction",
      setState: setInputAmount,
      formatFn: (v) => Math.floor(Number(ethers.formatEther(v))),
      buildArgs: (tokenAddress) => [address, tokenAddress],
    });
  };

  const getOutPutAmount = async () => {
    await fetchTokenData({
      contractMethod: "getUserStateBalance",
      setState: setOutputAmount,
      formatFn: (v) => Math.floor(Number(ethers.formatEther(v))),
      buildArgs: (tokenAddress) => [address, tokenAddress],
    });
  };

  const getAirdropAmount = async () => {
    try {
      const results = {};
      const map = await ReturnfetchUserTokenAddresses();

      for (const [name, tokenAddr] of Object.entries(map)) {
        try {
          const claimable = await AllContracts.airdropDistributor.getClaimable(tokenAddr, address);
          const amountWei = Array.isArray(claimable)
            ? (claimable[2] || 0n)
            : (claimable?.amount || 0n);
          results[name] = Math.floor(Number(ethers.formatEther(amountWei)));
        } catch (inner) {
          console.warn("getClaimable failed for", name, inner?.message || inner);
          results[name] = 0;
        }
      }

      setAirdropAmount(results);
      return results;
    } catch (err) {
      console.error("Error fetching airdrop amounts:", err);
      return {};
    }
  };
  const getPairAddresses = async () => {
    await fetchTokenData({
      contractMethod: "getPairAddress", // aligned with new ABI
      setState: setPairAddresses,
      formatFn: (v) => v.toString(),
      buildArgs: (tokenAddress) => [tokenAddress],
    });
  };

  const WSS_RPC_URL = "wss://pulsechain-rpc.publicnode.com";
  const HTTP_RPC_URL = "https://pulsechain-rpc.publicnode.com"; // Fallback HTTP RPC

  // Create providers
  const wsProvider = new ethers.WebSocketProvider(WSS_RPC_URL);
  const httpProvider = new ethers.JsonRpcProvider(HTTP_RPC_URL);

    useEffect(() => {
    let countdownInterval;
    let resyncInterval;
    let isActive = true;
    let wsConnected = false;

    // WebSocket connection management
    const setupWebSocketListeners = () => {
      wsProvider.on("error", (error) => {
        console.error("❌ WebSocket error:", error);
        wsConnected = false;
      });

      wsProvider.on("close", () => {
        console.warn("⚠️ WebSocket connection closed");
        wsConnected = false;
      });

      wsProvider.on("open", () => {
        console.log("✅ WebSocket connection established");
        wsConnected = true;
      });
    };

    // Batch process tokens for better performance
    const fetchAuctionTimesBatch = async (tokenEntries, batchSize = 10) => {
      const results = [];

      for (let i = 0; i < tokenEntries.length; i += batchSize) {
        const batch = tokenEntries.slice(i, i + batchSize);
        const batchPromises = batch.map(([tokenName, TokenAddress]) =>
          getCurrentProvider()
            .then(provider => {
              const readOnlyAuctionContract = AllContracts.AuctionContract.connect(provider);
              return readOnlyAuctionContract.getAuctionTimeLeft(TokenAddress, { blockTag: "latest" });
            })
            .then((AuctionTimeInWei) => ({
              tokenName,
              timeLeft: Math.max(0, Math.floor(Number(AuctionTimeInWei))),
            }))
            .catch((e) => {
              console.error(`❌ Error fetching auction time for ${tokenName}:`, e.message);
              return { tokenName, timeLeft: 0 };
            })
        );

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);

        // Small delay between batches to prevent overwhelming the RPC
        if (i + batchSize < tokenEntries.length) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      return results;
    };

    // Get the best available provider
    const getCurrentProvider = async () => {
      // Try WebSocket first if connected, otherwise use HTTP
      if (wsConnected) {
        return wsProvider;
      }
      return httpProvider;
    };

    const fetchAuctionTimes = async (showLogs = true) => {
      if (!AllContracts?.AuctionContract || !isActive) return;

      try {
        if (showLogs) {
          console.log("🔄 Fetching auction times...");
        }

        const tokenMap = await ReturnfetchUserTokenAddresses();
        const entries = Object.entries(tokenMap);

        if (entries.length === 0) {
          console.warn("⚠️ No tokens found");
          return;
        }

        // Process in batches for better performance
        const results = await fetchAuctionTimesBatch(entries, 15);

        // Convert to object
        const updatedTimes = results.reduce((acc, { tokenName, timeLeft }) => {
          acc[tokenName] = timeLeft;
          return acc;
        }, {});

        if (isActive && Object.keys(updatedTimes).length > 0) {
          setAuctionTime(updatedTimes);
          if (showLogs) {
            console.log("✅ Auction times updated:", Object.keys(updatedTimes).length, "tokens");
          }
        }
      } catch (err) {
        console.error("❌ Error fetching auction times:", err);

        // Only attempt reconnection for WebSocket issues
        if (err.message.includes("connection") || err.message.includes("socket")) {
          console.log("🔄 WebSocket issue, will use HTTP provider for next request");
          wsConnected = false;
        }
      }
    };

    const startCountdown = () => {
      if (countdownInterval) clearInterval(countdownInterval);

      countdownInterval = setInterval(() => {
        if (!isActive) return;

        setAuctionTime((prev) => {
          const updated = {};
          let hasChanges = false;

          for (const [token, time] of Object.entries(prev)) {
            const newTime = Math.max(0, time - 1);
            updated[token] = newTime;
            if (newTime !== time) hasChanges = true;

            // Log when auctions are about to end
            if (newTime === 300) {
              console.log(`⏰ ${token} auction ending in 5 minutes!`);
              CheckIsAuctionActive?.();
              CheckIsReverse?.();
            } else if (newTime === 60) {
              console.log(`🚨 ${token} auction ending in 1 minute!`);
            } else if (newTime === 0 && time > 0) {
              console.log(`🏁 ${token} auction ended!`);
              // Trigger a fresh fetch when auction ends
              setTimeout(() => {
                if (isActive) {
                  fetchAuctionTimes(false);
                }
              }, 2000);
            }
          }

          return hasChanges ? updated : prev;
        });
      }, 1000);

      console.log("⏱️ Countdown timer started");
    };

    const setupResyncInterval = () => {
      if (resyncInterval) clearInterval(resyncInterval);

      resyncInterval = setInterval(() => {
        if (isActive) {
          console.log("⏰ Scheduled resync - fetching fresh auction times...");
          fetchAuctionTimes(false);
        }
      }, 90000); // Reduced to 1.5 minutes for more frequent updates

      console.log("🔄 Resync interval set to 1.5 minutes");
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && isActive) {
        console.log("👀 Tab became visible, fetching fresh data...");
        fetchAuctionTimes();
      } else if (document.visibilityState === 'hidden') {
        console.log("🙈 Tab became hidden");
      }
    };

    const handleOnline = () => {
      if (isActive) {
        console.log("🌐 Connection restored, fetching fresh data...");
        setTimeout(() => {
          if (isActive) {
            setupWebSocketListeners();
            fetchAuctionTimes();
          }
        }, 500);
      }
    };

    const handleOffline = () => {
      console.log("📡 Connection lost");
    };

    // Setup event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initialize
    console.log("🚀 Initializing auction timer...");

    // Setup WebSocket connection (non-blocking)
    setupWebSocketListeners();

    // Start countdown immediately
    startCountdown();

    // Set initial loading state
    setAuctionTime(prev => {
      if (Object.keys(prev).length === 0) {
        // Show loading state only if no data exists
        return { loading: true };
      }
      return prev;
    });

    // Fetch initial data immediately (no delay)
    const initializeFetch = async () => {
      try {
        await fetchAuctionTimes();
        // Clear loading state
        setAuctionTime(prev => {
          const { loading, ...rest } = prev;
          return rest;
        });
      } catch (error) {
        console.error("❌ Initial fetch failed:", error);
        setAuctionTime({});
      }
    };

    initializeFetch();

    // Setup periodic resync
    setupResyncInterval();

    // Cleanup function
    return () => {
      console.log("🧹 Cleaning up auction timer...");
      isActive = false;

      if (countdownInterval) clearInterval(countdownInterval);
      if (resyncInterval) clearInterval(resyncInterval);

      // Remove event listeners
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);

      // Close WebSocket connection
      try {
        if (wsProvider && wsProvider.destroy) {
          wsProvider.destroy();
        }
      } catch (error) {
        console.error("Error closing WebSocket:", error);
      }
    };
  }, [AllContracts]);

  const getCurrentAuctionCycle = async () => {
    await fetchTokenData({
      contractMethod: "getCurrentAuctionCycle",
      setState: setCurrentCycleCount,
      formatFn: (v) => Math.floor(Number(v)), // assuming the result is a number-like BigNumber
    });
  };

  const getTokenRatio = async () => {
    await fetchTokenData({
      contractMethod: "getRatioPrice",
      setState: setTokenRatio,
      formatFn: (v) => Math.floor(Number(ethers.formatEther(v))),
    });
  };

  const intervalHandlesRef = useRef({}); // useRef to persist across renders

  const initializeClaimCountdowns = useCallback(async () => {
    const intervalHandles = intervalHandlesRef.current;
    const results = {};

    // Clear existing intervals
    Object.values(intervalHandles).forEach(clearInterval);
    intervalHandlesRef.current = {};

    const tokenMap = await ReturnfetchUserTokenAddresses();

    for (const [tokenName, TokenAddress] of Object.entries(tokenMap)) {
      try {
        // Get current block timestamp
        const currentBlock = await provider.getBlock('latest');
        const currentBlockTime = currentBlock.timestamp;

        const timeLeftInSeconds =
          await AllContracts.AuctionContract.getAuctionTimeLeft(TokenAddress);

        const timeLeft = Number(timeLeftInSeconds);

        // Store the end time based on blockchain timestamp
        const endTime = currentBlockTime + timeLeft;
        results[tokenName] = timeLeft;

        // Start blockchain-synchronized countdown interval
        intervalHandles[tokenName] = setInterval(async () => {
          try {
            // Get latest block timestamp
            const latestBlock = await provider.getBlock('latest');
            const latestBlockTime = latestBlock.timestamp;

            // Calculate remaining time based on blockchain time
            const remainingTime = Math.max(0, endTime - latestBlockTime);

            setTimeLeftClaim((prev) => {
              const updated = { ...prev };
              updated[tokenName] = remainingTime;
              return updated;
            });
          } catch (error) {
            console.error(`Error updating claim timer for ${tokenName}:`, error);
          }
        }, 1000);
      } catch (err) {
        console.warn(`Error getting claim time for ${tokenName}`, err);
        results[tokenName] = 0;
      }
    }

    setTimeLeftClaim(results);
  }, [AllContracts, provider]);
  useEffect(() => {
    initializeClaimCountdowns();

    return () => {
      const intervalHandles = intervalHandlesRef.current;
      Object.values(intervalHandles).forEach(clearInterval);
    };
  }, [initializeClaimCountdowns]);

  const getTokensBurned = async () => {
    try {
      fetchTokenData({
        contractMethod: "getTotalTokensBurned",
        setState: setBurnedAmount,
        formatFn: (v) => Math.floor(Number(ethers.formatEther(v))),
        includeTestState: true,
      });
    } catch (e) {
      console.error("Error fetching input amounts:", e);
    }
  };

  const getTokenBalances = async () => {
    try {
      const results = {};
      const tokenMap = await ReturnfetchUserTokenAddresses();
      const extendedMap = {
        ...tokenMap,
        state: getStateAddress(),
      };

      for (const [tokenName, TokenAddress] of Object.entries(extendedMap)) {
        const tokenContract = new ethers.Contract(
          TokenAddress,
          ERC20_ABI,
          provider
        );
        const rawBalance = await tokenContract.balanceOf(getAuctionAddress());

        // Convert to string in full units, then floor to get whole number
        const formattedBalance = Math.floor(
          Number(ethers.formatUnits(rawBalance, 18))
        );

        results[tokenName] = formattedBalance;
      }

      setTokenbalance(results);
    } catch (e) {
      console.error("Error fetching input amounts:", e);
    }
  };

  const getStateTokenBalanceAndSave = async () => {
    try {
      const stateAddress = getStateAddress();
      const tokenContract = new ethers.Contract(stateAddress, ERC20_ABI, provider);
      const rawBalance = await tokenContract.balanceOf(getAuctionAddress());
      const formattedBalance = Math.floor(Number(ethers.formatUnits(rawBalance, 18)));

      // Update your React state
      setStateBalance(prev => ({ ...prev, state: formattedBalance }));

      // Save to localStorage with timestamp
      const now = Date.now();
      localStorage.setItem("stateTokenBalance", JSON.stringify({
        balance: formattedBalance,
        updatedAt: now,
      }));
    } catch (e) {
      console.error("Error fetching state token balance:", e);
    }
  };

  const CheckIsReverse = async () => {
    await fetchTokenData({
      contractMethod: "isReverseAuctionActive",
      setState: setIsReverse,
    });
  };
  const TokenABI = [
    {
      type: "function",
      name: "renounceOwnership",
      inputs: [],
      outputs: [],
      stateMutability: "nonpayable",
    },
  ];

  const renounceTokenContract = async (tokenAddress, tokenName) => {
    try {
      const tokenContract = new ethers.Contract(tokenAddress, TokenABI, signer);

      const tx = await tokenContract.renounceOwnership();
      await tx.wait();

      await isRenounced();
    } catch (error) {
      console.error(`Error renouncing ownership for ${tokenName}:`, error);
    }
  };

  const CheckIsAuctionActive = async () => {
    try {
      fetchTokenData({
        contractMethod: "isAuctionActive",
        setState: setisAuctionActive,
      });
    } catch (e) {
      console.error("Error fetching Auction Active:", e);
    }
  };

  const isRenounced = async () => {
    try {
      const results = {};

      const tokenMap = await ReturnfetchUserTokenAddresses();
      // Prefer resolved on-chain addresses if available from ContractContext
      const resolvedDav = AllContracts?._davAddress || AllContracts?.davContract?.target || getDavAddress();
      const resolvedState = AllContracts?._stateAddress || AllContracts?.stateContract?.target || getStateAddress();
      const extendedMap = {
        ...tokenMap,
        STATE: resolvedState,
        DAV: resolvedDav,
      };

      for (const [tokenName, TokenAddress] of Object.entries(extendedMap)) {
        const renouncing = await AllContracts.AuctionContract.isTokenRenounced(
          TokenAddress
        );
        const renouncingString = renouncing.toString();

        // Additional check for "state" token: verify owner is zero address
        let isOwnerZero = false;
        if (tokenName === "STATE") {
          const owner = await AllContracts.stateContract.owner();
          isOwnerZero =
            owner.toLowerCase() ===
            "0x0000000000000000000000000000000000000000";
        } else if (tokenName === "DAV") {
          const owner = await AllContracts.davContract.owner();
          isOwnerZero =
            owner.toLowerCase() ===
            "0x0000000000000000000000000000000000000000";
        }

        results[tokenName] =
          tokenName === "STATE"
            ? renouncingString === "true" && isOwnerZero
            : tokenName === "DAV"
              ? renouncingString === "true" && isOwnerZero
              : renouncingString;
      }

      setRenonced(results);
    } catch (e) {
      console.error("Error fetching renounce status:", e);
    }
  };

  const HasReverseSwappedAucton = async () => {
    await fetchTokenData({
      contractMethod: "getUserHasReverseSwapped",
      setState: setUserHasReverseSwapped,
      formatFn: (v) => v.toString(), // ensures consistent string output
      buildArgs: (tokenAddress) => [address, tokenAddress], // user address + token
    });
  };

  const HasSwappedAucton = async () => {
    await fetchTokenData({
      contractMethod: "getUserHasSwapped",
      setState: setUserHashSwapped,
      formatFn: (v) => v.toString(), // ensures consistent string output
      buildArgs: (tokenAddress) => [address, tokenAddress], // user address + token
    });
  };

  const isAirdropClaimed = async () => {
    await fetchTokenData({
      contractMethod: "hasCompletedStep1",
      setState: setAirdropClaimed,
      formatFn: (v) => v.toString(), // Convert boolean to string
      buildArgs: (tokenAddress) => [address, tokenAddress], // Pass user address and token address
    });
  };

  const AddressesFromContract = async () => {
    if (!AllContracts?.AuctionContract) {
      console.warn("AuctionContract not found");
      return;
    }

    try {
      const davAddress = await AllContracts.AuctionContract.dav();
      const stateAddress = await AllContracts.AuctionContract.stateToken();

      setDavAddress(davAddress);
      setStateAddress(stateAddress);
    } catch (error) {
      console.error("Error fetching addresses:", error);
    }
  };

  const fetchUserTokenAddresses = async () => {
    try {
      const map = await ReturnfetchUserTokenAddresses();
      setTokenMap(map);
    } catch (error) {
      console.error("Error fetching token data via lens:", error);
    }
  };


  const getTokenNamesForUser = async () => {
    try {
      const map = await ReturnfetchUserTokenAddresses();
      const names = Object.keys(map);
      setTokenNames(names);
      return names;
    } catch (error) {
      console.error("Failed to fetch token names via lens:", error);
      return [];
    }
  };

  const isTokenSupporteed = async () => {
    if (!AllContracts?.AuctionContract) {
      console.warn("AuctionContract not found");
      return;
    }

    const results = {};
    const tokenMap = await ReturnfetchUserTokenAddresses();

    try {
      for (const [tokenName, TokenAddress] of Object.entries(tokenMap)) {
        // Fetch support status (expecting a boolean or address)
        const isSupported = await AllContracts.AuctionContract.isTokenSupported(
          TokenAddress
        );

        // If it's an address and should check if valid or if it's a boolean, handle accordingly
        if (typeof isSupported === "boolean") {
          results[tokenName] = isSupported; // Directly store the boolean result
        } else if (
          isSupported &&
          isSupported !== "0x0000000000000000000000000000000000000000"
        ) {
          // If it's an address, check if it is a valid address
          results[tokenName] = true;
        } else {
          results[tokenName] = false;
        }
      }

      // Update state with results
      setIsSupported(results);
    } catch (error) {
      console.error("Error fetching token support status:", error);
    }
  };

  const ERC20Name_ABI = ["function name() view returns (string)"];

  const getTokenNamesByUser = async () => {
    if (!AllContracts?.AuctionContract || !provider) {
      console.warn("AuctionContract or provider not found");
      return;
    }

    try {
      const result = await AllContracts.AuctionContract.getTokensByOwner(
        address
      );
      const tokenAddresses = Array.isArray(result)
        ? [...result]
        : Object.values(result);

      const tokenData = await Promise.all(
        tokenAddresses.map(async (tokenAddr) => {
          try {
            const tokenContract = new ethers.Contract(
              tokenAddr,
              ERC20Name_ABI,
              provider
            );
            const name = await tokenContract.name();

            const pairAddress =
              await AllContracts.AuctionContract.getPairAddress(tokenAddr);
            const nextClaimTime =
              await AllContracts.AuctionContract.getAuctionTimeLeft(tokenAddr);

            return {
              address: tokenAddr,
              name,
              pairAddress,
              nextClaimTime: Number(nextClaimTime), // in seconds
            };
          } catch (err) {
            console.error(`Failed for token: ${tokenAddr}`, err);
            return {
              address: tokenAddr,
              name: "Unknown",
              pairAddress: "0x0000000000000000000000000000000000000000",
              nextClaimTime: null,
            };
          }
        })
      );

      setUsersSupportedTokens(tokenData); // [{ address, name, pairAddress }]
    } catch (error) {
      console.error("Error fetching token names or pair addresses:", error);
    }
  };

  const fetchBurnLpAmount = async () => {
    if (!AllContracts?.AuctionContract || !provider) {
      console.warn("AuctionContract or provider not found");
      return {};
    }

    try {
      // Step 1: Get all token addresses for user
      const tokenMap = await ReturnfetchUserTokenAddresses(); // { tokenName: tokenAddress }
      const ERC20_ABI = [
        "function balanceOf(address owner) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ];
      const targetAddress = "0x0000000000000000000000000000000000000369";

      const results = {};

      // Step 2: Loop through token map and fetch pair address + balance
      for (const [tokenName, tokenAddress] of Object.entries(tokenMap)) {
        try {
          // ✅ Fetch LP pair address for token
          const pairAddress = await AllContracts.AuctionContract.getPairAddress(tokenAddress);

          // ✅ Create ERC20 contract for LP token
          const lpTokenContract = new ethers.Contract(pairAddress, ERC20_ABI, provider);

          // ✅ Fetch balance & decimals in parallel
          const [balanceRaw, decimals] = await Promise.all([
            lpTokenContract.balanceOf(targetAddress),
            lpTokenContract.decimals()
          ]);

          // ✅ Format balance
          const formattedBalance = parseFloat(ethers.formatUnits(balanceRaw, decimals)).toFixed(0);

          results[tokenName] = {
            pairAddress,
            balance: formattedBalance
          };
        } catch (err) {
          const reason =
            err?.reason ||
            err?.shortMessage ||
            err?.error?.errorName ||
            err?.message ||
            "";

          console.error(`Error fetching LP data for ${tokenName}:`, reason || err);
        }
      }
      try {
        const statePairAddress = "0x5f5c53f62ea7c5ed39d924063780dc21125dbde7";
        const lpTokenContract = new ethers.Contract(statePairAddress, ERC20_ABI, provider);

        const [balanceRaw, decimals] = await Promise.all([
          lpTokenContract.balanceOf(targetAddress),
          lpTokenContract.decimals()
        ]);

  const formattedBalance = ethers.formatUnits(balanceRaw, decimals);

        results["STATE"] = {
          pairAddress: statePairAddress,
          balance: formattedBalance
        };
      } catch (err) {
        console.error("Error fetching STATE LP balance:", err);
        results["STATE"] = { pairAddress: "error", balance: "0" };
      }
      // Step 3: Update state once after loop
      setBurnLpAmount(results);
      return results;
    } catch (error) {
      console.error("Error fetching burn LP amounts:", error);
      return {};
    }
  };

  const setDavAndStateIntoSwap = async () => {
    if (!AllContracts?.AuctionContract || !address) return;

    try {
      const tx = await AllContracts.AuctionContract.setTokenAddress(
        getStateAddress(),
        getDavAddress()
      );
      await tx.wait();
      await AddressesFromContract();
    } catch (error) {
      console.error("Error fetching claimable amount:", error);
    }
  };
  const giveRewardForAirdrop = async (tokenAddress) => {
    if (!AllContracts?.AuctionContract || !address || !tokenAddress) {
      console.warn("Missing contract, user address, or token address");
      return;
    }
    // Validate tokenAddress
    if (!ethers.isAddress(tokenAddress)) {
      console.error("Invalid token address:", tokenAddress);
      return;
    }
    try {
      setIsCllaimProccessing(tokenAddress);

      const tx = await AllContracts.AuctionContract.giveRewardToTokenOwner(
        tokenAddress
      );
      await tx.wait();
      await initializeClaimCountdowns();
    } catch (error) {
      console.error("Error claiming reward:", error);
    } finally {
      setIsCllaimProccessing(null);
    }
  };

  const AddTokenIntoSwapContract = async (
    TokenAddress,
    PairAddress,
    Owner,
    name
  ) => {
    if (!AllContracts?.AuctionContract || !address) return;
    setTxStatusForAdding("initiated");
    try {
      // Replace these params if needed based on your contract's addToken function
      setTxStatusForAdding("Adding");
      const tx = await AllContracts.AuctionContract.addToken(
        TokenAddress,
        PairAddress,
        Owner
      );
      await tx.wait();
      setTxStatusForAdding("Status Updating");
      const tx2 = await AllContracts.davContract.updateTokenStatus(
        Owner,
        name,
        1
      );
      const receipt2 = await tx2.wait();
      if (receipt2.status === 1) {
        setTxStatusForAdding("confirmed");
        await CheckIsAuctionActive();
        await isTokenSupporteed(); // Corrected function name
      } else {
        console.error("Transaction failed");
        setTxStatusForAdding("error");
      }
      setTxStatusForAdding("confirmed");
    } catch (error) {
      const errorMessage =
        error.reason || error.message || "Unknown error occurred";
      console.error("AddTokenIntoSwapContract failed:", error);
      setTxStatusForAdding("");
      alert(`Failed to add token: ${errorMessage}`);
      console.error("AddTokenIntoSwapContract failed:", error?.reason || error);
    } finally {
      setTxStatusForAdding("confirmed");
    }
  };
  useEffect(() => {
    if (!AllContracts || !address) return;

    const runAuctionChecks = async () => {
      await CheckIsAuctionActive();
      await CheckIsReverse();
    };

    runAuctionChecks();

    // Set up polling to check auction status every 10 seconds
    const auctionPollingInterval = setInterval(() => {
      runAuctionChecks();
    }, 10000); // 10 seconds

    // Listen for account changes in MetaMask
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        console.log('Please connect to MetaMask.');
      } else if (accounts[0] !== address) {
        console.log('Account changed, refreshing data...');
        // Force refresh all data when account changes
        runAuctionChecks();
        fetchUserTokenAddresses();
        getInputAmount();
        getOutPutAmount();
        fetchBurnLpAmount();
        getCurrentAuctionCycle();
        getTokenRatio();
        getTokensBurned();
        getAirdropAmount();
        getPairAddresses();
        getTokenBalances();
        isAirdropClaimed();
        AddressesFromContract();
        isRenounced();
        getTokenNamesForUser();
        isTokenSupporteed();
        getTokenNamesByUser();
        HasSwappedAucton();
        HasReverseSwappedAucton();
      }
    };

    // Add event listener for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      clearInterval(auctionPollingInterval);
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
    };
  }, [AllContracts, address]);

  useEffect(() => {
    const functions = [
      fetchUserTokenAddresses,
      getInputAmount,
      getOutPutAmount,
      fetchBurnLpAmount,
      getCurrentAuctionCycle,
      getTokenRatio,
      getTokensBurned,
      getAirdropAmount,
      getPairAddresses,
      fetchDaiLastPrice,
      getTokenBalances,
      isAirdropClaimed,
      AddressesFromContract,
      isRenounced,
      getTokenNamesForUser,
      isTokenSupporteed,
      getTokenNamesByUser,
      HasSwappedAucton,
      HasReverseSwappedAucton,
      fetchPstateToPlsRatio,
    ];

    const runAll = async () => {
      const results = await Promise.allSettled(functions.map((fn) => fn()));
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            `Function ${functions[index].name} failed:`,
            result.reason
          );
        }
      });
    };

    runAll();

    // Set up polling to refresh all data every 30 seconds
    const dataPollingInterval = setInterval(() => {
      runAll();
    }, 30000); // 30 seconds

    return () => {
      clearInterval(dataPollingInterval);
    };
  }, [AllContracts, address]);

  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
  ];

  // Normal auction Step 2: Burn auction tokens for STATE (ratio swap)
  // Normal auction Step 2: Burn auction tokens for STATE (ratio swap)
  // Accept tokenAddress directly to avoid relying on token name lookups
  const performRatioSwap = async (id, tokenIdentifier, maybeTokenAddress) => {
    try {
      if (!AllContracts?.AuctionContract || !signer) {
        notifyError("Wallet or contract not ready");
        return;
      }

      setTxStatusForSwap("initiated");
      setSwappingStates((prev) => ({ ...prev, [id]: true }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Preparing burn..." }));

      // Resolve token address with robust fallbacks
      let tokenAddress = maybeTokenAddress;
      if (!tokenAddress) {
        // 1) From provided identifier against current token map
        tokenAddress = tokenIdentifier ? (tokenMap?.[tokenIdentifier]) : undefined;
      }
      if (!tokenAddress) {
        // 2) From latest lens mapping
        try {
          const latestMap = await ReturnfetchUserTokenAddresses();
          if (tokenIdentifier && latestMap?.[tokenIdentifier]) {
            tokenAddress = latestMap[tokenIdentifier];
          } else {
            // 3) From contract's today token (preferred when no selection)
            try {
              const todayInfo = await AllContracts.AuctionContract.getTodayToken();
              const todayAddr = todayInfo?.[0] || todayInfo?.tokenOfDay;
              if (todayAddr && todayAddr !== ethers.ZeroAddress) {
                tokenAddress = todayAddr;
              }
            } catch {}
            // 4) As a last resort, pick the first discovered token
            if (!tokenAddress && latestMap && Object.values(latestMap).length > 0) {
              tokenAddress = Object.values(latestMap)[0];
            }
          }
        } catch {}
      }
      if (!tokenAddress) {
        notifyError("No token selected and token-of-day unavailable. Please wait for tokens to load or select a token.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // On-chain window checks: Ratio Swap is only for normal auctions
      try {
        const [isRev, isActive] = await Promise.all([
          AllContracts.AuctionContract.isReverseAuctionActive(tokenAddress).catch(() => false),
          AllContracts.AuctionContract.isAuctionActive(tokenAddress).catch(() => false),
        ]);
        if (isRev) {
          notifyError("Reverse auction window is active. Ratio swap is unavailable during reverse auctions.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
        if (!isActive) {
          notifyError("Auction window not active. Try during the active window.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch (wErr) {
        console.debug("Window check skipped:", wErr?.message || wErr);
      }

      // Step 1 must be completed
      try {
        const done = await AllContracts.AuctionContract.hasCompletedStep1(address, tokenAddress);
        if (!done) {
          notifyError("Complete Step 1 (Airdrop claim) first.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch (s1Err) {
        console.debug("hasCompletedStep1 check skipped:", s1Err?.message || s1Err);
      }

      // Require >= 1 DAV available for this token
      try {
        const availableDav = await AllContracts.AuctionContract.getAvailableDavForAuction(address, tokenAddress);
        if (BigInt(availableDav) < ethers.parseEther("1")) {
          notifyError("Not enough DAV (need at least 1 DAV unit)." );
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch (davErr) {
        console.debug("DAV availability check skipped:", davErr?.message || davErr);
      }

      const auctionAddr = getAuctionAddress();
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      // Check allowance; approve max if needed (tokensToBurn is computed on-chain)
      setButtonTextStates((prev) => ({ ...prev, [id]: "Checking allowance..." }));
      const allowance = await tokenContract.allowance(address, auctionAddr);
      if (allowance === 0n) {
        try {
          setTxStatusForSwap("Approving");
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          const tx = await tokenContract.approve(auctionAddr, maxUint256);
          await tx.wait();
        } catch (approvalErr) {
          console.error("Approval failed:", approvalErr);
          notifyError("Approval failed");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap("error");
          return;
        }
      }

      // Call burnTokensForState (step 2)
      setButtonTextStates((prev) => ({ ...prev, [id]: "Burning for STATE..." }));
      setTxStatusForSwap("pending");
      const burnTx = await AllContracts.AuctionContract.burnTokensForState(tokenAddress);
      const receipt = await burnTx.wait();

      if (receipt.status === 1) {
  notifySuccess(`Ratio swap completed`);
        setTxStatusForSwap("confirmed");
        // Refresh dependent data
        await getOutPutAmount();
        await getTokensBurned();
      } else {
        notifyError("Burn transaction failed");
        setTxStatusForSwap("error");
      }
    } catch (error) {
      console.error("Ratio swap error:", error);
      if (error?.code === 4001) {
        setTxStatusForSwap("cancelled");
        notifyError("Transaction cancelled by user.");
      } else {
        let msg = error?.reason || error?.shortMessage || error?.error?.errorName || error?.message || "Burn failed";
        if (/NotToday/i.test(msg)) msg = "Not today's window for this token. Try the active window for the daily token.";
        if (/Step1NotCompleted/i.test(msg)) msg = "Complete Step 1 (Claim) before Ratio Swap.";
        if (/DavInsufficient/i.test(msg)) msg = "Not enough DAV (need >= 1 DAV unit).";
        if (/InsufficientAllowance/i.test(msg)) msg = "Token allowance is insufficient.";
        if (/UnsupportedToken/i.test(msg)) msg = "This token is not supported in the auction.";
        notifyError(msg);
        setTxStatusForSwap("error");
      }
    } finally {
      setSwappingStates((prev) => ({ ...prev, [id]: false }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Ratio Swap" }));
      // Update auction state flags
      await CheckIsAuctionActive();
      await HasSwappedAucton();
    }
  };

  const SwapTokens = async (id, tokenIdentifier, maybeTokenAddress) => {
    try {
      setTxStatusForSwap("initiated");
      setSwappingStates((prev) => ({ ...prev, [id]: true }));
      setButtonTextStates((prev) => ({
        ...prev,
        [id]: "Checking allowance...",
      }));

      const ContractAddressToUse = getAuctionAddress();
      // For NORMAL auction Step 3, swapTokens() spends STATE from the user.
      // Always approve STATE token to the SWAP contract (max approval).
      const stateTokenContract = new ethers.Contract(getStateAddress(), ERC20_ABI, signer);
      const allowance = await stateTokenContract.allowance(address, ContractAddressToUse);
      if (allowance === 0n) {
        setButtonTextStates((prev) => ({
          ...prev,
          [id]: "Approving STATE...",
        }));
        console.log("Insufficient allowance. Sending approval transaction...");

        try {
          setTxStatusForSwap("Approving");
          // Approve unlimited amount (max uint256)
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          const approveTx = await stateTokenContract.approve(
            ContractAddressToUse,
            maxUint256
          );
          await approveTx.wait();
          console.log("Approval successful!");
        } catch (approvalError) {
          console.error("Approval transaction failed:", approvalError);
          setButtonTextStates((prev) => ({ ...prev, [id]: "STATE approval failed" }));
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          setTxStatusForSwap("error");
          return false;
        }
      } else {
        console.log(
          "STATE allowance present. Proceeding to swap."
        );
      }

      setButtonTextStates((prev) => ({ ...prev, [id]: "Swapping..." }));
      setTxStatusForSwap("pending");
      // Resolve token address robustly (identifier, lens map, today token, first token)
      let tokenAddress = maybeTokenAddress || (tokenIdentifier ? tokenMap[tokenIdentifier] : undefined);
      if (!tokenAddress) {
        try {
          const latestMap = await ReturnfetchUserTokenAddresses();
          if (tokenIdentifier && latestMap?.[tokenIdentifier]) {
            tokenAddress = latestMap[tokenIdentifier];
          } else {
            try {
              const todayInfo = await AllContracts.AuctionContract.getTodayToken();
              const todayAddr = todayInfo?.[0] || todayInfo?.tokenOfDay;
              if (todayAddr && todayAddr !== ethers.ZeroAddress) tokenAddress = todayAddr;
            } catch {}
            if (!tokenAddress && latestMap && Object.values(latestMap).length > 0) {
              tokenAddress = Object.values(latestMap)[0];
            }
          }
        } catch {}
      }
      if (!tokenAddress) {
        notifyError("No token selected and token-of-day unavailable. Please wait for tokens to load or select a token.");
        setTxStatusForSwap("error");
        setSwappingStates((prev) => ({ ...prev, [id]: false }));
        return;
      }

      // Perform the token swap
      const swapTx = await AllContracts.AuctionContract.swapTokens(address, tokenAddress);
      const swapReceipt = await swapTx.wait();

      if (swapReceipt.status === 1) {
        console.log("Swap Complete!");
        setTxStatusForSwap("confirmed");
  notifySuccess(`Swap successful`);
        fetchStateHolding();
        setButtonTextStates((prev) => ({ ...prev, [id]: "Swap Complete!" }));
      } else {
        console.error("Swap transaction failed.");
        setTxStatusForSwap("error");
        setButtonTextStates((prev) => ({ ...prev, [id]: "Swap failed" }));
      }
      await CheckIsAuctionActive();
      await HasSwappedAucton();
      await HasReverseSwappedAucton();
    } catch (error) {
      console.error("Error during token swap:", error);

      // 👇 Detect user rejection
      if (error?.code === 4001) {
        setTxStatusForSwap("cancelled");
        notifyError("Transaction cancelled by user.")
        setButtonTextStates((prev) => ({ ...prev, [id]: "Cancelled" }));
        return;
      }

      setTxStatusForSwap("error");

      let errorMessage = "An error occurred during swap.";

      // Extract message from known places
      if (error?.reason) {
        errorMessage = error.reason;
      } else if (error?.data?.message) {
        errorMessage = error.data.message;
      } else if (error?.message) {
        errorMessage = error.message;
      }

      if (errorMessage.includes("execution reverted (unknown custom error)")) {
        errorMessage = "Check Token Balance on your account or Make Airdrop";
      }
      notifyError(errorMessage)
      setButtonTextStates((prev) => ({ ...prev, [id]: "Swap failed" }));
    } finally {
      // Reset swapping state
      setTxStatusForSwap("");
      setSwappingStates((prev) => ({ ...prev, [id]: false }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Swap Completed" }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Swap" }));
      await CheckIsAuctionActive();
      await HasSwappedAucton();
      await HasReverseSwappedAucton();
    }
  };

  const CheckMintBalance = async (TokenAddress) => {
    try {
      if (!AllContracts?.AuctionContract || !AllContracts?.airdropDistributor) {
        notifyError("Contracts not ready");
        return;
      }

      // Determine the correct token-of-the-day from the Auction contract
      const todayInfo = await AllContracts.AuctionContract.getTodayToken();
      const todayToken = todayInfo?.[0] || todayInfo?.tokenOfDay || todayInfo?.token || null;
      const active = todayInfo?.[1] ?? todayInfo?.active ?? undefined;

      // If token is zero, there's no schedule; otherwise proceed and rely on claimable check
      if (!todayToken || todayToken === ethers.ZeroAddress) {
        notifyError("No auction token scheduled for today");
        return;
      }

      // If available, use SwapLens to confirm the window is actually active now
      let debugActiveWindow = undefined;
      let debugSecondsLeft = undefined;
      let debugIsReverse = undefined;
      try {
        if (AllContracts?.swapLens && typeof AllContracts.swapLens.getTodayDashboard === "function") {
          const swapAddr = AllContracts.AuctionContract.target || AllContracts.AuctionContract.getAddress?.();
          const dash = await AllContracts.swapLens.getTodayDashboard(swapAddr);
          // Expect tuple: [tokenOfDay, activeWindow, isReverse, appearanceCount, secondsLeft]
          const dashToken = dash?.[0] || dash?.tokenOfDay;
          const activeWindow = dash?.[1] ?? dash?.activeWindow;
          const isReverse = dash?.[2] ?? dash?.isReverse;
          const secondsLeft = Number(dash?.[4] ?? dash?.secondsLeft ?? 0);
          debugActiveWindow = !!activeWindow;
          debugIsReverse = !!isReverse;
          debugSecondsLeft = secondsLeft;
          if (dashToken && todayToken && dashToken.toLowerCase() !== todayToken.toLowerCase()) {
            // Lens and swap disagree; proceed but warn
            console.warn("getTodayDashboard token mismatch with getTodayToken");
          }
          // If reverse window is active, claim is not allowed during reverse, provide a clear message
          if (debugIsReverse === true) {
            notifyError("Reverse auction window is active; Airdrop claim is only available during normal windows.");
            return;
          }
          // Do not block on activeWindow; we'll use claimable>0 as the primary gate and fall back to on-chain checks
        }
      } catch (lensErr) {
        console.debug("SwapLens getTodayDashboard check skipped:", lensErr?.message || lensErr);
      }

      // On-chain fallbacks for Active and time left
      let fallbackActive;
      try {
        const onchainActive = await AllContracts.AuctionContract.isAuctionActive(todayToken);
        if (typeof onchainActive === "boolean") fallbackActive = onchainActive;
      } catch {}
      if (debugActiveWindow === undefined || fallbackActive === undefined) {
        try {
          const left = await AllContracts.AuctionContract.getAuctionTimeLeft(todayToken);
          debugSecondsLeft = Number(left);
          if (fallbackActive === undefined) {
            // Treat positive time left as active when no explicit flag is provided
            fallbackActive = Number(left) > 0;
          }
        } catch {}
      }

      // If the provided TokenAddress doesn't match today's token, prefer today's token
      if (TokenAddress && TokenAddress.toLowerCase() !== todayToken.toLowerCase()) {
        console.warn("Selected token is not today's token. Using today's token for claim.");
      }

      // Pre-check claimable amount to avoid sending a 0-amount tx
      let debugClaimable = 0;
      try {
        const claimable = await AllContracts.airdropDistributor.getClaimable(todayToken, address);
        const amount = Array.isArray(claimable)
          ? (claimable[2] || 0n)
          : (claimable?.amount || 0n);
        if (BigInt(amount) === 0n) {
          notifyError("Nothing claimable right now (need >=1 DAV unit or already claimed)");
          return;
        }
        debugClaimable = Number(ethers.formatEther(amount));
      } catch (err) {
        // Non-fatal: continue with claim if getClaimable is unavailable in some environments
        console.debug("getClaimable check skipped:", err?.message || err);
      }

      // Compute a single effective Active flag for diagnostics
      const effectiveActive = (debugActiveWindow !== undefined ? debugActiveWindow :
                              (fallbackActive !== undefined ? fallbackActive :
                              (active !== undefined ? !!active :
                              (typeof debugSecondsLeft === 'number' ? debugSecondsLeft > 0 : undefined))));

      // Show diagnostic toast to help verify state on-chain
      try {
        const short = (a) => a ? `${a.slice(0,6)}…${a.slice(-4)}` : '0x0';
        toast.dismiss('claim-debug');
        toast((t) => `Today: ${short(todayToken)} • Active: ${effectiveActive ?? 'n/a'} • Rev: ${debugIsReverse ?? 'n/a'} • tLeft: ${debugSecondsLeft ?? 'n/a'}s • Claimable: ${debugClaimable}`, { id: 'claim-debug', duration: 4000 });
      } catch {}

  // Send the claim for today's token
  const tx = await AllContracts.airdropDistributor.claim(todayToken);
      await tx.wait();

      notifySuccess("Airdrop claimed");
      await isAirdropClaimed();
      await getInputAmount();
      await getOutPutAmount();
      await getTokensBurned();
    } catch (e) {
      console.error("Error claiming tokens:", e);
      let msg = e?.reason || e?.shortMessage || e?.error?.errorName || e?.message || "Claim failed";
      if (/NotToday/i.test(msg)) {
        msg = "Auction window not active for today's token (NotToday). Start the window or wait until it opens.";
      }
      notifyError(msg);
      throw e;
    }
  };

  const handleAddToken = async (
    tokenAddress,
    tokenSymbol,
    tokenDecimals = 18
  ) => {
    if (!window.ethereum) {
      toast.error("MetaMask is not installed.");
      return;
    }

    const tokenDetails = {
      type: "ERC20",
      options: {
        address: tokenAddress,
        symbol: tokenSymbol,
        decimals: tokenDecimals,
      },
    };

    // 👇 store toast ID so we can dismiss it later
    const toastId = toast.loading(`Adding ${tokenSymbol} to wallet...`);

    try {
      const wasAdded = await window.ethereum.request({
        method: "wallet_watchAsset",
        params: tokenDetails,
      });

      toast.dismiss(toastId); // ✅ always dismiss loading toast

      if (wasAdded) {
        toast.success(`${tokenSymbol} added to wallet!`);
      } else {
        toast("Token addition cancelled.");
      }
    } catch (err) {
      console.error(err);
      toast.dismiss(toastId); // ✅ dismiss loading toast on error
      toast.error(`Failed to add ${tokenSymbol}.`);
    }
  };

  // Fetch pSTATE to PLS ratio from API
  const fetchPstateToPlsRatio = async () => {
    try {
      const routerContract = new ethers.Contract(
        PULSEX_ROUTER_ADDRESS,
        PULSEX_ROUTER_ABI,
        signer
      );

      // 1 pSTATE (18 decimals)
      const onePstate = ethers.parseUnits("1", 18);

      // Path from pSTATE → WPLS
      const path = [getStateAddress(chainId), WPLS_ADDRESS];

      const amountsOut = await routerContract.getAmountsOut(onePstate, path);

      const plsAmount = amountsOut[amountsOut.length - 1];
      const plsAmountFormatted = ethers.formatUnits(plsAmount, 18);
      setPstateToPlsRatio(plsAmountFormatted.toString());
      console.log("pSTATE to PLS ratio:", plsAmountFormatted);

    } catch (err) {
      console.error("Error fetching pSTATE to PLS ratio:", err);
      return 0;
    }
  };
  // utils/cleanupSwaps.js (for example)
  function cleanupInactiveTokenSwaps() {
    const swaps = JSON.parse(localStorage.getItem("auctionSwaps") || "{}");
    if (!swaps[address]) return;

    for (const storedCycle of Object.keys(swaps[address])) {
      for (const tokenName of Object.keys(swaps[address][storedCycle])) {
        const isAuctionActive = IsAuctionActive?.[tokenName] === true;
        if (!isAuctionActive) {
          console.log(`Auction not active → deleting swaps for token = ${tokenName}`);
          delete swaps[address][storedCycle][tokenName];
        }
      }
      // cleanup empty cycle
      if (Object.keys(swaps[address][storedCycle]).length === 0) {
        delete swaps[address][storedCycle];
      }
    }

    // cleanup empty user
    if (Object.keys(swaps[address]).length === 0) {
      delete swaps[address];
    }

    localStorage.setItem("auctionSwaps", JSON.stringify(swaps));
  }
  // Helper: remove swap entry from localStorage safely
  function removeSwapFromLocalStorage(address, cycleId, id, tokenOutAddress) {
    const swaps = JSON.parse(localStorage.getItem("auctionSwaps") || "{}");
    if (swaps[address]?.[cycleId]?.[id]?.[tokenOutAddress]) {
      delete swaps[address][cycleId][id][tokenOutAddress];

      // Clean up empty objects to avoid deep empty nesting
      if (Object.keys(swaps[address][cycleId][id]).length === 0) {
        delete swaps[address][cycleId][id];
      }
      if (Object.keys(swaps[address][cycleId]).length === 0) {
        delete swaps[address][cycleId];
      }
      if (Object.keys(swaps[address]).length === 0) {
        delete swaps[address];
      }
      localStorage.setItem("auctionSwaps", JSON.stringify(swaps));
    }
  }

  const handleDexTokenSwap = async (
    id,
    amountIn,
    signer,
    address,
    tokenOutAddress,
    ERC20_ABI,
    stateAddress,
  ) => {
    // Input validation
    setTxStatusForSwap("initiated");
    cleanupInactiveTokenSwaps();
    setDexSwappingStates((prev) => ({ ...prev, [id]: true }));
    setDexButtonTextStates((prev) => ({
      ...prev,
      [id]: "fetching quote...",
    }));
    const swaps = JSON.parse(localStorage.getItem("auctionSwaps") || "{}");
    if (IsAuctionActive[tokenOutAddress] == "false") {
      if (swaps[address]?.[tokenOutAddress]) {
        notifyError("You have already swapped this token in this auction period.")
        return;
      }
    }

    if (!amountIn) {
      notifyError("Invalid input parameters.")
      return;
    }

    let swapContractAddress = null;
    const tokenInAddress = stateAddress;
    let quoteData = null;
    let pulseXData = null;
    try {
      console.log("chainid from swap fun", chainId)
      try {
        if (chainId === 369) {
          // ---- PulseX path ----
          const routerContract = new ethers.Contract(
            PULSEX_ROUTER_ADDRESS,
            PULSEX_ROUTER_ABI,
            signer
          );

          const parsedAmount = ethers.parseUnits(amountIn.toString(), 18);
          const path = [stateAddress, tokenOutAddress];
          const amounts = await routerContract.getAmountsOut(parsedAmount, path);
          const rawOut = amounts[amounts.length - 1];

          const deadline = Math.floor(Date.now() / 1000) + 60 * 20; // 20 mins
          swapContractAddress = PULSEX_ROUTER_ADDRESS;

          pulseXData = { routerContract, parsedAmount, rawOut, path, deadline };
        } else {
          // ---- Sushi path ----
          const amount = ethers.parseUnits(amountIn, 18).toString();
          const url = new URL(`https://api.sushi.com/swap/v7/${chainId}`);
          url.searchParams.set("tokenIn", tokenInAddress);
          url.searchParams.set("tokenOut", tokenOutAddress);
          url.searchParams.set("amount", amount);
          url.searchParams.set(
            "sender",
            address || "0x0000000000000000000000000000000000000000"
          );

          const response = await fetch(url);
          if (!response.ok) throw new Error("Quote fetch failed.");
          quoteData = await response.json();
          swapContractAddress = quoteData.to;
        }
      } catch (err) {
        console.error('Error fetching quote:', err);
        notifyError('Failed to fetch quote. Try again.')
        setDexSwappingStates((prev) => ({ ...prev, [id]: false })); // <-- reset here
        setTxStatusForSwap("error");
        return;
      }
    } catch (err) {
      console.error('Error in main try block:', err);
      notifyError('Unexpected error occurred. Try again.');
      setDexSwappingStates((prev) => ({ ...prev, [id]: false }));
      setTxStatusForSwap("error");
      return;
    }

    try {
      const contract = new ethers.Contract(stateAddress, ERC20_ABI, signer);
      const allowance = await contract.allowance(address, swapContractAddress);
      const amount = ethers.parseUnits(amountIn || '0', 18);
      const needsApproval = BigInt(allowance) < BigInt(amount);

      // Step 3: Approve if necessary
      if (needsApproval) {
        setDexButtonTextStates((prev) => ({
          ...prev,
          [id]: "Checking allowance...",
        }));
        setTxStatusForSwap("Approving");
        try {
          const maxUint256 = BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff');
          const tx = await contract.approve(swapContractAddress, maxUint256);
          await tx.wait();
        } catch (err) {
          console.error('Approval error:', err);
          setTxStatusForSwap("error");
          notifyError('Approval failed. Try again.')
          return;
        }
      }
    } catch (err) {
      console.error('Error checking allowance:', err);
      notifyError('Failed to check allowance. Try again.')
      setDexSwappingStates((prev) => ({ ...prev, [id]: false }));
      return;
    }

    try {
      setTxStatusForSwap("pending");
      setDexButtonTextStates((prev) => ({
        ...prev,
        [id]: "Swapping...",
      }));
      let tx;
      if (chainId === 369) {
        const { routerContract, parsedAmount, rawOut, path, deadline } = pulseXData;
        tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          parsedAmount,
          rawOut,
          path,
          address,
          deadline
        );
      } else {
        tx = await signer.sendTransaction({
          to: quoteData.to,
          data: quoteData.data,
        });
      }
      console.log('Transaction sent:', tx.hash);
      // Immediately store "pending" state in localStorage
      const pendingSwaps = {
        ...swaps,
        [address]: {
          ...(swaps[address] || {}),
          [String(CurrentCycleCount?.[id])]: {
            ...(swaps[address]?.[String(CurrentCycleCount?.[id])] || {}),
            [id]: {
              ...(swaps[address]?.[String(CurrentCycleCount?.[id])]?.[id] || {}),
              [tokenOutAddress]: "pending",
            },
          },
        },
      };
      localStorage.setItem("auctionSwaps", JSON.stringify(pendingSwaps));

      tx.wait().then((receipt) => {
        console.log('Transaction confirmed:', receipt.transactionHash);
        notifySuccess(`Swap successful with ${id} token for ${amountIn}`);
        // Update to confirmed
        const updatedSwaps = JSON.parse(localStorage.getItem("auctionSwaps") || "{}");
        updatedSwaps[address][String(CurrentCycleCount?.[id])][id][tokenOutAddress] = true;
        localStorage.setItem("auctionSwaps", JSON.stringify(updatedSwaps));
        setTxStatusForSwap("confirmed");
        fetchStateHolding();
      }).catch((err) => {
        console.error('Swap failed:', err);
        notifyError('Swap failed');
        setTxStatusForSwap("error");
        removeSwapFromLocalStorage(address, String(CurrentCycleCount?.[id]), id, tokenOutAddress);
      })
    } catch (err) {
      setTxStatusForSwap("error");
      console.error('Swap failed:', err);
      if (err?.code === 4001) {
        setTxStatusForSwap("cancelled");
        notifyError("Transaction cancelled by user.")
        removeSwapFromLocalStorage(address, String(CurrentCycleCount?.[id]), id, tokenOutAddress);
        return;
      }
      setDexSwappingStates((prev) => ({ ...prev, [id]: false }));
      setTxStatusForSwap("error");
      removeSwapFromLocalStorage(address, String(CurrentCycleCount?.[id]), id, tokenOutAddress);

    } finally {
      setDexSwappingStates((prev) => ({ ...prev, [id]: false }));
    }
  };

  const fetchDaiLastPrice = async () => {
    try {
  const url = geckoPoolsForTokenApiUrl(369, '0xa1077a294dde1b09bb078844df40758a5d0f9a27', 1);
  const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch DAI price');
      const data = await response.json();
      // Take the first pool result
      const pool = data.data[0];
      const priceChange24h = pool.attributes.price_change_percentage.h24;

      console.log("DAI 24h price change %:", priceChange24h);
      setDaiPriceChange(priceChange24h);
    } catch (error) {
      console.error("Error fetching DAI price:", error);
    }
  }
  return (
    <SwapContractContext.Provider
      value={{
        //WALLET States
        provider,
        signer,
        loading,
        address,
        handleDexTokenSwap,
  performRatioSwap,
        CalculationOfCost,
        setDexSwappingStates,
        DexswappingStates,
        UsersSupportedTokens,
        TotalCost,
        isAirdropClaimed,
        setClaiming,
        TokenBalance,
        claiming,
        SwapTokens,
        setDavAndStateIntoSwap,
        handleAddToken,
        // setReverseEnable,
        userHashSwapped,
        userHasReverseSwapped,
        isCliamProcessing,
        isTokenRenounce,
        // WithdrawLPTokens,
        AddTokenIntoSwapContract,
        isTokenSupporteed,
        burnedAmount,
        buttonTextStates,
        DexbuttonTextStates,
        DavAddress,
        StateAddress,
        StateBalance,
        swappingStates,
        getStateTokenBalanceAndSave,
        TokenPariAddress,
        AuctionTime,
        txStatusForSwap,
        fetchUserTokenAddresses,
        AirdropClaimed,
        isReversed,
        InputAmount,
        burnedLPAmount,
        DaipriceChange,
        setTxStatusForSwap,
        AirDropAmount,
        getAirdropAmount,
        supportedToken,
        OutPutAmount,
        CurrentCycleCount,
        giveRewardForAirdrop,
        CheckMintBalance,
        getInputAmount,
        TokenNames,
        getOutPutAmount,
        txStatusForAdding,
        setTxStatusForAdding,
        TimeLeftClaim,
        renounceTokenContract,
        tokenMap,
        IsAuctionActive,
        TokenRatio,
        pstateToPlsRatio,
      }}
    >
      {children}
    </SwapContractContext.Provider>
  );
};
SwapContractProvider.propTypes = {
  children: PropTypes.node.isRequired,
};