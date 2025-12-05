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
import { getAuctionTiming, formatDuration, computePhaseFromSlotInfo, computeManualPhase } from "../utils/auctionTiming";

// Provide a safe default object so consumers can destructure without crashing
const SwapContractContext = createContext({});

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
  // Phase of today's auction window vs interval
  const [auctionPhase, setAuctionPhase] = useState(null); // 'active' | 'interval' | null
  const [auctionPhaseSeconds, setAuctionPhaseSeconds] = useState(0);
  const [auctionPhaseEndAt, setAuctionPhaseEndAt] = useState(0);
  // Chain-anchored absolute end timestamps (in seconds since epoch) keyed by token name
  const [AuctionEndAt, setAuctionEndAt] = useState({});
  // Measured skew between chain time and local wall clock (chainNow - localNowSec)
  const [chainTimeSkew, setChainTimeSkew] = useState(0);
  const auctionEndAtRef = useRef({});
  const phaseEndAtRef = useRef(0);
  const chainSkewRef = useRef(0);
  // Track the last active auction end time to compute interval countdowns accurately
  const lastActiveEndAtRef = useRef(0);
  const [TokenPariAddress, setPairAddresses] = useState({});
  const [CurrentCycleCount, setCurrentCycleCount] = useState({});

  // Helper to robustly resolve today's token address from the Auction contract
  const getTodayTokenAddress = useCallback(async (contractInstance) => {
    const c = contractInstance || AllContracts?.AuctionContract;
    if (!c) return null;
    // 1) Primary: on-chain getTodayToken()
    try {
      const t = await c.getTodayToken();

      const addr = (typeof t === 'string') ? t : (t?.[0] || t?.tokenOfDay || null);
      if (addr && addr !== ethers.ZeroAddress) return addr;
    } catch (e) {
      console.debug('getTodayToken() read failed:', e?.message || e);
    }
    // 2) Fallback: SwapLens.getTodayStatus(swapAddr)
    try {
      const lens = AllContracts?.swapLens;
      const swapAddr = (c?.target || c?.getAddress?.());
      if (lens && swapAddr) {
        const ts = await lens.getTodayStatus(swapAddr);
        const token = ts?.[0] || ts?.tokenOfDay || ethers.ZeroAddress;
        if (token && token !== ethers.ZeroAddress) return token;
      }
    } catch (e) {
      console.debug('SwapLens.getTodayStatus fallback failed:', e?.message || e);
    }
    // Nothing resolvable
    return null;
  }, [AllContracts?.AuctionContract, AllContracts?.swapLens]);
  
  // Prefer SwapLens for unified, non-reverting daily status when available
  const getTodayStatusViaLens = useCallback(async () => {
    try {
      const swap = AllContracts?.AuctionContract;
      const lens = AllContracts?.swapLens;
      if (!swap || !lens) return null;
      const swapAddr = swap.target || swap.getAddress?.();
      if (!swapAddr) return null;
      const ts = await lens.getTodayStatus(swapAddr);
      const token = ts?.[0] || ts?.tokenOfDay || ethers.ZeroAddress;
      const activeWindow = (ts?.[1] ?? ts?.activeWindow) === true;
      const isReverse = (ts?.[2] ?? ts?.isReverse) === true;
      // Lens secondsLeft is end-of-day. For auction timers, prefer on-chain timeLeft during active window
      let secondsLeft = Number(ts?.[4] ?? ts?.secondsLeft ?? 0);
      if (activeWindow && token && token !== ethers.ZeroAddress) {
        try {
          const readOnly = swap.connect(provider || AllContracts?.provider || undefined);
          const t = await readOnly.getAuctionTimeLeft(token);
          secondsLeft = Math.max(0, Math.floor(Number(t)));
        } catch {}
      }
      return { tokenOfDay: token, activeWindow, isReverse, secondsLeft };
    } catch (e) {
      console.debug('SwapLens.getTodayStatus failed:', e?.message || e);
      return null;
    }
  }, [AllContracts?.AuctionContract, AllContracts?.swapLens]);
  const [OutPutAmount, setOutputAmount] = useState({});
  const [TokenRatio, setTokenRatio] = useState({});
  const [TimeLeftClaim, setTimeLeftClaim] = useState({});
  const [TokenBalance, setTokenbalance] = useState({});
  const [StateBalance, setStateBalance] = useState("");
  const [isReversed, setIsReverse] = useState({});
  const [IsAuctionActive, setisAuctionActive] = useState({});
  const [isTokenRenounce, setRenonced] = useState({});
  const [tokenMap, setTokenMap] = useState({});
  const [TokenNames, setTokenNames] = useState([]);
  // Total tokens burned per token (contract getTotalTokensBurned)
  const [burnedAmount, setBurnedAmount] = useState({});
  
  // Today's live token data (fetched centrally, shared with all components)
  const [todayTokenAddress, setTodayTokenAddress] = useState("");
  const [todayTokenSymbol, setTodayTokenSymbol] = useState("");
  const [todayTokenName, setTodayTokenName] = useState("");
  const [todayTokenDecimals, setTodayTokenDecimals] = useState(18);
  // Reverse window flag for the active token (via SwapLens when available)
  const [reverseWindowActive, setReverseWindowActive] = useState(null);

  const [buttonTextStates, setButtonTextStates] = useState({});
  const [DexbuttonTextStates, setDexButtonTextStates] = useState({});
  const [swappingStates, setSwappingStates] = useState({});
  const [DexswappingStates, setDexSwappingStates] = useState({});

  const [userHashSwapped, setUserHashSwapped] = useState({});
  const [userHasBurned, setUserHasBurned] = useState({}); // normal step 2 completion
  const [userReverseStep1, setUserReverseStep1] = useState({}); // reverse step1 completion
  const [userReverseStep2, setUserReverseStep2] = useState({}); // reverse step2 completion
  const [DavAddress, setDavAddress] = useState("");
  const [supportedToken, setIsSupported] = useState(false);
  const [UsersSupportedTokens, setUsersSupportedTokens] = useState("");
  const [StateAddress, setStateAddress] = useState("");
  const [AirdropClaimed, setAirdropClaimed] = useState({});
  const [userHasReverseSwapped, setUserHasReverseSwapped] = useState({});

  const [isCliamProcessing, setIsCllaimProccessing] = useState(null);
  // Reverse Step 1 STATE received per token (for UI hints)
  const [reverseStateMap, setReverseStateMap] = useState({});

  // Add new state variables for token value calculations
  const [pstateToPlsRatio, setPstateToPlsRatio] = useState("0.0");
  // Warn once flags to avoid console spam
  const addressWarnedRef = useRef(false);
  
  // State for dynamically detected auction timing
  const [auctionDuration, setAuctionDuration] = useState(null);
  const [auctionInterval, setAuctionInterval] = useState(null);
  // Burned LP amounts for each token's pair (from burn address)
  const [burnedLPAmount, setBurnLpAmount] = useState({});
  // Force manual timer based on fixed PKT anchor and 2h/1h cycle
  const USE_MANUAL_TIMER = true;
  // Track previous auction phase to detect boundaries
  const prevPhaseRef = useRef(null);
  // Ref to call the same full data refresh used on wallet connect/disconnect
  const runSyncRef = useRef(null);

  // Persist last active auction end across reloads (keyed by swap address)
  const getSwapAddressSafe = useCallback(() => {
    try {
      const c = AllContracts?.AuctionContract;
      return c?.target || c?.getAddress?.();
    } catch {
      return null;
    }
  }, [AllContracts?.AuctionContract]);

  const persistActiveEndAt = useCallback((endAt) => {
    try {
      const addr = getSwapAddressSafe();
      if (!addr || !endAt) return;
      localStorage.setItem(`swap_active_end_${String(addr).toLowerCase()}`,
        String(Math.floor(Number(endAt))));
    } catch {}
  }, [getSwapAddressSafe]);

  const loadPersistedActiveEndAt = useCallback(() => {
    try {
      const addr = getSwapAddressSafe();
      if (!addr) return null;
      const raw = localStorage.getItem(`swap_active_end_${String(addr).toLowerCase()}`);
      const n = raw ? Number(raw) : 0;
      return Number.isFinite(n) && n > 0 ? n : null;
    } catch {
      return null;
    }
  }, [getSwapAddressSafe]);

  const CalculationOfCost = async (amount) => {
    try {
      // Guard: need a valid amount and initialized contracts
      if (!amount || !AllContracts?.davContract) {
        setTotalCost(0n);
        return;
      }
  // Always read TOKEN_COST (wei per DAV) from read-only provider when available
  const davRead = (provider ? AllContracts.davContract.connect(provider) : AllContracts.davContract);
  const tokenCostWei = await davRead.TOKEN_COST(); // BigInt wei
      // Total = TOKEN_COST (wei) * amount (whole number)
      const qty = BigInt(String(amount || '0'));
      const totalWei = qty * BigInt(tokenCostWei);
      setTotalCost(totalWei);
    } catch (error) {
      console.error("Error getting TOKEN_COST for CalculationOfCost:", error);
      // Safe fallback: clear to 0 rather than send incorrect value
      setTotalCost(0n);
    }
  };

  // Fix the fetchUserTokenAddresses function to handle tokens properly after buy & burn pool creation
  const ReturnfetchUserTokenAddresses = async () => {
    // Only require AuctionContract; SwapLens fallback removed because ABI doesn't expose getUserTokenData
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
            // Query token name/symbol directly on-chain using the contract's runner (provider or signer)
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
              // symbol not used for keying currently, but keeps call for parity if needed later
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
      if (!AllContracts?.AuctionContract) {
        console.debug(`fetchTokenData(${contractMethod}) skipped: auction contract not ready`);
        // Do not update state noisily during init; return previous or empty
        return {};
      }
      const results = {};
      const tokenMap = await ReturnfetchUserTokenAddresses();

      const extendedMap = includeTestState
        ? { ...tokenMap, state: getStateAddress() }
        : tokenMap;

      // Known method signatures for ethers v6 getFunction fallback
      const METHOD_SIGNATURES = {
        getTotalTokensBurned: 'getTotalTokensBurned(address)',
        getTokensBurnedByUser: 'getTokensBurnedByUser(address,address)',
        getRatioPrice: 'getRatioPrice(address)',
        getPairAddress: 'getPairAddress(address)',
        getAuctionTimeLeft: 'getAuctionTimeLeft(address)',
        isAuctionActive: 'isAuctionActive(address)',
        isReverseAuctionActive: 'isReverseAuctionActive(address)',
        // Contract exposes supportedTokens(address) as public mapping getter
        isTokenSupported: 'supportedTokens(address)',
        getAvailableDavForAuction: 'getAvailableDavForAuction(address,address)',
        getUserStateBalance: 'getUserStateBalance(address,address)',
        getCurrentAuctionCycle: 'getCurrentAuctionCycle(address)',
        hasUserBurnedForToken: 'hasUserBurnedForToken(address,address)',
        hasUserCompletedReverseStep1: 'hasUserCompletedReverseStep1(address,address)',
        hasUserCompletedReverseStep2: 'hasUserCompletedReverseStep2(address,address)',
        hasCompletedStep1: 'hasCompletedStep1(address,address)',
      };

      for (const [tokenName, tokenAddress] of Object.entries(extendedMap)) {
        try {
          const contract = AllContracts.AuctionContract;

          const args = buildArgs
            ? buildArgs(tokenAddress, tokenName)
            : [tokenAddress];
          let rawResult;
          // Prefer direct method if present (non-overloaded)
          if (typeof contract[contractMethod] === 'function') {
            rawResult = await contract[contractMethod](...args);
          } else {
            // Fall back to signature-based resolution (for overloaded or missing shorthand functions)
            const sig = METHOD_SIGNATURES[contractMethod];
            if (!sig) throw new Error(`Method ${contractMethod} not found on contract ABI`);
            const fn = contract.getFunction(sig);
            rawResult = await fn(...args);
          }
          const formattedResult = formatFn(rawResult);

          if (useAddressAsKey) {
            const addrRaw = tokenAddress || '';
            const addrLc = (addrRaw || '').toLowerCase();
            if (addrRaw) results[addrRaw] = formattedResult;
            if (addrLc) results[addrLc] = formattedResult;
          } else {
            results[tokenName] = formattedResult;
          }
        } catch (err) {
          const reason =
            err?.reason || // ethers v5 style
            err?.shortMessage || // ethers v6 style
            err?.error?.errorName ||
            err?.message ||
            "";

          const unsupported = /unsupported token/i.test(reason);

          if (useAddressAsKey) {
            const addrRaw = tokenAddress || '';
            const addrLc = (addrRaw || '').toLowerCase();
            const val = unsupported ? "not listed" : "not started";
            if (addrRaw) results[addrRaw] = val;
            if (addrLc) results[addrLc] = val;
          } else {
            results[tokenName] = unsupported ? "not listed" : "not started";
          }

          console.warn(
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

  // Developer override: allow forcing direct contract calls even if simulation fails
  const allowDirectContractCalls = () => {
    try {
      return (localStorage.getItem('allowDirectContractCalls') === 'true');
    } catch {
      return false;
    }
  };
  const getFallbackGasLimit = (key, def) => {
    try {
      const v = localStorage.getItem(key);
      if (!v) return def;
      const n = BigInt(v);
      return n > 0n ? n : def;
    } catch { return def; }
  };

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
        // Manual mode: derive phase solely from fixed schedule using chain time
        if (USE_MANUAL_TIMER) {
          try {
            // Anchor to chain time for accuracy
            let chainNowSec = 0;
            try {
              const providerToUse = httpProvider;
              const latestBlock = await providerToUse.getBlock('latest');
              chainNowSec = Number(latestBlock?.timestamp || 0);
            } catch {}
            const localNowSec = Math.floor(Date.now() / 1000);
            const effectiveNow = chainNowSec > 0 ? chainNowSec : localNowSec;
            if (chainNowSec > 0) setChainTimeSkew(chainNowSec - localNowSec);

            const manual = computeManualPhase(effectiveNow, { duration: 86400, interval: 0 });
            setAuctionPhase(manual.phase);
            setAuctionPhaseSeconds(manual.secondsLeft);
            setAuctionPhaseEndAt(manual.phaseEndAt);
            // Clear token-specific maps to avoid confusion; footer uses phase
            setAuctionTime({});
            setAuctionEndAt({});
            if (showLogs) console.log(`🛠️ Manual phase: ${manual.phase}, left=${manual.secondsLeft}s`);
          } catch (e) {
            console.warn('Manual timer computation failed:', e?.message || e);
          }
          return; // Skip on-chain timing
        }

        // Always get today's token and derive phase + seconds, preferring SwapLens (non-reverting)
        try {
          let todayToken = ethers.ZeroAddress;
          let isAuctionActive = false;
          let timeLeftNumber = 0;
          let isReverseFlag = null;

          const lensStatus = await getTodayStatusViaLens();
          if (lensStatus) {
            todayToken = lensStatus.tokenOfDay || ethers.ZeroAddress;
            isAuctionActive = lensStatus.activeWindow === true;
            timeLeftNumber = Math.max(0, Math.floor(Number(lensStatus.secondsLeft || 0)));
            isReverseFlag = lensStatus.isReverse === true;
          } else {
            // Fallback to direct contract reads if lens isn't available
            const readOnlyAuction = AllContracts.AuctionContract.connect(httpProvider);
            const todayResolved = await getTodayTokenAddress(readOnlyAuction);
            todayToken = todayResolved || ethers.ZeroAddress;
            isAuctionActive = todayToken && todayToken !== ethers.ZeroAddress
              ? await readOnlyAuction.isAuctionActive(todayToken).catch(() => false)
              : false;
            if (todayToken && todayToken !== ethers.ZeroAddress) {
              const timeLeft = await readOnlyAuction.getAuctionTimeLeft(todayToken).catch(() => 0);
              timeLeftNumber = Math.max(0, Math.floor(Number(timeLeft)));
              try { isReverseFlag = await readOnlyAuction.isReverseAuctionActive(todayToken); } catch { isReverseFlag = false; }
            }
          }
          
          // Update global reverse flag snapshot for consumers
          setReverseWindowActive(isReverseFlag === true ? true : (isAuctionActive ? false : null));

          if (todayToken && todayToken !== ethers.ZeroAddress) {

            // Resolve display symbol and stable keys (id and address)
            const currentProvider = wsConnected ? wsProvider : httpProvider;
            const tokenContract = new ethers.Contract(
              todayToken,
              ['function symbol() view returns (string)'],
              currentProvider
            );
            const tokenName = await tokenContract.symbol().catch(() => 'Unknown');
            const addrKey = (todayToken || '').toLowerCase();
            let idKey = null;
            try {
              const entries = Object.entries(tokenMap || {});
              const found = entries.find(([id, addr]) => (addr || '').toLowerCase() === addrKey);
              idKey = found ? found[0] : null;
            } catch {}

            // Anchor end timestamp to on-chain time
            let chainNowSec = 0;
            try {
              const latestBlock = await currentProvider.getBlock('latest');
              chainNowSec = Number(latestBlock?.timestamp || 0);
            } catch {}
            const localNowSec = Math.floor(Date.now() / 1000);
            const effectiveNow = chainNowSec > 0 ? chainNowSec : localNowSec;
            const phaseEndAt = effectiveNow + timeLeftNumber;
            if (chainNowSec > 0) setChainTimeSkew(chainNowSec - localNowSec);

            if (isAuctionActive) {
              // Active auction window
              const endMap = {};
              if (tokenName) endMap[tokenName] = phaseEndAt;
              if (idKey) endMap[idKey] = phaseEndAt;
              if (addrKey) endMap[addrKey] = phaseEndAt;
              setAuctionEndAt(endMap);

              const tlMap = {};
              if (tokenName) tlMap[tokenName] = timeLeftNumber;
              if (idKey) tlMap[idKey] = timeLeftNumber;
              if (addrKey) tlMap[addrKey] = timeLeftNumber;
              setAuctionTime(tlMap);
              setAuctionPhase('active');
              setAuctionPhaseSeconds(timeLeftNumber);
              setAuctionPhaseEndAt(phaseEndAt);
              // Record the active end so we can compute interval end precisely
              lastActiveEndAtRef.current = phaseEndAt;
              // Persist across reloads for precise interval countdowns
              try { persistActiveEndAt(phaseEndAt); } catch {}
              if (showLogs) console.log(`✅ Auction active for ${tokenName}: ${timeLeftNumber}s left`);
            } else {
              // Interval until next window starts — if contract returns 0 for this token,
              // scan all registered tokens to find the nearest upcoming start time
              let intervalSeconds = timeLeftNumber;
              // Attempt to compute from persisted active end first
              try {
                const loaded = loadPersistedActiveEndAt();
                if (loaded && (!lastActiveEndAtRef.current || lastActiveEndAtRef.current <= 0)) {
                  lastActiveEndAtRef.current = loaded;
                }
              } catch {}
              // Preferred: if contract exposes getSlotInfo(), use it for precise interval countdown
              try {
                const c = AllContracts.AuctionContract;
                const fn = (typeof c.getSlotInfo === 'function') ? c.getSlotInfo : (c.getFunction ? c.getFunction('getSlotInfo()') : null);
                if (fn) {
                  const info = await fn();
                  const nowSec = effectiveNow;
                  const phaseInfo = computePhaseFromSlotInfo(info, nowSec);
                  if (phaseInfo && phaseInfo.phase === 'interval') {
                    intervalSeconds = Math.max(0, Math.floor(Number(phaseInfo.secondsLeft)));
                    setAuctionPhaseEndAt(Number(phaseInfo.phaseEndAt) || 0);
                    // Update detected timing if provided
                    if (phaseInfo.auctionDuration) setAuctionDuration(phaseInfo.auctionDuration);
                    if (phaseInfo.interval) setAuctionInterval(phaseInfo.interval);
                  }
                }
              } catch (e) {
                // ignore if not present on deployed contract
              }
              if (!intervalSeconds || intervalSeconds === 0) {
                try {
                  // Discover token list
                  const tokenMap = await ReturnfetchUserTokenAddresses();
                  const addresses = Object.values(tokenMap || {});
                  const readOnly = AllContracts.AuctionContract.connect(currentProvider);
                  const reads = addresses.slice(0, 50).map(async (addr) => {
                    try {
                      const t = await readOnly.getAuctionTimeLeft(addr);
                      const n = Math.max(0, Math.floor(Number(t)));
                      return n > 0 ? n : Infinity;
                    } catch { return Infinity; }
                  });
                  const all = await Promise.all(reads);
                  const min = Math.min(...all);
                  if (isFinite(min) && min !== Infinity) intervalSeconds = min;
                } catch (scanErr) {
                  console.warn('Interval scan failed:', scanErr?.message || scanErr);
                }
              }

              // Contract returns 0 outside active window. Derive interval countdown from last active end.
              if (!intervalSeconds || intervalSeconds === 0) {
                const durationInterval = Number(auctionInterval || 3600);
                let computedEnd = 0;
                // If we observed the last active end, add the known interval to get next start
                let lastEnd = Number(lastActiveEndAtRef.current || 0);
                if ((!lastEnd || lastEnd <= 0)) {
                  try {
                    const persisted = loadPersistedActiveEndAt();
                    if (persisted) {
                      lastEnd = Number(persisted);
                      lastActiveEndAtRef.current = lastEnd;
                    }
                  } catch {}
                }
                if (lastEnd > 0 && durationInterval > 0) {
                  computedEnd = lastEnd + durationInterval;
                } else if (durationInterval > 0) {
                  // Bootstrap: if page loaded during interval, approximate from now
                  computedEnd = effectiveNow + durationInterval;
                }
                if (computedEnd > effectiveNow) {
                  intervalSeconds = computedEnd - effectiveNow;
                  // Preserve previously set interval end if it already exists in the future to avoid reset jitter
                  const existing = Number(phaseEndAtRef.current || 0);
                  if (!(existing > effectiveNow)) {
                    setAuctionPhaseEndAt(computedEnd);
                  }
                }
              }

              setAuctionTime({});
              setAuctionPhase('interval');
              setAuctionPhaseSeconds(intervalSeconds);
              if (intervalSeconds && intervalSeconds > 0) {
                const endTs = Number(phaseEndAtRef.current || 0) > effectiveNow
                  ? Number(phaseEndAtRef.current)
                  : (effectiveNow + intervalSeconds);
                setAuctionPhaseEndAt(endTs);
              } else {
                setAuctionPhaseEndAt(0);
              }
              if (showLogs) console.log(`ℹ️ Interval phase: next auction starts in ${intervalSeconds}s`);
            }
          } else {
            if (showLogs) console.log("⚠️ No token-of-day available");
            setAuctionTime({});
            setAuctionEndAt({});
            setAuctionPhase(null);
            setAuctionPhaseSeconds(0);
            setAuctionPhaseEndAt(0);
          }
        } catch (err) {
          console.error("❌ Error fetching today's auction:", err);
          setAuctionTime({});
          setAuctionPhase(null);
          setAuctionPhaseSeconds(0);
        }
      } catch (err) {
        console.error("❌ Error fetching auction times:", err);
        setAuctionTime({});
        setAuctionPhase(null);
        setAuctionPhaseSeconds(0);
      }
    };

    const startCountdown = () => {
      if (countdownInterval) clearInterval(countdownInterval);

      countdownInterval = setInterval(() => {
        if (!isActive) return;

        // In manual mode, continuously update phase and phase end at second-level from local clock + chain skew
        if (USE_MANUAL_TIMER) {
          const nowSecManual = Math.floor(Date.now() / 1000) + (chainSkewRef.current || 0);
          const manual = computeManualPhase(nowSecManual, { duration: 86400, interval: 0 });
          const prevPhase = prevPhaseRef.current;
          setAuctionPhase((old) => (old !== manual.phase ? manual.phase : old));
          setAuctionPhaseEndAt((old) => (old !== manual.phaseEndAt ? manual.phaseEndAt : old));
          // Detect boundary: interval -> active, then hard refresh once (guarded)
          if (prevPhase === 'interval' && manual.phase === 'active') {
            try {
              const last = Number(sessionStorage.getItem('auction_boundary_reload_at') || 0);
              const nowTs = Math.floor(Date.now() / 1000);
              // Debounce: only reload if last trigger was > 30s ago
              if (!last || (nowTs - last) > 30) {
                sessionStorage.setItem('auction_boundary_reload_at', String(nowTs));
                // 1) Immediately run the same synchronized refresh used on wallet connect/disconnect
                try { runSyncRef.current && runSyncRef.current(); } catch {}
                // 2) Fire a custom event for any listeners that want to react
                try { window.dispatchEvent(new Event('forceSynchronizedRefresh')); } catch {}
                // 3) As a backup (in case chain flips slightly after the boundary), run again after 2s
                try { setTimeout(() => { runSyncRef.current && runSyncRef.current(); }, 2000); } catch {}
                // 4) Optional hard reload after a short delay if needed to guarantee full reset
                try { setTimeout(() => { window.location.reload(); }, 2500); } catch {}
              }
            } catch {}
          }
          // Update previous phase snapshot
          prevPhaseRef.current = manual.phase;
          // auctionPhaseSeconds will be recomputed below from phaseEndAtRef
        }

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

        // Tick phase countdown as well
        const pEnd = Number(phaseEndAtRef.current || 0);
        if (pEnd > 0) {
          const nowSec2 = Math.floor(Date.now() / 1000) + (chainSkewRef.current || 0);
          const phaseLeft = Math.max(0, Math.floor(pEnd - nowSec2));
          setAuctionPhaseSeconds((old) => (old !== phaseLeft ? phaseLeft : old));
        }
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
      }, 10000); // 10s resync for fresher state

      console.log("🔄 Resync interval set to 10 seconds");
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
  phaseEndAtRef.current = auctionPhaseEndAt;
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

  // Load persisted last active end at mount to enable precise interval countdown after reloads
  useEffect(() => {
    const persisted = loadPersistedActiveEndAt?.();
    if (persisted) {
      lastActiveEndAtRef.current = Number(persisted);
    }
  }, [loadPersistedActiveEndAt]);

  // Keep the refs synchronized with state outside the effect above
  useEffect(() => {
    auctionEndAtRef.current = AuctionEndAt;
  }, [AuctionEndAt]);
  useEffect(() => {
    chainSkewRef.current = chainTimeSkew;
  }, [chainTimeSkew]);
  useEffect(() => {
    phaseEndAtRef.current = auctionPhaseEndAt;
  }, [auctionPhaseEndAt]);

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
  const todayAddr = await getTodayTokenAddress(AllContracts.AuctionContract);
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
    // Direct-call helpers for advanced users / debugging
    window.callSwapTokensDirect = async () => {
      try {
        if (!AllContracts?.AuctionContract || !signer) throw new Error('Contract or wallet not ready');
        const c = AllContracts.AuctionContract.connect(signer);
        const tx = await c.getFunction('swapTokens()')();
        console.log('[Direct] swapTokens() sent:', tx.hash);
        const rc = await tx.wait();
        console.log('[Direct] swapTokens() receipt:', rc);
        return rc;
      } catch (e) {
        console.error('[Direct] swapTokens() failed:', e);
        throw e;
      }
    };
  // tokenAddr optional; if omitted, tries today's token. Contract ignores the amount and burns exactly your Reverse Step 1 STATE.
    window.callReverseStep2Direct = async (tokenAddr, _amountWeiIgnored) => {
      try {
        if (!AllContracts?.AuctionContract || !signer) throw new Error('Contract or wallet not ready');
        const c = AllContracts.AuctionContract.connect(signer);
        let t = tokenAddr;
        if (!t) {
          try { t = await getTodayTokenAddress(AllContracts.AuctionContract); } catch {}
        }
        if (!t || t === ethers.ZeroAddress) throw new Error('No token resolved for reverse step 2');
  // Contract ignores the parameter and burns exactly the STATE you received in Reverse Step 1
        const tx = await c.getFunction('burnStateForTokens(uint256)')(0n);
        console.log('[Direct] burnStateForTokens sent:', tx.hash);
        const rc = await tx.wait();
        console.log('[Direct] burnStateForTokens receipt:', rc);
        return rc;
      } catch (e) {
        console.error('[Direct] burnStateForTokens failed:', e);
        throw e;
      }
    };
    // Helper: dump AuctionSwap ABI function names to verify ABI loaded correctly
    window.dumpSwapAbi = () => {
      try {
        const c = AllContracts?.AuctionContract;
        if (!c?.interface?.fragments) {
          console.log('[ABI] AuctionSwap ABI not available on contract instance.');
          return [];
        }
        const names = c.interface.fragments
          .filter(f => f?.type === 'function')
          .map(f => `${f.name}(${(f.inputs||[]).map(i=>i.type).join(',')})`);
        console.log('[ABI] Functions:', names);
        return names;
      } catch (e) {
        console.warn('[ABI] Dump failed:', e);
        return [];
      }
    };
    window.getSwapAddress = () => {
      try {
        const c = AllContracts?.AuctionContract;
        const addr = c?.target || c?.getAddress?.();
        console.log('[Swap] Contract address:', addr);
        return addr;
      } catch (e) {
        console.warn('[Swap] Address read failed:', e);
        return null;
      }
    };
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

  // Normal Step 2 (burn) completion
  const HasUserBurnedForToken = async () => {
    await fetchTokenData({
      contractMethod: "hasUserBurnedForToken",
      setState: setUserHasBurned,
      formatFn: (v) => Boolean(v),
      buildArgs: (tokenAddress) => [address, tokenAddress],
      // Key by token address so UI can reliably resolve via addrKey
      useAddressAsKey: true,
    });
  };

  // Reverse steps completion flags
  const HasUserCompletedReverseStep1 = async () => {
    await fetchTokenData({
      contractMethod: "hasUserCompletedReverseStep1",
      setState: setUserReverseStep1,
      formatFn: (v) => Boolean(v),
      buildArgs: (tokenAddress) => [address, tokenAddress],
    });
  };
  const HasUserCompletedReverseStep2 = async () => {
    await fetchTokenData({
      contractMethod: "hasUserCompletedReverseStep2",
      setState: setUserReverseStep2,
      formatFn: (v) => Boolean(v),
      buildArgs: (tokenAddress) => [address, tokenAddress],
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
      let davAddress = null;
      let stateAddress = null;

      // Try resolving via Auction contract first
      try { davAddress = await AllContracts.AuctionContract.dav(); } catch {}
      try { stateAddress = await AllContracts.AuctionContract.stateToken(); } catch {}

      // Fallbacks from initialized contract targets if above calls fail or decode
      if (!davAddress || !ethers.isAddress(davAddress)) {
        try {
          davAddress = AllContracts?._davAddress || AllContracts?.davContract?.target || getDavAddress();
        } catch {}
      }
      if (!stateAddress || !ethers.isAddress(stateAddress)) {
        try {
          stateAddress = AllContracts?._stateAddress || AllContracts?.stateContract?.target || getStateAddress();
        } catch {}
      }

      if ((!davAddress || !ethers.isAddress(davAddress) || !stateAddress || !ethers.isAddress(stateAddress)) && !addressWarnedRef.current) {
        addressWarnedRef.current = true;
        console.warn("AddressesFromContract: falling back to known targets; on-chain reads unavailable.");
      }

      if (davAddress && ethers.isAddress(davAddress)) setDavAddress(davAddress);
      if (stateAddress && ethers.isAddress(stateAddress)) setStateAddress(stateAddress);
    } catch (error) {
      if (!addressWarnedRef.current) {
        addressWarnedRef.current = true;
        console.warn("AddressesFromContract: error fetching, using fallbacks:", error?.message || error);
      }
      try {
        const davFallback = AllContracts?._davAddress || AllContracts?.davContract?.target || getDavAddress();
        const stateFallback = AllContracts?._stateAddress || AllContracts?.stateContract?.target || getStateAddress();
        if (davFallback && ethers.isAddress(davFallback)) setDavAddress(davFallback);
        if (stateFallback && ethers.isAddress(stateFallback)) setStateAddress(stateFallback);
      } catch {}
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

  // Centralized today's token fetch - called once per refresh cycle
  const fetchTodayToken = async () => {
    try {
      if (!AllContracts?.AuctionContract) return;
      // Prefer SwapLens for non-reverting daily status
      let todayAddr = null;
      let reverseFlag = null;
      const lensStatus = await getTodayStatusViaLens();
      if (lensStatus && lensStatus.tokenOfDay) {
        todayAddr = lensStatus.tokenOfDay;
        reverseFlag = lensStatus.isReverse === true;
      } else {
        const info = await AllContracts.AuctionContract.getTodayToken();
        todayAddr = info?.[0] || info?.tokenOfDay;
      }

      if (todayAddr && todayAddr !== ethers.ZeroAddress) {
        setTodayTokenAddress(todayAddr);
        
        // Use contract runner if available, otherwise fallback to provider
        const readProvider = AllContracts.AuctionContract.runner || provider || httpProvider;
        const erc20 = new ethers.Contract(
          todayAddr,
          [
            'function name() view returns (string)',
            'function symbol() view returns (string)',
            'function decimals() view returns (uint8)'
          ],
          readProvider
        );
        
        const [name, symbol, decimals] = await Promise.all([
          erc20.name().catch(() => ""),
          erc20.symbol().catch(() => ""),
          erc20.decimals().catch(() => 18),
        ]);
        
        setTodayTokenName(name);
        setTodayTokenSymbol(symbol);
        setTodayTokenDecimals(Number(decimals) || 18);
        if (reverseFlag !== null) setReverseWindowActive(reverseFlag);
      } else {
        // No token scheduled today
        setTodayTokenAddress("");
        setTodayTokenSymbol("");
        setTodayTokenName("");
        setTodayTokenDecimals(18);
        setReverseWindowActive(null);
      }
    } catch (e) {
      console.debug("Error fetching today's token:", e);
      setTodayTokenAddress("");
      setTodayTokenSymbol("");
      setTodayTokenName("");
      setTodayTokenDecimals(18);
      setReverseWindowActive(null);
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
        let supported = false;
        // 1) Preferred: public mapping getter supportedTokens(address)
        try {
          if (typeof AllContracts.AuctionContract.supportedTokens === 'function') {
            const val = await AllContracts.AuctionContract.supportedTokens(TokenAddress);
            if (typeof val === 'boolean') {
              supported = val;
              results[tokenName] = supported;
              continue;
            }
          }
        } catch (e) {
          // If function doesn't exist on-chain, fall through to other heuristics
          console.debug('supportedTokens() not available or failed:', e?.shortMessage || e?.message || e);
        }

        // 2) Fallback: isAutoRegistered mapping (boolean)
        try {
          if (typeof AllContracts.AuctionContract.isAutoRegistered === 'function') {
            const autoReg = await AllContracts.AuctionContract.isAutoRegistered(TokenAddress);
            if (typeof autoReg === 'boolean' && autoReg) {
              supported = true;
              results[tokenName] = true;
              continue;
            }
          }
        } catch {}

        // 3) Fallback: getPairAddress non-zero implies registered
        try {
          const pair = await AllContracts.AuctionContract.getPairAddress(TokenAddress);
          if (pair && pair !== ethers.ZeroAddress) {
            supported = true;
            results[tokenName] = true;
            continue;
          }
        } catch {}

        // 4) Last resort: try a harmless view that only exists for supported tokens
        // If it succeeds without "UnsupportedToken" revert, treat as supported
        try {
          await AllContracts.AuctionContract.isAuctionActive(TokenAddress);
          // If call succeeds, the token is recognized by the contract
          supported = true;
        } catch (err) {
          supported = false;
        }
        results[tokenName] = supported;
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
          // Guard: ensure pairAddress is a contract
          let pairCode = "0x";
          try { pairCode = await (httpProvider || provider).getCode(pairAddress); } catch {}
          if (!pairAddress || pairAddress === ethers.ZeroAddress || !pairCode || pairCode === "0x") {
            results[tokenName] = { pairAddress: pairAddress || ethers.ZeroAddress, balance: 0 };
            continue;
          }

          // ✅ Create ERC20 contract for LP token (use httpProvider for stability)
          const lpTokenContract = new ethers.Contract(pairAddress, ERC20_ABI, httpProvider || provider);

          // ✅ Fetch balance & decimals in parallel
          const [balanceRaw, decimals] = await Promise.all([
            lpTokenContract.balanceOf(targetAddress).catch(() => 0n),
            lpTokenContract.decimals().catch(() => 18)
          ]);

          // ✅ Format balance as a number (integer LP tokens)
          const formatted = Number(ethers.formatUnits(balanceRaw || 0n, decimals || 18));
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

          console.warn(`LP read issue for ${tokenName}:`, reason || err);
          // Safe fallback
          results[tokenName] = { pairAddress: ethers.ZeroAddress, balance: 0 };
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

        if (!statePairAddress || statePairAddress === ethers.ZeroAddress) {
          // No pool yet; set zeros and skip ERC20 calls
          const entry = { pairAddress: statePairAddress || ethers.ZeroAddress, balance: 0 };
          results["STATE"] = entry;
          results[(getSTATEContractAddress(chainId) || "").toLowerCase()] = entry;
        } else {
          // Guard: ensure STATE pair address has code
          let code = "0x";
          try { code = await (httpProvider || provider).getCode(statePairAddress); } catch {}
          if (!code || code === "0x") {
            const entry = { pairAddress: statePairAddress, balance: 0 };
            results["STATE"] = entry;
            results[(getSTATEContractAddress(chainId) || "").toLowerCase()] = entry;
          } else {
            const lpTokenContract = new ethers.Contract(statePairAddress, ERC20_ABI, httpProvider || provider);
            let balanceRaw = 0n;
            let decimals = 18;
            try { balanceRaw = await lpTokenContract.balanceOf(targetAddress); } catch { balanceRaw = 0n; }
            try { decimals = await lpTokenContract.decimals(); } catch { decimals = 18; }
            const formatted = Number(ethers.formatUnits(balanceRaw, decimals));
            const numericBalance = Math.floor(Number.isFinite(formatted) ? formatted : 0);
            const entry = { pairAddress: statePairAddress, balance: numericBalance };
            results["STATE"] = entry;
            results[(getSTATEContractAddress(chainId) || "").toLowerCase()] = entry;
          }
        }
      } catch (err) {
        console.warn("STATE LP read issue:", err?.shortMessage || err?.message || err);
        results["STATE"] = { pairAddress: "error", balance: 0 };
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
  // Track previous address to detect wallet reconnect
  const prevAddressRef = useRef(null);

  useEffect(() => {
    // Prevent premature refresh while contracts are still loading or AuctionContract not ready
    if (loading || !AllContracts?.AuctionContract) {
      return;
    }

    // Detect wallet reconnect (address changes from null/undefined to a value)
    const didReconnect = !prevAddressRef.current && address;
    prevAddressRef.current = address;

    if (didReconnect) {
      console.log('🔄 Wallet reconnected, triggering immediate synchronized data refresh');
    }

    // Define all data fetch functions in proper sequence
    // Token map MUST be fetched first so other functions can use it
    const dataFetchFunctions = [
      fetchUserTokenAddresses,  // PRIORITY 1: Get token map first
      fetchTodayToken,          // PRIORITY 2: Get today's token info
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
      HasUserBurnedForToken,
      HasUserCompletedReverseStep1,
      HasUserCompletedReverseStep2,
      fetchPstateToPlsRatio,
    ];

    const auctionStatusFunctions = [
      CheckIsAuctionActive,
      CheckIsReverse,
    ];

    // Synchronized refresh: fetch token map and today's token first, then everything else
    const runSynchronizedRefresh = async () => {
      try {
        // Step 1: Fetch token addresses AND today's token first (both critical)
        await Promise.all([
          fetchUserTokenAddresses(),
          fetchTodayToken(),
        ]);
        
        // Step 2: Fetch all other data in parallel
        const results = await Promise.allSettled([
          ...dataFetchFunctions.slice(2), // Skip first 2 since we already did them
          ...auctionStatusFunctions,
        ].map((fn) => fn()));

        // Log any failures for debugging
        results.forEach((result, index) => {
          if (result.status === "rejected") {
            const allFns = [...dataFetchFunctions.slice(2), ...auctionStatusFunctions];
            console.debug(
              `Data fetch function ${allFns[index]?.name || index} failed:`,
              result.reason
            );
          }
        });
      } catch (error) {
        console.error('Synchronized refresh error:', error);
      }
    };

    // Expose the refresh function via ref and optional window event
    runSyncRef.current = runSynchronizedRefresh;
    const handleForceRefresh = () => runSynchronizedRefresh();
    try { window.addEventListener('forceSynchronizedRefresh', handleForceRefresh); } catch {}

    // Initial synchronized refresh
    runSynchronizedRefresh();

    // SINGLE unified polling interval - refreshes every 10 seconds
    // This keeps the UI continuously aligned with smart contract state
    const unifiedPollingInterval = setInterval(() => {
      runSynchronizedRefresh();
    }, 10000); // 10 seconds - same as wallet reconnect behavior

    // Listen for account changes in MetaMask
    const handleAccountsChanged = (accounts) => {
      if (accounts.length === 0) {
        console.log('Wallet disconnected, triggering immediate synchronized refresh...');
        runSynchronizedRefresh();
      } else if (accounts[0] !== address) {
        console.log('Account changed, triggering immediate synchronized refresh...');
        // Immediate refresh on account change (same as wallet reconnect)
        runSynchronizedRefresh();
      }
    };

    // Add event listener for account changes
    if (window.ethereum) {
      window.ethereum.on('accountsChanged', handleAccountsChanged);
    }

    return () => {
      clearInterval(unifiedPollingInterval);
      if (window.ethereum) {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
      }
      try { window.removeEventListener('forceSynchronizedRefresh', handleForceRefresh); } catch {}
      runSyncRef.current = null;
    };
  }, [AllContracts, address, loading]);

  const ERC20_ABI = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)",
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  // Minimal Pair ABI for reserve-based preview of reverse step 1 output
  const IPAIR_ABI = [
    "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
  ];

  // Preview STATE out for reverse step 1 using on-chain reserves (matches ReverseAuctionCalculations)
  const estimateReverseStep1StateOut = useCallback(async (auctionTokenAddr, amountIn) => {
    try {
      if (!AllContracts?.AuctionContract || !auctionTokenAddr || !amountIn || amountIn === 0n) return 0n;
      const pairAddr = await AllContracts.AuctionContract.getPairAddress(auctionTokenAddr);
      if (!pairAddr || pairAddr === ethers.ZeroAddress) return 0n;
      const pair = new ethers.Contract(pairAddr, IPAIR_ABI, httpProvider || provider);
      const [reserve0, reserve1] = await pair.getReserves();
      const token0 = await pair.token0();
      const token1 = await pair.token1();
      const stateAddr = getStateAddress();

      if ((reserve0 === 0n) || (reserve1 === 0n)) return 0n;

      let tokenReserve = 0n;
      let stateReserve = 0n;
      if (token0?.toLowerCase() === auctionTokenAddr.toLowerCase() && token1?.toLowerCase() === stateAddr.toLowerCase()) {
        tokenReserve = BigInt(reserve0);
        stateReserve = BigInt(reserve1);
      } else if (token0?.toLowerCase() === stateAddr.toLowerCase() && token1?.toLowerCase() === auctionTokenAddr.toLowerCase()) {
        tokenReserve = BigInt(reserve1);
        stateReserve = BigInt(reserve0);
      } else {
        // Pair mismatch
        return 0n;
      }

      const tokenInWithFee = BigInt(amountIn) * 997n;
      const numerator = tokenInWithFee * stateReserve;
      const denominator = (tokenReserve * 1000n) + tokenInWithFee;
      if (denominator === 0n) return 0n;
      return numerator / denominator;
    } catch (e) {
      console.debug('estimateReverseStep1StateOut failed:', e?.message || e);
      return 0n;
    }
  }, [AllContracts?.AuctionContract, httpProvider, provider]);

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
              const todayAddr = await getTodayTokenAddress(AllContracts.AuctionContract);
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
          if (approvalErr?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(approvalErr?.message || "")) {
            setTxStatusForSwap("cancelled");
            notifyError("Transaction cancelled by user.");
          } else {
            notifyError("Approval failed");
            setTxStatusForSwap("error");
          }
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      }

      // Call burnTokensForState (step 2) - simulate first to avoid wallet popup on revert
      setButtonTextStates((prev) => ({ ...prev, [id]: "Burning for STATE..." }));
      setTxStatusForSwap("pending");
      try {
        const withSigner = AllContracts.AuctionContract.connect(signer);
        const burnFn = withSigner.getFunction('burnTokensForState()');
        // Simulation to catch on-chain errors early
        await burnFn.staticCall();
        const burnTx = await burnFn();
        const receipt = await burnTx.wait();

        if (receipt.status === 1) {
  notifySuccess(`Ratio swap completed`);
          setTxStatusForSwap("confirmed");
          // Refresh dependent data
          await getOutPutAmount();
          await getTokensBurned();
          // Refresh step-2 completion flag immediately
          try { await HasUserBurnedForToken(); } catch {}
          // Also optimistically set the address-keyed flag to true for instant UI feedback
          try {
            const addr = (tokenAddress || '').toLowerCase();
            if (addr) {
              setUserHasBurned((prev) => ({ ...prev, [addr]: true }));
            }
          } catch {}
        } else {
          notifyError("Burn transaction failed");
          setTxStatusForSwap("error");
        }
      } catch (sendOrSimErr) {
        // Handle cancellation cleanly
        if (sendOrSimErr?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(sendOrSimErr?.message || "")) {
          setTxStatusForSwap("cancelled");
          notifyError("Transaction cancelled by user.");
        } else {
          let msg = sendOrSimErr?.reason || sendOrSimErr?.shortMessage || sendOrSimErr?.error?.errorName || sendOrSimErr?.message || "Burn failed";
          if (/NotToday/i.test(msg)) msg = "Not today's window for this token. Try the active window for the daily token.";
          if (/Step1NotCompleted/i.test(msg)) msg = "Complete Step 1 (Claim) before Ratio Swap.";
          if (/DavInsufficient/i.test(msg)) msg = "Not enough DAV (need >= 1 DAV unit).";
          if (/InsufficientAllowance/i.test(msg)) msg = "Token allowance is insufficient.";
          if (/UnsupportedToken/i.test(msg)) msg = "This token is not supported in the auction.";
          notifyError(msg);
          setTxStatusForSwap("error");
        }
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

  // Reverse auction Step 1: swap auction tokens to receive STATE (limited to last 3 normal cycles net tokens)
  const performReverseSwapStep1 = async (id, tokenIdentifier, maybeTokenAddress) => {
    try {
      if (!AllContracts?.AuctionContract || !signer) {
        notifyError("Wallet or contract not ready");
        return;
      }

      // Bind the Auction contract to the signer so simulations/txs include msg.sender
      const AuctionWithSigner = AllContracts.AuctionContract.connect(signer);

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
              const todayAddr = await getTodayTokenAddress(AllContracts.AuctionContract);
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
  const isRev = await AuctionWithSigner.isReverseAuctionActive(tokenAddress).catch(() => false);
      if (!isRev) {
        notifyError("Normal auction window active. Reverse swap is only available in reverse windows.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Preflight checks to avoid on-chain custom error reverts
      try {
  const supported = await AuctionWithSigner.isTokenSupported(tokenAddress);
        if (!supported) {
          notifyError("This token is not supported in the auction.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}
      try {
  const can = await AuctionWithSigner.canParticipateInAuction(address, tokenAddress);
        if (!can) {
          notifyError("Not enough DAV (need >= 1 DAV unit).");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}
      try {
  const already = await AuctionWithSigner.hasUserCompletedReverseStep1(address, tokenAddress);
        if (already) {
          notifyError("You already completed Reverse Step 1 for this cycle.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}

      // Note: Some deployments may require normal Step 2 completion before reverse Step 1.
      // Do NOT block here. We'll rely on simulation to surface a precise custom error (Step2NotCompleted) when applicable.
      try {
        if (typeof AuctionWithSigner.hasCompletedStep2 === 'function') {
          const hasStep2 = await AuctionWithSigner.hasCompletedStep2(address, tokenAddress);
          console.debug('Preflight hasCompletedStep2:', hasStep2);
        }
      } catch (e) {
        console.debug('hasCompletedStep2 preflight check skipped:', e?.message || e);
      }

      // Use user's allowed amount based on last 3 normal-auction cycles (contract will auto-cap as well)
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
      // Compute max allowed based on prior 3 normal auction cycles
      let maxAllowed = 0n;
      try {
        const currentCycle = await AuctionWithSigner.getCurrentAuctionCycle(tokenAddress);
        const cycleNum = Number(currentCycle || 0);
        if (cycleNum > 0) {
          for (let i = 1; i <= 3 && cycleNum > i; i++) {
            try {
              const net = await AuctionWithSigner.calculateNetTokensFromNormalAuction(address, tokenAddress, cycleNum - i);
              maxAllowed += BigInt(net || 0);
            } catch {}
          }
        }
      } catch {}
      // Amount to attempt
      let unitToBurn = BigInt(bal);
      if (maxAllowed > 0n) {
        // Respect contract-side cap when available
        unitToBurn = BigInt(bal) < maxAllowed ? BigInt(bal) : maxAllowed;
      }

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
          if (approvalErr?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(approvalErr?.message || "")) {
            setTxStatusForSwap("cancelled");
            notifyError("Transaction cancelled by user.");
          } else {
            notifyError("Approval failed");
            setTxStatusForSwap("error");
          }
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      }

      // Preview STATE out using reserves; also ensure vault can cover it to avoid opaque reverts
      let expectedStateOut = 0n;
      try {
        expectedStateOut = await estimateReverseStep1StateOut(tokenAddress, unitToBurn);
        if (expectedStateOut === 0n) {
          notifyError("Pool returned zero output for this amount.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
        // Check vault STATE balance
        const stateTokenAddress = getStateAddress();
        const stateCtr = new ethers.Contract(stateTokenAddress, ERC20_ABI, httpProvider || provider);
        const vaultBal = await stateCtr.balanceOf(getAuctionAddress());
        if (BigInt(vaultBal) < expectedStateOut) {
          notifyError("Vault has insufficient STATE for this swap.");
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
        AuctionWithSigner.interface.getFunction('reverseSwapTokensForState(uint256)');
        const fn = AuctionWithSigner.getFunction('reverseSwapTokensForState(uint256)');
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
              '0xfe6651de': 'MustClaimAllDavAirdrops',
            };
            
            if (errorMap[selector]) {
              errName = errorMap[selector];
              console.log('✅ Identified error by selector:', errName);
            }
          }
        }
        
        let simMsg = simErr?.reason || simErr?.shortMessage || simErr?.message || simErr?.toString() || "Reverse swap simulation failed";
        if ((simErr?.shortMessage || simErr?.message)?.toLowerCase?.().includes('missing revert data')) {
          simMsg = "No history of normal auction participation during the last 3 cycles.";
        }
        
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
  else if (errName === 'NoNormalAuctionParticipation') simMsg = "You must have participated in at least one of the last 3 normal auctions for this token.";
        else if (errName === 'ParticipantCapReached') simMsg = "Participant cap reached for auctions.";
        else if (errName === 'ScheduleNotSet') simMsg = "Auction schedule is not set.";
        else if (errName === 'Ended') simMsg = "Auction period has ended.";
        else if (errName === 'NotToday') simMsg = "Not today's window for this token.";
        else if (errName === 'Step1NotCompleted') simMsg = "Complete Step 1 (Claim) before Ratio Swap.";
        else if (errName === 'Step2NotCompleted') simMsg = "Complete Step 2 (Burn Tokens for STATE) first. Reverse Step 1 requires you to have burned auction tokens in the normal auction first.";
        else if (errName === 'MustClaimAllDavAirdrops') simMsg = "Claim all pending DAV airdrops before performing this action.";
        else if (errName === 'PausedErr') simMsg = "Contract is paused.";
        else if (errName === 'Unauthorized') simMsg = "Unauthorized action.";
        else if (errName === 'ZeroAddr') simMsg = "Invalid zero address.";
        
        console.log('Final message:', simMsg);
        
        // If still generic, provide detailed diagnostics
        if (simMsg.includes('unknown custom error') || simMsg.includes('execution reverted')) {
          const selector = errorData?.length >= 10 ? errorData.slice(0, 10) : 'none';
          simMsg = `Reverse swap blocked. Error: ${errName || 'Unknown'}. Selector: ${selector}. Check console (F12) for full details.`;
        }
        
        // Optional force-send override via URL (?forceSend=1 or ?forceTx=1)
        let forceSend = false;
        try {
          const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
          const fs = (qs?.get('forceSend') || qs?.get('forceTx') || '').toLowerCase();
          forceSend = fs === '1' || fs === 'true';
        } catch {}

        if (!forceSend) {
          notifyError(simMsg);
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap("error");
          // Stop here on simulation failure by default
          return;
        }

        // Force send even if simulation failed
        console.warn('[Reverse Step 1] Simulation failed but forceSend is enabled — attempting direct transaction...');
        try {
          const data = AuctionWithSigner.interface.encodeFunctionData('reverseSwapTokensForState(uint256)', [unitToBurn]);
          const gas = 350000n; // conservative gas limit
          const txForced = await signer.sendTransaction({ to: getAuctionAddress(), data, gasLimit: gas });
          console.log('[Reverse Step 1] Forced tx sent:', txForced.hash);
          const rcForced = await txForced.wait();
          console.log('[Reverse Step 1] Forced tx receipt:', rcForced);
          notifySuccess('Reverse swap transaction sent');
          try {
            const amount = await AuctionWithSigner.getReverseStateBalance(address, tokenAddress).catch(() => 0n);
            setReverseStateMap((prev) => ({ ...prev, [tokenAddress]: Number(ethers.formatUnits(amount || 0n, 18)) }));
            await HasUserCompletedReverseStep1();
          } catch {}
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap('success');
          return;
        } catch (sendErr) {
          console.error('[Reverse Step 1] Forced send failed:', sendErr);
          let m = sendErr?.reason || sendErr?.shortMessage || sendErr?.message || 'Reverse swap failed';
          notifyError(m);
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap('error');
          return;
        }
      }
  // If simulation passes, send tx using the exact selected signature (MetaMask should prompt now)
  const tx = await AuctionWithSigner.getFunction(selected.key)(...selected.args);
      const receipt = await tx.wait();
      if (receipt.status === 1) {
        notifySuccess("Reverse swap completed (Step 1)");
        setTxStatusForSwap("confirmed");
        try {
          // Refresh reverse state balance for this token
          const amount = await AuctionWithSigner.getReverseStateBalance(address, tokenAddress);
          // Preserve decimals so small STATE amounts (>0 and <1) aren't rounded down to 0
          setReverseStateMap((prev) => ({ ...prev, [tokenAddress]: Number(ethers.formatUnits(amount, 18)) }));
          // Refresh on-chain completion flag for immediate UI ✅ update
          try { await HasUserCompletedReverseStep1(); } catch {}
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
              '0xfe6651de': 'MustClaimAllDavAirdrops',
            };
            
            if (errorMap[selector]) {
              errName = errorMap[selector];
              console.log('✅ Identified error by selector:', errName);
            }
          }
        }
        
        let msg = error?.reason || error?.shortMessage || error?.message || error?.toString() || "Reverse swap failed";
        if ((error?.shortMessage || error?.message)?.toLowerCase?.().includes('missing revert data')) {
          // Provide more actionable guidance instead of network-only hint
          msg = "Transaction reverted without error data. Possible causes: reverse window ended, not today's token, or vault lacks STATE. Please refresh the auction status and retry.";
        }
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
        else if (errName === 'MustClaimAllDavAirdrops') msg = "Claim all pending DAV airdrops before performing this action.";
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

      // Bind the Auction contract to the signer so simulations/txs include msg.sender
      const AuctionWithSigner = AllContracts.AuctionContract.connect(signer);

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
              const todayAddr = await getTodayTokenAddress(AllContracts.AuctionContract);
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
  const isRev = await AuctionWithSigner.isReverseAuctionActive(tokenAddress).catch(() => false);
      if (!isRev) {
        notifyError("Normal auction window active. Step 2 is only available in reverse windows.");
        setSwappingStates((p) => ({ ...p, [id]: false }));
        return;
      }

      // Ensure Reverse Step 1 completed (required by contract)
      try {
        const done = await AuctionWithSigner.hasUserCompletedReverseStep1(address, tokenAddress);
        if (!done) {
          notifyError("Complete Reverse Step 1 first.");
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      } catch {}

      // Note: Contract now checks normal-auction participation using prior 3 appearances.
      // UI cannot pre-verify this precisely; rely on contract revert and show a clear hint on failure.

      // Approval: ensure STATE has allowance to AuctionSwap (amount unknown; approve if currently zero)
      const stateTokenAddress = getStateAddress();
      const stateCtr = new ethers.Contract(stateTokenAddress, ERC20_ABI, signer);

      // Approve if needed
      setButtonTextStates((prev) => ({ ...prev, [id]: "Checking allowance..." }));
      const auctionAddr = getAuctionAddress();
      const allowance = await stateCtr.allowance(address, auctionAddr);
      if (BigInt(allowance) === 0n) {
        try {
          setTxStatusForSwap("Approving");
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          const tx = await stateCtr.approve(auctionAddr, maxUint256);
          await tx.wait();
        } catch (approvalErr) {
          console.error("STATE approval failed:", approvalErr);
          if (approvalErr?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(approvalErr?.message || "")) {
            setTxStatusForSwap("cancelled");
            notifyError("Transaction cancelled by user.");
          } else {
            notifyError("STATE approval failed");
            setTxStatusForSwap("error");
          }
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
      }

      // Burn STATE to receive tokens (Step 2) - contract auto-detects today's token
      setButtonTextStates((prev) => ({ ...prev, [id]: "Burning STATE..." }));
      setTxStatusForSwap("pending");
      // Dynamic signature resolution for reverse step 2 with clear error propagation
      const resolveReverseStep2 = async () => {
        const c = AuctionWithSigner;
        const candidates = [
          // Contract ignores the parameter and burns exactly the STATE received from Reverse Step 1
          { key: 'burnStateForTokens(uint256)', args: [0n] },
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
            // Always treat failed staticCall as a hard failure; we'll show diagnostics instead of blindly sending
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
  let forceDirectSend2 = false; // reverse step 2: bypass estimateGas if proceeding despite sim failure
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
    if (errName === 'NoNormalAuctionParticipation') simMsg = "Complete Reverse Step 1 first and ensure you have STATE from that step.";
        if (errName === 'UnsupportedToken') simMsg = "This token is not supported in the auction.";
        else if (errName === 'StateNotSet') simMsg = "STATE token is not configured yet.";
        else if (errName === 'NotStarted') simMsg = "Reverse window not active yet.";
        else if (errName === 'AlreadySwapped' || errName === 'AlreadyReverse') simMsg = "You already completed Reverse Step 2 for this cycle.";
        else if (errName === 'Step1NotCompleted') simMsg = "Complete Reverse Step 1 first.";
        else if (errName === 'AmountZero') simMsg = "Amount must be greater than zero.";
        else if (errName === 'InsufficientBalance') simMsg = "Insufficient STATE balance for reverse burn.";
        else if (errName === 'InsufficientAllowance') simMsg = "STATE allowance is insufficient.";
        else if (errName === 'InsufficientVault') simMsg = "Vault has insufficient auction tokens for redemption.";
        else if (errName === 'InvalidParam') simMsg = "Invalid pool parameters or ratio. Please try again later.";
        else if (errName === 'PausedErr') simMsg = "Contract is paused.";
        else if (errName === 'Unauthorized') simMsg = "Unauthorized action.";
        // If still generic, append raw error info for diagnostics
        if (simMsg.includes('unknown custom error') || simMsg.includes('execution reverted')) {
          const hexData = simErr?.data || simErr?.error?.data?.data || simErr?.error?.data;
          simMsg = `Reverse Step 2 blocked: ${errName || 'Unknown reason'}. Check console for details. ${hexData ? `(data: ${hexData.slice(0,18)}...)` : ''}`;
        }
        // Special handling for opaque "missing revert data" from nodes
        const msgTxt = (simErr?.shortMessage || simErr?.message || '').toLowerCase?.() || '';
        if (!errName && msgTxt.includes('missing revert data')) {
          try {
            console.log('[Reverse Step 2] Running diagnostics after missing-revert-data...');
            const todayAddr = tokenAddress;
            const [rev, sup, paused, s1, revBal, normalBal, userBal] = await Promise.all([
              AuctionWithSigner.isReverseAuctionActive(todayAddr).catch(() => undefined),
              AuctionWithSigner.isTokenSupported(todayAddr).catch(() => undefined),
              AllContracts.AuctionContract.paused?.().catch(() => undefined),
              AuctionWithSigner.hasUserCompletedReverseStep1(address, todayAddr).catch(() => undefined),
              AuctionWithSigner.getReverseStateBalance(address, todayAddr).catch(() => 0n),
              AllContracts.AuctionContract.getUserStateBalance(address, todayAddr).catch(() => 0n),
              new ethers.Contract(getStateAddress(), ERC20_ABI, httpProvider || provider).balanceOf(address).catch(() => 0n),
            ]);
            let vaultToken = 0n;
            try {
              const tokenCtr = new ethers.Contract(todayAddr, ERC20_ABI, httpProvider || provider);
              vaultToken = await tokenCtr.balanceOf(getAuctionAddress());
            } catch {}
            console.log('[Reverse Step 2] Diagnostics:', {
              reverseActive: rev, supported: sup, paused,
              hasReverseStep1: s1, reverseStateFromStep1: ethers.formatEther(revBal || 0n),
              normalStateFromStep2: ethers.formatEther(normalBal || 0n),
              userStateWallet: ethers.formatEther(userBal || 0n),
              vaultTokenBalance: vaultToken ? vaultToken.toString() : '0',
            });
            // Heuristics for likely cause
            if (!rev) simMsg = 'Reverse window not active yet.';
            else if (paused) simMsg = 'Contract is paused.';
            else if (sup === false) simMsg = 'This token is not supported in the auction.';
            else if (s1 === false) simMsg = 'Complete Reverse Step 1 first.';
            else if (BigInt(revBal || 0n) === 0n) simMsg = 'No STATE recorded from Reverse Step 1 for this token.';
            // balance/expectedOut unknown here; rely on contract errors for insufficiency or vault liquidity
          } catch {}
        }
        // If developer override is enabled, allow proceeding to send tx despite simulation failure
        let proceedDirect = false;
        try {
          if (allowDirectContractCalls()) {
            proceedDirect = window.confirm('Simulation failed. Proceed to send burnStateForTokens anyway? This may revert.');
          }
        } catch {}
        if (!proceedDirect) {
          notifyError(simMsg);
          setSwappingStates((p) => ({ ...p, [id]: false }));
          setTxStatusForSwap("error");
          return;
        } else {
          console.warn('[Reverse Step 2] Proceeding with direct tx despite simulation failure...');
          selected2 = { key: 'burnStateForTokens(uint256)', args: [0n] };
          forceDirectSend2 = true;
        }
      }
      const burnFn = AuctionWithSigner.getFunction(selected2.key);
      let burnTx;
      if (forceDirectSend2) {
        const gas = getFallbackGasLimit('fallbackGasLimitReverse2', 500000n);
        const populated = await burnFn.populateTransaction(...selected2.args);
        // Defensive: ensure calldata is present; if not, encode manually
        if (!populated.data || populated.data === '0x' || populated.data === '') {
          try {
            const calldata = AuctionWithSigner.interface.encodeFunctionData(selected2.key, selected2.args || []);
            populated.data = calldata;
          } catch (encErr) {
            console.warn('[Reverse Step 2] Could not encode calldata, aborting send.', encErr);
            notifyError('Internal error preparing transaction. Please refresh and try again.');
            setSwappingStates((p) => ({ ...p, [id]: false }));
            setTxStatusForSwap('error');
            return;
          }
        }
        if (!populated.to) populated.to = AllContracts.AuctionContract.target || await AllContracts.AuctionContract.getAddress?.();
        populated.value = populated.value ?? 0n;
        populated.gasLimit = gas;
        console.log(`[Reverse Step 2] Forcing send with gasLimit=${gas.toString()}`);
        console.log('[Reverse Step 2] Tx preview:', { to: populated.to, dataLen: (populated.data||'').length, gas: gas.toString() });
        burnTx = await signer.sendTransaction(populated);
      } else {
        burnTx = await burnFn(...selected2.args);
      }
      const receipt = await burnTx.wait();
      if (receipt.status === 1) {
        notifySuccess("Reverse Step 2 completed");
        setTxStatusForSwap("confirmed");
        // Clear local reverse state record for this token
        setReverseStateMap((prev) => ({ ...prev, [tokenAddress]: 0 }));
        // Refresh on-chain completion flag for immediate UI ✅ update
        try { await HasUserCompletedReverseStep2(); } catch {}
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
    console.log('[Step3] AuctionSwap contract address:', ContractAddressToUse);
    console.log('[Step3] Connected user address:', address);
    
    // For NORMAL auction Step 3, swapTokens() spends STATE from the user.
    // Get the actual STATE amount needed for this swap
    const todayAddrTemp = await getTodayTokenAddress(AllContracts.AuctionContract);
    const userStateNeeded = await AllContracts.AuctionContract.getUserStateBalance(address, todayAddrTemp).catch(() => 0n);
    
    console.log('[Step3] STATE needed for swap:', ethers.formatEther(userStateNeeded));
    
    // Always approve STATE token to the SWAP contract if insufficient
    const stateTokenContract = new ethers.Contract(getStateAddress(), ERC20_ABI, signer);
    console.log('[Step3] STATE token address:', getStateAddress());
    
    // Check actual STATE balance in user's wallet FIRST
    const userStateInWallet = await stateTokenContract.balanceOf(address);
    console.log('[Step3] STATE in user wallet:', ethers.formatEther(userStateInWallet));
    
    if (userStateInWallet < userStateNeeded) {
      notifyError(`Insufficient STATE in wallet! Required: ${ethers.formatEther(userStateNeeded)} STATE • In wallet: ${ethers.formatEther(userStateInWallet)} STATE. The STATE from Step 2 should be in your wallet. Please check your Step 2 transaction.`);
      setTxStatusForSwap("error");
      setSwappingStates((prev) => ({ ...prev, [id]: false }));
      return;
    }
    
    const allowance = await stateTokenContract.allowance(address, ContractAddressToUse);
    console.log('[Step3] Current STATE allowance to AuctionSwap:', ethers.formatEther(allowance));
    
    // Check if allowance is sufficient for the swap amount
    if (allowance < userStateNeeded) {
      setButtonTextStates((prev) => ({
        ...prev,
        [id]: "Approving STATE...",
      }));
      console.log(`[Step3] Insufficient allowance (${ethers.formatEther(allowance)} < ${ethers.formatEther(userStateNeeded)}). Sending approval transaction to ${ContractAddressToUse}...`);        try {
          setTxStatusForSwap("Approving");
          // Approve unlimited amount (max uint256)
          const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
          console.log(`[Step3] Approving ${ethers.formatEther(maxUint256)} STATE to ${ContractAddressToUse}...`);
          const approveTx = await stateTokenContract.approve(
            ContractAddressToUse,
            maxUint256
          );
          console.log('[Step3] Approval transaction sent, hash:', approveTx.hash);
          await approveTx.wait();
          console.log("[Step3] ✅ Approval successful!");
          
          // Verify approval went through
          const newAllowance = await stateTokenContract.allowance(address, ContractAddressToUse);
          console.log('[Step3] New allowance after approval:', ethers.formatEther(newAllowance));
        } catch (approvalError) {
          console.error("[Step3] ❌ Approval transaction failed:", approvalError);
          if (approvalError?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(approvalError?.message || "")) {
            setTxStatusForSwap("cancelled");
            notifyError("Transaction cancelled by user.");
            setButtonTextStates((prev) => ({ ...prev, [id]: "Cancelled" }));
          } else {
            setButtonTextStates((prev) => ({ ...prev, [id]: "STATE approval failed" }));
            setTxStatusForSwap("error");
          }
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return false;
      }
    } else {
      console.log(
        `[Step3] ✅ STATE allowance sufficient (${ethers.formatEther(allowance)} >= ${ethers.formatEther(userStateNeeded)}). Proceeding to swap.`
      );
    }
      // Resolve today's token for preflights using a fresh read-only provider snapshot
      const readOnlyAuction = AllContracts.AuctionContract.connect(httpProvider);
      const todayAddr = await getTodayTokenAddress(readOnlyAuction);
      if (!todayAddr || todayAddr === ethers.ZeroAddress) {
        notifyError("No auction token scheduled for today.");
        setTxStatusForSwap("error");
        setSwappingStates((prev) => ({ ...prev, [id]: false }));
        return;
      }


      // Preflight: must be normal window and active
      try {
        // Always re-check via read-only provider to avoid stale signer runner
        const [isRevNow, isActNow, tLeftNow] = await Promise.all([
          readOnlyAuction.isReverseAuctionActive(todayAddr).catch(() => false),
          readOnlyAuction.isAuctionActive(todayAddr).catch(() => false),
          readOnlyAuction.getAuctionTimeLeft(todayAddr).catch(() => 0n),
        ]);
        const timeLeftSec = Number(tLeftNow || 0n);
        // Guard against edge-of-window flaps; require minimal buffer time
        const minBuffer = 15; // seconds
        if (timeLeftSec <= 0 || !isActNow) {
          notifyError(`Auction period is not active on-chain (timeLeft=${timeLeftSec}s). Please wait for the next window.`);
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
        if (isRevNow) {
          notifyError("Reverse auction window is active. Step 3 is only available during normal windows.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
        if (timeLeftSec <= minBuffer) {
          notifyError(`Auction is about to end (${timeLeftSec}s). Please try earlier in the next window.`);
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
      } catch {}

      // Preflight: step requirements and balance
      try {
        const s1 = await AllContracts.AuctionContract.hasCompletedStep1(address, todayAddr).catch(() => true);
        if (!s1) {
          notifyError("Complete Step 1 (Claim) first.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
      } catch {}
      try {
        if (typeof AllContracts.AuctionContract.hasCompletedStep2 === 'function') {
          const s2 = await AllContracts.AuctionContract.hasCompletedStep2(address, todayAddr);
          if (!s2) {
            notifyError("Complete Step 2 (Burn for STATE) before Step 3.");
            setTxStatusForSwap("error");
            setSwappingStates((prev) => ({ ...prev, [id]: false }));
            return;
          }
        }
      } catch {}

      // Require some STATE to swap (either wallet balance or recorded user balance for this token)
      try {
        const [walletBal, userBal] = await Promise.all([
          stateTokenContract.balanceOf(address).catch(() => 0n),
          AllContracts.AuctionContract.getUserStateBalance(address, todayAddr).catch(() => 0n),
        ]);
        if (BigInt(walletBal) === 0n && BigInt(userBal) === 0n) {
          notifyError("No STATE available to swap for Step 3.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
      } catch {}

      // Additional preflights: paused, pair availability & reserves
      try {
        const isPaused = await AllContracts.AuctionContract.paused?.().catch(() => false);
        if (isPaused) {
          notifyError("Contract is paused.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
      } catch {}
      try {
        const stateAddr = getStateAddress();
        const pairAddr = await AllContracts.AuctionContract.getPairAddress(todayAddr).catch(() => ethers.ZeroAddress);
        if (!pairAddr || pairAddr === ethers.ZeroAddress) {
          notifyError("Pool not found for today's token.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
        // Check reserves non-zero
        const pair = new ethers.Contract(pairAddr, IPAIR_ABI, httpProvider || provider);
        const [r0, r1] = await pair.getReserves().catch(() => [0n, 0n]);
        const t0 = await pair.token0();
        const t1 = await pair.token1();
        let a = 0n, b = 0n;
        if (t0?.toLowerCase() === stateAddr.toLowerCase() && t1?.toLowerCase() === todayAddr.toLowerCase()) {
          a = BigInt(r0); b = BigInt(r1);
        } else if (t0?.toLowerCase() === todayAddr.toLowerCase() && t1?.toLowerCase() === stateAddr.toLowerCase()) {
          a = BigInt(r1); b = BigInt(r0);
        }
        if (a === 0n || b === 0n) {
          notifyError("Pool has zero reserves; swap unavailable now.");
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        }
        
        // Check if pool has sufficient liquidity for the swap
        // Get user's STATE balance from Step 2
        const userStateBalance = await AllContracts.AuctionContract.getUserStateBalance(address, todayAddr).catch(() => 0n);
        if (userStateBalance > 0n) {
          // Max safe swap is 20% of pool STATE reserves to avoid excessive price impact
          const maxSafeSwap = (a * 20n) / 100n;
          
          if (userStateBalance > maxSafeSwap) {
            const userStateFormatted = ethers.formatEther(userStateBalance);
            const maxSafeFormatted = ethers.formatEther(maxSafeSwap);
            const poolStateFormatted = ethers.formatEther(a);
            notifyError(
              `Insufficient pool liquidity! Your Step 2 STATE: ${Number(userStateFormatted).toLocaleString()} • Pool STATE reserve: ${Number(poolStateFormatted).toLocaleString()} • Max safe swap (20% of pool): ${Number(maxSafeFormatted).toLocaleString()}. Please add liquidity to the pool or wait for more liquidity before Step 3.`
            );
            setTxStatusForSwap("error");
            setSwappingStates((prev) => ({ ...prev, [id]: false }));
            return;
          }
        }
      } catch {}

      setButtonTextStates((prev) => ({ ...prev, [id]: "Swapping..." }));
      setTxStatusForSwap("pending");
      
      // Additional diagnostics before simulation
      try {
        console.log('[Step3] ===== Pre-simulation diagnostics =====');
        const routerAddr = await AllContracts.AuctionContract.pulseXRouter().catch(() => null);
        console.log('[Step3] PulseX Router address:', routerAddr);
        
        const pairAddr = await AllContracts.AuctionContract.getPairAddress(todayAddr).catch(() => null);
        console.log('[Step3] Pair address for today token:', pairAddr);
        
        const userStateBalance = await AllContracts.AuctionContract.getUserStateBalance(address, todayAddr);
        console.log('[Step3] User STATE balance for swap (stored in contract):', ethers.formatEther(userStateBalance));
        
        // CRITICAL: Check actual STATE in user's wallet
        const userWalletStateBalance = await stateTokenContract.balanceOf(address);
        console.log('[Step3] 🔴 STATE in user WALLET (actual):', ethers.formatEther(userWalletStateBalance));
        console.log('[Step3] 🔴 STATE needed from wallet:', ethers.formatEther(userStateBalance));
        
        if (userWalletStateBalance < userStateBalance) {
          console.error('[Step3] ❌ INSUFFICIENT STATE IN WALLET!');
          console.error('[Step3] Required:', ethers.formatEther(userStateBalance));
          console.error('[Step3] Available:', ethers.formatEther(userWalletStateBalance));
          console.error('[Step3] Missing:', ethers.formatEther(userStateBalance - userWalletStateBalance));
        }
        
        // Final allowance check before simulation
        const finalAllowance = await stateTokenContract.allowance(address, ContractAddressToUse);
        console.log('[Step3] Final STATE allowance to AuctionSwap:', ethers.formatEther(finalAllowance));
        
        if (finalAllowance < userStateBalance) {
          console.error('[Step3] ❌ INSUFFICIENT ALLOWANCE!');
          console.error('[Step3] Required allowance:', ethers.formatEther(userStateBalance));
          console.error('[Step3] Current allowance:', ethers.formatEther(finalAllowance));
        }
        
        // Expected output: not available via public ABI; skip internal helper
        // We rely on pool reserves pre-checks and slippage handled by the contract
        console.log('[Step3] Skipping expected output calc (internal-only function).');
        console.log('[Step3] ==========================================');
      } catch (diagErr) {
        console.error('[Step3] Pre-simulation diagnostics error:', diagErr);
      }
      
      // Simulate to surface precise custom errors before sending the tx
      const c = AllContracts.AuctionContract.connect(signer);
      let forceDirectSend = false; // when true, bypass estimateGas by specifying gasLimit
      try {
        const fn = c.getFunction('swapTokens()');
        console.log('[Step3] Simulating swapTokens() call...');
        await fn.staticCall();
        console.log('[Step3] Simulation successful!');
      } catch (simErr) {
        console.error('[Step3] Simulation failed:', simErr);
        console.error('[Step3] Error details:', {
          reason: simErr?.reason,
          shortMessage: simErr?.shortMessage,
          message: simErr?.message,
          data: simErr?.data,
          errorData: simErr?.error?.data,
        });
        let msg = simErr?.reason || simErr?.shortMessage || simErr?.message || "Swap simulation failed";
        // Track Ended() custom error but do not block; proceed to direct send as requested
        let endedDetected = false;
        // Fallback: try a raw provider.call to get revert data and decode
        try {
          const iface = c.interface;
          const calldata = iface.encodeFunctionData('swapTokens()', []);
          const toAddr = AllContracts.AuctionContract.target || (await AllContracts.AuctionContract.getAddress?.());
          const callProvider = httpProvider || provider;
          // Use from override so the contract can run msg.sender-based checks
          await callProvider.call({ to: toAddr, data: calldata, from: address });
          console.log('[Step3] provider.call unexpectedly succeeded after signer staticCall failure.');
        } catch (rawErr) {
          const rawData = rawErr?.data || rawErr?.error?.data?.data || rawErr?.error?.data || rawErr?.info?.error?.data;
          if (rawData && typeof rawData === 'string' && rawData.startsWith('0x')) {
            try {
              const parsed = c.interface.parseError(rawData);
              if (parsed?.name) {
                const name = parsed.name;
                const map = {
                  UnsupportedToken: "This token is not supported in the auction.",
                  StateNotSet: "STATE token is not configured yet.",
                  NotStarted: "Auction window not active.",
                  // Ended intentionally not surfaced to user; will proceed to send
                  NotToday: "Not today's window for this token.",
                  Step1NotCompleted: "Complete Step 1 (Claim) first.",
                  Step2NotCompleted: "Complete Step 2 (Burn for STATE) first.",
                  DavInsufficient: "Not enough DAV to participate.",
                  InsufficientVault: "Vault has insufficient liquidity.",
                  InsufficientBalance: "Insufficient balance for swap.",
                  InsufficientAllowance: "Allowance is insufficient.",
                  PausedErr: "Contract is paused.",
                  AlreadySwapped: "You already completed the swap for this cycle.",
                };
                if (name === 'Ended') {
                  endedDetected = true;
                  console.warn('[Step3] Detected Ended() revert in simulation; proceeding to direct send per request.');
                } else {
                  const decoded = map[name] || `Swap blocked: ${name}`;
                  notifyError(decoded);
                  setTxStatusForSwap("error");
                  setSwappingStates((prev) => ({ ...prev, [id]: false }));
                  return;
                }
              }
            } catch {}
          }
        }
        // Attempt to decode custom error
        try {
          const dataHex = simErr?.data || simErr?.error?.data?.data || simErr?.error?.data;
          if (dataHex && typeof dataHex === 'string' && dataHex.startsWith('0x')) {
            const parsed = c.interface.parseError(dataHex);
            if (parsed?.name) {
              const name = parsed.name;
              const map = {
                UnsupportedToken: "This token is not supported in the auction.",
                StateNotSet: "STATE token is not configured yet.",
                NotStarted: "Auction window not active.",
                // Ended intentionally not surfaced to user; will proceed to send
                NotToday: "Not today's window for this token.",
                Step1NotCompleted: "Complete Step 1 (Claim) first.",
                Step2NotCompleted: "Complete Step 2 (Burn for STATE) first.",
                DavInsufficient: "Not enough DAV to participate.",
                InsufficientVault: "Vault has insufficient liquidity.",
                InsufficientBalance: "Insufficient balance for swap.",
                InsufficientAllowance: "Allowance is insufficient.",
                PausedErr: "Contract is paused.",
              };
              if (name === 'Ended') {
                endedDetected = true;
                console.warn('[Step3] Detected Ended() in error data; proceeding to direct send per request.');
              } else {
                msg = map[name] || msg;
              }
            }
          }
        } catch {}
        let proceedDirectAuto = false;
        let diag = {};
        if ((simErr?.shortMessage || simErr?.message)?.toLowerCase?.().includes('missing revert data')) {
          // Build a quick diagnostic snapshot to help user
          try {
            const stateContract = new ethers.Contract(getStateAddress(), ERC20_ABI, httpProvider || provider);
            const currentCycle = await readOnlyAuction.getCurrentAuctionCycle(todayAddr).catch(() => undefined);
            let poolDiagnostic = '';
            try {
              const pairAddr = await readOnlyAuction.getPairAddress(todayAddr).catch(() => null);
              if (pairAddr && pairAddr !== ethers.ZeroAddress) {
                const IPAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)', 'function token1() view returns (address)'];
                const pair = new ethers.Contract(pairAddr, IPAIR_ABI, httpProvider || provider);
                const [r0, r1] = await pair.getReserves();
                const t0 = await pair.token0();
                const t1 = await pair.token1();
                const stateAddr = getStateAddress().toLowerCase();
                let stateReserve = '?', tokenReserve = '?';
                if (t0.toLowerCase() === stateAddr) {
                  stateReserve = ethers.formatEther(r0);
                  tokenReserve = ethers.formatEther(r1);
                } else if (t1.toLowerCase() === stateAddr) {
                  stateReserve = ethers.formatEther(r1);
                  tokenReserve = ethers.formatEther(r0);
                }
                poolDiagnostic = ` • Pool: ${stateReserve} STATE / ${tokenReserve} TOKEN`;
              }
            } catch {}
            const [rev, act, s1, s2, hasSwapped, stateBalance, stateAllowance, tLeftNow] = await Promise.all([
              readOnlyAuction.isReverseAuctionActive(todayAddr).catch(() => undefined),
              readOnlyAuction.isAuctionActive(todayAddr).catch(() => undefined),
              readOnlyAuction.hasCompletedStep1(address, todayAddr).catch(() => undefined),
              typeof readOnlyAuction.hasCompletedStep2 === 'function' ? readOnlyAuction.hasCompletedStep2(address, todayAddr).catch(() => undefined) : Promise.resolve(undefined),
              readOnlyAuction.getUserHasSwapped(address, todayAddr).catch(() => undefined),
              readOnlyAuction.getUserStateBalance(address, todayAddr).catch(() => undefined),
              stateContract.allowance(address, getAuctionAddress()).catch(() => undefined),
              readOnlyAuction.getAuctionTimeLeft(todayAddr).catch(() => undefined),
            ]);
            const timeLeftSec = Number(tLeftNow ?? 0);
            diag = { rev, act, s1, s2, hasSwapped, stateBalance, stateAllowance, poolDiagnostic, currentCycle };
            const stateBalStr = stateBalance !== undefined ? ethers.formatEther(stateBalance) : 'n/a';
            const allowanceStr = stateAllowance !== undefined ? ethers.formatEther(stateAllowance) : 'n/a';
            const needsApproval = (stateBalance !== undefined && stateAllowance !== undefined && stateAllowance < stateBalance) ? ' ⚠️ NEEDS APPROVAL' : '';
            msg = `Swap unavailable. Active=${act ?? 'n/a'} • Reverse=${rev ?? 'n/a'} • tLeft=${timeLeftSec}s • Step1=${s1 ?? 'n/a'} • Step2=${s2 ?? 'n/a'} • Already=${hasSwapped ?? 'n/a'} • StateBalance=${stateBalStr} • Allowance=${allowanceStr}${needsApproval}${poolDiagnostic} (Cycle=${currentCycle ?? 'n/a'})`;
            // If all preflights look good, auto-proceed despite static-call missing revert data
            try {
              const okActive = act === true && rev === false && timeLeftSec > 30;
              const okSteps = s1 === true && s2 === true && hasSwapped === false;
              const okBalances = (typeof stateBalance === 'bigint' ? stateBalance : 0n) > 0n && (typeof stateAllowance === 'bigint' ? stateAllowance : 0n) >= (typeof stateBalance === 'bigint' ? stateBalance : 0n);
              if (okActive && okSteps && okBalances) {
                proceedDirectAuto = true;
                console.warn('[Step3] Auto-proceed: staticCall returned missing-revert-data but all preflights are OK. Proceeding to send tx.');
              }
            } catch {}
          } catch {
            msg = "Swap not available now (window inactive or prerequisites unmet). Refresh auction status and try again.";
          }
        }
        // If Ended was detected, or auto conditions met, or developer override enabled, proceed
        let proceedDirect = endedDetected || proceedDirectAuto;
        try {
          if (!proceedDirect && allowDirectContractCalls()) {
            proceedDirect = window.confirm('Simulation failed. Proceed to send swapTokens() anyway? This may revert.');
          }
        } catch {}
        if (!proceedDirect) {
          notifyError(msg);
          setTxStatusForSwap("error");
          setSwappingStates((prev) => ({ ...prev, [id]: false }));
          return;
        } else {
          console.warn('[Step3] Proceeding with direct tx despite simulation failure...');
          forceDirectSend = true;
        }
      }
      // Perform the token swap - no parameters, auto-detects today's token
      const swapFn = c.getFunction('swapTokens()');
      let swapTx;
      if (forceDirectSend) {
        const gas = getFallbackGasLimit('fallbackGasLimitStep3', 500000n);
        
        // ALWAYS encode calldata manually for swapTokens() to ensure it's never empty
        let calldata;
        try {
          calldata = c.interface.encodeFunctionData('swapTokens()', []);
          console.log('[Step3] Encoded swapTokens() calldata:', calldata);
        } catch (encErr) {
          console.error('[Step3] Failed to encode swapTokens() calldata:', encErr);
          notifyError('Failed to encode transaction data. Please refresh and try again.');
          setTxStatusForSwap('error');
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
        
        const toAddr = AllContracts.AuctionContract.target || await AllContracts.AuctionContract.getAddress?.();
        if (!toAddr) {
          notifyError('Contract address unavailable. Please refresh.');
          setTxStatusForSwap('error');
          setSwappingStates((p) => ({ ...p, [id]: false }));
          return;
        }
        
        const txRequest = {
          to: toAddr,
          data: calldata,
          value: 0n,
          gasLimit: gas,
        };
        
        console.log(`[Step3] Forcing send with gasLimit=${gas.toString()}`);
        console.log('[Step3] Tx request:', { 
          to: txRequest.to, 
          dataLen: txRequest.data.length, 
          data: txRequest.data.slice(0, 10) + '...', 
          gas: gas.toString() 
        });
        
        swapTx = await signer.sendTransaction(txRequest);
      } else {
        swapTx = await swapFn();
      }
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
        console.error("Contract initialization issue:", {
          AuctionContract: !!AllContracts?.AuctionContract,
          airdropDistributor: !!AllContracts?.airdropDistributor,
          allContractsKeys: AllContracts ? Object.keys(AllContracts) : []
        });
        notifyError("Contracts not ready. Please refresh the page and reconnect your wallet.");
        return;
      }

    // Determine the correct token-of-the-day from the Auction contract
    const todayToken = await getTodayTokenAddress(AllContracts.AuctionContract);
    // Active flag will be derived from on-chain calls below; default undefined here
    const active = undefined;

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

      // Removed previous debug toast

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

      // Governance pause gate: if AuctionSwap is paused, show a clear error and stop
      try {
        const isPaused = await AllContracts.AuctionContract.paused?.();
        if (isPaused) {
          notifyError("Auction is paused by governance.");
          return;
        }
      } catch {}

  // Send the claim using the correct signature for the deployed distributor
  // Strategy: determine ONE callable function upfront; simulate; then send once.
  let claimFn;
  let claimCtx;
  let fnKey = 'claim()';
  try {
        const distributor = AllContracts.airdropDistributor;
        const distAddr = AllContracts?._airdropDistributorAddress || distributor?.target;
        const iface = distributor?.interface;

        if (iface && typeof distributor.getFunction === 'function') {
          // Prefer the explicit signature
          try {
            iface.getFunction(fnKey);
            claimCtx = distributor;
            claimFn = distributor.getFunction(fnKey);
          } catch (sigErr) {
            // If signature lookup fails in this environment, try constructing a minimal legacy contract
            if (!distAddr) throw sigErr;
            const legacy = new ethers.Contract(distAddr, ["function claim()"], signer);
            claimCtx = legacy;
            claimFn = legacy.getFunction(fnKey);
          }
        } else {
          if (!distAddr) throw new Error("AirdropDistributor address unavailable");
          const legacy = new ethers.Contract(distAddr, ["function claim()"], signer);
          claimCtx = legacy;
          claimFn = legacy.getFunction(fnKey);
        }
      } catch (invokeErr) {
        notifyError("Unable to invoke claim on distributor. Please ensure contracts/ABI match deployment.");
        // Do not open wallet again — stop here
        return;
      }

      // Optional: simulate to catch on-chain reverts without opening wallet
      try {
        await claimFn.staticCall();
      } catch (simErr) {
        let msg = simErr?.reason || simErr?.shortMessage || simErr?.message || 'Claim simulation failed';
        if (/NotToday/i.test(msg)) {
          msg = "Auction window not active for today's token (NotToday). Start the window or wait until it opens.";
        }
        // If paused or opaque revert, surface a friendly pause message
        try {
          const paused = await AllContracts.AuctionContract.paused?.();
          if (paused) msg = "Auction is paused by governance.";
        } catch {}
        if (/missing revert data|CALL_EXCEPTION/i.test(msg) || /execution reverted(?!:)/i.test(msg)) {
          msg = "Auction is paused by governance.";
        }
        toast.error(msg, { position: 'top-center' });
        return;
      }

      // Show loading toast while sending
      const claimToastId = toast.loading('Claiming Airdrop…', { position: 'top-center' });
      try {
        const tx = await claimFn();
        await tx.wait();
        toast.success("Airdrop claimed", { id: claimToastId, position: 'top-center' });
      } catch (sendErr) {
        if (sendErr?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(sendErr?.message || '')) {
          toast.error("Transaction cancelled by user.", { id: claimToastId, position: 'top-center' });
          return;
        }
        let msg = sendErr?.reason || sendErr?.shortMessage || sendErr?.error?.errorName || sendErr?.message || 'Claim failed';
        if (/NotToday/i.test(msg)) {
          msg = "Auction window not active for today's token (NotToday). Start the window or wait until it opens.";
        }
        // Map generic/opaque reverts to pause message when applicable
        try {
          const paused = await AllContracts.AuctionContract.paused?.();
          if (paused) msg = "Auction is paused by governance.";
        } catch {}
        if (/missing revert data|CALL_EXCEPTION/i.test(msg) || /execution reverted(?!:)/i.test(msg)) {
          msg = "Auction is paused by governance.";
        }
        toast.error(msg, { id: claimToastId, position: 'top-center' });
        return;
      }
      await isAirdropClaimed();
    // Refresh claimable amounts to ensure Step 1 UI reflects no further units when exhausted
    try { await getAirdropAmount?.(); } catch {}
      await getInputAmount();
      await getOutPutAmount();
      await getTokensBurned();
    } catch (e) {
      console.error("Error claiming tokens:", e);
      if (e?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(e?.message || "")) {
        // Update loading toast to cancellation and exit cleanly
        toast.error("Transaction cancelled by user.", { id: claimToastId, position: 'top-center' });
        return;
      }
      let msg = e?.reason || e?.shortMessage || e?.error?.errorName || e?.message || "Claim failed";
      if (/NotToday/i.test(msg)) {
        msg = "Auction window not active for today's token (NotToday). Start the window or wait until it opens.";
      }
      // Final safeguard: map obscure errors to pause message if paused
      try {
        const paused = await AllContracts.AuctionContract.paused?.();
        if (paused) msg = "Auction is paused by governance.";
      } catch {}
      if (/missing revert data|CALL_EXCEPTION/i.test(msg) || /execution reverted(?!:)/i.test(msg)) {
        msg = "Auction is paused by governance.";
      }
      // Update loading toast to error
  toast.error(msg, { id: claimToastId, position: 'top-center' });
      return;
    }
  };

  const handleAddToken = async (
    tokenAddress,
    tokenSymbol,
    tokenDecimals = 18
  ) => {
    // Validate inputs
    if (!tokenAddress || tokenAddress === ethers.ZeroAddress) {
      toast.error("Invalid token address.");
      console.error("handleAddToken: Invalid token address", tokenAddress);
      return;
    }

    if (!window.ethereum) {
      toast.error("MetaMask is not installed.");
      return;
    }

    // 👇 store toast ID so we can dismiss it later
  const toastId = toast.loading(`Adding token to wallet...`, { position: 'top-center' });

    try {
      // Fetch actual symbol and decimals from the contract
      const tokenContract = new ethers.Contract(
        tokenAddress,
        [
          "function symbol() view returns (string)",
          "function decimals() view returns (uint8)"
        ],
        httpProvider || provider
      );

      let actualSymbol = tokenSymbol;
      let actualDecimals = tokenDecimals;

      try {
        actualSymbol = await tokenContract.symbol();
        console.log(`Fetched symbol from contract: ${actualSymbol}`);
      } catch (err) {
        console.warn("Could not fetch symbol from contract, using provided:", tokenSymbol, err);
        if (!tokenSymbol) {
          throw new Error("Could not determine token symbol");
        }
      }

      try {
        actualDecimals = await tokenContract.decimals();
        console.log(`Fetched decimals from contract: ${actualDecimals}`);
      } catch (err) {
        console.warn("Could not fetch decimals from contract, using default:", tokenDecimals, err);
      }

      const tokenDetails = {
        type: "ERC20",
        options: {
          address: tokenAddress,
          symbol: actualSymbol,
          decimals: Number(actualDecimals) || 18,
        },
      };

      console.log("Adding token to MetaMask:", tokenDetails);

      const wasAdded = await window.ethereum.request({
        method: "wallet_watchAsset",
        params: tokenDetails,
      });

      toast.dismiss(toastId); // ✅ always dismiss loading toast

      if (wasAdded) {
        toast.success(`${actualSymbol} added to wallet!`, { position: 'top-center' });
      } else {
        toast("Token addition cancelled.", { position: 'top-center' });
      }
    } catch (err) {
      console.error("Error adding token to wallet:", err);
      toast.dismiss(toastId); // ✅ dismiss loading toast on error
      toast.error(`Failed to add token: ${err.message || "Unknown error"}`, { position: 'top-center' });
    }
  };

  // Fetch pSTATE → PLS ratio via STATE/WPLS pool reserves (preferred, aligns with on-chain ROI)
  const fetchPstateToPlsRatio = async () => {
    try {
      // Resolve STATE/WPLS pair address
      let stateWplsPair = null;
      let controllerReserves = null; // optional direct reserves from controller status
      try {
        if (AllContracts?.buyBurnController && typeof AllContracts.buyBurnController.stateWplsPool === 'function') {
          stateWplsPair = await AllContracts.buyBurnController.stateWplsPool();
        }
      } catch {}

      // Fallback to Auction contract mapping if controller not set
      if (!stateWplsPair || stateWplsPair === ethers.ZeroAddress) {
        try {
          const stateAddr = getStateAddress();
          if (AllContracts?.AuctionContract && typeof AllContracts.AuctionContract.getPairAddress === 'function') {
            stateWplsPair = await AllContracts.AuctionContract.getPairAddress(stateAddr);
          }
        } catch {}
      }

      // If controller available, try to get reserves directly (in case pair ABI/reserves call fails)
      try {
        if (AllContracts?.buyBurnController && typeof AllContracts.buyBurnController.getControllerStatus === 'function') {
          const s = await AllContracts.buyBurnController.getControllerStatus();
          // s = [plsBalance, wplsBalance, stateBalance, poolAddress, poolStateReserve, poolWplsReserve]
          const poolAddr = s?.[3];
          const poolState = s?.[4];
          const poolWpls = s?.[5];
          if (poolAddr && poolAddr !== ethers.ZeroAddress) {
            if (!stateWplsPair || stateWplsPair === ethers.ZeroAddress) stateWplsPair = poolAddr;
            controllerReserves = {
              stateReserve: BigInt(poolState || 0n),
              wplsReserve: BigInt(poolWpls || 0n)
            };
          }
        }
      } catch {}

      if (!stateWplsPair || stateWplsPair === ethers.ZeroAddress) {
        console.warn('STATE/WPLS pair not available; pSTATE→PLS ratio set to 0');
        // Do not overwrite any previously cached ratio; only set state to 0
        setPstateToPlsRatio("0.0");
        return;
      }

      // Read reserves and token ordering
      let stateReserve, wplsReserve;
      try {
        const pair = new ethers.Contract(stateWplsPair, IPAIR_ABI, httpProvider || provider);
        const [r0, r1] = await pair.getReserves();
        const token0 = await pair.token0();
        const stateAddrLc = (getStateAddress() || '').toLowerCase();
        const reserve0 = BigInt(r0);
        const reserve1 = BigInt(r1);
        if (reserve0 === 0n || reserve1 === 0n) throw new Error('zero reserves');
        if ((token0 || '').toLowerCase() === stateAddrLc) {
          stateReserve = reserve0;
          wplsReserve = reserve1;
        } else {
          stateReserve = reserve1;
          wplsReserve = reserve0;
        }
      } catch (e) {
        // Fallback to controller-provided reserves if direct pair call fails
        if (controllerReserves && (controllerReserves.stateReserve > 0n || controllerReserves.wplsReserve > 0n)) {
          stateReserve = controllerReserves.stateReserve;
          wplsReserve = controllerReserves.wplsReserve;
        } else {
          console.warn('Failed to read pair reserves; pSTATE→PLS ratio set to 0', e?.message || e);
          // Do not overwrite any previously cached ratio; only set state to 0
          setPstateToPlsRatio("0.0");
          return;
        }
      }

      // Compute precise integer-scaled ratio: ratioWei = (wplsReserve * 1e18) / stateReserve
      const SCALE = 1000000000000000000n; // 1e18
      const ratioWei = stateReserve > 0n ? ((wplsReserve * SCALE) / stateReserve) : 0n;
      const ratioFloat = Number(ethers.formatUnits(ratioWei, 18));

      // Update state
      setPstateToPlsRatio(ratioFloat.toString());
      console.log("pSTATE→PLS ratio (from reserves):", ratioFloat);

      // Persist to localStorage for ROI fallback usage
      try {
        const payload = { ratio: ratioFloat.toString(), ratioWei: ratioWei.toString(), updatedAt: Date.now() };
        localStorage.setItem('pstate_pls_ratio', JSON.stringify(payload));
      } catch {}
    } catch (err) {
      console.warn("Error fetching pSTATE→PLS ratio from reserves:", err?.message || err);
      // As a last resort, set to 0 to avoid misleading UI values
      setPstateToPlsRatio("0.0");
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
          if (err?.code === 4001 || /ACTION_REJECTED|User rejected/i.test(err?.message || "")) {
            setTxStatusForSwap("cancelled");
            notifyError('Transaction cancelled by user.');
            setDexButtonTextStates((prev) => ({ ...prev, [id]: 'Cancelled' }));
          } else {
            setTxStatusForSwap("error");
            notifyError('Approval failed. Try again.');
            setDexButtonTextStates((prev) => ({ ...prev, [id]: 'Approval failed' }));
          }
          setDexSwappingStates((prev) => ({ ...prev, [id]: false }));
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
  auctionPhase,
  auctionPhaseSeconds,
        txStatusForSwap,
  userHasBurned,
  userReverseStep1,
  userReverseStep2,
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
        // Reverse-flag for the current day (via SwapLens when available)
        reverseWindowActive,
        // Today's token data (centralized, no need for components to fetch independently)
        todayTokenAddress,
        todayTokenSymbol,
        todayTokenName,
        todayTokenDecimals,
      }}
    >
      {children}
    </SwapContractContext.Provider>
  );
};
SwapContractProvider.propTypes = {
  children: PropTypes.node.isRequired,
};