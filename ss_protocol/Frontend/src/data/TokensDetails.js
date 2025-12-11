import { useState, useEffect, useContext, useMemo, useRef } from "react";
import { getDAVContractAddress, getSTATEContractAddress } from "../Constants/ContractAddresses";
import { useSwapContract } from "../Functions/SwapContractFunctions";
import { useDAvContract } from "../Functions/DavTokenFunctions";
import { useChainId } from "wagmi";
import { ContractContext } from "../Functions/ContractInitialize";
import { ethers } from "ethers";
import { useStatePoolAddress } from "../Functions/useStatePoolAddress";
import { generateIdenticon } from "../utils/identicon";
import { isImageUrl } from "../Constants/Constants";
import { getCachedContract } from "../utils/contractCache";
import { createSmartPoller } from "../utils/smartPolling";

export const shortenAddress = (addr) => (addr ? `${addr.slice(0, 6)}...${addr.slice(-6)}` : "");

export const TokensDetails = () => {
  // Use context directly for reliable immediate data access
  const swap = useSwapContract();
  
  const { Emojies, names } = useDAvContract();
  const chainId = useChainId();
  const { AllContracts } = useContext(ContractContext);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [deployedTokens, setDeployedTokens] = useState([]);
  const [nameMap, setNameMap] = useState({}); // address(lower)-> ERC20 name()
  const { poolAddress: buyBurnStatePool } = useStatePoolAddress();

  const getDavAddress = () => getDAVContractAddress(chainId);
  const getStateAddress = () => getSTATEContractAddress(chainId);

  // On-chain name->emoji mapping - memoized
  const nameToEmoji = useMemo(() => {
    if (!Array.isArray(names) || !Array.isArray(Emojies) || names.length !== Emojies.length) {
      return {};
    }
    return names.reduce((acc, n, i) => { acc[n.toLowerCase()] = Emojies[i] || "🔹"; return acc; }, {});
  }, [names, Emojies]);

  // Static tokens - memoized to maintain stable reference
  const staticTokens = useMemo(() => [
    { name: "DAV", key: "DAV", displayName: "DAV", address: getDavAddress(), price: 0 },
    { name: "STATE", key: "state", displayName: "STATE", address: getStateAddress(), price: 0, pairAddress: buyBurnStatePool },
  ], [chainId, buyBurnStatePool]);

  // Fix the fetchDeployed function to properly fetch tokens after buy & burn
  useEffect(() => {
    const fetchDeployed = async () => {
      if (!AllContracts?.AuctionContract) return;
      try {
        const count = Number(await AllContracts.AuctionContract.tokenCount?.().catch(() => 0));
        if (count === 0) {
          setDeployedTokens([]);
          return;
        }
        
        // Batch fetch all token addresses first
        const addressPromises = [];
        for (let i = 0; i < count; i++) {
          addressPromises.push(
            AllContracts.AuctionContract.autoRegisteredTokens(i).catch(() => null)
          );
        }
        const addresses = await Promise.all(addressPromises);
        
        // Filter valid addresses and batch fetch details
        const validAddresses = addresses.filter(addr => addr && addr !== ethers.ZeroAddress);
        
        const detailPromises = validAddresses.map(async (tokenAddress) => {
          try {
            const tokenContract = getCachedContract(tokenAddress, 'ERC20_META', AllContracts.AuctionContract.runner || AllContracts.AuctionContract.provider);
            
            const [tokenName, tokenSymbol, pairAddress] = await Promise.all([
              tokenContract.name().catch(() => 'Unknown'),
              tokenContract.symbol().catch(() => 'TKN'),
              AllContracts.AuctionContract.getPairAddress(tokenAddress).catch(() => ethers.ZeroAddress)
            ]);
            
            return {
              address: tokenAddress,
              name: tokenName,
              symbol: tokenSymbol,
              pairAddress: pairAddress || ethers.ZeroAddress,
              hasPair: pairAddress && pairAddress !== ethers.ZeroAddress
            };
          } catch (err) {
            console.warn(`Error fetching token details for ${tokenAddress}:`, err);
            return null;
          }
        });
        
        const results = await Promise.all(detailPromises);
        const list = results.filter(Boolean);
        
        setDeployedTokens(list);
        console.log(`✅ Fetched ${list.length} deployed tokens from contract`);
      } catch (err) {
        console.error("Error fetching deployed tokens:", err);
      }
    };

    fetchDeployed();
    
    // Smart polling for deployed tokens: 30s active, 120s idle
    const poller = createSmartPoller(fetchDeployed, {
      activeInterval: 30000,   // 30s when user is active
      idleInterval: 120000,    // 2 minutes when idle (tokens don't change often)
      fetchOnStart: false,     // Already fetched above
      fetchOnVisible: true,    // Refresh when tab becomes visible
      name: 'deployed-tokens'
    });
    
    poller.start();
    return () => poller.stop();
  }, [AllContracts?.AuctionContract]);

  // Dynamic tokens from swap - memoized to prevent recreation on every render
  const dynamicTokens = useMemo(() => {
    return Array.from(swap.TokenNames || [])
      .filter((n) => n !== 'DAV' && n !== 'STATE')
      .map((name) => {
        const address = swap.tokenMap?.[name] || ethers.ZeroAddress;
        const mapped = nameToEmoji[name.toLowerCase()];
        const emoji = isImageUrl(mapped) ? mapped : generateIdenticon(address);
        return { name, key: name, address, price: 0, emoji };
      });
  }, [swap.TokenNames, swap.tokenMap, nameToEmoji]);

  // Stable reference to dynamic token addresses for dependency tracking
  const dynamicTokenAddrsRef = useRef('');
  const currentDynamicAddrs = dynamicTokens.map(t => (t.address || '').toLowerCase()).filter(a => a && a !== ethers.ZeroAddress.toLowerCase()).sort().join(',');
  
  // Only update ref if addresses actually changed
  if (dynamicTokenAddrsRef.current !== currentDynamicAddrs) {
    dynamicTokenAddrsRef.current = currentDynamicAddrs;
  }

  // Fetch and cache ERC20 names for dynamic tokens
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const provider = AllContracts?.AuctionContract?.runner || AllContracts?.provider;
        if (!provider) return;
        const addrs = dynamicTokenAddrsRef.current.split(',').filter(Boolean);
        for (const addr of addrs) {
          if (nameMap[addr]) continue;
          try {
            const erc20 = getCachedContract(addr, 'ERC20_NAME', provider);
            const nm = await erc20.name();
            if (!cancelled && nm) setNameMap(prev => ({ ...prev, [addr]: nm }));
          } catch {}
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, [AllContracts?.AuctionContract, currentDynamicAddrs]);

  // Combine and dedupe (prefer earlier entries) - memoized to prevent recreation on every render
  // Place deployedTokens BEFORE dynamicTokens so deployed entries take precedence
  const data = useMemo(() => {
    const combined = [...staticTokens, ...deployedTokens, ...dynamicTokens];
    const seen = new Set();
    return combined.filter(t => {
      const addr = (t.address || '').toLowerCase();
      const sym = (t.name || t.key || '').toLowerCase();
      const k = addr ? `addr:${addr}` : `sym:${sym}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [staticTokens, deployedTokens, dynamicTokens]);

  let tokens = data.map((token) => {
    const key = token.key;
    const emoji = token.emoji || '🔹';

    // Check if this is a deployed token from autoRegisteredTokens
    const isFromDeployedList = token.hasPair !== undefined; // deployed tokens have this property

    if (token.isDeployed || isFromDeployedList) {
      // SWAP vault balance by symbol/fullName fallback
      const balanceBySymbol = swap.TokenBalance?.[token.name];
      const balanceByFullName = swap.TokenBalance?.[token.fullName];
      const vaultBalance = balanceBySymbol || balanceByFullName || token.davVaultBalance || 0;

      // Burned LP — look up by name (symbol) or address
      const burnedByName = swap.burnedLPAmount?.[token.name]?.balance;
      const burnedByAddr = swap.burnedLPAmount?.[(token.address || '').toLowerCase()]?.balance;
      const burnedLpNum = Math.floor(Number(burnedByName ?? burnedByAddr ?? 0)) || 0;

      // Robust cycle handling: treat 0 as valid, support 'not started'/'not listed'
      const rawCycleDeployed = swap.CurrentCycleCount?.[token.name];
      // Contract returns per-token cycle count as appearances (0 before first, 1..20 thereafter). No +1 in UI.
      const cycleDeployed = (rawCycleDeployed === 'not started' || rawCycleDeployed === 'not listed')
        ? 'Not Started'
        : (Number.isFinite(Number(rawCycleDeployed)) ? Number(rawCycleDeployed) : 0);

      // Robust renounced lookup: try name, symbol, fullName, and address
      const renouncedByName = swap.isTokenRenounce?.[token.name];
      const renouncedBySymbol = swap.isTokenRenounce?.[token.symbol];
      const renouncedByFullName = swap.isTokenRenounce?.[token.fullName];
      const renouncedByAddr = swap.isTokenRenounce?.[(token.address || '').toLowerCase()];
      const isRenouncedValue = renouncedByName ?? renouncedBySymbol ?? renouncedByFullName ?? renouncedByAddr ?? false;

      return {
        tokenName: token.name, // symbol or ERC20 name()
        key: shortenAddress(token.address),
        name: token.displayName || token.name,
        displayName: token.fullName || token.name,
        Price: token.price || 0,
        ratio: swap.TokenRatio?.[token.name] || '0',
        emoji,
        isRenounced: isRenouncedValue,
        DavVault: vaultBalance,
        BurnedLp: burnedLpNum,
        burned: swap.burnedAmount?.[token.name] || '0',
        isDeployed: true,
        isSupported: true,
        TokenAddress: token.address,
        PairAddress: token.pairAddress || '0x0000000000000000000000000000000000000000',
        Cycle: cycleDeployed,
      };
    }

    // Non-deployed
    const burnedByKey = swap.burnedLPAmount?.[token.name]?.balance ?? swap.burnedLPAmount?.[key]?.balance;
    const burnedByAddr = swap.burnedLPAmount?.[(token.address || '').toLowerCase()]?.balance;
    const burnedLpNum = Math.floor(Number(burnedByKey ?? burnedByAddr ?? 0)) || 0;

    // Robust cycle handling for non-deployed tokens as well
    const rawCycle = swap.CurrentCycleCount?.[key];
    // Align with contract: cycle is 0 before first appearance, increments by 1 each time up to 20
    const cycle = (rawCycle === 'not started' || rawCycle === 'not listed')
      ? 'Not Started'
      : (Number.isFinite(Number(rawCycle)) ? Number(rawCycle) : 0);

    // Robust vault balance lookup: try key, name, and address
    const vaultByKey = swap.TokenBalance?.[key];
    const vaultByName = swap.TokenBalance?.[token.name];
    const vaultByAddr = swap.TokenBalance?.[(token.address || '').toLowerCase()];
    const vaultBalance = vaultByKey ?? vaultByName ?? vaultByAddr ?? 0;

    // Robust renounced lookup: try key, name, and address
    const renouncedByKey = swap.isTokenRenounce?.[key];
    const renouncedByName = swap.isTokenRenounce?.[token.name];
    const renouncedByAddr = swap.isTokenRenounce?.[(token.address || '').toLowerCase()];
    const isRenouncedValue = renouncedByKey ?? renouncedByName ?? renouncedByAddr ?? false;

    return {
      tokenName: token.name,
      key: shortenAddress(token.address),
      name: token.displayName || token.name,
      displayName: nameMap[(token.address || '').toLowerCase()] || token.displayName || token.name,
      Price: token.price,
      ratio: swap.TokenRatio?.[key] ?? swap.TokenRatio?.[token.name],
      emoji,
      isRenounced: isRenouncedValue,
      DavVault: vaultBalance,
      BurnedLp: burnedLpNum,
      burned: swap.burnedAmount?.[key] ?? swap.burnedAmount?.[token.name],
      isSupported: token.name === 'DAV' ? 'true' : (token.name === 'STATE' ? 'true' : swap.supportedToken?.[key]),
      TokenAddress: token.address,
      PairAddress: swap.TokenPariAddress?.[key] || '0x0000000000000000000000000000000000000000',
      Cycle: cycle,
    };
  });

  // Final dedupe by address or token name
  const finalSeen = new Set();
  tokens = tokens.filter(t => {
    const addr = (t.TokenAddress || '').toLowerCase();
    const nameKey = (t.tokenName || t.name || '').toLowerCase();
    const k = addr || nameKey;
    if (finalSeen.has(k)) return false;
    finalSeen.add(k);
    return true;
  });

  const refetch = () => {
    setLoading(true);
    setRefreshKey((p) => p + 1);
  };

  useEffect(() => {
    // If we have deployed tokens, show them immediately even if other data is loading
    if (deployedTokens.length > 0) {
      setLoading(false);
      return;
    }
    
    const hasAny = Array.isArray(tokens) && tokens.length > 0;
    if (hasAny) { setLoading(false); return; }
    if ((swap.TokenNames || []).length === 0) { setLoading(false); return; }
    const ready = swap.TokenNames?.length > 0 && swap.tokenMap && Object.keys(swap.tokenMap).length > 0 &&
      Emojies?.length > 0 && names?.length > 0 && swap.isTokenRenounce && swap.TokenBalance && swap.burnedAmount && swap.supportedToken && swap.CurrentCycleCount;
    setLoading(!ready);
  }, [
    tokens.length,
    deployedTokens.length,
    swap.TokenNames,
    swap.tokenMap,
    Emojies,
    names,
    swap.isTokenRenounce,
    swap.TokenBalance,
    swap.burnedAmount,
    swap.supportedToken,
    swap.CurrentCycleCount,
    dynamicTokens.length,
    refreshKey,
  ]);

  return { tokens, loading, refetch };
};