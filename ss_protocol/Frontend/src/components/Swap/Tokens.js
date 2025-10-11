// Frontend/src/components/Swap/Tokens.js
import { useEffect, useState } from "react";
import { TokensDetails } from "../../data/TokensDetails";
import { useChainId } from "wagmi";
import state from "../../assets/statelogo.png";
import sonic from "../../assets/S_token.svg";
import pulsechainLogo from "../../assets/pls1.png";

export function useAllTokens() {
	const chainId = useChainId();
	const { tokens: dynamicTokens } = TokensDetails();
	const [apiTokensObj, setApiTokensObj] = useState({});

	useEffect(() => {
		let mounted = true;

		async function fetchApiTokens() {
			try {
				let tokensData = [];

				if (chainId === 369) {
					// wPLS (Wrapped Pulse) token data
					const wpls = {
						name: "Wrapped Pulse",
						symbol: "WPLS",
						address: "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
						decimals: 18,
						image: pulsechainLogo,
					};

					const obj = {
						[wpls.name]: wpls,
					};

					if (mounted) setApiTokensObj(obj);
					return;

				} else if (chainId == 146) {
					const wpls = {
						name: "Wrapped Sonic",
						symbol: "Ws",
						address: "0x039e2fb66102314ce7b64ce5ce3e5183bc94ad38",
						decimals: 18,
						image: sonic,
					};

					const obj = {
						[wpls.name]: wpls,
					};

					if (mounted) setApiTokensObj(obj);
					return;
				}
				else {
					// All other chains → Uniswap token list
					const res = await fetch("https://ipfs.io/ipns/tokens.uniswap.org");
					if (!res.ok) throw new Error("Failed to fetch Uniswap tokenlist");
					const data = await res.json();
					tokensData =
						data.tokens?.filter((t) => t.chainId === chainId) || [];
				}

				// Default mapping for non-PulseChain
				const obj = {};
				tokensData.forEach((t) => {
					obj[t.name || t.symbol] = {
						symbol: t.symbol,
						address: t.address,
						decimals: t.decimals,
						image: t.logoURI || null,
						name: t.name,
					};
				});

				if (mounted) setApiTokensObj(obj);
			} catch (e) {
				console.error("fetchApiTokens error:", e);
				if (mounted) setApiTokensObj({});
			}
		}

		fetchApiTokens();
		return () => {
			mounted = false;
		};
	}, [chainId]);

	// Keep your dynamic tokens
	const dynamicTokensObj = {};
	dynamicTokens
		.filter((token) => token.tokenName !== "DAV")
		.forEach((token) => {
			let image = token.image || token.logoURI;
			let emoji;
			if (token.emoji) emoji = token.emoji;
			if (token.tokenName === "STATE") image = state;
			if (!image && emoji) image = emoji;

			dynamicTokensObj[token.tokenName] = {
				symbol: token.tokenName,
				address: token.TokenAddress,
				decimals: token.decimals ?? 18,
				image,
				...(emoji ? { emoji } : {}),
			};
		});

	// Merge dynamic tokens with API tokens (dynamic overrides API)
	return { ...dynamicTokensObj, ...apiTokensObj };
}
