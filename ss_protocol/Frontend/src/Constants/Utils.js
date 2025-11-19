import { chainCurrencyMap } from "../../WalletConfig";

export function formatCountdown(seconds) {
    const s = Number(seconds) || 0;
    if (s <= 0) return "0h 0m 0s";

    const hours = Math.floor((s % 86400) / 3600);
    const minutes = Math.floor((s % 3600) / 60);
    const secs = Math.floor(s % 60);

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
            
            return `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
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
        
        return `${formatWithCommas(plsValue.toFixed(0))} ${chainCurrencyMap[chainId] || 'PLS'}`;
    } catch (error) {
        console.error(`Error calculating AMM value for ${token.tokenName}:`, error);
        return "N/A";
    }
}

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
        
        return Number(plsAmountWei) / 10**18;
    } catch (error) {
        console.error(`Error calculating AMM numeric value for ${token.tokenName}:`, error);
        return 0;
    }
}

export async function calculateStateAmmPlsValueNumeric(stateBalance, routerContract, TOKENS, chainId) {
    if (!stateBalance || parseFloat(stateBalance) <= 0) {
        return 0;
    }

    if (!routerContract) {
        return 0;
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
        
        return Number(amountOutWei) / 10**18;
    } catch (error) {
        console.error('Error calculating STATE AMM value:', error);
        return 0;
    }
}