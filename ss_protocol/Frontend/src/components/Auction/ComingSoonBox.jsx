import React from "react";

const ComingSoonBox = ({ title = "pDAV", note = "Coming Soon..." }) => {
  const frameStyle = {
    width: "100%",
    maxWidth: 420,
    minWidth: 420,
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
        <div className="auction-frame normal-fixed" style={frameStyle}>
          <div className="auction-header d-flex align-items-center justify-content-between">
            <div className="text-start">{`Auction — ${title}`}</div>
            <div className="text-end">
              <span className="accent-label">Preview</span>
            </div>
          </div>

          <div className="d-flex w-100 h-100 align-items-center justify-content-center" style={{ padding: 8 }}>
            <div className="text-center" style={{ width: "82%" }}>
              <div className="auction-step-title" style={{ marginBottom: 6 }}>{title}</div>
              <div className="auction-step-sub detailText" style={{ opacity: 0.9 }}>{note}</div>
            </div>
          </div>

          <div className="auction-footer d-flex align-items-center justify-content-between" style={{ visibility: "hidden" }}>
            <div className="footer-left text-start" style={{ flex: "0 0 auto" }}>
              <div>{title}</div>
            </div>
            <div className="footer-right text-end" style={{ flex: "0 0 auto" }}>
              <div>STATE</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ComingSoonBox;
