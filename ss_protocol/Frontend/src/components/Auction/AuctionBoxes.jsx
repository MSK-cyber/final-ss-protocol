import React, { useMemo, useContext, useState, useEffect, useCallback, useRef } from "react";
import { ethers } from "ethers";
import "../../Styles/AuctionBoxes.css";
import { useSwapContract } from "../../Functions/SwapContractFunctions";
import { useAuctionStore, useTokenStore, useUserStore } from "../../stores";
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
		// Use Zustand stores for data that changes frequently (reduces re-renders)
		const todayTokenAddress = useAuctionStore(state => state.todayTokenAddress) || "";
		const todayTokenSymbol = useAuctionStore(state => state.todayTokenSymbol) || "";
		const todayTokenName = useAuctionStore(state => state.todayTokenName) || "";
		const todayTokenDecimals = useAuctionStore(state => state.todayTokenDecimals) || 18;
		const reverseWindowActive = useAuctionStore(state => state.reverseWindowActive);
		const AuctionTime = useAuctionStore(state => state.auctionTime);
		
		const isReversed = useTokenStore(state => state.isReversed) || {};
		const IsAuctionActive = useTokenStore(state => state.isAuctionActive) || {};
		const TokenRatio = useTokenStore(state => state.tokenRatios) || {};
		const tokenMap = useTokenStore(state => state.tokenMap);
		
		const userHashSwapped = useUserStore(state => state.userHasSwapped) || {};
		const userHasBurned = useUserStore(state => state.userHasBurned) || {};
		const userReverseStep1 = useUserStore(state => state.userReverseStep1) || {};
		const userReverseStep2 = useUserStore(state => state.userReverseStep2) || {};
		const AirdropClaimed = useUserStore(state => state.userHasAirdropClaimed) || {};
		const reverseStateMap = useUserStore(state => state.reverseStateMap) || {};
		
		// Functions still need to come from context
		const {
			AirDropAmount = {},
			getAirdropAmount,
			handleDexTokenSwap,
			performRatioSwap,
			performReverseSwapStep1,
			performReverseSwapStep2,
			CheckMintBalance,
			handleAddToken,
			SwapTokens,
			InputAmount,
			OutPutAmount,
			getInputAmount,
			getOutPutAmount,
			getTokenRatio,
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
		// OPTIMIZED: Removed JSON.stringify(AuctionTime) - was causing re-fetch every second
		const lastReverseCheckRef = useRef(0);
		useEffect(() => {
			let cancelled = false;
			// Debounce: only check every 10 seconds max
			const now = Date.now();
			if (now - lastReverseCheckRef.current < 10000) return;
			lastReverseCheckRef.current = now;
			
			(async () => {
				try {
					if (!AllContracts?.AuctionContract) { 
						setReverseNow(null); 
						return; 
					}
					// Use centralized today's token address from context
					let addr = todayTokenAddress;
					if (!addr || addr === ethers.ZeroAddress) { 
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
								let rev = false;
								try {
									rev = await AllContracts.AuctionContract.isReverseAuctionActive(addr);
								} catch (e) {
									rev = false; // Treat failures as not in reverse to avoid UI flicker
								}
								if (!cancelled) {
									const val = Boolean(rev);
									setReverseNow(val);
									// Update sticky mode immediately on definitive on-chain value
									setLastKnownMode(val ? 'reverse' : 'normal');
								}
				} catch (e) {
								if (!cancelled) setReverseNow(false);
				}
			})();
			return () => { cancelled = true; };
		}, [AllContracts?.AuctionContract, todayTokenAddress, reverseWindowActive]);

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
					// OPTIMIZED: Use stable reference instead of JSON.stringify
					const candidatesLengthRef = useRef(0);
					useEffect(() => {
						if (candidates.length !== candidatesLengthRef.current) {
							candidatesLengthRef.current = candidates.length;
							setIndex(0);
						}
					}, [candidates.length]);

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
			if (reverseNow === true) {
				return "reverse";
			}
			if (reverseNow === false) {
				return "normal";
			}
			// When reverseNow is temporarily unknown (null), keep last known mode to avoid UI flip
			if (lastKnownMode === 'reverse' || lastKnownMode === 'normal') {
				return lastKnownMode;
			}
			if (!selected) {
				return "normal";
			}
			const revFlag = selected.isReversing === true || selected.isReversing === "true";
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
	const resolveFlag = useCallback((mapObj, nameKey, addrKey) => {
		if (!mapObj) return false;
		let v = mapObj[nameKey];
		if (typeof v === 'string') v = v.toLowerCase() === 'true';
		if (v === undefined && addrKey) {
			v = mapObj[(addrKey || '').toLowerCase()];
		}
		if (typeof v === 'string') v = v.toLowerCase() === 'true';
		return Boolean(v);
	}, []);

	// OPTIMIZED: Debounced refresh - only fetch when token actually changes, not on every tick
	const lastRefreshRef = useRef({ id: null, timestamp: 0 });
	useEffect(() => {
		const now = Date.now();
		const tokenId = selected?.id || todayTokenAddress;
		// Only refresh if token changed OR 30 seconds passed
		if (lastRefreshRef.current.id === tokenId && now - lastRefreshRef.current.timestamp < 30000) {
			return;
		}
		lastRefreshRef.current = { id: tokenId, timestamp: now };
		
		try { getInputAmount?.(); } catch {}
		try { getOutPutAmount?.(); } catch {}
		// Also refresh live ratio map to keep TokenRatio current for the selected token
		try { getTokenRatio?.(); } catch {}
		// Refresh airdrop claimable amounts for Step 1 correctness
		try { getAirdropAmount?.(); } catch {}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selected?.id, todayTokenAddress, address, davHolds]);

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
	// OPTIMIZED: Debounce cycle-aware fetch - removed JSON.stringify(AuctionTime)
	const lastCycleAwareFetchRef = useRef({ key: null, timestamp: 0 });
	useEffect(() => {
		let cancelled = false;
		const now = Date.now();
		// Only fetch if address/token changed OR 30 seconds passed
		const fetchKey = `${address}-${selectedAddrKey}`;
		if (lastCycleAwareFetchRef.current.key === fetchKey && now - lastCycleAwareFetchRef.current.timestamp < 30000) {
			return;
		}
		lastCycleAwareFetchRef.current = { key: fetchKey, timestamp: now };
		
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
		return () => { cancelled = true; };
	}, [address, AllContracts?.airdropDistributor, selectedAddrKey]);

	const claimPerUnit = airdropPerDav; // on-chain constant when available
const fullTokenName = (selected?.name && selected?.name !== selected?.id ? selected?.name : null)
  || TOKENS?.[selected?.id]?.name
  || todayTokenName
  || selectedKey;

	// Cycle-aware Ratio Swap display (Step 2): after burning, keep showing values based on consumed units/tokens this cycle
	const [ratioCycleBurnTokens, setRatioCycleBurnTokens] = useState(0);
	const [ratioCycleDavUnitsUsed, setRatioCycleDavUnitsUsed] = useState(0);
	// OPTIMIZED: Debounce ratio cycle fetch - removed JSON.stringify triggers
	const lastRatioCycleFetchRef = useRef({ key: null, timestamp: 0 });
	useEffect(() => {
		let cancelled = false;
		const now = Date.now();
		const fetchKey = `${address}-${selectedAddrKey}`;
		// Only fetch if key changed OR 30 seconds passed
		if (lastRatioCycleFetchRef.current.key === fetchKey && now - lastRatioCycleFetchRef.current.timestamp < 30000) {
			return;
		}
		lastRatioCycleFetchRef.current = { key: fetchKey, timestamp: now };
		
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
		return () => { cancelled = true; };
	}, [address, AllContracts?.AuctionContract, selectedAddrKey, todayTokenDecimals, TOKENS, selected?.id]);

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
		// Optimized & simplified: a step is considered "done" as soon as
		// the on-chain flag reports it happened at least once. We no longer
		// gate ticks on remaining DAV units or pending STATE, which caused
		// checkmarks to disappear even after successful completion.
		const doneAirdrop = claimedOnce;
		const burnedOnce = resolveFlag(userHasBurned, idKey, addrKey);
		const doneRatioSwap = burnedOnce;
		const swappedOnce = resolveFlag(userHashSwapped, idKey, addrKey);
		const doneDexSwap = swappedOnce;
		return { doneAirdrop, doneRatioSwap, doneDexSwap };
	}, [selected?.id, todayTokenSymbol, todayTokenAddress, TOKENS, AirdropClaimed, userHasBurned, userHashSwapped]);

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

	// ============ SUBTITLE AMOUNT LOGIC ============
	// User requirement:
	// - activeDav = total DAV holdings (davHolds)
	// - consumedDav = DAV used this cycle (max of airdrop distributor and auction contract)
	// - unusedDav = activeDav - consumedDav
	// 
	// Priority:
	// 1. If unusedDav > 0 (user has DAV not yet used this cycle): show values based on unusedDav ONLY
	//    This handles the case where user completes auction, buys more DAV, and wants to see only new DAV
	// 2. If unusedDav == 0 (all DAV consumed this cycle): show values based on consumedDav
	//    This shows what user has done this cycle when all steps are complete
	
	const activeDav = Math.max(0, Number(davHolds || 0));
	// Use the maximum of both consumed sources to get the best available data
	const consumedFromAirdrop = Math.max(0, Number(consumedUnitsCurrentCycle || 0));
	const consumedFromAuction = Math.max(0, Number(ratioCycleDavUnitsUsed || 0));
	const consumedDavUnits = Math.max(consumedFromAirdrop, consumedFromAuction);
	
	// Calculate unused DAV = active DAV - consumed DAV (but not below 0)
	const unusedDavUnits = Math.max(0, activeDav - consumedDavUnits);
	
	// Determine which DAV count to use for display
	// If user has unused DAV (new purchases or not yet used): show only unused
	// If all DAV is consumed: show the consumed amount
	const displayDavUnits = unusedDavUnits > 0 ? unusedDavUnits : consumedDavUnits;
	
	// Calculate display amounts based on the chosen DAV units
	const displayAirdropAmount = displayDavUnits * Number(claimPerUnit || 0);
	const displayBurnAmount = displayDavUnits * Number(tokensPerDav || 0);
	const displayEstState = displayBurnAmount > 0 && Number(effectiveLiveRatio || 0) > 0
		? displayBurnAmount * Number(effectiveLiveRatio) * 2
		: 0;

	const airdropText = (() => {
		// Show airdrop amount based on current unused DAV, or consumed DAV if none left
		return `Claim Airdrop of ${formatWithCommas(displayAirdropAmount)} ${fullTokenName} tokens`;
	})();

