/**
 * Migration Bridge Utility
 * 
 * Syncs data between old React Context and new Zustand stores.
 * This allows gradual migration of components to the new state system.
 * 
 * Usage:
 * 1. Components can start using Zustand stores immediately
 * 2. Old context updates are synced to stores automatically
 * 3. Gradually remove context dependencies
 * 4. Eventually remove the bridge entirely
 */

import { useEffect, useRef } from 'react';
import { 
  useAuctionStore, 
  useUserStore, 
  useTokenStore, 
  useUIStore 
} from '../stores';

/**
 * Hook to sync old context data to Zustand stores
 * Place this once in a high-level component
 */
export const useStoreBridge = (contextData) => {
  const hasInitialized = useRef(false);
  
  // Get batch setters from stores
  const setAuctionBatch = useAuctionStore(state => state.setBatch);
  const setUserBatch = useUserStore(state => state.setBatch);
  const setTokenBatch = useTokenStore(state => state.setBatch);
  const setUIBatch = useUIStore(state => state.setBatch);
  
  // Sync auction data
  useEffect(() => {
    if (!contextData) return;
    
    const auctionData = {};
    
    if (contextData.auctionTime !== undefined) {
      auctionData.auctionTime = contextData.auctionTime;
    }
    if (contextData.auctionPhase !== undefined) {
      auctionData.auctionPhase = contextData.auctionPhase;
    }
    if (contextData.auctionPhaseSeconds !== undefined) {
      auctionData.auctionPhaseSeconds = contextData.auctionPhaseSeconds;
    }
    if (contextData.auctionEndAt !== undefined) {
      auctionData.auctionEndAt = contextData.auctionEndAt;
    }
    if (contextData.todayToken !== undefined) {
      auctionData.todayToken = contextData.todayToken;
    }
    if (contextData.todayTokenIndex !== undefined) {
      auctionData.todayTokenIndex = contextData.todayTokenIndex;
    }
    if (contextData.todayTokenCreatedAt !== undefined) {
      auctionData.todayTokenCreatedAt = contextData.todayTokenCreatedAt;
    }
    if (contextData.duration !== undefined) {
      auctionData.duration = contextData.duration;
    }
    if (contextData.interval !== undefined) {
      auctionData.interval = contextData.interval;
    }
    
    if (Object.keys(auctionData).length > 0) {
      setAuctionBatch(auctionData);
    }
  }, [
    contextData?.auctionTime,
    contextData?.auctionPhase,
    contextData?.auctionPhaseSeconds,
    contextData?.auctionEndAt,
    contextData?.todayToken,
    contextData?.duration,
    contextData?.interval,
    setAuctionBatch
  ]);
  
  // Sync user data
  useEffect(() => {
    if (!contextData) return;
    
    const userData = {};
    
    if (contextData.userHasSwapped !== undefined) {
      userData.userHasSwapped = contextData.userHasSwapped;
    }
    if (contextData.userHasBurned !== undefined) {
      userData.userHasBurned = contextData.userHasBurned;
    }
    if (contextData.userHasClaimed !== undefined) {
      userData.userHasClaimed = contextData.userHasClaimed;
    }
    if (contextData.userHasAirdropClaimed !== undefined) {
      userData.userHasAirdropClaimed = contextData.userHasAirdropClaimed;
    }
    if (contextData.userAirdropDollarValue !== undefined) {
      userData.userAirdropDollarValue = contextData.userAirdropDollarValue;
    }
    if (contextData.overallClaimableTokenBalance !== undefined) {
      userData.overallClaimableTokenBalance = contextData.overallClaimableTokenBalance;
    }
    if (contextData.plsBalance !== undefined) {
      userData.plsBalance = contextData.plsBalance;
    }
    if (contextData.wpls_Balance !== undefined) {
      userData.wpls_Balance = contextData.wpls_Balance;
    }
    if (contextData.state_Balance !== undefined) {
      userData.state_Balance = contextData.state_Balance;
    }
    
    if (Object.keys(userData).length > 0) {
      setUserBatch(userData);
    }
  }, [
    contextData?.userHasSwapped,
    contextData?.userHasBurned,
    contextData?.userHasClaimed,
    contextData?.userHasAirdropClaimed,
    contextData?.plsBalance,
    contextData?.wpls_Balance,
    contextData?.state_Balance,
    setUserBatch
  ]);
  
  // Sync token data
  useEffect(() => {
    if (!contextData) return;
    
    const tokenData = {};
    
    if (contextData.tokenNames !== undefined) {
      tokenData.tokenNames = contextData.tokenNames;
    }
    if (contextData.tokenMap !== undefined) {
      tokenData.tokenMap = contextData.tokenMap;
    }
    if (contextData.tokenRatios !== undefined) {
      tokenData.tokenRatios = contextData.tokenRatios;
    }
    if (contextData.burnedAmounts !== undefined) {
      tokenData.burnedAmounts = contextData.burnedAmounts;
    }
    if (contextData.pairAddresses !== undefined) {
      tokenData.pairAddresses = contextData.pairAddresses;
    }
    if (contextData.allTokens !== undefined) {
      tokenData.allTokens = contextData.allTokens;
    }
    
    if (Object.keys(tokenData).length > 0) {
      setTokenBatch(tokenData);
    }
  }, [
    contextData?.tokenNames,
    contextData?.tokenMap,
    contextData?.tokenRatios,
    contextData?.burnedAmounts,
    contextData?.pairAddresses,
    contextData?.allTokens,
    setTokenBatch
  ]);
  
  // Sync UI state
  useEffect(() => {
    if (!contextData) return;
    
    const uiData = {};
    
    if (contextData.isLoading !== undefined) {
      uiData.isLoading = contextData.isLoading;
    }
    if (contextData.swapLoading !== undefined) {
      uiData.swapLoading = contextData.swapLoading;
    }
    if (contextData.txHash !== undefined) {
      uiData.txHash = contextData.txHash;
    }
    
    if (Object.keys(uiData).length > 0) {
      setUIBatch(uiData);
    }
  }, [
    contextData?.isLoading,
    contextData?.swapLoading,
    contextData?.txHash,
    setUIBatch
  ]);
  
  // Mark as initialized
  useEffect(() => {
    hasInitialized.current = true;
  }, []);
  
  return hasInitialized.current;
};

