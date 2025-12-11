import { createAppKit } from "@reown/appkit/react";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { avalanche, pulsechain, bsc, mainnet, sonic } from "@reown/appkit/networks";
import { QueryClient } from "@tanstack/react-query";

// 0. Setup queryClient with optimized memory settings
const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			// Data is fresh for 30 seconds - prevents over-fetching
			staleTime: 30 * 1000,
			// Garbage collect unused data after 5 minutes (previously 24 hours!)
			// This is critical for memory - old setting kept ALL data for 24 hours
			gcTime: 5 * 60 * 1000,
			// Don't refetch on window focus - we use smart polling
			refetchOnWindowFocus: false,
			// Don't refetch on reconnect
			refetchOnReconnect: false,
			// Retry 2 times on failure
			retry: 2,
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
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
