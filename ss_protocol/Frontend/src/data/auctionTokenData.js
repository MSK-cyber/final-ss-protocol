import { useState, useEffect, useRef } from "react";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useDAvContract } from "../Functions/DavTokenFunctions";

export const useAuctionTokens = () => {
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

	// Create name-to-emoji mapping
	const nameToEmoji =
		Array.isArray(names) && Array.isArray(Emojies) && names.length === Emojies.length
			? names.reduce((acc, name, index) => {
				acc[name.toLowerCase()] = Emojies[index] || "🔹";
				return acc;
			}, {})
			: {};

	const dynamicTokenNames = Array.from(TokenNames || []).filter(
		(name) => name !== "DAV" && name !== "STATE"
	);

	const handleAddMap = {
		second: () => { }, // Replace with actual handler if exists
	};

	const newTokenConfigs = dynamicTokenNames.map((contract) => {
		const id = contract;
		const handleAddToken = handleAddMap[contract] || (() => { });
		const address =
			tokenMap?.[contract] || "0x0000000000000000000000000000000000000000";
		const emoji = nameToEmoji[contract.toLowerCase()];

		return {
			id,
			name: id,
			emoji: emoji || "🔹",
			ContractName: contract,
			token: address,
			handleAddToken,
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
			SwapT: () => SwapTokens(id, contract),
			onlyInputAmount: InputAmount[contract],
			onlyState: OutPutAmount?.[contract] || 0,
			inputTokenAmount: `${InputAmount[contract] || 0} ${id}`,
			outputToken: `${OutPutAmount?.[contract] || 0} STATE`,
		};
	});

	// Compare snapshots to update only if something actually changed
	useEffect(() => {
		const snapshot = JSON.stringify(newTokenConfigs);
		if (prevSnapshotRef.current !== snapshot) {
			prevSnapshotRef.current = snapshot;
			setCachedTokens(newTokenConfigs);
		}
	}, [newTokenConfigs]);

	// Loading detection
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

		setLoading(!isDataReady);
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
