import React, { useState, useEffect, useContext, useCallback } from "react";
import { ethers } from "ethers";
import toast from "react-hot-toast";
import { ContractContext } from "../../Functions/ContractInitialize";
import AuctionAdminABI from "../../ABI/AuctionAdmin.json";
import AuctionSwapABI from "../../ABI/AuctionSwap.fixed.json";
import AirdropDistributorABI from "../../ABI/AirdropDistributor.json";
import DavTokenABI from "../../ABI/DavToken.json";

export default function GovernancePage() {
  const { provider, signer, contracts, AllContracts } = useContext(ContractContext);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [statusNote, setStatusNote] = useState("");
  
  // Development Fee Wallets State
  const [feeWallets, setFeeWallets] = useState([]);
  const [newWalletAddress, setNewWalletAddress] = useState("");
  const [editingWallet, setEditingWallet] = useState(null);
  const [editPercentage, setEditPercentage] = useState("");
  const [auctionAdminAddr, setAuctionAdminAddr] = useState(null);

  // Fetch development fee wallets
  const refreshFeeWallets = async () => {
    try {
  const AuctionContract = contracts?.auction || AllContracts?.AuctionContract;
      if (!AuctionContract) return;

      // Resolve AuctionAdmin address from available sources
      let adminAddr = null;
      try {
        if (typeof AuctionContract.auctionAdmin === "function") {
          adminAddr = await AuctionContract.auctionAdmin();
        }
      } catch (e) {
        // ignore and try fallbacks
      }

      // Fallback 1: Read from DAV token's public variable (kept in sync during init)
      if ((!adminAddr || adminAddr === ethers.ZeroAddress) && contracts?.dav) {
        try {
          if (typeof contracts.dav.auctionAdmin === "function") {
            adminAddr = await contracts.dav.auctionAdmin();
          }
        } catch (e) {
          // ignore
        }
      }

      // Fallback 2: Minimal ABI read from DAV address if method not on full ABI
      if ((!adminAddr || adminAddr === ethers.ZeroAddress) && provider && contracts?.addresses?.dav) {
        try {
          const davMinimal = new ethers.Contract(
            contracts.addresses.dav,
            ["function auctionAdmin() view returns (address)"],
            provider
          );
          adminAddr = await davMinimal.auctionAdmin();
        } catch (e) {
          // ignore
        }
      }

      // Fallback 3: Use configured address from ContractInitialize (static config)
      if ((!adminAddr || adminAddr === ethers.ZeroAddress) && AllContracts?.auctionAdmin?.target) {
        adminAddr = AllContracts.auctionAdmin.target;
      }

      if (!adminAddr || adminAddr === ethers.ZeroAddress) {
        console.warn("AuctionAdmin not found via ABI; ensure ABI includes auctionAdmin() or DAV is initialized.");
        setAuctionAdminAddr(null);
        setFeeWallets([]);
        setStatusNote("AuctionAdmin not set on Auction contract yet.");
        return;
      }

      setAuctionAdminAddr(adminAddr);

      if (!adminAddr || adminAddr === ethers.ZeroAddress) {
        console.log("AuctionAdmin not set");
        setFeeWallets([]);
        return;
      }

  if (!provider) return;
  const AdminContract = new ethers.Contract(adminAddr, AuctionAdminABI, provider);

    const [wallets, percentages, activeStatuses] = await AdminContract.getDevelopmentFeeWalletsInfo();
      
      const formatted = wallets.map((wallet, i) => ({
        address: wallet,
        percentage: Number(percentages[i]),
        active: activeStatuses[i]
      })).filter(w => w.active);

      setFeeWallets(formatted);
      setStatusNote("");
    } catch (err) {
      console.error("Failed to fetch fee wallets:", err);
      const msg = toFriendlyError(err, "Failed to load development wallets");
      setStatusNote(msg);
    }
  };

  useEffect(() => {
    refreshFeeWallets();
  }, [provider, contracts, refreshKey]);

  // Add new development fee wallet
  const addFeeWallet = async () => {
    if (!newWalletAddress) {
      return alert("Please enter a wallet address");
    }

    if (!ethers.isAddress(newWalletAddress)) {
      return alert("Invalid wallet address");
    }

    setLoading(true);
    try {
      if (!signer || !auctionAdminAddr) {
        throw new Error("AuctionAdmin not initialized");
      }

      // Preflight: ensure caller is governance (matches onlyGovernance on contract)
      const governance = await readAdminGovernance(provider, auctionAdminAddr);
      const caller = await signer.getAddress();
      if (governance && governance.toLowerCase() !== caller.toLowerCase()) {
        throw new Error("Only protocol governance can modify development wallets.");
      }

      const AdminContract = new ethers.Contract(auctionAdminAddr, AuctionAdminABI, signer);

      const tx = await AdminContract.addDevelopmentFeeWallet(newWalletAddress);
      toast.success(`Transaction sent: ${tx.hash}`, { duration: 3000 });
      
      await tx.wait();
      toast.success("✅ Development wallet added successfully!", { duration: 5000 });
      
      setNewWalletAddress("");
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error("Add wallet error:", err);
      const friendly = toFriendlyError(err, "Failed to add wallet");
      toast.error(friendly, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  // Remove development fee wallet
  const removeFeeWallet = async (walletAddr) => {
    const confirmed = window.confirm(
      `Remove development wallet?\n\n${walletAddr}\n\nPercentages will auto-rebalance among remaining wallets.`
    );
    if (!confirmed) return;

    setLoading(true);
    try {
  if (!signer) throw new Error("No signer available");
  // Preflight: ensure caller is governance (matches onlyGovernance on contract)
  const governance = await readAdminGovernance(provider, auctionAdminAddr);
  const caller = await signer.getAddress();
  if (governance && governance.toLowerCase() !== caller.toLowerCase()) {
    throw new Error("Only protocol governance can modify development wallets.");
  }

  const AdminContract = new ethers.Contract(auctionAdminAddr, AuctionAdminABI, signer);

      const tx = await AdminContract.removeDevelopmentFeeWallet(walletAddr);
      toast.success(`Transaction sent: ${tx.hash}`, { duration: 3000 });
      
      await tx.wait();
      toast.success("✅ Development wallet removed!", { duration: 5000 });
      
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error("Remove wallet error:", err);
      const friendly = toFriendlyError(err, "Failed to remove wallet");
      toast.error(friendly, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  // Update wallet percentage
  const updateWalletPercentage = async (walletAddr) => {
    const newPct = parseInt(editPercentage);
    
    if (isNaN(newPct) || newPct < 0 || newPct > 100) {
      return alert("Percentage must be between 0 and 100");
    }

    setLoading(true);
    try {
  if (!signer) throw new Error("No signer available");
  // Preflight: ensure caller is governance (matches onlyGovernance on contract)
  const governance = await readAdminGovernance(provider, auctionAdminAddr);
  const caller = await signer.getAddress();
  if (governance && governance.toLowerCase() !== caller.toLowerCase()) {
    throw new Error("Only protocol governance can modify development wallets.");
  }

  const AdminContract = new ethers.Contract(auctionAdminAddr, AuctionAdminABI, signer);

      const tx = await AdminContract.updateDevelopmentFeeWalletPercentage(walletAddr, newPct);
      toast.success(`Transaction sent: ${tx.hash}`, { duration: 3000 });
      
      await tx.wait();
      toast.success("✅ Percentage updated!", { duration: 5000 });
      
      setEditingWallet(null);
      setEditPercentage("");
      setRefreshKey(k => k + 1);
    } catch (err) {
      console.error("Update percentage error:", err);
      const friendly = toFriendlyError(err, "Failed to update percentage");
      toast.error(friendly, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  // Helpers
  const toFriendlyError = (err, fallback) => {
    const msg = err?.shortMessage || err?.message || "";
    if (typeof msg === "string") {
      const lower = msg.toLowerCase();
      if (lower.includes("missing revert data") || lower.includes("execution reverted")) {
        return "Transaction reverted. Possible causes: you are not protocol governance, the AuctionAdmin address is wrong or not set, or your wallet is on the wrong network.";
      }
      if ((lower.includes("only") && lower.includes("governance")) || lower.includes("unauthorized")) {
        return "Only protocol governance can perform this action.";
      }
    }
    return fallback || "Operation failed";
  };

  const readAdminOwner = async (provider, addr) => {
    if (!provider || !addr) return null;
    try {
      // Try provided ABI first; if it lacks owner(), fall back to minimal ABI
      let contract = new ethers.Contract(addr, AuctionAdminABI, provider);
      if (typeof contract.owner !== "function") {
        contract = new ethers.Contract(addr, ["function owner() view returns (address)"], provider);
      }
      const owner = await contract.owner();
      return owner;
    } catch {
      return null;
    }
  };

  const readAdminGovernance = async (provider, addr) => {
    if (!provider || !addr) return null;
    try {
      let contract = new ethers.Contract(addr, AuctionAdminABI, provider);
      if (typeof contract.governance !== "function") {
        contract = new ethers.Contract(addr, ["function governance() view returns (address)"], provider);
      }
      const gov = await contract.governance();
      return gov;
    } catch {
      return null;
    }
  };

  const totalPercentage = feeWallets.reduce((sum, w) => sum + w.percentage, 0);

  // ===================== Pause / Unpause Controls =====================
  const [pauseStatus, setPauseStatus] = useState({ auction: null, dav: null });
  const [pauseLoading, setPauseLoading] = useState({ auction: false, dav: false });
  // Reclaim Unclaimed Rewards (DAV)
  const [reclaimInfo, setReclaimInfo] = useState({ canReclaim: null, daysRemaining: null, totalUnclaimed: null });
  const [reclaimLoading, setReclaimLoading] = useState(false);
  // Fallback minimal interface (used only if imported ABI missing pause symbols)
  const PAUSABLE_MIN_ABI = [
    "function paused() view returns (bool)",
    "function pause()",
    "function unpause()"
  ];

  const resolveContract = useCallback((key) => {
    // Try full instances first
    try {
      if (key === 'auction') return contracts?.auction || AllContracts?.AuctionContract || null;
      if (key === 'airdrop') return AllContracts?.airdropDistributor || contracts?.airdropDistributor || null;
      if (key === 'dav') return contracts?.dav || AllContracts?.DavContract || AllContracts?.dav || null;
    } catch {}
    return null;
  }, [contracts, AllContracts]);

  const resolveAddress = useCallback((key) => {
    const c = resolveContract(key);
    if (!c) return null;
    try { return c.target || c.getAddress?.() || c.address || null; } catch { return null; }
  }, [resolveContract]);

  const fetchDavReclaimInfo = useCallback(async () => {
    try {
      const addr = resolveAddress('dav');
      if (!addr || !provider) return setReclaimInfo({ canReclaim: null, daysRemaining: null, totalUnclaimed: null });
      const dav = new ethers.Contract(addr, DavTokenABI, provider);
      if (typeof dav.getReclaimInfo !== 'function') {
        // Minimal ABI fallback (in case ABI not updated)
        const minimal = new ethers.Contract(addr, [
          'function getReclaimInfo() view returns (bool,uint256,uint256)'
        ], provider);
        const [canReclaim, daysRemaining, totalUnclaimed] = await minimal.getReclaimInfo();
        setReclaimInfo({ canReclaim, daysRemaining, totalUnclaimed });
      } else {
        const { 0: canReclaim, 1: daysRemaining, 2: totalUnclaimed } = await dav.getReclaimInfo();
        setReclaimInfo({ canReclaim, daysRemaining, totalUnclaimed });
      }
    } catch (e) {
      // If it fails, keep previous state but avoid spamming logs
      // console.warn('getReclaimInfo failed:', e?.message || e);
    }
  }, [provider, resolveAddress]);

  const fetchPauseStatus = useCallback(async () => {
    const next = {};
    for (const key of ['auction','dav']) {
      const inst = resolveContract(key);
      const addr = resolveAddress(key);
      if (!inst && !addr) { next[key] = null; continue; }
      let contractToRead = inst;
      if (!contractToRead || typeof contractToRead.paused !== 'function') {
        if (addr && provider) {
          const abi = key === 'auction' ? AuctionSwapABI : key === 'airdrop' ? AirdropDistributorABI : DavTokenABI;
          const hasPaused = Array.isArray(abi) && abi.some(f => typeof f === 'object' ? f.name === 'paused' : /paused\(/.test(f));
          contractToRead = new ethers.Contract(addr, hasPaused ? abi : PAUSABLE_MIN_ABI, provider);
        }
      }
      try {
        next[key] = await contractToRead.paused();
      } catch (e) {
        // Avoid console spam if repeatedly failing
        if (pauseStatus[key] !== null) console.warn(`Paused read failed for ${key}:`, e?.message || e);
        next[key] = null;
      }
    }
    setPauseStatus(prev => {
      // Prevent unnecessary re-renders causing visual blinking
      try {
        if (JSON.stringify(prev) === JSON.stringify(next)) return prev;
      } catch {}
      return next;
    });
  }, [resolveContract, resolveAddress, provider, pauseStatus]);

  useEffect(() => {
    fetchPauseStatus();
    fetchDavReclaimInfo();
  // Intentionally exclude pauseStatus to avoid loop; refresh only on env changes or manual trigger
  }, [fetchPauseStatus, fetchDavReclaimInfo, refreshKey, provider, signer]);

  const doPauseAction = async (key, action) => {
    const addr = resolveAddress(key);
    const base = resolveContract(key);
    if (!addr) return toast.error(`${key} contract address not found`);
    if (!signer) return toast.error("Signer not available");
    setPauseLoading(l => ({ ...l, [key]: true }));
    try {
      // Force-send the transaction by encoding function data and providing a gasLimit
      // This bypasses gas estimation and any client-side preflight
      let iface;
      try {
        // Prefer full ABI if available to ensure correct selector
        const abi = key === 'auction' ? AuctionSwapABI : key === 'airdrop' ? AirdropDistributorABI : DavTokenABI;
        const methodExists = Array.isArray(abi) && abi.some(f => (typeof f === 'object' ? f.name === action : new RegExp(`^function\\s+${action}\\s*\\(`).test(f)));
        iface = new ethers.Interface(methodExists ? abi : [`function ${action}()`]);
      } catch {
        // Minimal fallback interface
        iface = new ethers.Interface([`function ${action}()`]);
      }
      const data = iface.encodeFunctionData(action, []);
      const tx = await signer.sendTransaction({ to: addr, data, gasLimit: 300000n });
      toast.success(`${action} tx sent: ${tx.hash}`);
      await tx.wait();
      toast.success(`${key} ${action}d successfully`);
      await fetchPauseStatus();
    } catch (e) {
      const reason = e?.reason || e?.errorName || e?.shortMessage || e?.message || '';
      // Show raw error without client-side interpretation/gating
      toast.error(reason || 'Action failed');
    } finally {
      setPauseLoading(l => ({ ...l, [key]: false }));
    }
  };

  const PauseCard = ({ title, description, keyName }) => {
    const status = pauseStatus[keyName];
    const loading = pauseLoading[keyName];
    const address = resolveAddress(keyName);
    return (
      <div className="row align-items-center py-3 border-bottom" style={{margin:0}}>
        <div className="col-lg-5 col-md-6 mb-2 mb-md-0">
          <div className="d-flex flex-column">
            <strong className="text-uppercase small" style={{letterSpacing:'0.5px'}}>{title}</strong>
            <small className="text-muted">{description}</small>
            {address && (
              <code className="mt-1 small" style={{opacity:0.8}}>{address}</code>
            )}
          </div>
        </div>
        <div className="col-lg-2 col-md-3 mb-2 mb-md-0 text-md-center">
          <span className={`badge rounded-pill ${status === null ? 'bg-secondary' : status ? 'bg-danger' : 'bg-success'}`}
                style={{fontSize:'0.7rem', padding:'6px 10px'}}>
            {status === null ? 'Unknown' : status ? 'Paused' : 'Active'}
          </span>
        </div>
        <div className="col-lg-5 col-md-3 text-md-end">
          <div className="d-flex flex-wrap justify-content-end gap-2">
            <button
              className="btn btn-primary btn-sm"
              disabled={loading}
              onClick={() => doPauseAction(keyName, 'pause')}
              style={{minWidth:'130px'}}
            >
              {loading && status !== true ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Pausing...
                </>
              ) : (
                <>⏸ Pause</>
              )}
            </button>
            <button
              className="btn btn-primary btn-sm"
              disabled={loading}
              onClick={() => doPauseAction(keyName, 'unpause')}
              style={{minWidth:'130px'}}
            >
              {loading && status !== false ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2"></span>
                  Unpausing...
                </>
              ) : (
                <>▶ Unpause</>
              )}
            </button>
          </div>
          <div className="text-start text-md-end mt-2">
            <small className="text-muted d-block">
              {keyName === 'auction' && 'Affects airdrop, burn & swap flows'}
              {keyName === 'airdrop' && 'Affects Step 1 claim only'}
              {keyName === 'dav' && 'Affects minting & rewards'}
            </small>
          </div>
        </div>
      </div>
    );
  };

  // ===================== Governance Transfer (Timelocked) =====================
  const [govLoading, setGovLoading] = useState({ propose: false, confirm: false, cancel: false });
  const [govInput, setGovInput] = useState("");
  const [govInfo, setGovInfo] = useState({ adminGov: null, swapGov: null, pendingNew: null, executeAfter: null, isReady: null, timeLeftSec: null });
  const [govCountdown, setGovCountdown] = useState(null);

  const getAdminRead = useCallback(() => {
    if (!auctionAdminAddr || !provider) return null;
    return new ethers.Contract(auctionAdminAddr, AuctionAdminABI, provider);
  }, [auctionAdminAddr, provider]);

  const getAdminWrite = useCallback(() => {
    if (!auctionAdminAddr || !signer) return null;
    return new ethers.Contract(auctionAdminAddr, AuctionAdminABI, signer);
  }, [auctionAdminAddr, signer]);

  const fetchGovernanceInfo = useCallback(async () => {
    try {
      const admin = getAdminRead();
      const auction = resolveContract('auction');
      let adminGov = null;
      let swapGov = null;
      let pendingNew = null;
      let executeAfter = null;
      let isReady = null;

      if (admin) {
        try { adminGov = await admin.governance(); } catch {}
        try {
          const res = await admin.getPendingGovernance();
          // res may be object or array depending on ABI load
          pendingNew = res?.newGovernance ?? res?.[0] ?? null;
          executeAfter = res?.executeAfter ?? res?.[1] ?? null;
          isReady = res?.isReady ?? res?.[2] ?? null;
        } catch {}
      }
      if (auction) {
        try {
          // Prefer full ABI function name if present; fallback minimal if necessary
          if (typeof auction.governanceAddress === 'function') {
            swapGov = await auction.governanceAddress();
          } else {
            const addr = resolveAddress('auction');
            if (addr && provider) {
              const minimal = new ethers.Contract(addr, [ 'function governanceAddress() view returns (address)' ], provider);
              swapGov = await minimal.governanceAddress();
            }
          }
        } catch {}
      }

      let timeLeftSec = null;
      if (executeAfter) {
        try {
          const now = Math.floor(Date.now() / 1000);
          const ea = Number(executeAfter);
          timeLeftSec = ea > now ? ea - now : 0;
        } catch {
          timeLeftSec = null;
        }
      }

      setGovInfo({ adminGov, swapGov, pendingNew, executeAfter, isReady, timeLeftSec });
    } catch (e) {
      // swallow for UI
    }
  }, [getAdminRead, resolveContract, resolveAddress, provider]);

  useEffect(() => {
    fetchGovernanceInfo();
  }, [fetchGovernanceInfo, refreshKey, provider, signer, auctionAdminAddr]);

  // Auto-refresh countdown every second based on executeAfter
  useEffect(() => {
    if (!govInfo?.executeAfter) {
      setGovCountdown(null);
      return;
    }
    const tick = () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const ea = Number(govInfo.executeAfter);
        const left = ea > now ? ea - now : 0;
        setGovCountdown(left);
      } catch {
        setGovCountdown(null);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [govInfo?.executeAfter]);

  const proposeGovernance = async () => {
    if (!auctionAdminAddr) return toast.error('AuctionAdmin not found');
    if (!signer) return toast.error('Signer not available');
    if (!govInput || !ethers.isAddress(govInput)) return toast.error('Enter a valid address');
    setGovLoading(s => ({ ...s, propose: true }));
    try {
      const admin = getAdminWrite();
      if (!admin) throw new Error('Admin signer not ready');
      const tx = await admin.proposeProtocolGovernance(govInput);
      toast.success(`Propose tx sent: ${tx.hash}`);
      await tx.wait();
      toast.success('Governance proposal created');
      setGovInput("");
      await fetchGovernanceInfo();
    } catch (e) {
      const reason = e?.reason || e?.errorName || e?.shortMessage || e?.message || '';
      toast.error(reason || 'Propose failed');
    } finally {
      setGovLoading(s => ({ ...s, propose: false }));
    }
  };

  const confirmGovernance = async () => {
    if (!auctionAdminAddr) return toast.error('AuctionAdmin not found');
    if (!signer) return toast.error('Signer not available');
    setGovLoading(s => ({ ...s, confirm: true }));
    try {
      const admin = getAdminWrite();
      const tx = await admin.confirmProtocolGovernance();
      toast.success(`Confirm tx sent: ${tx.hash}`);
      await tx.wait();
      toast.success('Protocol governance transferred');
      await fetchGovernanceInfo();
    } catch (e) {
      const reason = e?.reason || e?.errorName || e?.shortMessage || e?.message || '';
      toast.error(reason || 'Confirm failed');
    } finally {
      setGovLoading(s => ({ ...s, confirm: false }));
    }
  };

  const cancelGovernance = async () => {
    if (!auctionAdminAddr) return toast.error('AuctionAdmin not found');
    if (!signer) return toast.error('Signer not available');
    setGovLoading(s => ({ ...s, cancel: true }));
    try {
      const admin = getAdminWrite();
      const tx = await admin.cancelProtocolGovernanceProposal();
      toast.success(`Cancel tx sent: ${tx.hash}`);
      await tx.wait();
      toast.success('Governance proposal cancelled');
      await fetchGovernanceInfo();
    } catch (e) {
      const reason = e?.reason || e?.errorName || e?.shortMessage || e?.message || '';
      toast.error(reason || 'Cancel failed');
    } finally {
      setGovLoading(s => ({ ...s, cancel: false }));
    }
  };

  const formatCountdown = (secs) => {
    if (secs == null) return '—';
    const s = Math.max(0, Number(secs));
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const r = s % 60;
    if (d > 0) return `${d}d ${h}h ${m}m ${r}s`;
    if (h > 0) return `${h}h ${m}m ${r}s`;
    if (m > 0) return `${m}m ${r}s`;
    return `${r}s`;
  };

  const doReclaimUnclaimed = async () => {
    const addr = resolveAddress('dav');
    if (!addr) return toast.error('DAV contract address not found');
    if (!signer) return toast.error('Signer not available');
    setReclaimLoading(true);
    try {
      const dav = new ethers.Contract(addr, DavTokenABI, signer);
      if (typeof dav.reclaimUnclaimedRewards !== 'function') {
        const minimal = new ethers.Contract(addr, ['function reclaimUnclaimedRewards()'], signer);
        const tx = await minimal.reclaimUnclaimedRewards();
        toast.success(`Reclaim tx sent: ${tx.hash}`);
        await tx.wait();
      } else {
        const tx = await dav.reclaimUnclaimedRewards();
        toast.success(`Reclaim tx sent: ${tx.hash}`);
        await tx.wait();
      }
      toast.success('Unclaimed rewards reclaimed to BuyAndBurnController');
      await fetchDavReclaimInfo();
    } catch (e) {
      const reason = e?.reason || e?.errorName || e?.shortMessage || e?.message || '';
      // Show raw error without client-side interpretation/gating
      toast.error(reason || 'Reclaim failed');
    } finally {
      setReclaimLoading(false);
    }
  };

  return (
    <div>
      {/* Development Fee Wallets Management */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">💰 Development Fee Wallets</h5>
          <small className="text-muted">
            Manage fee distribution for DAV minting (5% PLS) and auction fees (0.5%)
          </small>
        </div>
        <div className="card-body">
          {/* Info Alert */}
          <div className="alert alert-info">
            <h6 className="alert-heading">ℹ️ Fee Distribution System</h6>
            <p className="mb-2">
              Development fee wallets receive:
            </p>
            <ul className="mb-2">
              <li><strong>DAV Minting Fees:</strong> 5% of PLS spent on DAV minting</li>
              <li><strong>Auction Fees:</strong> 0.5% of tokens traded in auctions</li>
            </ul>
            <p className="mb-0">
              <strong>Auto-balancing:</strong> Adding/removing wallets automatically distributes percentages equally.
              Manual override requires total = 100%.
            </p>
          </div>

          {/* Current Wallets */}
          <div className="card mb-3">
            <div className="card-header">
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="mb-1 text-uppercase">Active Fee Wallets ({feeWallets.length}/5)</h6>
                  <div className="subtitle-muted">Manage wallets and allocations</div>
                </div>
                <div className="admin-chip" title="Total allocated percentage">
                  <span className="dot"></span>
                  <span>Total</span>
                  <strong>{totalPercentage}%</strong>
                </div>
              </div>
            </div>
            <div className="card-body">
              {feeWallets.length === 0 ? (
                <p className="text-muted text-center mb-0">No development fee wallets configured</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover mb-0 table-compact">
                    <thead>
                      <tr>
                        <th style={{width: '52%'}}>Wallet Address</th>
                        <th className="text-center" style={{width: '24%'}}>Allocation</th>
                        <th className="text-end" style={{width: '24%'}}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {feeWallets.map((wallet, idx) => (
                        <tr key={wallet.address}>
                          <td>
                            <code className="address-clip">{wallet.address}</code>
                          </td>
                          <td className="text-center">
                            {editingWallet === wallet.address ? (
                              <div className="d-flex align-items-center justify-content-center gap-2">
                                <input
                                  type="number"
                                  className="form-control form-control-sm"
                                  style={{width: '90px'}}
                                  value={editPercentage}
                                  onChange={(e) => setEditPercentage(e.target.value)}
                                  min="0"
                                  max="100"
                                  placeholder="%"
                                />
                                <span>%</span>
                              </div>
                            ) : (
                              <div className="d-flex align-items-center justify-content-center gap-3 percent-bar">
                                <div className="progress" style={{width: '140px', height: '10px'}}>
                                  <div className="progress-bar" style={{width: `${wallet.percentage}%`}} />
                                </div>
                                <div className="small fw-bold" style={{minWidth: '44px'}}>{wallet.percentage}%</div>
                              </div>
                            )}
                          </td>
                          <td className="text-end">
                            {editingWallet === wallet.address ? (
                              <div className="btn-group btn-group-sm">
                                <button
                                  className="btn btn-success"
                                  onClick={() => updateWalletPercentage(wallet.address)}
                                  disabled={loading}
                                >
                                  ✓ Save
                                </button>
                                <button
                                  className="btn btn-secondary"
                                  onClick={() => {
                                    setEditingWallet(null);
                                    setEditPercentage("");
                                  }}
                                  disabled={loading}
                                >
                                  ✕ Cancel
                                </button>
                              </div>
                            ) : (
                              <div className="btn-group btn-group-sm">
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => {
                                    setEditingWallet(wallet.address);
                                    setEditPercentage(wallet.percentage.toString());
                                  }}
                                  disabled={loading}
                                >
                                  ✏️ Edit %
                                </button>
                                <button
                                  className="btn btn-ghost"
                                  onClick={() => removeFeeWallet(wallet.address)}
                                  disabled={loading}
                                >
                                  🗑️ Remove
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Add New Wallet */}
                <div className="card">
            <div className="card-header">
              <h6 className="mb-0">➕ Add New Development Wallet</h6>
            </div>
            <div className="card-body">
                    {statusNote && (
                      <div className="alert alert-warning py-2 mb-3">
                        {statusNote}
                      </div>
                    )}
              <div className="row g-3">
                <div className="col-md-8">
                  <label className="form-label small fw-bold">Wallet Address</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="0x..."
                    value={newWalletAddress}
                    onChange={(e) => setNewWalletAddress(e.target.value)}
                    disabled={loading || feeWallets.length >= 5}
                  />
                  {feeWallets.length >= 5 && (
                    <small className="text-danger">Maximum 5 wallets reached</small>
                  )}
                </div>
                <div className="col-md-4 d-flex align-items-end">
                  <button
                    className="btn btn-primary w-100"
                    onClick={addFeeWallet}
                    disabled={loading || !newWalletAddress || feeWallets.length >= 5}
                  >
                    {loading ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Adding...
                      </>
                    ) : (
                      <>➕ Add Wallet (Auto-rebalance)</>
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <small className="d-block" style={{ color: '#b3b3b3' }}>
                  ✨ <strong className="text-accent">Auto-balancing:</strong> New wallet will be added and all percentages
                  will be automatically distributed equally among all active wallets.
                </small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Governance Transfer section removed per request */}

      {/* Pause/Unpause Controls */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">⏸ System Pause Controls</h5>
          <small className="text-muted">Use for emergency halts.</small>
        </div>
        <div className="card-body p-0">
          <PauseCard
            title="AuctionSwap Contract"
            description="Blocks Whole Auction System and its Operations(All 5 Steps)"
            keyName="auction"
          />
          <PauseCard
            title="DAV Token Contract"
            description="DAV: disables minting and reward claims"
            keyName="dav"
          />
        </div>
      </div>

      {/* Governance Transfer */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">🗳️ Governance Transfer</h5>
          <small className="text-muted">Timelocked protocol-wide governance transfer via AuctionAdmin</small>
        </div>
        <div className="card-body">
          {/* Current Governance section removed per request */}

          {/* Pending Proposal */}
          <div className="card mb-3">
            <div className="card-header d-flex justify-content-between align-items-center">
              <div>
                <h6 className="mb-0 text-uppercase">Pending Proposal</h6>
                <div className="subtitle-muted">Timelock countdown and actions</div>
              </div>
              <span className={`badge rounded-pill ${(govInfo.pendingNew && (govCountdown === 0)) ? 'bg-success' : 'bg-secondary'}`}
                    style={{fontSize:'0.7rem', padding:'6px 10px'}}>
                {govInfo.pendingNew ? ((govCountdown === 0) ? 'Ready' : 'Pending') : 'None'}
              </span>
            </div>
            <div className="card-body">
              {govInfo.pendingNew ? (
                <>
                  <div className="row g-3 align-items-center">
                    <div className="col-md-6">
                      <div className="small text-muted">Proposed Governance</div>
                      <code className="d-block" style={{wordBreak:'break-all'}}>{govInfo.pendingNew}</code>
                    </div>
                    <div className="col-md-3">
                      <div className="small text-muted">Execute After</div>
                      <div>{govInfo.executeAfter ? new Date(Number(govInfo.executeAfter) * 1000).toLocaleString() : '—'}</div>
                    </div>
                    <div className="col-md-3 text-md-end">
                      <div className="small text-muted">Time Remaining</div>
                      <div className="fw-semibold">{formatCountdown(govCountdown)}</div>
                    </div>
                  </div>
                  <div className="d-flex gap-2 mt-3">
                    <button className="btn btn-primary" onClick={confirmGovernance} disabled={govLoading.confirm}>
                      {govLoading.confirm ? (<><span className="spinner-border spinner-border-sm me-2"></span>Confirming...</>) : '✅ Confirm Transfer'}
                    </button>
                    <button className="btn btn-outline-secondary" onClick={cancelGovernance} disabled={govLoading.cancel}>
                      {govLoading.cancel ? (<><span className="spinner-border spinner-border-sm me-2"></span>Cancelling...</>) : '✖ Cancel Proposal'}
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-muted">No pending governance proposal.</div>
              )}
            </div>
          </div>

          {/* Propose New Governance */}
          <div className="card">
            <div className="card-header">
              <h6 className="mb-0">➕ Propose New Governance</h6>
            </div>
            <div className="card-body">
              <div className="row g-3 align-items-end">
                <div className="col-md-8">
                  <label className="form-label small fw-bold">New Governance Address</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="0x..."
                    value={govInput}
                    onChange={(e) => setGovInput(e.target.value)}
                    disabled={govLoading.propose}
                  />
                </div>
                <div className="col-md-4">
                  <button className="btn btn-primary w-100" onClick={proposeGovernance} disabled={govLoading.propose || !govInput}>
                    {govLoading.propose ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2"></span>
                        Proposing...
                      </>
                    ) : (
                      <>Propose (Timelocked)</>
                    )}
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <small className="text-muted">After proposing, wait for the timelock to expire, then confirm to apply across all protocol contracts.</small>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DAV Unclaimed Rewards Reclaim */}
      <div className="card mb-4">
        <div className="card-header">
          <h5 className="card-title mb-1">🏦 Unclaimed Rewards Reclaim (DAV)</h5>
          <small className="text-muted">After 1000 days from auction start, governance can reclaim all unclaimed holder rewards to the BuyAndBurnController.</small>
        </div>
        <div className="card-body">
          <div className="row align-items-center">
            <div className="col-md-6 mb-3 mb-md-0">
              <div className="d-flex flex-column">
                <div className="mb-1">
                  <span className={`badge rounded-pill ${reclaimInfo.canReclaim ? 'bg-success' : reclaimInfo.canReclaim === false ? 'bg-warning' : 'bg-secondary'}`} style={{fontSize:'0.75rem'}}>
                    {reclaimInfo.canReclaim === null ? 'Unknown' : reclaimInfo.canReclaim ? 'Eligible' : 'Not Eligible'}
                  </span>
                </div>
                <small className="text-muted">
                  {reclaimInfo.canReclaim
                    ? 'Reclaim is currently allowed.'
                    : reclaimInfo.daysRemaining != null
                      ? `Days remaining until eligible: ${reclaimInfo.daysRemaining}`
                      : 'Eligibility unknown'}
                </small>
                <small className="mt-1">
                  Total unclaimed: {reclaimInfo.totalUnclaimed != null ? `${ethers.formatEther(reclaimInfo.totalUnclaimed)} PLS` : '—'}
                </small>
              </div>
            </div>
            <div className="col-md-6 text-md-end">
              <button
                className="btn btn-primary"
                onClick={doReclaimUnclaimed}
                disabled={reclaimLoading}
              >
                {reclaimLoading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2"></span>
                    Reclaiming...
                  </>
                ) : (
                  <>Reclaim to BuyAndBurn</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
