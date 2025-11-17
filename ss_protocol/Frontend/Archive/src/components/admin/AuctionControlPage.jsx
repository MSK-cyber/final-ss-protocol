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
    <>
      {/* Overview Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">🎯 AUCTION CONTROL</h5>
          <small className="text-muted">Step 5: Launch and monitor the auction system</small>
        </div>
        <div className="card-body">
          {/* System Status Banner */}
          <div className={`alert ${status.scheduled ? 'alert-success' : 'alert-info'} d-flex align-items-center mb-4`}>
            <div className="me-3" style={{fontSize: '2rem'}}>
              {status.scheduled ? '🎉' : '🚀'}
            </div>
            <div className="flex-grow-1">
              {status.scheduled ? (
                <>
                  <h6 className="alert-heading mb-1">Auction System Active</h6>
                  <p className="mb-0 small">The auction schedule is running with {status.count} registered token(s).</p>
                </>
              ) : (
                <>
                  <h6 className="alert-heading mb-1">Ready to Launch</h6>
                  <p className="mb-0 small">Start the auction system to begin token auctions.</p>
                </>
              )}
            </div>
          </div>

          {/* Start Auction Form */}
          <div className="card bg-primary bg-opacity-10 border-primary">
            <div className="card-body">
              <h6 className="mb-3">
                <i className="bi bi-play-circle-fill me-2"></i>
                START AUCTION SYSTEM
              </h6>
              <form onSubmit={startAuction}>
                <div className="row g-3 align-items-end">
                  <div className="col-md-8">
                    <label className="form-label small fw-bold text-uppercase">
                      <i className="bi bi-calendar-event me-1"></i>
                      Start Time (Optional)
                    </label>
                    <input 
                      type="datetime-local" 
                      className="form-control" 
                      value={startAt} 
                      onChange={(e)=>setStartAt(e.target.value)} 
                    />
                    <small className="text-muted d-block mt-1">
                      <i className="bi bi-info-circle me-1"></i>
                      Leave empty to start immediately
                    </small>
                  </div>
                  <div className="col-md-4">
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
                          Start Auction
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

      {/* Status Grid */}
      <div className="card">
        <div className="card-header">
          <h6 className="mb-0">
            <i className="bi bi-graph-up me-2"></i>
            SYSTEM STATUS
          </h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {/* Schedule Status */}
            <div className="col-md-6 col-lg-3">
              <div className={`card h-100 ${status.scheduled ? 'border-success' : 'border-secondary'}`} style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">
                    {status.scheduled ? '✅' : '⏸️'}
                  </div>
                  <h6 className="small fw-bold mb-1">SCHEDULE STATUS</h6>
                  <span className={`badge ${status.scheduled ? 'bg-success' : 'bg-secondary'}`}>
                    {status.scheduled ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
            </div>

            {/* Start Time */}
            <div className="col-md-6 col-lg-3">
              <div className="card h-100 border-primary" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">📅</div>
                  <h6 className="small fw-bold mb-1">START TIME</h6>
                  <p className="small mb-0 text-muted">
                    {status.start ? new Date(status.start * 1000).toLocaleDateString() : 'Not set'}
                  </p>
                  <p className="small mb-0 text-muted">
                    {status.start ? new Date(status.start * 1000).toLocaleTimeString() : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Days Limit */}
            <div className="col-md-6 col-lg-3">
              <div className="card h-100 border-info" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">📊</div>
                  <h6 className="small fw-bold mb-1">DAYS LIMIT</h6>
                  <h4 className="mb-0 text-primary">{status.daysLimit || '∞'}</h4>
                  <small className="text-muted">Auction days</small>
                </div>
              </div>
            </div>

            {/* Registered Tokens */}
            <div className="col-md-6 col-lg-3">
              <div className="card h-100 border-warning" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">🪙</div>
                  <h6 className="small fw-bold mb-1">TOKENS</h6>
                  <h4 className="mb-0 text-primary">{status.count}</h4>
                  <small className="text-muted">Registered</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="card mt-4">
        <div className="card-header bg-primary bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-info-circle-fill me-2"></i>
            AUCTION SYSTEM INFORMATION
          </h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>⏰</div>
                <div>
                  <h6 className="small fw-bold mb-1">Auction Schedule</h6>
                  <p className="small text-muted mb-0">Auctions run in 15-minute time slots. Each registered token gets a turn in the rotation.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>🔄</div>
                <div>
                  <h6 className="small fw-bold mb-1">Reverse Auctions</h6>
                  <p className="small text-muted mb-0">Every 4th appearance is a reverse auction where STATE is auctioned for the token.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>🎯</div>
                <div>
                  <h6 className="small fw-bold mb-1">Token Registration</h6>
                  <p className="small text-muted mb-0">Tokens must be registered in Step 4 (Token Management) before starting the auction system.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>📈</div>
                <div>
                  <h6 className="small fw-bold mb-1">Automatic Execution</h6>
                  <p className="small text-muted mb-0">Once started, auctions run automatically according to the schedule without manual intervention.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}