/**
 * Higher-order component to automatically bridge context
 */
export const withStoreBridge = (WrappedComponent, useContextHook) => {
  return function BridgedComponent(props) {
    const contextData = useContextHook();
    useStoreBridge(contextData);
    return <WrappedComponent {...props} />;
  };
};

/**
 * Hook for components to read from store with fallback to context
 * Use during migration to gradually move off context
 */
export const useMigratedAuctionData = () => {
  const storeData = useAuctionStore(state => ({
    auctionTime: state.auctionTime,
    auctionPhase: state.auctionPhase,
    auctionPhaseSeconds: state.auctionPhaseSeconds,
    auctionEndAt: state.auctionEndAt,
    todayToken: state.todayToken,
    todayTokenIndex: state.todayTokenIndex,
    duration: state.duration,
    interval: state.interval,
  }));
  
  return storeData;
};

export const useMigratedUserData = () => {
  const storeData = useUserStore(state => ({
    userHasSwapped: state.userHasSwapped,
    userHasBurned: state.userHasBurned,
    userHasClaimed: state.userHasClaimed,
    userHasAirdropClaimed: state.userHasAirdropClaimed,
    plsBalance: state.plsBalance,
    wpls_Balance: state.wpls_Balance,
    state_Balance: state.state_Balance,
  }));
  
  return storeData;
};

export const useMigratedTokenData = () => {
  const storeData = useTokenStore(state => ({
    tokenNames: state.tokenNames,
    tokenMap: state.tokenMap,
    tokenRatios: state.tokenRatios,
    burnedAmounts: state.burnedAmounts,
    pairAddresses: state.pairAddresses,
    allTokens: state.allTokens,
  }));
  
  return storeData;
};

export default {
  useStoreBridge,
  withStoreBridge,
  useMigratedAuctionData,
  useMigratedUserData,
  useMigratedTokenData,
};
