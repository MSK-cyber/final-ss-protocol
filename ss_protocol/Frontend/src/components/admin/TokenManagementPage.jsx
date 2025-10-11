import React, { useEffect, useMemo, useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";

export default function TokenManagementPage() {
  const { AuctionContract } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [deployForm, setDeployForm] = useState({ name: "", symbol: "" });
  const [poolForm, setPoolForm] = useState({ token: "", tokenAmount: "", stateAmount: "" });
  const [tokens, setTokens] = useState([]);

  const canManage = useMemo(() => !!AuctionContract, [AuctionContract]);

  const refreshTokens = async () => {
    if (!AuctionContract) return;
    try {
      const count = Number(await AuctionContract.tokenCount?.().catch(() => 0));
      const list = [];
      for (let i = 0; i < count; i++) {
        try {
          const token = await AuctionContract.autoRegisteredTokens(i);
          const pair = await AuctionContract.getPairAddress(token).catch(() => ethers.ZeroAddress);
          list.push({ token, pair });
        } catch {}
      }
      setTokens(list);
    } catch (e) {
      console.warn("Failed to load tokens", e);
    }
  };

  useEffect(() => {
    refreshTokens();
  }, [AuctionContract]);

  const deployToken = async (e) => {
    e.preventDefault();
    if (!AuctionContract) return alert("Auction contract not ready");
    if (!deployForm.name || !deployForm.symbol) return alert("Enter name and symbol");
    setLoading(true);
    try {
      const tx = await AuctionContract.deployTokenOneClick(deployForm.name, deployForm.symbol);
      alert(`Deploy tx: ${tx.hash}`);
      const rc = await tx.wait();
      // Try to parse event or refresh
      await refreshTokens();
      setDeployForm({ name: "", symbol: "" });
    } catch (err) {
      alert(err.message || "Failed to deploy token");
    } finally {
      setLoading(false);
    }
  };

  const createPool = async (e) => {
    e.preventDefault();
    if (!AuctionContract) return alert("Auction contract not ready");
    let token, tokenWei, stateWei;
    try {
      token = poolForm.token;
      if (!ethers.isAddress(token)) return alert("Invalid token address");
      tokenWei = ethers.parseEther(poolForm.tokenAmount || "0");
      stateWei = ethers.parseEther(poolForm.stateAmount || "0");
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch {
      return alert("Invalid amount format");
    }
    setLoading(true);
    try {
      const tx = await AuctionContract.createPoolOneClick(token, tokenWei, stateWei);
      alert(`Create pool tx: ${tx.hash}`);
      await tx.wait();
      await refreshTokens();
      setPoolForm({ token: "", tokenAmount: "", stateAmount: "" });
    } catch (err) {
      alert(err.message || "Failed to create pool");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (txt) => {
    try { await navigator.clipboard.writeText(txt); alert("Copied"); } catch {}
  };

  const addToMetaMask = async (addr) => {
    try {
      // Minimal: request wallet_watchAsset (token must be ERC20 with symbol/decimals)
      await window.ethereum?.request?.({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: addr, symbol: "TOKEN", decimals: 18 } },
      });
    } catch {}
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">🪙 Step 4: Token Management</h5>
        <small className="text-muted">Deploy auction tokens and manage pools</small>
      </div>
      <div className="card-body">
        {/* Deploy token */}
        <form onSubmit={deployToken} className="mb-4">
          <h6 className="text-primary mb-3">Deploy Token (One-Click)</h6>
          <div className="row g-3">
            <div className="col-md-5">
              <label className="form-label">Name</label>
              <input className="form-control" value={deployForm.name} onChange={(e)=>setDeployForm(p=>({...p,name:e.target.value}))} placeholder="Token Name" required />
            </div>
            <div className="col-md-5">
              <label className="form-label">Symbol</label>
              <input className="form-control" value={deployForm.symbol} onChange={(e)=>setDeployForm(p=>({...p,symbol:e.target.value}))} placeholder="SYM" required />
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button className="btn btn-primary w-100" disabled={!canManage || loading}>
                {loading ? <><span className="spinner-border spinner-border-sm me-2"/>Deploying...</> : "Deploy"}
              </button>
            </div>
          </div>
        </form>

        {/* Create pool for a token */}
        <form onSubmit={createPool} className="mb-4">
          <h6 className="text-primary mb-3">Create Token/STATE Pool</h6>
          <div className="row g-3">
            <div className="col-md-5">
              <label className="form-label">Token Address</label>
              <input className="form-control" value={poolForm.token} onChange={(e)=>setPoolForm(p=>({...p,token:e.target.value}))} placeholder="0x..." required />
            </div>
            <div className="col-md-3">
              <label className="form-label">Token Amount</label>
              <input type="number" step="0.000000000000000001" className="form-control" value={poolForm.tokenAmount} onChange={(e)=>setPoolForm(p=>({...p,tokenAmount:e.target.value}))} placeholder="1000.0" required />
            </div>
            <div className="col-md-2">
              <label className="form-label">STATE Amount</label>
              <input type="number" step="0.000000000000000001" className="form-control" value={poolForm.stateAmount} onChange={(e)=>setPoolForm(p=>({...p,stateAmount:e.target.value}))} placeholder="5000.0" required />
            </div>
            <div className="col-md-2 d-flex align-items-end">
              <button className="btn btn-success w-100" disabled={!canManage || loading}>
                {loading ? <><span className="spinner-border spinner-border-sm me-2"/>Creating...</> : "Create Pool"}
              </button>
            </div>
          </div>
        </form>

        {/* List & status */}
        <h6 className="mb-3">Deployed Tokens</h6>
        <div className="table-responsive">
          <table className="table table-sm align-middle">
            <thead>
              <tr>
                <th>#</th>
                <th>Address</th>
                <th>Pool Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted">No tokens yet</td></tr>
              )}
              {tokens.map((t, idx) => (
                <tr key={t.token}>
                  <td>{idx+1}</td>
                  <td className="text-monospace">
                    {t.token}
                  </td>
                  <td>
                    {t.pair && t.pair !== ethers.ZeroAddress ? (
                      <span className="badge bg-success">Pool Created</span>
                    ) : (
                      <span className="badge bg-warning text-dark">No Pool</span>
                    )}
                  </td>
                  <td>
                    <div className="btn-group btn-group-sm">
                      <button className="btn btn-outline-secondary" onClick={()=>copy(t.token)}>Copy</button>
                      <button className="btn btn-outline-secondary" onClick={()=>addToMetaMask(t.token)}>MetaMask</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}