import { StrictMode, Suspense } from "react";
import PropTypes from "prop-types";
import { WagmiProvider } from "wagmi";
import { QueryClientProvider } from "@tanstack/react-query";
import { wagmiAdapter, queryClient } from "../WalletConfig.js"; // Import from WalletConfig
import { ContractProvider } from "./Functions/ContractInitialize.jsx";
import { DavProvider } from "./Functions/DavTokenFunctions.jsx";
import { SwapContractProvider } from "./Functions/SwapContractFunctions.jsx";

function ContractProviderWrapper({ children }) {
  return (
    <ContractProvider>
      <DavProvider>
        <SwapContractProvider>{children}</SwapContractProvider>
      </DavProvider>
    </ContractProvider>
  );
}

ContractProviderWrapper.propTypes = {
  children: PropTypes.node.isRequired,
};

export default function Providers({ children }) {
  Providers.propTypes = {
    children: PropTypes.node.isRequired,
  };

  return (
    <StrictMode>
      <WagmiProvider config={wagmiAdapter.wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <Suspense fallback={<div>Loading wallet and contracts...</div>}>
            <ContractProviderWrapper>{children}</ContractProviderWrapper>
          </Suspense>
        </QueryClientProvider>
      </WagmiProvider>
    </StrictMode>
  );
}