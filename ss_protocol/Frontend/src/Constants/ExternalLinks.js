import { CHAIN_IDS } from "./ContractAddresses";

const GECKO_NETWORK_SLUG = {
  [CHAIN_IDS.PULSECHAIN]: 'pulsechain',
};

export function geckoPoolUrl(chainId, poolAddress) {
  const slug = GECKO_NETWORK_SLUG[chainId];
  if (!slug || !poolAddress) return null;
  return `https://www.geckoterminal.com/${slug}/pools/${poolAddress}`;
}

export function geckoTokenApiUrl(chainId, tokenAddress) {
  const slug = GECKO_NETWORK_SLUG[chainId];
  if (!slug || !tokenAddress) return null;
  return `https://api.geckoterminal.com/api/v2/networks/${slug}/tokens/${tokenAddress}`;
}

export function geckoPoolsForTokenApiUrl(chainId, tokenAddress, page = 1) {
  const slug = GECKO_NETWORK_SLUG[chainId];
  if (!slug || !tokenAddress) return null;
  return `https://api.geckoterminal.com/api/v2/networks/${slug}/tokens/${tokenAddress}/pools?page=${page}`;
}
