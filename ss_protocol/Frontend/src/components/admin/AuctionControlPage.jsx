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
      if (SwapLens && AuctionContract?.target) {
        const res = await SwapLens.getScheduleConfig(AuctionContract.target);
        const [isSet, start, daysLimit, scheduledCount] = res;
        setStatus({ scheduled: Boolean(isSet), start: Number(start), daysLimit: Number(daysLimit), count: Number(scheduledCount) });
      } else {
        // Fallback to tokenCount only
        const cnt = Number(await AuctionContract.tokenCount?.().catch(() => 0));
        setStatus((prev) => ({ ...prev, count: cnt }));
      }
    } catch (e) {
      console.warn("Failed to load schedule", e);
    }
  };

  useEffect(() => { loadStatus(); }, [AuctionContract]);

  const startAuction = async (e) => {
    e.preventDefault();
    if (!AuctionContract) {
      toast.error("Auction contract not ready", { duration: 5000 });
      return;
    }
    setLoading(true);
    try {
  // Contract calculates next Pakistan 11:00 PM internally; no params needed
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
                        <strong>Auto-Scheduled Start Time:</strong> 9:00 PM GMT+2
                      </div>
                      <small className="d-block mt-1">The auction will automatically start at 9:00 PM GMT+2 (Nov 11, 2025 - 19:00 UTC)</small>
                    </div>
                  </div>
                  <div className="col-md-3">
                    <button 
                      className="btn btn-primary w-100 btn-lg" 
                      type="submit"
                      disabled={loading || !AuctionContract}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2"/>
                          Starting...
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