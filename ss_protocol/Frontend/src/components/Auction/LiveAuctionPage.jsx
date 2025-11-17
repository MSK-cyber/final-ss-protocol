import { useMemo, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AuctionBoxes from "./AuctionBoxes";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import { useAccount } from "wagmi";
import { isBypassedAddress } from "../../utils/whitelist";

const LiveAuctionPage = () => {
  const { address, isConnected } = useAccount();
  const { davHolds, davExpireHolds, davGovernanceHolds, isLoading } = useDAvContract() || {};

  const status = useMemo(() => {
    // Normalize to numbers; values come as strings like "0.0"
    const active = parseFloat(davHolds || "0");
    const expired = parseFloat(davExpireHolds || "0");
    const total = parseFloat(davGovernanceHolds || "0");

    if (!isConnected || !address) return "no-wallet";
    if (isLoading) return "loading";

    // Bypass DAV requirement for allowlisted wallet(s)
    if (isBypassedAddress(address)) return "ok";

    // No DAV at all
    if (total <= 0) return "no-dav";

    // Has tokens but all are expired (active = 0, expired > 0)
    if (active <= 0 && expired > 0) return "expired";

    // Eligible
    return "ok";
  }, [isConnected, address, isLoading, davHolds, davExpireHolds, davGovernanceHolds]);

  // Once user is confirmed eligible (status === 'ok'), keep auctions visible even if loading
  const [hasPassedGate, setHasPassedGate] = useState(false);
  useEffect(() => {
    if (status === "ok" && !hasPassedGate) setHasPassedGate(true);
  }, [status, hasPassedGate]);

  const renderGateMessage = () => {
    if (status === "loading") {
      return (
        <div className="text-center my-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Checking your DAV eligibility…</p>
        </div>
      );
    }

    if (status === "no-wallet") {
      return (
        <div className="alert alert-info text-center my-4" role="alert">
          Connect your wallet to verify DAV eligibility for auctions.
        </div>
      );
    }

    if (status === "no-dav") {
      return (
        <div className="card bg-dark text-light border-0 shadow-sm my-4">
          <div className="card-body text-center py-5">
            <h5 className="card-title mb-3">Auction participation requires a DAV token</h5>
            <p className="card-text mb-4">
              You don’t hold a DAV token yet. Mint one to participate in live auctions.
            </p>
            <Link to="/davpage" className="btn btn-primary">Go to DAV Mint</Link>
          </div>
        </div>
      );
    }

    if (status === "expired") {
      return (
        <div className="card bg-dark text-light border-0 shadow-sm my-4">
          <div className="card-body text-center py-5">
            <h5 className="card-title mb-3">Your DAV token has expired</h5>
            <p className="card-text mb-4">Please mint a new DAV token to continue participating in live auctions.</p>
            <Link to="/davpage" className="btn btn-primary">Mint New DAV</Link>
          </div>
        </div>
      );
    }

    return null;
  };

  // After first successful eligibility, do not hide auctions on subsequent refreshes
  const showAuctions = status === "ok" || hasPassedGate;

  return (
    <div className="container mt-4">
  {/* Gate messages (only before first pass) */}
  {!hasPassedGate && status !== "ok" && renderGateMessage()}

      {/* Auction grid */}
      {showAuctions && (
        <div className="row g-4 d-flex align-items-stretch pb-1">
          <div className="col-md-4 p-0 m-2 cards">
            <AuctionBoxes />
          </div>
        </div>
      )}
    </div>
  );
};

export default LiveAuctionPage;
