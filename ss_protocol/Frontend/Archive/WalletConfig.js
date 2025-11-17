import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { avalanche, pulsechain, bsc, mainnet, sonic } from "@reown/appkit/networks";
import { QueryClient } from "@tanstack/react-query";

// 0. Setup queryClient
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: Infinity,
			cacheTime: 1000 * 60 * 60 * 24, // 24 hours
			refetchOnWindowFocus: false,
		},
	},
});

// 1. Get projectId from environment variable
const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
if (!projectId) throw new Error("Reown projectId is not defined");

// 3. Define networks
const networks = [mainnet, avalanche, pulsechain, bsc, sonic];

// 4. Create Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
	networks,
	projectId,
	ssr: false,
});

// 5. Create AppKit configuration
try {
	createAppKit({
		adapters: [wagmiAdapter],
		networks,
		defaultNetwork: pulsechain,
		projectId,
		chainImages: {
			369: "/pulse-chain.png",
			146: "/S_token.svg",
		},
		features: {
			socials: false,
			email: false
		},
	});
} catch (error) {
	console.error("Failed to initialize AppKit:", error);
}

export { wagmiAdapter, queryClient, networks };

export const chains = [pulsechain, avalanche, mainnet, bsc, sonic];


export const chainCurrencyMap = {
	[avalanche.id]: avalanche.nativeCurrency.symbol,
	[bsc.id]: bsc.nativeCurrency.symbol,
	[sonic.id]: sonic.nativeCurrency.symbol,
	[pulsechain.id]: pulsechain.nativeCurrency.symbol,
	[mainnet.id]: mainnet.nativeCurrency.symbol,
};
