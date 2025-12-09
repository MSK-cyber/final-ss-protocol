import { useContext, useEffect, useState, useRef } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { ContractContext } from "../../Functions/ContractInitialize";

/**
 * Fetch user balances for all supported tokens.
 * MEMORY OPTIMIZATION: Uses stable dependency tracking to prevent infinite refetch loops.
 * @param {object} TOKENS - Dictionary of token metadata (including address and decimals).
 * @param {object} signer - ethers.js signer instance.
 * @returns {object} Object with balances keyed by token symbol.
 */
const useTokenBalances = (TOKENS, signer) => {
  const { address } = useAccount();
  const { provider } = useContext(ContractContext);
  const [balances, setBalances] = useState({});
  
  // Create a stable string key from TOKENS to prevent refetching on every render
  // This is CRITICAL for memory optimization
  const tokensKey = TOKENS ? JSON.stringify(Object.keys(TOKENS).sort()) : '';
  const lastFetchRef = useRef({ key: '', timestamp: 0 });
  const FETCH_DEBOUNCE_MS = 2000; // 2 second debounce between fetches (reduced from 5s)

  useEffect(() => {
    const fetchBalances = async () => {
      // Prefer read-only provider whenever possible for stability
      const readProvider = provider || signer?.provider;
      if (!address || !readProvider || !TOKENS || !tokensKey) return;
      
      // Debounce: Don't refetch if we fetched recently with the same key
      const now = Date.now();
      if (lastFetchRef.current.key === tokensKey && 
          now - lastFetchRef.current.timestamp < FETCH_DEBOUNCE_MS) {
        return;
      }
      lastFetchRef.current = { key: tokensKey, timestamp: now };

      const tokenKeys = Object.keys(TOKENS);
      
      // Fetch all balances in PARALLEL for much faster loading
      const balancePromises = tokenKeys.map(async (symbol) => {
        try {
          const token = TOKENS[symbol];
          if (!token || !token.address) return { symbol, balance: "0" };

          // PLS balance
          if (symbol === "WPLS") {
            const plsBal = await readProvider.getBalance(address);
            return { symbol, balance: ethers.formatUnits(plsBal, 18) };
          }

          // Guard: ensure the address has contract code before treating it as ERC20
          const code = await readProvider.getCode(token.address).catch(() => "0x");
          if (!code || code === "0x") {
            return { symbol, balance: "0" };
          }

          const contract = new ethers.Contract(
            token.address,
            ["function balanceOf(address) view returns (uint256)"],
            readProvider
          );
          const bal = await contract.balanceOf(address);
          const decimals = Number.isFinite(Number(token.decimals)) ? token.decimals : 18;
          return { symbol, balance: ethers.formatUnits(bal, decimals) };
        } catch (err) {
          console.warn(`Error fetching balance for ${symbol}:`, err?.shortMessage || err?.message || err);
          return { symbol, balance: "0" };
        }
      });

      const results = await Promise.all(balancePromises);
      
      const tempBalances = {};
      for (const { symbol, balance } of results) {
        tempBalances[symbol] = balance;
      }

      setBalances(tempBalances);
    };

    fetchBalances();
  }, [address, provider, signer, tokensKey]); // Use tokensKey instead of TOKENS object

  return balances;
};

export default useTokenBalances;
