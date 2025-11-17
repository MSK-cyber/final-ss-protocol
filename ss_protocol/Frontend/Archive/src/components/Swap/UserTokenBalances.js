import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";

/**
 * Fetch user balances for all supported tokens.
 * @param {object} TOKENS - Dictionary of token metadata (including address and decimals).
 * @param {object} signer - ethers.js signer instance.
 * @returns {object} Object with balances keyed by token symbol.
 */
const useTokenBalances = (TOKENS, signer) => {
  const { address } = useAccount();
  const [balances, setBalances] = useState({});

  useEffect(() => {
    const fetchBalances = async () => {
      if (!address || !signer || !TOKENS) return;

      const tempBalances = {};

      for (const symbol of Object.keys(TOKENS)) {
        try {
          const token = TOKENS[symbol];
          if (!token || !token.address) continue;

          // PLS balance
          if (symbol === "WPLS") {
            const plsBal = await signer.provider.getBalance(address);
            tempBalances[symbol] = ethers.formatUnits(plsBal, 18);
          } else {
            const contract = new ethers.Contract(
              token.address,
              ["function balanceOf(address) view returns (uint256)"],
              signer
            );
            const bal = await contract.balanceOf(address);
            tempBalances[symbol] = ethers.formatUnits(bal, token.decimals);
          }
        } catch (err) {
          console.error(`Error fetching balance for ${symbol}:`, err);
          tempBalances[symbol] = "0";
        }
      }

      setBalances(tempBalances);
    };

    fetchBalances();
  }, [address, signer, TOKENS]);

  return balances;
};

export default useTokenBalances;
