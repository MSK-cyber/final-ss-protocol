import "bootstrap/dist/css/bootstrap.min.css";
import "bootstrap-icons/font/bootstrap-icons.css";
import "../Styles/Header.css";
import { FaXTwitter } from "react-icons/fa6";
import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { formatCountdown } from "../Constants/Utils";

const Footer = () => {
  const location = useLocation();
  const { AuctionTime = {}, IsAuctionActive = {} } = useSwapContract();

  // Derive a simple, global "next ending" auction timer
  const getNextEndingSeconds = () => {
    try {
      const times = Object.entries(AuctionTime)
        .map(([name, secs]) => ({
          name,
          secs: Number(secs) || 0,
          active: IsAuctionActive?.[name] === true || IsAuctionActive?.[name] === "true",
        }))
        .filter((t) => t.secs > 0);
      if (!times.length) return 0;
      return Math.min(...times.map((t) => t.secs));
    } catch {
      return 0;
    }
  };

  const nextEnding = getNextEndingSeconds();
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
          </div>

          {/* Middle: rotating message */}
          <div
            className="flex-grow-1 text-center text-white"
            style={{ fontSize: "14px", marginLeft: "100px" }}
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
