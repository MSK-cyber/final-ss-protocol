import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAccount } from "wagmi";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import DetailsInfo from "../DetailsInfo";
import { isBypassedAddress } from "../../utils/whitelist";

const InfoPage = () => {
  const { address, isConnected } = useAccount();
  const { davHolds, davExpireHolds, davGovernanceHolds, isLoading } = useDAvContract() || {};

  // Gate status that should NOT revert to loading after first resolution
  const [status, setStatus] = useState("loading");
  const [hasPassedGate, setHasPassedGate] = useState(false);

  useEffect(() => {
    // Wallet not connected
    if (!isConnected || !address) {
      setStatus("no-wallet");
      return;
    }
    // While still loading initial data AND we haven't passed gate yet keep 'loading'
    if (isLoading && !hasPassedGate) {
      setStatus("loading");
      return;
    }
    // Once loading completes (or we already passed gate) compute final status
    const active = parseFloat(davHolds || "0");
    const expired = parseFloat(davExpireHolds || "0");
    const total = parseFloat(davGovernanceHolds || "0");

    let next = "ok";
    if (isBypassedAddress(address)) next = "ok";
    else if (total <= 0) next = "no-dav";
    else if (active <= 0 && expired > 0) next = "expired";

    setStatus(next);
    if (next === "ok" && !hasPassedGate) setHasPassedGate(true);
  }, [isConnected, address, isLoading, davHolds, davExpireHolds, davGovernanceHolds, hasPassedGate]);

  const renderGateMessage = () => {
    if (status === "loading" && !hasPassedGate) {
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
        <div className="card bg-dark text-light border-0 shadow-sm my-4">
          <div className="card-body text-center py-5">
            <h5 className="card-title mb-3">Connect your wallet to verify DAV eligibility</h5>
            <p className="card-text mb-4">
              Please connect your wallet to verify DAV eligibility for DAV Vault.
            </p>
          </div>
        </div>
      );
    }

    if (status === "no-dav") {
      return (
        <div className="card bg-dark text-light border-0 shadow-sm my-4">
          <div className="card-body text-center py-5">
            <h5 className="card-title mb-3">Access requires an active DAV token</h5>
            <p className="card-text mb-4">
              You don’t hold a DAV token yet. Mint one to access DAV Vault information.
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
            <p className="card-text mb-4">Please mint a new DAV token to access DAV Vault information.</p>
            <Link to="/davpage" className="btn btn-primary">Mint New DAV</Link>
          </div>
        </div>
      );
    }

    return null;
  };

  // Before passing the gate show gating messages; after passing keep DetailsInfo visible even if status temporarily flickers
  if (!hasPassedGate && status !== "ok") {
    return (
      <div className="container mt-4">
        {renderGateMessage()}
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <DetailsInfo />
    </div>
  );
};

export default InfoPage;
