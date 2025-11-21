import { useEffect, useState, useContext } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { ContractContext } from "../Functions/ContractInitialize";
import toast from "react-hot-toast";
import { formatTimestamp } from "../Constants/Utils";

const DavHistory = () => {
  const { AllContracts, provider } = useContext(ContractContext);
  const { address } = useAccount();
  const [mintBatches, setMintBatches] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchMintHistory = async () => {
      if (!AllContracts?.davContract || !address) {
        setMintBatches([]);
        setIsLoading(false);
        toast.error("Connect wallet to view minting history");
        return;
      }

      setIsLoading(true);
      try {
        let mintTimes, expireTimes, amounts, fromGovernance, isExpired;
        let usedEventOnlyFallback = false;
        try {
          [mintTimes, expireTimes, amounts, fromGovernance, isExpired] =
            await AllContracts.davContract.getMintTimestamps(address);
        } catch (e) {
          console.warn('getMintTimestamps unavailable; building history from Transfer events', e?.reason || e?.message || e);
          usedEventOnlyFallback = true;
        }

        if (usedEventOnlyFallback) {
          try {
            let expireSeconds = null;
            try {
              const exp = await AllContracts.davContract.getExpireTime();
              expireSeconds = (typeof exp === 'object' && typeof exp.toString === 'function')
                ? Number(exp.toString())
                : Number(exp);
            } catch (e) {
              console.warn('Could not load expiry time from contract:', e?.message || e);
            }

            const filter = AllContracts.davContract.filters.Transfer(null, address);
            const events = await AllContracts.davContract.queryFilter(filter, 0, 'latest');
            const latestBlock = await provider.getBlock('latest');
            const latestTs = Number(latestBlock?.timestamp || 0);

            const rows = [];
            for (const ev of events) {
              try {
                const from = String(ev.args.from || ev.args[0] || '').toLowerCase();
                const value = ev.args.value || ev.args[2] || 0n;
                const blk = await provider.getBlock(ev.blockNumber);
                const ts = Number(blk?.timestamp || 0);
                const amt = ethers.formatEther(value);
                const expTs = expireSeconds != null ? (ts + expireSeconds) : null;
                const expired = expTs != null ? (latestTs > expTs) : false;
                rows.push({
                  mintedAt: formatTimestamp(ts),
                  mintedAtRaw: ts,
                  expiresAt: expTs != null ? formatTimestamp(expTs) : 'Unknown',
                  amount: amt,
                  fromGovernance: false,
                  isExpired: expired,
                  batchType: (from === '0x0000000000000000000000000000000000000000') ? 'mint' : 'promo',
                });
              } catch {}
            }

            const sortedEv = rows.sort((a, b) => {
              if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1;
              return b.mintedAtRaw - a.mintedAtRaw;
            });
            setMintBatches(sortedEv);
            return;
          } catch (evErr) {
            console.error('Event-only fallback failed:', evErr);
            setMintBatches([]);
            toast.error(`Failed to fetch mint history from events: ${evErr?.reason || evErr?.message || evErr}`);
            return;
          }
        }

        // Get governance address for classification
        let governanceAddr = null;
        try {
          governanceAddr = (await AllContracts.davContract.governance()).toLowerCase();
        } catch (e) {
          console.warn("Could not fetch governance address", e);
        }

        // Query Transfer events to classify batch sources
        const transferList = []; // Array of {amountWeiStr, timestamp, type}
        const allEvents = []; // Detailed list with usage tracking for 1:1 mapping
        const eventsByAmount = new Map(); // amountWeiStr -> array of event refs
        
        if (provider && mintTimes.length > 0) {
          try {
            // Find earliest and latest block timestamps
            const timestamps = mintTimes.map(t => Number(t));
            const minTimestamp = Math.min(...timestamps);
            const maxTimestamp = Math.max(...timestamps);
            
            // Estimate block range (approximate 12s per block on PulseChain)
            // Pull from genesis to avoid missing historical events
            const fromBlock = 0;
            
            // Query Transfer events where 'to' is the user
            const filter = AllContracts.davContract.filters.Transfer(null, address);
            const events = await AllContracts.davContract.queryFilter(filter, fromBlock, 'latest');
            // Sort events by blockNumber ascending for deterministic matching
            events.sort((a,b) => (a.blockNumber || 0) - (b.blockNumber || 0));
            
            // Classify each event and store with timestamp
            for (const event of events) {
              const from = (event.args?.from || event.args?.[0] || "").toLowerCase();
              const value = event.args?.value ?? event.args?.[2];
              
              // Get block timestamp for this event
              let blockTimestamp = 0;
              try {
                const block = await provider.getBlock(event.blockNumber);
                blockTimestamp = block.timestamp;
              } catch (e) {
                console.warn(`Could not fetch block ${event.blockNumber}`, e);
                continue;
              }
              
              const amountWeiStr = value?.toString?.() ?? String(value);
              
              // Classify based on sender:
              // - from zero address = minted (user paid to mint)
              // - from non-zero address = promo (governance or other wallet transferred)
              const zeroAddr = "0x0000000000000000000000000000000000000000";
              let type = "promo"; // default for transfers from non-zero address
              if (from === zeroAddr) {
                type = "mint";
              }
              
              const evObj = { amountWeiStr, timestamp: Number(blockTimestamp), type, used: false };
              allEvents.push(evObj);
              transferList.push({ amountWeiStr, timestamp: Number(blockTimestamp), type });
              if (!eventsByAmount.has(amountWeiStr)) eventsByAmount.set(amountWeiStr, []);
              eventsByAmount.get(amountWeiStr).push(evObj);
            }
          } catch (e) {
            console.warn("Could not query Transfer events, using fallback classification", e);
          }
        }

        // Helper: find best matching event for a batch by exact amount, nearest timestamp
        const pickEventForBatch = (amountWeiStr, mintTs) => {
          let candidates = eventsByAmount.get(amountWeiStr) || [];
          let best = null;
          let bestDiff = Infinity;
          for (const ev of candidates) {
            if (ev.used) continue;
            const diff = Math.abs(ev.timestamp - mintTs);
            if (diff < bestDiff) {
              best = ev;
              bestDiff = diff;
            }
          }
          if (!best) {
            // Fallback to nearest among all events if amount grouping failed
            for (const ev of allEvents) {
              if (ev.used) continue;
              const diff = Math.abs(ev.timestamp - mintTs);
              if (diff < bestDiff) {
                best = ev;
                bestDiff = diff;
              }
            }
          }
          if (best) best.used = true;
          return best;
        };

        const formatted = mintTimes.map((mint, i) => {
          const mintTimestamp = Number(
            typeof mint === "object" && "toNumber" in mint
              ? mint.toNumber()
              : mint
          );
          const amountWeiStr = amounts[i]?.toString?.() ?? String(amounts[i]);
          const amountFormatted = ethers.formatEther(amountWeiStr);
          
          // Robust mapping: match by exact amount (wei) and nearest timestamp
          let batchType = 'mint';
          const matched = pickEventForBatch(amountWeiStr, mintTimestamp);
          if (matched && matched.type) batchType = matched.type;
          
          return {
            mintedAt: formatTimestamp(mint),
            mintedAtRaw: mintTimestamp,
            expiresAt: formatTimestamp(expireTimes[i]),
            amount: amountFormatted,
            fromGovernance: Boolean(fromGovernance[i]),
            isExpired: Boolean(isExpired[i]),
            batchType, // "mint" | "promo" | "transfer"
          };
        });

        // Sort: unexpired by mintedAt desc, then expired by mintedAt desc
        const sorted = formatted.sort((a, b) => {
          if (a.isExpired !== b.isExpired) {
            return a.isExpired ? 1 : -1; // Expired go to bottom
          }
          return b.mintedAtRaw - a.mintedAtRaw; // Recent first within same expiration status
        });

        setMintBatches(sorted);
      } catch (error) {
        console.error("Error fetching mint timestamps:", error);
        setMintBatches([]);
        toast.error(
          `Failed to fetch mint history: ${error.reason || error.message}`
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchMintHistory();
  }, [AllContracts, address, provider]);

  return (
    <div className="container mt-4">
      <div className="table-responsive">
        <table className="table table-dark">
          <thead>
            <tr>
              <th scope="col">Mint/Promo</th>
              <th scope="col">Mint Amount (DAV)</th>
              <th scope="col">Minted At</th>
              <th scope="col">Expires At</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan="5" className="text-center">
                  Loading...
                </td>
              </tr>
            ) : mintBatches && mintBatches.length > 0 ? (
              mintBatches.map((entry, idx) => (
                <tr key={idx}>
                  <td
                    className={entry.isExpired ? "text-pink" : "text-success"}
                  >
                    {entry.batchType === "promo" ? "Promotion" : "Minted"}
                  </td>
                  <td
                    className={entry.isExpired ? "text-pink" : "text-success"}
                  >
                    {entry.amount}
                  </td>
                  <td
                    className={entry.isExpired ? "text-pink" : "text-success"}
                  >
                    {entry.mintedAt}
                  </td>
                  <td
                    className={entry.isExpired ? "text-pink" : "text-success"}
                  >
                    {entry.expiresAt}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan="5" className="text-center">
                  No minting history available
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DavHistory;
