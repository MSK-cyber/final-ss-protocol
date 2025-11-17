import React, { useMemo, useContext, useState, useEffect } from "react";
import { ethers } from "ethers";
import "../../Styles/AuctionBoxes.css";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { useAuctionTokens } from "../../data/auctionTokenData";
import { formatWithCommas } from "../../Constants/Utils";
import { useAccount, useChainId } from "wagmi";
import { ContractContext } from "../../Functions/ContractInitialize";
import { useAllTokens } from "../Swap/Tokens";
import { useDAvContract } from "../../Functions/DavTokenFunctions";
import { useStatePoolAddress } from "../../Functions/useStatePoolAddress";
import { getSTATEContractAddress } from "../../Constants/ContractAddresses";
import { ERC20_ABI } from "../../Constants/Constants";
import toast from "react-hot-toast";
import MetaMaskIcon from "../../assets/metamask-icon.png";
import NormalAuctionBox from "./NormalAuctionBox";
import ReverseAuctionBox from "./ReverseAuctionBox";

const AuctionBoxes = () => {
		const {
			isReversed = {},
			IsAuctionActive = {},
			AirDropAmount = {},
			handleDexTokenSwap,
			performRatioSwap,
			performReverseSwapStep1,
			performReverseSwapStep2,
			CheckMintBalance,
			handleAddToken,
			SwapTokens,
			AuctionTime,
			InputAmount,
			getInputAmount,
			TokenRatio,
			getTokenRatio,
			reverseStateMap = {},
			tokenMap,
		} = useSwapContract();
		const { davHolds = "0", davExpireHolds = "0" } = useDAvContract() || {};
		const { tokens } = useAuctionTokens();
		const { signer, AllContracts } = useContext(ContractContext);
		const { address } = useAccount();
		const chainId = useChainId();
		const TOKENS = useAllTokens();

	// Live auction (today's token) fallback when no selection
	const [todaySymbol, setTodaySymbol] = useState("");
	const [todayName, setTodayName] = useState("");
		const [todayAddress, setTodayAddress] = useState("");
		const [todayDecimals, setTodayDecimals] = useState(18);
    const [reverseNow, setReverseNow] = useState(null);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (!AllContracts?.AuctionContract) return;
				const info = await AllContracts.AuctionContract.getTodayToken();
				const todayAddr = info?.[0] || info?.tokenOfDay;
				if (todayAddr && todayAddr !== ethers.ZeroAddress) {
						if (!cancelled) setTodayAddress(todayAddr);
					// Use contract runner if available, otherwise fallback to public RPC
					const HTTP_RPC_URL = "https://pulsechain-rpc.publicnode.com";
					const readProvider = AllContracts.AuctionContract.runner || AllContracts?.provider || new ethers.JsonRpcProvider(HTTP_RPC_URL);
					const erc20 = new ethers.Contract(
						todayAddr,
							['function name() view returns (string)','function symbol() view returns (string)', 'function decimals() view returns (uint8)'],
						readProvider
					);
					let sym = "";
					let nm = "";
						let dec = 18;
						try { nm = await erc20.name(); } catch { nm = ""; }
						try { sym = await erc20.symbol(); } catch { sym = ""; }
						try { dec = await erc20.decimals(); } catch { dec = 18; }
					if (!cancelled) setTodaySymbol(sym);
						if (!cancelled) setTodayName(nm);
						if (!cancelled) setTodayDecimals(Number(dec) || 18);
				} else {
					if (!cancelled) setTodaySymbol("");
						if (!cancelled) setTodayAddress("");
				}
			} catch (e) {
				if (!cancelled) setTodaySymbol("");
					if (!cancelled) setTodayName("");
					if (!cancelled) setTodayAddress("");
			}
		})();
		return () => { cancelled = true; };
	// Re-evaluate when AuctionTime changes (new auction window / token)
	}, [AllContracts?.AuctionContract, JSON.stringify(AuctionTime)]);

		// Continuously resolve on-chain reverse status for the active token (today's token)
		useEffect(() => {
			let cancelled = false;
			(async () => {
				try {
					if (!AllContracts?.AuctionContract) { 
						console.log('[Reverse Detection] No AuctionContract available');
						setReverseNow(null); 
						return; 
					}
					// Prefer today's token if known
					let addr = todayAddress;
					console.log('[Reverse Detection] Initial todayAddress:', addr);
					if (!addr) {
						try {
							const info = await AllContracts.AuctionContract.getTodayToken();
							addr = info?.[0] || info?.tokenOfDay || null;
							console.log('[Reverse Detection] Fetched todayToken from contract:', addr);
						} catch (err) {
							console.log('[Reverse Detection] Error fetching todayToken:', err);
						}
					}
					if (!addr || addr === ethers.ZeroAddress) { 
						console.log('[Reverse Detection] No valid token address');
						setReverseNow(null); 
						return; 
					}
					console.log('[Reverse Detection] Checking isReverseAuctionActive for:', addr);
					const rev = await AllContracts.AuctionContract.isReverseAuctionActive(addr);
					console.log('[Reverse Detection] Result:', rev);
					if (!cancelled) setReverseNow(Boolean(rev));
				} catch (e) {
					console.error('[Reverse Detection] Error:', e);
					if (!cancelled) setReverseNow(null);
				}
			})();
			return () => { cancelled = true; };
		}, [AllContracts?.AuctionContract, todayAddress, JSON.stringify(AuctionTime)]);

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
			// Prefer on-chain flag; fall back to token-derived flag
			console.log('[Mode Calculation] reverseNow:', reverseNow, 'selected:', selected?.id);
			if (reverseNow === true) {
				console.log('[Mode Calculation] → reverse (from reverseNow=true)');
				return "reverse";
			}
			if (reverseNow === false) {
				console.log('[Mode Calculation] → normal (from reverseNow=false)');
				return "normal";
			}
			if (!selected) {
				console.log('[Mode Calculation] → normal (no selected token)');
				return "normal";
			}
			const revFlag = selected.isReversing === true || selected.isReversing === "true";
			console.log('[Mode Calculation] revFlag from token:', revFlag);
			return revFlag ? "reverse" : "normal";
		}, [selected, reverseNow]);

		const isReverse = mode === "reverse";

		const stateAddress = getSTATEContractAddress(chainId);
		// Minimal Pair ABI for diagnostics
		const PAIR_ABI = [
			'function token0() view returns (address)',
			'function token1() view returns (address)',
			'function getReserves() view returns (uint112,uint112,uint32)'
		];

		const airdropAmount = selected ? AirDropAmount?.[selected.id] : 0;
		// For DEX swap row, keep a safe fallback for stateOut
		const stateOutForDex = selected?.onlyState || 0;
		// Helper: resolve available DAV units using both name and address via tokenMap
		const resolveAvailableUnits = (nameKey, addrKey) => {
			// Try by provided name key
			let val = (nameKey && InputAmount?.[nameKey] !== undefined) ? InputAmount[nameKey] : undefined;
			// Try by provided address key (in case InputAmount is address-keyed)
			if (val === undefined && addrKey && InputAmount?.[addrKey] !== undefined) val = InputAmount[addrKey];
			// Try by reverse-mapped name from tokenMap using address
			if (val === undefined && addrKey && tokenMap) {
				for (const [k, v] of Object.entries(tokenMap)) {
					if ((v || "").toLowerCase() === (addrKey || "").toLowerCase()) {
						if (InputAmount?.[k] !== undefined) { val = InputAmount[k]; }
						break;
					}
				}
			}
			const n = Number(val ?? 0);
			return Number.isFinite(n) ? n : 0;
		};

		// Compute suggested burn and expected STATE based on DAV units and live ratio
		const ratioKey = selected?.id || todaySymbol || "";
		const ratioAddrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayAddress || "";
		const [directUnits, setDirectUnits] = useState(null);
		// Resolve from map first
		const mappedUnits = resolveAvailableUnits(ratioKey, ratioAddrKey);
		// Fetch direct on-chain if map is empty or undefined
		useEffect(() => {
			let cancelled = false;
			(async () => {
				try {
					if (!AllContracts?.AuctionContract || !address || !ratioAddrKey) return;
					if (mappedUnits && mappedUnits > 0) { setDirectUnits(null); return; }
					const raw = await AllContracts.AuctionContract.getAvailableDavForAuction(address, ratioAddrKey);
					const parsed = Math.floor(Number(ethers.formatEther(raw)));
					if (!cancelled) setDirectUnits(parsed);
				} catch (e) {
					if (!cancelled) setDirectUnits(0);
				}
			})();
			return () => { cancelled = true; };
		}, [AllContracts?.AuctionContract, address, ratioAddrKey, mappedUnits]);
		const availableUnitsForToken = (mappedUnits && mappedUnits > 0)
			? mappedUnits
			: ((directUnits ?? 0) > 0 ? directUnits : 0);
		const tokensPerDav = 3000; // from protocol constant TOKENS_PER_DAV
		const burnAmount = availableUnitsForToken * tokensPerDav; // tokens to burn if using all available DAV units

		// Diagnose why live ratio is unavailable (declare early to avoid TDZ in hooks below)
		const [pairDiag, setPairDiag] = useState({ status: 'loading' });
	  const { poolAddress: statePoolAddress } = useStatePoolAddress();
		const [reverseEstState, setReverseEstState] = useState(null);

		const liveRatio = (() => {
			const raw = ratioKey ? TokenRatio?.[ratioKey] : 0;
			if (raw === "not started" || raw === "not listed") return 0;
			const n = Number(raw || 0);
			return Number.isFinite(n) ? n : 0;
		})();

		// Build a client-side fallback ratio from pair reserves when available
		const fallbackRatio = useMemo(() => {
			try {
				if (pairDiag?.status !== 'ok') return 0;
				const r0 = BigInt(pairDiag.r0 || '0');
				const r1 = BigInt(pairDiag.r1 || '0');
				if (r0 === 0n || r1 === 0n) return 0;
				const t0 = (pairDiag.t0 || '').toLowerCase();
				const t1 = (pairDiag.t1 || '').toLowerCase();
				const tokenAddr = (ratioAddrKey || '').toLowerCase();
				const stateAddr = (stateAddress || '').toLowerCase();
				let stateReserve = 0n, tokenReserve = 0n;
				if (t0 === stateAddr && t1 === tokenAddr) { stateReserve = r0; tokenReserve = r1; }
				else if (t0 === tokenAddr && t1 === stateAddr) { stateReserve = r1; tokenReserve = r0; }
				else return 0;
				// Convert to floats with 18 decimals and compute STATE per token
				const stateFloat = Number(ethers.formatUnits(stateReserve, 18));
				const tokenFloat = Number(ethers.formatUnits(tokenReserve, 18));
				if (!isFinite(stateFloat) || !isFinite(tokenFloat) || tokenFloat === 0) return 0;
				return stateFloat / tokenFloat;
			} catch { return 0; }
		// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [pairDiag?.status, pairDiag?.r0, pairDiag?.r1, pairDiag?.t0, pairDiag?.t1, ratioAddrKey, stateAddress]);

		const effectiveLiveRatio = liveRatio > 0 ? liveRatio : fallbackRatio;
		const expectedStateDouble = burnAmount > 0 && effectiveLiveRatio > 0 ? burnAmount * effectiveLiveRatio * 2 : 0;

		// Prefer full names where available
		const selectedDisplayName = useMemo(() => {
			if (!selected) return todayName || todaySymbol || "";
			return (
				TOKENS?.[selected.id]?.displayName ||
				TOKENS?.[selected.id]?.name ||
				todayName ||
				selected.name ||
				selected.id
			);
		}, [selected, TOKENS, todayName, todaySymbol]);

		useEffect(() => {
			let cancelled = false;
			(async () => {
				try {
					setPairDiag({ status: 'loading' });
					setReverseEstState(null);
					const tokenAddr = ratioAddrKey;
					if (!AllContracts?.AuctionContract || !tokenAddr) {
						if (!cancelled) setPairDiag({ status: 'unknown' });
						return;
					}
					// Resolve LP pair for token/state
					let pair = await AllContracts.AuctionContract
						.getPairAddress(tokenAddr)
						.catch(() => ethers.ZeroAddress);
					if (!pair || pair === ethers.ZeroAddress) {
						if (!cancelled) setPairDiag({ status: 'no-pair' });
						return;
					}
					const provider = AllContracts.AuctionContract.runner || AllContracts?.provider || undefined;
					const pairCtr = new ethers.Contract(pair, PAIR_ABI, provider);
					let t0, t1, reserves;
					try { t0 = await pairCtr.token0(); } catch {}
					try { t1 = await pairCtr.token1(); } catch {}
					try { reserves = await pairCtr.getReserves(); } catch {}
					const [r0, r1] = Array.isArray(reserves) ? [reserves[0], reserves[1]] : [0n, 0n];
					const matches = [t0?.toLowerCase(), t1?.toLowerCase()].includes((tokenAddr||'').toLowerCase()) &&
													[t0?.toLowerCase(), t1?.toLowerCase()].includes((stateAddress||'').toLowerCase());
					if (!matches) {
						if (!cancelled) setPairDiag({ status: 'pair-mismatch', pair, t0, t1 });
						return;
					}
					if ((r0 === 0n) || (r1 === 0n)) {
						if (!cancelled) setPairDiag({ status: 'no-liquidity', pair, t0, t1 });
						return;
					}
					if (!cancelled) setPairDiag({ status: 'ok', pair, r0: String(r0), r1: String(r1), t0, t1 });

				// Estimate reverse Step 1 output using user's wallet balance for the token
					try {
						// Determine which reserve corresponds to input token vs STATE
						const tokenIs0 = (t0 || '').toLowerCase() === (tokenAddr || '').toLowerCase();
						const stateIs0 = (t0 || '').toLowerCase() === (stateAddress || '').toLowerCase();
						let reserveIn, reserveOut;
						if (tokenIs0 && !stateIs0) { reserveIn = r0; reserveOut = r1; }
						else if (!tokenIs0 && stateIs0) { reserveIn = r1; reserveOut = r0; }
						else { reserveIn = r0; reserveOut = r1; }

									// Fetch token decimals (fallback to todayDecimals)
						let dec = todayDecimals || 18;
						try {
							const decAbi = ['function decimals() view returns (uint8)'];
							const erc20 = new ethers.Contract(tokenAddr, decAbi, provider);
							dec = Number(await erc20.decimals());
						} catch {}
									// Resolve user's wallet balance for this token; fallback to 0 if not available
									let userBal = 0n;
									try {
										const balAbi = ['function balanceOf(address) view returns (uint256)'];
										const erc20b = new ethers.Contract(tokenAddr, balAbi, provider);
										const raw = await erc20b.balanceOf(address);
										userBal = BigInt(raw.toString?.() || raw);
									} catch { userBal = 0n; }
									const amountIn = userBal > 0n ? userBal : 0n;
						const amountInWithFee = amountIn * 997n;
						const numerator = amountInWithFee * BigInt(reserveOut);
						const denominator = BigInt(reserveIn) * 1000n + amountInWithFee;
						const amountOut = denominator > 0n ? (numerator / denominator) : 0n;
						const formatted = Number(ethers.formatUnits(amountOut, 18));
						if (!cancelled) setReverseEstState(formatted);
					} catch {
						if (!cancelled) setReverseEstState(null);
					}
				} catch (e) {
					if (!cancelled) setPairDiag({ status: 'error', error: e?.message || String(e) });
				}
			})();
			return () => { cancelled = true; };
	}, [AllContracts?.AuctionContract, ratioAddrKey, stateAddress, address]);

		const addToMetaMask = async () => {
			// Prefer selected token; otherwise fallback to live (today) token
			if (selected) {
				await handleAddToken(
					TOKENS[selected.id]?.address || selected.address,
					selected.id,
					TOKENS[selected.id]?.decimals || 18
				);
				return;
			}
			if (todayAddress) {
				await handleAddToken(
					todayAddress,
					todaySymbol || "LIVE",
					todayDecimals || 18
				);
				return;
			}
			toast.error("No token available to add");
		};

	const [busy, setBusy] = useState(false);

	// Refresh available DAV units map when selection/live token changes
	useEffect(() => {
		try { getInputAmount?.(); } catch {}
		// Also refresh live ratio map to keep TokenRatio current for the selected token
		try { getTokenRatio?.(); } catch {}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected?.id, todayAddress, JSON.stringify(AuctionTime), address]);

	// Compute dynamic airdrop text based on DAV availability
	const selectedKey = selected?.id || todaySymbol || "";
	const selectedAddrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayAddress || "";
	const availableUnits = availableUnitsForToken;
	const activeDav = Number(davHolds || 0);
	const expiredDav = Number(davExpireHolds || 0);
	const claimPerUnit = 10000; // matches protocol AIRDROP_AMOUNT per DAV unit
	let airdropText = "";
	if (availableUnits > 0) {
		const claimable = availableUnits * claimPerUnit;
		// Prefer full token name when available; fallback to selected id/symbol or todayName
		const fullName = (selected?.name && selected?.name !== selected?.id ? selected?.name : null)
			|| TOKENS?.[selected?.id]?.name
			|| todayName
			|| selectedKey;
		airdropText = isReverse ? `Reverse Auction active — Airdrop unavailable` : `Claim Airdrop of ${formatWithCommas(claimable)} ${fullName} Tokens`;
	} else if (activeDav > 0) {
		airdropText = isReverse ? "Reverse Auction active — Airdrop unavailable" : "All DAV units for this auction are already used";
	} else if (activeDav === 0 && expiredDav > 0) {
		airdropText = isReverse ? "Reverse Auction active — Airdrop unavailable" : "All your DAV units are expired. Mint new DAV to claim again";
	} else {
		airdropText = isReverse ? "Reverse Auction active — Airdrop unavailable" : "No DAV units available. Mint DAV to claim airdrops";
	}

	// When the live auction token (todayAddress) appears in candidates, auto-select it (address-based match)
	useEffect(() => {
		if (!todayAddress || !candidates || candidates.length === 0) return;
		const findAddr = (t) => {
			const a = (TOKENS?.[t?.id]?.address) || t?.address || "";
			return (a || "").toLowerCase();
		};
		const liveAddr = todayAddress.toLowerCase();
		const pos = candidates.findIndex((t) => findAddr(t) === liveAddr);
		if (pos >= 0 && pos !== index) {
			setIndex(pos);
		}
	}, [todayAddress, JSON.stringify(candidates)]);

		const doClaim = async () => {
			if (busy) return;
			if (!address) { toast.error("Connect your wallet to continue"); return; }
			// Block claim if reverse is active per on-chain rule
			try {
				if (AllContracts?.AuctionContract && (todayAddress || selectedAddrKey)) {
					const todayInfo = await AllContracts.AuctionContract.getTodayToken();
					const tokenAddr = todayInfo?.[0] || todayInfo?.tokenOfDay || todayAddress || selectedAddrKey;
					const rev = await AllContracts.AuctionContract.isReverseAuctionActive(tokenAddr);
					if (rev) {
						toast.error("Reverse auction window is active; claim is only available during normal windows.");
						return;
					}
				}
			} catch {}
			setBusy(true);
			try { await CheckMintBalance(selectedAddrKey || todayAddress); } finally { setBusy(false); }
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
			   String(stateOutForDex || 0),
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

						const noTokens = !candidates || candidates.length === 0;

						const headerTitle = selected
							? `${isReverse ? "Reverse Auction" : "Auction"} — ${selectedDisplayName}`
							: (todayName ? `Auction — ${todayName}` : (todaySymbol ? `Auction — ${todaySymbol}` : "Auction"));

						const ratioTextNormal = (() => {
							if (!ratioKey) return "No swap token selected";
							if (availableUnitsForToken <= 0) return "No active swap — no DAV units available for this auction";
							if (effectiveLiveRatio <= 0) {
								if (pairDiag.status === 'no-pair') return 'Live ratio unavailable — pool not created for this token yet';
								if (pairDiag.status === 'no-liquidity') return 'Live ratio unavailable — pool has no liquidity yet';
								if (pairDiag.status === 'pair-mismatch') return 'Live ratio unavailable — pool mismatch (token/STATE)';
								if (pairDiag.status === 'error') return 'Live ratio unavailable — pool read failed';
								return 'Live ratio unavailable — try again shortly';
							}
							const fullName = selectedDisplayName || (selected?.id || ratioKey);
							const burnStr = formatWithCommas(Math.floor(burnAmount));
								if (effectiveLiveRatio > 0 && expectedStateDouble > 0) {
									const est = expectedStateDouble >= 1 ? formatWithCommas(Math.floor(expectedStateDouble)) : expectedStateDouble.toFixed(6);
									return `Burn ${burnStr} ${fullName} tokens for ${est} STATE tokens`;
								}
								return `Burn ${burnStr} ${fullName} tokens for 2× STATE tokens`;
						})();

						const ratioTextReverse = (() => {
										const fullName = selectedDisplayName || (selected?.id || ratioKey);
										// Compute user's balance for label if available via TOKENS map
										const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
										const tokenDecimals = (TOKENS[selected?.id]?.decimals) || todayDecimals || 18;
										// Note: we don't have direct hook here; keep generic wording without a hard-coded 3,000
										let base = `Swap your ${fullName} tokens for STATE (Reverse Step 1)`;
										if (typeof reverseEstState === 'number' && reverseEstState > 0) {
								const est = reverseEstState >= 1 ? formatWithCommas(Math.floor(reverseEstState)) : reverseEstState.toFixed(6);
								base += ` • est. ${est} STATE`;
							}
							return base;
						})();

												const doReverseSwap = async () => {
							if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
							toast("Starting Reverse Swap…");
							setBusy(true);
							try {
																// Use the live token-of-day when reverse is active to stay aligned with on-chain window
																const selectedTokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
																const tokenAddress = (reverseNow === true && todayAddress) ? todayAddress : selectedTokenAddress;
																if (reverseNow === true && selectedTokenAddress && tokenAddress && (selectedTokenAddress.toLowerCase() !== tokenAddress.toLowerCase())) {
																	toast((t) => (
																		`Reverse is active for the live token-of-day. Executing with current token instead of selection.`
																	));
																}
								const id = selected?.id || 'GLOBAL';
								await performReverseSwapStep1(id, selected?.id, tokenAddress);
							} finally { setBusy(false); }
						};

							// Build DEX row dynamic description for normal mode
							const dexRowText = (() => {
								if (!selected) return "Use DEX to swap STATE for TOKEN";
								const tokenName = selectedDisplayName || selected?.id || todaySymbol || "TOKEN";
								const ratio = effectiveLiveRatio;
								// Pending STATE from Step 2 map if any (normal mode can still have a balance from previous window)
								const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
								const pendingState = tokenAddress ? (reverseStateMap?.[tokenAddress] || 0) : 0;
								// Prefer using the estimated STATE from Ratio Swap (expectedStateDouble) if available
								if (Number(ratio) > 0 && Number(expectedStateDouble) > 0) {
									const tokenOutFromExpected = Number(expectedStateDouble) / Number(ratio);
									const stateStr = Number(expectedStateDouble) >= 1 ? formatWithCommas(Math.floor(Number(expectedStateDouble))) : Number(expectedStateDouble).toFixed(6);
									const tokenStr = tokenOutFromExpected >= 1 ? formatWithCommas(Math.floor(tokenOutFromExpected)) : tokenOutFromExpected.toFixed(6);
									return `Swap ${stateStr} STATE tokens for ${tokenStr} ${tokenName} tokens`;
								}
								if (Number(ratio) > 0 && Number(pendingState) > 0) {
									const tokenOut = Number(pendingState) / Number(ratio);
									const stateStr = pendingState >= 1 ? formatWithCommas(Math.floor(pendingState)) : Number(pendingState).toFixed(6);
									const tokenStr = tokenOut >= 1 ? formatWithCommas(Math.floor(tokenOut)) : tokenOut.toFixed(6);
									return `Swap ${stateStr} STATE tokens for ${tokenStr} ${tokenName} tokens`;
								}
								if (Number(ratio) > 0) {
									// Show a simple quote when there's a live ratio but no pending STATE: 1 STATE ≈ X TOKEN
									const perState = 1 / Number(ratio);
									const quote = perState >= 1 ? formatWithCommas(Math.floor(perState)) : perState.toFixed(6);
									return `Swap STATE for ${tokenName} according to the current ratio of pool • 1 STATE ≈ ${quote} ${tokenName}`;
								}
								// Fallback text with diagnostics
								if (pairDiag.status === 'no-pair') return 'Pool not created yet for this token';
								if (pairDiag.status === 'no-liquidity') return 'Pool has no liquidity yet';
								if (pairDiag.status === 'pair-mismatch') return 'Pool mismatch (token/STATE)';
								if (pairDiag.status === 'error') return 'Pool read failed';
								return 'Use DEX to swap STATE for TOKEN';
							})();

							return (
							<div className="auction-boxes">
								{isReverse ? (
				    <ReverseAuctionBox
					    headerTitle={headerTitle}
					    ratioText={ratioTextReverse}
											onReverseSwap={doReverseSwap}
											onReverseStep2={async () => {
												const selectedTokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
												const tokenAddress = (reverseNow === true && todayAddress) ? todayAddress : selectedTokenAddress;
													const id = selected?.id || 'GLOBAL';
													// Guard: only proceed if we actually have STATE from step 1
													const have = (() => {
													const fromMap = tokenAddress ? reverseStateMap[tokenAddress] : undefined;
														return (typeof fromMap === 'number' && fromMap > 0) ? fromMap : (typeof reverseEstState === 'number' && reverseEstState > 0 ? reverseEstState : 0);
													})();
													if (!have || Number(have) <= 0) {
														toast.error('No STATE available from Step 1 yet. Complete Step 1 first.');
														return;
													}
													await performReverseSwapStep2(id, selected?.id, tokenAddress);
												}}
											reverseState={(() => {
												const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
												const fromMap = tokenAddress ? reverseStateMap[tokenAddress] : undefined;
												if (typeof fromMap === 'number' && fromMap > 0) return fromMap;
												return (typeof reverseEstState === 'number' && reverseEstState > 0) ? reverseEstState : 0;
											})()}
										busy={busy}
										leftTokenLabel={selectedDisplayName || todaySymbol || ""}
										onAddToMetaMask={addToMetaMask}
									/>
								) : (
									<NormalAuctionBox
										headerTitle={headerTitle}
										airdropText={airdropText}
										ratioText={ratioTextNormal}
										onClaim={doClaim}
										onRatioSwap={doRatioSwap}
										onDexSwap={doContractSwap}
										busy={busy}
										leftTokenLabel={selectedDisplayName || todaySymbol || ""}
										onAddToMetaMask={addToMetaMask}
											dexText={dexRowText}
									/>
								)}
								{noTokens && null}
							</div>
						);
};

export default AuctionBoxes;
