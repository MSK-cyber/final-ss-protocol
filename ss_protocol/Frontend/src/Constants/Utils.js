import { chainCurrencyMap } from "../../WalletConfig";

export function formatCountdown(seconds) {
    if (!seconds || seconds <= 0) return "0h 0m";

    const hours = Math.floor((seconds % (24 * 60 * 60)) / (60 * 60));
    const minutes = Math.floor((seconds % (60 * 60)) / 60);

    return `${hours}h ${minutes}m`;
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
    if (token.tokenName === "DAV" || token.tokenName === "STATE") {
        return "-----";
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