import "bootstrap/dist/css/bootstrap.min.css";
import "../../Styles/InfoCards.css";
import { useEffect, useRef, useState, useContext } from "react";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import DotAnimation from "../../Animations/Animation";
import { useAccount, useChainId } from "wagmi";
import { ContractContext } from "../../Functions/ContractInitialize";
import IOSpinner from "../../Constants/Spinner";
import { chainCurrencyMap } from "../../../WalletConfig";
import { formatWithCommas } from "../../Constants/Utils";
import toast from "react-hot-toast";

const BurnSection = () => {
    const { address } = useAccount();
    const { AllContracts, provider } = useContext(ContractContext);
    const chainId = useChainId();
    const {
        BurnStateTokens,
        claimableAmountForBurn,
        userBurnedAmountInCycle,
        userBurnedAmount,
        ContractPls,
        isLoading,
        davHolds,
        davGovernanceHolds,
        UserPercentage,
        usableTreasury,
        BurnClicked,
        Claiming,
        CanClaimNow,
        TimeUntilNextClaim,
        hasClaimingStarted,
        stateHolding,
        claimBurnAmount,
    } = useDAvContract();
    const [amountOfInput, setAmountOfInput] = useState("");
    const [rawAmount, setRawAmount] = useState("");
    const customWidth = "180px";
    const AuthAddress = import.meta.env.VITE_AUTH_ADDRESS;
    const [isGov, setIsGov] = useState(false);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                if (!AllContracts?.AuctionContract || !address) return;
                const gov = (await (provider ? AllContracts.AuctionContract.connect(provider) : AllContracts.AuctionContract).governanceAddress()).toLowerCase();
                const me = address.toLowerCase();
                if (!cancelled) setIsGov(gov === me);
            } catch {
                if (!cancelled) setIsGov(!!AuthAddress && address?.toLowerCase() === AuthAddress?.toLowerCase());
            }
        })();
        return () => { cancelled = true; };
    }, [AllContracts?.AuctionContract, provider, address, AuthAddress]);
    const nativeSymbol = chainCurrencyMap[chainId] || 'PLS';

    const handleBurnClick = async () => {
        const amountToBurn = rawAmount.trim() === "" ? stateHolding : rawAmount;
        try {
            await BurnStateTokens(amountToBurn);
            setAmountOfInput("");
        } catch (error) {
            console.error("Burn failed:", error);
        }
    };
    const handleInputChangeForBurn = (e) => {
        const input = e.target.value.replace(/,/g, "");
        if (!isNaN(input)) {
            setRawAmount(input);
            setAmountOfInput(Number(input).toLocaleString("en-US"));
        } else if (input === "") {
            setRawAmount("");
            setAmountOfInput("");
        }
    };

    return (
        <div className="container mt-4">
            <div className="row g-4 d-flex align-items-stretch pb-1">
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-3 d-flex w-100" style={{ minHeight: "260px" }}>
                        <div>
                            <div className="carddetaildiv uppercase d-flex justify-content-between align-items-center">
                                <div className="carddetails2 mb-4">
                                    <div className="d-flex justify-content-center">
                                        <p className="mb-1 detailText">TREASURY</p>
                                    </div>
                                    <div className="d-flex justify-content-center">
                                        <h5>{formatWithCommas(ContractPls)} {nativeSymbol}</h5>
                                    </div>
                                </div>
                            </div>
                            <div className="carddetails2">
                                <div className="d-flex justify-content-center">
                                    <p className="mb-1 detailText">ACTIVE DAV</p>
                                </div>
                                <div className="d-flex justify-content-center">
                                    <h5>
                                        {isGov ? (
                                            <>{isLoading ? <DotAnimation /> : davGovernanceHolds}</>
                                        ) : (
                                            <>{isLoading ? <DotAnimation /> : davHolds}</>
                                        )}
                                    </h5>
                                </div>
                            </div>
                            <div className="carddetails2">
                                <h6 className="detailText mt-3 text-center" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                    A MINIMUM OF 1 DAV TOKENS ARE REQUIRED TO CLAIM REWARDS
                                </h6>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-0 d-flex justify-content-start align-items-center text-center w-100">
                        <div className="p-2 pt-3 pb-2">
                            <p className="mb-2 detailText">STATE TOKENS BURN</p>
                            <div className="d-flex align-items-center gap-2">
                                <input
                                    type="text"
                                    placeholder={formatWithCommas(stateHolding)}
                                    className="form-control text-center fw-bold"
                                    style={{ "--placeholder-color": "#6c757d" }}
                                    value={amountOfInput}
                                    onChange={handleInputChangeForBurn}
                                />
                            </div>
                            <button
                                onClick={async () => {
                                    setTimeout(async () => {
                                        try {
                                            await handleBurnClick();
                                        } catch (err) {
                                            console.error("Burn failed:", err);
                                        }
                                    }, 100);
                                }}
                                style={{ width: customWidth }}
                                className="btn btn-primary mx-5 mt-5 btn-sm d-flex justify-content-center align-items-center"
                                disabled={BurnClicked}
                            >
                                Burn
                            </button>

                        </div>
                        <div className="carddetails2">
                            <h6 className="detailText mb-0" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                % BURNED BY YOU - {UserPercentage}%
                            </h6>
                            <h6 className="detailText mb-0" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                BURNED BY YOU - {formatWithCommas(userBurnedAmount)}
                            </h6>
                            <h6 className="detailText mb-0" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                CURRENT CYCLE BURN - {formatWithCommas(userBurnedAmountInCycle)}
                            </h6>
                        </div>
                    </div>
                </div>
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-0 d-flex justify-content-start align-items-center text-center w-100">
                        <div className="p-2 pt-3 pb-2">
                            <p className="mb-2 detailText">EXPECTED CLAIM</p>
                            <div className="d-flex justify-content-center">
                                <h5 className="mt-2">{formatWithCommas(claimableAmountForBurn)} {nativeSymbol} </h5>
                            </div>
                            <div className="d-flex justify-content-center mt-4">
                                <button
                                    onClick={() => {
                                        setTimeout(async () => {
                                            try {
                                                await claimBurnAmount();
                                            } catch (err) {
                                                console.error("Claim failed:", err);
                                            }
                                        }, 100);
                                    }}
                                    style={{ width: customWidth }}
                                    className="btn btn-primary btn-sm d-flex justify-content-center align-items-center"
                                    disabled={Claiming || claimableAmountForBurn == 0 || CanClaimNow === "false"}
                                >
                                    Claim
                                </button>
                            </div>
                        </div>
                        <div className="carddetails2">
                            <h6 className="detailText mb-1" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                {hasClaimingStarted == "false" ? (
                                    "Not started"
                                ) : (
                                    <>
                                        {Math.floor(TimeUntilNextClaim / 86400)}<span style={{ textTransform: "none" }}>d</span>{" "}
                                        {Math.floor((TimeUntilNextClaim % 86400) / 3600)}<span style={{ textTransform: "none" }}>h</span>{" "}
                                        {Math.floor((TimeUntilNextClaim % 3600) / 60)}<span style={{ textTransform: "none" }}>m</span>{" "}
                                        {TimeUntilNextClaim % 60}<span style={{ textTransform: "none" }}>s</span>
                                    </>
                                )}
                            </h6>
                            <h6 className="detailText mb-0" style={{ fontSize: "14px", textTransform: "capitalize" }}>
                                CLAIMABLE TREASURY - {formatWithCommas(usableTreasury)} {nativeSymbol}
                            </h6>
                        </div>
                    </div>
                </div>
            </div>
        </div>

    );
};

export default BurnSection;