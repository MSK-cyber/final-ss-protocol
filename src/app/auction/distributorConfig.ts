import { getDistributorAddress } from '@/config/addresses';

// Function to get distributor address from NormalAuction contract
export const getDistributorFromAuction = async (
  wagmiConfig: any,
  normalAuctionAddress: string,
  normalAuctionABI: any
) => {
  try {
    const distributorAddress = await readContract(wagmiConfig, {
      address: normalAuctionAddress as `0x${string}`,
      abi: normalAuctionABI.abi,
      functionName: 'distributor',
      args: [],
    });
    
    return distributorAddress;
  } catch (error) {
    console.error('Failed to get distributor address:', error);
    return null;
  }
};

// Verify if user has claimed
export const hasUserClaimed = async (
  wagmiConfig: any,
  distributorAddress: string,
  distributorABI: any,
  userAddress: string
) => {
  try {
    const hasClaimed = await readContract(wagmiConfig, {
      address: distributorAddress as `0x${string}`,
      abi: distributorABI.abi,
      functionName: 'hasClaimed',
      args: [userAddress],
    });
    
    return hasClaimed;
  } catch (error) {
    console.error('Failed to check claim status:', error);
    return false;
  }
};
