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
}) => {
  return (
    <div className="row g-4 d-flex align-items-stretch pb-1 justify-content-center">
  <div className="col-12 p-0 auction-col mx-auto">
  <div className={`auction-frame normal-fixed`}>
          <div className="auction-header d-flex align-items-center justify-content-between">
            <div className="text-start">{headerTitle}</div>
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
                <div className="auction-step-title">Airdrop</div>
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
                <div className="auction-step-title">Ratio Swap</div>
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
                <div className="auction-step-title">Double Your Stash</div>
                <div className="auction-step-sub detailText">{dexText || "Use DEX to swap STATE for TOKEN"}</div>
              </button>
            </div>
          </div>

          {/* Footer Labels */}
          <div className="auction-footer d-flex align-items-start justify-content-between">
            <div className="footer-left text-start" style={{ flex: "0 0 auto" }}>
              <div className="d-flex align-items-center gap-2">
                <div>{leftTokenLabel}</div>
                <button className="btn btn-link text-light p-0" style={{ textDecoration: "none" }} onClick={onAddToMetaMask} title="Add token to MetaMask" aria-label="Add token to MetaMask">
                  <img src={MetaMaskIcon} alt="MetaMask" style={{ width: 18, height: 18, objectFit: "contain" }} />
                </button>
              </div>
              <div>STATE</div>
            </div>
            <div className="footer-right text-end" style={{ flex: "0 0 auto" }}>
              <span className={`badge bg-success`} style={{ fontSize: 12 }}>Normal</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NormalAuctionBox;
