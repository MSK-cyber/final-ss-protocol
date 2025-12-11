import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { generateIdenticon } from "../utils/identicon";
import { isImageUrl } from "../Constants/Constants";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useDAvContract } from "../Functions/DavTokenFunctions";

export const useAuctionTokens = () => {
	// Use context directly for reliable immediate data access
	const {
		SwapTokens,
		isReversed,
		AuctionTime,
		RatioTargetsofTokens,
		IsAuctionActive,
		userHashSwapped,
		userHasReverseSwapped,
		InputAmount,
		OutPutAmount,
		AirdropClaimed,
		TokenNames,
		tokenMap,
	} = useSwapContract();

	const { Emojies, names } = useDAvContract();
	const [loading, setLoading] = useState(true);
	const [cachedTokens, setCachedTokens] = useState([]); // store last known good state
	const prevSnapshotRef = useRef(null); // for shallow compare

	// OPTIMIZED: Memoize name-to-emoji mapping
	const nameToEmoji = useMemo(() => {
		if (!Array.isArray(names) || !Array.isArray(Emojies) || names.length !== Emojies.length) {
			return {};
		}
		return names.reduce((acc, name, index) => {
			acc[name.toLowerCase()] = Emojies[index] || "🔹";
			return acc;
		}, {});
	}, [names, Emojies]);

	// OPTIMIZED: Memoize filtered token names
	const dynamicTokenNames = useMemo(() => {
		return Array.from(TokenNames || []).filter(
			(name) => name !== "DAV" && name !== "STATE"
		);
	}, [TokenNames]);

	// OPTIMIZED: Stable SwapTokens wrapper via useCallback
	const swapTokensWrapper = useCallback((id, contract) => {
		return SwapTokens(id, contract);
	}, [SwapTokens]);

	// OPTIMIZED: Memoize newTokenConfigs to prevent recreation on every render
	const newTokenConfigs = useMemo(() => {
		return dynamicTokenNames.map((contract) => {
			const id = contract;
			const address =
				tokenMap?.[contract] || "0x0000000000000000000000000000000000000000";
			const mappedEmoji = nameToEmoji[contract.toLowerCase()];
			// Prefer on-chain/ipfs image if available, else identicon for the address
			const emoji = isImageUrl(mappedEmoji) ? mappedEmoji : generateIdenticon(address);

			return {
				id,
				name: id,
				emoji,
				ContractName: contract,
				token: address,
				handleAddToken: () => {},
				ratio: `1:${RatioTargetsofTokens?.[contract] || 0}`,
				currentRatio: `1:1000`,
				TimeLeft: AuctionTime?.[contract],
				AirdropClaimedForToken: AirdropClaimed?.[contract],
				isReversing: isReversed?.[contract],
				RatioTargetToken: RatioTargetsofTokens?.[contract] || 0,
				address,
				AuctionStatus: IsAuctionActive?.[contract],
				userHasSwapped: userHashSwapped?.[contract],
				userHasReverse: userHasReverseSwapped?.[contract],
				SwapT: () => swapTokensWrapper(id, contract),
				onlyInputAmount: InputAmount[contract],
				onlyState: OutPutAmount?.[contract] || 0,
				inputTokenAmount: `${InputAmount[contract] || 0} ${id}`,
				outputToken: `${OutPutAmount?.[contract] || 0} STATE`,
			};
		});
	}, [dynamicTokenNames, tokenMap, nameToEmoji, RatioTargetsofTokens, AuctionTime, AirdropClaimed, isReversed, IsAuctionActive, userHashSwapped, userHasReverseSwapped, InputAmount, OutPutAmount, swapTokensWrapper]);

	// OPTIMIZED: Debounced cache update - only update if meaningful change detected
	const lastUpdateRef = useRef(0);
	useEffect(() => {
		// Debounce: don't update more than once per second
		const now = Date.now();
		if (now - lastUpdateRef.current < 1000) return;
		
		const snapshot = JSON.stringify(newTokenConfigs);
		if (prevSnapshotRef.current !== snapshot) {
			prevSnapshotRef.current = snapshot;
			lastUpdateRef.current = now;
			setCachedTokens(newTokenConfigs);
		}
	}, [newTokenConfigs]);

	// Loading detection with sticky success: once data is ready, don't flip back to loading
	useEffect(() => {
		const isDataReady =
			TokenNames?.length > 0 &&
			AuctionTime &&
			tokenMap &&
			isReversed &&
			IsAuctionActive &&
			userHashSwapped &&
			userHasReverseSwapped &&
			InputAmount &&
			OutPutAmount &&
			AirdropClaimed &&
			names?.length > 0 &&
			Emojies?.length > 0;

		if (isDataReady) {
			setLoading(false);
		}
	}, [
		TokenNames,
		AuctionTime,
		tokenMap,
		Emojies,
		names,
		isReversed,
		IsAuctionActive,
		userHashSwapped,
		userHasReverseSwapped,
		InputAmount,
		OutPutAmount,
		AirdropClaimed,
	]);

	return { tokens: cachedTokens, loading };
};
