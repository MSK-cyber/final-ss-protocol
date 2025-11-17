import { useMemo, useState, useEffect, useRef } from "react";
import PropTypes from "prop-types";
import state from "../../assets/statelogo.png";
import { isImageUrl } from "../../Constants/Constants";
import { useAuctionTokens } from "../../data/auctionTokenData";

const TokenSearchModal = ({ tokens, excludeToken, onSelect, onClose }) => {
  const [searchTerm, setSearchTerm] = useState("");
  const searchInputRef = useRef(null);
  const [copiedStates, setCopiedStates] = useState({});

  // Get active auction tokens
  const { tokens: auctionTokens } = useAuctionTokens();
  const activeAuctionSymbols = useMemo(
    () =>
      auctionTokens
        .filter(
          (t) =>
            t.AuctionStatus === "true" ||
            (t.AuctionStatus === "false" && t.isReversing === "true")
        )
        .map((t) => t.symbol || t.name),
    [auctionTokens]
  );
  const activeAuctionInfo = useMemo(() => {
    const info = {};
    auctionTokens.forEach((t) => {
      if (
        t.AuctionStatus === "true" ||
        (t.AuctionStatus === "false" && t.isReversing === "true")
      ) {
        // Split outputToken into words, reverse the order, and join with line breaks
        const outputTokenWords = t.outputToken.split(' ').reverse();
        info[t.symbol || t.name] = `Swap\n${outputTokenWords.join('\n')}`;
      }
    });
    return info;
  }, [auctionTokens]);
  const filteredTokens = useMemo(() => {
    if (!searchTerm.trim()) {
      return Object.keys(tokens).filter((key) => key !== excludeToken);
    }

    const searchLower = searchTerm.toLowerCase();
    return Object.keys(tokens).filter((key) => {
      if (key === excludeToken) return false;

      const token = tokens[key];
      const symbolMatch = token.symbol.toLowerCase().includes(searchLower);
      const addressMatch = token.address.toLowerCase().includes(searchLower);
      const nameMatch = token.name?.toLowerCase().includes(searchLower);
      const displayNameMatch = token.displayName?.toLowerCase().includes(searchLower);
      return symbolMatch || addressMatch || nameMatch || displayNameMatch;
    });
  }, [searchTerm, excludeToken, tokens]);

  // Sort filtered tokens so active auction tokens are at the top
  const sortedFilteredTokens = useMemo(() => {
    return [...filteredTokens].sort((a, b) => {
      const aActive = activeAuctionSymbols.includes(a);
      const bActive = activeAuctionSymbols.includes(b);
      if (aActive && !bActive) return -1;
      if (!aActive && bActive) return 1;
      return 0;
    });
  }, [filteredTokens, activeAuctionSymbols]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent zoom in/out with Ctrl+Plus, Ctrl+Minus, Ctrl+0
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '0')) {
        e.preventDefault();
      }
      switch (e.key) {
        case "Enter":
          e.preventDefault();
          break;
        case "Escape":
          onClose();
          break;
      }
    };

    // Prevent zoom with mouse wheel (Ctrl+wheel)
    const handleWheel = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    // Prevent zoom with pinch gesture (touchpad)
    const handleGesture = (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown, { passive: false });
    document.addEventListener("wheel", handleWheel, { passive: false });
    document.addEventListener("gesturestart", handleGesture, { passive: false });
    document.addEventListener("gesturechange", handleGesture, { passive: false });
    document.addEventListener("gestureend", handleGesture, { passive: false });
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("wheel", handleWheel);
      document.removeEventListener("gesturestart", handleGesture);
      document.removeEventListener("gesturechange", handleGesture);
      document.removeEventListener("gestureend", handleGesture);
    };
  }, [onClose]);

  // Auto-focus search input
  useEffect(() => {
    if (searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, []);

  const getTokenLogo = (token) => {
    if (token.symbol === "STATE") {
      return (
        <img
          src={state}
          alt="STATE"
          className="rounded-circle border border-secondary"
          style={{ width: "32px", height: "32px" }}
        />
      );
    }

    // Show image if http(s), local path, or data URL
    if (
      token.image &&
      (token.image.startsWith("http") || token.image.startsWith("/") || token.image.startsWith("data:image/"))
    ) {
      return (
        <img
          src={token.image}
          alt={token.symbol}
          className="rounded-circle border border-secondary"
          style={{ width: "32px", height: "32px" }}
        />
      );
    }

    // If emoji is actually an image URL or data URL, render as image
    if (token.emoji && (isImageUrl(token.emoji) || token.emoji.startsWith?.("data:image/"))) {
      return (
        <img
          src={token.emoji}
          alt={token.symbol}
          className="rounded-circle border border-secondary"
          style={{ width: "32px", height: "32px" }}
        />
      );
    }

    if (token.emoji) {
      return (
        <div
          className="rounded-circle border border-secondary d-flex align-items-center justify-content-center"
          style={{ width: "32px", height: "32px", fontSize: "16px" }}
        >
          {token.emoji}
        </div>
      );
    }

    return (
      <img
        src="/default.png"
        alt={token.symbol}
        className="rounded-circle border border-secondary"
        style={{ width: "32px", height: "32px" }}
      />
    );
  };

  const highlightSearchTerm = (text) => {
    if (!searchTerm.trim()) return text;

    const regex = new RegExp(`(${searchTerm})`, "gi");
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-warning text-dark px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <>
      {/* Backdrop */}
      <div className="modal-backdrop fade show" style={{ zIndex: 2040 }} />

      {/* Modal */}
      <div className="modal d-block" tabIndex="-1" style={{ zIndex: 2050 }}>
        <div className="modal-dialog modal-dialog-centered justify-content-center" >
          <div className="modal-content bg-dark text-light border border-secondary rounded-4 shadow-lg">
            {/* Header */}


            {/* Body */}
            <div className="modal-body pt-0 py-2 mt-4">
              {/* Enhanced Search Input */}
              <div className="mb-1">
                <div className="position-relative">
                  <div className="input-group input-group-sm shadow-sm">
                    <span className="input-group-text bg-transparent border-0 text-light" style={{ borderRadius: 0 }}>
                      <i className="bi bi-search fs-6"></i>
                    </span>
                    <input
                      ref={searchInputRef}
                      type="text"
                      className="form-control border-0 bg-secondary text-light fs-6 py-2 rounded-pill"
                      placeholder="Search by name, symbol, or address..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      style={{ borderTopLeftRadius: 50, borderBottomLeftRadius: 50, borderTopRightRadius: 50, borderBottomRightRadius: 50 }}
                    />
                    <button
                      type="button"
                      className="btn-close btn-close-white"
                      style={{
                        borderRadius: "50%",
                        width: "30px",
                        height: "30px",
                        fontSize: "16px"
                      }}
                      aria-label="Close"
                      onClick={onClose}
                    ></button>
                  </div>
                  <div className="mt-1 d-flex align-items-center gap-1">
                    <i className="bi bi-info-circle text-muted small"></i>
                    <small className="text-secondary small">
                    </small>
                  </div>
                </div>
              </div>

              {/* Results */}
              <div
                className="border border-secondary rounded-3 shadow-sm custom-scrollbar mb-3 mx-1"
                style={{
                  maxHeight: "300px",
                  overflowY: "auto",
                  scrollbarWidth: "thin",
                  scrollbarColor: "#666 transparent",
                  scrollbarGutter: "stable",
                }}
              >
                {sortedFilteredTokens.length > 0 ? (
                  sortedFilteredTokens.map((key, index) => {
                    const token = tokens[key];

                    return (
                      <div
                        key={key}
                        className={`px-3 py-2 d-flex align-items-center justify-content-between cursor-pointer border-bottom border-secondary ${index === sortedFilteredTokens.length - 1
                          ? "border-bottom-0"
                          : ""
                          }`}
                        style={{
                          cursor: "pointer",
                          transition: "all 0.2s ease-in-out",
                        }}
                        onClick={() => onSelect(key)}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.backgroundColor =
                            "rgba(131, 110, 255, 0.1)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.backgroundColor = "transparent";
                        }}
                      >
                        <div className="d-flex align-items-center gap-2">
                          {getTokenLogo(token)}
                          <div className="d-flex flex-column">
                            <div className="d-flex align-items-center gap-1">
                              <span className="fw-semibold small">
                                {highlightSearchTerm(token.displayName || token.name || token.symbol)}
                              </span>
                            </div>
                            <small className="text-light small font-monospace">
                              {token.address.slice(0, 8) +
                                "..." +
                                token.address.slice(-6)}
                            </small>
                          </div>
                        </div>

                        <div className="d-flex align-items-center">
                          <i className="bi bi-chevron-right text-muted small me-2 mx-5"></i>

                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-3 text-center">
                    <i className="bi bi-search display-6 text-muted mb-2 d-block"></i>
                    <p className="text-muted mb-1 small fw-medium">
                      No tokens found
                    </p>
                    <small className="text-muted small">
                      Try searching with a different term or paste a contract
                      address
                    </small>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

TokenSearchModal.propTypes = {
  tokens: PropTypes.objectOf(
    PropTypes.shape({
      symbol: PropTypes.string.isRequired,
      address: PropTypes.string.isRequired,
      name: PropTypes.string,
      image: PropTypes.string,
      emoji: PropTypes.string,
    })
  ).isRequired,
  excludeToken: PropTypes.string,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default TokenSearchModal;
