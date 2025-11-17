import React, { useEffect, useMemo, useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";

export default function TokenManagementPage() {
  const { AuctionContract, LiquidityManager, AllContracts } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [deployForm, setDeployForm] = useState({ name: "", symbol: "" });
  const [poolForm, setPoolForm] = useState({ token: "", tokenAmount: "", stateAmount: "" });
  const [addLiquidityForm, setAddLiquidityForm] = useState({ token: "", tokenAmount: "", stateAmount: "" });
  const [allowanceForm, setAllowanceForm] = useState({ token: "" });
  const [allowanceStatus, setAllowanceStatus] = useState({ token: null, state: null, checking: false });
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAllowanceStatus, setModalAllowanceStatus] = useState({ token: null, state: null, checking: false });
  const [modalLiquidityForm, setModalLiquidityForm] = useState({ tokenAmount: "", stateAmount: "" });

  const canManage = useMemo(() => !!AuctionContract, [AuctionContract]);
  const canAddLiquidity = useMemo(() => !!LiquidityManager, [LiquidityManager]);
  const stateTokenAddress = useMemo(() => AllContracts?.stateContract?.target || AllContracts?._stateAddress, [AllContracts]);

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

  const addLiquidity = async (e) => {
    e.preventDefault();
    if (!LiquidityManager) return alert("LiquidityManager contract not available");
    let token, tokenWei, stateWei;
    try {
      token = addLiquidityForm.token;
      if (!ethers.isAddress(token)) return alert("Invalid token address");
      tokenWei = ethers.parseEther(addLiquidityForm.tokenAmount || "0");
      stateWei = ethers.parseEther(addLiquidityForm.stateAmount || "0");
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch {
      return alert("Invalid amount format");
    }
    setLoading(true);
    try {
      const tx = await LiquidityManager.addLiquidityToExistingPool(token, tokenWei, stateWei);
      alert(`Add liquidity tx: ${tx.hash}`);
      await tx.wait();
      await refreshTokens();
      setAddLiquidityForm({ token: "", tokenAmount: "", stateAmount: "" });
      setAllowanceStatus({ token: null, state: null, checking: false }); // Reset allowance status
    } catch (err) {
      alert(err.message || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const checkAllowances = async () => {
    const tokenAddr = allowanceForm.token;
    if (!ethers.isAddress(tokenAddr)) return alert("Invalid token address");
    if (!AuctionContract || !LiquidityManager || !stateTokenAddress) {
      return alert("Contracts not ready");
    }

    setAllowanceStatus({ token: null, state: null, checking: true });
    
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const swapVaultAddr = AuctionContract.target;

      // Create ERC20 contract instances to check allowances
      const ERC20_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];
      const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, AuctionContract.runner);
      const stateContract = new ethers.Contract(stateTokenAddress, ERC20_ABI, AuctionContract.runner);

      const [tokenAllowance, stateAllowance] = await Promise.all([
        tokenContract.allowance(swapVaultAddr, liquidityManagerAddr),
        stateContract.allowance(swapVaultAddr, liquidityManagerAddr)
      ]);

      const SUFFICIENT_ALLOWANCE = ethers.parseEther("1000000000"); // 1B tokens
      
      setAllowanceStatus({
        token: tokenAllowance >= SUFFICIENT_ALLOWANCE,
        state: stateAllowance >= SUFFICIENT_ALLOWANCE,
        checking: false
      });
    } catch (err) {
      console.error("Failed to check allowances:", err);
      alert("Failed to check allowances: " + (err.message || "Unknown error"));
      setAllowanceStatus({ token: null, state: null, checking: false });
    }
  };

  const setupAllowance = async (tokenAddr, isStateToken = false) => {
    if (!AuctionContract || !LiquidityManager) return alert("Contracts not ready");
    
    setLoading(true);
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const tx = await AuctionContract.setVaultAllowance(
        tokenAddr,
        liquidityManagerAddr,
        ethers.MaxUint256
      );
      alert(`Setting allowance tx: ${tx.hash}\nWait for confirmation...`);
      await tx.wait();
      alert(`✅ Allowance set successfully for ${isStateToken ? 'STATE' : 'Token'}!`);
      
      // Re-check allowances
      await checkAllowances();
    } catch (err) {
      alert("Failed to set allowance: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // Modal functions for token-specific liquidity management
  const openLiquidityModal = async (token) => {
    setSelectedToken(token);
    setShowModal(true);
    setModalLiquidityForm({ tokenAmount: "", stateAmount: "" });
    // Auto-check allowances when opening modal
    await checkModalAllowances(token.token);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedToken(null);
    setModalAllowanceStatus({ token: null, state: null, checking: false });
    setModalLiquidityForm({ tokenAmount: "", stateAmount: "" });
  };

  const checkModalAllowances = async (tokenAddr) => {
    if (!ethers.isAddress(tokenAddr)) return;
    if (!AuctionContract || !LiquidityManager || !stateTokenAddress) return;

    setModalAllowanceStatus({ token: null, state: null, checking: true });
    
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const swapVaultAddr = AuctionContract.target;

      const ERC20_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];
      const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, AuctionContract.runner);
      const stateContract = new ethers.Contract(stateTokenAddress, ERC20_ABI, AuctionContract.runner);

      const [tokenAllowance, stateAllowance] = await Promise.all([
        tokenContract.allowance(swapVaultAddr, liquidityManagerAddr),
        stateContract.allowance(swapVaultAddr, liquidityManagerAddr)
      ]);

      const SUFFICIENT_ALLOWANCE = ethers.parseEther("1000000000");
      
      setModalAllowanceStatus({
        token: tokenAllowance >= SUFFICIENT_ALLOWANCE,
        state: stateAllowance >= SUFFICIENT_ALLOWANCE,
        checking: false
      });
    } catch (err) {
      console.error("Failed to check allowances:", err);
      setModalAllowanceStatus({ token: null, state: null, checking: false });
    }
  };

  const setupModalAllowance = async (tokenAddr, isStateToken = false) => {
    if (!AuctionContract || !LiquidityManager) return alert("Contracts not ready");
    
    setLoading(true);
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const tx = await AuctionContract.setVaultAllowance(
        tokenAddr,
        liquidityManagerAddr,
        ethers.MaxUint256
      );
      alert(`Setting allowance tx: ${tx.hash}\nWait for confirmation...`);
      await tx.wait();
      alert(`✅ Allowance set successfully for ${isStateToken ? 'STATE' : 'Token'}!`);
      
      // Re-check allowances in modal
      if (selectedToken) {
        await checkModalAllowances(selectedToken.token);
      }
    } catch (err) {
      alert("Failed to set allowance: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const addLiquidityFromModal = async (e) => {
    e.preventDefault();
    if (!LiquidityManager || !selectedToken) return alert("Invalid state");
    
    let tokenWei, stateWei;
    try {
      tokenWei = ethers.parseEther(modalLiquidityForm.tokenAmount || "0");
      stateWei = ethers.parseEther(modalLiquidityForm.stateAmount || "0");
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch {
      return alert("Invalid amount format");
    }
    
    setLoading(true);
    try {
      const tx = await LiquidityManager.addLiquidityToExistingPool(
        selectedToken.token,
        tokenWei,
        stateWei
      );
      alert(`Add liquidity tx: ${tx.hash}\nWait for confirmation...`);
      await tx.wait();
      alert(`✅ Liquidity added successfully!`);
      await refreshTokens();
      closeModal();
    } catch (err) {
      alert("Failed to add liquidity: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Overview Card */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">🪙 TOKEN MANAGEMENT</h5>
          <small className="text-muted">Step 4: Deploy auction tokens and create liquidity pools</small>
        </div>
        <div className="card-body">
          {/* Summary Stats */}
          <div className="row g-3 mb-4">
            <div className="col-md-4">
              <div className="card border-primary" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">🪙</div>
                  <h6 className="small fw-bold mb-1">TOTAL TOKENS</h6>
                  <h4 className="mb-0 text-primary">{tokens.length}</h4>
                  <small className="text-muted">Deployed</small>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-success" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">💧</div>
                  <h6 className="small fw-bold mb-1">WITH POOLS</h6>
                  <h4 className="mb-0 text-success">
                    {tokens.filter(t => t.pair && t.pair !== ethers.ZeroAddress).length}
                  </h4>
                  <small className="text-muted">Active liquidity</small>
                </div>
              </div>
            </div>
            <div className="col-md-4">
              <div className="card border-warning" style={{borderWidth: '2px'}}>
                <div className="card-body text-center">
                  <div style={{fontSize: '2rem'}} className="mb-2">⏳</div>
                  <h6 className="small fw-bold mb-1">NO POOLS</h6>
                  <h4 className="mb-0 text-warning">
                    {tokens.filter(t => !t.pair || t.pair === ethers.ZeroAddress).length}
                  </h4>
                  <small className="text-muted">Need liquidity</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deploy Token Card */}
      <div className="card mb-4">
        <div className="card-header bg-primary bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-rocket-takeoff-fill me-2"></i>
            DEPLOY NEW TOKEN
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={deployToken}>
            <div className="row g-3 align-items-end">
              <div className="col-md-5">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-tag-fill me-1"></i>
                  Token Name
                </label>
                <input 
                  className="form-control" 
                  value={deployForm.name} 
                  onChange={(e)=>setDeployForm(p=>({...p,name:e.target.value}))} 
                  placeholder="e.g., My Auction Token" 
                  required 
                />
              </div>
              <div className="col-md-4">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-code-square me-1"></i>
                  Token Symbol
                </label>
                <input 
                  className="form-control text-uppercase" 
                  value={deployForm.symbol} 
                  onChange={(e)=>setDeployForm(p=>({...p,symbol:e.target.value.toUpperCase()}))} 
                  placeholder="e.g., MAT" 
                  maxLength="10"
                  required 
                />
              </div>
              <div className="col-md-3">
                <button 
                  className="btn btn-primary w-100 btn-lg" 
                  type="submit"
                  disabled={!canManage || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"/>
                      Deploying...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-circle-fill me-2"></i>
                      Deploy Token
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Create Pool Card */}
      <div className="card mb-4">
        <div className="card-header bg-success bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-water me-2"></i>
            CREATE LIQUIDITY POOL
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={createPool}>
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-coin me-1"></i>
                  Token Address
                </label>
                <input 
                  className="form-control font-monospace" 
                  value={poolForm.token} 
                  onChange={(e)=>setPoolForm(p=>({...p,token:e.target.value}))} 
                  placeholder="0x..." 
                  required 
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-cash-stack me-1"></i>
                  Token Amount
                </label>
                <input 
                  type="number" 
                  step="0.000000000000000001" 
                  className="form-control" 
                  value={poolForm.tokenAmount} 
                  onChange={(e)=>setPoolForm(p=>({...p,tokenAmount:e.target.value}))} 
                  placeholder="1000.0" 
                  required 
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-wallet2 me-1"></i>
                  STATE Amount
                </label>
                <input 
                  type="number" 
                  step="0.000000000000000001" 
                  className="form-control" 
                  value={poolForm.stateAmount} 
                  onChange={(e)=>setPoolForm(p=>({...p,stateAmount:e.target.value}))} 
                  placeholder="5000.0" 
                  required 
                />
              </div>
              <div className="col-md-3">
                <button 
                  className="btn btn-success w-100 btn-lg" 
                  type="submit"
                  disabled={!canManage || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"/>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-droplet-fill me-2"></i>
                      Create Pool
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Tokens List with Add Liquidity Actions */}
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">
            <i className="bi bi-list-ul me-2"></i>
            DEPLOYED TOKENS & LIQUIDITY MANAGEMENT
          </h6>
          <button 
            className="btn btn-sm btn-outline-secondary" 
            onClick={refreshTokens}
            disabled={!AuctionContract}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Refresh
          </button>
        </div>
        <div className="card-body">
          {tokens.length === 0 ? (
            <div className="text-center py-5">
              <div style={{fontSize: '3rem', opacity: 0.3}} className="mb-3">🪙</div>
              <h6 className="text-muted">No tokens deployed yet</h6>
              <p className="small text-muted mb-0">Deploy your first token using the form above</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th className="text-uppercase small">#</th>
                    <th className="text-uppercase small">Token Address</th>
                    <th className="text-uppercase small">Pool Address</th>
                    <th className="text-uppercase small">Pool Status</th>
                    <th className="text-uppercase small text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t, idx) => (
                    <tr key={t.token}>
                      <td className="fw-bold">{idx+1}</td>
                      <td>
                        <code className="small">{t.token.slice(0, 6)}...{t.token.slice(-4)}</code>
                      </td>
                      <td>
                        {t.pair && t.pair !== ethers.ZeroAddress ? (
                          <code className="small text-success">{t.pair.slice(0, 6)}...{t.pair.slice(-4)}</code>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                      <td>
                        {t.pair && t.pair !== ethers.ZeroAddress ? (
                          <span className="badge bg-success">
                            <i className="bi bi-check-circle-fill me-1"></i>
                            Pool Created
                          </span>
                        ) : (
                          <span className="badge bg-warning text-dark">
                            <i className="bi bi-exclamation-triangle-fill me-1"></i>
                            No Pool
                          </span>
                        )}
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-center">
                          <button 
                            className="btn btn-sm btn-outline-primary" 
                            onClick={()=>copy(t.token)}
                            title="Copy token address"
                          >
                            <i className="bi bi-clipboard"></i>
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-secondary" 
                            onClick={()=>addToMetaMask(t.token)}
                            title="Add to MetaMask"
                          >
                            <i className="bi bi-wallet2"></i>
                          </button>
                          {t.pair && t.pair !== ethers.ZeroAddress && canAddLiquidity && (
                            <button 
                              className="btn btn-sm btn-info" 
                              onClick={()=>openLiquidityModal(t)}
                              title="Add more liquidity"
                            >
                              <i className="bi bi-plus-circle-fill me-1"></i>
                              Add Liquidity
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Liquidity Management Modal */}
      {showModal && selectedToken && (
        <div 
          className="modal show d-block" 
          style={{backgroundColor: 'rgba(0,0,0,0.5)'}}
          onClick={closeModal}
        >
          <div 
            className="modal-dialog modal-lg modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header bg-info bg-opacity-10">
                <h5 className="modal-title">
                  <i className="bi bi-plus-circle-fill me-2"></i>
                  Add Liquidity to Pool
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={closeModal}
                  disabled={loading}
                ></button>
              </div>
              
              <div className="modal-body">
                {/* Token Info */}
                <div className="alert alert-info mb-4">
                  <div className="row">
                    <div className="col-md-6">
                      <strong>Token Address:</strong><br/>
                      <code className="small">{selectedToken.token}</code>
                    </div>
                    <div className="col-md-6">
                      <strong>Pool Address:</strong><br/>
                      <code className="small text-success">{selectedToken.pair}</code>
                    </div>
                  </div>
                </div>

                {/* Allowance Check Section */}
                <div className="card mb-4">
                  <div className="card-header bg-warning bg-opacity-10">
                    <h6 className="mb-0">
                      <i className="bi bi-shield-check me-2"></i>
                      Step 1: Verify Vault Allowances
                    </h6>
                  </div>
                  <div className="card-body">
                    {modalAllowanceStatus.checking ? (
                      <div className="text-center py-3">
                        <div className="spinner-border text-primary" role="status">
                          <span className="visually-hidden">Checking...</span>
                        </div>
                        <p className="mt-2 mb-0 text-muted">Checking allowances...</p>
                      </div>
                    ) : (
                      <div className="row g-3">
                        <div className="col-md-6">
                          <div className={`card ${modalAllowanceStatus.token ? 'border-success' : 'border-danger'}`} style={{borderWidth: '2px'}}>
                            <div className="card-body">
                              <h6 className="mb-2">
                                <i className="bi bi-coin me-2"></i>
                                Token Allowance
                              </h6>
                              {modalAllowanceStatus.token ? (
                                <span className="badge bg-success w-100 py-2">
                                  <i className="bi bi-check-circle-fill me-1"></i>
                                  Approved
                                </span>
                              ) : (
                                <button 
                                  className="btn btn-danger w-100"
                                  onClick={() => setupModalAllowance(selectedToken.token, false)}
                                  disabled={loading}
                                >
                                  {loading ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-2"/>
                                      Setting...
                                    </>
                                  ) : (
                                    <>
                                      <i className="bi bi-key-fill me-2"></i>
                                      Setup Allowance
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        <div className="col-md-6">
                          <div className={`card ${modalAllowanceStatus.state ? 'border-success' : 'border-danger'}`} style={{borderWidth: '2px'}}>
                            <div className="card-body">
                              <h6 className="mb-2">
                                <i className="bi bi-wallet2 me-2"></i>
                                STATE Allowance
                              </h6>
                              {modalAllowanceStatus.state ? (
                                <span className="badge bg-success w-100 py-2">
                                  <i className="bi bi-check-circle-fill me-1"></i>
                                  Approved
                                </span>
                              ) : (
                                <button 
                                  className="btn btn-danger w-100"
                                  onClick={() => setupModalAllowance(stateTokenAddress, true)}
                                  disabled={loading || !stateTokenAddress}
                                >
                                  {loading ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-2"/>
                                      Setting...
                                    </>
                                  ) : (
                                    <>
                                      <i className="bi bi-key-fill me-2"></i>
                                      Setup Allowance
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    <button 
                      className="btn btn-outline-primary w-100 mt-3"
                      onClick={() => checkModalAllowances(selectedToken.token)}
                      disabled={modalAllowanceStatus.checking || loading}
                    >
                      <i className="bi bi-arrow-clockwise me-2"></i>
                      Refresh Allowance Status
                    </button>
                  </div>
                </div>

                {/* Add Liquidity Form */}
                <div className="card">
                  <div className="card-header bg-success bg-opacity-10">
                    <h6 className="mb-0">
                      <i className="bi bi-droplet-fill me-2"></i>
                      Step 2: Add Liquidity Amounts
                    </h6>
                  </div>
                  <div className="card-body">
                    <form onSubmit={addLiquidityFromModal}>
                      <div className="row g-3 mb-3">
                        <div className="col-md-6">
                          <label className="form-label fw-bold">
                            <i className="bi bi-coin me-1"></i>
                            Token Amount
                          </label>
                          <input 
                            type="number" 
                            step="0.000000000000000001"
                            className="form-control form-control-lg" 
                            value={modalLiquidityForm.tokenAmount}
                            onChange={(e) => setModalLiquidityForm(p => ({...p, tokenAmount: e.target.value}))}
                            placeholder="1000.0"
                            required
                            disabled={!modalAllowanceStatus.token || !modalAllowanceStatus.state}
                          />
                          <small className="text-muted">From SWAP vault</small>
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold">
                            <i className="bi bi-wallet2 me-1"></i>
                            STATE Amount
                          </label>
                          <input 
                            type="number" 
                            step="0.000000000000000001"
                            className="form-control form-control-lg" 
                            value={modalLiquidityForm.stateAmount}
                            onChange={(e) => setModalLiquidityForm(p => ({...p, stateAmount: e.target.value}))}
                            placeholder="5000.0"
                            required
                            disabled={!modalAllowanceStatus.token || !modalAllowanceStatus.state}
                          />
                          <small className="text-muted">From SWAP vault</small>
                        </div>
                      </div>

                      {!modalAllowanceStatus.token || !modalAllowanceStatus.state ? (
                        <div className="alert alert-warning mb-0">
                          <i className="bi bi-exclamation-triangle-fill me-2"></i>
                          Please setup both allowances above before adding liquidity
                        </div>
                      ) : (
                        <button 
                          type="submit"
                          className="btn btn-success btn-lg w-100"
                          disabled={loading}
                        >
                          {loading ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2"/>
                              Adding Liquidity...
                            </>
                          ) : (
                            <>
                              <i className="bi bi-plus-circle-fill me-2"></i>
                              Add Liquidity to Pool
                            </>
                          )}
                        </button>
                      )}
                    </form>
                  </div>
                </div>

                <div className="alert alert-info mt-3 mb-0">
                  <i className="bi bi-info-circle-fill me-2"></i>
                  <strong>Note:</strong> LP tokens will be automatically burned. Unused tokens return to SWAP vault.
                </div>
              </div>
              
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={closeModal}
                  disabled={loading}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Information Panel */}
      <div className="card mt-4">
        <div className="card-header bg-primary bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-info-circle-fill me-2"></i>
            TOKEN DEPLOYMENT GUIDE
          </h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>1️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Deploy Token</h6>
                  <p className="small text-muted mb-0">Create a new ERC20 token that will be used in auctions. The token is automatically registered for auctions.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>2️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Create Liquidity Pool</h6>
                  <p className="small text-muted mb-0">Add initial liquidity to PulseX DEX by creating a Token/STATE trading pair for price discovery.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>3️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Add More Liquidity (Optional)</h6>
                  <p className="small text-muted mb-0">Governance can add more liquidity to existing pools anytime. Funds come from SWAP vault and LP tokens are burned.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>4️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Automatic Registration</h6>
                  <p className="small text-muted mb-0">Deployed tokens are automatically added to the auction rotation schedule.</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>5️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Setup Vault Allowances</h6>
                  <p className="small text-muted mb-0">Before adding liquidity, ensure LiquidityManager has approval from SWAP vault via setVaultAllowance().</p>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="d-flex gap-3">
                <div className="text-primary" style={{fontSize: '1.5rem'}}>6️⃣</div>
                <div>
                  <h6 className="small fw-bold mb-1">Start Auctions</h6>
                  <p className="small text-muted mb-0">Once pools are created, proceed to Step 5 (Auction Control) to activate the auction system.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}