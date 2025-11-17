import React, { useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { notifyError, notifySuccess } from "../../Constants/Constants";
import { TokensDetails } from "../../data/TokensDetails";
import { formatWithCommas } from "../../Constants/Utils";
import { getRuntimeConfigSync } from "../../Constants/RuntimeConfig";

export default function BuyBurnSetupPage() {
  const { BuyAndBurnController, AuctionContract } = useContractContext();
  const { getStateTokenBalanceAndSave } = useSwapContract();
  const [activeStep, setActiveStep] = useState(2);
  const [loading, setLoading] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [sendingPls, setSendingPls] = useState(false);
  // Optional PLS amount to use in executeFullBuyAndBurn (defaults to using full PLS balance)
  const [plsToUse, setPlsToUse] = useState("");
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
  // Controller Wallet: send PLS inline input
  const [sendPlsAmount, setSendPlsAmount] = useState("");
  // DAV Vault integration (reuse existing logic from DetailsInfo)
  const { tokens: tokensForDav } = TokensDetails();
  const stateTokenRow = React.useMemo(() => {
    try { return (tokensForDav || []).find(t => t?.tokenName === 'STATE') || null; } catch { return null; }
  }, [tokensForDav]);
  const savedStateTokenBalance = React.useMemo(() => {
    try {
      const saved = localStorage.getItem("stateTokenBalance");
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return parsed?.balance ?? null;
    } catch { return null; }
  }, []);
  const stateOutValue = React.useMemo(() => {
    try {
      if (savedStateTokenBalance == null) return null;
      const current = Number(stateTokenRow?.DavVault ?? 0);
      const saved = Number(savedStateTokenBalance);
      if (!Number.isFinite(current) || !Number.isFinite(saved)) return null;
      return saved - current; // same as DetailsInfo second value
    } catch { return null; }
  }, [savedStateTokenBalance, stateTokenRow]);

  // Step 2: Setup SWAP vault allowance on controller (governance-only)
  const [allowanceAmount, setAllowanceAmount] = useState("");

  // Step 3: Create Buy & Burn Pool (STATE from SWAP vault, WPLS from governance)
  const [poolData, setPoolData] = useState({
    stateAmount: "1000000", // prefill STATE
    wplsAmount: "", // keep for integration, hidden in UI
    plsToWrap: "10000", // prefill PLS to wrap
  });

  // Add more liquidity (post-initialization)
  const [addData, setAddData] = useState({
    stateAmount: "",
    wplsAmount: "",
    plsToWrap: "", // optional msg.value to wrap inside controller
  });

  // Ratio helpers: compute matching amount using current pool ratio
  const hasValidReserves = React.useMemo(() => {
    try {
      return (
        poolStatus?.stateReserve && poolStatus?.wplsReserve &&
        BigInt(poolStatus.stateReserve) > 0n && BigInt(poolStatus.wplsReserve) > 0n
      );
    } catch { return false; }
  }, [poolStatus?.stateReserve, poolStatus?.wplsReserve]);

  const statePerWplsRatio = React.useMemo(() => {
    if (!hasValidReserves) return null;
    const state = Number(ethers.formatUnits(poolStatus.stateReserve, poolStatus.stateDecimals || 18));
    const wpls = Number(ethers.formatUnits(poolStatus.wplsReserve, poolStatus.wplsDecimals || 18));
    if (!isFinite(state) || !isFinite(wpls) || state <= 0 || wpls <= 0) return null;
    return {
      wplsPerState: wpls / state,
      statePerWpls: state / wpls,
    };
  }, [hasValidReserves, poolStatus?.stateReserve, poolStatus?.wplsReserve, poolStatus?.stateDecimals, poolStatus?.wplsDecimals]);

  const setByRatio_StateToWPLS = () => {
    if (!statePerWplsRatio) return;
    const base = parseFloat(addData.stateAmount || "0");
    if (!base || base <= 0) return;
    const needWpls = base * statePerWplsRatio.wplsPerState;
    if (!isFinite(needWpls)) return;
    // Since the UI no longer has a WPLS input, set the PLS-to-wrap field instead (1:1 with WPLS)
    setAddData((p) => ({ ...p, plsToWrap: needWpls.toFixed(6) }));
  };

  const setByRatio_WPLSToSTATE = () => {
    if (!statePerWplsRatio) return;
    const base = parseFloat(addData.wplsAmount || "0");
    if (!base || base <= 0) return;
    const needState = base * statePerWplsRatio.statePerWpls;
    if (!isFinite(needState)) return;
    setAddData((p) => ({ ...p, stateAmount: needState.toFixed(6) }));
  };

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

  // Minimal ERC20 ABI for allowance/approve
  const ERC20_MIN_ABI = [
    'function allowance(address owner, address spender) view returns (uint256)',
    'function approve(address spender, uint256 amount) returns (bool)',
    'function balanceOf(address) view returns (uint256)'
  ];

  const fetchPoolStatus = async () => {
    if (!BuyAndBurnController) return;
    setStatusLoading(true);
    try {
      const cfg = getRuntimeConfigSync();
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
        // cfg already resolved above
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
      const amount = (sendPlsAmount || "").trim();
      if (!amount) { notifyError('Enter PLS amount to send'); return; }
      let wei;
      try { wei = ethers.parseEther(amount); if (wei <= 0n) throw new Error(''); } catch { notifyError('Invalid amount'); return; }
      const runner = BuyAndBurnController?.runner;
      if (!runner || typeof runner.sendTransaction !== 'function') { notifyError('Wallet not connected to send PLS'); return; }
      setSendingPls(true);
      const tx = await runner.sendTransaction({ to: ctrlAddr, value: wei });
      txToast('Send PLS submitted', tx.hash);
      await tx.wait();
      notifySuccess('PLS sent to controller');
      setSendPlsAmount("");
      fetchPoolStatus();
    } catch (err) {
      notifyError(err?.reason || err?.shortMessage || err?.message || 'Failed to send PLS');
    } finally {
      setSendingPls(false);
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

  const handleAddMoreLiquidity = async (e) => {
    e.preventDefault();
    if (!BuyAndBurnController) return notifyError("BuyAndBurnController not available");

    let stateWei, wplsWei, plsWei;
    try {
      stateWei = ethers.parseEther(addData.stateAmount || "0");
      wplsWei = ethers.parseEther(addData.wplsAmount || "0");
      plsWei = ethers.parseEther(addData.plsToWrap || "0");
      if (stateWei <= 0n || (wplsWei <= 0n && plsWei <= 0n)) {
        return notifyError("Provide STATE amount and either WPLS or PLS to wrap");
      }
    } catch {
      return notifyError("Invalid amount format");
    }

    // Preflight: ensure pool exists
    if (!poolStatus?.poolAddress || poolStatus.poolAddress === ethers.ZeroAddress) {
      return notifyError("Pool not initialized. Create the pool first.");
    }

    // Preflight: if WPLS provided, ensure allowance is sufficient
    try {
      if (wplsWei > 0n) {
        const cfg = getRuntimeConfigSync();
        const wplsAddr = cfg?.dex?.baseToken?.address;
        const ctrlAddr = BuyAndBurnController?.target || (await BuyAndBurnController?.getAddress?.());
        const runner = BuyAndBurnController?.runner;
        if (!wplsAddr || !ctrlAddr || !runner) throw new Error('WPLS/controller not resolved');
        const user = await runner.getAddress?.();
        const wpls = new ethers.Contract(wplsAddr, ERC20_MIN_ABI, runner);
        const allowance = await wpls.allowance(user, ctrlAddr);
        if (BigInt(allowance) < wplsWei) {
          return notifyError("Approve WPLS to the controller before adding liquidity");
        }
        const bal = await wpls.balanceOf(user);
        if (BigInt(bal) < wplsWei) {
          return notifyError("Insufficient WPLS balance in wallet");
        }
      }
    } catch {
      // Non-fatal; proceed and let on-chain checks handle, but user will likely need approval
    }

    setLoading(true);
    try {
      const tx = await BuyAndBurnController.addMoreLiquidity(stateWei, wplsWei, { value: plsWei });
      console.log("Add liquidity tx:", tx.hash);
      txToast("Add Liquidity submitted", tx.hash);
      await tx.wait();
      notifySuccess("Liquidity added • LP burned");
      setAddData({ stateAmount: "", wplsAmount: "", plsToWrap: "" });
      fetchPoolStatus();
    } catch (err) {
      console.error(err);
      notifyError(err?.message || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const handleApproveWPLS = async () => {
    try {
      const cfg = getRuntimeConfigSync();
      const wplsAddr = cfg?.dex?.baseToken?.address;
      const ctrlAddr = BuyAndBurnController?.target || (await BuyAndBurnController?.getAddress?.());
      const runner = BuyAndBurnController?.runner;
      if (!wplsAddr || !ctrlAddr || !runner) return notifyError('Unable to resolve WPLS/controller');
      const wpls = new ethers.Contract(wplsAddr, ERC20_MIN_ABI, runner);
      const max = ethers.MaxUint256;
      const tx = await wpls.approve(ctrlAddr, max);
      txToast('Approve WPLS submitted', tx.hash);
      await tx.wait();
      notifySuccess('WPLS approved for controller');
    } catch (err) {
      notifyError(err?.message || 'Approval failed');
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
        // Convert specified PLS amount -> WPLS and execute in one call
        // If user provided an amount, prefer that; otherwise use full available PLS
        let amountWei = plsBal;
        if ((plsToUse ?? "").trim().length > 0) {
          try {
            const entered = ethers.parseEther(plsToUse.trim());
            if (entered <= 0n) {
              setLoading(false);
              return notifyError("PLS amount must be greater than 0");
            }
            if (entered > plsBal) {
              return notifyError("Entered PLS exceeds controller balance");
            }
            amountWei = entered;
          } catch {
            setLoading(false);
            return notifyError("Invalid PLS amount format");
          }
        }
        tx = await BuyAndBurnController.executeFullBuyAndBurn(amountWei);
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
          {/* Removed: Controller Pool Address and DAV Vault STATE/WPLS Pool UI per request */}

          {/* Top summary: Controller Balances (left) and Pool Address (right) */}
          <div className="row g-3 mb-3">
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
            <div className="col-md-6">
              <div className="p-3 rounded bg-secondary bg-opacity-25 h-100">
                <div className="small text-white mb-1">Pool Address</div>
                <div className="d-flex align-items-center gap-2">
                  {poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress ? (
                    <>
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
                    </>
                  ) : (
                    <span className="text-muted">Not created</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress ? (
            <>
              {/* Controller Wallet moved to bottom as a separate section */}

              {/* KPI row: Reserves, Burned LP, and STATE Out (from DAV Vault) */}
              <div className="row g-3">
                <div className="col-md-3">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">{poolStatus.stateSymbol} Reserve</div>
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-coin text-warning" />
                      <span className="fw-semibold">{fmtUnits(poolStatus.stateReserve, poolStatus.stateDecimals, 6)}</span>
                    </div>
                    {statePerWplsRatio && (
                      <div className="small text-muted mt-1">
                        1 {poolStatus.stateSymbol} ≈ {statePerWplsRatio.wplsPerState.toFixed(6)} {poolStatus.wplsSymbol}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">{poolStatus.wplsSymbol} Reserve</div>
                    <div className="d-flex align-items-center gap-2">
                      <i className="bi bi-droplet text-info" />
                      <span className="fw-semibold">{fmtUnits(poolStatus.wplsReserve, poolStatus.wplsDecimals, 6)}</span>
                    </div>
                    {statePerWplsRatio && (
                      <div className="small text-muted mt-1">
                        1 {poolStatus.wplsSymbol} ≈ {statePerWplsRatio.statePerWpls.toFixed(6)} {poolStatus.stateSymbol}
                      </div>
                    )}
                  </div>
                </div>
                <div className="col-md-3">
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
                <div className="col-md-3">
                  <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                    <div className="small text-white mb-1">STATE Out</div>
                    <div className="d-flex align-items-center gap-2 w-100">
                      <i className="bi bi-arrow-up-right-circle text-warning" />
                      <span className="fw-semibold" style={{ color: "#ff4081" }}>
                        {stateOutValue == null ? '—' : formatWithCommas(stateOutValue)}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary ms-auto"
                        onClick={async () => { try { await getStateTokenBalanceAndSave(); notifySuccess('STATE snapshot updated'); } catch {} }}
                        title="Refresh cached STATE balance"
                      >
                        <i className="bi bi-arrow-clockwise" />
                      </button>
                    </div>
                    {/* Using same integration pattern as DetailsInfo: savedStateTokenBalance - DavVault */}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-muted d-flex align-items-center gap-2">
              <i className="bi bi-exclamation-circle" /> No pool detected yet
            </div>
          )}
        {/* Before pool exists: show ONLY Create Pool UI */}
        {!(poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress) && (
          <form onSubmit={handleCreatePool}>
            <h6 className="text-primary mb-3">🏊 Create Buy & Burn Pool</h6>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">STATE Amount (from SWAP vault)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.stateAmount}
                  onChange={(e) => setPoolData((p) => ({ ...p, stateAmount: e.target.value }))}
                  placeholder="100000"
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">PLS to Wrap (msg.value)</label>
                <input
                  type="number"
                  step="0.000000000000000001"
                  className="form-control"
                  value={poolData.plsToWrap}
                  onChange={(e) => setPoolData((p) => ({ ...p, plsToWrap: e.target.value }))}
                  placeholder="1000"
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

        {/* After pool exists: show (1) Execute Buy & Burn, then (2) Add More Liquidity - styled like Token page cards */}
        {(poolStatus?.poolAddress && poolStatus.poolAddress !== ethers.ZeroAddress) && (
          <>
            {/* Execute Buy & Burn Card */}
            <div className="card mb-4">
              <div className="card-header bg-primary bg-opacity-10">
                <h6 className="mb-0">
                  <i className="bi bi-fire me-2"></i>
                  EXECUTE BUY & BURN
                </h6>
              </div>
              <div className="card-body">
                <div className="row g-3 align-items-center">
                  <div className="col-md-9">
                    <label className="form-label small fw-bold text-uppercase">PLS to Use</label>
                    <input
                      type="number"
                      step="0.000000000000000001"
                      className="form-control"
                      placeholder="e.g. 250.0"
                      value={plsToUse}
                      onChange={(e) => setPlsToUse(e.target.value)}
                      title="Enter the PLS amount to use"
                    />
                    <small className="text-muted">Required: enter the PLS amount to use</small>
                  </div>
                  <div className="col-md-3 d-flex align-items-center">
                    <button
                      type="button"
                      className="btn btn-primary w-100 btn-lg"
                      onClick={handleExecuteBuyAndBurn}
                      disabled={loading || !((poolStatus?.plsBalance && BigInt(poolStatus.plsBalance) > 0n) || (poolStatus?.wplsBalance && BigInt(poolStatus.wplsBalance) > 0n))}
                    >
                      {loading ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" />
                          Executing...
                        </>
                      ) : (
                        <>
                          <i className="bi bi-lightning-charge-fill me-2"></i>
                          Execute Buy & Burn
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Add More Liquidity Card */}
            <div className="card">
              <div className="card-header bg-primary bg-opacity-10">
                <h6 className="mb-0">
                  <i className="bi bi-droplet-fill me-2"></i>
                  ADD MORE LIQUIDITY
                </h6>
              </div>
              <div className="card-body">
                <form onSubmit={handleAddMoreLiquidity}>
                  <div className="row g-3 align-items-end">
                    <div className="col-md-5">
                      <label className="form-label small fw-bold">STATE Amount (from SWAP vault)</label>
                      <input
                        type="number"
                        step="0.000000000000000001"
                        className="form-control form-control-sm"
                        value={addData.stateAmount}
                        onChange={(e) => setAddData((p) => ({ ...p, stateAmount: e.target.value }))}
                        placeholder="0"
                        required
                      />
                    </div>
                    <div className="col-md-4">
                      <label className="form-label small fw-bold">PLS to Wrap (msg.value)</label>
                      <input
                        type="number"
                        step="0.000000000000000001"
                        className="form-control form-control-sm"
                        value={addData.plsToWrap}
                        onChange={(e) => setAddData((p) => ({ ...p, plsToWrap: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                    <div className="col-md-3 d-grid">
                      <button type="submit" className="btn btn-primary btn-lg w-100" disabled={loading}>
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-plus-circle-fill me-2"></i>
                            Add Liquidity
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="d-flex align-items-center gap-2 mt-3 flex-wrap">
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={setByRatio_StateToWPLS}
                      disabled={loading || !hasValidReserves || !(parseFloat(addData.stateAmount||'0')>0)}
                      title="Calculate PLS (to wrap) needed for given STATE using current pool ratio"
                    >
                      Use Pool Ratio: STATE → PLS
                    </button>
                    {!hasValidReserves && (
                      <small className="text-muted">
                        Pool ratio unavailable yet — ensure pool exists and reserves loaded.
                      </small>
                    )}
                  </div>

                  <div className="mt-2 small text-muted">
                    Notes: STATE is pulled from SWAP vault (allowance must be set). WPLS is pulled from your wallet if provided. Any PLS sent will be wrapped into WPLS automatically. LP tokens are burned on receipt.
                  </div>
                </form>
              </div>
            </div>
          </>
        )}

                {/* Controller Wallet (separate section at end) */}
                <div className="card mt-4">
                  <div className="card-header bg-primary bg-opacity-10">
                    <h6 className="mb-0">
                      <i className="bi bi-person-badge me-2"></i>
                      CONTROLLER WALLET
                    </h6>
                  </div>
                  <div className="card-body">
                    <div className="row g-3 align-items-stretch">
                      <div className="col-md-6">
                        <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                          <div className="small text-white mb-1">Controller Address</div>
                          {(() => {
                            const ctrlAddr = BuyAndBurnController?.target || '';
                            if (!ctrlAddr) return <span className="text-muted">Controller not available</span>;
                            return (
                              <div className="input-group input-group-sm">
                                <input
                                  type="text"
                                  className="form-control"
                                  value={ctrlAddr}
                                  readOnly
                                  onFocus={(e) => e.target.select()}
                                />
                                <button
                                  type="button"
                                  className="btn btn-outline-light"
                                  onClick={() => copy(ctrlAddr, 'Controller address copied')}
                                  title="Copy address"
                                >
                                  <i className="bi bi-files" />
                                </button>
                              </div>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="col-md-6">
                        <div className="p-3 rounded bg-secondary bg-opacity-10 h-100">
                          <div className="small text-white mb-1">Send PLS to Controller</div>
                          <div className="input-group input-group-sm">
                            <input
                              type="number"
                              step="0.000000000000000001"
                              inputMode="decimal"
                              className="form-control"
                              placeholder="Enter amount (PLS)"
                              value={sendPlsAmount}
                              onChange={(e) => setSendPlsAmount(e.target.value)}
                              min="0"
                            />
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={handleQuickSendPLS}
                              disabled={sendingPls || !(sendPlsAmount && Number(sendPlsAmount) > 0)}
                              title="Send PLS to controller"
                            >
                              {sendingPls ? (
                                <>
                                  <span className="spinner-border spinner-border-sm me-2" />
                                  Sending...
                                </>
                              ) : (
                                <>
                                  <i className="bi bi-currency-exchange me-1" /> Send PLS
                                </>
                              )}
                            </button>
                          </div>
                          <small className="text-muted">Transfers PLS from your wallet to the controller contract</small>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
    </div>
  );
}