import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "../Styles/Header.css";
import { FaXTwitter } from "react-icons/fa6";
import { useEffect, useState, useContext } from "react";
import { useLocation } from "react-router-dom";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { formatCountdown } from "../Constants/Utils";
// import { formatDuration } from "../utils/auctionTiming";
import { ContractContext } from "../Functions/ContractInitialize";
import { ethers } from "ethers";

const Footer = () => {
  const location = useLocation();
  // Guard against undefined context during early render
  const swapCtx = useSwapContract() || {};
  const { 
    AuctionTime = {}, 
    IsAuctionActive = {}, 
    isReversed = {}, 
    auctionPhase, 
    auctionPhaseSeconds = 0,
    auctionPhaseEndAt,
    todayTokenAddress, // Use centralized today's token address from context
  } = swapCtx;
  const { AllContracts } = useContext(ContractContext);
  // We now rely exclusively on chain-anchored auctionPhaseSeconds from context for accuracy
  // Remove per-token fallback to avoid key mismatches or duplicated entries
  const [reverseNow, setReverseNow] = useState(null);
  const [lastKnownReverse, setLastKnownReverse] = useState(null);

  // Fetch on-chain reverse status for today's token using centralized address from context
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!AllContracts?.AuctionContract) { setReverseNow(null); return; }
        // Use centralized todayTokenAddress from context instead of fetching independently
        if (!todayTokenAddress || todayTokenAddress === ethers.ZeroAddress) { 
          setReverseNow(null); 
          return; 
        }
        const rev = await AllContracts.AuctionContract.isReverseAuctionActive(todayTokenAddress);
        if (!cancelled) {
          const val = Boolean(rev);
          setReverseNow(val);
          setLastKnownReverse(val);
        }
      } catch (e) {
        if (!cancelled) setReverseNow(null);
      }
    })();
    return () => { cancelled = true; };
  }, [AllContracts?.AuctionContract, todayTokenAddress]);

  // REMOVED: Local ticking interval - countdown happens in SwapContractFunctions
  // The AuctionTime from context is already updating every second

  // Helper to format a UNIX seconds timestamp into GMT+2 timezone
  const formatGMT2 = (tsSec) => {
    try {
      const dt = new Date(Number(tsSec || 0) * 1000);
      if (!Number.isFinite(dt.getTime())) return "Invalid Date";
      return new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Africa/Cairo',
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(dt) + ' GMT+2';
    } catch {
      try { const d = new Date(Number(tsSec || 0) * 1000); return d.toLocaleString('en-GB') + ' GMT+2'; } catch { return 'Invalid Date'; }
    }
  };

  const messages = [
    "State DEX - beta version",
    "State DEX - beta version",
    "State DEX - beta version",
    "State DEX - beta version",
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
  // Map-based reverse flag may be keyed differently; prefer on-chain reverseNow
  const mappedIsReversed = false;
  // Prefer on-chain; if temporarily unknown, keep last known; finally fallback to mapped flag.
  const isReverseMode = reverseNow !== null ? reverseNow : (lastKnownReverse !== null ? lastKnownReverse : mappedIsReversed);
  const modeLabel = isReverseMode ? "Reverse" : "Normal";
  // Use pink accent for Reverse to match navbar/hero active color (#ff4081)
  // Match Normal auction badge color to primary button background (Bootstrap .btn-primary)
  // Reverse stays pink (#ff4081) per navbar active color requirement
  // Remove Bootstrap bg-* classes to avoid legacy colors showing
  const modeStyle = isReverseMode
    ? { fontSize: "12px", backgroundColor: "#ff4081", color: "#ffffff" }
    : { fontSize: "12px", backgroundColor: "#0d6efd", color: "#ffffff" };
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
          {/* Left: Auction or Interval timer (live from contract) */}
          <div className="d-flex align-items-center gap-2 text-white" style={{ minWidth: 220 }}>
            {auctionPhase === 'interval' ? (
              <span style={{ fontSize: "14px" }}>
                Auction starts in {formatCountdown(Number(auctionPhaseSeconds || 0))}
              </span>
            ) : (
              <span style={{ fontSize: "14px" }}>
                Auction Timer: {" "}
                {formatCountdown(Number(auctionPhaseSeconds || 0))}
              </span>
            )}
            <span className="badge" style={modeStyle} title={`Auction Mode: ${modeLabel}`}>
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
