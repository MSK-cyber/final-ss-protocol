/**
 * AMM Calculator Web Worker
 * Runs all expensive AMM calculations in background thread
 * to prevent UI blocking and memory issues
 */

import { ethers } from 'ethers';

// PulseX Router ABI (minimal)
const PULSEX_ROUTER_ABI = [
  'function getAmountsOut(uint amountIn, address[] calldata path) external view returns (uint[] memory amounts)'
];

const PULSEX_ROUTER_ADDRESS = '0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02';
const WPLS_ADDRESS = '0xA1077a294dDE1B09bB078844df40758a5D0f9a27';
const STATE_ADDRESS = '0x233fDa1043d9fbE59Fe89fA0492644430C67C35a';

// RPC endpoint for background calculations
const RPC_URL = 'https://pulsechain-rpc.publicnode.com';

let provider = null;
let routerContract = null;

// Initialize provider and contract
function initProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(RPC_URL);
    routerContract = new ethers.Contract(
      PULSEX_ROUTER_ADDRESS,
      PULSEX_ROUTER_ABI,
      provider
    );
  }
  return { provider, routerContract };
}

// Calculate PLS value for a single token via AMM
async function calculateTokenPlsValue(tokenAddress, balance, decimals = 18) {
  if (!balance || balance === '0' || !tokenAddress) return { numeric: 0, display: '0' };
  
  try {
    const { routerContract } = initProvider();
    
    // Parse balance to wei
    const balanceWei = ethers.parseUnits(String(balance), decimals);
    if (balanceWei === 0n) return { numeric: 0, display: '0' };
    
    // Get quote: TOKEN -> WPLS
    const path = [tokenAddress, WPLS_ADDRESS];
    const amounts = await routerContract.getAmountsOut(balanceWei, path);
    const plsAmount = amounts[amounts.length - 1];
    
    const numericValue = Number(ethers.formatEther(plsAmount));
    const displayValue = numericValue >= 1 
      ? Math.floor(numericValue).toLocaleString()
      : numericValue.toFixed(4);
    
    return { numeric: numericValue, display: displayValue };
  } catch (error) {
    console.debug('AMM calculation error for', tokenAddress, error.message);
    return { numeric: 0, display: 'N/A' };
  }
}

// Calculate STATE -> PLS value
async function calculateStatePlsValue(stateBalance) {
  if (!stateBalance || stateBalance === '0') return { numeric: 0, display: '0' };
  
  try {
    const { routerContract } = initProvider();
    
    const balanceWei = ethers.parseUnits(String(stateBalance), 18);
    if (balanceWei === 0n) return { numeric: 0, display: '0' };
    
    // STATE -> WPLS
    const path = [STATE_ADDRESS, WPLS_ADDRESS];
    const amounts = await routerContract.getAmountsOut(balanceWei, path);
    const plsAmount = amounts[amounts.length - 1];
    
    const numericValue = Number(ethers.formatEther(plsAmount));
    const displayValue = numericValue >= 1 
      ? Math.floor(numericValue).toLocaleString()
      : numericValue.toFixed(4);
    
    return { numeric: numericValue, display: displayValue };
  } catch (error) {
    console.debug('STATE AMM calculation error', error.message);
    return { numeric: 0, display: 'N/A' };
  }
}

// Main calculation function - calculates all tokens at once
async function calculateAllAmmValues(tokens, tokenBalances) {
  const results = {};
  let totalPls = 0;
  
  // Process tokens in parallel batches of 5 to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < tokens.length; i += batchSize) {
    const batch = tokens.slice(i, i + batchSize);
    
    const batchPromises = batch.map(async (token) => {
      const tokenName = token.tokenName;
      const balance = tokenBalances?.[tokenName];
      
      if (tokenName === 'DAV') {
        return { tokenName, numeric: 0, display: '-----' };
      }
      
      if (tokenName === 'STATE') {
        const result = await calculateStatePlsValue(balance);
        return { tokenName, ...result };
      }
      
      if (!balance || !token.TokenAddress) {
        return { tokenName, numeric: 0, display: '0' };
      }
      
      const result = await calculateTokenPlsValue(token.TokenAddress, balance);
      return { tokenName, ...result };
    });
    
    const batchResults = await Promise.all(batchPromises);
    
    for (const result of batchResults) {
      results[result.tokenName] = result.display;
      totalPls += result.numeric;
    }
    
    // Small delay between batches to avoid rate limiting
    if (i + batchSize < tokens.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return {
    values: results,
    totalSum: totalPls >= 1 ? Math.floor(totalPls).toLocaleString() : totalPls.toFixed(4),
    timestamp: Date.now()
  };
}

// Handle messages from main thread
self.onmessage = async function(event) {
  const { type, tokens, tokenBalances, requestId } = event.data;
  
  if (type === 'CALCULATE_AMM') {
    try {
      const result = await calculateAllAmmValues(tokens, tokenBalances);
      self.postMessage({
        type: 'AMM_RESULT',
        result,
        requestId
      });
    } catch (error) {
      self.postMessage({
        type: 'AMM_ERROR',
        error: error.message,
        requestId
      });
    }
  }
};

// Signal worker is ready
self.postMessage({ type: 'WORKER_READY' });
