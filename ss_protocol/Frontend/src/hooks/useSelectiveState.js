/**
 * Lightweight Selector Hooks
 * 
 * These hooks provide selective access to Zustand store state,
 * avoiding the "God Context" problem where components re-render
 * on ANY state change.
 * 
 * Usage:
 * // Instead of: const { auctionPhase, todayTokenAddress } = useSwapContract();
 * // Use: const { auctionPhase, todayToken } = useAuctionData();
 */

import { useAuctionStore, useTokenStore, useUserStore, useUIStore } from '../stores';
import { useShallow } from 'zustand/shallow';

/**
 * Get auction-related data (phase, timing, today's token)
 * Only re-renders when these specific values change
 */
export function useAuctionData() {
  return useAuctionStore(
    useShallow((state) => ({
      auctionTime: state.auctionTime,
      auctionPhase: state.auctionPhase,
      auctionPhaseSeconds: state.auctionPhaseSeconds,
      auctionEndAt: state.auctionEndAt,
      todayToken: state.todayToken,
      todayTokenAddress: state.todayTokenAddress,
      todayTokenSymbol: state.todayTokenSymbol,
      todayTokenName: state.todayTokenName,
      isReverse: state.isReverse,
      reverseWindowActive: state.reverseWindowActive,
      duration: state.duration,
      interval: state.interval,
    }))
  );
}

/**
 * Get only auction phase info (minimal, for countdown displays)
 */
export function useAuctionPhase() {
  return useAuctionStore(
    useShallow((state) => ({
      auctionPhase: state.auctionPhase,
      auctionPhaseSeconds: state.auctionPhaseSeconds,
    }))
  );
}

/**
 * Get today's token info only
 */
export function useTodayToken() {
  return useAuctionStore(
    useShallow((state) => ({
      todayToken: state.todayToken,
      todayTokenAddress: state.todayTokenAddress,
      todayTokenSymbol: state.todayTokenSymbol,
      todayTokenName: state.todayTokenName,
      todayTokenDecimals: state.todayTokenDecimals,
    }))
  );
}

/**
 * Get token data for display
 */
export function useTokenData() {
  return useTokenStore(
    useShallow((state) => ({
      tokenNames: state.tokenNames,
      tokenMap: state.tokenMap,
      tokenBalances: state.tokenBalances,
      tokenRatios: state.tokenRatios,
      burnedAmounts: state.burnedAmounts,
      isAuctionActive: state.isAuctionActive,
      isReversed: state.isReversed,
    }))
  );
}

/**
 * Get specific token's data by name
 */
export function useTokenByName(tokenName) {
  return useTokenStore(
    useShallow((state) => ({
      balance: state.tokenBalances?.[tokenName],
      ratio: state.tokenRatios?.[tokenName],
      burned: state.burnedAmounts?.[tokenName],
      isActive: state.isAuctionActive?.[tokenName],
      isReversed: state.isReversed?.[tokenName],
      pairAddress: state.pairAddresses?.[tokenName],
    }))
  );
}

/**
 * Get user swap status for all tokens
 */
export function useUserSwapStatus() {
  return useUserStore(
    useShallow((state) => ({
      userHasSwapped: state.userHasSwapped,
      userHasBurned: state.userHasBurned,
      userReverseStep1: state.userReverseStep1,
      userReverseStep2: state.userReverseStep2,
      userHasAirdropClaimed: state.userHasAirdropClaimed,
    }))
  );
}

/**
 * Get user's swap status for a specific token
 */
export function useUserTokenStatus(tokenName) {
  return useUserStore(
    useShallow((state) => ({
      hasSwapped: state.userHasSwapped?.[tokenName],
      hasBurned: state.userHasBurned?.[tokenName],
      reverseStep1: state.userReverseStep1?.[tokenName],
      reverseStep2: state.userReverseStep2?.[tokenName],
      airdropClaimed: state.userHasAirdropClaimed?.[tokenName],
    }))
  );
}

/**
 * Get user balances
 */
export function useUserBalances() {
  return useUserStore(
    useShallow((state) => ({
      plsBalance: state.plsBalance,
      wpls_Balance: state.wpls_Balance,
      state_Balance: state.state_Balance,
      davBalance: state.davBalance,
      stateHolding: state.stateHolding,
    }))
  );
}

/**
 * Get DAV-related data
 */
export function useDavData() {
  return useUserStore(
    useShallow((state) => ({
      davBalance: state.davBalance,
      davHolds: state.davHolds,
      davExpireHolds: state.davExpireHolds,
      stateHolding: state.stateHolding,
      claimableAmount: state.claimableAmount,
      roiPercentage: state.roiPercentage,
      roiMeets: state.roiMeets,
      totalInvestedPls: state.totalInvestedPls,
    }))
  );
}

/**
 * Get UI loading states
 */
export function useLoadingStates() {
  return useUIStore(
    useShallow((state) => ({
      isLoading: state.isLoading,
      claiming: state.claiming,
      swappingStates: state.swappingStates,
      buttonTextStates: state.buttonTextStates,
    }))
  );
}

/**
 * Get transaction status
 */
export function useTxStatus() {
  return useUIStore(
    useShallow((state) => ({
      txStatusForSwap: state.txStatusForSwap,
      txStatusForAdding: state.txStatusForAdding,
      txHash: state.txHash,
    }))
  );
}

export default {
  useAuctionData,
  useAuctionPhase,
  useTodayToken,
  useTokenData,
  useTokenByName,
  useUserSwapStatus,
  useUserTokenStatus,
  useUserBalances,
  useDavData,
  useLoadingStates,
  useTxStatus,
};
