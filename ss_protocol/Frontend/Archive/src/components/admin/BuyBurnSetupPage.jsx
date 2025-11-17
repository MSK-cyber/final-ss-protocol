import React, { useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { notifyError, notifySuccess } from "../../Constants/Constants";
import { getRuntimeConfigSync } from "../../Constants/RuntimeConfig";

export default function BuyBurnSetupPage() {
  const { BuyAndBurnController, AuctionContract } = useContractContext();
  const [activeStep, setActiveStep] = useState(2);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [poolStatus, setPoolStatus] = useState({
    poolAddress: null,
    vaultPoolAddress: null,
    plsBalance: null,
    wplsBalance: null,
    stateBalance: null,
    stateReserve: null,
    wplsReserve: null,
    burnedLP: null,
    lpTotalSupply: null,
    stateSymbol: 'STATE',
    wplsSymbol: 'WPLS',
    stateDecimals: 18,
    wplsDecimals: 18,
  });
  const [lastUpdated, setLastUpdated] = useState(null);

  // Step 2: Setup SWAP vault allowance on controller (governance-only)
  const [allowanceAmount, setAllowanceAmount] = useState("");

  // Step 3: Create Buy & Burn Pool (STATE from SWAP vault, WPLS from governance)
  const [poolData, setPoolData] = useState({
    stateAmount: "",
    wplsAmount: "",
    plsToWrap: "", // optional msg.value to wrap inside controller
  });

  const explorerBase = getRuntimeConfigSync()?.network?.explorerUrl || "https://scan.pulsechain.com";
  const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : "");
  const formatCompact = (num, maxFractionDigits = 2) => {
    if (num === null || num === undefined || Number.isNaN(num)) return '—';
    try {
      return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: maxFractionDigits }).format(num);
    } catch {
      return Number(num).toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
    }
  };
  const fmtUnits = (v, decimals = 18, maxFractionDigits = 6) => {
    try {
      const n = Number(ethers.formatUnits(v ?? 0n, decimals));
      return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
    } catch {
      return '—';
    }
  };
  const copy = async (text, label = 'Copied!') => {
    try { await navigator.clipboard.writeText(text); notifySuccess(label); }
    catch { notifyError('Copy failed'); }
  };
  const txToast = (label, hash) => {
    const url = `${explorerBase}/tx/${hash}`;
    toast.success(
      <span>
        {label}
        {hash ? (
          <>
            <br />
            <a href={url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "underline" }}>
              View on explorer
            </a>
          </>
        ) : null}
      </span>,
      { duration: 7000 }
    );
  };

  const fetchPoolStatus = async () => {
    if (!BuyAndBurnController) return;
    setStatusLoading(true);
    try {
      // Read controller status (includes pool address and reserves if set)
      const s = await BuyAndBurnController.getControllerStatus();
      // s: [plsBalance, wplsBalance, stateBalance, poolAddress, poolStateReserve, poolWplsReserve]
      const poolAddress = s?.[3];
      const stateReserve = s?.[4];
      const wplsReserve = s?.[5];
      const plsBalance = s?.[0];
      const wplsBalance = s?.[1];
      const stateBalance = s?.[2];

      // Resolve DAV Vault STATE pool (STATE/WPLS pair as shown in DAV Vault)
        // DAV Vault STATE/WPLS pool should always track the Buy & Burn controller's pool
        // i.e., the "STATE coin pool" = buy-and-burn pool.
        // Use controller poolAddress as the single source of truth for the vault's STATE pool.
        let vaultPoolAddress = poolAddress || ethers.ZeroAddress;
        // Optional fallback (kept for resilience): if controller not configured yet, attempt factory lookup
        if ((!vaultPoolAddress || vaultPoolAddress === ethers.ZeroAddress) && AuctionContract && cfg?.addresses?.state) {
          try {
            const stateAddr = cfg.addresses.state;
            vaultPoolAddress = await AuctionContract.getPairAddress(stateAddr).catch(() => ethers.ZeroAddress);
          } catch {}
        }

      let stateDecimals = 18, wplsDecimals = 18, stateSymbol = 'STATE', wplsSymbol = 'WPLS';
      try {
        const cfg = getRuntimeConfigSync();
        const stateAddr = cfg?.contracts?.core?.STATE_V3?.address;
        const wplsAddr = cfg?.dex?.baseToken?.address;
        const ercMetaAbi = [
          'function symbol() view returns (string)',
          'function decimals() view returns (uint8)'
        ];
        const runner = BuyAndBurnController.runner || BuyAndBurnController.provider;
        if (stateAddr) {
          const t = new ethers.Contract(stateAddr, ercMetaAbi, runner);
          try { stateSymbol = await t.symbol(); } catch {}
          try { stateDecimals = Number(await t.decimals()); } catch {}
        }
        if (wplsAddr) {
          const t = new ethers.Contract(wplsAddr, ercMetaAbi, runner);
          try { wplsSymbol = await t.symbol(); } catch {}
          try { wplsDecimals = Number(await t.decimals()); } catch {}
        }
      } catch {}

      let burnedLP = null, lpTotalSupply = null;
      if (poolAddress && poolAddress !== ethers.ZeroAddress) {
        try {
          const lpAbi = [
            'function balanceOf(address) view returns (uint256)',
            'function totalSupply() view returns (uint256)'
          ];
          const runner = BuyAndBurnController.runner || BuyAndBurnController.provider;
          const lp = new ethers.Contract(poolAddress, lpAbi, runner);
          const DEAD = '0x000000000000000000000000000000000000dEaD';
          burnedLP = await lp.balanceOf(DEAD);
          lpTotalSupply = await lp.totalSupply();
        } catch (e) {
          // Non-fatal
        }
      }

      setPoolStatus({
        poolAddress,
        vaultPoolAddress,
        plsBalance,
        wplsBalance,
        stateBalance,
        stateReserve,
        wplsReserve,
        burnedLP,
        lpTotalSupply,
        stateSymbol,
        wplsSymbol,
        stateDecimals,
        wplsDecimals,
      });
      setLastUpdated(new Date());
    } catch (e) {
      // log and keep old status
      console.debug('fetchPoolStatus failed:', e?.message || e);
    } finally {
      setStatusLoading(false);
    }
  };

  // Governance Action: Link controller pool to DAV Vault STATE pool
  const handleLinkToVaultPool = async () => {
    try {
      const targetPool = poolStatus?.vaultPoolAddress;
      if (!targetPool || targetPool === ethers.ZeroAddress) {
        return notifyError('DAV Vault STATE pool not found');
      }
      if (!BuyAndBurnController) return notifyError('Controller not available');
      setLoading(true);
      const tx = await BuyAndBurnController.setStateWplsPool(targetPool);
      txToast('Linked controller to DAV Vault STATE/WPLS pool', tx.hash);
      await tx.wait();
      notifySuccess('Controller pool updated');
      fetchPoolStatus();
    } catch (err) {
      console.error(err);
      notifyError(err?.reason || err?.shortMessage || err?.message || 'Failed to link pool');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickSendPLS = async () => {
    try {
      const ctrlAddr = BuyAndBurnController?.target || (await BuyAndBurnController?.getAddress?.());
      if (!ctrlAddr) { notifyError('Controller address unavailable'); return; }
      const amount = prompt('Enter PLS amount to send to controller');
      if (!amount) return;
      let wei;
      try { wei = ethers.parseEther(amount); if (wei <= 0n) throw new Error(''); } catch { notifyError('Invalid amount'); return; }
      const runner = BuyAndBurnController?.runner;
      if (!runner || typeof runner.sendTransaction !== 'function') { notifyError('Wallet not connected to send PLS'); return; }
      const tx = await runner.sendTransaction({ to: ctrlAddr, value: wei });
      txToast('Send PLS submitted', tx.hash);
      await tx.wait();
      notifySuccess('PLS sent to controller');
      fetchPoolStatus();
    } catch (err) {
      notifyError(err?.reason || err?.shortMessage || err?.message || 'Failed to send PLS');
    }
  };

  React.useEffect(() => {
    fetchPoolStatus();
    const id = setInterval(fetchPoolStatus, 15000);
    return () => clearInterval(id);
  }, [BuyAndBurnController]);

  const handleSetupAllowance = async (e) => {
    e.preventDefault();
    if (!BuyAndBurnController) return notifyError("BuyAndBurnController not available");
    let amountWei;
    try {
      amountWei = ethers.parseEther(allowanceAmount || "0");
      if (amountWei <= 0n) throw new Error("Amount must be > 0");
    } catch {
      return notifyError("Invalid allowance amount");
    }

    setLoading(true);
    try {
      const tx = await BuyAndBurnController.setupSwapVaultAllowance(amountWei);
      console.log("Allowance tx:", tx.hash);
      txToast("Allowance transaction submitted", tx.hash);
      await tx.wait();
      notifySuccess("Swap vault allowance set on controller");
      setActiveStep(3);
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Failed to set allowance");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePool = async (e) => {
    e.preventDefault();
  if (!BuyAndBurnController) return notifyError("BuyAndBurnController not available");

    let stateWei, wplsWei, plsWei;
    try {
      stateWei = ethers.parseEther(poolData.stateAmount || "0");
      wplsWei = ethers.parseEther(poolData.wplsAmount || "0");
      plsWei = ethers.parseEther(poolData.plsToWrap || "0");
      if (stateWei <= 0n || (wplsWei <= 0n && plsWei <= 0n)) {
        return notifyError("Provide STATE amount and either WPLS or PLS to wrap");
      }
    } catch {
      return notifyError("Invalid amount format");
    }

    setLoading(true);
    try {
      const tx = await BuyAndBurnController.createPoolOneClick(stateWei, wplsWei, {
        value: plsWei,
      });
      console.log("Create pool tx:", tx.hash);
      txToast("Pool creation submitted", tx.hash);
      await tx.wait();
      notifySuccess("STATE/WPLS pool created • Initial LP burned");
      fetchPoolStatus();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Failed to create pool");
    } finally {
      setLoading(false);
    }
  };

  // Governance Action: Convert any PLS held by controller to WPLS
  const handleConvertPLSToWPLS = async () => {
    if (!BuyAndBurnController) return notifyError("BuyAndBurnController not available");
    setLoading(true);
    try {
      const tx = await BuyAndBurnController.convertPLSToWPLS();
      console.log("Convert PLS->WPLS tx:", tx.hash);
      txToast("Convert PLS → WPLS submitted", tx.hash);
      await tx.wait();
      notifySuccess("Converted all available PLS to WPLS");
      fetchPoolStatus();
    } catch (err) {
      console.error(err);
      notifyError(err.message || "Failed to convert PLS to WPLS");
    } finally {
      setLoading(false);
    }
  };

  // Governance Action: Execute optimal buy & burn
  const handleExecuteBuyAndBurn = async () => {
    if (!BuyAndBurnController) return notifyError("BuyAndBurnController not available");
    setLoading(true);
    try {
      // Check controller balances to choose the best path
      let plsBal = 0n, wplsBal = 0n;
      try {
        const s = await BuyAndBurnController.getControllerStatus();
        plsBal = BigInt(s?.[0] ?? 0);
        wplsBal = BigInt(s?.[1] ?? 0);
      } catch {}

      let tx;
      if (plsBal > 0n) {
        // Convert PLS -> WPLS and then execute in one call
        tx = await BuyAndBurnController.executeFullBuyAndBurn();
        console.log("Execute Full Buy & Burn tx:", tx.hash);
        txToast("Full Buy & Burn submitted", tx.hash);
      } else if (wplsBal > 0n) {
        // Already have WPLS, go straight to buy & burn
        tx = await BuyAndBurnController.executeBuyAndBurn();
        console.log("Execute Buy & Burn tx:", tx.hash);
        txToast("Buy & Burn submitted", tx.hash);
      } else {
        notifyError("Controller has no funds. Send PLS to the controller and/or click Convert PLS → WPLS, or transfer WPLS directly to the controller.");
        return;
      }

      await tx.wait();
      notifySuccess("Buy & Burn executed successfully");
      fetchPoolStatus();
    } catch (err) {
      console.error(err);
      notifyError(err.reason || err.shortMessage || err.message || "Failed to execute Buy & Burn");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">💰 Buy & Burn</h5>
        <small className="text-muted">Create the STATE/WPLS pool, then execute Buy & Burn</small>
      </div>
      <div className="card-body">
        {poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress && (
        <div className="mb-4 p-3 border rounded bg-dark text-white">
          <div className="d-flex flex-wrap justify-content-between align-items-center mb-3">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-water text-info" />
              <strong>STATE / WPLS Pool</strong>
              {(() => {
                const aligned = poolStatus?.vaultPoolAddress && poolStatus?.poolAddress && (poolStatus.vaultPoolAddress.toLowerCase() === poolStatus.poolAddress.toLowerCase());
                if (aligned) return <span className="badge bg-success">Aligned with DAV Vault</span>;
                if (poolStatus?.vaultPoolAddress && poolStatus.vaultPoolAddress !== ethers.ZeroAddress) {
                  return <span className="badge bg-warning text-dark">Mismatch with DAV Vault</span>;
                }
                return <span className="badge bg-secondary">Detected</span>;
              })()}
            </div>
            <div className="d-flex align-items-center gap-2">
              {lastUpdated && (
                <small className="text-muted">Updated {lastUpdated.toLocaleTimeString()}</small>
              )}
              <button
                type="button"
                className="btn btn-sm btn-outline-light"
                onClick={fetchPoolStatus}
                disabled={statusLoading}
                title="Refresh"
              >
                {statusLoading ? (
                  <><span className="spinner-border spinner-border-sm me-2" />Refreshing…</>
                ) : (
                  <><i className="bi bi-arrow-clockwise me-1" /> Refresh</>
                )}
              </button>
            </div>
          </div>

          {/* Alignment with DAV Vault pool */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                <div className="small text-white mb-1">Controller Pool Address</div>
                <div className="d-flex align-items-center gap-2">
                  <a
                    href={`${explorerBase}/address/${poolStatus.poolAddress}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-info"
                  >
                    {short(poolStatus.poolAddress)}
                  </a>
                  <button type="button" className="btn btn-sm btn-outline-light" onClick={() => copy(poolStatus.poolAddress, 'Controller pool copied')}>
                    <i className="bi bi-files" />
                  </button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                <div className="small text-white mb-1">DAV Vault STATE/WPLS Pool</div>
                <div className="d-flex align-items-center gap-2">
                  {poolStatus?.vaultPoolAddress && poolStatus.vaultPoolAddress !== ethers.ZeroAddress ? (
                    <>
                      <a
                        href={`${explorerBase}/address/${poolStatus.vaultPoolAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info"
                      >
                        {short(poolStatus.vaultPoolAddress)}
                      </a>
                      <button type="button" className="btn btn-sm btn-outline-light" onClick={() => copy(poolStatus.vaultPoolAddress, 'DAV Vault pool copied')}>
                        <i className="bi bi-files" />
                      </button>
                    </>
                  ) : (
                    <span className="text-muted">— not found —</span>
                  )}
                </div>
                {poolStatus?.vaultPoolAddress && poolStatus?.poolAddress && poolStatus.vaultPoolAddress.toLowerCase() !== poolStatus.poolAddress.toLowerCase() && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn btn-sm btn-warning text-dark"
                      onClick={handleLinkToVaultPool}
                      disabled={loading}
                      title="Link controller pool to DAV Vault"
                    >
                      {loading ? (<><span className="spinner-border spinner-border-sm me-2"/>Linking…</>) : (<>Use DAV Vault Pool</>)}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controller Wallet */}
          <div className="row g-3 mb-3">
            <div className="col-md-6">
              <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                <div className="small text-white mb-1">Controller Wallet</div>
                <div className="d-flex align-items-center gap-2">
                  {(() => {
                    const ctrlAddr = BuyAndBurnController?.target || BuyAndBurnController?.getAddress?.() || '';
                    return (
                      <>
                        <a
                          href={`${explorerBase}/address/${ctrlAddr}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-info"
                        >
                          {short(ctrlAddr)}
                        </a>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-light"
                          onClick={() => copy(ctrlAddr, 'Controller address copied')}
                          title="Copy address"
                        >
                          <i className="bi bi-files" />
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-info"
                          onClick={handleQuickSendPLS}
                          title="Send PLS to controller"
                        >
                          <i className="bi bi-currency-exchange me-1" /> Send PLS…
                        </button>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                <div className="small text-white mb-1">Controller Balances</div>
                <div className="d-flex flex-wrap gap-3">
                  <div>
                    <div className="small text-muted">PLS</div>
                    <div className="fw-semibold">{fmtUnits(poolStatus.plsBalance, 18, 6)}</div>
                  </div>
                  <div>
                    <div className="small text-muted">{poolStatus.wplsSymbol}</div>
                    <div className="fw-semibold">{fmtUnits(poolStatus.wplsBalance, poolStatus.wplsDecimals, 6)}</div>
                  </div>
                  <div>
                    <div className="small text-muted">{poolStatus.stateSymbol}</div>
                    <div className="fw-semibold">{fmtUnits(poolStatus.stateBalance, poolStatus.stateDecimals, 6)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress ? (
            <>
              {/* Top row: Ratio emphasis */}
              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                    <div className="small text-white mb-1">Current Ratio</div>
                    {(() => {
                      const state = poolStatus.stateReserve ? Number(ethers.formatUnits(poolStatus.stateReserve, poolStatus.stateDecimals)) : 0;
                      const wpls = poolStatus.wplsReserve ? Number(ethers.formatUnits(poolStatus.wplsReserve, poolStatus.wplsDecimals)) : 0;
                      if (state > 0 && wpls > 0) {
                        const wplsPerState = wpls / state;
                        const statePerWpls = state / wpls;
                        return (
                          <>
                            <h5 className="mb-1">1 {poolStatus.stateSymbol} = <span className="text-info">{wplsPerState.toFixed(6)}</span> {poolStatus.wplsSymbol}</h5>
                            <div className="text-white">1 {poolStatus.wplsSymbol} = {statePerWpls.toFixed(6)} {poolStatus.stateSymbol}</div>
                          </>
                        );
                      }
                      return <span className="text-muted">—</span>;
                    })()}
                  </div>
                </div>
                <div className="col-md-6">
                  <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                    <div className="small text-white mb-1">Pool Address</div>
                    <div className="d-flex align-items-center gap-2">
                      <a
                        href={`${explorerBase}/address/${poolStatus.poolAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info"
                      >
                        {short(poolStatus.poolAddress)}
                      </a>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-light"
                        onClick={() => copy(poolStatus.poolAddress, 'Pool address copied')}
                        title="Copy address"
                      >
                        <i className="bi bi-files" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* KPI row: Reserves and Burned LP */}
              <div className="row g-3">
                <div className="col-md-4">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">{poolStatus.stateSymbol} Reserve</div>
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-coin text-warning" />
                      <span className="fw-semibold">{fmtUnits(poolStatus.stateReserve, poolStatus.stateDecimals, 6)}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">{poolStatus.wplsSymbol} Reserve</div>
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-droplet text-info" />
                      <span className="fw-semibold">{fmtUnits(poolStatus.wplsReserve, poolStatus.wplsDecimals, 6)}</span>
                    </div>
                  </div>
                </div>
                <div className="col-md-4">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">Burned LP</div>
                    {(() => {
                      if (poolStatus.burnedLP == null) return <span className="text-muted">—</span>;
                      const burned = Number(ethers.formatEther(poolStatus.burnedLP));
                      const total = poolStatus.lpTotalSupply ? Number(ethers.formatEther(poolStatus.lpTotalSupply)) : 0;
                      const pct = total > 0 ? (burned / total) * 100 : 0;
                      return (
                        <>
                          <div className="d-flex align-items-center gap-2">
                            <i className="bi bi-fire text-danger" />
                            <span className="fw-semibold">{formatCompact(burned, 4)}</span>
                            <span className="badge bg-danger bg-opacity-75">{pct.toFixed(2)}%</span>
                          </div>
                          <div className="progress mt-2" style={{ height: 6 }}>
                            <div className="progress-bar bg-danger" role="progressbar" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-muted d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-circle" /> No pool detected yet
            </div>
          )}
  </div>
  )}
        {/* Before pool exists: show ONLY Create Pool UI */}
        {!(poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress) && (
          <form onSubmit={handleCreatePool}>
            <h6 className="text-primary mb-3">🏊 Create Buy & Burn Pool</h6>
            <div className="row g-3">
              <div className="col-md-4">
                <label className="form-label">STATE Amount (from SWAP vault)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.stateAmount}
                  onChange={(e) => setPoolData((p) => ({ ...p, stateAmount: e.target.value }))}
                  placeholder="5000.0"
                  required
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">WPLS Amount (from governance)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.wplsAmount}
                  onChange={(e) => setPoolData((p) => ({ ...p, wplsAmount: e.target.value }))}
                  placeholder="1000.0"
                />
                <small className="text-muted">Optional if sending PLS to wrap below</small>
              </div>
              <div className="col-md-4">
                <label className="form-label">PLS to Wrap (msg.value)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.plsToWrap}
                  onChange={(e) => setPoolData((p) => ({ ...p, plsToWrap: e.target.value }))}
                  placeholder="1000.0"
                />
                <small className="text-muted">Optional: controller wraps PLS into WPLS</small>
              </div>
            </div>
            <div className="mt-4">
              <button type="submit" className="btn btn-success" disabled={loading}>
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Creating Pool...
                  </>
                ) : (
                  "Create Buy & Burn Pool"
                )}
              </button>
            </div>
          </form>
        )}

        {/* After pool exists: show action buttons */}
        {(poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress) && (
          <div className="row g-2">
            <div className="col-md-6">
              <button
                type="button"
                className="btn w-100 btn-outline-warning"
                onClick={handleConvertPLSToWPLS}
                disabled={loading || !(poolStatus?.plsBalance && BigInt(poolStatus.plsBalance) > 0n)}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Converting PLS to WPLS...
                  </>
                ) : (
                  <>
                    Convert PLS → WPLS
                    {!(poolStatus?.plsBalance && BigInt(poolStatus.plsBalance) > 0n) && (
                      <span className="ms-2 badge bg-secondary">Needs PLS</span>
                    )}
                  </>
                )}
              </button>
            </div>
            <div className="col-md-6">
              <button
                type="button"
                className="btn w-100 btn-outline-danger"
                onClick={handleExecuteBuyAndBurn}
                disabled={loading || !((poolStatus?.plsBalance && BigInt(poolStatus.plsBalance) > 0n) || (poolStatus?.wplsBalance && BigInt(poolStatus.wplsBalance) > 0n))}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Executing Buy & Burn...
                  </>
                ) : (
                  "Execute Buy & Burn"
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}