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
			getAirdropAmount,
			handleDexTokenSwap,
			performRatioSwap,
			performReverseSwapStep1,
			performReverseSwapStep2,
			CheckMintBalance,
			handleAddToken,
			SwapTokens,
			AuctionTime,
			InputAmount,
			OutPutAmount,
			getInputAmount,
			getOutPutAmount,
			TokenRatio,
			getTokenRatio,
			reverseStateMap = {},
			tokenMap,
			AirdropClaimed = {},
			userHashSwapped = {},
			userHasBurned = {},
			userReverseStep1 = {},
			userReverseStep2 = {},
			// Use centralized today's token data from SwapContractFunctions
			todayTokenAddress = "",
			todayTokenSymbol = "",
			todayTokenName = "",
			todayTokenDecimals = 18,
			reverseWindowActive = null,
		} = useSwapContract();
		const { davHolds = "0", davExpireHolds = "0" } = useDAvContract() || {};
		const { tokens } = useAuctionTokens();
		const { signer, AllContracts } = useContext(ContractContext);
		const { address } = useAccount();
		const chainId = useChainId();
		const TOKENS = useAllTokens();

	// Remove local todaySymbol/todayName/todayAddress/todayDecimals state
	// Use centralized values from context instead
	const [reverseNow, setReverseNow] = useState(null);
	// Preserve last known on-chain mode to avoid flicker during reconnects/refresh
	const [lastKnownMode, setLastKnownMode] = useState(null); // 'reverse' | 'normal' | null
		// Dev override: allow previewing modes via URL (?mode=reverse|normal or &forceReverse=1)
		const forcedMode = useMemo(() => {
			try {
				const qs = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
				const param = (qs?.get('mode') || qs?.get('auctionMode') || '').toLowerCase();
				if (param === 'reverse' || param === 'normal') return param;
				const fr = (qs?.get('forceReverse') || '').toLowerCase();
				if (fr === '1' || fr === 'true') return 'reverse';
				return null;
			} catch { return null; }
		}, []);

		// Continuously resolve reverse status for the active token (prefer SwapLens snapshot; fallback to on-chain)
		useEffect(() => {
			let cancelled = false;
			(async () => {
				try {
					if (!AllContracts?.AuctionContract) { 
						console.log('[Reverse Detection] No AuctionContract available');
						setReverseNow(null); 
						return; 
					}
					// Use centralized today's token address from context
					let addr = todayTokenAddress;
					console.log('[Reverse Detection] Using todayTokenAddress from context:', addr);
					if (!addr || addr === ethers.ZeroAddress) { 
						console.log('[Reverse Detection] No valid token address');
						setReverseNow(null); 
						return; 
					}
					// If lens snapshot is available, trust it to avoid UnsupportedToken reverts
					if (reverseWindowActive === true || reverseWindowActive === false) {
						if (!cancelled) {
							setReverseNow(reverseWindowActive);
							setLastKnownMode(reverseWindowActive ? 'reverse' : 'normal');
						}
						return;
					}
								console.log('[Reverse Detection] Checking isReverseAuctionActive for:', addr);
								let rev = false;
								try {
									rev = await AllContracts.AuctionContract.isReverseAuctionActive(addr);
								} catch (e) {
									console.warn('[Reverse Detection] isReverseAuctionActive failed:', e?.shortMessage || e?.message || e);
									rev = false; // Treat failures as not in reverse to avoid UI flicker
								}
								console.log('[Reverse Detection] Result:', rev);
								if (!cancelled) {
									const val = Boolean(rev);
									setReverseNow(val);
									// Update sticky mode immediately on definitive on-chain value
									setLastKnownMode(val ? 'reverse' : 'normal');
								}
				} catch (e) {
								console.warn('[Reverse Detection] Error:', e?.shortMessage || e?.message || e);
								if (!cancelled) setReverseNow(false);
				}
			})();
			return () => { cancelled = true; };
		}, [AllContracts?.AuctionContract, todayTokenAddress, reverseWindowActive, JSON.stringify(AuctionTime)]);

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

	// Prefer live token-of-day selection immediately when available to avoid stale active flags
	const liveCandidate = useMemo(() => {
		try {
			if (!todayTokenAddress) return null;
			const live = todayTokenAddress.toLowerCase();
			const addrOf = (t) => ((TOKENS?.[t?.id]?.address) || t?.address || "").toLowerCase();
			// Try within filtered candidates first
			const inCandidates = Array.isArray(candidates)
				? candidates.find((t) => addrOf(t) === live)
				: null;
			if (inCandidates) return inCandidates;
			// Fallback: search full tokens list in case filtering temporarily hid the live token
			const inAll = Array.isArray(tokens)
				? tokens.find((t) => addrOf(t) === live)
				: null;
			return inAll || null;
		} catch { return null; }
	}, [candidates, tokens, todayTokenAddress, TOKENS]);					const selected = liveCandidate
						|| (candidates && candidates.length > 0 ? candidates[Math.min(index, candidates.length - 1)] : null);


		const mode = useMemo(() => {
			// If explicitly forced via URL param, honor it for UI preview
			if (forcedMode) return forcedMode;
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
			// When reverseNow is temporarily unknown (null), keep last known mode to avoid UI flip
			if (lastKnownMode === 'reverse' || lastKnownMode === 'normal') {
				console.log('[Mode Calculation] → sticky', lastKnownMode, '(lastKnownMode)');
				return lastKnownMode;
			}
			if (!selected) {
				console.log('[Mode Calculation] → normal (no selected token)');
				return "normal";
			}
			const revFlag = selected.isReversing === true || selected.isReversing === "true";
			console.log('[Mode Calculation] revFlag from token:', revFlag);
			return revFlag ? "reverse" : "normal";
		}, [selected, reverseNow, lastKnownMode, forcedMode]);

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
	const ratioKey = selected?.id || todayTokenSymbol || "";
	const ratioAddrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || "";
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
		}, [AllContracts?.AuctionContract, address, ratioAddrKey, mappedUnits, davHolds]);
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

		// Track last non-zero ratio so we can freeze with a sensible value even if pools go to 0 later
		const [lastNonZeroRatio, setLastNonZeroRatio] = useState(0);
		useEffect(() => {
			if (Number(effectiveLiveRatio) > 0) {
				setLastNonZeroRatio(Number(effectiveLiveRatio));
			}
		}, [effectiveLiveRatio]);
		const expectedStateDouble = burnAmount > 0 && effectiveLiveRatio > 0 ? burnAmount * effectiveLiveRatio * 2 : 0;

	// Prefer full names where available
	const selectedDisplayName = useMemo(() => {
		if (!selected) return todayTokenName || todayTokenSymbol || "";
		return (
			TOKENS?.[selected.id]?.displayName ||
			TOKENS?.[selected.id]?.name ||
			todayTokenName ||
			selected.name ||
			selected.id
		);
	}, [selected, TOKENS, todayTokenName, todayTokenSymbol]);		useEffect(() => {
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

								// Fetch token decimals (fallback to todayTokenDecimals)
					let dec = todayTokenDecimals || 18;
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
		if (todayTokenAddress) {
			await handleAddToken(
				todayTokenAddress,
				todayTokenSymbol || "LIVE",
				todayTokenDecimals || 18
			);
			return;
		}
		toast.error("No token available to add");
	};	const [busy, setBusy] = useState(false);

	// Helpers to resolve flags from name/address-keyed maps
	const resolveFlag = (mapObj, nameKey, addrKey) => {
		if (!mapObj) return false;
		let v = mapObj[nameKey];
		if (typeof v === 'string') v = v.toLowerCase() === 'true';
		if (v === undefined && addrKey) {
			v = mapObj[(addrKey || '').toLowerCase()];
		}
		if (typeof v === 'string') v = v.toLowerCase() === 'true';
		return Boolean(v);
	};

	// Refresh available DAV units and pending STATE when selection/live token changes
	useEffect(() => {
		try { getInputAmount?.(); } catch {}
			try { getOutPutAmount?.(); } catch {}
		// Also refresh live ratio map to keep TokenRatio current for the selected token
		try { getTokenRatio?.(); } catch {}
			// Refresh airdrop claimable amounts for Step 1 correctness
			try { getAirdropAmount?.(); } catch {}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected?.id, todayTokenAddress, JSON.stringify(AuctionTime), address, davHolds, JSON.stringify(AirdropClaimed)]);

	// Compute dynamic airdrop/ratio texts with fixed phrasing, but prevent post-action values from dropping to 0
const selectedKey = selected?.id || todayTokenSymbol || "";
const selectedAddrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || "";
const availableUnits = availableUnitsForToken;
	// Read AIRDROP_PER_DAV on-chain to avoid hardcoding
	const [airdropPerDav, setAirdropPerDav] = useState(10000);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (!AllContracts?.airdropDistributor) return;
				const per = await AllContracts.airdropDistributor.AIRDROP_PER_DAV();
				const n = Math.floor(Number(ethers.formatEther(per)));
				if (!cancelled && Number.isFinite(n) && n > 0) setAirdropPerDav(n);
			} catch {}
		})();
		return () => { cancelled = true; };
	}, [AllContracts?.airdropDistributor]);

	// Cycle-aware airdrop display: before claim show claimable (newUnits * perDav), after claim show consumedUnitsCurrentCycle * perDav
	const [claimableAmountCycleAware, setClaimableAmountCycleAware] = useState(0);
	const [consumedUnitsCurrentCycle, setConsumedUnitsCurrentCycle] = useState(0);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (!address || !AllContracts?.airdropDistributor || !selectedAddrKey) {
					if (!cancelled) { setClaimableAmountCycleAware(0); setConsumedUnitsCurrentCycle(0); }
					return;
				}
				// getClaimable returns (davUnitsAvailable, newUnits, amount)
				try {
					const res = await AllContracts.airdropDistributor.getClaimable(selectedAddrKey, address);
					const amtWei = Array.isArray(res) ? (res[2] || 0n) : (res?.amount || 0n);
					const amt = Math.floor(Number(ethers.formatEther(amtWei)));
					if (!cancelled) setClaimableAmountCycleAware(Number.isFinite(amt) ? amt : 0);
				} catch {
					if (!cancelled) setClaimableAmountCycleAware(0);
				}
				// consumed units in current cycle (units, not amount)
				try {
					const consumed = await AllContracts.airdropDistributor.getConsumedDavUnitsCurrentCycle(selectedAddrKey, address);
					const units = Math.floor(Number(consumed));
					if (!cancelled) setConsumedUnitsCurrentCycle(Number.isFinite(units) ? units : 0);
				} catch {
					if (!cancelled) setConsumedUnitsCurrentCycle(0);
				}
			} catch {
				if (!cancelled) { setClaimableAmountCycleAware(0); setConsumedUnitsCurrentCycle(0); }
			}
		})();
		// refresh on step completions/time changes to keep display aligned
	}, [address, AllContracts?.airdropDistributor, selectedAddrKey, JSON.stringify(AirdropClaimed), JSON.stringify(AuctionTime)]);

	const claimPerUnit = airdropPerDav; // on-chain constant when available
