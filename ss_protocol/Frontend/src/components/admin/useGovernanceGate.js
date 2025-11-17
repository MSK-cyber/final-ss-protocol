import { useAccount, useChainId } from "wagmi";
import { useContext, useEffect, useMemo, useState } from "react";
import { ContractContext } from "../../Functions/ContractInitialize";

// Simple governance gate using Auction contract's governanceAddress() view
export function useGovernanceGate() {
  const { address } = useAccount();
  const chainId = useChainId();
  const { AllContracts, provider } = useContext(ContractContext);
  const [gov, setGov] = useState(null);
  const [loading, setLoading] = useState(false);
  // Frontend allowlist: extra wallets that can access admin UIs
  const ADMIN_ALLOWLIST = useMemo(() => [
    '0x9fa004e13e780ef5b50ca225ad5dcd4d0fe9ed70',
  ], []);
  const envGov = (import.meta?.env?.VITE_GOVERNANCE_ADDRESS || '').toLowerCase?.() || '';
  const queryGov = (() => {
    try {
      if (typeof window === 'undefined') return '';
      const v = new URLSearchParams(window.location.search).get('gov') || '';
      return v.toLowerCase();
    } catch { return ''; }
  })();
  const lsGov = (() => {
    try {
      if (typeof window === 'undefined') return '';
      const v = localStorage.getItem('GOVERNANCE_OVERRIDE') || '';
      return v.toLowerCase();
    } catch { return ''; }
  })();

  useEffect(() => {
    let mounted = true;
    async function run() {
      // Override precedence: query > localStorage > env > on-chain
      if (queryGov) {
        setGov(queryGov);
        return;
      }
      if (lsGov) {
        setGov(lsGov);
        return;
      }
      if (envGov) {
        setGov(envGov);
        return;
      }
      if (!AllContracts?.AuctionContract) return;
      try {
        setLoading(true);
  const g = await (provider ? AllContracts.AuctionContract.connect(provider) : AllContracts.AuctionContract).governanceAddress();
        if (mounted) setGov(g?.toLowerCase?.() || null);
      } catch (e) {
        console.error("governanceAddress() read failed:", e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    run();
    return () => {
      mounted = false;
    };
  }, [AllContracts, chainId, envGov, lsGov, queryGov]);

  const isGovernance = useMemo(() => {
    if (!address) return false;
    const me = address.toLowerCase();
    if (ADMIN_ALLOWLIST.includes(me)) return true;
    if (!gov) return false;
    return me === gov;
  }, [address, gov, ADMIN_ALLOWLIST]);

  return { isGovernance, governanceAddress: gov, loading };
}
