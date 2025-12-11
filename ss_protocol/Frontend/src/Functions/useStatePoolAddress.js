import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useContractContext } from "./useContractContext";
import { createSmartPoller } from "../utils/smartPolling";

// Returns the STATE/WPLS pool address managed by the Buy & Burn controller
// Falls back to controller.getControllerStatus() if stateWplsPool() is unavailable
export function useStatePoolAddress() {
  const { BuyAndBurnController } = useContractContext();
  const [poolAddress, setPoolAddress] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!BuyAndBurnController) { setPoolAddress(null); return; }
    
    const fetch = async () => {
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
        setPoolAddress(addr && ethers.isAddress(addr) ? addr : ethers.ZeroAddress);
      } catch {
        setPoolAddress(ethers.ZeroAddress);
      } finally {
        setLoading(false);
      }
    };
    
    // Smart polling: 60s active, 5min idle (pool address rarely changes)
    const poller = createSmartPoller(fetch, {
      activeInterval: 60000,   // 1 min when user is active
      idleInterval: 300000,    // 5 minutes when idle (this changes very rarely)
      fetchOnStart: true,      // Fetch immediately
      fetchOnVisible: true,    // Refresh when tab becomes visible
      name: 'state-pool-address'
    });
    
    poller.start();
    return () => poller.stop();
  }, [BuyAndBurnController]);

  return { poolAddress, loading };
}

export default useStatePoolAddress;
