import React, { useEffect, useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";

export default function AuctionControlPage() {
  const { AuctionContract, SwapLens } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState({ scheduled: false, start: 0, daysLimit: 0, count: 0 });

  const loadStatus = async () => {
    if (!AuctionContract) return;
    try {
      const contractAddr = AuctionContract?.target || AuctionContract?.address;
      let scheduled = false;
      let start = 0;
      let daysLimit = 0;
      let scheduledCount = 0;

      // Primary source: SwapLens schedule config (explicit flag only)
      if (SwapLens && contractAddr) {
        try {
          const res = await SwapLens.getScheduleConfig(contractAddr);
          if (Array.isArray(res) && res.length >= 4) {
            const [isSet, startRaw, daysLimitRaw, countRaw] = res;
            start = Number(startRaw);
            daysLimit = Number(daysLimitRaw);
            scheduledCount = Number(countRaw);
            scheduled = Boolean(isSet); // Only trust explicit contract flag
          }
        } catch (e) {
          console.warn('SwapLens getScheduleConfig failed', e);
        }
      }

      // Secondary check: active flag from getTodayToken (indicates auction actually running)
      if (!scheduled && AuctionContract.getTodayToken) {
        try {
          const today = await AuctionContract.getTodayToken();
          // Expect [tokenAddr, active]; active true means schedule started
          if (Array.isArray(today) && today.length >= 2) {
            const active = Boolean(today[1]);
            if (active) scheduled = true;
          }
        } catch {}
      }

      // Remove all heuristic inference (tokenCount, non-zero token address, etc.) to prevent false positives

      setStatus({ scheduled, start, daysLimit, count: scheduledCount });
    } catch (e) {
      console.warn("Failed to load schedule", e);
    }
  };

  useEffect(() => { loadStatus(); }, [AuctionContract]);

  // Poll periodically to reflect schedule state without manual refresh
  useEffect(() => {
    const id = setInterval(() => { loadStatus(); }, 15000); // 15s poll
    return () => clearInterval(id);
  }, [AuctionContract]);

  const startAuction = async (e) => {
    e.preventDefault();
    if (!AuctionContract) {
      toast.error("Auction contract not ready", { duration: 5000 });
      return;
    }
    setLoading(true);
    try {
  // Contract calculates next GMT+5 9:00 PM internally; no params needed
      const tx = await AuctionContract.startAuctionWithAutoTokens();
      toast.success(`Start auction tx sent: ${tx.hash}`, { duration: 12000 });
      await tx.wait();
      toast.success("Auction system started successfully", { duration: 12000 });
      await loadStatus();
    } catch (err) {
      toast.error(err?.shortMessage || err?.message || "Failed to start auction", { duration: 5000 });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overview Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">🎯 AUCTION CONTROL</h5>
        </div>
        <div className="card-body">
          {/* System Status Banner removed per request */}

          {/* Start Auction Form */}
          <div className="card bg-primary bg-opacity-10 border-primary">
            <div className="card-body">
              <h6 className="mb-3">
                <i className="bi bi-play-circle-fill me-2"></i>
                START AUCTION SYSTEM
              </h6>
              <form onSubmit={startAuction}>
                <div className="row g-3 align-items-center">
                  <div className="col-md-9">
                    <div className="alert alert-info mb-0">
                      <div>
                        <i className="bi bi-clock-history me-2"></i>
                        <strong>Auto-Scheduled Start Time:</strong> 5:00 PM GMT+3
                      </div>
                      <small className="d-block mt-1">The auction will automatically start at 5:00 PM GMT+3 (Dec 8, 2025 - 14:00 UTC)</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <button
                      className="btn btn-primary w-100 btn-lg"
                      type="submit"
                      disabled={loading || !AuctionContract || status.scheduled}
                      title={status.scheduled ? "Auction initialized" : "Start auction system"}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Starting...
                        </>
                      ) : status.scheduled ? (
                        <>
                          <span role="img" aria-label="initialized" className="me-2">✅</span>
                          Auction Initialized
                        </>
                      ) : (
                        <>
                          <i className="bi bi-play-fill me-2"></i>
                          Start Auction System
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Removed SYSTEM STATUS and AUCTION SYSTEM INFORMATION sections per request */}
    </>
  );
}