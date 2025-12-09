import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useContractContext } from "./useContractContext";

// Returns the STATE/WPLS pool address managed by the Buy & Burn controller
// Falls back to controller.getControllerStatus() if stateWplsPool() is unavailable
export function useStatePoolAddress() {
  const { BuyAndBurnController } = useContractContext();
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      if (!BuyAndBurnController) { setPoolAddress(null); return; }
      setLoading(true);
      try {
        let addr = null;
        try {
          if (typeof BuyAndBurnController.stateWplsPool === 'function') {
            addr = await BuyAndBurnController.stateWplsPool();
          }
        } catch {}
        if (!addr || addr === ethers.ZeroAddress) {
          try {
            const s = await BuyAndBurnController.getControllerStatus();
            addr = s?.[3];
          } catch {}
        }
        if (!cancelled) setPoolAddress(addr && ethers.isAddress(addr) ? addr : ethers.ZeroAddress);
      } catch {
        if (!cancelled) setPoolAddress(ethers.ZeroAddress);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    const id = setInterval(fetch, 120000); // 2 minutes - reduced from 30s to prevent memory issues
    return () => { cancelled = true; clearInterval(id); };
  }, [BuyAndBurnController]);

  return { poolAddress, loading };
}

export default useStatePoolAddress;
