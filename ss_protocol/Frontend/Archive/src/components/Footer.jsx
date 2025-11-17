import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "../Styles/Header.css";
import { FaXTwitter } from "react-icons/fa6";
import { useEffect, useState, useContext } from "react";
import { useLocation } from "react-router-dom";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { formatCountdown } from "../Constants/Utils";
import { ContractContext } from "../Functions/ContractInitialize";
import { ethers } from "ethers";

const Footer = () => {
  const location = useLocation();
  const { AuctionTime = {}, IsAuctionActive = {}, isReversed = {} } = useSwapContract();
  const { AllContracts } = useContext(ContractContext);
  const [nextEnding, setNextEnding] = useState(0);
  const [activeTokenKey, setActiveTokenKey] = useState("");
  const [reverseNow, setReverseNow] = useState(null);

  // Update nextEnding whenever AuctionTime changes (chain-anchored by provider)
  useEffect(() => {
    console.log("Footer: AuctionTime updated:", AuctionTime);
    try {
      const times = Object.entries(AuctionTime)
        .filter(([name, secs]) => name !== 'loading') // Filter out loading state
        .map(([name, secs]) => ({
          name,
          secs: Number(secs) || 0,
          active: IsAuctionActive?.[name] === true || IsAuctionActive?.[name] === "true",
        }))
        .filter((t) => t.secs > 0);
      
      if (times.length > 0) {
        const soonest = times.reduce((a, b) => (a.secs <= b.secs ? a : b));
        const minTime = soonest.secs;
        setActiveTokenKey(soonest.name);
        console.log("Footer: Setting nextEnding to", minTime, "(token:", soonest.name, ")");
        setNextEnding(minTime);
      } else {
        console.log("Footer: No active times, setting to 0");
        setNextEnding(0);
      }
    } catch (error) {
      console.error("Error calculating next ending:", error);
      setNextEnding(0);
    }
  }, [AuctionTime, IsAuctionActive]);

  // Fetch on-chain reverse status for today's token to avoid name/symbol key mismatches
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!AllContracts?.AuctionContract) { setReverseNow(null); return; }
        const info = await AllContracts.AuctionContract.getTodayToken();
        const todayAddr = info?.[0] || info?.tokenOfDay;
        if (!todayAddr || todayAddr === ethers.ZeroAddress) { setReverseNow(null); return; }
        const rev = await AllContracts.AuctionContract.isReverseAuctionActive(todayAddr);
        if (!cancelled) setReverseNow(Boolean(rev));
      } catch (e) {
        if (!cancelled) setReverseNow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [AllContracts?.AuctionContract, JSON.stringify(AuctionTime)]);

  // REMOVED: Local ticking interval - countdown happens in SwapContractFunctions
  // The AuctionTime from context is already updating every second

  const messages = [
    "V.3 = 30% more yield on ratio swaps",
    "Refresh when minting more DAV tokens.",
    "Transferring DAV tokens is not allowed after minting",
    "Referrers receive their commission directly in their wallet",
  ];
  const [currentMessageIndex, setCurrentMessageIndex] = useState(0);
  useEffect(() => {
    // Set up interval to change message every 2 minutes (120,000 ms)
    const interval = setInterval(() => {
      setCurrentMessageIndex((prevIndex) => (prevIndex + 1) % messages.length);
    }, 60000); // 1 minutes

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, [messages.length]);

  // Determine mode (Reverse/Normal) for the currently active token
  const resolveBool = (v) => v === true || v === "true";
  const mappedIsReversed = resolveBool(isReversed?.[activeTokenKey]);
  // Prefer on-chain reading; fallback to mapped state if not available.
  const isReverseMode = reverseNow !== null ? reverseNow : mappedIsReversed;
  const modeLabel = isReverseMode ? "Reverse" : "Normal";
  const modeClass = isReverseMode ? "bg-danger" : "bg-success";
  return (
    <footer
      className="bg-dark py-1 d-none d-md-block"
      style={{
        position: "fixed",
        bottom: 0,
        width: "100%",
        zIndex: 1000,
      }}
    >
      <div className="container">
        <div className="d-flex justify-content-between align-items-center">
          {/* Left: Auction timer (always visible) */}
          <div className="d-flex align-items-center gap-2 text-white" style={{ minWidth: 180 }}>
            <span style={{ fontSize: "14px" }}>
              Auction Timer: <strong>{formatCountdown(nextEnding)}</strong>
            </span>
            <span className={`badge ${modeClass}`} style={{ fontSize: "12px" }} title={`Auction Mode: ${modeLabel}`}>
              {modeLabel}
            </span>
          </div>

          {/* Middle: rotating message */}
          <div
            className="flex-grow-1 text-center text-white px-3"
            style={{ fontSize: "14px" }}
          >
            {messages[currentMessageIndex]}
          </div>

          {/* Right: Docs/Disclaimer + X icon */}
          <div className="d-flex align-items-center gap-3 gap-md-4">
            <a
              href="https://system-state-documentation.gitbook.io/system-state"
              className="text-white"
              style={{ fontSize: "14px" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Docs
            </a>
            <a
              href="https://system-state-documentation.gitbook.io/system-state/disclaimer"
              className="text-white"
              style={{ fontSize: "14px" }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Disclaimer
            </a>
            <a
              href="https://twitter.com/thestate_x"
              target="_blank"
              rel="noopener noreferrer"
              className="text-white fs-4"
              title="Follow on X"
            >
              <FaXTwitter style={{ height: "20px", width: "20px" }} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
