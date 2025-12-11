import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  useMemo,
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
import { getCachedContract, COMMON_ABIS } from "../utils/contractCache";
import { createSmartPoller } from "../utils/smartPolling";
// Zustand stores for optimized state management
import { useUserStore } from "../stores";

export const DAVContext = createContext();

// Session storage cache for instant DAV data on page refresh
const DAV_CACHE_KEY = 'dav_page_cache';
const CACHE_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

const getDavCache = (address, chainId) => {
  try {
    const cacheKey = `${DAV_CACHE_KEY}_${chainId}_${address?.toLowerCase()}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (!cached) return null;
    const { data, timestamp } = JSON.parse(cached);
    // Check if cache is expired
    if (Date.now() - timestamp > CACHE_EXPIRY_MS) {
      sessionStorage.removeItem(cacheKey);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setDavCache = (address, chainId, data) => {
  try {
    const cacheKey = `${DAV_CACHE_KEY}_${chainId}_${address?.toLowerCase()}`;
    const cacheData = {
      data: {
        davHolds: data.davHolds,
        davExpireHolds: data.davExpireHolds,
        davGovernanceHolds: data.davGovernanceHolds,
        roiTotalValuePls: data.roiTotalValuePls,
        roiRequiredValuePls: data.roiRequiredValuePls,
        roiMeets: data.roiMeets,
        roiPercentage: data.roiPercentage,
        stateHolding: data.stateHolding,
        ReferralAMount: data.ReferralAMount,
        claimableAmount: data.claimableAmount,
        totalInvestedPls: data.totalInvestedPls,
      },
      timestamp: Date.now()
    };
    sessionStorage.setItem(cacheKey, JSON.stringify(cacheData));
  } catch {
    // Ignore storage errors
  }
};

export const DavProvider = ({ children }) => {
  const { AllContracts, signer, provider } = useContext(ContractContext);
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

  // Initialize data with cached values for instant display on refresh
  const getInitialData = () => {
    const defaults = {
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
      // On-chain ROI fields from DAV.getROI(user)
      roiTotalValuePls: "0.0",   // totalValueInPLS (wei -> 18dp formatted)
      roiRequiredValuePls: "0.0", // requiredValue (wei -> 18dp formatted)
      roiMeets: "false",          // meetsROI (bool -> string)
      roiPercentage: "0",         // roiPercentage (plain integer, no decimals on-chain)
      // Client-side ROI (mirrors on-chain formula)
      roiClientTotalPls: "0.0",
      roiClientRequiredPls: "0.0",
      roiClientMeets: "false",
      roiClientPercentage: "0",
    };
    return defaults;
  };

  const [data, setData] = useState(getInitialData);
  
  // Load cached data on mount for instant display
  useEffect(() => {
    if (address && chainId) {
      const cached = getDavCache(address, chainId);
      if (cached) {
        setData(prev => ({ ...prev, ...cached }));
        // Show cached data immediately, but keep loading for fresh data
        console.log('📦 Loaded DAV data from cache for instant display');
      }
    }
  }, [address, chainId]);

  // Prefer read-only provider for ALL read calls to avoid wallet chain/provider flakiness
  // Keep write calls using the signer-bound instances
  const davRead = useMemo(() => {
    try {
      return AllContracts?.davContract && (provider ? AllContracts.davContract.connect(provider) : AllContracts.davContract);
    } catch {
      return AllContracts?.davContract || null;
    }
  }, [AllContracts?.davContract, provider]);
  const stateRead = useMemo(() => {
    try {
      return AllContracts?.stateContract && (provider ? AllContracts.stateContract.connect(provider) : AllContracts.stateContract);
    } catch {
      return AllContracts?.stateContract || null;
    }
  }, [AllContracts?.stateContract, provider]);

  // Capability flags to avoid spamming failing calls on contracts that don't support newer view methods
  const davHoldsSupportedRef = useRef(true);
  const davExpiredSupportedRef = useRef(true);
  const warnedNoCode = useRef({}); // map of address->boolean to avoid spam
  const codeCache = useRef({}); // Cache for hasCode results to avoid redundant RPC calls

  // Generic safe call for BigInt-returning views with graceful fallback
  const safeCallBigInt = useCallback(async (label, call) => {
    try {
      const out = await call();
      return out ?? 0n;
    } catch (e) {
      const msg = (e?.message || e?.reason || '').toLowerCase();
      const code = e?.code || e?.data?.code;
      const isMissing = msg.includes('missing revert data') || msg.includes('could not decode') || code === 'CALL_EXCEPTION' || code === 'BAD_DATA';
      if (isMissing) {
        // One-time downgrade per label
        if (label === 'davHolds' && davHoldsSupportedRef.current) {
          davHoldsSupportedRef.current = false;
          console.warn('davHolds/getActiveBalance not supported by deployed DAV contract; defaulting to 0.');
        }
        if (label === 'davExpireHolds' && davExpiredSupportedRef.current) {
          davExpiredSupportedRef.current = false;
          console.warn('davExpireHolds/getExpiredTokenCount not supported by deployed DAV contract; defaulting to 0.');
        }
        return 0n;
      }
      console.warn(`View call failed for ${label}; defaulting to 0`, e);
      return 0n;
    }
  }, []);

  // Check if an address has contract code; cached to avoid redundant RPC calls
  const hasCode = useCallback(async (addr, label) => {
    try {
      if (!addr) return false;
      // Check cache first
      if (codeCache.current[addr] !== undefined) {
        return codeCache.current[addr];
      }
      const code = await provider?.getCode?.(addr);
      const noCode = !code || code === '0x';
      // Cache the result
      codeCache.current[addr] = !noCode;
      if (noCode && !warnedNoCode.current[addr]) {
        warnedNoCode.current[addr] = true;
        console.warn(`${label || 'Contract'} at ${addr} has no code on this chain. Skipping reads. Check network/addresses.`);
      }
      return !noCode;
    } catch {
      // If we cannot check, assume true to avoid blocking
      return true;
    }
  }, [provider]);

  // Safe wrapper: attempt dav.earned(addr); if it cannot be decoded or is unavailable, return 0n
  const safeEarned = useCallback(async (addr) => {
    try {
      if (!davRead || !addr) return 0n;
      // Prefer exact signature to avoid overload ambiguity
      const fn = davRead.getFunction?.("earned(address)") || davRead.earned;
      const res = await fn(addr);
      // Expect a BigInt-like result
      return res ?? 0n;
    } catch (e) {
      const msg = (e?.message || e?.reason || "").toLowerCase();
      const code = e?.code || e?.data?.code;
      // Known non-fatal cases when ABI/address mismatches or proxy returns no data
      if (
        msg.includes("could not decode result data") ||
        msg.includes("missing revert data") ||
        msg.includes("bad data") ||
        msg.includes("call exception") ||
        code === "BAD_DATA" ||
        code === "CALL_EXCEPTION"
      ) {
        console.warn("earned(addr) unavailable or non-decodable; defaulting to 0", e);
        return 0n;
      }
      // For other errors, don't break the UX; log and default to 0
      console.warn("earned(addr) failed; defaulting to 0", e);
      return 0n;
    }
  }, [AllContracts?.davContract]);

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
        // Special handling for ReferralAMount: show more precision when tiny to avoid displaying 0.00
        if (label === "ReferralAMount" && format) {
          const decimals = (raw > 0 && raw < 1) ? 4 : fixed;
          value = truncateDecimals(raw, decimals);
        } else {
          value = format ? truncateDecimals(raw, fixed) : raw.toString();
        }
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
    if (!AllContracts?.davContract) return;

    console.log("🔍 Fetching contract data for chain:", chainId);
    console.log("🏦 DAV Contract address:", getDavAddress());
    try { console.log('🏦 DAV Contract (resolved target):', AllContracts?.davContract?.target); } catch {}
    if (address) console.log("👤 User address:", address);

    setLoading(true);
    try {
      // Guard: Check if contracts are initialized
      if (!AllContracts?.davContract || !AllContracts?.stateContract) {
        console.warn("Contracts not initialized yet, skipping data fetch");
        setLoading(false);
        return;
      }

      // Always fetch public data that doesn't require a wallet
      await Promise.allSettled([
        fetchAndSet("DavMintFee", async () => {
          console.log("🎯 Fetching TOKEN_COST from contract...");
          // Try TOKEN_COST, then getTokenCost, then default 0
          try { return await davRead.TOKEN_COST(); } catch {}
          try { return await davRead.getTokenCost?.(); } catch {}
          return 0n;
        }),
        fetchAndSet("stateHoldingOfSwapContract", () =>
          stateRead.balanceOf(getAuctionAddress())
        ),
  fetchAndSet("Supply", () => davRead.totalSupply()),
      ]);

      // If no connected wallet, skip user-specific reads
      if (!address || address === "0x0000000000000000000000000000000000000000") {
        setLoading(false);
        return;
      }

      // Some networks may not have a claim cycle yet; don't abort other reads if this fails
      let currentCycle = 0;
      try {
        const currentCycleRaw = await davRead.getCurrentClaimCycle();
        currentCycle = parseInt(currentCycleRaw.toString());
      } catch (e) {
        console.warn("getCurrentClaimCycle not available yet; continuing", e?.reason || e?.message || e);
      }

      setData((prev) => ({
        ...prev,
        currentBurnCycle: currentCycle.toString(),
      }));

      // Pre-check contract codes once to avoid redundant RPC calls
      const [davHasCode, stateHasCode] = await Promise.all([
        hasCode(getDavAddress(), 'DAV'),
        hasCode(getStateAddress(), 'STATE'),
      ]);

      await Promise.allSettled([
        // Use safeEarned so UI never breaks on decode/mismatch; shows 0 instead
        fetchAndSet("claimableAmount", () => safeEarned(address)),
        // davHolds: use safe wrapper and disable if unsupported on-chain
        fetchAndSet("davHolds", () =>
          davHoldsSupportedRef.current
            ? safeCallBigInt('davHolds', () => davRead.getActiveBalance(address))
            : Promise.resolve(0n)
        ),
        fetchAndSet("davGovernanceHolds", async () => {
          if (!davHasCode) return 0n;
          return safeCallBigInt('davGovernanceHolds', () => davRead.balanceOf(address));
        }),
        fetchAndSet("stateHolding", async () => {
          if (!stateHasCode) return 0n;
          return safeCallBigInt('stateHolding', () => stateRead.balanceOf(address));
        }),
        fetchAndSet("stateHoldingOfSwapContract", async () => {
          if (!stateHasCode) return 0n;
          return safeCallBigInt('stateHoldingOfSwapContract', () => stateRead.balanceOf(getAuctionAddress()));
        }),
        fetchAndSet(
          "ReferralCodeOfUser",
          async () => {
            try {
              const fn = davRead?.getUserReferralCode;
              if (typeof fn === 'function') {
                return await fn(address);
              }
              return ""; // not supported on this deployment
            } catch {
              return ""; // suppress and default to empty string
            }
          },
          false
        ),
        fetchAndSet("ReferralAMount", async () => {
          if (!davHasCode) return 0n;
          const fn = davRead?.referralRewards;
          if (typeof fn !== 'function') return 0n;
          return safeCallBigInt('ReferralAMount', () => fn(address));
        }),
      ]);

      // Fetch on-chain ROI from DAV.getROI(user)
      try {
        const ok = await hasCode(getDavAddress(), 'DAV');
        if (ok && typeof davRead?.getROI === 'function') {
          const res = await davRead.getROI(address);
          // res: [totalValueInPLS, requiredValue, meetsROI, roiPercentage]
          // totalValueInPLS/requiredValue are 18-decimal wei values
          const totalValuePls = parseFloat(ethers.formatUnits(res[0] ?? 0n, 18));
          const requiredPls = parseFloat(ethers.formatUnits(res[1] ?? 0n, 18));
          const meets = Boolean(res[2]);
          // roiPercentage is a plain integer percentage (no 18dp scaling)
          const roiPct = Number(res[3] ?? 0);

          setData((prev) => ({
            ...prev,
            roiTotalValuePls: truncateDecimals(totalValuePls, 0),
            roiRequiredValuePls: truncateDecimals(requiredPls, 0),
            roiMeets: meets ? "true" : "false",
            roiPercentage: isFinite(roiPct) ? String(Math.trunc(roiPct)) : "0",
          }));
        }
      } catch (e) {
        // Gracefully ignore if method missing or decode fails
        console.warn('getROI unavailable; falling back to client-side estimate', e?.message || e);
      }

      // Compute client-side ROI mirroring on-chain logic (optimized)
      try {
        if (!address || !AllContracts?.AuctionContract || !AllContracts?.stateContract || !AllContracts?.davContract) {
          throw new Error('Contracts not ready');
        }
        // 1) totalStateValue starts with STATE balance
  const stateBalWei = await safeCallBigInt('state.balanceOf', () => stateRead.balanceOf(address));
        let totalStateValue = BigInt(stateBalWei || 0n);

        // 2) Add auction tokens converted to STATE via getRatioPrice
        // Optimized: Get token count first, then batch fetch (limit to 10 tokens max for performance)
        try {
          const tokenCount = await AllContracts.AuctionContract.tokenCount?.().catch(() => 0);
          const maxTokens = Math.min(Number(tokenCount) || 0, 10); // Limit to 10 tokens for performance
          
          if (maxTokens > 0) {
            // Batch fetch token addresses first
            const tokenAddrs = await Promise.all(
              Array.from({ length: maxTokens }, (_, i) =>
                AllContracts.AuctionContract.autoRegisteredTokens(i).catch(() => null)
              )
            );
            
            // Filter valid addresses and batch fetch balances
            const validTokens = tokenAddrs.filter(addr => addr && addr !== ethers.ZeroAddress);
            for (const tokenAddr of validTokens) {
              try {
                const tokenCtr = getCachedContract(tokenAddr, 'ERC20_APPROVAL', (provider || AllContracts.AuctionContract.runner));
                const userBal = await tokenCtr.balanceOf(address).catch(() => 0n);
                if ((userBal ?? 0n) > 0n) {
                  const ratio = await AllContracts.AuctionContract.getRatioPrice(tokenAddr).catch(() => 0n);
                  if ((ratio ?? 0n) > 0n) {
                    let decimals = 18;
                    try {
                      const decCtr = getCachedContract(tokenAddr, 'ERC20_APPROVAL', (provider || AllContracts.AuctionContract.runner));
                      decimals = Number(await decCtr.decimals());
                    } catch {}
                    const denom = BigInt(10) ** BigInt(Number.isFinite(decimals) && decimals >= 0 ? decimals : 18);
                    const addState = (BigInt(userBal) * BigInt(ratio)) / denom;
                    totalStateValue += addState;
                  }
                }
              } catch {
                // Skip failed token
              }
            }
          }
        } catch (e) {
          console.warn('ROI token loop skipped:', e?.message);
        }

        // 3) Convert total STATE to PLS via STATE/WPLS pool reserves (robust, with fallbacks)
        let stateValueInPLS = 0n;
        try {
          let poolAddr = null;
          // Primary: controller-configured pool
          try { poolAddr = await AllContracts?.buyBurnController?.stateWplsPool?.(); } catch {}
          // Fallback 1: Auction mapping for STATE → pool
          if (!poolAddr || poolAddr === ethers.ZeroAddress) {
            try { poolAddr = await AllContracts?.AuctionContract?.getPairAddress?.(getStateAddress()); } catch {}
          }

          // Optional: reserves via controller status (in case pair call fails)
          let controllerReserves = null;
          try {
            const s = await AllContracts?.buyBurnController?.getControllerStatus?.();
            const pool = s?.[3];
            const poolState = s?.[4];
            const poolWpls = s?.[5];
            if (pool && pool !== ethers.ZeroAddress) {
              if (!poolAddr || poolAddr === ethers.ZeroAddress) poolAddr = pool;
              controllerReserves = { state: BigInt(poolState || 0n), wpls: BigInt(poolWpls || 0n) };
            }
          } catch {}

          if (poolAddr && poolAddr !== ethers.ZeroAddress && totalStateValue > 0n) {
            let reserveState = 0n, reserveWpls = 0n;
            // Try direct pair reserves first
            try {
              const pair = getCachedContract(poolAddr, 'PAIR', (provider || AllContracts?.buyBurnController?.runner || AllContracts?.AuctionContract?.runner));
              const [r0, r1] = await pair.getReserves();
              const token0 = await pair.token0();
              const r0n = BigInt(r0);
              const r1n = BigInt(r1);
              if (r0n > 0n && r1n > 0n) {
                const stateAddrLc = getStateAddress()?.toLowerCase?.();
                if ((token0 || '').toLowerCase() === stateAddrLc) {
                  reserveState = r0n;
                  reserveWpls = r1n;
                } else {
                  reserveState = r1n;
                  reserveWpls = r0n;
                }
              }
            } catch {}
            // Fallback to controller-provided reserves
            if ((reserveState === 0n || reserveWpls === 0n) && controllerReserves) {
              reserveState = controllerReserves.state;
              reserveWpls = controllerReserves.wpls;
            }

            if (reserveState > 0n && reserveWpls > 0n) {
              stateValueInPLS = (totalStateValue * reserveWpls) / reserveState;
            }
          }
        } catch {}

        // 3b) If reserve-based conversion unavailable (or yields 0), try persisted ratio fallback
        if ((stateValueInPLS === 0n) && totalStateValue > 0n) {
          try {
            const raw = localStorage.getItem('pstate_pls_ratio');
            if (raw) {
              const parsed = JSON.parse(raw);
              const ttlMs = 24 * 60 * 60 * 1000; // 24h TTL
              const fresh = parsed && parsed.updatedAt && (Date.now() - Number(parsed.updatedAt) < ttlMs);
              const ratioWeiStr = parsed?.ratioWei;
              if (fresh && ratioWeiStr) {
                const ratioWei = BigInt(ratioWeiStr);
                if (ratioWei > 0n) {
                  const SCALE = 1000000000000000000n; // 1e18
                  stateValueInPLS = (totalStateValue * ratioWei) / SCALE;
                }
              }
            }
          } catch {}
        }

  // 4) Align with DAV Vault: do NOT add claimable rewards; use holdings-only valuation
  const totalValueWei = (stateValueInPLS || 0n);

        // 5) Required value = balanceOf(user) * TOKEN_COST / 1e18
  const davBalWei = await safeCallBigInt('dav.balanceOf', () => davRead.balanceOf(address));
  let tokenCostWei = 0n;
  try { tokenCostWei = await davRead.TOKEN_COST(); } catch { try { tokenCostWei = await davRead.getTokenCost(); } catch { tokenCostWei = 0n; } }
        const requiredWei = tokenCostWei > 0n ? ((BigInt(davBalWei || 0n) * BigInt(tokenCostWei)) / 1000000000000000000n) : 0n; // /1e18

        // 6) meetsROI and percentage
        const meets = totalValueWei >= requiredWei && requiredWei > 0n;
        const pct = requiredWei > 0n ? (Number(totalValueWei) * 100) / Number(requiredWei) : 0;

        setData((prev) => ({
          ...prev,
          roiClientTotalPls: truncateDecimals(parseFloat(ethers.formatUnits(totalValueWei, 18)), 0),
          roiClientRequiredPls: truncateDecimals(parseFloat(ethers.formatUnits(requiredWei, 18)), 0),
          roiClientMeets: meets ? 'true' : 'false',
          roiClientPercentage: String(Math.trunc(pct) || 0),
        }));
      } catch (e) {
        console.warn('Client-side ROI compute skipped:', e?.message || e);
        setData((prev) => ({
          ...prev,
          roiClientTotalPls: '0.0',
          roiClientRequiredPls: '0.0',
          roiClientMeets: 'false',
          roiClientPercentage: '0',
        }));
      }

      // Calculate total invested PLS
      await calculateTotalInvestedPls();
    } catch (error) {
      console.error("Error fetching contract data:", error);
    } finally {
      setLoading(false);
      // Cache the fetched data for instant display on next page refresh
      if (address && chainId) {
        // Use setTimeout to ensure state is updated before caching
        setTimeout(() => {
          setData(currentData => {
            setDavCache(address, chainId, currentData);
            return currentData;
          });
        }, 100);
      }
    }
  }, [AllContracts, address, chainId]);

  const fetchStateHolding = async () => {
    await fetchAndSet("stateHolding", () =>
  stateRead.balanceOf(address)
    );
  };
  //   console.log("dav entries", data.DavMintFee);
  const calculateTotalInvestedPls = async () => {
    try {
      const davOk = await hasCode(getDavAddress(), 'DAV');
      if (!davOk) throw new Error('DAV has no code');

      const [davBalanceRaw, davMintFeeRaw] = await Promise.all([
        safeCallBigInt('dav.balanceOf', () => davRead.balanceOf(address)),
        (async () => {
          try { return await davRead.TOKEN_COST(); } catch {}
          try { return await davRead.getTokenCost?.(); } catch {}
          return 0n;
        })()
      ]);

      // Convert BigInt → decimal values
      const davBalance = parseFloat(ethers.formatUnits(davBalanceRaw, 18));
      const davMintFee = parseFloat(ethers.formatUnits(davMintFeeRaw, 18));

      // Normal JS multiplication and division
      const totalInvestedPlsValue = (davBalance * davMintFee).toFixed(2);

      setData((prev) => ({
        ...prev,
        totalInvestedPls: parseFloat(totalInvestedPlsValue || '0').toFixed(0),
      }));

      console.log("Total invested PLS:", totalInvestedPlsValue);
    } catch (error) {
      console.warn("Error calculating total invested PLS:", error?.message || error);
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
                const tokenContract = getCachedContract(tokenAddress, 'ERC20_NAME', (provider || AllContracts?.AuctionContract?.runner));
                
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

  // Always fetch once contracts are ready, even without a connected wallet (read-only public data)
  useEffect(() => {
    if (AllContracts?.davContract) fetchData();
  }, [AllContracts?.davContract, fetchData]);

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
          () => (davExpiredSupportedRef.current
            ? safeCallBigInt('davExpireHolds', () => davRead.getExpiredTokenCount(address))
            : Promise.resolve(0n)),
          true // Apply 18-decimal formatting
        ),
        fetchAndSet("davHolds", () => (
          davHoldsSupportedRef.current
            ? safeCallBigInt('davHolds', () => davRead.getActiveBalance(address))
            : Promise.resolve(0n)
        )),
      ]);
      // Update cache after background refresh
      if (address && chainId) {
        setTimeout(() => {
          setData(currentData => {
            setDavCache(address, chainId, currentData);
            return currentData;
          });
        }, 100);
      }
    } catch (error) {
      console.error("Error fetching DAV balances:", error);
    }
  }, [AllContracts, address, chainId]);

  // Consolidated background refresh - smart polling with active/idle detection
  // Fast updates (15s) when user is active, slow updates (60s) when idle
  // Pauses completely when tab is hidden to save resources
  useEffect(() => {
    if (!AllContracts?.davContract) return;

    const runBackgroundRefresh = async () => {
      try {
        // Fetch all periodic data in parallel where possible
        await Promise.all([
          fetchTimeUntilNextClaim(),
          fetchAndStoreTokenEntries(),
          // Only check deployment status if we have names
          (names && names.length > 0 && AllContracts?.AuctionContract) 
            ? isTokenDeployed() 
            : Promise.resolve()
        ]);
      } catch (e) {
        console.debug('Background refresh error:', e);
      }
    };

    // Smart polling: 15s active, 60s idle, pauses when hidden
    const poller = createSmartPoller(runBackgroundRefresh, {
      activeInterval: 15000,  // 15s when user is active
      idleInterval: 60000,    // 60s when user is idle
      fetchOnStart: !!address, // Only fetch on start if we have an address
      fetchOnVisible: true,   // Refresh when tab becomes visible
      name: 'dav-background'
    });

    poller.start();

    return () => {
      poller.stop();
    };
  }, [fetchTimeUntilNextClaim, AllContracts?.davContract, AllContracts?.AuctionContract, address, names]);

  // Note: Visibility handling is now built into smart polling
  // The poller automatically pauses when hidden and resumes when visible

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
    // Prepare on-chain precise values (avoid floats to prevent incorrect value reverts)
    // amount in token wei (18 decimals)
    const ethAmount = ethers.parseUnits(amount.toString(), 18);
    // cost in native coin wei: TOKEN_COST (wei) * amount
    let tokenCostWei;
    try {
      tokenCostWei = await davRead.TOKEN_COST(); // BigInt
    } catch (e) {
      // fall back to getTokenCost if available
      try { tokenCostWei = await davRead.getTokenCost(); } catch {}
    }
    if (tokenCostWei === undefined) {
      notifyError('Unable to fetch mint price');
      throw new Error('No TOKEN_COST');
    }
    const cost = BigInt(amount) * BigInt(tokenCostWei);

    // Optional preflight: ensure minting is enabled
    try {
  const ok = await davRead.canMintDAV?.().catch(() => true);
      if (ok === false) {
        notifyError('Minting is currently disabled');
        throw new Error('Minting disabled');
      }
  const paused = await davRead.paused?.().catch(() => false);
      if (paused) {
        notifyError('Contract is paused');
        throw new Error('Paused');
      }
    } catch (e) {
      if (e?.message?.includes('disabled') || e?.message?.includes('Paused')) throw e;
      // Non-fatal; continue if checks not available
    }

    const referral = ref.trim(); // empty string allowed

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
      else if (lower.includes('incorrect pls amount') || lower.includes('insufficient payment')) msg = 'Incorrect PLS value sent';
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

      // 0) Prevent governance address from claiming (will revert on-chain anyway)
      try {
        if (typeof davRead?.governance === 'function') {
          const gov = await davRead.governance().catch(() => null);
          if (gov && gov.toLowerCase() === address?.toLowerCase()) {
            notifyError('Governance address cannot claim rewards');
            setisClaiming(false);
            return;
          }
        }
      } catch {}

      // 1) Active DAV balance check (must have non-expired tokens)
      try {
        const activeBal = await safeCallBigInt('davHolds', () => davRead.getActiveBalance(address));
        if (!activeBal || activeBal === 0n) {
          notifyError('No active DAV balance (expired or none)');
          setisClaiming(false);
          return;
        }
      } catch {}

      // 2) Claimable rewards available?
      let claimable = 0n;
      try {
        claimable = await safeEarned(address);
        if (!claimable || claimable === 0n) {
          notifyError('No rewards to claim');
          setisClaiming(false);
          return;
        }
      } catch {}

      // 3) On-chain ROI gate (must meet ROI). Use contract boolean instead of pct heuristics
      try {
        if (typeof davRead?.getROI === 'function') {
          const res = await davRead.getROI(address).catch(() => null);
          if (res && Array.isArray(res) && res.length >= 4) {
            const meets = Boolean(res[2]); // meetsROI
            if (!meets) {
              // Derive helpful diff if possible
              let missing = 0;
              try {
                const totalValuePls = parseFloat(ethers.formatUnits(res[0] ?? 0n, 18));
                const requiredPls = parseFloat(ethers.formatUnits(res[1] ?? 0n, 18));
                if (Number.isFinite(requiredPls) && Number.isFinite(totalValuePls)) {
                  missing = Math.max(0, Math.floor(requiredPls - totalValuePls));
                }
              } catch {}
              notifyError(`ROI not met (portfolio below mint cost). Need ~${missing} more PLS value`);
              setisClaiming(false);
              return;
            }
          }
        }
      } catch {}

      // 4) Execute claim
      const c = AllContracts.davContract;
      let tx;
      try {
        if (typeof c.claimReward === 'function') {
          tx = await c.claimReward();
        } else if (typeof c.claimPLS === 'function') {
          tx = await c.claimPLS();
        } else if (c.getFunction) {
          try { tx = await c.getFunction('claimReward()')(); } catch {}
          if (!tx) { try { tx = await c.getFunction('claimPLS()')(); } catch {} }
        }
      } catch (inner) {
        throw inner;
      }
      if (!tx) {
        notifyError('Claim method not available on this DAV deployment');
        setisClaiming(false);
        return;
      }
      await tx.wait();

      // 5) Refresh UI state post-claim
      await fetchAndSet('claimableAmount', () => safeEarned(address));
      if (typeof davRead?.getROI === 'function') {
        await fetchAndSet('roiPercentage', async () => {
          const r = await davRead.getROI(address); return r[3];
        }, false, 0);
      }
      notifySuccess('Claimed PLS successfully');
    } catch (err) {
      console.error('Claim error:', err);
      let errorMessage = 'Claim failed';
      const lower = (err?.message || err?.reason || '').toLowerCase();
      if (lower.includes('insufficient roi')) errorMessage = 'ROI requirement not met';
      else if (lower.includes('no rewards')) errorMessage = 'No rewards to claim';
      else if (err?.error?.message) errorMessage = err.error.message;
      else if (err?.reason) errorMessage = err.reason;
      else if (err?.message) errorMessage = err.message;
      notifyError(errorMessage);
    } finally {
      setisClaiming(false);
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
  const govAddr = (await (provider ? AllContracts.AuctionContract.connect(provider) : AllContracts.AuctionContract).governanceAddress()).toLowerCase();
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
      const tokenContract = getCachedContract(
        getStateAddress(),
        'ERC20_APPROVAL',
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
      const tokenContract = getCachedContract(
        getStateAddress(),
        'ERC20_APPROVAL',
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

  // ============ ZUSTAND STORE SYNC ============
  // Sync DAV data to Zustand stores for gradual migration
  const setUserBatch = useUserStore(state => state.setBatch);
  
  useEffect(() => {
    setUserBatch({
      davBalance: data.Supply,
      davHolds: data.davHolds,
      davExpireHolds: data.davExpireHolds,
      stateHolding: data.stateHolding,
      claimableAmount: data.claimableAmount,
      claimableAmountForBurn: data.claimableAmountForBurn,
      totalStateBurned: data.totalStateBurned,
      roiPercentage: data.roiPercentage,
      roiMeets: data.roiMeets,
      totalInvestedPls: data.totalInvestedPls,
    });
  }, [data.Supply, data.davHolds, data.davExpireHolds, data.stateHolding, data.claimableAmount, data.claimableAmountForBurn, data.totalStateBurned, data.roiPercentage, data.roiMeets, data.totalInvestedPls, setUserBatch]);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo(() => ({
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
  }), [
    data,
    isLoading,
    BurnClicked,
    Claiming,
    isClaiming,
    buttonTextStates,
    users,
    isProcessingToken,
    names,
    Emojies,
    TokenStatus,
    isProcessing,
    txStatus,
    isUsed,
  ]);

  return (
    <DAVContext.Provider value={contextValue}>
      {children}
    </DAVContext.Provider>
  );
};

export const useDAvContract = () => useContext(DAVContext);
