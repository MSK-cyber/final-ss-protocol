import { NavLink, Routes, Route, Navigate } from "react-router-dom";
import { useState, lazy, Suspense } from "react";
import { useAccount } from "wagmi";
import { useGovernanceGate } from "./useGovernanceGate";
import "../../Styles/Admin.css";

// Route-based code splitting for Admin pages - 5-Step Deployment Workflow
const SystemInitializationPage = lazy(() => import("./SystemInitializationPage"));
const BuyBurnSetupPage = lazy(() => import("./BuyBurnSetupPage"));
const TokenManagementPage = lazy(() => import("./TokenManagementPage"));
const AuctionControlPage = lazy(() => import("./AuctionControlPage"));
const GovernancePage = lazy(() => import("./GovernancePage"));

export default function AdminLayout() {
  const { isGovernance, governanceAddress, loading } = useGovernanceGate();
  const { address } = useAccount();
  
  const effectiveGov = governanceAddress || '';
  const [overrideIn, setOverrideIn] = useState(effectiveGov);

  if (loading) {
    return (
      <div className="container py-4">
        <div className="card text-center">
          <div className="card-body">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3 mb-0">Loading admin...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isGovernance) {
    return (
      <div className="container py-4">
        <div className="card">
          <div className="card-body">
            <h5 className="card-title text-warning">⚠️ Admin Access Required</h5>
            <p>Connect the governance wallet to access admin functions.</p>
            <div className="mb-3">
              <small className="text-muted">Connected: </small>
              <span className="font-monospace">{address || 'Not connected'}</span>
            </div>
            <div className="mb-3">
              <small className="text-muted">Required: </small>
              <span className="font-monospace">{effectiveGov || 'Unknown'}</span>
            </div>
            <div className="row g-2">
              <div className="col-md-8">
                <input 
                  className="form-control" 
                  placeholder="0x... governance address override" 
                  value={overrideIn} 
                  onChange={e => setOverrideIn(e.target.value)} 
                />
              </div>
              <div className="col-md-4">
                <button 
                  className="btn btn-primary w-100" 
                  onClick={() => { 
                    try { 
                      localStorage.setItem('GOVERNANCE_OVERRIDE', overrideIn); 
                      window.location.reload(); 
                    } catch(e) {
                      console.error('Failed to set override:', e);
                    } 
                  }}
                >
                  Set Override
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 admin-container">
      <div className="card mb-4">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h4 className="mb-1 text-primary">STATE DEX Admin</h4>
              <p className="mb-0 text-muted">5-Step Protocol Deployment Workflow</p>
            </div>
            <div className="text-end">
              <div className="small text-muted">Governance Connected</div>
              <div className="font-monospace small" title={effectiveGov}>
                {effectiveGov ? `${effectiveGov.slice(0,8)}...${effectiveGov.slice(-6)}` : '—'}
              </div>
            </div>
          </div>
        </div>
      </div>

            <div className="card mb-4">
        <div className="card-body">
          <h6 className="text-primary mb-3">📋 Deployment Workflow</h6>
          <div className="row g-2">
            <div className="col-md-12">
              <small className="text-muted d-block mb-2">Follow these steps in order for complete protocol deployment:</small>
            </div>
            <div className="col-md-2">
              <div className="text-center p-2 bg-light rounded">
                <div className="small fw-bold text-primary">🚀 Step 1</div>
                <div className="small">System Setup</div>
              </div>
            </div>
            <div className="col-md-3">
              <div className="text-center p-2 bg-light rounded">
                <div className="small fw-bold text-primary">💰 Steps 2 & 3</div>
                <div className="small">Buy & Burn Setup</div>
              </div>
            </div>
            <div className="col-md-2">
              <div className="text-center p-2 bg-light rounded">
                <div className="small fw-bold text-primary">🪙 Step 4</div>
                <div className="small">Token Deploy</div>
              </div>
            </div>
            <div className="col-md-2">
              <div className="text-center p-2 bg-light rounded">
                <div className="small fw-bold text-primary">🎯 Step 5</div>
                <div className="small">Start Auction</div>
              </div>
            </div>
            <div className="col-md-2">
              <div className="text-center p-2 bg-light rounded">
                <div className="small fw-bold text-primary">👑 Final</div>
                <div className="small">Governance</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-lg-3 mb-4">
          <div className="card">
            <div className="card-body p-0">
              <nav className="nav nav-pills flex-column">
                <NavLink 
                  to="/admin/system-initialization" 
                  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  🚀 Step 1: System Setup
                </NavLink>
                <NavLink 
                  to="/admin/buyburn-setup" 
                  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  💰 Steps 2 & 3: Buy & Burn
                </NavLink>
                <NavLink 
                  to="/admin/token-management" 
                  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  🪙 Step 4: Token Management
                </NavLink>
                <NavLink 
                  to="/admin/auction-control" 
                  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  🎯 Step 5: Auction Control
                </NavLink>
                <NavLink 
                  to="/admin/governance" 
                  className={({isActive}) => `nav-link ${isActive ? 'active' : ''}`}
                >
                  👑 Governance Transfer
                </NavLink>
              </nav>
            </div>
          </div>
        </div>
        <div className="col-lg-9">
          <Suspense fallback={
            <div className="card">
              <div className="card-body text-center">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3 mb-0">Loading deployment step...</p>
              </div>
            </div>
          }>
            <Routes>
              <Route index element={<Navigate to="system-initialization" />} />
              <Route path="system-initialization" element={<SystemInitializationPage />} />
              <Route path="buyburn-setup" element={<BuyBurnSetupPage />} />
              <Route path="token-management" element={<TokenManagementPage />} />
              <Route path="auction-control" element={<AuctionControlPage />} />
              <Route path="governance" element={<GovernancePage />} />
            </Routes>
          </Suspense>
        </div>
      </div>
    </div>
  );
}
