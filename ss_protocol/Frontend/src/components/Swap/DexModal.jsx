import React, { useEffect } from "react";
import SwapComponent from "./SwapModel";
import "../../Styles/DexModal.css";
import faviconLogo from "/favicon.png";

const DexModal = ({ isOpen, onClose, token, preselectToken }) => {
  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (isOpen) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="dex-overlay" role="dialog" aria-modal="true">
      <div className="dex-backdrop" onClick={onClose} />
      <div className="dex-modal" role="document">
        <div className="dex-header">
          <div className="dex-header-left">
            <img src={faviconLogo} alt="STATE DEX logo" className="dex-token-logo" />
            <div className="dex-title-wrap">
              <h5 className="dex-title">{token?.displayName || token?.tokenName} — DEX Swap</h5>
              <div className="dex-subtitle">Powered by STATE DEX</div>
            </div>
          </div>
          <button
            type="button"
            className="dex-close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
        <div className="dex-body">
          {/* Use explicit preselectToken so we don't have to mutate token.tokenName and can keep original icon */}
          <SwapComponent preselectToken={preselectToken || token?.tokenName} />
        </div>
      </div>
    </div>
  );
};

export default DexModal;
