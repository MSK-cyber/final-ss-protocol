import "bootstrap/dist/css/bootstrap.min.css";
import "../../Styles/InfoCards.css";
import { useMemo, useState } from "react";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import IOSpinner from "../../Constants/Spinner";
import { chainCurrencyMap } from "../../../WalletConfig";
import { useChainId } from "wagmi";
// No fee display needed; contracts no longer require a token processing fee

const AddTokenSection = () => {
    const chainId = useChainId();
    const { deployWithMetaMask, isProcessingToken } = useDAvContract();
    const [TokenName, setTokenName] = useState("");
    const [TokenSymbol, setTokenSymbol] = useState("");
    const customWidth = "180px";
    const nativeSymbol = chainCurrencyMap[chainId] || 'PLS';
    const handleTokenProcess = async () => {
        try {
            const name = (TokenName || "").trim();
            const symbol = (TokenSymbol || "").trim();
            if (!name || !symbol) {
                alert("Please enter token name and symbol.");
                return;
            }
            await deployWithMetaMask(name, symbol);
            setTokenName("");
            setTokenSymbol("");
        } catch (err) {
            console.error("Error processing token:", err);
        }
    };

    const handleWithDelay = (fn, delay = 100) => {
        setTimeout(async () => {
            try {
                await fn();
            } catch (err) {
                console.error("Async function failed:", err);
            }
        }, delay);
    };

    const handleInputChangeForAddtoken = (value) => { setTokenName(value); };
    const handleInputChangeForSymbol = (value) => { setTokenSymbol(value); };

        // Deterministic identicon SVG dataURL from token name
        const identiconDataUrl = useMemo(() => {
                const name = (TokenName || "").trim();
                if (!name) return "";
                // Simple hash
                let h = 0;
                for (let i=0;i<name.length;i++){ h = (h * 31 + name.charCodeAt(i)) >>> 0; }
                const size = 5; // 5x5
                const cell = 20;
                const pad = 4;
                const w = size*cell + pad*2;
                const bg = "#0b0f17"; // dark bg to match theme
                const hue = h % 360;
                const color = `hsl(${hue},70%,55%)`;
                const blocks = [];
                for (let y=0;y<size;y++){
                    for(let x=0;x<Math.ceil(size/2);x++){
                        // mirror horizontally
                        const bit = (h >> ((y*size + x) % 31)) & 1;
                        if (bit){
                            const rx = pad + x*cell;
                            const lx = pad + (size-1-x)*cell;
                            const ypx = pad + y*cell;
                            blocks.push(`<rect x="${rx}" y="${ypx}" width="${cell}" height="${cell}"/>`);
                            if (lx !== rx) blocks.push(`<rect x="${lx}" y="${ypx}" width="${cell}" height="${cell}"/>`);
                        }
                    }
                }
                const svg = `<?xml version='1.0' encoding='UTF-8'?>\n`+
                    `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${w}' viewBox='0 0 ${w} ${w}'>`+
                    `<rect width='100%' height='100%' fill='${bg}'/>`+
                    `<g fill='${color}'>${blocks.join("")}</g>`+
                    `</svg>`;
                return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
        }, [TokenName]);

    // No token fee in new contracts; no adjusted fee needed

    return (
        <div className="container mt-4">
            <div className="row g-4 d-flex align-items-stretch pb-1">
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-0 d-flex justify-content-start align-items-center text-center w-100" style={{ minHeight: "260px" }}>
                        <div className="p-2 pt-3 pb-2">
                            <p className="mb-2 detailText">ADD TOKEN NAME & SYMBOL</p>
                            <div className="mb-2 d-flex align-items-center gap-2">
                                <div className="floating-input-container" style={{ maxWidth: "300px" }}>
                                    <input
                                        type="text"
                                        className={`form-control text-center fw-bold ${TokenName ? "filled" : ""}`}
                                        style={{ "--placeholder-color": "#6c757d" }}
                                        value={TokenName}
                                        maxLength={11}
                                        disabled={isProcessingToken}
                                        onChange={(e) => handleInputChangeForAddtoken(e.target.value.toUpperCase())}
                                    />
                                    <label htmlFor="affiliateLink" className="floating-label">Enter Token Name</label>
                                </div>
                                <div className="floating-input-container" style={{ maxWidth: "180px" }}>
                                    <input
                                        type="text"
                                        className={`form-control text-center fw-bold ${TokenSymbol ? "filled" : ""}`}
                                        style={{ "--placeholder-color": "#6c757d" }}
                                        value={TokenSymbol}
                                        maxLength={6}
                                        disabled={isProcessingToken}
                                        onChange={(e) => handleInputChangeForSymbol(e.target.value.toUpperCase())}
                                    />
                                    <label htmlFor="tokenSymbol" className="floating-label">Symbol</label>
                                </div>
                            </div>
                            {/* Emoji/Image inputs removed: identicon will be auto-generated */}
                        </div>
                    </div>
                </div>
                {/* Identicon preview */}
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-0 d-flex justify-content-center align-items-center text-center w-100" style={{ minHeight: "260px" }}>
                        <div className="p-2 pt-3 pb-2">
                            <p className="mb-3 detailText">IDENTICON PREVIEW</p>
                            {identiconDataUrl ? (
                              <img src={identiconDataUrl} alt="identicon" style={{ width: 120, height: 120, borderRadius: 12, border: '1px solid #222' }} />
                            ) : (
                              <div className="text-muted">Enter a token name to preview</div>
                            )}
                        </div>
                    </div>
                </div>
                <div className="col-md-4 p-0 m-2 cards">
                    <div className="card bg-dark text-light border-light p-0 d-flex justify-content-start align-items-center text-center w-100 ">
                        <div className="p-2 pt-3 pb-2">
                            <p className="mb-2 detailText ">DEPLOY</p>
                            <h6 className="text-center mt-3 text-success">No fee required</h6>

                            <button
                                onClick={() => handleWithDelay(handleTokenProcess)}
                                style={{ width: customWidth }}
                                className="btn btn-primary mx-5 mt-4 btn-sm d-flex justify-content-center align-items-center"
                                disabled={isProcessingToken}
                            >
                                {isProcessingToken ? (
                                    <>
                                        <IOSpinner className="me-2" />
                                        Processing...
                                    </>
                                ) : (
                                    "Deploy"
                                )}
                            </button>
                        </div>
                        <h6 className="mt-4 text-muted">A deterministic identicon will be used for the token icon.</h6>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AddTokenSection;