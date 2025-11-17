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
      <div className="container py-4 admin-container">
        <div className="card text-center admin-loading-card">
          <div className="card-body py-5">
            <div className="spinner-border admin-spinner" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <p className="mt-3 mb-0 text-muted">Verifying governance access...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isGovernance) {
    return (
      <div className="container py-4 admin-container">
        <div className="card admin-access-card">
          <div className="card-body">
            <div className="admin-access-header">
              <div className="admin-lock-icon">🔒</div>
              <h4 className="mb-2 admin-access-title">GOVERNANCE ACCESS REQUIRED</h4>
              <p className="text-muted mb-4">Connect the governance wallet to access protocol administration</p>
            </div>
            
            <div className="admin-wallet-comparison">
              <div className="wallet-info-box disconnected">
                <div className="wallet-label">
                  <i className="bi bi-circle-fill status-dot"></i>
                  Connected Wallet
                </div>
                <div className="wallet-address">
                  {address ? (
                    <>
                      <span className="address-text">{address.slice(0, 6)}...{address.slice(-4)}</span>
                      <code className="address-full d-none d-md-inline ms-2">{address}</code>
                    </>
                  ) : (
                    <span className="text-warning">Not connected</span>
                  )}
                </div>
              </div>

              <div className="wallet-divider">
                <i className="bi bi-arrow-down"></i>
              </div>

              <div className="wallet-info-box required">
                <div className="wallet-label">
                  <i className="bi bi-shield-check-fill status-dot"></i>
                  Required Governance
                </div>
                <div className="wallet-address">
                  {effectiveGov ? (
                    <>
                      <span className="address-text">{effectiveGov.slice(0, 6)}...{effectiveGov.slice(-4)}</span>
                      <code className="address-full d-none d-md-inline ms-2">{effectiveGov}</code>
                    </>
                  ) : (
                    <span className="text-muted">Loading...</span>
                  )}
                </div>
              </div>
            </div>

            <div className="admin-override-section">
              <div className="override-header">
                <h6 className="mb-0">Developer Override</h6>
                <small className="text-muted">For testing purposes only</small>
              </div>
              <div className="row g-2">
                <div className="col-md-8">
                  <input 
                    className="form-control override-input" 
                    placeholder="0x... governance address override" 
                    value={overrideIn} 
                    onChange={e => setOverrideIn(e.target.value)} 
                  />
                </div>
                <div className="col-md-4">
                  <button 
                    className="btn btn-primary w-100 override-btn" 
                    onClick={() => { 
                      try { 
                        localStorage.setItem('GOVERNANCE_OVERRIDE', overrideIn); 
                        window.location.reload(); 
                      } catch(e) {
                        console.error('Failed to set override:', e);
                      } 
                    }}
                  >
                    <i className="bi bi-key-fill me-2"></i>
                    Apply Override
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4 admin-container">
      {/* Admin Header */}
      <div className="card mb-4 admin-header-card">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center flex-wrap">
            <div className="admin-header-left">
              <div className="d-flex align-items-center gap-3">
                <div className="admin-logo">
                  <div className="logo-icon">⚡</div>
                </div>
                <div>
                  <h3 className="mb-1 admin-title">STATE DEX PROTOCOL</h3>
                  <p className="mb-0 admin-subtitle">Governance Administration Panel</p>
                </div>
              </div>
            </div>
            <div className="admin-header-right">
              <div className="governance-badge">
                <i className="bi bi-shield-check-fill me-2"></i>
                <div className="governance-info">
                  <div className="governance-label">GOVERNANCE</div>
                  <div className="governance-address" title={effectiveGov}>
                    {effectiveGov ? `${effectiveGov.slice(0,6)}...${effectiveGov.slice(-4)}` : '—'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Workflow Guide */}
      <div className="card mb-4 admin-workflow-card">
        <div className="card-body">
          <div className="d-flex align-items-center mb-3">
            <i className="bi bi-diagram-3-fill text-primary me-2"></i>
            <h6 className="mb-0 workflow-title">DEPLOYMENT WORKFLOW</h6>
          </div>
          <p className="workflow-description">Follow these sequential steps for complete protocol deployment</p>
          <div className="workflow-steps">
            <div className="workflow-step">
              <div className="step-number">1</div>
              <div className="step-icon">🚀</div>
              <div className="step-label">System Setup</div>
            </div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step">
              <div className="step-number">2-3</div>
              <div className="step-icon">💰</div>
              <div className="step-label">Buy & Burn</div>
            </div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step">
              <div className="step-number">4</div>
              <div className="step-icon">🪙</div>
              <div className="step-label">Token Deploy</div>
            </div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step">
              <div className="step-number">5</div>
              <div className="step-icon">🎯</div>
              <div className="step-label">Start Auction</div>
            </div>
            <div className="workflow-arrow">→</div>
            <div className="workflow-step">
              <div className="step-number">✓</div>
              <div className="step-icon">👑</div>
              <div className="step-label">Governance</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="row">
        <div className="col-lg-3 mb-4">
          <div className="card admin-sidebar-card">
            <div className="card-header admin-sidebar-header">
              <h6 className="mb-0">ADMIN FUNCTIONS</h6>
            </div>
            <div className="card-body p-0">
              <nav className="admin-nav">
                <NavLink 
                  to="/admin/system-initialization" 
                  className={({isActive}) => `admin-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">🚀</span>
                  <span className="nav-text">
                    <span className="nav-title">System Setup</span>
                    <span className="nav-subtitle">Step 1</span>
                  </span>
                </NavLink>
                <NavLink 
                  to="/admin/buyburn-setup" 
                  className={({isActive}) => `admin-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">💰</span>
                  <span className="nav-text">
                    <span className="nav-title">Buy & Burn Setup</span>
                    <span className="nav-subtitle">Steps 2 & 3</span>
                  </span>
                </NavLink>
                <NavLink 
                  to="/admin/token-management" 
                  className={({isActive}) => `admin-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">🪙</span>
                  <span className="nav-text">
                    <span className="nav-title">Token Management</span>
                    <span className="nav-subtitle">Step 4</span>
                  </span>
                </NavLink>
                <NavLink 
                  to="/admin/auction-control" 
                  className={({isActive}) => `admin-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">🎯</span>
                  <span className="nav-text">
                    <span className="nav-title">Auction Control</span>
                    <span className="nav-subtitle">Step 5</span>
                  </span>
                </NavLink>
                <div className="nav-divider"></div>
                <NavLink 
                  to="/admin/governance" 
                  className={({isActive}) => `admin-nav-link ${isActive ? 'active' : ''}`}
                >
                  <span className="nav-icon">👑</span>
                  <span className="nav-text">
                    <span className="nav-title">Governance Transfer</span>
                    <span className="nav-subtitle">Final Step</span>
                  </span>
                </NavLink>
              </nav>
            </div>
          </div>
        </div>
        
        <div className="col-lg-9">
          <Suspense fallback={
            <div className="card admin-loading-card">
              <div className="card-body text-center py-5">
                <div className="spinner-border admin-spinner" role="status">
                  <span className="visually-hidden">Loading...</span>
                </div>
                <p className="mt-3 mb-0 text-muted">Loading module...</p>
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
