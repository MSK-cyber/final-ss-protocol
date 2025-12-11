/**
 * Multicall Utility
 * 
 * Batches multiple contract calls into a single RPC request.
 * This dramatically reduces network overhead and improves performance.
 * 
 * Uses the standard Multicall3 contract deployed on PulseChain.
 */

import { ethers } from 'ethers';
import { getCachedProvider } from './contractCache';

// Multicall3 contract address (same on most EVM chains including PulseChain)
const MULTICALL3_ADDRESS = '0xcA11bde05977b3631167028862bE2a173976CA11';

// Minimal ABI for Multicall3
const MULTICALL3_ABI = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) external payable returns (tuple(bool success, bytes returnData)[])',
  'function aggregate(tuple(address target, bytes callData)[] calls) external payable returns (uint256 blockNumber, bytes[] returnData)',
];

// RPC URL for PulseChain
const RPC_URL = 'https://pulsechain-rpc.publicnode.com';

/**
 * Create a call object for multicall
 * @param {string} target - Contract address
 * @param {ethers.Interface} iface - Contract interface
 * @param {string} method - Method name
 * @param {Array} args - Method arguments
 * @returns {Object} Call object
 */
export function createCall(target, iface, method, args = []) {
  return {
    target,
    allowFailure: true,
    callData: iface.encodeFunctionData(method, args),
    iface,
    method,
  };
}

/**
 * Execute multiple contract calls in a single RPC request
 * 
 * @param {Array} calls - Array of call objects from createCall()
 * @param {ethers.Provider} provider - Optional provider (uses cached RPC if not provided)
 * @returns {Promise<Array>} Array of decoded results (null for failed calls)
 * 
 * @example
 * const iface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
 * const calls = [
 *   createCall(token1, iface, 'balanceOf', [userAddress]),
 *   createCall(token2, iface, 'balanceOf', [userAddress]),
 * ];
 * const [balance1, balance2] = await multicall(calls);
 */
export async function multicall(calls, provider) {
  if (!calls || calls.length === 0) return [];
  
  // Use single call for single item (no multicall overhead needed)
  if (calls.length === 1) {
    try {
      const call = calls[0];
      const prov = provider || getCachedProvider(RPC_URL);
      const result = await prov.call({
        to: call.target,
        data: call.callData,
      });
      const decoded = call.iface.decodeFunctionResult(call.method, result);
      return [decoded.length === 1 ? decoded[0] : decoded];
    } catch {
      return [null];
    }
  }
  
  const prov = provider || getCachedProvider(RPC_URL);
  const multicallContract = new ethers.Contract(MULTICALL3_ADDRESS, MULTICALL3_ABI, prov);
  
  try {
    const callData = calls.map(c => ({
      target: c.target,
      allowFailure: c.allowFailure !== false,
      callData: c.callData,
    }));
    
    const results = await multicallContract.aggregate3(callData);
    
    return results.map((result, i) => {
      if (!result.success) return null;
      try {
        const decoded = calls[i].iface.decodeFunctionResult(calls[i].method, result.returnData);
        // Return single value directly, array for multiple returns
        return decoded.length === 1 ? decoded[0] : decoded;
      } catch {
        return null;
      }
    });
  } catch (error) {
    console.error('Multicall failed:', error);
    // Fallback to individual calls on multicall failure
    return fallbackIndividualCalls(calls, prov);
  }
}

/**
 * Fallback to individual calls if multicall fails
 */
async function fallbackIndividualCalls(calls, provider) {
  const results = await Promise.allSettled(
    calls.map(async (call) => {
      try {
        const result = await provider.call({
          to: call.target,
          data: call.callData,
        });
        const decoded = call.iface.decodeFunctionResult(call.method, result);
        return decoded.length === 1 ? decoded[0] : decoded;
      } catch {
        return null;
      }
    })
  );
  
  return results.map(r => r.status === 'fulfilled' ? r.value : null);
}

/**
 * Batch fetch token balances for multiple tokens
 * 
 * @param {Array<string>} tokenAddresses - Array of token addresses
 * @param {string} userAddress - User address to check balances for
 * @param {ethers.Provider} provider - Optional provider
 * @returns {Promise<Object>} Map of token address -> balance (BigInt)
 */
export async function batchGetBalances(tokenAddresses, userAddress, provider) {
  if (!tokenAddresses?.length || !userAddress) return {};
  
  const iface = new ethers.Interface(['function balanceOf(address) view returns (uint256)']);
  
  const calls = tokenAddresses.map(addr => createCall(
    addr,
    iface,
    'balanceOf',
    [userAddress]
  ));
  
  const results = await multicall(calls, provider);
  
  const balances = {};
  tokenAddresses.forEach((addr, i) => {
    balances[addr.toLowerCase()] = results[i] || 0n;
  });
  
  return balances;
}

/**
 * Batch fetch token metadata (name, symbol, decimals)
 * 
 * @param {Array<string>} tokenAddresses - Array of token addresses
 * @param {ethers.Provider} provider - Optional provider
 * @returns {Promise<Object>} Map of token address -> { name, symbol, decimals }
 */
export async function batchGetTokenInfo(tokenAddresses, provider) {
  if (!tokenAddresses?.length) return {};
  
  const iface = new ethers.Interface([
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
  ]);
  
  const calls = [];
  tokenAddresses.forEach(addr => {
    calls.push(createCall(addr, iface, 'name', []));
    calls.push(createCall(addr, iface, 'symbol', []));
    calls.push(createCall(addr, iface, 'decimals', []));
  });
  
  const results = await multicall(calls, provider);
  
  const tokenInfo = {};
  tokenAddresses.forEach((addr, i) => {
    const baseIdx = i * 3;
    tokenInfo[addr.toLowerCase()] = {
      name: results[baseIdx] || 'Unknown',
      symbol: results[baseIdx + 1] || '???',
      decimals: Number(results[baseIdx + 2] || 18),
    };
  });
  
  return tokenInfo;
}

/**
 * Batch fetch pair reserves for multiple LP pairs
 * 
 * @param {Array<string>} pairAddresses - Array of pair addresses
 * @param {ethers.Provider} provider - Optional provider
 * @returns {Promise<Object>} Map of pair address -> { reserve0, reserve1, token0, token1 }
 */
export async function batchGetPairReserves(pairAddresses, provider) {
  if (!pairAddresses?.length) return {};
  
  const iface = new ethers.Interface([
    'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
    'function token0() view returns (address)',
    'function token1() view returns (address)',
  ]);
  
  const calls = [];
  pairAddresses.forEach(addr => {
    calls.push(createCall(addr, iface, 'getReserves', []));
    calls.push(createCall(addr, iface, 'token0', []));
    calls.push(createCall(addr, iface, 'token1', []));
  });
  
  const results = await multicall(calls, provider);
  
  const pairInfo = {};
  pairAddresses.forEach((addr, i) => {
    const baseIdx = i * 3;
    const reserves = results[baseIdx];
    pairInfo[addr.toLowerCase()] = {
      reserve0: reserves?.[0] || 0n,
      reserve1: reserves?.[1] || 0n,
      token0: results[baseIdx + 1] || null,
      token1: results[baseIdx + 2] || null,
    };
  });
  
  return pairInfo;
}

export default multicall;
