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
}) => {
  return (
    <div className="row g-4 d-flex align-items-stretch pb-1 justify-content-center">
  <div className="col-12 p-0 auction-col reverse-narrow mx-auto">
  <div className={`auction-frame reverse`}>
          <div className="auction-header d-flex align-items-center justify-content-between">
            <div className="text-start">{headerTitle}</div>
          </div>

          {/* Reverse Step 1: Token -> STATE */}
          <div className="auction-row-stack">
            <div className="auction-row small">
              <div className="row-legend">Reverse • Step 1</div>
              <div className="auction-card">
                <div className="auction-card-sub detailText">{ratioText}</div>
              </div>
            </div>
            <div className="auction-row-action">
              <button data-testid="reverse-swap" className="btn btn-primary btn-sm mb-0" style={{ width: "200px" }} onClick={onReverseSwap} disabled={busy}>Execute Step 1</button>
            </div>
          </div>

          {/* Reverse Step 2: STATE -> Token */}
          <div className="auction-row-stack">
            <div className="auction-row small">
              <div className="row-legend">Reverse • Step 2</div>
              <div className="auction-card">
                <div className="auction-card-sub detailText">
                  {typeof reverseState === 'number' && reverseState > 0
                    ? `You have ${reverseState.toLocaleString()} STATE available from Step 1. Burn to receive tokens back at the live ratio.`
                    : `No STATE available from Step 1 yet. Complete Step 1 first.`}
                </div>
              </div>
            </div>
            <div className="auction-row-action">
              <button data-testid="reverse-step2" className="btn btn-primary btn-sm mb-0" style={{ width: "200px" }} onClick={onReverseStep2} disabled={busy || !(typeof reverseState === 'number' && reverseState > 0)}>Execute Step 2</button>
            </div>
          </div>

          {/* Spacer to match Normal Auction box height (third row placeholder) */}
          <div className="auction-row-stack" aria-hidden="true" style={{ visibility: "hidden" }}>
            <div className="auction-row small">
              <div className="row-legend">Spacer</div>
              <div className="auction-card">
                <div className="auction-card-sub detailText">Spacer</div>
              </div>
            </div>
            <div className="auction-row-action">
              <button className="btn btn-primary btn-sm mb-0" style={{ width: "200px" }} disabled>
                Spacer
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
              <span className={`badge bg-danger`} style={{ fontSize: 12 }}>Reverse</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReverseAuctionBox;
