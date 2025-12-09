import React, { useEffect, useMemo, useState } from "react";
import { useContractContext } from "../../Functions/useContractContext";
import { ethers } from "ethers";
import { toast } from "react-hot-toast";
import { generateIdenticon } from "../../utils/identicon";

export default function TokenManagementPage() {
  const { AuctionContract, LiquidityManager, AllContracts, account } = useContractContext();
  const ADMIN_ALLOWLIST = useMemo(() => [
    '0x9fa004e13e780ef5b50ca225ad5dcd4d0fe9ed70',
  ], []);
  const [loading, setLoading] = useState(false);
  const [deployForm, setDeployForm] = useState({ hash: "" });
  const [poolForm, setPoolForm] = useState({ token: "", tokenAmount: "10000", stateAmount: "1000000" });
  const [addLiquidityForm, setAddLiquidityForm] = useState({ token: "", tokenAmount: "", stateAmount: "" });
  const [allowanceForm, setAllowanceForm] = useState({ token: "" });
  const [allowanceStatus, setAllowanceStatus] = useState({ token: null, state: null, checking: false });
  const [tokens, setTokens] = useState([]);
  const [selectedToken, setSelectedToken] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [modalAllowanceStatus, setModalAllowanceStatus] = useState({ token: null, state: null, checking: false });
  const [modalLiquidityForm, setModalLiquidityForm] = useState({ tokenAmount: "", stateAmount: "" });
  const [modalMeta, setModalMeta] = useState({ 
    loading: false,
    name: null,
    symbol: null,
    ratio: null,
    ratioLoading: false,
    ratioErr: null,
    governance: null,
    tokenDecimals: 18,
    stateDecimals: 18,
    vaultTokenBal: null,
    vaultStateBal: null,
    factory: null,
    router: null,
    factoryPair: null
  });

  const canManage = useMemo(() => !!AuctionContract, [AuctionContract]);
  const canAddLiquidity = useMemo(() => !!LiquidityManager, [LiquidityManager]);
  const stateTokenAddress = useMemo(() => AllContracts?.stateContract?.target || AllContracts?._stateAddress, [AllContracts]);
  const [isGov, setIsGov] = useState(false);

  // Generate random 4-character hash
  const generateHash = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let hash = '';
    for (let i = 0; i < 4; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
  };

  // Initialize with a random hash on component mount
  useEffect(() => {
    setDeployForm({ hash: generateHash() });
  }, []);

  // Generate token name and symbol from hash
  const tokenName = deployForm.hash ? `PUL - ${deployForm.hash}` : '';
  const tokenSymbol = deployForm.hash ? `p${deployForm.hash}` : '';

  const refreshTokens = async () => {
    if (!AuctionContract) return;
    try {
      const count = Number(await AuctionContract.tokenCount?.().catch(() => 0));
      if (count === 0) {
        setTokens([]);
        return;
      }
      
      const runner = AuctionContract?.runner || undefined;
      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)", 
        "function decimals() view returns (uint8)",
        "function name() view returns (string)",
        "function symbol() view returns (string)"
      ];
      const burnAddress = "0x000000000000000000000000000000000000dEaD";
      
      // Step 1: Fetch all token addresses in PARALLEL
      const addressPromises = [];
      for (let i = 0; i < count; i++) {
        addressPromises.push(AuctionContract.autoRegisteredTokens(i).catch(() => null));
      }
      const addresses = await Promise.all(addressPromises);
      const validAddresses = addresses.filter(addr => addr && addr !== ethers.ZeroAddress);
      
      // Step 2: Fetch all token data in PARALLEL (pair, name, symbol, burnedLp)
      const tokenDataPromises = validAddresses.map(async (tokenAddr) => {
        try {
          // Get pair address
          const pair = await AuctionContract.getPairAddress(tokenAddr).catch(() => ethers.ZeroAddress);
          
          // Create token contract for metadata
          const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, runner);
          
          // Fetch name, symbol, and burned LP in parallel
          const [name, symbol, burnedLpData] = await Promise.all([
            tokenContract.name().catch(() => null),
            tokenContract.symbol().catch(() => null),
            (async () => {
              if (!pair || pair === ethers.ZeroAddress) return 0;
              try {
                const lpContract = new ethers.Contract(pair, ERC20_ABI, runner);
                const [balanceRaw, decimals] = await Promise.all([
                  lpContract.balanceOf(burnAddress).catch(() => 0n),
                  lpContract.decimals().catch(() => 18)
                ]);
                const formatted = Number(ethers.formatUnits(balanceRaw, decimals));
                return Math.floor(Number.isFinite(formatted) ? formatted : 0);
              } catch {
                return 0;
              }
            })()
          ]);
          
          return { token: tokenAddr, pair, name, symbol, burnedLp: burnedLpData };
        } catch {
          return { token: tokenAddr, pair: ethers.ZeroAddress, name: null, symbol: null, burnedLp: 0 };
        }
      });
      
      const list = await Promise.all(tokenDataPromises);
      setTokens(list);
    } catch (e) {
      console.warn("Failed to load tokens", e);
    }
  };

  useEffect(() => {
    refreshTokens();
  }, [AuctionContract]);

  const deployToken = async (e) => {
    e.preventDefault();
    if (!AuctionContract) {
      toast.error("Auction contract not ready", { duration: 5000 });
      return;
    }
    // Governance pre-check to avoid opaque estimateGas failures
    try {
      const gov = (await AuctionContract.governanceAddress?.()) || null;
      const me = (account || '').toLowerCase?.();
      if (!gov || me !== gov.toLowerCase()) {
        toast.error(`Only governance can deploy. Governance: ${gov || '—'}`, { duration: 8000 });
        return;
      }
    } catch {}
    // Validate hash: 4 alphanumeric uppercase
    const hash = (deployForm.hash || "").toUpperCase();
    if (!/^([A-Z0-9]{4})$/.test(hash)) {
      toast.error("Hash must be 4 characters [A-Z0-9]", { duration: 5000 });
      return;
    }
    setLoading(true);
    try {
  const name = `PUL - ${hash}`;
      const symbol = `p${hash}`;
      // Simulate to catch revert reasons before sending
      try {
        await AuctionContract.deployTokenOneClick.staticCall(name, symbol);
      } catch (simErr) {
        const reason = simErr?.reason || simErr?.shortMessage || simErr?.message || 'Simulation failed';
        // If it's an opaque CALL_EXCEPTION from RPC, allow proceeding; else surface and abort
        const opaque = simErr?.code === 'CALL_EXCEPTION' && !simErr?.data && !simErr?.reason;
        if (!opaque) {
          toast.error(reason.includes('NotGovernance') ? 'Only governance can deploy' : reason, { duration: 8000 });
          setLoading(false);
          return;
        }
      }
      // Provide conservative gas limit to avoid estimateGas CALL_EXCEPTION
      let tx;
      try {
        tx = await AuctionContract.deployTokenOneClick(name, symbol, { gasLimit: 1200000n });
      } catch {
        tx = await AuctionContract.deployTokenOneClick(name, symbol);
      }
      toast.success(`Deploy tx sent: ${tx.hash}`, { duration: 12000 });
      const rc = await tx.wait();
      toast.success("Token deployed successfully", { duration: 12000 });
      // Try to parse event or refresh
      await refreshTokens();
      // Generate a new suggestion for next deployment
      setDeployForm({ hash: generateHash() });
    } catch (err) {
      const msg = err?.shortMessage || err?.message || "Failed to deploy token";
      toast.error(msg, { duration: 6000 });
    } finally {
      setLoading(false);
    }
  };

  const createPool = async (e) => {
    e.preventDefault();
    if (!AuctionContract) return alert("Auction contract not ready");
    let token, tokenWei, stateWei;
    try {
      token = poolForm.token;
      if (!ethers.isAddress(token)) return alert("Invalid token address");
      tokenWei = ethers.parseEther(poolForm.tokenAmount || "0");
      stateWei = ethers.parseEther(poolForm.stateAmount || "0");
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch {
      return alert("Invalid amount format");
    }
    setLoading(true);
    try {
      const tx = await AuctionContract.createPoolOneClick(token, tokenWei, stateWei);
      alert(`Create pool tx: ${tx.hash}`);
      await tx.wait();
      await refreshTokens();
      setPoolForm({ token: "", tokenAmount: "", stateAmount: "" });
    } catch (err) {
      alert(err.message || "Failed to create pool");
    } finally {
      setLoading(false);
    }
  };

  const copy = async (txt) => {
    try { await navigator.clipboard.writeText(txt); alert("Copied"); } catch {}
  };

  const addToMetaMask = async (addr) => {
    try {
      if (!ethers.isAddress(addr)) return;
      // Query on-chain metadata to avoid symbol mismatch
      const ERC20_META = [
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)"
      ];
      const runner = AuctionContract?.runner || undefined;
      const erc = new ethers.Contract(addr, ERC20_META, runner);
      let symbol = "TOKEN";
      let decimals = 18;
      try { symbol = await erc.symbol(); } catch {}
      try { decimals = Number(await erc.decimals()); } catch {}
      await window.ethereum?.request?.({
        method: "wallet_watchAsset",
        params: { type: "ERC20", options: { address: addr, symbol, decimals } },
      });
    } catch {}
  };

  const addLiquidity = async (e) => {
    e.preventDefault();
    if (!LiquidityManager) return alert("LiquidityManager contract not available");
    let token, tokenWei, stateWei;
    try {
      token = addLiquidityForm.token;
      if (!ethers.isAddress(token)) return alert("Invalid token address");
      tokenWei = ethers.parseEther(addLiquidityForm.tokenAmount || "0");
      stateWei = ethers.parseEther(addLiquidityForm.stateAmount || "0");
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch {
      return alert("Invalid amount format");
    }
    setLoading(true);
    try {
      const tx = await LiquidityManager.addLiquidityToExistingPool(token, tokenWei, stateWei);
      alert(`Add liquidity tx: ${tx.hash}`);
      await tx.wait();
      await refreshTokens();
      setAddLiquidityForm({ token: "", tokenAmount: "", stateAmount: "" });
      setAllowanceStatus({ token: null, state: null, checking: false }); // Reset allowance status
    } catch (err) {
      alert(err.message || "Failed to add liquidity");
    } finally {
      setLoading(false);
    }
  };

  const checkAllowances = async () => {
    const tokenAddr = allowanceForm.token;
    if (!ethers.isAddress(tokenAddr)) return alert("Invalid token address");
    if (!AuctionContract || !LiquidityManager || !stateTokenAddress) {
      return alert("Contracts not ready");
    }

    setAllowanceStatus({ token: null, state: null, checking: true });
    
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const swapVaultAddr = AuctionContract.target;

      // Create ERC20 contract instances to check allowances
      const ERC20_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];
      const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, AuctionContract.runner);
      const stateContract = new ethers.Contract(stateTokenAddress, ERC20_ABI, AuctionContract.runner);

      const [tokenAllowance, stateAllowance] = await Promise.all([
        tokenContract.allowance(swapVaultAddr, liquidityManagerAddr),
        stateContract.allowance(swapVaultAddr, liquidityManagerAddr)
      ]);

      const SUFFICIENT_ALLOWANCE = ethers.parseEther("1000000000"); // 1B tokens
      
      setAllowanceStatus({
        token: tokenAllowance >= SUFFICIENT_ALLOWANCE,
        state: stateAllowance >= SUFFICIENT_ALLOWANCE,
        checking: false
      });
    } catch (err) {
      console.error("Failed to check allowances:", err);
      alert("Failed to check allowances: " + (err.message || "Unknown error"));
      setAllowanceStatus({ token: null, state: null, checking: false });
    }
  };

  const setupAllowance = async (tokenAddr, isStateToken = false) => {
    if (!AuctionContract || !LiquidityManager) return alert("Contracts not ready");
    
    setLoading(true);
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const tx = await AuctionContract.setVaultAllowance(
        tokenAddr,
        liquidityManagerAddr,
        ethers.MaxUint256
      );
      alert(`Setting allowance tx: ${tx.hash}\nWait for confirmation...`);
      await tx.wait();
      alert(`✅ Allowance set successfully for ${isStateToken ? 'STATE' : 'Token'}!`);
      
      // Re-check allowances
      await checkAllowances();
    } catch (err) {
      alert("Failed to set allowance: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // Modal functions for token-specific liquidity management
  const openLiquidityModal = async (token) => {
    setSelectedToken(token);
    setShowModal(true);
    // Prefill token amount to 100,000,000 (100 million) and leave STATE blank
    setModalLiquidityForm({ tokenAmount: "100000000", stateAmount: "" });
    // Fetch token meta and current pool ratio
    fetchModalTokenInfo(token.token);
    // Resolve governance and set local guard
    try {
      const gov = await AuctionContract?.governanceAddress?.();
      setModalMeta(prev => ({ ...prev, governance: gov || null }));
      const me = account?.toLowerCase?.();
      const allow = me && ADMIN_ALLOWLIST.includes(me);
      setIsGov(Boolean(allow || (me && gov && me === gov.toLowerCase())));
    } catch {
      setIsGov(false);
    }
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedToken(null);
    setModalAllowanceStatus({ token: null, state: null, checking: false });
    setModalLiquidityForm({ tokenAmount: "", stateAmount: "" });
    setModalMeta({ loading: false, name: null, symbol: null, ratio: null, ratioLoading: false, ratioErr: null });
  };

  const fetchModalTokenInfo = async (tokenAddr) => {
    if (!ethers.isAddress(tokenAddr)) return;
    setModalMeta(prev => ({ ...prev, loading: true, ratioLoading: true, ratioErr: null }));
    try {
      // Fetch ERC20 name/symbol with minimal ABI
      const ERC20_META_ABI = [
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
        "function balanceOf(address) view returns (uint256)"
      ];
      const runner = AuctionContract?.runner || undefined;
      const erc = new ethers.Contract(tokenAddr, ERC20_META_ABI, runner);
      let name = null, symbol = null;
      try { name = await erc.name(); } catch {}
      try { symbol = await erc.symbol(); } catch {}
      let tokenDecimals = 18;
      try { tokenDecimals = Number(await erc.decimals()); } catch {}

      // Fetch ratio from Auction contract
      let ratio = null;
      try {
        if (AuctionContract?.getRatioPrice) {
          const raw = await AuctionContract.getRatioPrice(tokenAddr);
          ratio = ethers.formatEther(raw);
        }
      } catch (e) {
        console.warn("Failed to fetch ratio", e);
      }

      // Fetch STATE meta and balances from vault (swap address)
      const swapAddr = AuctionContract?.target;
      let stateDecimals = 18;
      let vaultTokenBal = null;
      let vaultStateBal = null;
      try {
        if (stateTokenAddress && ethers.isAddress(stateTokenAddress) && swapAddr) {
          const stateCtr = new ethers.Contract(stateTokenAddress, ERC20_META_ABI, runner);
          try { stateDecimals = Number(await stateCtr.decimals()); } catch {}
          try { vaultTokenBal = await erc.balanceOf(swapAddr); } catch {}
          try { vaultStateBal = await stateCtr.balanceOf(swapAddr); } catch {}
        }
      } catch {}

      // Fetch factory/router and verify pair exists
      let factory = null, router = null, factoryPair = null;
      try {
        factory = await AuctionContract?.pulseXFactory?.();
        router = await AuctionContract?.pulseXRouter?.();
        if (factory && ethers.isAddress(factory)) {
          const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
          const fac = new ethers.Contract(factory, FACTORY_ABI, runner);
          // If state token unknown skip
          if (stateTokenAddress && ethers.isAddress(stateTokenAddress)) {
            try { factoryPair = await fac.getPair(tokenAddr, stateTokenAddress); } catch {}
          }
        }
      } catch {}

      setModalMeta(prev => ({ 
        ...prev,
        loading: false,
        name,
        symbol,
        ratio,
        ratioLoading: false,
        ratioErr: null,
        tokenDecimals,
        stateDecimals,
        vaultTokenBal,
        vaultStateBal,
        factory,
        router,
        factoryPair
      }));
    } catch (e) {
      setModalMeta(prev => ({ ...prev, loading: false, name: null, symbol: null, ratio: null, ratioLoading: false, ratioErr: e?.message || "Failed to load" }));
    }
  };

  const checkModalAllowances = async (tokenAddr) => {
    if (!ethers.isAddress(tokenAddr)) return;
    if (!AuctionContract || !LiquidityManager || !stateTokenAddress) return;

    setModalAllowanceStatus({ token: null, state: null, checking: true });
    
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const swapVaultAddr = AuctionContract.target;

      const ERC20_ABI = ["function allowance(address owner, address spender) view returns (uint256)"];
      const tokenContract = new ethers.Contract(tokenAddr, ERC20_ABI, AuctionContract.runner);
      const stateContract = new ethers.Contract(stateTokenAddress, ERC20_ABI, AuctionContract.runner);

      const [tokenAllowance, stateAllowance] = await Promise.all([
        tokenContract.allowance(swapVaultAddr, liquidityManagerAddr),
        stateContract.allowance(swapVaultAddr, liquidityManagerAddr)
      ]);

      const SUFFICIENT_ALLOWANCE = ethers.parseEther("1000000000");
      
      setModalAllowanceStatus({
        token: tokenAllowance >= SUFFICIENT_ALLOWANCE,
        state: stateAllowance >= SUFFICIENT_ALLOWANCE,
        checking: false
      });
    } catch (err) {
      console.error("Failed to check allowances:", err);
      setModalAllowanceStatus({ token: null, state: null, checking: false });
    }
  };

  const setupModalAllowance = async (tokenAddr, isStateToken = false) => {
    if (!AuctionContract || !LiquidityManager) return alert("Contracts not ready");
    
    setLoading(true);
    try {
      const liquidityManagerAddr = LiquidityManager.target;
      const tx = await AuctionContract.setVaultAllowance(
        tokenAddr,
        liquidityManagerAddr,
        ethers.MaxUint256
      );
      alert(`Setting allowance tx: ${tx.hash}\nWait for confirmation...`);
      await tx.wait();
      alert(`✅ Allowance set successfully for ${isStateToken ? 'STATE' : 'Token'}!`);
      
      // Re-check allowances in modal
      if (selectedToken) {
        await checkModalAllowances(selectedToken.token);
      }
    } catch (err) {
      alert("Failed to set allowance: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  const addLiquidityFromModal = async (e) => {
    e.preventDefault();
  if (!AuctionContract || !selectedToken) return alert("Contract not ready or no token selected");
    
    console.log("=== ADD LIQUIDITY DEBUG START ===");
    console.log("Selected Token:", selectedToken.token);
    console.log("Pool Pair:", selectedToken.pair);
    console.log("Account:", account);
    console.log("SWAP Address:", AuctionContract.target);
    console.log("STATE Token:", stateTokenAddress);
    
    // CRITICAL NETWORK CHECK
    try {
      const provider = AuctionContract.runner?.provider;
      if (provider) {
        const network = await provider.getNetwork();
        console.log("Connected Network:", {
          name: network.name,
          chainId: network.chainId.toString()
        });
        
        if (network.chainId !== 369n) {
          return alert(`Wrong network!\nConnected to chain ID: ${network.chainId}\nExpected: 369 (PulseChain)\n\nPlease switch to PulseChain in your wallet.`);
        }
      }
    } catch (netErr) {
      console.error("Network check failed:", netErr);
      return alert("Failed to verify network. Please ensure you're connected to PulseChain.");
    }
    
    try {
      const gov = (modalMeta.governance || (await AuctionContract.governanceAddress()) || '').toLowerCase();
      console.log("Governance Address:", gov);
      const me = (account || '').toLowerCase();
      const allowed = me && (me === gov || ADMIN_ALLOWLIST.includes(me));
      if (!allowed) {
        return alert("Only governance can add liquidity from the vault\nGovernance: " + gov + "\nConnected: " + account);
      }
      // Check caller native PLS balance to avoid wallet-side failures on gas pre-check
      try {
        const provider = AuctionContract.runner?.provider;
        if (provider && account) {
          const pls = await provider.getBalance(account);
          console.log("Caller PLS balance:", ethers.formatEther(pls));
          if (pls < ethers.parseEther("0.01")) {
            alert("Warning: Very low PLS balance on caller. Transactions may fail due to gas. Consider adding PLS.");
          }
        }
      } catch {}
    } catch (govErr) {
      console.error("Failed to check governance:", govErr);
      return alert("Failed to verify governance: " + govErr.message);
    }
    
    let tokenWei, stateWei;
    try {
      const tDec = modalMeta.tokenDecimals ?? 18;
      const sDec = modalMeta.stateDecimals ?? 18;
      console.log("Token Decimals:", tDec, "State Decimals:", sDec);
      tokenWei = ethers.parseUnits(modalLiquidityForm.tokenAmount || "0", tDec);
      stateWei = ethers.parseUnits(modalLiquidityForm.stateAmount || "0", sDec);
      console.log("Token Amount (wei):", tokenWei.toString());
      console.log("State Amount (wei):", stateWei.toString());
      if (tokenWei <= 0n || stateWei <= 0n) return alert("Enter amounts > 0");
    } catch (parseErr) {
      console.error("Parse error:", parseErr);
      return alert("Invalid amount format: " + parseErr.message);
    }
    
    setLoading(true);
    try {
      // Preflight checks with detailed logging
      const ERC20_ABI_BAL = ["function balanceOf(address) view returns (uint256)"];
      const runner = AuctionContract?.runner || undefined;
      const swapAddr = AuctionContract.target;
      const tokenCtr = new ethers.Contract(selectedToken.token, ERC20_ABI_BAL, runner);
      const stateCtr = new ethers.Contract(stateTokenAddress, ERC20_ABI_BAL, runner);
      
      const [balToken, balState] = await Promise.all([
        tokenCtr.balanceOf(swapAddr),
        stateCtr.balanceOf(swapAddr)
      ]);
      
      console.log("Vault Token Balance:", ethers.formatUnits(balToken, modalMeta.tokenDecimals ?? 18));
      console.log("Vault STATE Balance:", ethers.formatUnits(balState, modalMeta.stateDecimals ?? 18));
      console.log("Requested Token:", ethers.formatUnits(tokenWei, modalMeta.tokenDecimals ?? 18));
      console.log("Requested STATE:", ethers.formatUnits(stateWei, modalMeta.stateDecimals ?? 18));
      
      if (balToken < tokenWei) {
        return alert(`Vault has insufficient token balance\nHas: ${ethers.formatUnits(balToken, modalMeta.tokenDecimals ?? 18)}\nNeeds: ${ethers.formatUnits(tokenWei, modalMeta.tokenDecimals ?? 18)}`);
      }
      if (balState < stateWei) {
        return alert(`Vault has insufficient STATE balance\nHas: ${ethers.formatUnits(balState, modalMeta.stateDecimals ?? 18)}\nNeeds: ${ethers.formatUnits(stateWei, modalMeta.stateDecimals ?? 18)}`);
      }
      
      // Verify factory pair exists
      if (modalMeta.factory) {
        const FACTORY_ABI = ["function getPair(address,address) view returns (address)"];
        const fac = new ethers.Contract(modalMeta.factory, FACTORY_ABI, runner);
        const pair = await fac.getPair(selectedToken.token, stateTokenAddress);
        console.log("Factory Pair:", pair);
        if (!pair || pair === ethers.ZeroAddress) {
          return alert("No pool at factory for this token/STATE\nFactory: " + modalMeta.factory);
        }
      }

      const hasSwapAdd = typeof AuctionContract.addLiquidityToPool === 'function';
      const hasLmAdd = typeof LiquidityManager?.addLiquidityToExistingPool === 'function';
      if (!hasSwapAdd && !hasLmAdd) {
        return alert("Neither SWAP.addLiquidityToPool nor LiquidityManager.addLiquidityToExistingPool is available. Check ABI/address configuration.");
      }

      // CRITICAL: Verify contract is deployed and has code
      console.log("=== Contract Deployment Verification ===");
      try {
        const provider = AuctionContract.runner?.provider;
        if (provider) {
          const code = await provider.getCode(AuctionContract.target);
          console.log("Contract code at", AuctionContract.target, ":", code.substring(0, 100) + "...");
          console.log("Contract code length:", code.length);
          
          if (code === '0x' || code.length <= 2) {
            const network = await provider.getNetwork();
            return alert(
              "❌ SWAP CONTRACT NOT DEPLOYED!\n\n" +
              "Address: " + AuctionContract.target + "\n" +
              "Network: " + network.name + " (Chain ID: " + network.chainId + ")\n\n" +
              "This address has NO CODE on this network.\n\n" +
              "Solutions:\n" +
              "1. Switch to PulseChain Mainnet (Chain ID 369)\n" +
              "2. Verify the contract is deployed on this network\n" +
              "3. Update the contract address in your configuration"
            );
          }
          console.log("✅ Contract has code deployed");
        }
      } catch (codeErr) {
        console.error("Failed to verify contract deployment:", codeErr);
        return alert("Failed to check contract deployment: " + codeErr.message + "\n\nThis usually means network connectivity issues.");
      }

      // If we're falling back to LiquidityManager path, ensure allowances are set
      try {
        const useLm = !hasSwapAdd && hasLmAdd;
        if (useLm) {
          await checkModalAllowances(selectedToken.token);
          if (!modalAllowanceStatus.token || !modalAllowanceStatus.state) {
            const setNow = window.confirm(
              "Vault allowances for LiquidityManager are not sufficient.\n\n" +
              "Do you want to set unlimited allowances now?"
            );
            if (setNow) {
              await setupModalAllowance(selectedToken.token, false);
              if (stateTokenAddress) {
                await setupModalAllowance(stateTokenAddress, true);
              }
            } else {
              return alert("Please set allowances for both Token and STATE from SWAP vault to LiquidityManager.");
            }
          }
        }
      } catch (allowErr) {
        console.warn("Allowance preflight failed:", allowErr);
      }

      // Additional validation checks that match contract requirements
      console.log("=== Pre-flight Contract Requirement Checks ===");
      
      // Check 1: Token cannot be STATE token
      if (selectedToken.token.toLowerCase() === stateTokenAddress.toLowerCase()) {
        return alert("Invalid: Token cannot be the STATE token itself");
      }
      
      // Check 2: Verify router and factory are set
      let routerAddr, factoryAddr;
      try {
        routerAddr = await AuctionContract.pulseXRouter();
        factoryAddr = await AuctionContract.pulseXFactory();
        console.log("Router from contract:", routerAddr);
        console.log("Factory from contract:", factoryAddr);
        
        if (!routerAddr || routerAddr === ethers.ZeroAddress) {
          return alert("Router not configured in SWAP contract. Contact governance.");
        }
        if (!factoryAddr || factoryAddr === ethers.ZeroAddress) {
          return alert("Factory not configured in SWAP contract. Contact governance.");
        }
      } catch (err) {
        console.error("Failed to fetch router/factory:", err);
        return alert("Failed to verify router/factory configuration: " + err.message);
      }

      // Now that we have routerAddr/factoryAddr, verify their bytecode presence along with the Pair
      try {
        const provider = AuctionContract.runner?.provider;
        if (provider) {
          if (routerAddr && ethers.isAddress(routerAddr)) {
            const rCode = await provider.getCode(routerAddr);
            console.log("Router code len:", rCode?.length || 0);
            if (!rCode || rCode === '0x' || rCode.length <= 2) {
              return alert(
                "❌ PulseX Router has no code at this address on the connected network.\n" +
                "Router: " + routerAddr
              );
            }
          }
          if (factoryAddr && ethers.isAddress(factoryAddr)) {
            const fCode = await provider.getCode(factoryAddr);
            console.log("Factory code len:", fCode?.length || 0);
            if (!fCode || fCode === '0x' || fCode.length <= 2) {
              return alert(
                "❌ PulseX Factory has no code at this address on the connected network.\n" +
                "Factory: " + factoryAddr
              );
            }
          }
          if (selectedToken?.pair && ethers.isAddress(selectedToken.pair)) {
            const pCode = await provider.getCode(selectedToken.pair);
            console.log("Pair code len:", pCode?.length || 0);
            if (!pCode || pCode === '0x' || pCode.length <= 2) {
              return alert(
                "❌ Pair address has no code on the connected network.\n" +
                "Pair: " + selectedToken.pair
              );
            }
          }
        }
      } catch (byteErr) {
        console.error("Bytecode presence check failed:", byteErr);
        return alert("Failed to verify on-chain code presence: " + (byteErr.message || String(byteErr)));
      }
      
      // Check 3: Verify pool exists and has reserves
      let poolRatioWarning = null;
      try {
        const PAIR_ABI = [
          "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
          "function token0() view returns (address)",
          "function token1() view returns (address)"
        ];
        const pairContract = new ethers.Contract(selectedToken.pair, PAIR_ABI, runner);
        const [reserve0, reserve1] = await pairContract.getReserves();
        const token0 = await pairContract.token0();
        const token1 = await pairContract.token1();
        
        console.log("Pool token0:", token0);
        console.log("Pool token1:", token1);
        console.log("Pool reserve0:", reserve0.toString());
        console.log("Pool reserve1:", reserve1.toString());
        
        if (reserve0 === 0n || reserve1 === 0n) {
          return alert("Pool has no liquidity. Cannot add to empty pool. Create pool first.");
        }
        
        // CRITICAL: Check if input amounts match pool ratio (within 5% tolerance)
        // This prevents INSUFFICIENT_LIQUIDITY_MINTED errors
        const stateAddr = (await AuctionContract.stateToken()).toLowerCase();
        const tokenAddr = selectedToken.token.toLowerCase();
        
        let tokenReserve, stateReserve;
        if (token0.toLowerCase() === tokenAddr) {
          tokenReserve = reserve0;
          stateReserve = reserve1;
        } else {
          tokenReserve = reserve1;
          stateReserve = reserve0;
        }
        
        console.log("Token reserve:", tokenReserve.toString());
        console.log("STATE reserve:", stateReserve.toString());
        console.log("Your token amount:", tokenWei.toString());
        console.log("Your STATE amount:", stateWei.toString());
        
        // Calculate pool ratio and your ratio
        // Pool ratio: stateReserve / tokenReserve (how much STATE per 1 token)
        // Your ratio: stateWei / tokenWei
        const poolRatio = (stateReserve * 10000n) / tokenReserve; // Multiply by 10000 for precision
        const yourRatio = (stateWei * 10000n) / tokenWei;
        
        console.log("Pool ratio (STATE per token × 10000):", poolRatio.toString());
        console.log("Your ratio (STATE per token × 10000):", yourRatio.toString());
        
        // Calculate percentage difference
        const ratioDiff = poolRatio > yourRatio 
          ? ((poolRatio - yourRatio) * 100n) / poolRatio
          : ((yourRatio - poolRatio) * 100n) / poolRatio;
        
        console.log("Ratio difference %:", ratioDiff.toString());
        
        // Warn if ratio difference exceeds 5%
        if (ratioDiff > 5n) {
          const optimalState = (tokenWei * stateReserve) / tokenReserve;
          const optimalToken = (stateWei * tokenReserve) / stateReserve;
          
          poolRatioWarning = 
            "⚠️ RATIO MISMATCH WARNING\n\n" +
            "Your input ratio doesn't match the pool ratio.\n" +
            "This will cause the router to use less of one token and may trigger slippage protection.\n\n" +
            "Pool ratio: " + ethers.formatUnits(poolRatio, 4) + " STATE per 1 token\n" +
            "Your ratio: " + ethers.formatUnits(yourRatio, 4) + " STATE per 1 token\n" +
            "Difference: " + ratioDiff.toString() + "%\n\n" +
            "OPTIMAL AMOUNTS (choose one):\n" +
            "Option 1: Use your token amount (" + tokenAmount + ")\n" +
            "  → Optimal STATE: " + ethers.formatUnits(optimalState, modalMeta.stateDecimals) + "\n\n" +
            "Option 2: Use your STATE amount (" + stateAmount + ")\n" +
            "  → Optimal token: " + ethers.formatUnits(optimalToken, modalMeta.tokenDecimals) + "\n\n" +
            "Do you want to continue anyway?";
          
          console.warn(poolRatioWarning);
          
          const proceed = window.confirm(poolRatioWarning);
          if (!proceed) {
            return;
          }
        }
      } catch (poolErr) {
        console.error("Pool check failed:", poolErr);
        return alert("Failed to verify pool state: " + poolErr.message);
      }

      // Simulate to catch revert reason before sending (prefer SWAP, fallback LM)
      console.log("Running staticCall simulation...");
      let proceedDespiteSimFailure = false;
      try {
        if (hasSwapAdd) {
          const simResult = await AuctionContract.addLiquidityToPool.staticCall(
            selectedToken.token,
            tokenWei,
            stateWei
          );
          console.log("✅ Simulation successful on SWAP! Liquidity:", simResult.toString());
        } else if (hasLmAdd) {
          const simResult = await LiquidityManager.addLiquidityToExistingPool.staticCall(
            selectedToken.token,
            tokenWei,
            stateWei
          );
          console.log("✅ Simulation successful on LiquidityManager! Liquidity:", simResult.toString());
        }
      } catch (simErr) {
        console.error("❌ Simulation failed:", simErr);
        console.error("Error object:", JSON.stringify(simErr, null, 2));
        console.error("Error name:", simErr.name);
        console.error("Error message:", simErr.message);
        console.error("Error data:", simErr.data);
        console.error("Error code:", simErr.code);
        console.error("Error reason:", simErr.reason);
        console.error("Error action:", simErr.action);
        console.error("Error transaction:", simErr.transaction);
        
        let errorMsg = "Transaction would fail:\n\n";
        
        // Check for specific contract errors
        if (simErr.message.includes("ZeroAddr") || simErr.reason === "ZeroAddr") {
          errorMsg += "Zero address detected. Check token and STATE addresses.";
        } else if (simErr.message.includes("InvalidParam") || simErr.reason === "InvalidParam") {
          errorMsg += "Invalid parameter. Pool may not exist or token equals STATE.";
        } else if (simErr.message.includes("AmountZero") || simErr.reason === "AmountZero") {
          errorMsg += "Amount cannot be zero. Check input amounts.";
        } else if (simErr.message.includes("InsufficientVault") || simErr.reason === "InsufficientVault") {
          errorMsg += "Vault has insufficient balance for requested amounts.";
        } else if (simErr.message.includes("NotGovernance") || simErr.reason === "NotGovernance") {
          errorMsg += "Only governance can call this function.\nGovernance: " + modalMeta.governance + "\nYou: " + account;
        } else if (simErr.message.includes("TRANSFER_FAILED")) {
          errorMsg += "Token transfer failed. Router may need allowance.";
        } else if (simErr.message.includes("INSUFFICIENT_LIQUIDITY_MINTED")) {
          errorMsg += "Insufficient liquidity would be minted. Try larger amounts or balance ratio.";
        } else if (simErr.message.includes("INSUFFICIENT")) {
          errorMsg += "Insufficient amount. Check pool ratio and amounts.";
        } else if (simErr.data) {
          errorMsg += "Contract revert data: " + simErr.data;
        } else if (simErr.reason) {
          errorMsg += simErr.reason;
        } else if (simErr.shortMessage) {
          errorMsg += simErr.shortMessage;
        } else {
          errorMsg += simErr.message || "Unknown error during simulation";
        }
        
        errorMsg += "\n\nCheck console for detailed logs.";
        // Allow bypassing opaque RPC failures (CALL_EXCEPTION with no data/reason) if all preflights passed
        const isOpaqueCallException = simErr?.code === 'CALL_EXCEPTION' && !simErr?.data && !simErr?.reason;
        if (isOpaqueCallException) {
          const confirmSend = window.confirm(
            "Simulation couldn't retrieve a revert reason (often an RPC issue).\n" +
            "All preflight checks passed. Do you want to send the transaction anyway?"
          );
          if (confirmSend) {
            proceedDespiteSimFailure = true;
          } else {
            alert(errorMsg);
            return;
          }
        } else {
          alert(errorMsg);
          return;
        }
      }

      console.log("Sending actual transaction...");
      // Provide a conservative gasLimit to avoid estimateGas CALL_EXCEPTION
      let tx;
      try {
        if (hasSwapAdd) {
          tx = await AuctionContract.addLiquidityToPool(
            selectedToken.token,
            tokenWei,
            stateWei,
            { gasLimit: 3000000n }
          );
        } else {
          tx = await LiquidityManager.addLiquidityToExistingPool(
            selectedToken.token,
            tokenWei,
            stateWei,
            { gasLimit: 3000000n }
          );
        }
      } catch (sendPrepErr) {
        console.warn("Direct send with gasLimit failed, retrying without override...", sendPrepErr);
        if (hasSwapAdd) {
          tx = await AuctionContract.addLiquidityToPool(
            selectedToken.token,
            tokenWei,
            stateWei
          );
        } else {
          tx = await LiquidityManager.addLiquidityToExistingPool(
            selectedToken.token,
            tokenWei,
            stateWei
          );
        }
      }
      console.log("Transaction sent:", tx.hash);
      alert(`Add liquidity tx: ${tx.hash}\nWait for confirmation...`);
      
      const receipt = await tx.wait();
      console.log("Transaction receipt:", receipt);
      console.log("Transaction status:", receipt.status);
      
      if (receipt.status === 0) {
        // Transaction was mined but reverted
        console.error("❌ Transaction REVERTED on-chain");
        console.error("Block number:", receipt.blockNumber);
        console.error("Gas used:", receipt.gasUsed.toString());
        
        // Try to get revert reason from the receipt
        let revertReason = "Transaction reverted (status=0)";
        try {
          // Attempt to replay the transaction to get the revert reason
          const code = await provider.call({
            to: tx.to,
            data: tx.data,
            from: tx.from
          }, receipt.blockNumber);
          console.log("Replay call result:", code);
        } catch (replayErr) {
          console.error("Replay error:", replayErr);
          if (replayErr.reason) revertReason = replayErr.reason;
          if (replayErr.data) {
            console.error("Revert data:", replayErr.data);
            // Try to decode revert data
            try {
              const iface = AuctionContract.interface;
              const decoded = iface.parseError(replayErr.data);
              if (decoded) {
                revertReason = decoded.name + ": " + decoded.args.toString();
              }
            } catch (decodeErr) {
              console.error("Could not decode revert data:", decodeErr);
            }
          }
        }
        
        throw new Error(
          "Transaction reverted on-chain.\n\n" +
          "Possible reasons:\n" +
          "• Pool ratio mismatch (use suggested optimal amounts)\n" +
          "• Insufficient vault balances\n" +
          "• Router allowance issues\n" +
          "• Slippage protection (5%) triggered\n\n" +
          "Revert reason: " + revertReason + "\n\n" +
          "Check browser console for detailed logs."
        );
      }
      
      console.log("✅ Transaction confirmed successfully!");
      alert(`✅ Liquidity added successfully!`);
      await refreshTokens();
      closeModal();
    } catch (err) {
      console.error("=== ADD LIQUIDITY FAILED ===");
      console.error("Error:", err);
      console.error("Error message:", err.message);
      console.error("Error code:", err.code);
      console.error("Error data:", err.data);
      console.error("Error reason:", err.reason);
      
      let detailedMsg = "Failed to add liquidity:\n";
      detailedMsg += err.shortMessage || err.reason || err.message || "Unknown error";
      alert(detailedMsg);
    } finally {
      setLoading(false);
      console.log("=== ADD LIQUIDITY DEBUG END ===");
    }
  };

  return (
    <>
      

      {/* Deploy Token Card */}
      <div className="card mb-4">
        <div className="card-header bg-primary bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-rocket-takeoff-fill me-2"></i>
            DEPLOY NEW TOKEN
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={deployToken}>
            <div className="row g-3 align-items-center">
              <div className="col-md-4">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-hash me-1"></i>
                  4-Character Hash
                </label>
                <div className="input-group">
                  <input
                    className="form-control text-uppercase"
                    value={deployForm.hash}
                    onChange={(e)=>{
                      const v = (e.target.value || "").toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,4);
                      setDeployForm(p=>({...p, hash: v}));
                    }}
                    placeholder="AB12"
                    maxLength={4}
                  />
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={()=> setDeployForm(p=>({...p, hash: generateHash()}))}
                    disabled={loading}
                    title="Regenerate Hash"
                  >
                    <i className="bi bi-shuffle"></i>
                  </button>
                </div>
                <small className="text-muted">Only A-Z and 0-9, exactly 4 characters</small>
              </div>

              <div className="col-md-4">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-tag-fill me-1"></i>
                  Token Name (Auto)
                </label>
                <input
                  className="form-control"
                  value={tokenName}
                  readOnly
                />
                <small className="text-muted">Format: PUL - {"{"}hash{"}"} (e.g., PUL - AB12)</small>
              </div>

              <div className="col-md-2">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-code-square me-1"></i>
                  Symbol (Auto)
                </label>
                <input
                  className="form-control text-uppercase"
                  value={tokenSymbol}
                  readOnly
                />
                <small className="text-muted">Format: p + hash</small>
              </div>

              <div className="col-md-2">
                <button 
                  className="btn btn-primary w-100 btn-lg" 
                  type="submit"
                  disabled={!canManage || loading || !/^([A-Z0-9]{4})$/.test((deployForm.hash||"").toUpperCase())}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"/>
                      Deploying...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-circle-fill me-2"></i>
                      Deploy Token
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Create Pool Card */}
      <div className="card mb-4">
        <div className="card-header bg-success bg-opacity-10">
          <h6 className="mb-0">
            <i className="bi bi-water me-2"></i>
            CREATE LIQUIDITY POOL
          </h6>
        </div>
        <div className="card-body">
          <form onSubmit={createPool}>
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-coin me-1"></i>
                  Token Address
                </label>
                <input 
                  className="form-control font-monospace" 
                  value={poolForm.token} 
                  onChange={(e)=>setPoolForm(p=>({...p,token:e.target.value}))} 
                  placeholder="0x..." 
                  required 
                />
              </div>
              <div className="col-md-3">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-cash-stack me-1"></i>
                  Token Amount
                </label>
                <input 
                  type="number" 
                  step="0.000000000000000001" 
                  className="form-control" 
                  value={poolForm.tokenAmount}
                  readOnly
                  placeholder="10000" 
                  required 
                />
              </div>
              <div className="col-md-2">
                <label className="form-label small fw-bold text-uppercase">
                  <i className="bi bi-wallet2 me-1"></i>
                  STATE Amount
                </label>
                <input 
                  type="number" 
                  step="0.000000000000000001" 
                  className="form-control" 
                  value={poolForm.stateAmount}
                  readOnly
                  placeholder="1000000" 
                  required 
                />
              </div>
              <div className="col-md-3">
                <button 
                  className="btn btn-primary w-100 btn-lg" 
                  type="submit"
                  disabled={!canManage || loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"/>
                      Creating...
                    </>
                  ) : (
                    <>
                      <i className="bi bi-plus-circle-fill me-2"></i>
                      Create Pool
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Tokens List with Add Liquidity Actions */}
      <div className="card">
        <div className="card-header d-flex justify-content-between align-items-center">
          <h6 className="mb-0">
            <i className="bi bi-list-ul me-2"></i>
            DEPLOYED TOKENS & LIQUIDITY MANAGEMENT
          </h6>
          <button 
            className="btn btn-sm btn-outline-secondary" 
            onClick={refreshTokens}
            disabled={!AuctionContract}
          >
            <i className="bi bi-arrow-clockwise me-1"></i>
            Refresh
          </button>
        </div>
        <div className="card-body">
          {tokens.length === 0 ? (
            <div className="text-center py-5">
              <div style={{fontSize: '3rem', opacity: 0.3}} className="mb-3">🪙</div>
              <h6 className="text-muted">No tokens deployed yet</h6>
              <p className="small text-muted mb-0">Deploy your first token using the form above</p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead>
                  <tr>
                    <th className="text-uppercase small">#</th>
                    <th className="text-uppercase small">Token</th>
                    <th className="text-uppercase small">Token Address</th>
                    <th className="text-uppercase small">Pool Address</th>
                    <th className="text-uppercase small">Pool Status</th>
                    <th className="text-uppercase small text-center">Add Liquidity</th>
                    <th className="text-uppercase small text-center">Burned LP</th>
                    <th className="text-uppercase small text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((t, idx) => (
                    <tr key={t.token}>
                      <td className="fw-bold">{idx+1}</td>
                      <td>
                        <div className="d-flex align-items-center gap-2">
                          <img
                            src={generateIdenticon(t.token)}
                            alt="token"
                            style={{ width: 24, height: 24, borderRadius: '50%' }}
                          />
                          <div className="d-flex flex-column">
                            <span className="fw-semibold">{t.name || 'Unknown Token'}</span>
                            <small className="text-muted">{t.symbol ? `(${t.symbol})` : ''}</small>
                          </div>
                        </div>
                      </td>
                      <td>
                        <code className="small">{t.token.slice(0, 6)}...{t.token.slice(-4)}</code>
                      </td>
                      <td>
                        {t.pair && t.pair !== ethers.ZeroAddress ? (
                          <code className="small text-success">{t.pair.slice(0, 6)}...{t.pair.slice(-4)}</code>
                        ) : (
                          <span className="text-muted small">—</span>
                        )}
                      </td>
                      <td>
                        {t.pair && t.pair !== ethers.ZeroAddress ? (
                          <span className="badge bg-success">
                            <i className="bi bi-check-circle-fill me-1"></i>
                            Pool Created
                          </span>
                        ) : (
                          <span className="badge bg-warning text-dark">
                            <i className="bi bi-exclamation-triangle-fill me-1"></i>
                            No Pool
                          </span>
                        )}
                      </td>
                      {/* Add Liquidity column */}
                      <td className="text-center">
                        {t.pair && t.pair !== ethers.ZeroAddress ? (
                          <button 
                            className="btn btn-sm btn-primary py-1 px-2" 
                            onClick={()=>openLiquidityModal(t)}
                            title="Add more liquidity"
                          >
                            <i className="bi bi-plus-circle-fill me-1"></i>
                            Add Liquidity
                          </button>
                        ) : (
                          <button className="btn btn-sm btn-outline-secondary py-1 px-2" disabled title="Pool not available">
                            Add Liquidity
                          </button>
                        )}
                      </td>
                      {/* Burned LP column */}
                      <td className="text-center">
                        <div className="mx-4">
                          {t.burnedLp > 0 ? (
                            <span className="fw-semibold">{t.burnedLp.toLocaleString()}</span>
                          ) : (
                            <span className="badge bg-success">NEW</span>
                          )}
                        </div>
                      </td>
                      <td>
                        <div className="d-flex gap-2 justify-content-center">
                          <button 
                            className="btn btn-sm btn-outline-primary" 
                            onClick={()=>copy(t.token)}
                            title="Copy token address"
                          >
                            <i className="bi bi-clipboard"></i>
                          </button>
                          <button 
                            className="btn btn-sm btn-outline-secondary" 
                            onClick={()=>addToMetaMask(t.token)}
                            title="Add to MetaMask"
                          >
                            <i className="bi bi-wallet2"></i>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Liquidity Management Modal */}
      {showModal && selectedToken && (
        <div 
          className="modal show d-block" 
          style={{backgroundColor: 'rgba(0,0,0,0.5)'}}
          onClick={closeModal}
        >
          <div 
            className="modal-dialog modal-lg modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content bg-dark text-light">
              <div className="modal-header bg-info bg-opacity-10 text-light">
                <h5 className="modal-title">
                  <i className="bi bi-plus-circle-fill me-2"></i>
                  Add Liquidity to Pool
                </h5>
                <button 
                  type="button" 
                  className="btn-close btn-close-white" 
                  onClick={closeModal}
                  disabled={loading}
                ></button>
              </div>
              
              <div className="modal-body">
                {/* Token Info */}
                <div className="alert alert-info mb-4">
                  <div className="row g-3 align-items-start">
                    {/* Left column: Token name, ratio, address */}
                    <div className="col-md-6">
                      <div className="mb-1"><strong>Token</strong></div>
                      <div>
                        {modalMeta.loading ? (
                          <span className="text-muted">Loading name…</span>
                        ) : (
                          <>
                            <span className="fw-semibold">{modalMeta.name || 'Unknown Token'}</span>
                            {modalMeta.symbol ? <span className="ms-2 text-muted">({modalMeta.symbol})</span> : null}
                          </>
                        )}
                      </div>
                      <div className="mt-3">
                        <div className="mb-1"><strong>Current Pool Ratio</strong></div>
                        {modalMeta.ratioLoading ? (
                          <div className="d-flex align-items-center text-muted"><span className="spinner-border spinner-border-sm me-2"/>Fetching…</div>
                        ) : modalMeta.ratio ? (
                          <div className="fs-6">
                            1&nbsp;{modalMeta.symbol || 'TOKEN'} ≈ <span className="fw-bold">{Number(modalMeta.ratio).toLocaleString(undefined,{maximumFractionDigits:6})}</span>&nbsp;STATE
                          </div>
                        ) : (
                          <div className="text-muted">N/A</div>
                        )}
                      </div>
                      <div className="mt-3">
                        <small className="text-muted">Address:</small><br/>
                        <code className="small">{selectedToken.token}</code>
                      </div>
                    </div>
                    {/* Right column: Pool, Factory, Router */}
                    <div className="col-md-6">
                      <div className="mb-1"><strong>Pool</strong></div>
                      <div>
                        <code className="small text-success">{selectedToken.pair}</code>
                      </div>
                      {(modalMeta.factory || modalMeta.router) && (
                        <div className="mt-3 small text-muted">
                          {modalMeta.factory && <div>Factory: <code>{modalMeta.factory}</code></div>}
                          {modalMeta.router && <div>Router: <code>{modalMeta.router}</code></div>}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Allowance section removed: calling SWAP addLiquidityToPool uses vault funds and internal allowances */}

                {/* Add Liquidity Form */}
                <div className="card">
                  <div className="card-header bg-success bg-opacity-10">
                    <h6 className="mb-0">
                      <i className="bi bi-droplet-fill me-2"></i>
                      Add Liquidity
                    </h6>
                  </div>
                  <div className="card-body">
                    <form onSubmit={addLiquidityFromModal}>
                      <div className="row g-3 mb-3">
                        <div className="col-md-6">
                          <label className="form-label fw-bold">
                            <i className="bi bi-coin me-1"></i>
                            Token Amount
                          </label>
                          <input 
                            type="number" 
                            step="0.000000000000000001"
                            className="form-control form-control-lg" 
                            value={modalLiquidityForm.tokenAmount}
                            onChange={(e) => setModalLiquidityForm(p => ({...p, tokenAmount: e.target.value}))}
                            placeholder="100000000"
                            required
                          />
                          <small className="text-muted">From SWAP vault</small>
                          <div className="d-flex gap-2 mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={!modalMeta.ratio || !(Number(modalLiquidityForm.tokenAmount) > 0)}
                              onClick={() => {
                                try {
                                  const r = Number(modalMeta.ratio);
                                  const t = Number(modalLiquidityForm.tokenAmount || 0);
                                  if (r > 0 && t > 0) {
                                    const s = (t * r).toString();
                                    setModalLiquidityForm(p => ({ ...p, stateAmount: s }));
                                  }
                                } catch {}
                              }}
                              title="Fill STATE based on current ratio"
                            >
                              Use ratio → STATE
                            </button>
                          </div>
                          {modalMeta.vaultTokenBal != null && (
                            <div className="small mt-1 text-muted">
                              Vault Token Balance: {(() => {
                                try {
                                  return ethers.formatUnits(modalMeta.vaultTokenBal, modalMeta.tokenDecimals ?? 18);
                                } catch { return '—'; }
                              })()}
                            </div>
                          )}
                        </div>
                        <div className="col-md-6">
                          <label className="form-label fw-bold">
                            <i className="bi bi-wallet2 me-1"></i>
                            STATE Amount
                          </label>
                          <input 
                            type="number" 
                            step="0.000000000000000001"
                            className="form-control form-control-lg" 
                            value={modalLiquidityForm.stateAmount}
                            onChange={(e) => setModalLiquidityForm(p => ({...p, stateAmount: e.target.value}))}
                            placeholder="5000.0"
                            required
                          />
                          <small className="text-muted">From SWAP vault</small>
                          <div className="d-flex gap-2 mt-2">
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-secondary"
                              disabled={!modalMeta.ratio || !(Number(modalLiquidityForm.stateAmount) > 0)}
                              onClick={() => {
                                try {
                                  const r = Number(modalMeta.ratio);
                                  const s = Number(modalLiquidityForm.stateAmount || 0);
                                  if (r > 0 && s > 0) {
                                    const t = (s / r).toString();
                                    setModalLiquidityForm(p => ({ ...p, tokenAmount: t }));
                                  }
                                } catch {}
                              }}
                              title="Fill TOKEN based on current ratio"
                            >
                              Use ratio → TOKEN
                            </button>
                          </div>
                          {modalMeta.vaultStateBal != null && (
                            <div className="small mt-1 text-muted">
                              Vault STATE Balance: {(() => {
                                try {
                                  return ethers.formatUnits(modalMeta.vaultStateBal, modalMeta.stateDecimals ?? 18);
                                } catch { return '—'; }
                              })()}
                            </div>
                          )}
                        </div>
                      </div>

                      <button 
                        type="submit"
                        className="btn btn-primary btn-lg w-100"
                        disabled={loading || !canManage || !isGov || !selectedToken?.pair || selectedToken.pair === ethers.ZeroAddress}
                      >
                        {loading ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2"/>
                            Adding Liquidity...
                          </>
                        ) : (
                          <>
                            <i className="bi bi-plus-circle-fill me-2"></i>
                            {isGov ? 'Add Liquidity to Pool' : 'Only governance can add liquidity'}
                          </>
                        )}
                      </button>
                    </form>
                  </div>
                </div>

                <div className="alert alert-info mt-3 mb-0">
                  <i className="bi bi-info-circle-fill me-2"></i>
                  <strong>Note:</strong> LP tokens will be automatically burned. Unused tokens return to SWAP vault.
                </div>
              </div>
              
              {/* Footer removed per request; header already has close (X) */}
            </div>
          </div>
        </div>
      )}

      
    </>
  );
}