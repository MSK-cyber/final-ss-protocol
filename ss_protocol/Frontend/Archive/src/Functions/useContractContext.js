import { useContext, useMemo } from "react";
import { ContractContext } from "./ContractInitialize.jsx";

// Simple hook to access contracts and signer/provider from ContractContext
export const useContractContext = () => {
	const ctx = useContext(ContractContext);

	const AuctionContract = ctx?.AllContracts?.AuctionContract ?? null;

	// Memoize a convenient shape for consumers
	return useMemo(
		() => ({
			// base context
			...ctx,
			// commonly used handles
			AuctionContract,
			BuyAndBurnController: ctx?.AllContracts?.buyBurnController ?? null,
			LPHelper: ctx?.AllContracts?.lpHelper ?? null,
			LiquidityManager: ctx?.AllContracts?.liquidityManager ?? null,
			SwapLens: ctx?.AllContracts?.swapLens ?? null,
			// resolved addresses when available
			addresses: {
				state:
					ctx?.contracts?.addresses?.state ||
					ctx?.AllContracts?.stateContract?.target ||
					null,
				dav:
					ctx?.contracts?.addresses?.dav ||
					ctx?.AllContracts?.davContract?.target ||
					null,
				swap: ctx?.AllContracts?.AuctionContract?.target || null,
			},
		}),
		[ctx, AuctionContract]
	);
};

export default useContractContext;

