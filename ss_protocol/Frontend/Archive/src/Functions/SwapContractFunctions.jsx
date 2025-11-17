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
import { getRuntimeConfigSync } from "../Constants/RuntimeConfig";
import { getAuctionTiming, formatDuration } from "../utils/auctionTiming";

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
  // Chain-anchored absolute end timestamps (in seconds since epoch) keyed by token name
  const [AuctionEndAt, setAuctionEndAt] = useState({});
  // Measured skew between chain time and local wall clock (chainNow - localNowSec)
  const [chainTimeSkew, setChainTimeSkew] = useState(0);
  const auctionEndAtRef = useRef({});
  const chainSkewRef = useRef(0);
  const [TokenPariAddress, setPairAddresses] = useState({});
  const [CurrentCycleCount, setCurrentCycleCount] = useState({});
  const [OutPutAmount, setOutputAmount] = useState({});
  const [TokenRatio, setTokenRatio] = useState({});
  const [TimeLeftClaim, setTimeLeftClaim] = useState({});
  const [burnedAmount, setBurnedAmount] = useState({});
  const [burnedLPAmount, setBurnLpAmount] = useState({});
  const [reverseStateMap, setReverseStateMap] = useState({});
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
  
  // State for dynamically detected auction timing
  const [auctionDuration, setAuctionDuration] = useState(null);
  const [auctionInterval, setAuctionInterval] = useState(null);

  const CalculationOfCost = async (amount) => {
    if (chainId == 146) {
      setTotalCost(ethers.parseEther((amount * 100).toString()));
    } else {
      try {
        // Check if contract exists and is initialized
        if (!AllContracts?.davContract || !amount) {
          setTotalCost(ethers.parseEther((amount * 500).toString())); // Default 500 PLS
          return;
        }
        // Get DavMintFee directly from the contract
        const davMintFee = await AllContracts.davContract.TOKEN_COST();
        const davMintFeeFormatted = parseFloat(ethers.formatUnits(davMintFee, 18));
        setTotalCost(ethers.parseEther((amount * davMintFeeFormatted).toString()));
      } catch (error) {
        console.error("Error getting DavMintFee:", error);
        // Fallback to 500 PLS (the actual TOKEN_COST value)
        setTotalCost(ethers.parseEther((amount * 500).toString()));
      }
    }
  };

  // Fix the fetchUserTokenAddresses function to handle tokens properly after buy & burn pool creation
  const ReturnfetchUserTokenAddresses = async () => {
    // Only require AuctionContract; remove unsupported SwapLens fallback
    if (!AllContracts?.AuctionContract) {
      console.warn("AuctionContract not available");
      return {};
    }

    try {
      // Get registered tokens from the auction contract
      const tokenCount = await AllContracts.AuctionContract.tokenCount?.().catch(() => 0);
      const tokenMap = {};

      for (let i = 0; i < tokenCount; i++) {
        try {
          const tokenAddress = await AllContracts.AuctionContract.autoRegisteredTokens(i);
          if (tokenAddress && tokenAddress !== ethers.ZeroAddress) {
            const tokenContract = new ethers.Contract(
              tokenAddress,
              [
                'function name() view returns (string)',
                'function symbol() view returns (string)'
              ],
              AllContracts.AuctionContract.runner || provider
            );

            const [name] = await Promise.all([
              tokenContract.name().catch(() => `Token${i}`),
              tokenContract.symbol().catch(() => 'TKN')
            ]);

            tokenMap[name] = tokenAddress;
          }
        } catch (err) {
          console.warn(`Failed to fetch token at index ${i}:`, err);
        }
      }

      return tokenMap;
    } catch (error) {
      console.error("Error in ReturnfetchUserTokenAddresses:", error);
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

  const HTTP_RPC_URL = "https://rpc.pulsechain.com"; // Use reliable RPC
  const httpProvider = new ethers.JsonRpcProvider(HTTP_RPC_URL);

    useEffect(() => {
    let countdownInterval;
    let resyncInterval;
    let isActive = true;
    let wsProvider = null;
    let wsConnected = false;
    let lastWsRefresh = 0;

    // WebSocket disabled to prevent connection issues - using polling instead
    const setupWebSocketListeners = () => {
      // WebSocket functionality disabled - using HTTP polling instead
      // This prevents "Insufficient resources" and "provider destroyed" errors
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

        // Simplified approach: Just get today's active token and its time left
        try {
          // Use a read-only provider to avoid stale signer runners
          const readOnlyAuction = AllContracts.AuctionContract.connect(httpProvider);
          const [todayToken, isAuctionActive] = await readOnlyAuction.getTodayToken();
          
          if (todayToken && todayToken !== ethers.ZeroAddress && isAuctionActive) {
            const timeLeft = await readOnlyAuction.getAuctionTimeLeft(todayToken);
            const timeLeftNumber = Math.max(0, Math.floor(Number(timeLeft)));

            // Get token name using httpProvider as fallback
            const currentProvider = wsConnected ? wsProvider : httpProvider;
            const tokenContract = new ethers.Contract(
              todayToken,
              ['function symbol() view returns (string)'],
              currentProvider
            );
            const tokenName = await tokenContract.symbol().catch(() => 'Unknown');

            // Anchor endAt to on-chain block time to avoid local clock drift
            let chainNowSec = 0;
            try {
              const latestBlock = await currentProvider.getBlock('latest');
              chainNowSec = Number(latestBlock?.timestamp || 0);
            } catch (e) {
              chainNowSec = 0;
            }
            const localNowSec = Math.floor(Date.now() / 1000);
            const effectiveNow = chainNowSec > 0 ? chainNowSec : localNowSec;
            const endAt = effectiveNow + timeLeftNumber;
            // Save chain-anchored endAt and measured skew
            setAuctionEndAt({ [tokenName]: endAt });
            if (chainNowSec > 0) setChainTimeSkew(chainNowSec - localNowSec);

            // Also expose remaining seconds immediately
            setAuctionTime({ [tokenName]: timeLeftNumber });

            if (showLogs) {
              console.log(`✅ Auction time for ${tokenName}: ${timeLeftNumber}s (fresh from RPC, endAt=${endAt})`);
            }
          } else {
            if (showLogs) {
              console.log("⚠️ No active auction today");
            }
            setAuctionTime({});
            setAuctionEndAt({});
          }
        } catch (err) {
          console.error("❌ Error fetching today's auction:", err);
          setAuctionTime({});
          // Keep previous endAt to avoid flicker on transient errors
        }
      } catch (err) {
        console.error("❌ Error fetching auction times:", err);
        setAuctionTime({});
      }
    };

    const startCountdown = () => {
      if (countdownInterval) clearInterval(countdownInterval);

      countdownInterval = setInterval(() => {
        if (!isActive) return;

        setAuctionTime((prev) => {
          const endMap = auctionEndAtRef.current || {};
          const keys = Object.keys(endMap);
          if (keys.length === 0) {
            return prev; // nothing to tick
          }

          const nowSec = Math.floor(Date.now() / 1000) + (chainSkewRef.current || 0);
          const updated = {};
          let hasChanges = false;

          for (const token of keys) {
            const endAt = Number(endMap[token] || 0);
            const newTime = Math.max(0, Math.floor(endAt - nowSec));
            const oldTime = typeof prev[token] === 'number' ? prev[token] : undefined;
            updated[token] = newTime;
            if (oldTime !== newTime) hasChanges = true;

            // Log when auctions are about to end (use dynamic duration)
            const fiveMinutes = 300;
            const oneMinute = 60;
            
            if (newTime === fiveMinutes && oldTime !== fiveMinutes) {
              const duration = auctionDuration || fiveMinutes;
              const minutesLeft = Math.floor(newTime / 60);
              console.log(`⏰ ${token} auction ending in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}!`);
              CheckIsAuctionActive?.();
              CheckIsReverse?.();
            } else if (newTime === oneMinute && oldTime !== oneMinute) {
              console.log(`🚨 ${token} auction ending in 1 minute!`);
            } else if (newTime === 0 && (oldTime || 0) > 0) {
              console.log(`🏁 ${token} auction ended!`);
              // Trigger immediate fresh fetch on window rollover
              if (isActive) {
                fetchAuctionTimes(false);
                try { CheckIsAuctionActive(); CheckIsReverse(); getTokenRatio(); } catch {}
              }
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
      }, 30000); // 30s resync for fresher state

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
    
    // Detect and cache auction timing from blockchain
    const detectAndCacheTiming = async () => {
      if (!AllContracts?.AuctionContract) return;
      
      try {
        const timing = await getAuctionTiming(AllContracts.AuctionContract);
        setAuctionDuration(timing.duration);
        setAuctionInterval(timing.interval);
        console.log(`📏 Auction timing detected - Duration: ${timing.durationFormatted}, Interval: ${timing.intervalFormatted}`);
      } catch (error) {
        console.error('Error detecting auction timing:', error);
      }
    };
    
    // Detect timing on initialization
    detectAndCacheTiming();

    // Setup WebSocket connection (non-blocking)
  const detachWs = setupWebSocketListeners();

  // Keep refs in sync
  auctionEndAtRef.current = AuctionEndAt;
  chainSkewRef.current = chainTimeSkew;

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

      // Detach block listener if attached
      try { detachWs && detachWs(); } catch {}
    };
    // Keep refs updated when state changes
  }, [AllContracts]);

  // Keep the refs synchronized with state outside the effect above
  useEffect(() => {
    auctionEndAtRef.current = AuctionEndAt;
  }, [AuctionEndAt]);
  useEffect(() => {
    chainSkewRef.current = chainTimeSkew;
  }, [chainTimeSkew]);

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
      // Preserve decimals to avoid rounding small ratios to 0
      formatFn: (v) => Number(ethers.formatEther(v)),
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
        buildArgs: (tokenAddress) => [tokenAddress], // Pass token address as parameter
      });
    } catch (e) {
      console.error("Error fetching burned amounts:", e);
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
          httpProvider  // Use httpProvider instead of provider
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
      const tokenContract = new ethers.Contract(stateAddress, ERC20_ABI, httpProvider);  // Use httpProvider
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
    console.log('[CheckIsReverse] Starting reverse auction check...');
    await fetchTokenData({
      contractMethod: "isReverseAuctionActive",
      setState: setIsReverse,
    });
    console.log('[CheckIsReverse] Reverse auction check complete');
  };

  // Diagnostic helper - exposed for debugging
  const diagnosticAuctionStatus = async () => {
    try {
      console.log('=== AUCTION DIAGNOSTIC ===');
      
      // Get today's token
      const todayInfo = await AllContracts.AuctionContract.getTodayToken();
      const todayAddr = todayInfo?.[0] || todayInfo?.tokenOfDay;
      console.log('Today\'s Token Address:', todayAddr);
      
      if (!todayAddr || todayAddr === ethers.ZeroAddress) {
        console.log('❌ No active token');
        return;
      }
      
      // Check auction active
      const isActive = await AllContracts.AuctionContract.isAuctionActive(todayAddr);
      console.log('Is Auction Active:', isActive);
      
      // Check reverse active
      const isReverse = await AllContracts.AuctionContract.isReverseAuctionActive(todayAddr);
      console.log('Is Reverse Auction:', isReverse);
      
      // Get time left
      const timeLeft = await AllContracts.AuctionContract.getAuctionTimeLeft(todayAddr);
      console.log('Time Left (seconds):', timeLeft.toString());
      
      // Get current cycle count
      const cycle = await AllContracts.AuctionContract.getCurrentAuctionCycle(todayAddr);
      console.log('Current Cycle Count:', cycle.toString());
      
      console.log('=== END DIAGNOSTIC ===');
      
      return {
        todayAddress: todayAddr,
        isActive,
        isReverse,
        timeLeft: timeLeft.toString(),
        cycle: cycle.toString()
      };
    } catch (e) {
      console.error('Diagnostic error:', e);
      throw e;
    }
  };
  
  // Expose to window for easy console access
  if (typeof window !== 'undefined') {
    window.auctionDiagnostic = diagnosticAuctionStatus;
  }

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
        // isTokenRenounced function doesn't exist in current contract
        // Default to checking owner == zero address only
        let renouncing = false;
        
        // Check if owner is zero address (renounced)
        try {
          if (tokenName === "STATE") {
            const owner = await AllContracts.stateContract.owner();
            renouncing = owner.toLowerCase() === "0x0000000000000000000000000000000000000000";
          } else if (tokenName === "DAV") {
            const owner = await AllContracts.davContract.owner();
            renouncing = owner.toLowerCase() === "0x0000000000000000000000000000000000000000";
          } else {
            // For other tokens, try to check owner
            const tokenContract = new ethers.Contract(
              TokenAddress,
              ['function owner() view returns (address)'],
              provider
            );
            const owner = await tokenContract.owner();
            renouncing = owner.toLowerCase() === "0x0000000000000000000000000000000000000000";
          }
        } catch (err) {
          console.warn(`Could not check renounce status for ${tokenName}:`, err);
          renouncing = false;
        }

        results[tokenName] = renouncing;
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
      // Fetch token count from the contract
      const tokenCount = await AllContracts.AuctionContract.tokenCount().catch(() => 0);
      const totalTokens = Number(tokenCount);
      
      if (totalTokens === 0) {
        setUsersSupportedTokens([]);
        return;
      }

      const tokenData = [];
      
      // Fetch all registered tokens from autoRegisteredTokens array
      for (let i = 0; i < totalTokens; i++) {
        try {
          const tokenAddr = await AllContracts.AuctionContract.autoRegisteredTokens(i);
          
          // Skip zero addresses
          if (!tokenAddr || tokenAddr === ethers.ZeroAddress) {
            continue;
          }

          const tokenContract = new ethers.Contract(
            tokenAddr,
            ERC20Name_ABI,
            provider
          );
          
          const name = await tokenContract.name().catch(() => `Token ${i + 1}`);
          const pairAddress = await AllContracts.AuctionContract.getPairAddress(tokenAddr).catch(() => ethers.ZeroAddress);
          const nextClaimTime = await AllContracts.AuctionContract.getAuctionTimeLeft(tokenAddr).catch(() => 0);

          tokenData.push({
            address: tokenAddr,
            name,
            pairAddress,
            nextClaimTime: Number(nextClaimTime),
          });
        } catch (err) {
          console.error(`Failed to fetch token at index ${i}:`, err);
        }
      }

      setUsersSupportedTokens(tokenData);
    } catch (error) {
      console.error("Error fetching token names or pair addresses:", error);
      setUsersSupportedTokens([]);
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
      const TOKEN_META_ABI = [
        "function symbol() view returns (string)",
        "function name() view returns (string)"
      ];
  // Use the canonical burn address where LP tokens are sent
  const targetAddress = "0x000000000000000000000000000000000000dEaD";

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

          // ✅ Format balance as a number (integer LP tokens)
          const formatted = Number(ethers.formatUnits(balanceRaw, decimals));
          const numericBalance = Math.floor(Number.isFinite(formatted) ? formatted : 0);

          // Also fetch token symbol to key under symbol and address for robust lookups
          let tokenSymbol = "";
          try {
            const tokenContract = new ethers.Contract(tokenAddress, TOKEN_META_ABI, provider);
            tokenSymbol = await tokenContract.symbol().catch(() => "");
          } catch {}

          const entry = { pairAddress, balance: numericBalance };

          // Key by tokenMap key (often name)
          results[tokenName] = entry;
          // Key by token symbol if available
          if (tokenSymbol) results[tokenSymbol] = entry;
          // Key by address (lowercased)
          if (tokenAddress) results[(tokenAddress || "").toLowerCase()] = entry;
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
        // Prefer Buy & Burn controller's STATE/WPLS pool for STATE token
        let statePairAddress = null;
        try {
          if (AllContracts?.buyBurnController && typeof AllContracts.buyBurnController.stateWplsPool === 'function') {
            statePairAddress = await AllContracts.buyBurnController.stateWplsPool();
          }
        } catch {}
        if (!statePairAddress || statePairAddress === ethers.ZeroAddress) {
          // Fallback to AuctionContract mapping
          const stateAddr = getSTATEContractAddress(chainId);
          statePairAddress = await AllContracts.AuctionContract.getPairAddress(stateAddr);
        }
        const lpTokenContract = new ethers.Contract(statePairAddress, ERC20_ABI, provider);

        const [balanceRaw, decimals] = await Promise.all([
          lpTokenContract.balanceOf(targetAddress),
          lpTokenContract.decimals()
        ]);

        const formatted = Number(ethers.formatUnits(balanceRaw, decimals));
        const numericBalance = Math.floor(Number.isFinite(formatted) ? formatted : 0);

        const entry = { pairAddress: statePairAddress, balance: numericBalance };
        results["STATE"] = entry;
        results[(getSTATEContractAddress(chainId) || "").toLowerCase()] = entry;
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

  // Ensure LP burned amounts are fetched on init and when environment changes
  useEffect(() => {
    if (!AllContracts?.AuctionContract || !provider) return;
    try { fetchBurnLpAmount(); } catch {}
    // Optionally refresh periodically (lightweight)
    const id = setInterval(() => {
      try { fetchBurnLpAmount(); } catch {}
    }, 60000); // 60s
    return () => clearInterval(id);
  }, [AllContracts?.AuctionContract, provider, address, chainId]);

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
    "function decimals() view returns (uint8)",
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

      // Call burnTokensForState (step 2) - no parameters, auto-detects today's token
      setButtonTextStates((prev) => ({ ...prev, [id]: "Burning for STATE..." }));
      setTxStatusForSwap("pending");
      const burnTx = await AllContracts.AuctionContract.burnTokensForState();
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

  // Reverse auction Step 1: burn auction tokens to receive STATE
  const performReverseSwapStep1 = async (id, tokenIdentifier, maybeTokenAddress) => {
    try {
      if (!AllContracts?.AuctionContract || !signer) {
        notifyError("Wallet or contract not ready");
        return;
      }

      setTxStatusForSwap("initiated");
      setSwappingStates((prev) => ({ ...prev, [id]: true }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Preparing reverse swap..." }));

      // Resolve token address
      let tokenAddress = maybeTokenAddress;
      if (!tokenAddress) {
        tokenAddress = tokenIdentifier ? (tokenMap?.[tokenIdentifier]) : undefined;
      }
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
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Must be reverse window
      const isRev = await AllContracts.AuctionContract.isReverseAuctionActive(tokenAddress).catch(() => false);
      if (!isRev) {
        notifyError("Normal auction window active. Reverse swap is only available in reverse windows.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Preflight checks to avoid on-chain custom error reverts
      try {
        const supported = await AllContracts.AuctionContract.isTokenSupported(tokenAddress);
        if (!supported) {
          notifyError("This token is not supported in the auction.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}
      try {
        const can = await AllContracts.AuctionContract.canParticipateInAuction(address, tokenAddress);
        if (!can) {
          notifyError("Not enough DAV (need >= 1 DAV unit).");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}
      try {
        const already = await AllContracts.AuctionContract.hasUserCompletedReverseStep1(address, tokenAddress);
        if (already) {
          notifyError("You already completed Reverse Step 1 for this cycle.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}

      // Note: Some deployments may require normal Step 2 completion before reverse Step 1.
      // Do NOT block here. We'll rely on simulation to surface a precise custom error (Step2NotCompleted) when applicable.
      try {
        if (typeof AllContracts.AuctionContract.hasCompletedStep2 === 'function') {
          const hasStep2 = await AllContracts.AuctionContract.hasCompletedStep2(address, tokenAddress);
          console.debug('Preflight hasCompletedStep2:', hasStep2);
        }
      } catch (e) {
        console.debug('hasCompletedStep2 preflight check skipped:', e?.message || e);
      }

      // Use user's entire token balance for reverse swap (consistent with UI estimate)
      const tokenCtr = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      let decimals = 18;
      try { decimals = Number(await tokenCtr.decimals()); } catch {}
      
      // Get user's actual token balance
      const bal = await tokenCtr.balanceOf(address);
      if (!bal || BigInt(bal) === 0n) {
        notifyError("You have no tokens to swap for reverse auction");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }
      
      // Use the full balance for the swap
      const unitToBurn = bal;

      // Approve if needed
      setButtonTextStates((prev) => ({ ...prev, [id]: "Checking allowance..." }));
      const auctionAddr = getAuctionAddress();
      const allowance = await tokenCtr.allowance(address, auctionAddr);
      if (allowance < unitToBurn) {
        try {
          setTxStatusForSwap("Approving");
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          const tx = await tokenCtr.approve(auctionAddr, maxUint256);
          await tx.wait();
        } catch (approvalErr) {
          console.error("Approval failed:", approvalErr);
          notifyError("Approval failed");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap("error");
          return;
        }
      }

      // Optional: sanity-check expected STATE out before sending
      try {
        const preview = await AllContracts.AuctionContract.calculatePoolSwapOutputReverse(tokenAddress, unitToBurn);
        if (!preview || BigInt(preview) === 0n) {
          notifyError("Pool returned zero output for this amount.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}

      // Execute reverse step 1 - contract auto-detects today's token, only needs amount
      setButtonTextStates((prev) => ({ ...prev, [id]: "Swapping for STATE..." }));
      setTxStatusForSwap("pending");

      // Call reverseSwapTokensForState with only tokenAmount parameter
      let selected;
      try {
        // Ensure function exists in ABI
        AllContracts.AuctionContract.interface.getFunction('reverseSwapTokensForState(uint256)');
        const fn = AllContracts.AuctionContract.getFunction('reverseSwapTokensForState(uint256)');
        // Simulate first to surface precise errors and avoid wallet popup on revert
        await fn.staticCall(unitToBurn);
        console.log('✅ Reverse Step 1 simulation passed with: reverseSwapTokensForState(uint256)');
        selected = { key: 'reverseSwapTokensForState(uint256)', args: [unitToBurn] };
      } catch (simErr) {
        console.error("❌ Reverse Step 1 simulation failed:", simErr);
        console.error("Full error object:", JSON.stringify(simErr, null, 2));
        
        // Enhanced error decoding with multiple fallback strategies
        let errName = simErr?.errorName || simErr?.data?.errorName || simErr?.error?.errorName || simErr?.info?.error?.data?.errorName;
        let errorData = simErr?.data 
          || simErr?.error?.data?.data 
          || simErr?.error?.data 
          || simErr?.info?.error?.data?.data
          || (typeof simErr?.info?.error?.data === 'string' ? simErr.info.error.data : null);
        
        console.log('Extracted errorData:', errorData);
        console.log('Initial errName:', errName);
        
        // Try multiple parsing strategies
        if (!errName && errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
          try {
            const parsed = AllContracts.AuctionContract.interface.parseError(errorData);
            if (parsed) {
              errName = parsed.name;
              console.log('✅ Manually decoded error:', errName, parsed.args);
            }
          } catch (parseErr) {
            console.warn('Failed to parse error with interface:', parseErr);
          }
          
          // Try to identify error by signature (first 4 bytes)
          if (!errName && errorData.length >= 10) {
            const selector = errorData.slice(0, 10);
            console.log('Error selector:', selector);
            
            // Map common error selectors
            const errorMap = {
              '0x82b42900': 'Unauthorized',
              '0xd1f28288': 'PausedErr',
              '0xf90c0e6d': 'UnsupportedToken',
              '0xd92e233d': 'ZeroAddr',
              '0xbb960071': 'AlreadySet',
              '0x1f160453': 'ScheduleNotSet',
              '0xcc72e663': 'NotStarted',
              '0xfa3ce4f4': 'NotToday',
              '0x136e3cff': 'Ended',
              '0x5f0bdd17': 'AlreadySwapped',
              '0x5e7e83f6': 'AlreadyReverse',
              '0x1a24c079': 'StateNotSet',
              '0x2d94f3b9': 'DavInsufficient',
              '0xb14e1ab9': 'NoDAV',
              '0xf4d678b8': 'InsufficientBalance',
              '0x13be252b': 'InsufficientAllowance',
              '0x4f2c0c96': 'InsufficientVault',
              '0x81b3b602': 'AmountZero',
              '0xecd0596b': 'ReverseDayLPOonly',
              '0x8a69b83f': 'ParticipantCapReached',
              '0x5341e942': 'Step1NotCompleted',
              '0x6f312cbd': 'Step2NotCompleted',
            };
            
            if (errorMap[selector]) {
              errName = errorMap[selector];
              console.log('✅ Identified error by selector:', errName);
            }
          }
        }
        
        let simMsg = simErr?.reason || simErr?.shortMessage || simErr?.message || simErr?.toString() || "Reverse swap simulation failed";
        
        // Decode known custom errors
        if (errName === 'UnsupportedToken') simMsg = "This token is not supported in the auction.";
        else if (errName === 'StateNotSet') simMsg = "STATE token is not configured yet.";
        else if (errName === 'NotStarted') simMsg = "Reverse window not active yet.";
        else if (errName === 'AlreadySwapped' || errName === 'AlreadyReverse') simMsg = "You already completed Reverse Step 1 for this cycle.";
        else if (errName === 'DavInsufficient' || errName === 'NoDAV') simMsg = "Not enough DAV (need >= 1 DAV unit).";
        else if (errName === 'AmountZero') simMsg = "Amount must be greater than zero.";
        else if (errName === 'InsufficientBalance') simMsg = "Insufficient token balance for reverse swap.";
        else if (errName === 'InsufficientAllowance') simMsg = "Token allowance is insufficient.";
        else if (errName === 'InsufficientVault') simMsg = "Vault has insufficient STATE for this swap.";
        else if (errName === 'ReverseDayLPOonly') simMsg = "Reverse day LP-only restriction active; action unavailable.";
        else if (errName === 'ParticipantCapReached') simMsg = "Participant cap reached for auctions.";
        else if (errName === 'ScheduleNotSet') simMsg = "Auction schedule is not set.";
        else if (errName === 'Ended') simMsg = "Auction period has ended.";
        else if (errName === 'NotToday') simMsg = "Not today's window for this token.";
        else if (errName === 'Step1NotCompleted') simMsg = "Complete Step 1 (Claim) before Ratio Swap.";
        else if (errName === 'Step2NotCompleted') simMsg = "Complete Step 2 (Burn Tokens for STATE) first. Reverse Step 1 requires you to have burned auction tokens in the normal auction first.";
        else if (errName === 'PausedErr') simMsg = "Contract is paused.";
        else if (errName === 'Unauthorized') simMsg = "Unauthorized action.";
        else if (errName === 'ZeroAddr') simMsg = "Invalid zero address.";
        
        console.log('Final message:', simMsg);
        
        // If still generic, provide detailed diagnostics
        if (simMsg.includes('unknown custom error') || simMsg.includes('execution reverted')) {
          const selector = errorData?.length >= 10 ? errorData.slice(0, 10) : 'none';
          simMsg = `Reverse swap blocked. Error: ${errName || 'Unknown'}. Selector: ${selector}. Check console (F12) for full details.`;
        }
        
        notifyError(simMsg);
        setSwappingStates((p) => ({ ...p, [id]: false }));
        setTxStatusForSwap("error");
      }
  // If simulation passes, send tx using the exact selected signature (MetaMask should prompt now)
  const tx = await AllContracts.AuctionContract.getFunction(selected.key)(...selected.args);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        notifySuccess("Reverse swap completed (Step 1)");
        setTxStatusForSwap("confirmed");
        try {
          // Refresh reverse state balance for this token
          const amount = await AllContracts.AuctionContract.getReverseStateBalance(address, tokenAddress);
          setReverseStateMap((prev) => ({ ...prev, [tokenAddress]: Math.floor(Number(ethers.formatUnits(amount, 18))) }));
        } catch {}
      } else {
        notifyError("Reverse swap transaction failed");
        setTxStatusForSwap("error");
      }
    } catch (error) {
      console.error("Reverse swap error:", error);
      console.error("Full error object:", JSON.stringify(error, null, 2));
      
      if (error?.code === 4001) {
        setTxStatusForSwap("cancelled");
        notifyError("Transaction cancelled by user.");
      } else {
        // Enhanced error decoding with multiple fallback strategies
        let errName = error?.errorName || error?.data?.errorName || error?.error?.errorName;
        let errorData = error?.data || error?.error?.data?.data || error?.error?.data;
        
        // Try multiple parsing strategies
        if (!errName && errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
          try {
            const parsed = AllContracts.AuctionContract.interface.parseError(errorData);
            if (parsed) {
              errName = parsed.name;
              console.log('✅ Manually decoded error:', errName, parsed.args);
            }
          } catch (parseErr) {
            console.warn('Failed to parse error with interface:', parseErr);
          }
          
          // Try to identify error by signature (first 4 bytes)
          if (!errName && errorData.length >= 10) {
            const selector = errorData.slice(0, 10);
            console.log('Error selector:', selector);
            
            // Map common error selectors
            const errorMap = {
              '0x82b42900': 'Unauthorized',
              '0xd1f28288': 'PausedErr',
              '0xf90c0e6d': 'UnsupportedToken',
              '0xd92e233d': 'ZeroAddr',
              '0xbb960071': 'AlreadySet',
              '0x1f160453': 'ScheduleNotSet',
              '0xcc72e663': 'NotStarted',
              '0xfa3ce4f4': 'NotToday',
              '0x136e3cff': 'Ended',
              '0x5f0bdd17': 'AlreadySwapped',
              '0x5e7e83f6': 'AlreadyReverse',
              '0x1a24c079': 'StateNotSet',
              '0x2d94f3b9': 'DavInsufficient',
              '0xb14e1ab9': 'NoDAV',
              '0xf4d678b8': 'InsufficientBalance',
              '0x13be252b': 'InsufficientAllowance',
              '0x4f2c0c96': 'InsufficientVault',
              '0x81b3b602': 'AmountZero',
              '0xecd0596b': 'ReverseDayLPOonly',
              '0x8a69b83f': 'ParticipantCapReached',
              '0x5341e942': 'Step1NotCompleted',
              '0x6f312cbd': 'Step2NotCompleted',
            };
            
            if (errorMap[selector]) {
              errName = errorMap[selector];
              console.log('✅ Identified error by selector:', errName);
            }
          }
        }
        
        let msg = error?.reason || error?.shortMessage || error?.message || error?.toString() || "Reverse swap failed";
        // Decode common custom errors into user-friendly messages
        if (errName === 'UnsupportedToken') msg = "This token is not supported in the auction.";
        else if (errName === 'StateNotSet') msg = "STATE token is not configured yet.";
        else if (errName === 'NotStarted') msg = "Reverse window not active yet.";
        else if (errName === 'AlreadySwapped' || errName === 'AlreadyReverse') msg = "You already completed Reverse Step 1 for this cycle.";
        else if (errName === 'DavInsufficient' || errName === 'NoDAV') msg = "Not enough DAV (need >= 1 DAV unit).";
        else if (errName === 'AmountZero') msg = "Amount must be greater than zero.";
        else if (errName === 'InsufficientBalance') msg = "Insufficient token balance for reverse swap.";
        else if (errName === 'InsufficientAllowance') msg = "Token allowance is insufficient.";
        else if (errName === 'InsufficientVault') msg = "Vault has insufficient STATE for this swap.";
        else if (errName === 'ReverseDayLPOonly') msg = "Reverse day LP-only restriction active; action unavailable.";
        else if (errName === 'ParticipantCapReached') msg = "Participant cap reached for auctions.";
        else if (errName === 'ScheduleNotSet') msg = "Auction schedule is not set.";
        else if (errName === 'Ended') msg = "Auction period has ended.";
        else if (errName === 'NotToday') msg = "Not today's window for this token.";
        else if (errName === 'Step1NotCompleted') msg = "Complete Step 1 (Claim Airdrop) first before burning tokens.";
        else if (errName === 'Step2NotCompleted') msg = "Complete Step 2 (Burn Tokens for STATE) first. Reverse Step 1 requires you to have burned auction tokens in the normal auction first.";
        else if (errName === 'PausedErr') msg = "Contract is paused.";
        else if (errName === 'Unauthorized') msg = "Unauthorized action.";
        else if (errName === 'ZeroAddr') msg = "Invalid zero address.";
        else if (/Normal auction active/i.test(msg)) msg = "Normal auction window active. Reverse swap only during reverse window.";
        
        // If still generic, provide detailed diagnostics
        if (msg.includes('unknown custom error') || msg.includes('execution reverted')) {
          const selector = errorData?.length >= 10 ? errorData.slice(0, 10) : 'none';
          msg = `Reverse swap blocked. Error: ${errName || 'Unknown'}. Selector: ${selector}. Check console (F12) for full details.`;
        }
        
        notifyError(msg);
        setTxStatusForSwap("error");
      }
    } finally {
      setSwappingStates((prev) => ({ ...prev, [id]: false }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Ratio Swap" }));
      await HasReverseSwappedAucton();
    }
  };

  // Reverse auction Step 2: burn STATE to receive auction tokens back
  const performReverseSwapStep2 = async (id, tokenIdentifier, maybeTokenAddress) => {
    try {
      if (!AllContracts?.AuctionContract || !signer) {
        notifyError("Wallet or contract not ready");
        return;
      }

      setTxStatusForSwap("initiated");
      setSwappingStates((prev) => ({ ...prev, [id]: true }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Preparing burn..." }));

      // Resolve token address
      let tokenAddress = maybeTokenAddress;
      if (!tokenAddress) tokenAddress = tokenIdentifier ? (tokenMap?.[tokenIdentifier]) : undefined;
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
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Must be reverse window
      const isRev = await AllContracts.AuctionContract.isReverseAuctionActive(tokenAddress).catch(() => false);
      if (!isRev) {
        notifyError("Normal auction window active. Step 2 is only available in reverse windows.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Ensure Step 1 completed and get the pending STATE amount
      let stateFromStep1 = 0n;
      try {
        const done = await AllContracts.AuctionContract.hasUserCompletedReverseStep1(address, tokenAddress);
        if (!done) {
          notifyError("Complete Reverse Step 1 first.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
        stateFromStep1 = await AllContracts.AuctionContract.getReverseStateBalance(address, tokenAddress);
      } catch {}

      if (!stateFromStep1 || BigInt(stateFromStep1) === 0n) {
        notifyError("No STATE available from Step 1.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // User must have at least stateFromStep1 balance to burn
      const stateTokenAddress = getStateAddress();
      const stateCtr = new ethers.Contract(stateTokenAddress, ERC20_ABI, signer);
      const bal = await stateCtr.balanceOf(address);
      if (BigInt(bal) < BigInt(stateFromStep1)) {
        notifyError("Insufficient STATE balance for Step 2.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Approve if needed
      setButtonTextStates((prev) => ({ ...prev, [id]: "Checking allowance..." }));
      const auctionAddr = getAuctionAddress();
      const allowance = await stateCtr.allowance(address, auctionAddr);
      if (BigInt(allowance) < BigInt(stateFromStep1)) {
        try {
          setTxStatusForSwap("Approving");
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          const tx = await stateCtr.approve(auctionAddr, maxUint256);
          await tx.wait();
        } catch (approvalErr) {
          console.error("STATE approval failed:", approvalErr);
          notifyError("STATE approval failed");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap("error");
          return;
        }
      }

      // Burn STATE to receive tokens (Step 2) - contract auto-detects today's token
      setButtonTextStates((prev) => ({ ...prev, [id]: "Burning STATE..." }));
      setTxStatusForSwap("pending");
      // Dynamic signature resolution for reverse step 2 with clear error propagation
      const resolveReverseStep2 = async () => {
        const c = AllContracts.AuctionContract;
        const candidates = [
          { key: 'burnStateForTokens(uint256)', args: [stateFromStep1] },
        ];
        let foundInAbi = false;
        let lastRevertErr = null;
        for (const cand of candidates) {
          let fn;
          try {
            c.interface.getFunction(cand.key);
            fn = c.getFunction(cand.key);
            foundInAbi = true;
          } catch {
            continue;
          }
          try {
            await fn.staticCall(...cand.args);
            console.log(`✅ Reverse Step 2 simulation passed with: ${cand.key}`);
            return { key: cand.key, args: cand.args };
          } catch (err) {
            console.warn(`❌ Reverse Step 2 simulation failed for ${cand.key}:`, err?.shortMessage || err?.message || err);
            // Try to decode the revert reason
            let decodedErr = { ...err };
            try {
              if (err?.data && typeof err.data === 'string' && err.data.startsWith('0x')) {
                try {
                  const parsedError = c.interface.parseError(err.data);
                  if (parsedError) {
                    decodedErr.errorName = parsedError.name;
                    decodedErr.errorArgs = parsedError.args;
                    console.log(`Decoded custom error: ${parsedError.name}`, parsedError.args);
                  }
                } catch {}
              }
            } catch {}
            lastRevertErr = decodedErr;
          }
        }
        if (!foundInAbi) {
          throw new Error('Reverse step 2 function not present in ABI. Expected burnStateForTokens(uint256).');
        }
        if (lastRevertErr) {
          console.error('All Reverse Step 2 candidates reverted. Last error:', lastRevertErr);
          throw lastRevertErr;
        }
        throw new Error('Reverse step 2 simulation failed unexpectedly.');
      };

      let selected2;
      try { selected2 = await resolveReverseStep2(); } catch (simErr) {
        console.error("❌ Reverse Step 2 simulation failed:", simErr);
        // Enhanced error decoding with raw data parsing
        let errName = simErr?.errorName || simErr?.data?.errorName || simErr?.error?.errorName;
        // Try to parse error data if not already decoded
        if (!errName && simErr?.data && typeof simErr.data === 'string' && simErr.data.startsWith('0x')) {
          try {
            const parsed = AllContracts.AuctionContract.interface.parseError(simErr.data);
            if (parsed) {
              errName = parsed.name;
              console.log('✅ Manually decoded error:', errName, parsed.args);
            }
          } catch {}
        }
        let simMsg = simErr?.reason || simErr?.shortMessage || simErr?.message || simErr?.toString() || "Reverse Step 2 simulation failed";
        if (errName === 'UnsupportedToken') simMsg = "This token is not supported in the auction.";
        else if (errName === 'StateNotSet') simMsg = "STATE token is not configured yet.";
        else if (errName === 'NotStarted') simMsg = "Reverse window not active yet.";
        else if (errName === 'AlreadySwapped' || errName === 'AlreadyReverse') simMsg = "You already completed Reverse Step 2 for this cycle.";
        else if (errName === 'Step1NotCompleted') simMsg = "Complete Reverse Step 1 first.";
        else if (errName === 'AmountZero') simMsg = "Amount must be greater than zero.";
        else if (errName === 'InsufficientBalance') simMsg = "Insufficient STATE balance for reverse burn.";
        else if (errName === 'InsufficientAllowance') simMsg = "STATE allowance is insufficient.";
        else if (errName === 'InsufficientVault') simMsg = "Vault has insufficient auction tokens for redemption.";
        else if (errName === 'PausedErr') simMsg = "Contract is paused.";
        else if (errName === 'Unauthorized') simMsg = "Unauthorized action.";
        // If still generic, append raw error info for diagnostics
        if (simMsg.includes('unknown custom error') || simMsg.includes('execution reverted')) {
          const hexData = simErr?.data || simErr?.error?.data?.data || simErr?.error?.data;
          simMsg = `Reverse Step 2 blocked: ${errName || 'Unknown reason'}. Check console for details. ${hexData ? `(data: ${hexData.slice(0,18)}...)` : ''}`;
        }
        notifyError(simMsg);
        setSwappingStates((p) => ({ ...p, [id]: false }));
        setTxStatusForSwap("error");
        return;
      }
      const burnTx = await AllContracts.AuctionContract.getFunction(selected2.key)(...selected2.args);
      const receipt = await burnTx.wait();
      if (receipt.status === 1) {
        notifySuccess("Reverse Step 2 completed");
        setTxStatusForSwap("confirmed");
        // Clear local reverse state record for this token
        setReverseStateMap((prev) => ({ ...prev, [tokenAddress]: 0 }));
      } else {
        notifyError("Step 2 transaction failed");
        setTxStatusForSwap("error");
      }
    } catch (error) {
      console.error("Reverse Step 2 error:", error);
      if (error?.code === 4001) {
        setTxStatusForSwap("cancelled");
        notifyError("Transaction cancelled by user.");
      } else {
        let msg = error?.reason || error?.shortMessage || error?.error?.errorName || error?.message || "Reverse Step 2 failed";
        notifyError(msg);
        setTxStatusForSwap("error");
      }
    } finally {
      setSwappingStates((prev) => ({ ...prev, [id]: false }));
      setButtonTextStates((prev) => ({ ...prev, [id]: "Ratio Swap" }));
      await HasReverseSwappedAucton();
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

      // Perform the token swap - no parameters, auto-detects today's token
      const swapTx = await AllContracts.AuctionContract.swapTokens();
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

      // Hard gate: only allow claim during normal (non-reverse) active window
      try {
        const isRevNow = await AllContracts.AuctionContract.isReverseAuctionActive(todayToken);
        if (isRevNow) {
          notifyError("Reverse auction window is active; Claim is available only during normal windows.");
          return;
        }
      } catch {}
      try {
        const isActNow = await AllContracts.AuctionContract.isAuctionActive(todayToken);
        if (!isActNow) {
          notifyError("Auction window not active for today's token. Please wait for the next slot.");
          return;
        }
      } catch {}

  // Send the claim using the correct signature for the deployed distributor
  let tx;
  try {
        const distributor = AllContracts.airdropDistributor;
        const distAddr = AllContracts?._airdropDistributorAddress || distributor?.target;
        const iface = distributor?.interface;

        if (iface) {
          // The deployed AirdropDistributor uses claim() with no parameters
          // It auto-detects today's token from the AuctionSwap contract
          try {
            iface.getFunction("claim()");
            tx = await distributor["claim()"]();
          } catch {
            // Fallback: try generic method access
            try {
              tx = await distributor.claim();
            } catch (inner) {
              if (!distAddr) throw inner;
              const legacy = new ethers.Contract(distAddr, [
                "function claim()"
              ], signer);
              tx = await legacy.claim();
            }
          }
        } else {
          // No interface available on this instance; use a minimal legacy ABI as a last resort
          if (!distAddr) throw new Error("AirdropDistributor address unavailable");
          const legacy = new ethers.Contract(distAddr, [
            "function claim()"
          ], signer);
          tx = await legacy.claim();
        }
      } catch (invokeErr) {
        notifyError("Unable to invoke claim on distributor. Please ensure contracts/ABI match deployment.");
        throw invokeErr;
      }

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
        httpProvider  // Use httpProvider instead of signer for read-only calls
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
  const chainForGecko = getRuntimeConfigSync()?.network?.chainId || 369;
  const wplsAddr = (getRuntimeConfigSync()?.dex?.baseToken?.address) || WPLS_ADDRESS;
  const url = geckoPoolsForTokenApiUrl(chainForGecko, (wplsAddr || '').toLowerCase(), 1);
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
  performReverseSwapStep1,
  performReverseSwapStep2,
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
  reverseStateMap,
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
        getTokenRatio,
        pstateToPlsRatio,
        auctionDuration,
        auctionInterval,
      }}
    >
      {children}
    </SwapContractContext.Provider>
  );
};
SwapContractProvider.propTypes = {
  children: PropTypes.node.isRequired,
};