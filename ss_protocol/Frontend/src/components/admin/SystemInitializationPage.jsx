import React, { useState, useEffect } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { getContractAddresses, CHAIN_IDS } from "../../Constants/ContractAddresses";
import { ethers } from "ethers";

export default function SystemInitializationPage() {
  const { AuctionContract, provider, signer } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [contractAddresses, setContractAddresses] = useState({});
  
  // Auto-populate contract addresses from configuration
  useEffect(() => {
    const chainId = CHAIN_IDS.PULSECHAIN;
    const addresses = getContractAddresses(chainId);
    
    setContractAddresses({
      stateToken: addresses.STATE_TOKEN,
      davToken: addresses.DAV_TOKEN,
      lpHelper: addresses.LP_HELPER,
      airdropDistributor: addresses.AIRDROP_DISTRIBUTOR,
      auctionAdmin: addresses.AUCTION_ADMIN,
      buyBurnController: addresses.BUY_BURN_CONTROLLER,
      pulseXRouter: "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
      pulseXFactory: "0x1715a3E4A142d8b698131108995174F37aEBA10D"
    });
  }, []);

  // Check if system is already initialized
  useEffect(() => {
    const checkInitialization = async () => {
      if (!AuctionContract) return;
      
      try {
        // Try to read state token to see if system is initialized
        const stateTokenAddress = await AuctionContract.stateToken();
        setIsInitialized(stateTokenAddress !== ethers.ZeroAddress);
      } catch (error) {
        console.log("System not initialized yet");
        setIsInitialized(false);
      }
    };
    
    checkInitialization();
  }, [AuctionContract]);

  const handleInitializeSystem = async () => {
    if (!AuctionContract) {
      alert("Contract not available");
      return;
    }

    if (!signer) {
      alert("Please connect your wallet");
      return;
    }

    // Validate all addresses are set
    const requiredAddresses = Object.entries(contractAddresses);
    for (const [key, value] of requiredAddresses) {
      if (!value || !ethers.isAddress(value)) {
        alert(`Invalid ${key} address: ${value}`);
        return;
      }
    }

    setLoading(true);
    try {
      console.log("Initializing system with addresses:", contractAddresses);
      
      const tx = await AuctionContract.initializeCompleteSystem(
        contractAddresses.stateToken,
        contractAddresses.davToken,
        contractAddresses.lpHelper,
        contractAddresses.airdropDistributor,
        contractAddresses.auctionAdmin,
        contractAddresses.buyBurnController,
        contractAddresses.pulseXRouter,
        contractAddresses.pulseXFactory
      );

      console.log("Transaction sent:", tx.hash);
      alert(`System initialization transaction sent: ${tx.hash}`);
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      alert("System initialized successfully!");
      setIsInitialized(true);
      
    } catch (error) {
      console.error("Initialization failed:", error);
      alert(`Initialization failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card">
      <div className="card-header">
        <h5 className="card-title mb-0">🚀 System Initialization</h5>
        <small className="text-muted">Configure the complete auction system with one click</small>
      </div>
      <div className="card-body">
        {isInitialized ? (
          <div className="alert alert-success">
            <h6 className="alert-heading">✅ System Already Initialized</h6>
            <p className="mb-0">The auction system has been successfully configured and is ready to use.</p>
          </div>
        ) : (
          <div>
            <div className="alert alert-info">
              <h6 className="alert-heading">📋 System Configuration</h6>
              <p className="mb-2">This will initialize the auction system with the following contracts:</p>
              <ul className="mb-0 small">
                <li><strong>STATE Token:</strong> {contractAddresses.stateToken}</li>
                <li><strong>DAV Token:</strong> {contractAddresses.davToken}</li>
                <li><strong>LP Helper:</strong> {contractAddresses.lpHelper}</li>
                <li><strong>Airdrop Distributor:</strong> {contractAddresses.airdropDistributor}</li>
                <li><strong>Auction Admin:</strong> {contractAddresses.auctionAdmin}</li>
                <li><strong>Buy & Burn Controller:</strong> {contractAddresses.buyBurnController}</li>
                <li><strong>PulseX Router:</strong> {contractAddresses.pulseXRouter}</li>
                <li><strong>PulseX Factory:</strong> {contractAddresses.pulseXFactory}</li>
              </ul>
            </div>
            
            <div className="alert alert-warning">
              <h6 className="alert-heading">⚠️ Important</h6>
              <p className="mb-0">
                This action will:
              </p>
              <ul className="mb-0 small">
                <li>Connect all protocol contracts together</li>
                <li>Set up token allowances for airdrop functionality</li>
                <li>Enable STATE token access for buy & burn operations</li>
                <li>Make the system ready for auction operations</li>
              </ul>
            </div>

            <div className="d-grid">
              <button
                className="btn btn-primary btn-lg"
                onClick={handleInitializeSystem}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Initializing System...
                  </>
                ) : (
                  <>
                    🔧 Configure Complete System
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        
        <div className="mt-4">
          <h6>System Status</h6>
          <div className="row g-3">
            <div className="col-md-6">
              <div className="card bg-light">
                <div className="card-body text-center">
                  <div className={`h5 mb-0 ${isInitialized ? 'text-success' : 'text-warning'}`}>
                    {isInitialized ? '✅' : '⏳'}
                  </div>
                  <small>System Configuration</small>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card bg-light">
                <div className="card-body text-center">
                  <div className={`h5 mb-0 ${AuctionContract ? 'text-success' : 'text-danger'}`}>
                    {AuctionContract ? '✅' : '❌'}
                  </div>
                  <small>Contract Connection</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}