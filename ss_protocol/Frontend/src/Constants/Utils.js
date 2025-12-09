import { chainCurrencyMap } from "../../WalletConfig";

// Cache for AMM value calculations - prevents redundant RPC calls
// Unified cache for both numeric and display values to avoid duplicate RPC calls
const ammUnifiedCache = new Map();
const AMM_CACHE_TTL_MS = 30000; // 30 seconds cache TTL

// Legacy caches for backwards compatibility
const ammValueCache = new Map();
const ammNumericCache = new Map();

/**
 * Calculate both numeric and display AMM values in a single call
 * This is 2x faster than calling calculateAmmPlsValue + calculateAmmPlsValueNumeric separately
 */
export async function calculateAmmPlsValueBoth(token, tokenBalances, routerContract, TOKENS, chainId) {
    const currencySymbol = chainCurrencyMap[chainId] || 'PLS';
    
    if (token.tokenName === "DAV") {
        return { numeric: 0, display: "-----" };
    }

    const userBalance = tokenBalances?.[token.tokenName];
    if (!userBalance || parseFloat(userBalance) <= 0) {
        return { numeric: 0, display: `0 ${currencySymbol}` };
    }

    if (!routerContract) {
        return { numeric: 0, display: "Loading..." };
    }

    // Create cache key
    const balanceKey = Math.floor(parseFloat(userBalance) * 1000);
    const cacheKey = `unified_${token.tokenName}_${balanceKey}_${chainId}`;
    
    // Check cache
    const cached = ammUnifiedCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < AMM_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        // Determine wrapped native token based on chain
        let wrappedNativeKey = "Wrapped Pulse";
        if (chainId === 146) wrappedNativeKey = "Wrapped Sonic";
        else if (chainId === 137) wrappedNativeKey = "Wrapped Matic";
        else if (chainId === 1) wrappedNativeKey = "Wrapped Ether";

        const stateAddress = TOKENS["STATE"]?.address;
        const wplsAddress = TOKENS[wrappedNativeKey]?.address;

        // For STATE, swap directly to wrapped native
        if (token.tokenName === "STATE") {
            if (!stateAddress || !wplsAddress) {
                return { numeric: 0, display: "Loading..." };
            }

            const amountIn = parseFloat(userBalance);
            const amountInWei = BigInt(Math.floor(amountIn * 10**18));
            const path = [stateAddress, wplsAddress];
            
            const amounts = await routerContract.getAmountsOut(amountInWei, path);
            const plsValue = Number(amounts[amounts.length - 1]) / 10**18;
            
            const result = { 
                numeric: plsValue, 
                display: `${formatWithCommas(plsValue.toFixed(0))} ${currencySymbol}` 
            };
            ammUnifiedCache.set(cacheKey, { value: result, timestamp: Date.now() });
            return result;
        }

        // For auction tokens, swap to STATE first, then STATE to wrapped native
        const tokenAddress = TOKENS[token.tokenName]?.address;
        
        if (!tokenAddress || !stateAddress || !wplsAddress) {
            return { numeric: 0, display: "Loading..." };
        }

        const amountIn = parseFloat(userBalance);
        const decimals = TOKENS[token.tokenName]?.decimals || 18;
        const amountInWei = BigInt(Math.floor(amountIn * 10**decimals));
        
        // Step 1: Token -> STATE
        const path1 = [tokenAddress, stateAddress];
        const amounts1 = await routerContract.getAmountsOut(amountInWei, path1);
        const stateAmountWei = amounts1[amounts1.length - 1];
        
        // Step 2: STATE -> wrapped native
        const path2 = [stateAddress, wplsAddress];
        const amounts2 = await routerContract.getAmountsOut(stateAmountWei, path2);
        const plsValue = Number(amounts2[amounts2.length - 1]) / 10**18;
        
        const result = { 
            numeric: plsValue, 
            display: `${formatWithCommas(plsValue.toFixed(0))} ${currencySymbol}` 
        };
        ammUnifiedCache.set(cacheKey, { value: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error(`Error calculating AMM value for ${token.tokenName}:`, error);
        return { numeric: 0, display: "N/A" };
    }
}

export function formatCountdown(seconds) {
    const s = Number(seconds) || 0;
    if (s <= 0) return "0h 0m 0s";

    const days = Math.floor(s / 86400);
    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);

    if (days > 0) {
        return `${days}d ${hours}h ${minutes}m ${secs}s`;
    }
    return `${hours}h ${minutes}m ${secs}s`;
}

