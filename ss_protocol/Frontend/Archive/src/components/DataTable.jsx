import "bootstrap/dist/css/bootstrap.min.css";
import "../Styles/DataTable.css";
import MetaMaskIcon from "../assets/metamask-icon.png";
import { useLocation } from "react-router-dom";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useEffect, useState, useMemo, useContext, useRef } from "react";
import { useAuctionTokens } from "../data/auctionTokenData";
import { useDAvContract } from "../Functions/DavTokenFunctions";
import { useAccount, useChainId } from "wagmi";
import { useAddTokens, useUsersOwnerTokens } from "../data/AddTokens";
import { explorerUrls, getAUCTIONContractAddress, getSTATEContractAddress } from "../Constants/ContractAddresses";
import IOSpinner from "../Constants/Spinner";
import TxProgressModal from "./TxProgressModal";
import { useAllTokens } from "./Swap/Tokens";
import { ContractContext } from "../Functions/ContractInitialize";
import toast from "react-hot-toast";
import { AddingTokenSteps, ERC20_ABI, isImageUrl } from "../Constants/Constants";
import { formatCountdown, formatTimeVerbose, formatWithCommas } from "../Constants/Utils";

const DataTable = () => {
  const chainId = useChainId();
  const { signer, AllContracts } = useContext(ContractContext);

  const {
    davHolds,
    davGovernanceHolds,
    deployWithMetaMask,
    isProcessing,
    pendingToken,
  } = useDAvContract();
  const { address, isConnected } = useAccount();
  const {
    swappingStates,
    buttonTextStates,
    AirDropAmount,
    setTxStatusForAdding,
    txStatusForAdding,
    AddTokenIntoSwapContract,
    isTokenSupporteed,
    renounceTokenContract,
    CheckMintBalance,
    isCliamProcessing,
    fetchUserTokenAddresses,
    CurrentCycleCount,
    handleAddToken,
    tokenMap,
    handleDexTokenSwap,
    DexswappingStates,
    giveRewardForAirdrop,
  } = useSwapContract();

  // Get auction contract address for the connected chain
  const getAuctionAddress = () => getAUCTIONContractAddress(chainId);

  const { tokens } = useAuctionTokens();
  const { tokens: Addtokens } = useAddTokens();
  const OwnersTokens = useUsersOwnerTokens();
  const location = useLocation();
  const isAuction = location.pathname === "/auction";
  const isAddToken = location.pathname === "/AddToken";

  const [errorPopup, setErrorPopup] = useState({});
  const [processingToken, setProcessingToken] = useState(null);
  const [checkingStates, setCheckingStates] = useState({});
  const [inputValues, setInputValues] = useState({});
  const [authorized, setAuthorized] = useState(false);

  const AuthAddress = import.meta.env.VITE_AUTH_ADDRESS;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (!signer || !address) return setAuthorized(false);
        // Try reading governance from SWAP on-chain
        const gov = await (async () => {
          try { return (await AllContracts?.AuctionContract?.governanceAddress())?.toLowerCase(); } catch { return null; }
        })();
        const me = address?.toLowerCase();
        if (!cancelled) setAuthorized(!!gov ? gov === me : (!!AuthAddress && me === AuthAddress?.toLowerCase()));
      } catch {
        if (!cancelled) setAuthorized(false);
      }
    })();
    return () => { cancelled = true; };
  }, [AllContracts?.AuctionContract, signer, address, AuthAddress]);
  // Handle input change for tokenAddress or pairAddress for a specific user
  const handleInputChange = (tokenName, value) => {
    setInputValues((prev) => ({
      ...prev,
      [tokenName]: value, // store pairAddress directly
    }));
  };

  const handleAdd = async (tokenAddress, tokenName, user, name) => {
    const pairAddress = inputValues[tokenName] || "";
    setProcessingToken(tokenName); // Set current token being processed
    try {
      await AddTokenIntoSwapContract(tokenAddress, pairAddress, user, name);
      await isTokenSupporteed();
    } catch (error) {
      console.error("AddTokenIntoSwapContract failed:", error);
    } finally {
      setProcessingToken(null); // Reset after processing
    }
  };

  const Checking = async (id, ContractName, AirDropAmount) => {
    setCheckingStates((prev) => ({ ...prev, [id]: true }));
    try {
      // Dynamically get address from swap.tokenMap (or pass it as prop if needed)
      const AddressMapping = tokenMap?.[ContractName];
      if (!AddressMapping) {
        throw new Error(`Token address not found for ${ContractName}`);
      }

      await CheckMintBalance(AddressMapping);
      toast.success(`Airdrop claimed successfully! ${AirDropAmount}`, { duration: 5000, position: "top-center", icon: '👏' });
    } catch (e) {
      if (
        e.reason === `No new DAV holdings for this token` ||
        (e.revert &&
          e.revert.args &&
          e.revert.args[0] === `No new DAV holdings for this token`)
      ) {
        console.error(`No new DAV holdings for this token:`, e);
        setErrorPopup((prev) => ({ ...prev, [id]: true }));
      } else {
        console.error("Error calling CheckMintBalance:", e);
      }
    }
    setCheckingStates((prev) => ({ ...prev, [id]: false }));
  };

  const [isAddingPopupOpen, setIsAddingPopUpOpen] = useState(false);

  // Show/hide popup based on txStatus
  useEffect(() => {
    if (!txStatusForAdding) {
      setIsAddingPopUpOpen(false);
      return;
    }

    setIsAddingPopUpOpen(true);

    let timer;
    if (["confirmed", "error"].includes(txStatusForAdding)) {
      timer = setTimeout(() => {
        setIsAddingPopUpOpen(false);
        setTxStatusForAdding("");
      }, 1000); // 2-second delay for confirmed and error states
    }

    return () => clearTimeout(timer);
  }, [txStatusForAdding]);

  const hasSwapped = (tokenName, tokenOutAddress) => {
    const swaps = JSON.parse(localStorage.getItem("auctionSwaps") || "{}");
    return (
      swaps[address]?.[CurrentCycleCount?.[tokenName]]?.[tokenName]?.[tokenOutAddress] || false
    );
  };

  const filteredTokens = useMemo(() => {
    return tokens.filter(({ isReversing, AuctionStatus, TimeLeft }) => {

      const isAuctionActive = AuctionStatus === "true";
      const isReverseAuction = AuctionStatus === "false" && isReversing === "true";
      const hasTimeLeft = TimeLeft > 0;

      return isAuctionActive || isReverseAuction || hasTimeLeft;
    });
  }, [tokens]);
  const TOKENS = useAllTokens();

  const stateAddress = getSTATEContractAddress(chainId)

  const handleSwapClick = (id, onlyInputAmount) => {
    try {
      const tokenOutAddress = TOKENS[id].address
      handleDexTokenSwap(
        id,
        onlyInputAmount.toString(), // Convert to string for amountIn
        signer,
        address,
        tokenOutAddress,
        ERC20_ABI,
        stateAddress,
        toast
      );
    } catch (error) {
      console.error("Error in handleSwapClick:", error);
    }
  };
  return !isConnected || !address ? (
    <div className="container text-center mt-5">
      <p className="text-light">Please connect your wallet.</p>
    </div>
  ) : isAuction ? (
    <div className="container-fluid datatablemarginbottom px-3" style={{maxWidth: '1040px'}}>
      {filteredTokens.length > 0 && (
      <div className="table-responsive ">
        <div>
          <table className="table">
            <thead>
              <tr>
                <th colSpan="100%" style={{ padding: 0, border: "none", height: 0 }}></th>
              </tr>
            </thead>
            <tbody>
              {filteredTokens.length > 0 && (
                filteredTokens.map(
                  (
                    {
                      id,
                      name,
                      emoji,
                      token,
                      SwapT,
                      ContractName,
                      isReversing,
                      AirdropClaimedForToken,
                      userHasSwapped,
                      onlyState,
                      userHasReverse,
                      AuctionStatus,
                      TimeLeft,
                      inputTokenAmount,
                      onlyInputAmount,
                      outputToken,
                    },
                    index
                  ) => (
                    <tr className="small-font-row" key={index}>
                      <td></td>
                      <td>
                        {isImageUrl(emoji) ? (
                          <img
                            src={emoji}
                            alt="token visual"
                            style={{ width: "30px", height: "30px", borderRadius: "50%" }}
                          />
                        ) : (
                          <span style={{ fontSize: "20px" }}>{emoji}</span>
                        )}
                      </td>
                      <td className="justify-content-center">{`${name}`}</td>
                      <td></td>
                      <td>
                        {" "}
                        <img
                          src={MetaMaskIcon}
                          onClick={() =>
                            handleAddToken(
                              token,
                              name === "DAV"
                                ? "pDAV"
                                : name === "STATE"
                                  ? "State"
                                  : name
                            )
                          }
                          alt="MetaMask"
                          style={{
                            width: "20px",
                            height: "20px",
                            cursor: "pointer",
                            marginLeft: "6px",
                            verticalAlign: "middle",
                          }}
                        />
                      </td>

                      <td className="timer-cell">
                        {TimeLeft == null || TimeLeft === 0 ? "Loading..." : formatCountdown(TimeLeft)}
                      </td>

                      <td style={{ position: "relative" }}>
                        <button
                          onClick={() => Checking(id, ContractName, AirDropAmount?.[name])}
                          className="btn btn-primary btn-sm swap-btn"
                          disabled={
                            checkingStates[id] ||
                            (authorized ? davGovernanceHolds : davHolds) == 0
                          }
                        >
                          {checkingStates[id]
                            ? "AIRDROPPING..."
                            : AirdropClaimedForToken == "true"
                              ? "CLAIMED ✅"
                              : AirDropAmount?.[name] && AirDropAmount[name] > 0
                                ? `${formatWithCommas(AirDropAmount[name])}`
                                : "0"}
                        </button>
                      </td>

                      <td>
                        <div className="d-flex justify-content-center gap-3 w-100">
                          {id !== "state" && (
                            <>
                              {isReversing == "true" ? (
                                <>
                                  Swap  {formatWithCommas(outputToken)}   tokens<br />
                                  for  {formatWithCommas(inputTokenAmount)} tokens
                                </>
                              ) : (
                                <>
                                  Swap  {formatWithCommas(inputTokenAmount)}   tokens<br />
                                  for  {formatWithCommas(outputToken)} tokens
                                </>
                              )}
                            </>
                          )}
                          <div className="d-flex align-items-center gap-2">
                            <button
                              onClick={() => SwapT()}
                              disabled={
                                swappingStates[id] ||
                                (isReversing == "true" ? userHasReverse == "true" || outputToken <= 1 : userHasSwapped == "true" || onlyInputAmount <= 0)
                              }
                              className="btn btn-sm swap-btn btn-primary"
                            >
                              {swappingStates[id]
                                ? "Swapping..."
                                : isReversing == "true"
                                  ? (userHasReverse == "true" ? "Reverse Swapped ✅" : "Reverse Swap")
                                  : (userHasSwapped == "true" ? "Swapped ✅" : buttonTextStates[id] || "Swap")}
                            </button>

                          </div>
                        </div>
                      </td>
                      {errorPopup[id] && (
                        <div className="popup-overlay2">
                          <div className="popup-content2">
                            <h4 className="popup-header2">
                              Mint Additional DAV Tokens
                            </h4>
                            <p className="popup-para">
                              You need to mint additional DAV tokens to claim
                              extra airdrops.
                            </p>
                            <button
                              onClick={() =>
                                setErrorPopup((prev) => ({
                                  ...prev,
                                  [id]: false,
                                }))
                              }
                              className="btn btn-secondary popup-button"
                            >
                              Close
                            </button>
                          </div>
                        </div>
                      )}
                      {isReversing == "true" ? (
                        <>
                          <td>No action required.</td>
                          <td></td>
                        </>
                      ) : (
                        <>
                          <td>
                            <div className="d-flex justify-content-center gap-3 w-100">
                              Swap {formatWithCommas(outputToken)}  tokens<br />
                              for  {id} tokens
                              <div className="d-flex align-items-center gap-2">
                                <button
                                  onClick={() => handleSwapClick(id, onlyState)}
                                  className="btn btn-sm swap-btn btn-primary"
                                  disabled={!AuctionStatus || DexswappingStates[id] || onlyState <= 0 || hasSwapped(name, token)}
                                >
                                  {DexswappingStates[id]
                                    ? "Swapping..."
                                    : hasSwapped(name, token)
                                      ? "Swapped ✅"
                                      : "Swap"}
                                </button>

                              </div>
                            </div>
                          </td>
                          <td></td>
                        </>
                      )}
                      <td></td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}
    </div>
  ) : isAddToken ? (
    <>
      <div className="container-fluid datatablemarginbottom px-3" style={{maxWidth: '1040px'}}>
        <div className="table-responsive">
          <table className="table table-dark">
            <thead>
              {authorized ? (
                <tr>
                  <th></th>
                  <th>Token Name</th>
                  <th>Deploy</th>
                  <th>Token Address/Pair</th>
                  <th>Renounced</th>
                </tr>
              ) : (
                <tr>
                  <th>Emoticon</th>
                  <th>Token Name</th>
                  <th></th>
                  <th>Token Address</th>
                  <th>Pair Address</th>
                  <th>Amount</th>
                  <th>Time To claim</th>
                  <th>Airdrop</th>
                  <th></th>
                </tr>
              )}
            </thead>
            <tbody>
              {authorized &&
                Addtokens.slice() // Create a copy to avoid mutating the original array
                  .sort((a, b) => {
                    // Normalize values to handle booleans, strings, or undefined
                    const aDeployed = String(a.isDeployed) === "true";
                    const bDeployed = String(b.isDeployed) === "true";
                    const aAdded = String(a.isAdded) === "true";
                    const bAdded = String(b.isAdded) === "true";
                    const aRenounced = String(a.isRenounceToken) === "true";
                    const bRenounced = String(b.isRenounceToken) === "true";

                    // Priority 1: isDeployed == "false", isAdded == "false", isRenounceToken == "false"
                    const aPriority1 = !aDeployed && !aAdded && !aRenounced;
                    const bPriority1 = !bDeployed && !bAdded && !bRenounced;
                    if (aPriority1 && !bPriority1) return -1;
                    if (!aPriority1 && bPriority1) return 1;

                    // Priority 2: isAdded == "false", isRenounceToken == "false"
                    const aPriority2 = !aAdded && !aRenounced;
                    const bPriority2 = !bAdded && !bRenounced;
                    if (aPriority2 && !bPriority2) return -1;
                    if (!aPriority2 && bPriority2) return 1;

                    // Priority 3: isRenounceToken == "false"
                    const aPriority3 = !aRenounced;
                    const bPriority3 = !bRenounced;
                    if (aPriority3 && !bPriority3) return -1;
                    if (!aPriority3 && bPriority3) return 1;

                    // Priority 4: Remaining tokens (maintain original order)
                    return 0;
                  })
                  .map(
                    (
                      {
                        user,
                        name,
                        Emojis,
                        isAdded,
                        isDeployed,
                        isRenounceToken,
                        TokenAddress,
                      },
                      index
                    ) => (
                      <tr key={index}>
                        <td>
                          {isImageUrl(Emojis) ? (
                            <img
                              src={Emojis}
                              alt="token visual"
                              style={{ width: "30px", height: "30px", borderRadius: "50%" }}
                            />
                          ) : (
                            <span style={{ fontSize: "20px" }}>{Emojis}</span>
                          )}
                        </td>
                        <td>
                          {name}
                        </td>
                        <td>
                          {isDeployed ? (
                            <span
                              className="badge bg-gradient bg-success px-3 py-2 rounded-pill shadow-lg"
                              style={{ fontSize: "12px" }}
                            >
                              ✅ Token Deployed
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm swap-btn btn-primary"
                              onClick={async () => {
                                try {
                                  await deployWithMetaMask(name, name);
                                  await fetchUserTokenAddresses();
                                } catch (error) {
                                  console.error("Deployment failed:", error);
                                }
                              }}
                              disabled={isProcessing == name}
                            >
                              {isProcessing == name ? "Deploying..." : "Deploy"}
                            </button>
                          )}
                        </td>
                        <td>
                          {isAdded ? (
                            <span
                              className="badge bg-gradient bg-success px-3 py-2 rounded-pill shadow-lg"
                              style={{ fontSize: "12px" }}
                            >
                              ✅ Token Added
                            </span>
                          ) : (
                            <div className="d-flex align-items-center justify-content-center gap-2">
                              <div
                                onClick={() => {
                                  if (TokenAddress) {
                                    navigator.clipboard.writeText(TokenAddress);
                                    alert("Address copied to clipboard!");
                                  }
                                }}
                                className={
                                  TokenAddress ? "clickable-TokenAddress" : ""
                                }
                                title={
                                  TokenAddress
                                    ? "Click to copy full TokenAddress"
                                    : ""
                                }
                                style={{
                                  minWidth: "100px",
                                  textAlign: "center",
                                  cursor: "pointer",
                                }}
                              >
                                {TokenAddress
                                  ? `${TokenAddress.slice(
                                    0,
                                    6
                                  )}...${TokenAddress.slice(-4)}`
                                  : "N/A"}
                              </div>

                              <input
                                type="text"
                                className="form-control form-control-sm"
                                placeholder="Enter Pair Address"
                                value={inputValues[name] || ""}
                                onChange={(e) =>
                                  handleInputChange(name, e.target.value)
                                }
                                style={{
                                  width: "140px",
                                  "--placeholder-color": "#6c757d",
                                }}
                              />
                              <button
                                className="btn btn-sm swap-btn btn-primary"
                                onClick={() =>
                                  handleAdd(TokenAddress, name, user, name)
                                }
                                disabled={processingToken === name}
                              >
                                {processingToken === name ? (
                                  <>
                                    <IOSpinner className="me-2" />
                                    Processing...
                                  </>
                                ) : (
                                  "Add"
                                )}
                              </button>
                            </div>
                          )}
                        </td>
                        <td>
                          {isRenounceToken == "true" ? (
                            <span
                              className="badge bg-gradient bg-success px-3 py-2 rounded-pill shadow-lg"
                              style={{ fontSize: "12px" }}
                            >
                              ✅ Token Renounced
                            </span>
                          ) : (
                            <button
                              className="btn btn-sm swap-btn btn-primary"
                              onClick={() =>
                                renounceTokenContract(TokenAddress, name)
                              }
                            >
                              Renounce
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  )}
              {!authorized && (
                <>
                  {pendingToken && (
                    <tr>
                      <td
                        colSpan={14}
                        style={{
                          textAlign: "center",
                          fontWeight: "bold",
                        }}
                      >
                        {`${pendingToken} Token will be listed in 24-48 hr`}
                      </td>
                    </tr>
                  )}
                  {OwnersTokens.map(
                    (
                      { name, address, pairAddress, Emojis, nextClaimTime },
                      index
                    ) => (
                      <tr key={index}>
                        <td>
                          {isImageUrl(Emojis) ? (
                            <img
                              src={Emojis}
                              alt="token visual"
                              style={{ width: "30px", height: "30px", borderRadius: "50%" }}
                            />
                          ) : (
                            <span style={{ fontSize: "20px" }}>{Emojis}</span>
                          )}
                        </td>
                        <td className="justify-content-center">{`${name}`}</td>{" "}
                        <td></td>
                        <td
                          onClick={() => {
                            if (address) {
                              navigator.clipboard.writeText(address);
                              alert("Address copied to clipboard!");
                            }
                          }}
                          className={address ? "clickable-address" : ""}
                          title={address ? "Click to copy full address" : ""}
                        >
                          {address
                            ? `${address.slice(0, 6)}...${address.slice(-4)}`
                            : "N/A"}
                        </td>
                        <td
                          onClick={() => {
                            if (pairAddress) {
                              navigator.clipboard.writeText(pairAddress);
                              alert("Address copied to clipboard!");
                            }
                          }}
                          className={pairAddress ? "clickable-pairAddress" : ""}
                          title={
                            pairAddress ? "Click to copy full pairAddress" : ""
                          }
                        >
                          {pairAddress
                            ? `${pairAddress.slice(0, 6)}...${pairAddress.slice(
                              -4
                            )}`
                            : "N/A"}
                        </td>
                        <td>1,000,000</td>
                        <td>{formatTimeVerbose(nextClaimTime)}</td>
                        <td>
                          <button
                            className="btn btn-sm swap-btn btn-primary"
                            onClick={() => giveRewardForAirdrop(address)}
                            disabled={
                              isCliamProcessing == address || nextClaimTime > 0
                            }
                          >
                            {isCliamProcessing == address
                              ? "Processing..."
                              : "Claim"}
                          </button>
                        </td>
                        <td></td>
                      </tr>
                    )
                  )}
                </>
              )}
            </tbody>
          </table>

        </div>
        <TxProgressModal steps={AddingTokenSteps} isOpen={isAddingPopupOpen} txStatus={txStatusForAdding} />
      </div>
    </>
  ) : (
    <></>
  );
};

export default DataTable;
