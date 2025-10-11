# Admin Console Wiring Notes

This document lists the contract methods/ABIs and addresses the Admin UI expects, plus setup steps and safety notes.

## Contracts and addresses

Configure addresses per chain in `src/Constants/ContractAddresses.js`:

- AUCTION (SWAP) — required (already set)
- LP_HELPER — optional (for Tokens tab)
- BUY_BURN_CONTROLLER — optional (for Buy & Burn tab)
- AUCTION_METRICS — optional (for Metrics tab)

These surface in `getContractConfigs()` so the UI can instantiate contract instances when addresses are present.

## ABI coverage required by pages

Some Admin pages call functions that must exist in the Auction ABI (currently `src/ABI/RatioABI.json`). Ensure these are present in your deployed ABI:

Auction (SWAP)

- Reads: `getTodayStatus()`, `getTodaySwapCounts()`, `getDailyStateReleaseBreakdown()`, `getStateVaultBalance()`, `getVaultBalance(address)`, `getPairAddress(address)`
- Writes: `setAuctionSchedule(address[50])`, `setMaxAuctionParticipants(uint256)`, `pause()`, `unpause()`, `setTreasury(address)`, `withdrawAccruedFees(address token, uint256 amount, address to)`, `updateGovernance(address)`, `confirmGovernanceUpdate()`

If any of the above are missing from the JSON ABI, add the fragments from the Solidity contract to `RatioABI.json` so the Admin UI can call them.

LPHelper (Tokens tab)

- Used minimal ABI in `ContractConfig.js`: `setRouterFactory`, `setSwap`, `enableTimelock`, `proposeRouterFactory`, `executeRouterFactory`, `proposeSwap`, `executeSwap`, `setMaxSlippageBps`, `setMinDeadlineDelay`, `createLPAndRegister`.
- Replace with the full ABI if available.

BuyAndBurnController (Buy & Burn tab)

- Minimal ABI in `ContractConfig.js`: `setRouter`, `setRatio`, `setPolicy`, `setExecutor`, `pause`, `unpause`, `executeBuyAndBurn(uint256 auctionId, uint256 minStateOut, uint256 minBase, uint256 deadline)`.

AuctionMetrics (Metrics tab)

- Minimal ABI in `ContractConfig.js`: `finalize(auctionId, tokenIn, amountIn, amountInPLS)`, `setEnforceSequential(bool)`, `setEnforceValidToken(bool)`, `setValidAuctionToken(address, bool)`.

## Role gating

- The Admin layout gates access by `AuctionContract.governanceAddress()`; only the governance wallet sees the console.
- Some tabs require owner for their respective contracts (LPHelper/Controller/Metrics). Add per-module owner checks if desired (e.g., Ownable.owner()).

Env override for UI gating:

- You can set `VITE_GOVERNANCE_ADDRESS` in `.env.local` to force the Admin UI to gate against a specific address without reading on-chain. This is useful on test deployments or when ABIs are incomplete. On-chain governance changes still require using the Governance tab (Propose/Confirm).

## Safety and irreversible actions

- Schedule: `setAuctionSchedule` is intended as a one-time setup for exactly 50 tokens; UI includes warnings — proceed carefully.
- LP permanence: `createLPAndRegister` burns LP to the dead address by design.
- Pause/Unpause: exposed for SWAP; add other modules as needed.

## Next wiring tasks

- Set LP_HELPER, BUY_BURN_CONTROLLER, AUCTION_METRICS addresses in `ContractAddresses.js` for the target chain.
- Wire TokensPage to LPHelper (timelock flows + Create LP & Register form).
- Wire BuyBurnPage to Controller (policy, ratios, executor allowlist, execute).
- Wire MetricsPage to AuctionMetrics (finalize and toggles; table of recent finals if desired).

## Troubleshooting

- If a button does nothing, check the connected wallet is the right role (governance/owner) and that the ABI includes the method.
- Errors like `method not found` indicate an ABI mismatch — update the ABI JSON.
- For schedule submission, ensure exactly 50 unique, non-zero addresses.
