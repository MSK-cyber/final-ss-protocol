import { NavLink } from "react-router-dom";
import { useGovernanceGate } from "./admin/useGovernanceGate";
import WalletConnector from "../WalletComps/WalletConnect";
import { useCallback } from "react";
import "../Styles/Header.css";
import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";

const Header = () => {
  const { isGovernance, loading: govLoading } = useGovernanceGate();
  // Memoize className functions to prevent recalculation
  const getNavLinkClass = useCallback(
    ({ isActive }) => (isActive ? "nav-link active-link text-light" : "nav-link text-light"),
    []
  );
  const getNavLinkDropdownClass = useCallback(
    ({ isActive }) =>
      isActive
        ? "nav-link active-link text-light dropdown-toggle"
        : "nav-link text-light dropdown-toggle",
    []
  );
  const getMobileNavLinkClass = useCallback(
    ({ isActive }) => (isActive ? "text-light active-link text-center" : "text-light text-center"),
    []
  );

  return (
    <>
      {/* Top Navbar for Desktop */}
      <nav className="navbar navbar-expand-lg bg-dark py-2 d-none d-lg-flex">
        <div className="container d-flex justify-content-between align-items-center w-100">
          <NavLink className="navbar-brand text-light pb-0 mb-0" to="/">
            <label
              className="uppercase fs-2 fw-bolder"
              style={{ fontFamily: "Satoshi, sans-serif" }}
            >
              STATE DEX
            </label>
            <p className="detailAmount mb-0" style={{ fontSize: "0.8rem" }}>
              Not just a swap — it’s VOLUME
            </p>
          </NavLink>
          <div className="d-flex align-items-center">
            <ul className="navbar-nav d-flex flex-row align-items-center me-4">
              <li className="nav-item mx-2">
                <NavLink className={getNavLinkClass} to="/davpage">
                  DAV Mint
                </NavLink>
              </li>
              <li className="nav-item mx-2">
                <NavLink className={getNavLinkClass} to="/live-auction">
                  Auction
                </NavLink>
              </li>
              
              {/* Add Token moved under Admin; removed from public nav */}
              {/* Deflation removed */}
              <li className="nav-item mx-2 dropdown">
                <NavLink className={getNavLinkDropdownClass} to="/info">
                  DAV Vault
                </NavLink>
                <ul className="dropdown-menu custom-dropdown-menu bg-dark border-0 shadow">
                  <li>
                    <NavLink className="dropdown-item text-light" to="/dav-history">
                      DAV History
                    </NavLink>
                  </li>
                </ul>
              </li>
              {!govLoading && isGovernance && (
                <li className="nav-item mx-2">
                  <NavLink className={getNavLinkClass} to="/admin">
                    Admin
                  </NavLink>
                </li>
              )}
            </ul>
            <div>
              <WalletConnector />
            </div>
          </div>
        </div>
      </nav>

      {/* Top Navbar for Mobile */}
      <nav className="navbar bg-dark d-lg-none justify-content-between align-items-center py-2">
        <NavLink className="navbar-brand text-light small-text" to="/">
          <h5 className="uppercase fs-2 fw-bolder">STATE DEX</h5>
        </NavLink>
        <div className="me-3 small-text">
          <WalletConnector />
        </div>
      </nav>

      {/* Mobile Bottom Navigation */}
      <div className="mobile-nav d-flex d-lg-none justify-content-around fixed-bottom bg-dark py-2">
        <NavLink to="/davpage" className={getMobileNavLinkClass}>
          <i className="bi bi-coin"></i>
          <div>DAV Mint</div>
        </NavLink>
        <NavLink to="/live-auction" className={getMobileNavLinkClass}>
          <i className="bi bi-hammer"></i>
          <div>Auction</div>
        </NavLink>
        
        {/* Deflation removed from mobile nav */}
        <NavLink to="/info" className={getMobileNavLinkClass}>
          <i className="bi bi-info-circle"></i>
          <div>DAV Vault</div>
        </NavLink>
        <NavLink
          target="_blank"
          to="https://system-state-documentation.gitbook.io/system-state"
          className={getMobileNavLinkClass}
        >
          <i className="bi bi-file-earmark-text"></i>
          <div>Docs</div>
        </NavLink>
      </div>
    </>
  );
};

export default Header;