export function formatTimeVerbose(seconds) {
    if (typeof seconds !== "number" || isNaN(seconds) || seconds <= 0)
        return "0";

    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    // const secs = Math.floor(seconds % 60); // in case it's float

    return `${days}d ${hrs}h ${mins}m`;
}

export const formatTimestamp = (timestamp) => {
    try {
        const ts =
            typeof timestamp === "object" && "toNumber" in timestamp
                ? timestamp.toNumber()
                : Number(timestamp);
        const date = new Date(ts * 1000);
        return date.toLocaleString();
    } catch (error) {
        console.error("Error formatting timestamp:", error);
        return "Invalid Date";
    }
};

export const formatWithCommas = (value) => {
    if (value === null || value === undefined) return "";
    const valueString = value.toString();
    const [integerPart, decimalPart] = valueString.split(".");
    const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return decimalPart ? `${formattedInteger}.${decimalPart}` : formattedInteger;
};
export const truncateDecimals = (number, digits) => {
    const [intPart, decPart = ""] = number.toString().split(".");
    return decPart.length > digits
        ? `${intPart}.${decPart.slice(0, digits)}`
        : number.toString();
};

export function formatNumber(number) {
    if (!number) return "0";
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(number);
}

export const validateInputAmount = (rawValue) => {
    return /^\d*\.?\d{0,18}$/.test(rawValue);
};
// Helper functions (exported for use in other files)
export function calculatePlsValue(token, tokenBalances, pstateToPlsRatio, chainId) {
    // DAV has no PLS valuation; STATE should display user's STATE holdings converted to PLS
    if (token.tokenName === "DAV") {
        return "-----";
    }
    if (token.tokenName === "STATE") {
        const userBalance = tokenBalances["STATE"];
        const ratio = parseFloat(pstateToPlsRatio || 0);
        if (userBalance === undefined || ratio <= 0) {
            return "Loading...";
        }
        const plsValue = parseFloat(userBalance) * ratio;
        return `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
    }

    const userBalance = tokenBalances[token.tokenName];
    const tokenRatio = token.ratio;
    const ratio = parseFloat(pstateToPlsRatio || 0);

    if (userBalance === undefined || !tokenRatio || ratio <= 0) {
        return "Loading...";
    }

    const pstateValue = parseFloat(userBalance) * parseFloat(tokenRatio);
    const plsValue = pstateValue * ratio;

    return `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
}

export function calculatePlsValueNumeric(token, tokenBalances, pstateToPlsRatio) {
    // Keep STATE numeric contribution as 0 here to avoid double counting,
    // totals add STATE→PLS separately in the components.
    if (token.tokenName === "DAV" || token.tokenName === "STATE") {
        return 0;
    }

    const userBalance = tokenBalances[token.tokenName];
    const tokenRatio = token.ratio;
    const ratio = parseFloat(pstateToPlsRatio || 0);

    if (!tokenRatio || tokenRatio === "not started" || tokenRatio === "not listed") {
        return 0;
    }
    if (userBalance === undefined || !tokenRatio || ratio <= 0) {
        return 0;
    }

    const pstateValue = parseFloat(userBalance) * parseFloat(tokenRatio);
    const plsValue = pstateValue * ratio;

    return plsValue;
}

// AMM-based calculation functions using actual DEX prices
// Uses caching to prevent redundant RPC calls
export async function calculateAmmPlsValue(token, tokenBalances, routerContract, TOKENS, chainId) {
    if (token.tokenName === "DAV") {
        return "-----";
    }

    const userBalance = tokenBalances?.[token.tokenName];
    if (!userBalance || parseFloat(userBalance) <= 0) {
        return `0 ${chainCurrencyMap[chainId] || 'PLS'}`;
    }

    if (!routerContract) {
        return "Loading...";
    }

    // Create cache key based on token name and balance (rounded to avoid minor fluctuations)
    const balanceKey = Math.floor(parseFloat(userBalance) * 1000); // Round to 3 decimals
    const cacheKey = `${token.tokenName}_${balanceKey}_${chainId}`;
    
    // Check cache
    const cached = ammValueCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < AMM_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        // Determine wrapped native token based on chain
        let wrappedNativeKey = "Wrapped Pulse"; // Default for PulseChain
        if (chainId === 146) wrappedNativeKey = "Wrapped Sonic";
        else if (chainId === 137) wrappedNativeKey = "Wrapped Matic";
        else if (chainId === 1) wrappedNativeKey = "Wrapped Ether";

        // For STATE, swap directly to wrapped native
        if (token.tokenName === "STATE") {
            const stateAddress = TOKENS["STATE"]?.address;
            const wplsAddress = TOKENS[wrappedNativeKey]?.address;
            
            if (!stateAddress || !wplsAddress) {
                return "Loading...";
            }

            const amountIn = parseFloat(userBalance);
            const amountInWei = BigInt(Math.floor(amountIn * 10**18));
            const path = [stateAddress, wplsAddress];
            
            const amounts = await routerContract.getAmountsOut(amountInWei, path);
            const amountOutWei = amounts[amounts.length - 1];
            const plsValue = Number(amountOutWei) / 10**18;
            
            const result = `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
            ammValueCache.set(cacheKey, { value: result, timestamp: Date.now() });
            return result;
        }

        // For auction tokens, swap to STATE first, then STATE to wrapped native
        const tokenAddress = TOKENS[token.tokenName]?.address;
        const stateAddress = TOKENS["STATE"]?.address;
        const wplsAddress = TOKENS[wrappedNativeKey]?.address;
        
        if (!tokenAddress || !stateAddress || !wplsAddress) {
            return "Loading...";
        }

        const amountIn = parseFloat(userBalance);
        const decimals = TOKENS[token.tokenName]?.decimals || 18;
        const amountInWei = BigInt(Math.floor(amountIn * 10**decimals));
        
        // Step 1: Token -> STATE
        const path1 = [tokenAddress, stateAddress];
        const amounts1 = await routerContract.getAmountsOut(amountInWei, path1);
        const stateAmountWei = amounts1[amounts1.length - 1];
        
        // Step 2: STATE -> wrapped native
        const path2 = [stateAddress, wplsAddress];
        const amounts2 = await routerContract.getAmountsOut(stateAmountWei, path2);
        const plsAmountWei = amounts2[amounts2.length - 1];
        const plsValue = Number(plsAmountWei) / 10**18;
        
        const result = `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
        ammValueCache.set(cacheKey, { value: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error(`Error calculating AMM value for ${token.tokenName}:`, error);
        return "N/A";
    }
}

// Uses caching to prevent redundant RPC calls
export async function calculateAmmPlsValueNumeric(token, tokenBalances, routerContract, TOKENS, chainId) {
    if (token.tokenName === "DAV" || token.tokenName === "STATE") {
        return 0;
    }

    const userBalance = tokenBalances?.[token.tokenName];
    if (!userBalance || parseFloat(userBalance) <= 0) {
        return 0;
    }

    if (!routerContract) {
        return 0;
    }

    // Create cache key based on token name and balance
    const balanceKey = Math.floor(parseFloat(userBalance) * 1000);
    const cacheKey = `numeric_${token.tokenName}_${balanceKey}_${chainId}`;
    
    // Check cache
    const cached = ammNumericCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < AMM_CACHE_TTL_MS) {
        return cached.value;
    }

    try {
        // Determine wrapped native token based on chain
        let wrappedNativeKey = "Wrapped Pulse";
        if (chainId === 146) wrappedNativeKey = "Wrapped Sonic";
        else if (chainId === 137) wrappedNativeKey = "Wrapped Matic";
        else if (chainId === 1) wrappedNativeKey = "Wrapped Ether";

        const tokenAddress = TOKENS[token.tokenName]?.address;
        const stateAddress = TOKENS["STATE"]?.address;
        const wplsAddress = TOKENS[wrappedNativeKey]?.address;
        
        if (!tokenAddress || !stateAddress || !wplsAddress) {
            return 0;
        }

        const amountIn = parseFloat(userBalance);
        const decimals = TOKENS[token.tokenName]?.decimals || 18;
        const amountInWei = BigInt(Math.floor(amountIn * 10**decimals));
        
        // Step 1: Token -> STATE
        const path1 = [tokenAddress, stateAddress];
        const amounts1 = await routerContract.getAmountsOut(amountInWei, path1);
        const stateAmountWei = amounts1[amounts1.length - 1];
        
        // Step 2: STATE -> wrapped native
        const path2 = [stateAddress, wplsAddress];
        const amounts2 = await routerContract.getAmountsOut(stateAmountWei, path2);
        const plsAmountWei = amounts2[amounts2.length - 1];
        
        const result = Number(plsAmountWei) / 10**18;
        ammNumericCache.set(cacheKey, { value: result, timestamp: Date.now() });
        return result;
    } catch (error) {
        console.error(`Error calculating AMM numeric value for ${token.tokenName}:`, error);
        return 0;
    }
}

// Cache for STATE AMM value
const stateAmmCache = { value: 0, timestamp: 0, balanceKey: '' };

export async function calculateStateAmmPlsValueNumeric(stateBalance, routerContract, TOKENS, chainId) {
    if (!stateBalance || parseFloat(stateBalance) <= 0) {
        return 0;
    }

    if (!routerContract) {
        return 0;
    }

    // Create cache key based on balance
    const balanceKey = Math.floor(parseFloat(stateBalance) * 1000);
    const cacheKey = `state_${balanceKey}_${chainId}`;
    
    // Check cache
    if (stateAmmCache.balanceKey === cacheKey && Date.now() - stateAmmCache.timestamp < AMM_CACHE_TTL_MS) {
        return stateAmmCache.value;
    }

    try {
        // Determine wrapped native token based on chain
        let wrappedNativeKey = "Wrapped Pulse";
        if (chainId === 146) wrappedNativeKey = "Wrapped Sonic";
        else if (chainId === 137) wrappedNativeKey = "Wrapped Matic";
        else if (chainId === 1) wrappedNativeKey = "Wrapped Ether";

        const stateAddress = TOKENS["STATE"]?.address;
        const wplsAddress = TOKENS[wrappedNativeKey]?.address;
        
        if (!stateAddress || !wplsAddress) {
            return 0;
        }

        const amountIn = parseFloat(stateBalance);
        const amountInWei = BigInt(Math.floor(amountIn * 10**18));
        const path = [stateAddress, wplsAddress];
        
        const amounts = await routerContract.getAmountsOut(amountInWei, path);
        const amountOutWei = amounts[amounts.length - 1];
        
        const result = Number(amountOutWei) / 10**18;
        stateAmmCache.value = result;
        stateAmmCache.timestamp = Date.now();
        stateAmmCache.balanceKey = cacheKey;
        return result;
    } catch (error) {
        console.error('Error calculating STATE AMM value:', error);
        return 0;
    }
}