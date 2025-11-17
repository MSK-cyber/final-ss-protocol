import React, { useEffect, useMemo } from "react";
import SwapComponent from "./SwapModel";
import "../../Styles/DexModal.css";
import dav from "../../assets/davlogo.png";
import state from "../../assets/statelogo.png";
import { isImageUrl } from "../../Constants/Constants";
import { generateIdenticon } from "../../utils/identicon";

const DexModal = ({ isOpen, onClose, token, preselectToken }) => {
  // Escape key closes modal
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    if (isOpen) document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const logoSrc = useMemo(() => {
    if (!token) return null;
    if (token.tokenName === "DAV") return dav;
    if (token.tokenName === "STATE") return state;
    if (isImageUrl(token.emoji)) return token.emoji;
    if (token.TokenAddress) return generateIdenticon(token.TokenAddress);
    return null;
  }, [token]);

  if (!isOpen) return null;

  return (
    <div className="dex-overlay" role="dialog" aria-modal="true">
      <div className="dex-backdrop" onClick={onClose} />
      <div className="dex-modal" role="document">
        <div className="dex-header">
          <div className="dex-header-left">
            {logoSrc && (
              <img src={logoSrc} alt={`${token?.tokenName || "Token"} logo`} className="dex-token-logo" />
            )}
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