const fullTokenName = (selected?.name && selected?.name !== selected?.id ? selected?.name : null)
  || TOKENS?.[selected?.id]?.name
  || todayTokenName
  || selectedKey;

	// Cycle-aware Ratio Swap display (Step 2): after burning, keep showing values based on consumed units/tokens this cycle
	const [ratioCycleBurnTokens, setRatioCycleBurnTokens] = useState(0);
	const [ratioCycleDavUnitsUsed, setRatioCycleDavUnitsUsed] = useState(0);
	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				if (!address || !AllContracts?.AuctionContract || !selectedAddrKey) {
					if (!cancelled) { setRatioCycleBurnTokens(0); setRatioCycleDavUnitsUsed(0); }
					return;
				}
				// Prefer direct tokens burned (auction token units)
				try {
					const raw = await AllContracts.AuctionContract.getTokensBurnedByUser(address, selectedAddrKey);
					// Use token decimals if known; fallback to 18
					const dec = Number(TOKENS?.[selected?.id]?.decimals || todayTokenDecimals || 18);
					const burned = Math.floor(Number(ethers.formatUnits(raw || 0n, dec)));
					if (!cancelled) setRatioCycleBurnTokens(Number.isFinite(burned) ? burned : 0);
				} catch {
					if (!cancelled) setRatioCycleBurnTokens(0);
				}
				// Also read DAV units used for this token (units of DAV, not tokens); fallback to 0 on failure
				try {
					const rawUnits = await AllContracts.AuctionContract.getDavTokensUsed(address, selectedAddrKey);
					const units = Math.floor(Number(ethers.formatEther(rawUnits || 0n)));
					if (!cancelled) setRatioCycleDavUnitsUsed(Number.isFinite(units) ? units : 0);
				} catch {
					if (!cancelled) setRatioCycleDavUnitsUsed(0);
				}
			} catch {
				if (!cancelled) { setRatioCycleBurnTokens(0); setRatioCycleDavUnitsUsed(0); }
			}
		})();
		// refresh when selection changes, user burns, or time advances
	}, [address, AllContracts?.AuctionContract, selectedAddrKey, todayTokenDecimals, TOKENS, JSON.stringify(userHasBurned), JSON.stringify(AuctionTime)]);

	// Sticky (non-zero) display values to avoid showing 0 after steps complete; reset when token selection changes
	const [stickyVals, setStickyVals] = useState({ airdrop: null, burn: null, est: null });
	// Snapshot values to freeze texts after all three steps complete
	const [snapshots, setSnapshots] = useState({
		airdrop: null,
		burnTokens: null,
		estState: null,
		ratioAtBurn: null,
		cycleComplete: false
	});

	// Resolve completion flags (re-using logic applied to checkmarks later)
	const completionFlags = useMemo(() => {
		const idKey = selected?.id || todayTokenSymbol || '';
		const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
		const claimedOnce = resolveFlag(AirdropClaimed, idKey, addrKey);
		const claimableAmount = Number(selected ? AirDropAmount?.[selected.id] : 0);
		const doneAirdrop = claimedOnce && !(claimableAmount > 0);
		const burnedOnce = resolveFlag(userHasBurned, idKey, addrKey);
		const doneRatioSwap = burnedOnce && !(Number(availableUnitsForToken) > 0);
		// Dex swap done check replication
		let pending = 0;
		try {
			const byName = OutPutAmount?.[idKey];
			const byAddr = OutPutAmount?.[addrKey] ?? OutPutAmount?.[addrKey?.toLowerCase?.()] ?? OutPutAmount?.[addrKey?.toUpperCase?.()];
			const v = byAddr !== undefined ? byAddr : byName;
			pending = Number(v || 0);
			if (!Number.isFinite(pending)) pending = 0;
		} catch { pending = 0; }
		const swappedOnce = resolveFlag(userHashSwapped, idKey, addrKey);
		// Show Step 3 check only if:
		// - user swapped at least once (swappedOnce)
		// - no pending STATE left to swap (pending <= 0)
		// - AND no additional DAV units are currently available to burn for this token
		//   (so the user can't start a new round right now)
		const doneDexSwap = swappedOnce && !(pending > 0) && !(Number(availableUnitsForToken) > 0);
		return { doneAirdrop, doneRatioSwap, doneDexSwap };
	}, [selected?.id, todayTokenSymbol, todayTokenAddress, TOKENS, AirdropClaimed, AirDropAmount, userHasBurned, availableUnitsForToken, OutPutAmount, userHashSwapped]);

	// Convenient flag for render-time decisions (show snapshots only while all steps remain completed)
	const allDone = completionFlags.doneAirdrop && completionFlags.doneRatioSwap && completionFlags.doneDexSwap;

	// When all steps complete, snapshot cycle-used values once
	useEffect(() => {
		if (!selected) return;
		const { doneAirdrop, doneRatioSwap, doneDexSwap } = completionFlags;
		const isAllDone = doneAirdrop && doneRatioSwap && doneDexSwap;
		if (isAllDone && !snapshots.cycleComplete) {
			// Capture stable numbers based on user's USED DAV UNITS for current cycle
			// used DAV this cycle (units)
			const usedUnitsFinal = Math.max(0, Number(consumedUnitsCurrentCycle || 0));
			// Burned auction tokens are derived from used DAV units * TOKENS_PER_DAV
			const burnTokensFinal = usedUnitsFinal * Number(tokensPerDav || 0);
			// Freeze the ratio at the last known non-zero value if live ratio is 0 now
			const ratioUsed = Number(effectiveLiveRatio) > 0 ? Number(effectiveLiveRatio) : Number(lastNonZeroRatio || 0);
			const estStateFinal = burnTokensFinal > 0 && ratioUsed > 0 ? burnTokensFinal * ratioUsed * 2 : 0;
			// Airdrop snapshot equals used DAV units * AIRDROP_PER_DAV
			const airdropFinal = usedUnitsFinal * Number(airdropPerDav || 0);
			setSnapshots({
				airdrop: airdropFinal,
				burnTokens: burnTokensFinal,
				estState: estStateFinal,
				ratioAtBurn: ratioUsed,
				cycleComplete: true
			});
		}
	}, [completionFlags, snapshots.cycleComplete, selected, effectiveLiveRatio, lastNonZeroRatio, consumedUnitsCurrentCycle, airdropPerDav, tokensPerDav]);

	// Reset snapshots and sticky vals only when the actual token address changes
	const prevSelectedAddrKeyRef = React.useRef(null);
	useEffect(() => {
		const currentKey = selectedAddrKey || '';
		if (prevSelectedAddrKeyRef.current === null) {
			prevSelectedAddrKeyRef.current = currentKey;
			return;
		}
		if ((prevSelectedAddrKeyRef.current || '') !== currentKey) {
			setSnapshots({ airdrop: null, burnTokens: null, estState: null, ratioAtBurn: null, cycleComplete: false });
			setStickyVals({ airdrop: null, burn: null, est: null });
			prevSelectedAddrKeyRef.current = currentKey;
		}
	}, [selectedAddrKey]);

	// Raw calculations
	// Pre-claim amount from distributor (preferred), fallback to availableUnits * perDav
	const rawClaimableFromDistributor = Math.max(0, Number(claimableAmountCycleAware || 0));
	const rawClaimableFallback = Math.max(0, Number(availableUnits) * claimPerUnit);
	const rawClaimable = rawClaimableFromDistributor > 0 ? rawClaimableFromDistributor : rawClaimableFallback;
	const rawBurn = Math.max(0, Math.floor(Number(burnAmount || 0)));
	const rawEst = Math.max(0, Number(expectedStateDouble || 0));

	// Capture last non-zero values
	useEffect(() => { if (rawClaimable > 0) setStickyVals((s) => (s.airdrop === rawClaimable ? s : { ...s, airdrop: rawClaimable })); }, [rawClaimable]);
	useEffect(() => { if (rawBurn > 0) setStickyVals((s) => (s.burn === rawBurn ? s : { ...s, burn: rawBurn })); }, [rawBurn]);
	useEffect(() => { if (rawEst > 0) setStickyVals((s) => (s.est === rawEst ? s : { ...s, est: rawEst })); }, [rawEst]);

	const airdropText = (() => {
		if (allDone && snapshots.airdrop !== null) {
			return `Claim Airdrop of ${formatWithCommas(snapshots.airdrop)} ${fullTokenName} tokens`;
		}
		// If user has already claimed this cycle and claimable amount is zero, show consumed-units based amount
		const consumedAmount = Math.max(0, Number(consumedUnitsCurrentCycle || 0) * Number(claimPerUnit || 0));
		const hasClaimableNow = rawClaimableFromDistributor > 0;
		const display = hasClaimableNow
			? rawClaimableFromDistributor
			: (consumedAmount > 0
				? consumedAmount
				: (rawClaimableFallback > 0 ? rawClaimableFallback : (stickyVals.airdrop ?? 0)));
		return `Claim Airdrop of ${formatWithCommas(display)} ${fullTokenName} tokens`;
	})();

