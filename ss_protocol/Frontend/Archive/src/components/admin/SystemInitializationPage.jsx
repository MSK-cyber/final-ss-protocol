import React, { useState, useEffect } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { getContractAddresses, CHAIN_IDS } from "../../Constants/ContractAddresses";
import { getRuntimeConfigSync } from "../../Constants/RuntimeConfig";
import { ethers } from "ethers";

export default function SystemInitializationPage() {
  const { AuctionContract, provider, signer } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [contractAddresses, setContractAddresses] = useState({});
  const [initializationDetails, setInitializationDetails] = useState({
    stateToken: false,
    davToken: false,
    lpHelper: false,
    airdropDistributor: false,
    auctionAdmin: false,
    buyBurnController: false,
    pulseXRouter: false,
    pulseXFactory: false
  });
  
  // Auto-populate contract addresses from configuration
  useEffect(() => {
    const chainId = CHAIN_IDS.PULSECHAIN;
    const addresses = getContractAddresses(chainId);
    
    const cfg = getRuntimeConfigSync();
    setContractAddresses({
      stateToken: addresses.STATE_TOKEN,
      davToken: addresses.DAV_TOKEN,
      lpHelper: addresses.LP_HELPER,
      airdropDistributor: addresses.AIRDROP_DISTRIBUTOR,
      auctionAdmin: addresses.AUCTION_ADMIN,
      buyBurnController: addresses.BUY_BURN_CONTROLLER,
      pulseXRouter: cfg?.dex?.router?.address || "0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02",
      pulseXFactory: cfg?.dex?.factory?.address || "0x1715a3E4A142d8b698131108995174F37aEBA10D"
    });
  }, []);

  // Check if system is already initialized
  useEffect(() => {
    const checkInitialization = async () => {
      if (!AuctionContract) {
        setChecking(false);
        return;
      }
      
      setChecking(true);
      try {
        // Check multiple contract connections
        const stateTokenAddress = await AuctionContract.stateToken().catch(() => ethers.ZeroAddress);
        const davTokenAddress = await AuctionContract.davToken().catch(() => ethers.ZeroAddress);
        const lpHelperAddress = await AuctionContract.lpHelper().catch(() => ethers.ZeroAddress);
        const airdropAddress = await AuctionContract.airdropDistributor().catch(() => ethers.ZeroAddress);
        const adminAddress = await AuctionContract.auctionAdmin().catch(() => ethers.ZeroAddress);
        const buyBurnAddress = await AuctionContract.buyBurnController().catch(() => ethers.ZeroAddress);
        const routerAddress = await AuctionContract.pulseXRouter().catch(() => ethers.ZeroAddress);
        const factoryAddress = await AuctionContract.pulseXFactory().catch(() => ethers.ZeroAddress);
        
        const details = {
          stateToken: stateTokenAddress !== ethers.ZeroAddress,
          davToken: davTokenAddress !== ethers.ZeroAddress,
          lpHelper: lpHelperAddress !== ethers.ZeroAddress,
          airdropDistributor: airdropAddress !== ethers.ZeroAddress,
          auctionAdmin: adminAddress !== ethers.ZeroAddress,
          buyBurnController: buyBurnAddress !== ethers.ZeroAddress,
          pulseXRouter: routerAddress !== ethers.ZeroAddress,
          pulseXFactory: factoryAddress !== ethers.ZeroAddress
        };
        
        setInitializationDetails(details);
        
        // System is initialized if STATE token is set
        const initialized = stateTokenAddress !== ethers.ZeroAddress;
        setIsInitialized(initialized);
      } catch (error) {
        console.log("System not initialized yet:", error);
        setIsInitialized(false);
      } finally {
        setChecking(false);
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

  const contractInfo = [
    { 
      key: 'stateToken', 
      label: 'STATE Token', 
      icon: '🪙',
      description: 'Protocol governance and utility token',
      address: contractAddresses.stateToken 
    },
    { 
      key: 'davToken', 
      label: 'DAV Token', 
      icon: '💎',
      description: 'Dividend-adjusted value token',
      address: contractAddresses.davToken 
    },
    { 
      key: 'lpHelper', 
      label: 'LP Helper', 
      icon: '🔗',
      description: 'Liquidity pool creation assistant',
      address: contractAddresses.lpHelper 
    },
    { 
      key: 'airdropDistributor', 
      label: 'Airdrop Distributor', 
      icon: '🎁',
      description: 'Token distribution manager',
      address: contractAddresses.airdropDistributor 
    },
    { 
      key: 'auctionAdmin', 
      label: 'Auction Admin', 
      icon: '⚙️',
      description: 'System administration interface',
      address: contractAddresses.auctionAdmin 
    },
    { 
      key: 'buyBurnController', 
      label: 'Buy & Burn Controller', 
      icon: '🔥',
      description: 'Token buyback and burn mechanism',
      address: contractAddresses.buyBurnController 
    },
    { 
      key: 'pulseXRouter', 
      label: 'PulseX Router', 
      icon: '🔄',
      description: 'DEX swap routing contract',
      address: contractAddresses.pulseXRouter 
    },
    { 
      key: 'pulseXFactory', 
      label: 'PulseX Factory', 
      icon: '🏭',
      description: 'DEX pair creation factory',
      address: contractAddresses.pulseXFactory 
    }
  ];

  const totalContracts = contractInfo.length;
  const connectedContracts = Object.values(initializationDetails).filter(Boolean).length;
  const progressPercentage = (connectedContracts / totalContracts) * 100;

  return (
    <>
      {/* Overview Card */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center">
            <div>
              <h5 className="card-title mb-1">🚀 SYSTEM INITIALIZATION</h5>
              <small className="text-muted">Step 1: Configure the complete auction protocol</small>
            </div>
            {checking && (
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">Checking...</span>
              </div>
            )}
          </div>
        </div>
        <div className="card-body">
          {/* System Status Banner */}
          <div className={`alert ${isInitialized ? 'alert-success' : 'alert-warning'} d-flex align-items-center mb-4`}>
            <div className="me-3" style={{fontSize: '2rem'}}>
              {isInitialized ? '✅' : '⚠️'}
            </div>
            <div className="flex-grow-1">
              {isInitialized ? (
                <>
                  <h6 className="alert-heading mb-1">System Fully Initialized</h6>
                  <p className="mb-0 small">All protocol contracts are connected and the system is ready for operation.</p>
                </>
              ) : (
                <>
                  <h6 className="alert-heading mb-1">Initialization Required</h6>
                  <p className="mb-0 small">Connect all protocol contracts to enable the auction system.</p>
                </>
              )}
            </div>
            {!isInitialized && AuctionContract && (
              <button
                className="btn btn-primary btn-lg ms-3"
                onClick={handleInitializeSystem}
                disabled={loading}
                style={{minWidth: '200px'}}
              >
                {loading ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" />
                    Initializing...
                  </>
                ) : (
                  <>
                    <i className="bi bi-gear-fill me-2"></i>
                    Initialize System
                  </>
                )}
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="d-flex justify-content-between align-items-center mb-2">
              <span className="small fw-bold text-uppercase">Initialization Progress</span>
              <span className="badge bg-primary">{connectedContracts}/{totalContracts} Connected</span>
            </div>
            <div className="progress" style={{height: '8px'}}>
              <div 
                className="progress-bar bg-gradient" 
                role="progressbar" 
                style={{width: `${progressPercentage}%`}}
                aria-valuenow={progressPercentage} 
                aria-valuemin="0" 
                aria-valuemax="100"
              ></div>
            </div>
          </div>

          {/* Connection Status */}
          {!AuctionContract && (
            <div className="alert alert-danger">
              <i className="bi bi-exclamation-triangle-fill me-2"></i>
              <strong>Auction Contract Not Connected</strong>
              <p className="mb-0 small mt-1">Please ensure your wallet is connected and the contract is properly deployed.</p>
            </div>
          )}
        </div>
      </div>

      {/* Contract Details Grid */}
      <div className="card">
        <div className="card-header">
          <h6 className="mb-0">
            <i className="bi bi-diagram-3-fill me-2"></i>
            CONTRACT CONFIGURATION
          </h6>
        </div>
        <div className="card-body">
          <div className="row g-3">
            {contractInfo.map((contract) => (
              <div key={contract.key} className="col-md-6 col-lg-4">
                <div className={`card h-100 ${initializationDetails[contract.key] ? 'border-success' : 'border-secondary'}`} 
                     style={{borderWidth: '2px'}}>
                  <div className="card-body">
                    <div className="d-flex align-items-start justify-content-between mb-2">
                      <div className="d-flex align-items-center gap-2">
                        <span style={{fontSize: '1.5rem'}}>{contract.icon}</span>
                        <div>
                          <h6 className="mb-0 small">{contract.label}</h6>
                        </div>
                      </div>
                      <div>
                        {initializationDetails[contract.key] ? (
                          <span className="badge bg-success">
                            <i className="bi bi-check-circle-fill me-1"></i>
                            Connected
                          </span>
                        ) : (
                          <span className="badge bg-secondary">
                            <i className="bi bi-circle me-1"></i>
                            Pending
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="small text-muted mb-2">{contract.description}</p>
                    <div className="d-flex align-items-center gap-2">
                      <code className="small text-truncate flex-grow-1" style={{fontSize: '0.7rem'}}>
                        {contract.address ? `${contract.address.slice(0, 6)}...${contract.address.slice(-4)}` : 'Not set'}
                      </code>
                      {contract.address && (
                        <button 
                          className="btn btn-sm btn-outline-secondary py-0 px-2"
                          onClick={() => {
                            navigator.clipboard.writeText(contract.address);
                            alert('Address copied to clipboard!');
                          }}
                          title="Copy address"
                        >
                          <i className="bi bi-clipboard"></i>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Information Panel */}
      {!isInitialized && (
        <div className="card mt-4">
          <div className="card-header bg-primary bg-opacity-10">
            <h6 className="mb-0">
              <i className="bi bi-info-circle-fill me-2"></i>
              WHAT HAPPENS DURING INITIALIZATION?
            </h6>
          </div>
          <div className="card-body">
            <div className="row g-3">
              <div className="col-md-6">
                <div className="d-flex gap-3">
                  <div className="text-primary" style={{fontSize: '1.5rem'}}>1️⃣</div>
                  <div>
                    <h6 className="small fw-bold mb-1">Contract Connections</h6>
                    <p className="small text-muted mb-0">All protocol contracts are linked to the main auction contract, establishing the system architecture.</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="d-flex gap-3">
                  <div className="text-primary" style={{fontSize: '1.5rem'}}>2️⃣</div>
                  <div>
                    <h6 className="small fw-bold mb-1">Token Allowances</h6>
                    <p className="small text-muted mb-0">STATE and DAV token allowances are configured for airdrop distribution and buy & burn operations.</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="d-flex gap-3">
                  <div className="text-primary" style={{fontSize: '1.5rem'}}>3️⃣</div>
                  <div>
                    <h6 className="small fw-bold mb-1">DEX Integration</h6>
                    <p className="small text-muted mb-0">PulseX router and factory are configured for liquidity pool creation and token swapping.</p>
                  </div>
                </div>
              </div>
              <div className="col-md-6">
                <div className="d-flex gap-3">
                  <div className="text-primary" style={{fontSize: '1.5rem'}}>4️⃣</div>
                  <div>
                    <h6 className="small fw-bold mb-1">System Activation</h6>
                    <p className="small text-muted mb-0">The auction system becomes fully operational and ready to process token auctions.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}