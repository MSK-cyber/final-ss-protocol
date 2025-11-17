// useAddTokens.js

import { ethers } from "ethers";
import { useDAvContract } from "../Functions/DavTokenFunctions";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useEffect, useState } from "react";

// ✅ 1. First hook: for general token config
export const useAddTokens = () => {
	const { names, users, Emojies, isUsed } = useDAvContract();
	const { tokenMap, TimeLeftClaim, supportedToken, isTokenRenounce } = useSwapContract();
	const [AuthLoading, setAuthLoading] = useState(true);

	useEffect(() => {
		const checkDataFetched = () => {
			const isDataReady =
				names?.length > 0 &&
				users?.length > 0 &&
				Emojies?.length > 0 &&
				isUsed?.length > 0 &&
				tokenMap &&
				Object.keys(tokenMap).length > 0 &&
				TimeLeftClaim &&
				supportedToken &&
				isTokenRenounce;

			setAuthLoading(!isDataReady);
		};

		checkDataFetched();
	}, [names, users, Emojies, isUsed, tokenMap, TimeLeftClaim, supportedToken, isTokenRenounce]);

	// Build only non-renounced tokens
	const tokens = names
		.map((name, index) => {
			const isDeployed = isUsed?.[index] ?? false;

			// Convert string "true"/"false" to actual boolean
			const isRenounceToken = String(isTokenRenounce?.[name]).toLowerCase() === "true";
			if (isRenounceToken) return null; // 🚨 Skip renounced tokens entirely

			const isAdded = supportedToken?.[name] ?? false;
			const Emojis = Emojies[index] || "❓";
			const tokenAddress = tokenMap?.[name] || "0x0000000000000000000000000000000000000000";
			const timeLeft = TimeLeftClaim?.[name] || "0";
			const user = users[index];

			return {
				id: user,
				user,
				name,
				isDeployed,
				Emojis,
				isRenounceToken,
				isAdded,
				Pname: `${name} - State - ${name}`,
				ReverseName: `State - ${name}`,
				ContractName: name || user,
				image: undefined,
				TokenAddress: tokenAddress,
				TimeLeft: timeLeft,
			};
		})
		.filter(Boolean); // remove nulls (renounced tokens)

	return {
		tokens,
		AuthLoading,
	};
};


// ✅ 2. Second hook: for owner-specific supported tokens


export const useUsersOwnerTokens = () => {
	const { UsersSupportedTokens } = useSwapContract();
	const { names, Emojies } = useDAvContract();

	// Create name → Emojies map
	const emojiesMap = names.reduce((acc, name, index) => {
		acc[name] = Emojies?.[index] ?? 'Unknown';
		return acc;
	}, {});


	let tokenList = [];

	if (UsersSupportedTokens) {
		try {
			// Handle array of { address, name, pairAddress } objects
			if (Array.isArray(UsersSupportedTokens)) {
				tokenList = UsersSupportedTokens;
			} else if (typeof UsersSupportedTokens === "object") {
				tokenList = Object.values(UsersSupportedTokens).flat();
			}
		} catch (error) {
			console.error("Error processing UsersSupportedTokens:", error);
			tokenList = [];
		}
	}


	const result = tokenList.map((token, index) => {
		let actualAddress = "0x0000000000000000000000000000000000000000";
		let tokenName = `Token_${index + 1}`;
		let pairAddress = "0x0000000000000000000000000000000000000000";
		let nextClaimTime = "0";
		let emojis = emojiesMap[tokenName] || 'Unknown';
		if (token && typeof token === "object") {
			if (token.address && ethers.isAddress(token.address)) {
				actualAddress = token.address;
			}
			if (token.name) {
				tokenName = token.name;
				emojis = emojiesMap[tokenName] || 'Unknown';

			}
			if (token.pairAddress && ethers.isAddress(token.pairAddress)) {
				pairAddress = token.pairAddress;
			}
			if (token.nextClaimTime) {
				nextClaimTime = token.nextClaimTime;
			}
		} else if (typeof token === "string" && ethers.isAddress(token)) {
			actualAddress = token;
		}

		const tokenEntry = {
			name: tokenName,
			address: actualAddress,
			pairAddress: pairAddress,
			nextClaimTime: nextClaimTime,
			Emojis: emojis,
		};

		return tokenEntry;
	});

	return result;
};

// ✅ Exported Addresses Object: tokenName with tokenAddress

