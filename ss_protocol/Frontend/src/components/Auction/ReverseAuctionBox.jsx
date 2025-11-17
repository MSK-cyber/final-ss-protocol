import React from "react";
import MetaMaskIcon from "../../assets/metamask-icon.png";

const ReverseAuctionBox = ({
  headerTitle,
  ratioText,
  onReverseSwap,
  onReverseStep2,
  reverseState,
  busy,
  leftTokenLabel,
  onAddToMetaMask,
  doneReverse1,
  doneReverse2,
}) => {
  // Inline critical sizing to prevent FOUC and lock size permanently
  const frameStyle = {
    width: "100%",
    maxWidth: 420,      // Slightly reduced from 450 to match Normal box
    minWidth: 420,      // Keep fixed to avoid layout shift
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
  <div className={`auction-frame normal-fixed reverse`} style={frameStyle}>
          <div className="auction-header d-flex align-items-center justify-content-between">
            <div className="text-start">{headerTitle}</div>
            <div className="text-end">
              <span className="accent-label">Reverse Ratio Swap</span>
            </div>
          </div>

          {/* Reverse Step 1: Token -> STATE */}
          <div className="auction-row-stack">
            <div className="auction-row-action">
              <button
                data-testid="reverse-swap"
                className="btn btn-primary auction-step-btn"
                onClick={onReverseSwap}
                disabled={busy}
                aria-label="Execute Reverse Step 1"
              >
                <div className="auction-step-title">REVERSE RATIO SWAP {doneReverse1 ? "✅" : null}</div>
                <div className="auction-step-sub detailText">{ratioText}</div>
              </button>
            </div>
          </div>

          {/* Reverse Step 2: STATE -> Token */}
          <div className="auction-row-stack">
            <div className="auction-row-action">
              <button
                data-testid="reverse-step2"
                className="btn btn-primary auction-step-btn"
                onClick={onReverseStep2}
                disabled={busy}
                aria-label="Execute Reverse Step 2"
              >
                <div className="auction-step-title">DOUBLE YOU STACK {doneReverse2 ? "✅" : null}</div>
                <div className="auction-step-sub detailText">
                  Swap your STATE tokens and double your stack
                </div>
              </button>
            </div>
          </div>

          {/* Invisible spacer to match Normal's 3-button layout */}
          <div className="auction-row-stack">
            <div className="auction-row-action" style={{ height: 44, visibility: "hidden" }}>
              {/* Empty placeholder for visual parity with Normal's 3rd button */}
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

export default ReverseAuctionBox;