// When the live auction token (todayTokenAddress) appears in candidates, auto-select it (address-based match)
useEffect(() => {
	if (!todayTokenAddress || !candidates || candidates.length === 0) return;
	const findAddr = (t) => {
		const a = (TOKENS?.[t?.id]?.address) || t?.address || "";
		return (a || "").toLowerCase();
	};
	const liveAddr = todayTokenAddress.toLowerCase();
	const pos = candidates.findIndex((t) => findAddr(t) === liveAddr);
	if (pos >= 0 && pos !== index) {
		setIndex(pos);
	}
}, [todayTokenAddress, JSON.stringify(candidates)]);		const doClaim = async () => {
		if (busy) return;
		if (!address) { toast.error("Connect your wallet to continue"); return; }
		// Block claim if reverse is active per on-chain rule
		try {
			if (AllContracts?.AuctionContract && (todayTokenAddress || selectedAddrKey)) {
				// Use centralized todayTokenAddress from context (now synchronized with contract state)
				const tokenAddr = todayTokenAddress || selectedAddrKey;
				const rev = await AllContracts.AuctionContract.isReverseAuctionActive(tokenAddr);
				if (rev) {
					toast.error("Reverse auction window is active; claim is only available during normal windows.");
						return;
				}
			}
		} catch {}
		setBusy(true);
		try { await CheckMintBalance(selectedAddrKey || todayTokenAddress); } finally { setBusy(false); }
	};			const doRatioSwap = async () => {
			if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
			toast("Starting Ratio Swap…", { position: 'top-center' });
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
									toast("Starting Swap…", { position: 'top-center' });
			setBusy(true);
				try {
					const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
					const id = selected?.id || 'GLOBAL';
					await SwapTokens(id, selected?.id, tokenAddress);
				} finally { setBusy(false); }
		};

						const noTokens = !candidates || candidates.length === 0;


						// Header title (string) only for normal/reverse auction label and token name
						// Kept simple per request: no extra badges/UI beyond normal auction behavior


					const headerTitle = selected
						? `${isReverse ? "Reverse Auction" : "Auction"} — ${selectedDisplayName}`
						: (todayTokenName ? `Auction — ${todayTokenName}` : (todayTokenSymbol ? `Auction — ${todayTokenSymbol}` : "Auction"));

					// Keep Ratio Swap subtitle stable: fixed phrasing with dynamic numbers only
					const ratioTextNormal = (() => {
						if (allDone && snapshots.burnTokens !== null) {
							const burnStr = formatWithCommas(snapshots.burnTokens);
							if (snapshots.estState && snapshots.estState > 0) {
								const estDisplay = snapshots.estState >= 1 ? formatWithCommas(Math.floor(snapshots.estState)) : snapshots.estState.toFixed(6);
								return `Burn ${burnStr} ${selectedDisplayName || (selected?.id || ratioKey)} tokens for ${estDisplay} STATE tokens`;
							}
							return `Burn ${burnStr} ${selectedDisplayName || (selected?.id || ratioKey)} tokens for 2× STATE tokens`;
						}
						const fullName = selectedDisplayName || (selected?.id || ratioKey);
						// Prefer live raw values; then cycle-aware burned values; then sticky fallback
						const burnCycle = Number(ratioCycleBurnTokens || 0);
						const burnFromUnits = Number(ratioCycleDavUnitsUsed || 0) * Number(tokensPerDav || 0);
						// Also consider current-cycle used DAV units as a fallback for burned tokens calculation
						const burnFromCurrentCycleUnits = Number(consumedUnitsCurrentCycle || 0) * Number(tokensPerDav || 0);
						const burnDisplay = rawBurn > 0
							? rawBurn
							: (burnCycle > 0 ? burnCycle : (burnFromUnits > 0 ? burnFromUnits : (burnFromCurrentCycleUnits > 0 ? burnFromCurrentCycleUnits : (stickyVals.burn ?? 0))));
						const burnStr = formatWithCommas(burnDisplay);

						// Estimate STATE: prefer live rawEst; else compute from cycle-aware burns when ratio known; else sticky
						let estDisplay = rawEst;
						if (!(estDisplay > 0) && effectiveLiveRatio > 0) {
							if (burnCycle > 0) {
								estDisplay = burnCycle * effectiveLiveRatio * 2;
							} else if (burnFromUnits > 0) {
								estDisplay = burnFromUnits * effectiveLiveRatio * 2;
							} else if (burnFromCurrentCycleUnits > 0) {
								estDisplay = burnFromCurrentCycleUnits * effectiveLiveRatio * 2;
							}
						}
						if (!(estDisplay > 0)) estDisplay = (stickyVals.est ?? 0);

						if (effectiveLiveRatio > 0 && estDisplay > 0) {
							const est = estDisplay >= 1 ? formatWithCommas(Math.floor(estDisplay)) : Number(estDisplay).toFixed(6);
							return `Burn ${burnStr} ${fullName} tokens for ${est} STATE tokens`;
						}
						// Fallback keeps stable wording without diagnostics
						return `Burn ${burnStr} ${fullName} tokens for 2× STATE tokens`;
					})();


						const ratioTextReverse = (() => {
							const fullName = selectedDisplayName || (selected?.id || ratioKey);
								// Keep generic wording
							let base = `Swap your ${fullName} tokens for STATE tokens`;
							if (typeof reverseEstState === 'number' && reverseEstState > 0) {
								const est = reverseEstState >= 1 ? formatWithCommas(Math.floor(reverseEstState)) : reverseEstState.toFixed(6);
								base += ` • est. ${est} STATE`;
							}
							return base;
						})();

												const doReverseSwap = async () => {
							if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
								toast("Starting Reverse Swap…", { position: 'top-center' });
							setBusy(true);
							try {
																// Use the live token-of-day when reverse is active to stay aligned with on-chain window
															const selectedTokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
															const tokenAddress = (reverseNow === true && todayTokenAddress) ? todayTokenAddress : selectedTokenAddress;
															// Silent switch: avoid showing a toast in the corner when overriding selection
								const id = selected?.id || 'GLOBAL';
								await performReverseSwapStep1(id, selected?.id, tokenAddress);
							} finally { setBusy(false); }
						};

						// Build DEX row dynamic description for normal mode
						const dexRowText = (() => {
							if (allDone && snapshots.burnTokens !== null) {
								// Show frozen estimate STATE -> TOKEN quote if ratio was captured
								const tokenName = selectedDisplayName || selected?.id || todayTokenSymbol || "TOKEN";
								const ratioUsed = snapshots.ratioAtBurn || 0;
								if (ratioUsed > 0 && snapshots.estState > 0) {
									const stateStr = snapshots.estState >= 1 ? formatWithCommas(Math.floor(snapshots.estState)) : snapshots.estState.toFixed(6);
									const tokenOut = snapshots.estState / ratioUsed; // inverse conversion
									const tokenStr = tokenOut >= 1 ? formatWithCommas(Math.floor(tokenOut)) : tokenOut.toFixed(6);
									return `Swap ${stateStr} STATE tokens for ${tokenStr} ${tokenName} tokens`;
								}
								return 'Use DEX to swap STATE for TOKEN';
							}
							if (!selected) return "Use DEX to swap STATE for TOKEN";
							const tokenName = selectedDisplayName || selected?.id || todayTokenSymbol || "TOKEN";
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
									return `Swap STATE for ${tokenName} • 1 STATE ≈ ${quote} ${tokenName}`;
								}
								// Stable generic fallback without diagnostics
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
											const tokenAddress = (reverseNow === true && todayTokenAddress) ? todayTokenAddress : selectedTokenAddress;
												const id = selected?.id || 'GLOBAL';
												// Let the on-chain check in performReverseSwapStep2 validate stateFromStep1,
												// as local estimates can be stale or rounded.
												await performReverseSwapStep2(id, selected?.id, tokenAddress);
											}}
												reverseState={(() => {
												const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
												const fromMap = tokenAddress ? reverseStateMap[tokenAddress] : undefined;
												if (typeof fromMap === 'number' && fromMap > 0) return fromMap;
												return (typeof reverseEstState === 'number' && reverseEstState > 0) ? reverseEstState : 0;
										})()}
										doneReverse1={(() => {
											const idKey = selected?.id || todayTokenSymbol || '';
											const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
											return resolveFlag(userReverseStep1, idKey, addrKey);
										})()}
										doneReverse2={(() => {
											const idKey = selected?.id || todayTokenSymbol || '';
											const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
											return resolveFlag(userReverseStep2, idKey, addrKey);
										})()}
									busy={busy}
									leftTokenLabel={selectedDisplayName || todayTokenSymbol || ""}
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
									leftTokenLabel={selectedDisplayName || todayTokenSymbol || ""}
									onAddToMetaMask={addToMetaMask}
									dexText={dexRowText}
										doneAirdrop={(() => {
											const idKey = selected?.id || todayTokenSymbol || '';
											const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
											const claimedOnce = resolveFlag(AirdropClaimed, idKey, addrKey);
											// Use distributor claimable amount: if amount > 0, user can claim again; otherwise show ✅ when already claimed
											const claimableAmount = Number(airdropAmount || 0);
											return claimedOnce && !(claimableAmount > 0);
										})()}
										doneRatioSwap={(() => {
											const idKey = selected?.id || todayTokenSymbol || '';
											const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
											const burnedOnce = resolveFlag(userHasBurned, idKey, addrKey);
											// Show check only if burned and no additional DAV units are currently available to burn
											return burnedOnce && !(Number(availableUnitsForToken) > 0);
										})()}
									doneDexSwap={(() => {
										const idKey = selected?.id || todayTokenSymbol || '';
										const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
										const swappedOnce = resolveFlag(userHashSwapped, idKey, addrKey);
										// Determine pending STATE from OutPutAmount (userStateBalance)
										let pending = 0;
										try {
											const byName = OutPutAmount?.[idKey];
											const byAddr = OutPutAmount?.[addrKey] ?? OutPutAmount?.[addrKey?.toLowerCase?.()] ?? OutPutAmount?.[addrKey?.toUpperCase?.()];
											const v = byAddr !== undefined ? byAddr : byName;
											pending = Number(v || 0);
											if (!Number.isFinite(pending)) pending = 0;
										} catch { pending = 0; }
										// Show checkmark only if user swapped before, has no pending STATE left to swap,
										// and there are no available DAV units for this token right now (so a new round can't start yet)
										return swappedOnce && !(pending > 0) && !(Number(availableUnitsForToken) > 0);
									})()}
									/>
								)}
								{noTokens && null}
							</div>
						);
};

export default AuctionBoxes;
