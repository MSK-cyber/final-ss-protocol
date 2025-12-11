/**
 * React Query Configuration
 * 
 * Provides automatic caching, deduplication, and garbage collection
 * for all RPC/API calls. This dramatically reduces memory usage by:
 * 
 * 1. Deduplicating identical requests (multiple components asking for same data)
 * 2. Automatic garbage collection of stale data
 * 3. Smart refetching based on stale time
 * 4. Background updates without blocking UI
 */

import { QueryClient } from '@tanstack/react-query';

// Create a query client with optimized settings for Web3
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data is fresh for 30 seconds - won't refetch during this time
      staleTime: 30 * 1000,
      
      // Garbage collect unused data after 5 minutes
      gcTime: 5 * 60 * 1000,
      
      // Retry failed requests 2 times with exponential backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
      
      // Don't refetch on window focus (we use smart polling instead)
      refetchOnWindowFocus: false,
      
      // Don't refetch on reconnect (we handle this manually)
      refetchOnReconnect: false,
      
      // Keep previous data while fetching new data
      placeholderData: (previousData) => previousData,
    },
    mutations: {
      // Don't retry mutations (transactions)
      retry: false,
    },
  },
});

// Query key factories for type-safe, consistent keys
export const queryKeys = {
  // Token balances
  balance: (address, tokenAddress) => ['balance', address, tokenAddress],
  balances: (address) => ['balances', address],
  
  // Token metadata
  tokenInfo: (tokenAddress) => ['tokenInfo', tokenAddress],
  tokenDecimals: (tokenAddress) => ['tokenDecimals', tokenAddress],
  
  // Pair/Pool data
  pairReserves: (pairAddress) => ['pairReserves', pairAddress],
  pairInfo: (pairAddress) => ['pairInfo', pairAddress],
  
  // Auction data
  auctionStatus: (tokenAddress) => ['auctionStatus', tokenAddress],
  auctionTime: (tokenAddress) => ['auctionTime', tokenAddress],
  todayToken: () => ['todayToken'],
  
  // User status
  userSwapStatus: (address, tokenAddress) => ['userSwapStatus', address, tokenAddress],
  userAirdropClaimed: (address, tokenAddress) => ['userAirdropClaimed', address, tokenAddress],
  
  // DAV data
  davBalance: (address) => ['davBalance', address],
  davClaimable: (address) => ['davClaimable', address],
  davRoi: (address) => ['davRoi', address],
  
  // AMM quotes
  ammQuote: (tokenIn, tokenOut, amount) => ['ammQuote', tokenIn, tokenOut, amount],
  
  // Price data
  tokenPrice: (tokenAddress) => ['tokenPrice', tokenAddress],
  statePrice: () => ['statePrice'],
};

// Invalidation helpers - use after transactions
export const invalidateUserData = (address) => {
  queryClient.invalidateQueries({ queryKey: ['balance', address] });
  queryClient.invalidateQueries({ queryKey: ['userSwapStatus', address] });
  queryClient.invalidateQueries({ queryKey: ['davBalance', address] });
  queryClient.invalidateQueries({ queryKey: ['davClaimable', address] });
};

export const invalidateTokenData = (tokenAddress) => {
  queryClient.invalidateQueries({ queryKey: ['auctionStatus', tokenAddress] });
  queryClient.invalidateQueries({ queryKey: ['pairReserves'] });
};

export const invalidateAllAuctionData = () => {
  queryClient.invalidateQueries({ queryKey: ['auctionStatus'] });
  queryClient.invalidateQueries({ queryKey: ['auctionTime'] });
  queryClient.invalidateQueries({ queryKey: ['todayToken'] });
};

// Prefetch helpers - use for anticipated data needs
export const prefetchBalance = async (address, tokenAddress, fetchFn) => {
  await queryClient.prefetchQuery({
    queryKey: queryKeys.balance(address, tokenAddress),
    queryFn: fetchFn,
    staleTime: 30 * 1000,
  });
};

// Get cached data without triggering fetch
export const getCachedBalance = (address, tokenAddress) => {
  return queryClient.getQueryData(queryKeys.balance(address, tokenAddress));
};

export const getCachedTokenInfo = (tokenAddress) => {
  return queryClient.getQueryData(queryKeys.tokenInfo(tokenAddress));
};

// Manual cache setters (useful after transactions)
export const setCachedBalance = (address, tokenAddress, balance) => {
  queryClient.setQueryData(queryKeys.balance(address, tokenAddress), balance);
};

// Clear all cache (use on wallet disconnect)
export const clearQueryCache = () => {
  queryClient.clear();
};

// Get cache stats for debugging
export const getQueryCacheStats = () => {
  const cache = queryClient.getQueryCache();
  return {
    totalQueries: cache.getAll().length,
    activeQueries: cache.getAll().filter(q => q.state.status === 'pending').length,
    staleQueries: cache.getAll().filter(q => q.isStale()).length,
  };
};

export default queryClient;
