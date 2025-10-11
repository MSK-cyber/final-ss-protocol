import React, { useEffect, useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";

export default function AuctionControlPage() {
  const { AuctionContract, SwapLens } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [startAt, setStartAt] = useState("");
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
    if (!AuctionContract) return alert("Auction contract not ready");
    let ts;
    try {
      ts = startAt ? BigInt(Math.floor(new Date(startAt).getTime() / 1000)) : BigInt(Math.floor(Date.now() / 1000));
    } catch {
      ts = BigInt(Math.floor(Date.now() / 1000));
    }
    setLoading(true);
    try {
      const tx = await AuctionContract.startAuctionWithAutoTokens(ts);
      alert(`Start auction tx: ${tx.hash}`);
      await tx.wait();
      await loadStatus();
    } catch (err) {
      alert(err.message || "Failed to start auction");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">🎯 Step 5: Auction Control</h5>
        <small className="text-muted">Monitor auction system and start auctions</small>
      </div>
      <div className="card-body">
        <div className="row g-3 align-items-end mb-3">
          <div className="col-md-6">
            <label className="form-label">Start Time (optional)</label>
            <input type="datetime-local" className="form-control" value={startAt} onChange={(e)=>setStartAt(e.target.value)} />
            <small className="text-muted">Leave empty to start now</small>
          </div>
          <div className="col-md-3">
            <button className="btn btn-primary w-100" onClick={startAuction} disabled={loading || !AuctionContract}>
              {loading ? <><span className="spinner-border spinner-border-sm me-2"/>Starting...</> : "Start Auction"}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card-body">
            <h6>Schedule Status</h6>
            <ul className="mb-0">
              <li>Scheduled: {status.scheduled ? "Yes" : "No"}</li>
              <li>Start: {status.start ? new Date(status.start * 1000).toLocaleString() : "-"}</li>
              <li>Days Limit: {status.daysLimit || "-"}</li>
              <li>Registered Tokens: {status.count}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}