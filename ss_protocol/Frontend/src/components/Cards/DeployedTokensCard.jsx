import React, { useEffect, useState, useContext } from 'react';
import { ContractContext } from '../../Functions/ContractInitialize';
import { ethers } from 'ethers';
import '../../Styles/DeployedTokens.css';

const DeployedTokensCard = () => {
  const { AuctionContract, provider } = useContext(ContractContext);
  const [tokens, setTokens] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTokens = async () => {
      if (!AuctionContract) return;
      
      setLoading(true);
      try {
        const tokenCount = Number(await AuctionContract.tokenCount?.().catch(() => 0));
        const tokenList = [];
        
        for (let i = 0; i < tokenCount; i++) {
          try {
            const tokenAddress = await AuctionContract.autoRegisteredTokens(i);
            if (!tokenAddress || tokenAddress === ethers.ZeroAddress) continue;
            
            // Get token details
            const tokenContract = new ethers.Contract(tokenAddress, [
              'function name() view returns (string)',
              'function symbol() view returns (string)',
              'function balanceOf(address) view returns (uint256)'
            ], provider);
            
            const [name, symbol] = await Promise.all([
              tokenContract.name(),
              tokenContract.symbol()
            ]);
            
            // Check if pool exists
            const pairAddress = await AuctionContract.getPairAddress(tokenAddress).catch(() => ethers.ZeroAddress);
            
            tokenList.push({
              address: tokenAddress,
              name,
              symbol,
              hasPair: pairAddress !== ethers.ZeroAddress,
              pairAddress
            });
          } catch (err) {
            console.warn(`Failed to fetch token ${i}:`, err);
          }
        }
        
        setTokens(tokenList);
      } catch (err) {
        console.error("Failed to fetch deployed tokens:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTokens();
    
    // Refresh periodically
    const interval = setInterval(fetchTokens, 15000);
    return () => clearInterval(interval);
  }, [AuctionContract, provider]);

  if (loading) {
    return (
      <div className="col-12">
        <div className="card bg-dark text-light border-light p-3 text-center w-100" style={{ minHeight: '260px' }}>
          <div className="d-flex align-items-center justify-content-center h-100">
            <div className="spinner-border text-primary" role="status">
              <span className="visually-hidden">Loading...</span>
            </div>
            <span className="ms-3">Loading deployed tokens...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="col-12">
      <div className="card bg-dark text-light border-light p-4 w-100 deployed-tokens-card">
        <h5 className="detailText mb-4 text-uppercase">
          <i className="bi bi-coin me-2"></i>
          Deployed Tokens ({tokens.length})
        </h5>
        <div className="deployed-tokens-grid">
          {tokens.length === 0 ? (
            <div className="col-12">
              <div className="card bg-dark text-light border-light p-3 text-center w-100" style={{ minHeight: '260px' }}>
                <div className="d-flex flex-column align-items-center justify-content-center h-100">
                  <div style={{ fontSize: '3rem', opacity: 0.3 }} className="mb-3">🪙</div>
                  <h6 className="text-muted mb-1">No Deployed Tokens</h6>
                  <p className="small text-muted mb-0">Deployed tokens will appear here</p>
                </div>
              </div>
            </div>
          ) : (
            tokens.map((token) => (
              <div key={token.address} className="deployed-token-card">
                <div className="d-flex align-items-center gap-3">
                  <div className="token-identicon">
                    <Identicon address={token.address} size={40} />
                  </div>
                  <div className="token-info flex-grow-1">
                    <div className="d-flex justify-content-between align-items-center">
                      <div>
                        <h6 className="mb-0 token-name">{token.name}</h6>
                        <span className={`badge ${token.hasPair ? 'bg-success' : 'bg-warning text-dark'} badge-sm`}>
                          <i className={`bi ${token.hasPair ? 'bi-droplet-fill' : 'bi-exclamation-triangle'} me-1`}></i>
                          {token.hasPair ? 'Pool Active' : 'No Pool'}
                        </span>
                      </div>
                      <span className="token-symbol">{token.symbol}</span>
                    </div>
                    <div className="token-address-row">
                      <code className="token-address">
                        {token.address.slice(0, 6)}...{token.address.slice(-4)}
                      </code>
                      <button
                        className="btn btn-sm btn-copy"
                        onClick={() => {
                          navigator.clipboard.writeText(token.address);
                        }}
                        title="Copy address"
                      >
                        <i className="bi bi-clipboard"></i>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default DeployedTokensCard;
