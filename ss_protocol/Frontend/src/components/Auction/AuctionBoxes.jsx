import React, { useMemo, useContext, useState, useEffect } from "react";
import "../../Styles/AuctionBoxes.css";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { useAuctionTokens } from "../../data/auctionTokenData";
import { formatWithCommas } from "../../Constants/Utils";
import { useAccount, useChainId } from "wagmi";
import { ContractContext } from "../../Functions/ContractInitialize";
import { useAllTokens } from "../Swap/Tokens";
import { getSTATEContractAddress } from "../../Constants/ContractAddresses";
import { ERC20_ABI } from "../../Constants/Constants";
import toast from "react-hot-toast";
import MetaMaskIcon from "../../assets/metamask-icon.png";

const AuctionBoxes = () => {
		const {
			isReversed = {},
			IsAuctionActive = {},
			AirDropAmount = {},
			handleDexTokenSwap,
			performRatioSwap,
			CheckMintBalance,
			handleAddToken,
			SwapTokens,
			AuctionTime,
		} = useSwapContract();
		const { tokens } = useAuctionTokens();
		const { signer } = useContext(ContractContext);
		const { address } = useAccount();
		const chainId = useChainId();
		const TOKENS = useAllTokens();

	// Decide page-level mode: reverse if any token marked reversed and no normal auction active
					const candidates = useMemo(() => {
						if (!tokens || tokens.length === 0) return [];
						const withTime = (t) => Number(t.TimeLeft) || 0;

						// Prefer showing active/reverse/with-time tokens, but don't block UI if none match
						const list = tokens.filter(
							(t) => t.AuctionStatus === "true" || (t.AuctionStatus === "false" && t.isReversing === "true") || withTime(t) > 0
						);

						// Fallback: show all tokens so user can still attempt actions; on-chain checks will guard
						const visible = list.length > 0 ? list : tokens;

						const normal = visible
							.filter((t) => t.AuctionStatus === "true")
							.sort((a, b) => withTime(a) - withTime(b));
						const reverse = visible.filter((t) => t.isReversing === "true");
						return normal.length > 0 ? normal : (reverse.length > 0 ? reverse : visible);
					}, [tokens]);

					const [index, setIndex] = useState(0);
					useEffect(() => {
						setIndex(0);
					}, [JSON.stringify(candidates)]);

					const selected = candidates && candidates.length > 0 ? candidates[Math.min(index, candidates.length - 1)] : null;


			const mode = useMemo(() => {
				if (!selected) return "normal";
				const rev = selected.isReversing === "true" && selected.AuctionStatus !== "true";
				return rev ? "reverse" : "normal";
			}, [selected]);

		const isReverse = mode === "reverse";

		const stateAddress = getSTATEContractAddress(chainId);

		const airdropAmount = selected ? AirDropAmount?.[selected.id] : 0;
		const burnAmount = selected?.onlyInputAmount || 0;
		const stateOut = selected?.onlyState || 0;

		const addToMetaMask = async () => {
			if (!selected) { toast.error("No token selected"); return; }
			await handleAddToken(
				TOKENS[selected.id]?.address || selected.address,
				selected.id,
				TOKENS[selected.id]?.decimals || 18
			);
		};

	const [busy, setBusy] = useState(false);

		const doClaim = async () => {
			if (busy) return;
			if (!address) { toast.error("Connect your wallet to continue"); return; }
			setBusy(true);
			try { await CheckMintBalance(); } finally { setBusy(false); }
		};

			const doRatioSwap = async () => {
			if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
			toast("Starting Ratio Swap…");
			setBusy(true);
			try {
					const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
					const id = selected?.id || 'GLOBAL';
					await performRatioSwap(id, selected?.id, tokenAddress);
			} finally { setBusy(false); }
		};

		const doDexSwap = async () => {
			if (!selected || !address || busy) { if (!address) toast.error("Connect your wallet to continue"); if (!selected) toast.error("No active token selected"); return; }
			const tokenOutAddress = TOKENS[selected.id]?.address;
			if (!tokenOutAddress) { toast.error("Token address not found for swap"); return; }
			setBusy(true);
			try { await handleDexTokenSwap(
				selected.id,
				String(stateOut || 0),
				signer,
				address,
				tokenOutAddress,
				ERC20_ABI,
				stateAddress,
			); } finally { setBusy(false); }
		};

		// Step 3 via contract pool swap (swapTokens)
			const doContractSwap = async () => {
			if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
			toast("Starting Swap…");
			setBusy(true);
				try {
					const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
					const id = selected?.id || 'GLOBAL';
					await SwapTokens(id, selected?.id, tokenAddress);
				} finally { setBusy(false); }
		};

			const goPrev = () => setIndex((i) => (i > 0 ? i - 1 : i));
			const goNext = () => setIndex((i) => (candidates && i < candidates.length - 1 ? i + 1 : i));

							const noTokens = !candidates || candidates.length === 0;

						return (
							<div className="auction-boxes container">
									<div className="row g-4 d-flex align-items-stretch pb-1">
									<div className="col-md-6 col-lg-6 p-0 m-2 auction-col" style={{ maxWidth: "560px" }}>
									<div className={`auction-frame ${isReverse ? "reverse" : ""}`}>
						<div className="auction-header d-flex align-items-center justify-content-between">
							<div className="text-start">
								{selected ? `${isReverse ? "Reverse Auction" : "Auction"} — ${selected.id}` : "Auction"}
							</div>
							{candidates && candidates.length > 1 && (
								<div className="d-flex gap-2">
									<button className="btn btn-sm btn-outline-light" onClick={goPrev} disabled={index === 0}>
										‹
									</button>
									<button className="btn btn-sm btn-outline-light" onClick={goNext} disabled={index >= candidates.length - 1}>
										›
									</button>
								</div>
							)}
						</div>

												{/* Airdrop Row */}
												<div className="auction-row-stack">
													<div className="auction-row small">
														<div className="row-legend">Airdrop</div>
														<div className="auction-card">
															<div className="auction-card-sub detailText">
																{selected ? `Claim ${formatWithCommas(Math.floor(airdropAmount || 0))} ${selected.id}` : "No Active Airdrop"}
															</div>
														</div>
													</div>
													<div className="auction-row-action">
														<button className="btn btn-primary auction-pill" onClick={doClaim} disabled={busy}>claim</button>
													</div>
												</div>

																								{/* Ratio Swap Row (stacked, centered button) */}
																								<div className="auction-row-stack">
																									<div className="auction-row small">
																										<div className="row-legend">Ratio Swap</div>
																										<div className="auction-card">
																											<div className="auction-card-sub detailText">
																												{selected ? `Burn ${formatWithCommas(Math.floor(burnAmount || 0))} ${selected.id} for ${formatWithCommas(Math.floor(stateOut || 0))} STATE` : "No active swap"}
																											</div>
																										</div>
																									</div>
																									<div className="auction-row-action">
																										<button data-testid="ratio-swap" className="btn btn-primary auction-pill" onClick={doRatioSwap} disabled={busy}>Ratio Swap</button>
																									</div>
																								</div>

												{/* Dex Swap Row */}
												<div className="auction-row-stack">
													<div className="auction-row small">
														<div className="row-legend">Double Your Stash</div>
														<div className="auction-card">
															<div className="auction-card-sub detailText">Use DEX to swap STATE for TOKEN</div>
														</div>
													</div>
													<div className="auction-row-action">
														<button data-testid="swap" className="btn btn-primary auction-pill" onClick={doContractSwap} disabled={busy}>Swap</button>
													</div>
												</div>

			{/* Footer Labels under the three boxes (left aligned) */}
									<div className="auction-footer d-flex align-items-start">
								<div className="footer-left text-start" style={{ flex: "0 0 auto" }}>
									<div className="d-flex align-items-center gap-2">
										<div>{selected?.id || "Token 1"}</div>
										<button
											className="btn btn-link text-light p-0"
											style={{ textDecoration: "none" }}
											onClick={addToMetaMask}
											disabled={!selected}
											title="Add token to MetaMask"
											aria-label="Add token to MetaMask"
										>
											<img
												src={MetaMaskIcon}
												alt="MetaMask"
												style={{ width: 18, height: 18, objectFit: "contain" }}
											/>
										</button>
										{/* Auction countdown */}
										<div className="badge bg-secondary ms-2" style={{ fontWeight: 500 }}>
											{(() => {
												const sec = AuctionTime?.[selected?.id] ?? 0;
												const s = Number(sec) || 0;
												const hh = String(Math.floor(s / 3600)).padStart(2, '0');
												const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
												const ss = String(s % 60).padStart(2, '0');
												return `${hh}:${mm}:${ss}`;
											})()}
										</div>
									</div>
									<div>STATE</div>
								</div>
					</div>
												</div>
											</div>
									{noTokens && (
										<div className="col-12">
											<div className="alert alert-secondary text-center bg-dark text-light border-light mt-1" role="alert" style={{borderRadius: 12}}>
												No Ratio Swapping Auction Today
											</div>
										</div>
									)}
								</div>
						</div>
	);
};

export default AuctionBoxes;
