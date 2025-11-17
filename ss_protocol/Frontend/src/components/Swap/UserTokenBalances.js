import { useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { ContractContext } from "../../Functions/ContractInitialize";

/**
 * Fetch user balances for all supported tokens.
 * @param {object} TOKENS - Dictionary of token metadata (including address and decimals).
 * @param {object} signer - ethers.js signer instance.
 * @returns {object} Object with balances keyed by token symbol.
 */
const useTokenBalances = (TOKENS, signer) => {
  const { address } = useAccount();
  const { provider } = useContext(ContractContext);
  const [balances, setBalances] = useState({});

  useEffect(() => {
    const fetchBalances = async () => {
      // Prefer read-only provider whenever possible for stability
      const readProvider = provider || signer?.provider;
      if (!address || !readProvider || !TOKENS) return;

      const tempBalances = {};

      for (const symbol of Object.keys(TOKENS)) {
        try {
          const token = TOKENS[symbol];
          if (!token || !token.address) continue;

          // PLS balance
          if (symbol === "WPLS") {
            const plsBal = await readProvider.getBalance(address);
            tempBalances[symbol] = ethers.formatUnits(plsBal, 18);
            continue;
          }

          // Guard: ensure the address has contract code before treating it as ERC20
          const code = await readProvider.getCode(token.address).catch(() => "0x");
          if (!code || code === "0x") {
            // Not a contract (or not yet deployed) — treat balance as zero
            tempBalances[symbol] = "0";
            continue;
          }

          const contract = new ethers.Contract(
            token.address,
            ["function balanceOf(address) view returns (uint256)"],
            readProvider
          );
          const bal = await contract.balanceOf(address);
          const decimals = Number.isFinite(Number(token.decimals)) ? token.decimals : 18;
          tempBalances[symbol] = ethers.formatUnits(bal, decimals);
        } catch (err) {
          console.warn(`Error fetching balance for ${symbol}:`, err?.shortMessage || err?.message || err);
          tempBalances[symbol] = "0";
        }
      }

      setBalances(tempBalances);
    };

    fetchBalances();
  }, [address, provider, signer, TOKENS]);

  return balances;
};

export default useTokenBalances;
