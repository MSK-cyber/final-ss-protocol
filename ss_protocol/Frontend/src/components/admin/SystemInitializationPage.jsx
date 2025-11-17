import React, { useState, useEffect } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { getContractAddresses, CHAIN_IDS } from "../../Constants/ContractAddresses";
import { getRuntimeConfigSync } from "../../Constants/RuntimeConfig";
import { ethers } from "ethers";
import toast from "react-hot-toast";

export default function SystemInitializationPage() {
  const { AuctionContract, provider, signer, addresses, AllContracts } = useContractContext();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [contractAddresses, setContractAddresses] = useState({});
  const [initializationDetails, setInitializationDetails] = useState({
    stateToken: false,
    davToken: false,
    airdropDistributor: false,
    auctionAdmin: false,
    swapLens: false,
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
      airdropDistributor: addresses.AIRDROP_DISTRIBUTOR,
      auctionAdmin: addresses.AUCTION_ADMIN,
      buyBurnController: addresses.BUY_BURN_CONTROLLER,
      swapLens: addresses.SWAP_LENS,
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
  const davTokenAddress = await AuctionContract.dav().catch(() => ethers.ZeroAddress);
        // Robust: create a tiny read-only contract for missing getters (auctionAdmin)
        const auctionAddr = AuctionContract?.target || AuctionContract?.address;
        const runner = AuctionContract?.runner || provider;
        const miniAbi = [
          { type: "function", name: "auctionAdmin", inputs: [], outputs: [{ type: "address" }], stateMutability: "view" }
        ];
        let mini;
        try {
          mini = new ethers.Contract(auctionAddr, miniAbi, runner);
        } catch {}
        const airdropAddress = await AuctionContract.airdropDistributor().catch(() => ethers.ZeroAddress);
        const adminAddress = (await mini?.auctionAdmin?.().catch(() => ethers.ZeroAddress)) 
          || (AllContracts?.auctionAdmin?.target || ethers.ZeroAddress);
        const routerAddress = await AuctionContract.pulseXRouter().catch(() => ethers.ZeroAddress);
        const factoryAddress = await AuctionContract.pulseXFactory().catch(() => ethers.ZeroAddress);
        const swapLensAddress = (await (AuctionContract.swapLens?.().catch?.(() => ethers.ZeroAddress)))
          || (AllContracts?.swapLens?.target || ethers.ZeroAddress);
        
        // Also allow config/context fallbacks to count as connected (for older ABIs)
        // Determine connections strictly from on-chain values (no config fallbacks)
        const details = {
          stateToken: stateTokenAddress !== ethers.ZeroAddress,
          davToken: davTokenAddress !== ethers.ZeroAddress,
          airdropDistributor: airdropAddress !== ethers.ZeroAddress,
          auctionAdmin: adminAddress !== ethers.ZeroAddress,
          swapLens: swapLensAddress !== ethers.ZeroAddress,
          pulseXRouter: routerAddress !== ethers.ZeroAddress,
          pulseXFactory: factoryAddress !== ethers.ZeroAddress,
        };
        
        setInitializationDetails(details);
        
  // Consider the system initialized only if all expected connections are set on-chain
  const initialized = Object.values(details).every(Boolean);
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
        toast.error(`Invalid ${key} address: ${value}`, {
          position: "top-center",
          duration: 5000,
        });
        return;
      }
    }

    setLoading(true);
    try {
      console.log("Initializing system with addresses:", contractAddresses);
      // Governance-only guard: prevent tx if caller isn't governance
      try {
        const gov = await AuctionContract.governanceAddress();
        const caller = await signer.getAddress();
        if (gov?.toLowerCase?.() !== caller?.toLowerCase?.()) {
          toast.error("Only governance can initialize the system.", {
            position: "top-center",
            duration: 5000,
          });
          setLoading(false);
          return;
        }
      } catch {}
      
      const tx = await AuctionContract.initializeCompleteSystem(
        contractAddresses.stateToken,
        contractAddresses.davToken,
        contractAddresses.airdropDistributor,
        contractAddresses.auctionAdmin,
        contractAddresses.buyBurnController,
        contractAddresses.swapLens,
        contractAddresses.pulseXRouter,
        contractAddresses.pulseXFactory
      );

      console.log("Transaction sent:", tx.hash);
      toast.success(`System initialization transaction sent: ${tx.hash}`, {
        position: "top-center",
        duration: 5000,
      });
      
      // Wait for transaction confirmation
      const receipt = await tx.wait();
      console.log("Transaction confirmed:", receipt);
      
      toast.success("System initialized successfully!", {
        position: "top-center",
        duration: 12000,
      });
      setIsInitialized(true);
      
    } catch (error) {
      console.error("Initialization failed:", error);
      toast.error(`Initialization failed: ${error.message}`, {
        position: "top-center",
        duration: 5000,
      });
    } finally {
      setLoading(false);
    }
  };

  // Note: Details grid removed in UI; keep progress based on initializationDetails only

  const totalContracts = Object.keys(initializationDetails).length;
  const connectedContracts = Object.values(initializationDetails).filter(Boolean).length;
  const progressPercentage = (connectedContracts / totalContracts) * 100;
  // Target contract metadata for this section (initializeCompleteSystem is called on AuctionContract)
  const initTargetAddress = AuctionContract?.target || AuctionContract?.address || addresses?.auction || "";
  const initTargetName = "Auction Contract";

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard", { position: "top-center" });
    } catch {}
  };

  return (
    <>
      {/* Overview Card */}
      <div className="card mb-4">
        <div className="card-header">
          <div className="d-flex justify-content-between align-items-center w-100">
            {/* Left: Title */}
            <div className="me-3">
              <h5 className="card-title mb-1">🚀 SYSTEM INITIALIZATION</h5>
              <small className="text-muted">Step 1: Configure the complete auction protocol</small>
            </div>
            {/* Right: Contract name and address */}
            <div className="d-flex align-items-center gap-3 text-end">
              {checking && (
                <div className="spinner-border spinner-border-sm text-primary" role="status">
                  <span className="visually-hidden">Checking...</span>
                </div>
              )}
              <div>
                <div className="small text-muted">{initTargetName}</div>
                <div className="small d-flex align-items-center gap-2 justify-content-end" style={{fontFamily: 'monospace'}}>
                  <span>{initTargetAddress || '—'}</span>
                  {initTargetAddress && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-secondary py-0 px-1"
                      title="Copy address"
                      onClick={() => copyToClipboard(initTargetAddress)}
                    >
                      <i className="bi bi-clipboard" />
                    </button>
                  )}
                </div>
              </div>
            </div>
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