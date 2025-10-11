import { useState, useEffect } from "react";
import {
	getDAVContractAddress,
	getSTATEContractAddress,
} from "../Constants/ContractAddresses";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useDAvContract } from "../Functions/DavTokenFunctions";
import { useChainId } from "wagmi";

export const shortenAddress = (addr) =>
	addr ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : "";

export const TokensDetails = () => {
	const swap = useSwapContract();
	const { Emojies, names } = useDAvContract();
	const chainId = useChainId();
	const [loading, setLoading] = useState(true);
	const [refreshKey, setRefreshKey] = useState(0); // State to trigger refresh

	// Get contract addresses for the connected chain
	const getDavAddress = () => getDAVContractAddress(chainId);
	const getStateAddress = () => getSTATEContractAddress(chainId);

	// Create a name-to-emoji mapping
	const nameToEmoji = Array.isArray(names) && Array.isArray(Emojies) && names.length === Emojies.length
		? names.reduce((acc, name, index) => {
			acc[name.toLowerCase()] = Emojies[index] || "🔹";
			return acc;
		}, {})
		: {};

	// Static tokens
	const staticTokens = [
		{
			name: "DAV",
			key: "DAV",
			displayName: "pDAV",
			address: getDavAddress(),
			supply: "5,000,000.00",
			price: 0,
			actions: {
				ReanounceContract: swap.ReanounceContract,
			},
		},
		{
			name: "STATE",
			key: "state",
			address: getStateAddress(),
		},
	];

	// Dynamic tokens
	const dynamicTokens = Array.from(swap.TokenNames || [])
		.filter((name) => name !== "DAV" && name !== "STATE")
		.map((name) => {
			const emoji = nameToEmoji[name.toLowerCase()];
			return {
				name,
				key: name,
				address: swap.tokenMap?.[name] || "0x0000000000000000000000000000000000000000",
				price: 0,
				emoji: emoji || "🔹",
			};
		});

	const data = [...staticTokens, ...dynamicTokens];

	const tokens = data.map((token) => {
		const key = token.key;
		let emoji = token.emoji || "🔹";

		return {
			tokenName: token.name,
			key: shortenAddress(token.address),
			name: token.displayName || token.name,
			Price: token.price,
			ratio: swap.TokenRatio?.[key],
			emoji,
			isRenounced: swap.isTokenRenounce?.[token.name],
			DavVault: swap.TokenBalance?.[key],
			BurnedLp: swap.burnedLPAmount?.[token.name]?.balance ?? "0",
			burned: swap.burnedAmount?.[key],
			isSupported:
				token.name === "DAV"
					? "true"
					: token.name === "STATE"
						? "true"
						: swap.supportedToken?.[key],
			TokenAddress: token.address,
			PairAddress: swap.TokenPariAddress?.[key] || "0x0000000000000000000000000000000000000000",
			Cycle:
				swap.CurrentCycleCount?.[key] === "not started"
					? "Not Started"
					: swap.CurrentCycleCount?.[key] + 1,
		};
	});

	// Refetch function to reload all values
	const refetch = () => {
		setLoading(true);
		setRefreshKey((prev) => prev + 1); // Increment refreshKey to trigger useEffect
	};

	useEffect(() => {
		const checkDataFetched = () => {
			if (dynamicTokens.length === 0) {
				setLoading(false);
				return;
			}

			const isDataReady =
				swap.TokenNames?.length > 0 &&
				swap.tokenMap &&
				Object.keys(swap.tokenMap).length > 0 &&
				Emojies?.length > 0 &&
				names?.length > 0 &&
				swap.isTokenRenounce &&
				swap.TokenBalance &&
				swap.burnedAmount &&
				swap.supportedToken &&
				swap.CurrentCycleCount;

			setLoading(!isDataReady);
		};

		checkDataFetched();
	}, [
		swap.TokenNames,
		swap.tokenMap,
		Emojies,
		names,
		swap.isTokenRenounce,
		swap.TokenBalance,
		swap.burnedAmount,
		swap.supportedToken,
		swap.CurrentCycleCount,
		dynamicTokens.length,
		refreshKey, // Add refreshKey to dependencies to trigger re-run
	]);

	return { tokens, loading, refetch };
};