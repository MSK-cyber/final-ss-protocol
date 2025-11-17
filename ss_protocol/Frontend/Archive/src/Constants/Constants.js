import toast from "react-hot-toast";
import { getAddress } from "./RuntimeConfig";

export const PULSEX_ROUTER_ADDRESS = getAddress('dex.router', '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02');
export const WPLS_ADDRESS = getAddress('dex.baseToken', '0xA1077a294dDE1B09bB078844df40758a5D0f9a27');

export const PULSEX_ROUTER_ABI = [
    'function factory() external view returns (address)',
    'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)',
    'function swapExactTokensForTokens(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactETHForTokens(uint amountOutMin, address[] calldata path, address to, uint deadline) external payable returns (uint[] memory amounts)',
    'function swapExactTokensForETH(uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
    'function swapExactTokensForTokensSupportingFeeOnTransferTokens (uint amountIn, uint amountOutMin, address[] calldata path, address to, uint deadline) external returns (uint[] memory amounts)',
];

export const PULSEX_FACTORY_ABI = [
    'function getPair(address tokenA, address tokenB) external view returns (address pair)',
];

export const ERC20_ABI = [
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
];
export const notifyError = (message) => {
    toast.error(message, {
        position: "top-center",
        autoClose: 5000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
    });
};
export const notifySuccess = (message) => {
    toast.success(message, {
        position: "top-center",
        autoClose: 12000,
        hideProgressBar: false,
        closeOnClick: true,
        pauseOnHover: true,
        draggable: true,
        progress: undefined,
    });
};

export const AddingTokenSteps = [
    { key: "initiated", label: "Initializing" },
    { key: "Adding", label: "Add Token" },
    { key: "Status Updating", label: "Status Updating" },
];

export const isImageUrl = (str) => {
    return typeof str === "string" && (str.includes("mypinata.cloud/ipfs/") || str.startsWith("data:image/"));
};
