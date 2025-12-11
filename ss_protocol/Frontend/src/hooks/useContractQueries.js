/**
 * React Query Hooks for Contract Data
 * 
 * These hooks automatically cache, deduplicate, and manage RPC calls.
 * They replace manual useState + useEffect patterns for fetching contract data.
 * 
 * Benefits:
 * - Automatic caching & deduplication
 * - Garbage collection of unused data
 * - Loading/error states built-in
 * - Background updates
 */

import { useQuery, useQueries } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { queryKeys } from '../config/queryClient';
import { getCachedContract } from '../utils/contractCache';
import { ERC20_ABI } from '../ABI/erc20';

// Get provider from window or create new one
const getProvider = () => {
  if (window.cachedProvider) return window.cachedProvider;
  return new ethers.JsonRpcProvider('https://rpc.pulsechain.com');
};

/**
 * Hook to fetch a single token balance
 */
export const useTokenBalance = (address, tokenAddress, options = {}) => {
  return useQuery({
    queryKey: queryKeys.balance(address, tokenAddress),
    queryFn: async () => {
      if (!address || !tokenAddress) return '0';
      
      const provider = getProvider();
      const contract = getCachedContract(tokenAddress, ERC20_ABI, provider);
      const balance = await contract.balanceOf(address);
      return ethers.formatEther(balance);
    },
    enabled: Boolean(address && tokenAddress),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    ...options,
  });
};

/**
 * Hook to fetch multiple token balances at once
 */
export const useTokenBalances = (address, tokenAddresses = [], options = {}) => {
  return useQueries({
    queries: tokenAddresses.map((tokenAddress) => ({
      queryKey: queryKeys.balance(address, tokenAddress),
      queryFn: async () => {
        if (!address || !tokenAddress) return '0';
        
        const provider = getProvider();
        const contract = getCachedContract(tokenAddress, ERC20_ABI, provider);
        const balance = await contract.balanceOf(address);
        return ethers.formatEther(balance);
      },
      enabled: Boolean(address && tokenAddress),
      staleTime: 30 * 1000,
      gcTime: 5 * 60 * 1000,
      ...options,
    })),
  });
};

/**
 * Hook to fetch token info (name, symbol, decimals)
 */
export const useTokenInfo = (tokenAddress, options = {}) => {
  return useQuery({
    queryKey: queryKeys.tokenInfo(tokenAddress),
    queryFn: async () => {
      if (!tokenAddress) return null;
      
      const provider = getProvider();
      const contract = getCachedContract(tokenAddress, ERC20_ABI, provider);
      
      const [name, symbol, decimals] = await Promise.all([
        contract.name().catch(() => 'Unknown'),
        contract.symbol().catch(() => '???'),
        contract.decimals().catch(() => 18),
      ]);
      
      return { name, symbol, decimals: Number(decimals) };
    },
    enabled: Boolean(tokenAddress),
    staleTime: Infinity, // Token info never changes
    gcTime: 30 * 60 * 1000, // 30 minutes
    ...options,
  });
};

/**
 * Hook to fetch pair reserves
 */
export const usePairReserves = (pairAddress, options = {}) => {
  const PAIR_ABI = [
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ];

  return useQuery({
    queryKey: queryKeys.pairReserves(pairAddress),
    queryFn: async () => {
      if (!pairAddress || pairAddress === ethers.ZeroAddress) return null;
      
      const provider = getProvider();
      const contract = getCachedContract(pairAddress, PAIR_ABI, provider);
      
      const [reserves, token0, token1] = await Promise.all([
        contract.getReserves(),
        contract.token0(),
        contract.token1(),
      ]);
      
      return {
        reserve0: reserves[0].toString(),
        reserve1: reserves[1].toString(),
        token0,
        token1,
      };
    },
    enabled: Boolean(pairAddress && pairAddress !== ethers.ZeroAddress),
    staleTime: 15 * 1000, // 15 seconds for price data
    gcTime: 5 * 60 * 1000,
    ...options,
  });
};

/**
 * Hook for native PLS balance
 */
export const useNativeBalance = (address, options = {}) => {
  return useQuery({
    queryKey: ['nativeBalance', address],
    queryFn: async () => {
      if (!address) return '0';
      
      const provider = getProvider();
      const balance = await provider.getBalance(address);
      return ethers.formatEther(balance);
    },
    enabled: Boolean(address),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
};

/**
 * Hook to fetch token allowance
 */
export const useTokenAllowance = (tokenAddress, ownerAddress, spenderAddress, options = {}) => {
  return useQuery({
    queryKey: ['allowance', tokenAddress, ownerAddress, spenderAddress],
    queryFn: async () => {
      if (!tokenAddress || !ownerAddress || !spenderAddress) return '0';
      
      const provider = getProvider();
      const contract = getCachedContract(tokenAddress, ERC20_ABI, provider);
      const allowance = await contract.allowance(ownerAddress, spenderAddress);
      return ethers.formatEther(allowance);
    },
    enabled: Boolean(tokenAddress && ownerAddress && spenderAddress),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
};

/**
 * Generic hook for any contract read
 * Use this for one-off reads that don't have a dedicated hook
 */
export const useContractRead = (queryKey, contractAddress, abi, method, args = [], options = {}) => {
  return useQuery({
    queryKey: queryKey,
    queryFn: async () => {
      if (!contractAddress) return null;
      
      const provider = getProvider();
      const contract = getCachedContract(contractAddress, abi, provider);
      return await contract[method](...args);
    },
    enabled: Boolean(contractAddress),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    ...options,
  });
};

export default {
  useTokenBalance,
  useTokenBalances,
  useTokenInfo,
  usePairReserves,
  useNativeBalance,
  useTokenAllowance,
  useContractRead,
};
