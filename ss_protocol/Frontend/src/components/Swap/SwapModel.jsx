import { parseUnits } from "ethers";
import { useState, useEffect, useContext, useRef } from "react";
import { ethers } from "ethers";
import { ContractContext } from "../../Functions/ContractInitialize";
import { useAllTokens } from "./Tokens";
import state from "../../assets/statelogo.png";
import pulsechainLogo from "../../assets/pls1.png";
import sonic from "../../assets/S_token.svg";
import { useAccount, useChainId } from "wagmi";
import { PULSEX_ROUTER_ADDRESS, PULSEX_ROUTER_ABI, notifyError, ERC20_ABI, notifySuccess } from '../../Constants/Constants';
import useSwapData from "./useSwapData";
// import toast from "react-hot-toast";
import useTokenBalances from "./UserTokenBalances";
import { TokensDetails } from "../../data/TokensDetails";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { calculatePlsValueNumeric, validateInputAmount } from "../../Constants/Utils";

const SwapComponent = ({ preselectToken }) => {
  const { signer } = useContext(ContractContext);
  const chainId = useChainId();
  const TOKENS = useAllTokens();
  const { address } = useAccount();

  const nativeNames = {
    1: "Wrapped Ether",
    137: "Wrapped Matic",
    146: "Wrapped Sonic",
    42161: "Arbitrum",
    10: "Optimism",
    369: "Wrapped Pulse", // pump.tires case
    56: "BNB Chain",
  };

  const [tokenIn, setTokenIn] = useState("STATE");
  const [tokenOut, setTokenOut] = useState(null);
  const [pairToken, setPairToken] = useState(null);
  const [amountIn, setAmountIn] = useState("");
  const [isSwapping, setIsSwapping] = useState(false);
  // Removed token selection modal per request
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [needsApproval, setNeedsApproval] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [confirmedAmountIn, setConfirmedAmountIn] = useState("");
  const [confirmedAmountOut, setConfirmedAmountOut] = useState("");
  const [insufficientBalance, setInsufficientBalance] = useState(false);
  const [ratioOutPerIn, setRatioOutPerIn] = useState("");
  const ratioTimerRef = useRef(null);
  const isActiveEntry = (amountIn && amountIn.trim() !== "");


  const {
    amountOut,
    tokenInBalance,
    quoteData,
    getQuoteDirect,
    inputUsdValue,
    outputUsdValue,
    isLoading,
  } = useSwapData({
    amountIn,
    tokenIn,
    tokenOut,
    TOKENS,
  });
  const { pstateToPlsRatio, DaipriceChange } = useSwapContract();
  const { tokens } = TokensDetails();
  const tokenBalances = useTokenBalances(TOKENS, signer);

  const calculateTotalSum = () => {
    return tokens.reduce((sum, token) => {
      return sum + calculatePlsValueNumeric(token, tokenBalances, pstateToPlsRatio);
    }, 0);
  };
  // Check if input amount exceeds balance
  useEffect(() => {
    if (amountIn && tokenInBalance) {
      const inputAmount = parseFloat(amountIn.replace(/,/g, ''));
      const balance = parseFloat(tokenInBalance);
      setInsufficientBalance(inputAmount > balance);
    } else {
      setInsufficientBalance(false);
    }
  }, [amountIn, tokenInBalance]);

  // Initialize default tokens once, or when preselectToken changes.
  const initializedRef = useRef(false);
  const lastPreselectRef = useRef(preselectToken);
  const manualChangeRef = useRef(false);

  useEffect(() => {
    const preselectChanged = lastPreselectRef.current !== preselectToken;
    if (preselectChanged) {
      lastPreselectRef.current = preselectToken;
      manualChangeRef.current = false; // allow re-init on new preselect
      initializedRef.current = false;
    }

    if (manualChangeRef.current && initializedRef.current) {
      // user manually swapped; don't override their choice
      return;
    }

    if (!initializedRef.current) {
      if (preselectToken && TOKENS[preselectToken]) {
        setPairToken(preselectToken);
        setTokenIn(preselectToken);
        setTokenOut("STATE");
        initializedRef.current = true;
        return;
      }
      if (chainId && nativeNames[chainId]) {
        setTokenOut(nativeNames[chainId]);
      } else {
        setTokenOut("STATE");
      }
      initializedRef.current = true;
    }
  }, [chainId, preselectToken, TOKENS]);

  // Periodically fetch "current ratio" (1 tokenIn -> X tokenOut) every 5 seconds
  const refreshRatio = async () => {
    try {
      if (!tokenIn || !tokenOut || !TOKENS[tokenIn] || !TOKENS[tokenOut]) return;
      // Use direct router quote for 1 unit (uses 18-decimals in getQuoteDirect internally)
      const rawOut = await getQuoteDirect("1", tokenIn, tokenOut);
      const out = Number(ethers.formatUnits(rawOut, TOKENS[tokenOut].decimals));
      if (!isNaN(out) && isFinite(out)) setRatioOutPerIn(out.toString());
    } catch (e) {
      // keep previous ratio on error
      console.warn("ratio refresh failed", e);
    }
  };

  useEffect(() => {
    // clear any existing timer
    if (ratioTimerRef.current) {
      clearInterval(ratioTimerRef.current);
    }
    // immediately fetch once
    refreshRatio();
    // then every 5s
    ratioTimerRef.current = setInterval(refreshRatio, 5000);
    return () => {
      if (ratioTimerRef.current) clearInterval(ratioTimerRef.current);
    };
  }, [tokenIn, tokenOut, TOKENS]);

  const SPECIAL_TOKEN_LOGOS = {
    STATE: state,
    pSTATE: state,
    "Wrapped Sonic": sonic,
    "WPLS": pulsechainLogo,
  };

  const checkAllowance = async () => {
    setTxStatus("initiated")
    try {
      const tokenAddress = TOKENS[tokenIn].address;
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      let swapRouterAddress;
      if (chainId == 369) {
        swapRouterAddress = PULSEX_ROUTER_ADDRESS;
      } else {
        swapRouterAddress = quoteData.to;
      }
      const allowance = await contract.allowance(
        address,
        swapRouterAddress
      );
      const amount = parseUnits(amountIn || "0", TOKENS[tokenIn].decimals);
      setNeedsApproval(BigInt(allowance) < BigInt(amount));
    } catch (err) {
      setNeedsApproval(false);
      console.error("Error checking allowance", err);
    }
  };

  useEffect(() => {
    if (signer && amountIn && !isNaN(amountIn)) {
      checkAllowance();
    } else {
      setNeedsApproval(false);
    }
  }, [tokenIn, amountIn, signer]);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      setTxStatus("Approving");
      const tokenAddress = TOKENS[tokenIn].address;
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
      // Approve unlimited amount (max uint256
      const maxUint256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
      let swapRouterAddress;
      if (chainId == 369) {
        swapRouterAddress = PULSEX_ROUTER_ADDRESS
      } else {
        swapRouterAddress = quoteData.to;
      }
      const tx = await contract.approve(
        swapRouterAddress,
        maxUint256
      );
      await tx.wait();
      setNeedsApproval(false);
    } catch (err) {
      notifyError("Approval failed. Try again.")
      console.error("Approval error", err);
      setTxStatus("error");
    } finally {
      setIsApproving(false);
    }
  };
  
  // Swap tokenIn and tokenOut deterministically
  const handleInterchange = () => {
    try {
      const prevIn = tokenIn;
      const prevOut = tokenOut;
      if (!prevIn || !prevOut) return;
      // Swap directions
      setTokenIn(prevOut);
      setTokenOut(prevIn);
      // Keep track of the non-STATE token for quick toggles
      const nextPair = prevOut !== "STATE" ? prevOut : prevIn;
      setPairToken(nextPair);
      // Reset input state to avoid stale quotes
      // Clear amount to force a fresh quote; user can re-enter
      setAmountIn("");
      setInsufficientBalance(false);
      manualChangeRef.current = true;
    } catch {}
  };
  const getTokenLogo = (symbol) => {
    if (!symbol || !TOKENS[symbol]) {
      return <span>Loading...</span>;
    }
    if (SPECIAL_TOKEN_LOGOS[symbol]) {
      return (
        <img
          src={SPECIAL_TOKEN_LOGOS[symbol]}
          alt={symbol}
          width="32"
          className="rounded-circle"
        />
      );
    }
    if (
      TOKENS[symbol]?.image &&
      (TOKENS[symbol].image.startsWith("http") ||
        TOKENS[symbol].image.startsWith("/") ||
        TOKENS[symbol].image.startsWith("data:image/"))
    ) {
      return (
        <img
          src={TOKENS[symbol].image}
          alt={symbol}
          width="32"
          className="rounded-circle"
        />
      );
    }
    if (TOKENS[symbol]?.emoji) {
      return <span style={{ fontSize: "1.1em" }}>{TOKENS[symbol].emoji}</span>;
    }
    return (
      <img
        src="/default.png"
        alt={symbol}
        width="32"
        className="rounded-circle"
      />
    );
  };
  // Modal open/close and selection removed; only STATE and auction token are used

  const handleSwap = async () => {
    if (!signer) {
      notifyError("Wallet not connected.")
      return;
    }
    setIsSwapping(true);
    setTxStatus("initiated");

    try {
      // Approval step if needed
      if (needsApproval) {
        console.log("Approval needed, calling handleApprove");
        await handleApprove();
      }

      setTxStatus("pending");
      setConfirmedAmountIn(amountIn);
      setConfirmedAmountOut(amountOut);

      // Validate quoteData before proceeding
      if (!quoteData) {
        throw new Error("Invalid quoteData: missing required fields");
      }

      let tx;
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;

      if (chainId === 369) {
        // ✅ PulseChain logic (PulseX Router)
        const routerContract = new ethers.Contract(
          PULSEX_ROUTER_ADDRESS,
          PULSEX_ROUTER_ABI,
          signer
        );

        if (!quoteData.amountIn || !quoteData.amountOutRaw || !quoteData.path) {
          throw new Error("Invalid quoteData for PulseX swap");
        }

        tx = await routerContract.swapExactTokensForTokensSupportingFeeOnTransferTokens(
          quoteData.amountIn,
          quoteData.amountOutRaw,
          quoteData.path,
          address,
          deadline
        );

      } else {
        // ✅ Other chains (Sushi API style)
        console.log("Using Sushi API for swap", quoteData.to);

        const txData = {
          to: quoteData.to,
          data: quoteData.data,
        };

        tx = await signer.sendTransaction(txData);
      }

      if (!tx) {
        throw new Error("Failed to create transaction");
      }

      console.log("Transaction sent:", tx.hash);
      await tx.wait();

      setTxStatus("confirmed");
      setAmountIn("");
      setShowConfirmation(true);

    } catch (err) {
      console.error("Swap failed:", err);
      notifyError(`Swap failed: ${err.reason || err.message || "Unknown error"}`)
      setTxStatus("error");
    } finally {
      setIsSwapping(false);
    }
  };

  useEffect(() => {
    if (showConfirmation) {
      notifySuccess(`${confirmedAmountIn} ${getDisplaySymbol(TOKENS[tokenIn].symbol)} → ${confirmedAmountOut} ${getDisplaySymbol(TOKENS[tokenOut].symbol)} Swap Complete!`,
      );
      setShowConfirmation(false);
    }
  }, [showConfirmation]);

  const getDisplaySymbol = (symbol) => {
    if (!symbol) return '';
    // Prefer full display name from TOKENS if available
    const fullName = TOKENS[symbol]?.displayName || TOKENS[symbol]?.name || symbol;
    const singleLine = fullName.replace(/\s+/g, '');
    return singleLine.length > 6 ? singleLine.slice(0, 6) + '..' : singleLine;
  };

  // Full, non-truncated token display for labels and ratios
  const getFullTokenName = (symbolKey) => {
    if (!symbolKey) return '';
    return TOKENS[symbolKey]?.displayName || TOKENS[symbolKey]?.name || TOKENS[symbolKey]?.symbol || symbolKey;
  };

  // Helper to check if amount exceeds balance
  const checkInsufficientBalance = (inputValue, balance) => {
    if (!inputValue || !balance) return false;
    const inputAmount = parseFloat(inputValue.replace(/,/g, ''));
    const userBalance = parseFloat(balance);
    return inputAmount > userBalance;
  };

  // Helper to handle input change
  const handleInputChange = (value) => {
    const rawValue = value.replace(/,/g, '');
    if (validateInputAmount(rawValue)) {
      const isInsufficient = checkInsufficientBalance(rawValue, tokenInBalance);
      setInsufficientBalance(isInsufficient);
      setAmountIn(rawValue);
    }
  };

  // Helper to get max amount (exact balance without rounding)
  const getMaxAmount = () => {
    return tokenInBalance ? tokenInBalance.toString() : "";
  };
  const handleCheckClick = async () => {
    try {
      const calculated = Math.max(calculateTotalSum() * DaipriceChange, 0) / 100;

      if (DaipriceChange < 0 || calculated === 0) {
        if (DaipriceChange < 0) {
          notifyError(`Invalid amount: index value is negative (${DaipriceChange}%) for now`)
        } else {
          notifyError("Invalid amount: get more state tokens")
        }
        return;
      }

      console.log("calculated", calculated.toString());

      const firstOut = await getQuoteDirect(calculated.toString(), nativeNames[chainId], "STATE");
      const firstOutFormatted = ethers.formatUnits(firstOut, 18);
      console.log("first Out", firstOut)

      // Update UI state
      setTokenIn("STATE");
      setTokenOut(nativeNames[chainId]);
      setAmountIn(firstOutFormatted);
    } catch (err) {
      console.error("Error handling check click:", err);
      notifyError("Something went wrong while preparing the swap")
    }
  };

  // Single-box layout (Uniswap-like)
  return (
    <>
      <div className="container mt-4">
        <div className="dex-swap-card bg-dark text-light border-light p-3 rounded-4" style={{ maxWidth: "760px", margin: "0 auto" }}>
          {/* Top panel: Sell (tokenIn) */}
          <div className="swap-panel p-3" style={{ background: "#0f0f10", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexWrap: 'wrap', rowGap: '6px' }}>
              <span className="text-light" style={{ fontWeight: 600, letterSpacing: '0.2px', fontSize: '1.1rem' }}>Sell</span>
              <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-3" style={{ border: '1px solid rgba(255,255,255,0.08)', maxWidth: '75%' }}>
                {getTokenLogo(tokenIn)}
                <span style={{ fontWeight: 600, fontSize: "1rem", whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {TOKENS[tokenIn]?.displayName || TOKENS[tokenIn]?.name || tokenIn}
                </span>
              </div>
            </div>
            <div className="d-flex align-items-end justify-content-between gap-3">
              <input
                type="text"
                className="form-control form-control-lg bg-transparent text-light"
                value={amountIn}
                onChange={(e) => handleInputChange(e.target.value)}
                placeholder="0.0"
                style={{
                  border: `1px solid ${insufficientBalance ? "#dc3545" : (isActiveEntry ? "#ffffff" : "rgba(255,255,255,0.5)")}`,
                  boxShadow: "none",
                  "--placeholder-color": "#6c757d",
                  backgroundColor: (isApproving || isSwapping) ? "#1e1e22" : "transparent",
                  fontSize: "1.25rem"
                }}
                disabled={isApproving || isSwapping}
              />
            </div>
            <div className="d-flex justify-content-between mt-2">
              <small className="text-light" style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                {ratioOutPerIn
                  ? `1 ${getFullTokenName(tokenIn)} ≈ ${Number(ratioOutPerIn).toFixed(6)} ${getFullTokenName(tokenOut)}`
                  : "Fetching ratio..."}
              </small>
              <small
                className="text-light"
                style={{ cursor: (isApproving || isSwapping) ? "default" : "pointer", opacity: (isApproving || isSwapping) ? 0.7 : 1, fontWeight: 500, fontSize: '0.9rem' }}
                onClick={(isApproving || isSwapping) ? undefined : () => setAmountIn(getMaxAmount())}
              >
                Bal: {tokenInBalance ? `${parseFloat(tokenInBalance).toFixed(2)}` : "-"}
              </small>
            </div>
          </div>

          {/* Swap button between panels */}
          <div className="d-flex justify-content-center" style={{ margin: "-16px 0" }}>
            <button
              className="swap-interchange-btn btn btn-dark"
              onClick={handleInterchange}
              disabled={isApproving || isSwapping}
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                border: "1px solid rgba(255,255,255,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                boxShadow: "0 2px 10px rgba(0,0,0,0.4)",
              }}
              title="Switch direction"
            >
              <i className="bi bi-arrow-down" style={{ fontSize: "1.1rem" }}></i>
            </button>
          </div>

          {/* Bottom panel: Buy (tokenOut) */}
          <div className="swap-panel p-3 mt-0" style={{ background: "#0f0f10", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.08)" }}>
            <div className="d-flex align-items-center justify-content-between mb-2" style={{ flexWrap: 'wrap', rowGap: '6px' }}>
              <span className="text-light" style={{ fontWeight: 600, letterSpacing: '0.2px', fontSize: '1.1rem' }}>Buy</span>
              <div className="d-inline-flex align-items-center gap-2 px-3 py-1 rounded-3" style={{ border: '1px solid rgba(255,255,255,0.08)', maxWidth: '75%' }}>
                {getTokenLogo(tokenOut)}
                <span style={{ fontWeight: 600, fontSize: "1rem", whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
                  {TOKENS[tokenOut]?.displayName || TOKENS[tokenOut]?.name || tokenOut}
                </span>
              </div>
            </div>
            <input
              type="text"
              className="form-control form-control-lg bg-transparent text-light"
              placeholder="0.0"
              value={isLoading ? "Fetching..." : amountOut}
              readOnly
              style={{
                border: `1px solid ${isActiveEntry ? "#ffffff" : "rgba(255,255,255,0.5)"}`,
                background: "#1b1b1f",
                fontSize: "1.25rem"
              }}
            />
            <div className="mt-2 text-start">
              <small className="text-light" style={{ fontWeight: 500, fontSize: '0.9rem' }}>
                {ratioOutPerIn && Number(ratioOutPerIn) > 0
                  ? `1 ${getFullTokenName(tokenOut)} ≈ ${(1 / Number(ratioOutPerIn)).toFixed(6)} ${getFullTokenName(tokenIn)}`
                  : "Fetching ratio..."}
              </small>
            </div>
          </div>

          {/* Primary CTA */}
          <div className="mt-3">
            <button
              className="btn btn-primary rounded-pill w-100 py-3"
              onClick={handleSwap}
              disabled={!quoteData || isSwapping || insufficientBalance}
              style={{ fontSize: "16px", fontWeight: 600 }}
            >
              {insufficientBalance ? (
                `Insufficient ${TOKENS[tokenIn]?.symbol || tokenIn}`
              ) : (
                "Swap"
              )}
            </button>
          </div>

        </div>
      </div>
    </>
  );
};

export default SwapComponent;
