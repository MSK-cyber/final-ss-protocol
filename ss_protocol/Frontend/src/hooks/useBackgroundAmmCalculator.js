/**
 * useBackgroundAmmCalculator Hook
 * 
 * Manages AMM calculations in the background to keep UI responsive.
 * - Uses requestIdleCallback / setTimeout for non-blocking calculations
 * - Caches results in localStorage for instant display
 * - Refreshes every 30 seconds (configurable)
 * - Shows cached values immediately on mount
 * - Calculates in small batches to prevent UI jank
 * 
 * IMPORTANT: Uses TOKENS[tokenName].address for address lookup (same as Utils.js)
 * Auction tokens route: TOKEN → STATE → WPLS (two-step via STATE)
 * STATE routes: STATE → WPLS (direct)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ethers } from 'ethers';
import { getCachedContract, getCachedProvider } from '../utils/contractCache';
import { createSmartPoller } from '../utils/smartPolling';

// PulseX Router
const PULSEX_ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
const PULSEX_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];
const RPC_URL = 'https://pulsechain-rpc.publicnode.com';

// Cache key and TTL
const AMM_CACHE_KEY = 'ammValuesCache_v2';
const AMM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const REFRESH_INTERVAL = 30 * 1000; // 30 seconds between background updates

// Load cached values
function loadCache() {
  try {
    const cached = localStorage.getItem(AMM_CACHE_KEY);
    if (!cached) return null;
    const parsed = JSON.parse(cached);
    if (parsed.timestamp && (Date.now() - parsed.timestamp) < AMM_CACHE_TTL) {
      return parsed;
    }
  } catch {}
  return null;
}

// Save to cache
function saveCache(values, totalSum) {
  try {
    localStorage.setItem(AMM_CACHE_KEY, JSON.stringify({
      values,
      totalSum,
      timestamp: Date.now()
    }));
  } catch {}
}

// Format number with commas
function formatWithCommas(num) {
  if (num === undefined || num === null) return '0';
  const n = Number(num);
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

export function useBackgroundAmmCalculator(sortedTokens, tokenBalances, chainId, TOKENS) {
  // Load cached values for instant display
  const [ammValuesMap, setAmmValuesMap] = useState(() => {
    const cached = loadCache();
    return cached?.values || {};
  });
  
  const [totalSum, setTotalSum] = useState(() => {
    const cached = loadCache();
    return cached?.totalSum || "0";
  });
  
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Refs for background calculation management - prevents memory leaks
  const mountedRef = useRef(true);
  const lastCalcTimeRef = useRef(0);
  const intervalRef = useRef(null);
  const calculationIdRef = useRef(0);
  const providerRef = useRef(null);
  const routerRef = useRef(null);
  const isCalculatingRef = useRef(false); // Prevent concurrent calculations
  
  // Stable token addresses for comparison
  const tokenAddressesRef = useRef('');
  
  // Get addresses from TOKENS object (same pattern as Utils.js)
  const getTokensAddresses = useCallback(() => {
    if (!TOKENS) return { stateAddress: null, wplsAddress: null };
    
    const stateAddress = TOKENS["STATE"]?.address;
    // Try both "Wrapped Pulse" and check for WPLS symbol
    let wplsAddress = TOKENS["Wrapped Pulse"]?.address;
    if (!wplsAddress) {
      // Fallback: find token with WPLS symbol
      const wplsEntry = Object.values(TOKENS).find(t => t.symbol === 'WPLS');
      wplsAddress = wplsEntry?.address;
    }
    
    return { stateAddress, wplsAddress };
  }, [TOKENS]);
  
  // Initialize provider lazily using cache
  const getRouter = useCallback(() => {
    if (!providerRef.current) {
      providerRef.current = getCachedProvider(RPC_URL);
    }
    if (!routerRef.current) {
      routerRef.current = getCachedContract(
        PULSEX_ROUTER_ADDRESS,
        PULSEX_ROUTER_ABI,
        providerRef.current
      );
    }
    return routerRef.current;
  }, []);
  
  // Safely parse balance to wei - handles string/number/float issues
  const safeParseBalance = useCallback((balance, decimals = 18) => {
    try {
      if (!balance || balance === '0' || balance === 0) return 0n;
      
      // Convert to string and handle floats
      let balStr = String(balance);
      
      // If it's a float, truncate to max decimals
      if (balStr.includes('.')) {
        const parts = balStr.split('.');
        const decPart = parts[1] || '';
        if (decPart.length > decimals) {
          balStr = parts[0] + '.' + decPart.slice(0, decimals);
        }
      }
      
      // Handle very small or very large numbers
      const num = Number(balStr);
      if (!Number.isFinite(num) || num <= 0) return 0n;
      
      return ethers.parseUnits(balStr, decimals);
    } catch (e) {
      console.warn('Failed to parse balance:', balance, e);
      return 0n;
    }
  }, []);

  // Ensure address is checksummed
  const toChecksumAddress = useCallback((address) => {
    try {
      if (!address) return null;
      return ethers.getAddress(address);
    } catch {
      return address; // Return as-is if checksum fails
    }
  }, []);

  // Calculate auction token value using two-step routing: TOKEN → STATE → WPLS
  // This matches the pattern in Utils.js calculateAmmPlsValueBoth
  const calculateAuctionTokenPlsValue = useCallback(async (tokenName, balance, decimals = 18) => {
    if (!balance || balance === '0' || balance === 0) {
      return { numeric: 0, display: '0' };
    }
    
    // Get addresses from TOKENS object (same as Utils.js)
    const tokenAddress = TOKENS?.[tokenName]?.address;
    const { stateAddress, wplsAddress } = getTokensAddresses();
    
    if (!tokenAddress || !stateAddress || !wplsAddress) {
      return { numeric: 0, display: '0' };
    }
    
    try {
      const router = getRouter();
      const balanceWei = safeParseBalance(balance, decimals);
      if (balanceWei === 0n) {
        return { numeric: 0, display: '0' };
      }
      
      // Ensure proper checksum addresses
      const checksumToken = toChecksumAddress(tokenAddress);
      const checksumState = toChecksumAddress(stateAddress);
      const checksumWpls = toChecksumAddress(wplsAddress);
      
      // Two-step routing (same as Utils.js):
      // Step 1: TOKEN → STATE
      const path1 = [checksumToken, checksumState];
      const amounts1 = await router.getAmountsOut(balanceWei, path1);
      const stateAmountWei = amounts1[amounts1.length - 1];
      
      if (stateAmountWei === 0n) {
        return { numeric: 0, display: '0' };
      }
      
      // Step 2: STATE → WPLS
      const path2 = [checksumState, checksumWpls];
      const amounts2 = await router.getAmountsOut(stateAmountWei, path2);
      const plsAmountWei = amounts2[amounts2.length - 1];
      
      const numericValue = Number(ethers.formatEther(plsAmountWei));
      
      const displayValue = numericValue >= 1 
        ? Math.floor(numericValue).toLocaleString()
        : numericValue.toFixed(4);
      
      return { numeric: numericValue, display: displayValue };
    } catch {
      return { numeric: 0, display: '0' };
    }
  }, [TOKENS, getTokensAddresses, getRouter, safeParseBalance, toChecksumAddress]);
  
  // Calculate STATE value: STATE → WPLS direct
  const calculateStatePlsValue = useCallback(async (stateBalance) => {
    if (!stateBalance || stateBalance === '0' || stateBalance === 0) {
      return { numeric: 0, display: '0' };
    }
    
    const { stateAddress, wplsAddress } = getTokensAddresses();
    
    if (!stateAddress || !wplsAddress) {
      return { numeric: 0, display: '0' };
    }
    
    try {
      const router = getRouter();
      const balanceWei = safeParseBalance(stateBalance);
      if (balanceWei === 0n) return { numeric: 0, display: '0' };
      
      const checksumState = toChecksumAddress(stateAddress);
      const checksumWpls = toChecksumAddress(wplsAddress);
      
      const path = [checksumState, checksumWpls];
      const amounts = await router.getAmountsOut(balanceWei, path);
      const plsAmount = amounts[amounts.length - 1];
      
      const numericValue = Number(ethers.formatEther(plsAmount));
      
      const displayValue = numericValue >= 1 
        ? Math.floor(numericValue).toLocaleString()
        : numericValue.toFixed(4);
      
      return { numeric: numericValue, display: displayValue };
    } catch {
      return { numeric: 0, display: '0' };
    }
  }, [getTokensAddresses, getRouter, safeParseBalance, toChecksumAddress]);
  
  // Background calculation with UI-safe batching and memory protection
  const runBackgroundCalculation = useCallback(async () => {
    // Skip if not on PulseChain or missing data
    if (chainId !== 369 || !sortedTokens?.length || !tokenBalances || !TOKENS) {
      return;
    }
    
    // Prevent concurrent calculations (memory protection)
    if (isCalculatingRef.current) {
      return;
    }
    
    isCalculatingRef.current = true;
    const calcId = ++calculationIdRef.current;
    setIsCalculating(true);
    
    const startTime = performance.now();
    
    try {
      const results = {};
      let totalPls = 0;
      
      // Process in concurrent batches of 5 with micro-yields between batches
      // This balances speed with UI responsiveness
      const BATCH_SIZE = 5;
      
      for (let i = 0; i < sortedTokens.length; i += BATCH_SIZE) {
        // Check if superseded or unmounted - abort early to prevent memory leaks
        if (!mountedRef.current || calcId !== calculationIdRef.current) {
          isCalculatingRef.current = false;
          return;
        }
        
        const batch = sortedTokens.slice(i, i + BATCH_SIZE);
        
        // Process batch in parallel (fast)
        const batchPromises = batch.map(async (token) => {
          const tokenName = token.tokenName;
          const balance = tokenBalances?.[tokenName];
          const decimals = TOKENS?.[tokenName]?.decimals ?? 18;
          
          if (tokenName === 'DAV') {
            return { tokenName, numeric: 0, display: '-----' };
          }
          
          if (tokenName === 'STATE') {
            const result = await calculateStatePlsValue(balance);
            return { tokenName, ...result };
          }
          
          const numBalance = Number(balance);
          if (!balance || numBalance <= 0) {
            return { tokenName, numeric: 0, display: '0' };
          }
          
          const result = await calculateAuctionTokenPlsValue(tokenName, balance, decimals);
          return { tokenName, ...result };
        });
        
        const batchResults = await Promise.all(batchPromises);
        
        for (const result of batchResults) {
          results[result.tokenName] = result.display;
          totalPls += result.numeric;
        }
        
        // Micro-yield between batches to keep UI responsive (only 0ms - just yields event loop)
        if (i + BATCH_SIZE < sortedTokens.length) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }
      
      // Check if calculation was superseded or component unmounted
      if (!mountedRef.current || calcId !== calculationIdRef.current) {
        isCalculatingRef.current = false;
        return;
      }
      
      const formattedTotal = formatWithCommas(totalPls);
      
      setAmmValuesMap(results);
      setTotalSum(formattedTotal);
      saveCache(results, formattedTotal);
      
      lastCalcTimeRef.current = Date.now();
    } catch (error) {
      console.warn('AMM calculation error:', error);
    } finally {
      isCalculatingRef.current = false;
      if (mountedRef.current && calcId === calculationIdRef.current) {
        setIsCalculating(false);
      }
    }
  }, [chainId, sortedTokens, tokenBalances, TOKENS, calculateAuctionTokenPlsValue, calculateStatePlsValue]);
  
  // Trigger calculation - runs immediately for speed
  const triggerCalculation = useCallback((force = false) => {
    if (chainId !== 369 || !sortedTokens?.length || !TOKENS) return;
    
    const now = Date.now();
    const hasValues = Object.keys(ammValuesMap).length > 0;
    
    // Skip if calculated recently (unless forced)
    if (!force && hasValues && now - lastCalcTimeRef.current < 3000) {
      return;
    }
    
    // Run immediately - no delays
    runBackgroundCalculation();
  }, [chainId, sortedTokens, TOKENS, ammValuesMap, runBackgroundCalculation]);
  
  // Initial calculation and periodic refresh
  useEffect(() => {
    mountedRef.current = true;
    
    if (chainId !== 369 || !sortedTokens?.length || !TOKENS) return;
    
    const hasBalances = tokenBalances && Object.keys(tokenBalances).length > 0;
    const hasValues = Object.keys(ammValuesMap).length > 0;
    
    // Run immediately if we have balances
    if (hasBalances && !hasValues) {
      runBackgroundCalculation();
    }
    
    // Smart polling for AMM: 15s active, 60s idle
    const poller = createSmartPoller(() => {
      if (mountedRef.current && hasBalances) {
        runBackgroundCalculation();
      }
    }, {
      activeInterval: 15000,   // 15s when user is active
      idleInterval: 60000,     // 60s when idle
      fetchOnStart: false,     // Already handled above
      fetchOnVisible: true,    // Refresh when tab becomes visible
      name: 'amm-calculator'
    });
    
    poller.start();
    
    return () => {
      mountedRef.current = false;
      poller.stop();
    };
  }, [chainId, sortedTokens?.length, TOKENS, Object.keys(tokenBalances || {}).length]);
  
  // Manual refresh function
  const refreshNow = useCallback(() => {
    lastCalcTimeRef.current = 0;
    runBackgroundCalculation();
  }, [runBackgroundCalculation]);
  
  // Trigger when token balances first become available
  const balanceKeysRef = useRef(0);
  useEffect(() => {
    const currentKeyCount = Object.keys(tokenBalances || {}).length;
    const previousKeyCount = balanceKeysRef.current;
    
    if (currentKeyCount > 0 && previousKeyCount === 0 && TOKENS) {
      runBackgroundCalculation();
    }
    
    balanceKeysRef.current = currentKeyCount;
  }, [tokenBalances, TOKENS, runBackgroundCalculation]);
  
  return {
    ammValuesMap,
    totalSum,
    isCalculating,
    refreshNow
  };
}

export default useBackgroundAmmCalculator;
