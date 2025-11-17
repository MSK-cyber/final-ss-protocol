import { useEffect, useState, useContext } from "react";
import { ethers } from "ethers";
import { useAccount } from "wagmi";
import { ContractContext } from "../Functions/ContractInitialize";
import toast from "react-hot-toast";
import { formatTimestamp } from "../Constants/Utils";

const DavHistory = () => {
  const { AllContracts } = useContext(ContractContext);
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
        const [mintTimes, expireTimes, amounts, fromGovernance, isExpired] =
          await AllContracts.davContract.getMintTimestamps(address);

        const formatted = mintTimes.map((mint, i) => ({
          mintedAt: formatTimestamp(mint),
          mintedAtRaw: Number(
            typeof mint === "object" && "toNumber" in mint
              ? mint.toNumber()
              : mint
          ),
          expiresAt: formatTimestamp(expireTimes[i]),
          amount: ethers.formatEther(amounts[i]),
          fromGovernance: Boolean(fromGovernance[i]), // Ensure boolean
          isExpired: Boolean(isExpired[i]), // Ensure boolean
        }));

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
  }, [AllContracts, address]);

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
                    {entry.fromGovernance ? "Promotion" : "Minted"}
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
