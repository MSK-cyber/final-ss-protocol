import React, { useEffect, useState } from "react";
import { useChainId } from "wagmi";
import { getContractAddressesForChain, CHAIN_IDS } from "../Constants/ContractAddresses";
import "../Styles/ContractsModal.css";
import faviconLogo from "/favicon.png";

// Contract display names and icons mapping
const CONTRACT_CONFIG = {
  DAV_TOKEN: { name: "DAV Token", icon: "bi-coin" },
  STATE_TOKEN: { name: "STATE Token", icon: "bi-currency-exchange" },
  AUCTION: { name: "Auction (SWAP_V3)", icon: "bi-arrow-left-right" },
  SWAP_LENS: { name: "Swap Lens", icon: "bi-search" },
  BUY_BURN_CONTROLLER: { name: "Buy & Burn Controller", icon: "bi-fire" },
  AIRDROP_DISTRIBUTOR: { name: "Airdrop Distributor", icon: "bi-gift" },
  AUCTION_ADMIN: { name: "Auction Admin", icon: "bi-shield-lock" },
};

// Helper to truncate address for display
const truncateAddress = (address) => {
  if (!address) return "Not Deployed";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

// Helper to copy address to clipboard
const copyToClipboard = async (text, setCopied) => {
  try {
    await navigator.clipboard.writeText(text);
    setCopied(text);
    setTimeout(() => setCopied(null), 2000);
  } catch (err) {
    console.error("Failed to copy:", err);
  }
};

const ContractsModal = ({ isOpen, onClose }) => {
  const chainId = useChainId() || CHAIN_IDS.PULSECHAIN;
  const contracts = getContractAddressesForChain(chainId);
  const [copiedAddress, setCopiedAddress] = useState(null);

  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (isOpen) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isOpen]);

  if (!isOpen) return null;

  // Filter out contracts without addresses
  const deployedContracts = Object.entries(contracts)
    .filter(([key, address]) => address && CONTRACT_CONFIG[key])
    .map(([key, address]) => ({
      name: CONTRACT_CONFIG[key].name,
      icon: CONTRACT_CONFIG[key].icon,
      address,
      key,
    }));

  return (
    <div className="contracts-overlay" role="dialog" aria-modal="true">
      <div className="contracts-backdrop" onClick={onClose} />
      <div className="contracts-modal" role="document">
        <div className="contracts-header">
          <div className="contracts-header-left">
            <img src={faviconLogo} alt="STATE Protocol logo" className="contracts-logo" />
            <div className="contracts-title-wrap">
              <h5 className="contracts-title">Smart Contracts</h5>
              <div className="contracts-subtitle">STATE DEX Protocol • PulseChain</div>
            </div>
          </div>
          <button
            type="button"
            className="contracts-close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        <div className="contracts-body">
          {/* Verification notice */}
          <div className="contracts-notice">
            <div className="contracts-notice-icon">
              <i className="bi bi-patch-check-fill" aria-hidden="true"></i>
            </div>
            <div className="contracts-notice-text">
              <div className="contracts-notice-title">Verified & Renounced</div>
              <div className="contracts-notice-desc">
                All contracts are verified on-chain and ownership has been renounced. 
                Review source code on Sourcify or explore on OtterScan.
              </div>
            </div>
          </div>

          {/* Contracts list */}
          <div className="contracts-list">
            {deployedContracts.map(({ name, icon, address, key }) => (
              <div key={key} className="contract-item">
                <div className="contract-info">
                  <div className="contract-name">
                    <span className="contract-icon">
                      <i className={`bi ${icon}`} aria-hidden="true"></i>
                    </span>
                    {name}
                  </div>
                  <div 
                    className="contract-address" 
                    onClick={() => copyToClipboard(address, setCopiedAddress)}
                    title="Click to copy full address"
                  >
                    {copiedAddress === address ? (
                      <>
                        <i className="bi bi-check2" aria-hidden="true"></i>
                        Copied!
                      </>
                    ) : (
                      <>
                        {address}
                        <i className="bi bi-clipboard" aria-hidden="true"></i>
                      </>
                    )}
                  </div>
                </div>
                <div className="contract-buttons">
                  <a
                    href={`https://repo.sourcify.dev/contracts/full_match/369/${address}/`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contract-btn sourcify-btn"
                    title="View source code on Sourcify"
                  >
                    <i className="bi bi-code-slash" aria-hidden="true"></i>
                    <span>Sourcify</span>
                  </a>
                  <a
                    href={`https://otter.pulsechain.com/address/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="contract-btn otter-btn"
                    title="Explore on OtterScan"
                  >
                    <i className="bi bi-box-arrow-up-right" aria-hidden="true"></i>
                    <span>OtterScan</span>
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContractsModal;