// When the live auction token (todayTokenAddress) appears in candidates, auto-select it (address-based match)
// OPTIMIZED: Use stable reference instead of JSON.stringify
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
}, [todayTokenAddress, candidates.length, TOKENS, index]);

	// OPTIMIZED: Wrap handlers in useCallback to prevent re-creation on every render
	const doClaim = useCallback(async () => {
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
	}, [busy, address, AllContracts?.AuctionContract, todayTokenAddress, selectedAddrKey, CheckMintBalance]);

	const doRatioSwap = useCallback(async () => {
			if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
			const toastId = toast.loading("Starting Ratio Swap…", { position: 'top-center' });
			setBusy(true);
			try {
					const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
					const id = selected?.id || 'GLOBAL';
					await performRatioSwap(id, selected?.id, tokenAddress);
					toast.dismiss(toastId);
			} catch (e) {
					toast.dismiss(toastId);
			} finally { setBusy(false); }
		}, [address, busy, selected, TOKENS, performRatioSwap]);

		const doDexSwap = useCallback(async () => {
			if (!selected || !address || busy) { if (!address) toast.error("Connect your wallet to continue"); if (!selected) toast.error("No active token selected"); return; }
			const tokenOutAddress = TOKENS[selected.id]?.address;
			if (!tokenOutAddress) { toast.error("Token address not found for swap"); return; }
			const toastId = toast.loading("Starting DEX Swap…", { position: 'top-center' });
			setBusy(true);
		   try { 
				await handleDexTokenSwap(
					selected.id,
				   String(stateOutForDex || 0),
					signer,
					address,
					tokenOutAddress,
					ERC20_ABI,
					stateAddress,
				);
				toast.dismiss(toastId);
			} catch (e) {
				toast.dismiss(toastId);
			} finally { setBusy(false); }
		}, [selected, address, busy, TOKENS, handleDexTokenSwap, stateOutForDex, signer, stateAddress]);

		// Step 3 via contract pool swap (swapTokens)
		const doContractSwap = useCallback(async () => {
			if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
			const toastId = toast.loading("Starting Swap…", { position: 'top-center' });
			setBusy(true);
				try {
					const tokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
					const id = selected?.id || 'GLOBAL';
					await SwapTokens(id, selected?.id, tokenAddress);
					toast.dismiss(toastId);
				} catch (e) {
					toast.dismiss(toastId);
				} finally { setBusy(false); }
		}, [address, busy, selected, TOKENS, SwapTokens]);

						const noTokens = !candidates || candidates.length === 0;


						// Header title (string) only for normal/reverse auction label and token name
						// Kept simple per request: no extra badges/UI beyond normal auction behavior


					const headerTitle = selected
						? `${isReverse ? "Reverse Auction" : "Auction"} — ${selectedDisplayName}`
						: (todayTokenName ? `Auction — ${todayTokenName}` : (todayTokenSymbol ? `Auction — ${todayTokenSymbol}` : "Auction"));

					// Keep Ratio Swap subtitle stable: based on unused DAV or consumed DAV
					const ratioTextNormal = (() => {
						const fullName = selectedDisplayName || (selected?.id || ratioKey);
						// Use the same displayBurnAmount calculated earlier (based on unused or consumed DAV)
						const burnStr = formatWithCommas(displayBurnAmount);
						const estStr = displayEstState > 0
							? (displayEstState >= 1 ? formatWithCommas(Math.floor(displayEstState)) : displayEstState.toFixed(6))
							: null;

						if (effectiveLiveRatio > 0 && estStr) {
							return `Burn ${burnStr} ${fullName} tokens for ${estStr} STATE tokens`;
						}
						// Fallback when no ratio available
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

						// OPTIMIZED: Wrap in useCallback
						const doReverseSwap = useCallback(async () => {
							if (!address || busy) { if (!address) toast.error("Connect your wallet to continue"); return; }
							const toastId = toast.loading("Starting Reverse Swap…", { position: 'top-center' });
							setBusy(true);
							try {
																// Use the live token-of-day when reverse is active to stay aligned with on-chain window
															const selectedTokenAddress = selected ? (TOKENS[selected.id]?.address || selected.address) : undefined;
															const tokenAddress = (reverseNow === true && todayTokenAddress) ? todayTokenAddress : selectedTokenAddress;
															// Silent switch: avoid showing a toast in the corner when overriding selection
								const id = selected?.id || 'GLOBAL';
								await performReverseSwapStep1(id, selected?.id, tokenAddress);
								toast.dismiss(toastId);
							} catch (e) {
								toast.dismiss(toastId);
							} finally { setBusy(false); }
						}, [address, busy, selected, TOKENS, reverseNow, todayTokenAddress, performReverseSwapStep1]);

						// Build DEX row description for normal mode based on unused/consumed DAV
						const dexRowText = (() => {
							if (!selected) return "Use DEX to swap STATE for TOKEN";
							const tokenName = selectedDisplayName || selected?.id || todayTokenSymbol || "TOKEN";
							const ratio = Number(effectiveLiveRatio || 0);
							
							// Use the same displayEstState calculated earlier (based on unused or consumed DAV)
							if (ratio > 0 && displayEstState > 0) {
								const stateStr = displayEstState >= 1 ? formatWithCommas(Math.floor(displayEstState)) : displayEstState.toFixed(6);
								const tokenOut = displayEstState / ratio;
								const tokenStr = tokenOut >= 1 ? formatWithCommas(Math.floor(tokenOut)) : tokenOut.toFixed(6);
								return `Swap ${stateStr} STATE tokens for ${tokenStr} ${tokenName} tokens`;
							}
							if (ratio > 0) {
								// Simple, stable quote: 1 STATE ≈ X TOKEN
								const perState = 1 / ratio;
								const quote = perState >= 1 ? formatWithCommas(Math.floor(perState)) : perState.toFixed(6);
								return `Swap STATE for ${tokenName} • 1 STATE ≈ ${quote} ${tokenName}`;
							}
							// Stable generic fallback
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
											return resolveFlag(AirdropClaimed, idKey, addrKey);
										})()}
											doneRatioSwap={(() => {
												const idKey = selected?.id || todayTokenSymbol || '';
												const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
												return resolveFlag(userHasBurned, idKey, addrKey);
											})()}
										doneDexSwap={(() => {
											const idKey = selected?.id || todayTokenSymbol || '';
											const addrKey = (TOKENS?.[selected?.id]?.address) || selected?.address || todayTokenAddress || '';
											return resolveFlag(userHashSwapped, idKey, addrKey);
										})()}
									/>
								)}
								{noTokens && null}
							</div>
						);
};

export default AuctionBoxes;
