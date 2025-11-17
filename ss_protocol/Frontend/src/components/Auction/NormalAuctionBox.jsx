import React from "react";
import MetaMaskIcon from "../../assets/metamask-icon.png";

const NormalAuctionBox = ({
  headerTitle,
  airdropText,
  ratioText,
  onClaim,
  onRatioSwap,
  onDexSwap,
  busy,
  leftTokenLabel,
  onAddToMetaMask,
  dexText,
  doneAirdrop,
  doneRatioSwap,
  doneDexSwap,
}) => {
  // Inline critical sizing to prevent FOUC and lock size permanently
  const frameStyle = {
    width: "100%",
    maxWidth: 420,      // Slightly reduced from 450
    minWidth: 420,      // Keep fixed minimum to avoid layout shift
    height: 260,
    minHeight: 260,
    maxHeight: 260,
    marginLeft: 0,
    marginRight: 0,
    overflow: "hidden",
    boxSizing: "border-box",
  };
  return (
    <div className="row g-4 d-flex align-items-stretch pb-1 justify-content-start">
  <div className="col-12 p-0 auction-col">
  <div className={`auction-frame normal-fixed`} style={frameStyle}>
          <div className="auction-header d-flex align-items-center justify-content-between">
            <div className="text-start">{headerTitle}</div>
            <div className="text-end">
              <span className="accent-label">Ratio Swap</span>
            </div>
          </div>

          {/* Airdrop Row */}
          <div className="auction-row-stack">
            <div className="auction-row-action">
              <button
                className="btn btn-primary auction-step-btn"
                onClick={onClaim}
                disabled={busy}
                aria-label="Claim Airdrop"
              >
                <div className="auction-step-title">Airdrop {doneAirdrop ? "✅" : null}</div>
                <div className="auction-step-sub detailText">{airdropText}</div>
              </button>
            </div>
          </div>

          {/* Ratio Swap Row */}
          <div className="auction-row-stack">
            <div className="auction-row-action">
              <button
                data-testid="ratio-swap"
                className="btn btn-primary auction-step-btn"
                onClick={onRatioSwap}
                disabled={busy}
                aria-label="Perform Ratio Swap"
              >
                <div className="auction-step-title">Ratio Swap {doneRatioSwap ? "✅" : null}</div>
                <div className="auction-step-sub detailText">{ratioText}</div>
              </button>
            </div>
          </div>

          {/* Dex Swap Row */}
          <div className="auction-row-stack">
            <div className="auction-row-action">
              <button
                data-testid="swap"
                className="btn btn-primary auction-step-btn"
                onClick={onDexSwap}
                disabled={busy}
                aria-label="Swap on DEX"
              >
                <div className="auction-step-title">Double Your Stash {doneDexSwap ? "✅" : null}</div>
                <div className="auction-step-sub detailText">{dexText || "Use DEX to swap STATE for Token"}</div>
              </button>
            </div>
          </div>

          {/* Footer Labels: Token 1 (left) and Token 2 (right) in one row */}
          <div className="auction-footer d-flex align-items-center justify-content-between" style={{ transform: "translateY(-8px)" }}>
            {/* Token 1 - left corner */}
            <div className="footer-left text-start" style={{ flex: "0 0 auto" }}>
              <div className="d-flex align-items-center gap-2">
                <div>{leftTokenLabel}</div>
                <button className="btn btn-link text-light p-0" style={{ textDecoration: "none" }} onClick={onAddToMetaMask} title="Add token to MetaMask" aria-label="Add token to MetaMask">
                  <img src={MetaMaskIcon} alt="MetaMask" style={{ width: 18, height: 18, objectFit: "contain" }} />
                </button>
              </div>
            </div>
            {/* Token 2 - right corner */}
            <div className="footer-right text-end" style={{ flex: "0 0 auto" }}>
              <div>STATE</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NormalAuctionBox;
