// Frontend/src/components/Swap/Tokens.js
import { useEffect, useState, useMemo, useRef } from "react";
import { TokensDetails } from "../../data/TokensDetails";
import { generateIdenticon } from "../../utils/identicon";
import { useChainId } from "wagmi";
import state from "../../assets/statelogo.png";
import sonic from "../../assets/S_token.svg";
import pulsechainLogo from "../../assets/pls1.png";
import { getRuntimeConfigSync } from "../../Constants/RuntimeConfig";

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
					const cfg = getRuntimeConfigSync();
					const wpls = {
						name: "Wrapped Pulse",
						symbol: "WPLS",
						address: cfg?.dex?.baseToken?.address || "0xA1077a294dDE1B09bB078844df40758a5D0f9a27",
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

	// Create stable reference for dynamic tokens to avoid JSON.stringify in useMemo dependency
	const dynamicTokensKeyRef = useRef('');
	const currentKey = dynamicTokens
		.map(t => `${t.tokenName || ''}:${t.TokenAddress || ''}`)
		.sort()
		.join('|');
	
	// Only update if key actually changed
	if (dynamicTokensKeyRef.current !== currentKey) {
		dynamicTokensKeyRef.current = currentKey;
	}

	// Memoize dynamic tokens object to prevent new object creation on every render
	// This is CRITICAL to prevent memory leaks - dynamicTokens changes trigger useTokenBalances refetch
	const dynamicTokensObj = useMemo(() => {
		const obj = {};
		dynamicTokens
			.filter((token) => token.tokenName !== "DAV")
			.forEach((token) => {
				let image = token.image || token.logoURI;
				let emoji;
				if (token.emoji) emoji = token.emoji;
				if (token.tokenName === "STATE") image = state;
				// If no explicit image, use emoji if it's an image URL (data/http)
				if (!image && typeof emoji === 'string' && (emoji.startsWith('data:image/') || emoji.startsWith('http') || emoji.startsWith('/'))) {
					image = emoji;
				}
				// If still no image, fall back to MetaMask-style identicon by address
				if (!image) {
					image = generateIdenticon(token.TokenAddress);
				}

				obj[token.tokenName] = {
					symbol: token.tokenName,
					address: token.TokenAddress,
					decimals: token.decimals ?? 18,
					image,
					displayName: token.displayName || token.name || token.tokenName,
					...(emoji ? { emoji } : {}),
				};
			});
		return obj;
	}, [dynamicTokensKeyRef.current]);

	// Memoize the final merged object to prevent creating new objects on every render
	return useMemo(() => ({ ...dynamicTokensObj, ...apiTokensObj }), [dynamicTokensObj, apiTokensObj]);
}
