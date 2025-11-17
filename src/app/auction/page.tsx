import { writeContract } from 'wagmi';
import { ethers } from 'ethers';
import { useState } from 'react';
import { NormalAuctionABI, ReverseAuctionABI } from '../abis';
import { wagmiConfig } from '../wagmi';

const AuctionPage = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [swapAmount, setSwapAmount] = useState('');
  const normalAuctionAddress = '0xYourNormalAuctionAddress';
  const reverseAuctionAddress = '0xYourReverseAuctionAddress';

  // Normal Auction - Claim Handler
  const handleClaim = async () => {
    try {
      setIsLoading(true);
      
      // First, check if user is eligible to claim by reading from the contract
      // The NormalAuction contract's claim function internally calls the distributor
      const tx = await writeContract(wagmiConfig, {
        address: normalAuctionAddress as `0x${string}`,
        abi: NormalAuctionABI.abi,
        functionName: 'claim',
        args: [],
      });
      
      await waitForTransactionReceipt(wagmiConfig, {
        hash: tx,
      });
      
      toast.success('Claim successful!');
      
      // Refresh balances after claim
      await refreshBalances();
    } catch (error: any) {
      console.error('Claim error details:', error);
      
      // More detailed error handling
      if (error?.cause?.reason) {
        toast.error(`Claim failed: ${error.cause.reason}`);
      } else if (error?.message?.includes('distributor')) {
        toast.error('Distributor not properly configured. Please contact support.');
      } else if (error?.shortMessage) {
        toast.error(error.shortMessage);
      } else {
        toast.error('Failed to claim. Please ensure you are eligible and try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Normal Auction - Ratio Swap Handler
  const handleRatioSwap = async () => {
    // ...existing code...
    try {
      // Correct: Uses 'ratioSwap' function from NormalAuction contract
      const tx = await writeContract(wagmiConfig, {
        address: normalAuctionAddress as `0x${string}`,
        abi: NormalAuctionABI.abi,
        functionName: 'ratioSwap', // ✅ Matches contract function
        args: [ethers.parseEther(swapAmount)],
      });
      // ...existing code...
    } catch (error) {
      // ...existing code...
    }
  };

  // Normal Auction - Swap Handler
  const handleSwap = async () => {
    // ...existing code...
    try {
      // Correct: Uses 'swap' function from NormalAuction contract
      const tx = await writeContract(wagmiConfig, {
        address: normalAuctionAddress as `0x${string}`,
        abi: NormalAuctionABI.abi,
        functionName: 'swap', // ✅ Matches contract function
        args: [],
        value: ethers.parseEther(swapAmount),
      });
      // ...existing code...
    } catch (error) {
      // ...existing code...
    }
  };

  // Reverse Auction - Step 1 Handler (should be burn, not swap)
  const handleStep1 = async () => {
    // ...existing code...
    try {
      // CORRECTION NEEDED: Should use 'burn' instead of 'swap'
      const tx = await writeContract(wagmiConfig, {
        address: reverseAuctionAddress as `0x${string}`,
        abi: ReverseAuctionABI.abi,
        functionName: 'burn', // ✅ Changed from 'swap' to 'burn' to match contract
        args: [ethers.parseEther(burnAmount)],
      });
      // ...existing code...
    } catch (error) {
      // ...existing code...
    }
  };

  // Reverse Auction - Step 2 Handler
  const handleStep2 = async () => {
    try {
      setIsLoading(true);
      
      // Correct: Uses 'claim' function from ReverseAuction contract
      const tx = await writeContract(wagmiConfig, {
        address: reverseAuctionAddress as `0x${string}`,
        abi: ReverseAuctionABI.abi,
        functionName: 'claim', // ✅ Matches contract function
        args: [],
      });
      // ...existing code...
    } catch (error) {
      // ...existing code...
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      {/* ...existing JSX code... */}
    </div>
  );
};

export default AuctionPage;