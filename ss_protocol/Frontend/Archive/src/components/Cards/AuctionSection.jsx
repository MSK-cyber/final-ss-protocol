import "bootstrap/dist/css/bootstrap.min.css";
import "../../Styles/InfoCards.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import "@fortawesome/fontawesome-free/css/all.min.css";
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import PLSLogo from "../../assets/pls1.png";
import BNBLogo from "../../assets/bnb.png";
import matic from "../../assets/matic-token-icon.png";
import sonic from "../../assets/S_token.svg";
import { TokensDetails } from "../../data/TokensDetails";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import DotAnimation from "../../Animations/Animation";
import { useAccount, useChainId } from "wagmi";
import { faCheck, faCopy } from "@fortawesome/free-solid-svg-icons";
import toast from "react-hot-toast";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { chainCurrencyMap } from "../../../WalletConfig";
import useTokenBalances from "../Swap/UserTokenBalances";
import { useAllTokens } from "../Swap/Tokens";
import { ContractContext } from "../../Functions/ContractInitialize";
import { notifyError } from "../../Constants/Constants";
import { calculatePlsValueNumeric, formatNumber, formatWithCommas } from "../../Constants/Utils";

const AuctionSection = () => {
    const chainId = useChainId();
    const { tokens } = TokensDetails();
    const TOKENS = useAllTokens();
    const { signer, AllContracts, contracts } = useContext(ContractContext);
    const tokenBalances = useTokenBalances(TOKENS, signer);
    const { address } = useAccount();
    const {
        mintDAV,
        claimableAmount,
        isLoading,
        claimAmount,
        isClaiming,
        davHolds,
        davExpireHolds,
        ReferralAMount,
        stateHolding,
        DavMintFee,
        ReferralCodeOfUser,
        davGovernanceHolds,
        totalInvestedPls,
    } = useDAvContract();
    const { CalculationOfCost, TotalCost, getAirdropAmount, getInputAmount, getOutPutAmount, pstateToPlsRatio, DaipriceChange } = useSwapContract();
    const [amount, setAmount] = useState("");
    const [Refferalamount, setReferralAmount] = useState("");
    const [load, setLoad] = useState(false);
    const [copied, setCopied] = useState(false);
    const [copiedCode, setCopiedCode] = useState("");
    const AuthAddress = import.meta.env.VITE_AUTH_ADDRESS;
    const [isGov, setIsGov] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!AllContracts?.AuctionContract || !address) return;
                const gov = (await AllContracts.AuctionContract.governanceAddress()).toLowerCase();
                const me = address.toLowerCase();
                if (!cancelled) setIsGov(gov === me);
            } catch {
                // Fallback to env if contract read not available
                if (!cancelled) setIsGov(!!AuthAddress && address?.toLowerCase() === AuthAddress?.toLowerCase());
            }
        })();
        return () => { cancelled = true; };
    }, [AllContracts?.AuctionContract, address, AuthAddress]);

    const nativeSymbol = chainCurrencyMap[chainId] || 'PLS';
    const setBackLogo = () => {
        if (chainId === 369) return PLSLogo;
        else if (chainId === 56) return BNBLogo;
        else if (chainId === 137) return matic;
        else if (chainId === 146) return sonic;
        return PLSLogo;
    };
    const getLogoSize = () => {
        return chainId === 56
            ? { width: "170px", height: "140px" }
            : chainId === 369
                ? { width: "110px", height: "110px" }
                : chainId === 137
                    ? { width: "110px", height: "110px" }
                    : { width: "110px", height: "140px" }
    };

    const handleMint = () => {
        // Pre-validations for better UX
        if (!amount || amount.trim() === "") {
            notifyError("Enter mint amount");
            return;
        }
        if (amount === "0") {
            notifyError("Amount must be greater than zero");
            return;
        }
        if (!/^[0-9]+$/.test(amount)) { // Should already be enforced, but double-safety
            notifyError("Amount must be a whole number");
            return;
        }
        if (!DavMintFee || DavMintFee === "0" || DavMintFee === "0.0") {
            notifyError("Mint price not loaded yet – please wait a moment");
            return;
        }
        if (isGov) {
            notifyError("Governance cannot mint DAV");
            return;
        }
        setLoad(true);
        setTimeout(async () => {
            try {
                const tx = await mintDAV(amount, Refferalamount);
                if (tx) {
                    await Promise.all([
                        getAirdropAmount(),
                        getInputAmount(),
                        getOutPutAmount()
                    ]);
                }
                setAmount("");
                setReferralAmount("");
            } catch (error) {
                // Enhanced error surface
                let msg = "Minting failed";
                const lower = (error?.message || "").toLowerCase();
                if (error?.reason) msg = error.reason;
                else if (error?.data?.message) msg = error.data.message;
                else if (lower.includes("pool not ready")) msg = "Pool not ready - please refresh (governance may still be configuring)";
                else if (lower.includes("incorrect pls amount")) msg = "Incorrect PLS sent – refresh price and retry";
                else if (lower.includes("max holders")) msg = "Max holders reached";
                else if (lower.includes("governance cannot mint")) msg = "Governance wallet cannot mint";
                else if (lower.includes("amount must be a whole")) msg = "Amount must be a whole number";
                else if (lower.includes("max supply")) msg = "Mint cap reached";
                else if (lower.includes("user rejected") || lower.includes("rejected")) msg = "Transaction rejected";
                console.error("Minting error (decoded):", error);
                notifyError(msg);
            } finally {
                setLoad(false);
            }
        }, 0);
    };

    const handleInputChange = (e) => {
        if (/^\d*$/.test(e.target.value)) {
            setAmount(e.target.value);
        }
        CalculationOfCost(e.target.value);
    };
    // Helper to calculate total sum
    const calculateTotalSum = () => {
        return tokens.reduce((sum, token) => {
            return sum + calculatePlsValueNumeric(token, tokenBalances, pstateToPlsRatio);
        }, 0);
    };

    const handleOptionalInputChange = (e) => {
        setReferralAmount(e.target.value);
    };

    useEffect(() => {
        CalculationOfCost(amount);
    }, [CalculationOfCost, amount]);

    const invested = Number(totalInvestedPls);
    const totalSum = Number(calculateTotalSum());

    const roi = invested > 0 ? (totalSum / invested) * 100 : 0;
    const apr = invested > 0 ? (totalSum / invested) * 36500 : 0;
    return (
        <div className="container mt-4">
            <div className="row g-4 d-flex align-items-stretch pb-1">
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-3 text-center w-100" style={{ minHeight: "260px" }}>
                        {/* Auction timer moved to Auction header */}
                        <div className="mb-2 d-flex justify-content-center align-items-center gap-2">
                            <div className="floating-input-container" style={{ maxWidth: "300px" }}>
                                <input
                                    type="text"
                                    id="affiliateLink"
                                    list="referralSuggestions"
                                    className={`form-control text-center fw-bold ${Refferalamount ? "filled" : ""}`}
                                    value={Refferalamount}
                                    onChange={handleOptionalInputChange}
                                    style={{ height: "38px", color: "#ffffff" }}
                                />
                                <label htmlFor="affiliateLink" className="floating-label">
                                    Affiliate Link - Optional
                                </label>
                                <datalist id="referralSuggestions">
                                    {copiedCode && <option value={copiedCode} />}
                                </datalist>
                            </div>
                        </div>
                        <div className="mt-2 mb-2 d-flex justify-content-center align-items-center">
                            <div className="floating-input-container" style={{ maxWidth: "300px" }}>
                                <input
                                    type="text"
                                    id="mintAmount"
                                    className={`form-control text-center fw-bold ${amount ? "filled" : ""}`}
                                    value={amount}
                                    onChange={handleInputChange}
                                    required
                                    style={{ height: "38px", color: "#ffffff" }}
                                />
                                <label htmlFor="mintAmount" className="floating-label">
                                    Mint DAV Token - Enter Amount
                                </label>
                            </div>
                        </div>
                        <h5 className="detailAmount">1 DAV TOKEN = {formatWithCommas(DavMintFee)} {nativeSymbol}</h5>
                        {/* Dynamically show total PLS = amount * DavMintFee for instant feedback */}
                        <h5 className="detailAmount mb-4">
                            {(() => {
                                const qty = Number(amount || 0);
                                const fee = parseFloat(DavMintFee || "0");
                                if (!qty || !fee) return "0";
                                const total = qty * fee;
                                // Use more decimals for very small fees to avoid showing 0
                                const decimals = fee < 1 ? 4 : 2;
                                return `${formatWithCommas(total.toFixed(decimals))}`;
                            })()} {nativeSymbol}
                        </h5>

                        <div className="d-flex justify-content-center">
                            <button
                                onClick={() => {
                                    if (isGov) {
                                        notifyError("Governance cannot mint DAV");
                                        return;
                                    }
                                    handleMint();
                                }}
                                className="btn btn-primary btn-sm mb-0"
                                style={{ width: "200px" }}
                                disabled={load || isGov}
                                title={isGov ? "Governance cannot mint DAV" : "Mint DAV"}
                            >
                                {load ? "Minting..." : "Mint"}
                            </button>
                        </div>
                    </div>
                </div>
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-3 d-flex w-100">
                        <img
                            src={setBackLogo()}
                            alt="native currency Logo"
                            style={{
                                position: "absolute",
                                ...getLogoSize(),
                                opacity: 0.1,
                                top: "25%",
                                left: "80%",
                                transform: "translate(-50%, -50%)",
                                zIndex: 0,
                                pointerEvents: "none",
                            }}
                        />
                        <div>
                            <div className="carddetaildiv uppercase d-flex justify-content-between align-items-center">
                                <div className="carddetails2">
                                    <div className="d-flex align-items-center gap-2">
                                        <p className="mb-1 detailText">ACTIVE DAV / EXPIRED DAV</p>
                                        {isGov && (
                                            <span className="badge bg-info text-dark" title="You are connected with governance">
                                                Governance
                                            </span>
                                        )}
                                    </div>
                                    <div className="d-flex">
                                        <h5>
                                            {isGov ? (
                                                <>{isLoading ? <DotAnimation /> : davGovernanceHolds}</>
                                            ) : (
                                                <>{isLoading ? <DotAnimation /> : davHolds}</>
                                            )}{" "}
                                            / {isLoading ? <DotAnimation /> : davExpireHolds}
                                        </h5>
                                    </div>
                                </div>
                            </div>
                            <div className="carddetails2 mt-1">
                                <h6 className="detailText d-flex" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                    {chainId == 146 ? "SONIC - SWAP LEVY" : "GAS SWAP LEVY"}
                                </h6>
                                <h5>{formatWithCommas(claimableAmount)} {nativeSymbol}</h5>
                                <div className="d-flex justify-content-center">
                                    <button
                                        onClick={async () => {
                                            setTimeout(async () => {
                                                try {
                                                    await claimAmount();
                                                } catch (error) {
                                                    console.error("Error claiming:", error);
                                                    alert("Claiming failed! Please try again.");
                                                }
                                            }, 100);
                                        }}
                                        className="btn btn-primary d-flex btn-sm justify-content-center align-items-center mx-5 mt-4"
                                        style={{ width: "190px" }}
                                        disabled={Number(claimableAmount) === 0 || isClaiming}
                                    >
                                        {isClaiming ? "Claiming..." : "Claim"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-3 d-flex w-100">
                        <div>
                            <div className="carddetaildiv uppercase d-flex justify-content-between align-items-center">
                                <div className="carddetails2">
                                    <p className="mb-1">
                                        <span className="detailText">
                                            State Token Holding -{" "}
                                        </span>
                                        <span className="second-span-fontsize">{formatWithCommas(stateHolding)}</span>
                                    </p>
                                    <p className="mb-1">
                                        <span className="detailText">Affiliate com received - </span>
                                        <span className="second-span-fontsize">{formatWithCommas(ReferralAMount)} {nativeSymbol}</span>
                                    </p>
                                    <p className="mb-1 ">
                                        <span className="detailText">Your Affiliate Link - </span>
                                        <span className="second-span-fontsize" style={{ textTransform: "none" }}>{ReferralCodeOfUser}</span>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(ReferralCodeOfUser);
                                                setCopied(true);
                                                setCopiedCode(ReferralCodeOfUser);
                                                setTimeout(() => setCopied(false), 2000);
                                            }}
                                            className="btn btn-outline-light btn-sm py-0 px-2 mx-2"
                                            style={{ fontSize: "14px" }}
                                            title={copied ? "Copied!" : "Copy"}
                                        >
                                            <FontAwesomeIcon icon={copied ? faCheck : faCopy} />
                                        </button>
                                    </p>
                                    <p className="mb-1">
                                        <span className="detailText">
                                            ROI / {nativeSymbol} -
                                        </span>
                                        <span className="ms-1 second-span-fontsize">
                                            {isLoading ? <DotAnimation /> : `${(formatWithCommas(totalInvestedPls)) || "0"}`} / {" "}
                                            <span style={{
                                                color: calculateTotalSum() > (totalInvestedPls || 0) ? '#28a745' : '#ff4081'
                                            }}>
                                                {isLoading ? (
                                                    <DotAnimation />
                                                ) : isNaN(calculateTotalSum()) ? (
                                                    "Token Listing Process.."
                                                ) : (
                                                    formatWithCommas(Math.floor(calculateTotalSum()) || 0)
                                                )} {nativeSymbol}
                                            </span>
                                        </span>
                                    </p>
                                    <p className="mb-1">
                                        <span className="detailText">USER ROI % -</span>
                                        <span className="ms-1 second-span-fontsize">
                                            {isLoading ? <DotAnimation /> : formatWithCommas(roi.toFixed(0))} %
                                        </span>
                                    </p>

                                    <p className="mb-1">
                                        <span className="detailText">USER APR % -</span>
                                        <span className="ms-1 second-span-fontsize">
                                            {isLoading ? <DotAnimation /> : formatWithCommas(apr.toFixed(0))} %
                                        </span>
                                    </p>
                                    <p className="mb-1">
                                        <span className="detailText">{nativeSymbol} INDEX FUND -</span>
                                        <span className="ms-1 second-span-fontsize">
                                            {isLoading ? (
                                                <DotAnimation />
                                            ) : (
                                                <>
                                                    <span
                                                        style={{
                                                            color: DaipriceChange > 0 ? '#28a745' : DaipriceChange < 0 ? '#ff4081' : '#ffffff'
                                                        }}  >
                                                        ({DaipriceChange} %)
                                                    </span>{" "}
                                                    {formatWithCommas(
                                                        parseFloat(Math.max(calculateTotalSum() * DaipriceChange, 0) / 100).toFixed(2)
                                                    )}{" "}
                                                    {nativeSymbol}
                                                </>
                                            )}
                                        </span>
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div >
    );
};

export default AuctionSection;