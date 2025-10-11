#!/bin/bash

# =========================================================================
#         COMPREHENSIVE MAINNET DEPLOYMENT SCRIPT
# =========================================================================
# 
# This script deploys the complete SS Protocol ecosystem:
# - Core contracts: SWAP_V3, STATE_V3, DAV_V3
# - Support contracts: LPHelper, AuctionAdmin, AuctionMetrics, SwapLens
# - Buy & Burn system: BuyAndBurnController_V2
# - Airdrop system: AirdropDistributor
# 
# Usage: ./mainnet_deploy.sh
# 
# Prerequisites:
# - PRIVATE_KEY environment variable set
# - Sufficient ETH/PLS balance for deployment
# - forge installed and configured
# =========================================================================

set -e  # Exit on any error

echo "========================================="
echo "    MAINNET DEPLOYMENT SCRIPT V2.0"
echo "========================================="
echo "Deploy Date: $(date)"
echo "Deployer: $(cast wallet address $PRIVATE_KEY)"
echo ""

# =========================================================================
# CONFIGURATION
# =========================================================================

# Network Configuration - Update these for your target network
RPC_URL="${RPC_URL:-http://localhost:8545}"  # Default to local anvil
CHAIN_ID="${CHAIN_ID:-31337}"                # Default to anvil chain ID

# PulseChain Mainnet Configuration (uncomment for mainnet)
# RPC_URL="https://rpc.pulsechain.com"
# CHAIN_ID="369"

# Ethereum Mainnet Configuration (uncomment for mainnet)
# RPC_URL="https://eth.llamarpc.com"
# CHAIN_ID="1"

# PulseChain Testnet V4 Configuration (uncomment for testnet)
# RPC_URL="https://rpc.v4.testnet.pulsechain.com"
# CHAIN_ID="943"

# Protocol Configuration
GOVERNANCE="${GOVERNANCE:-0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266}"
DEV_WALLET="${DEV_WALLET:-0x70997970C51812dc3A010C7d01b50e0d17dc79C8}"
LIQUIDITY_WALLET="${LIQUIDITY_WALLET:-$GOVERNANCE}"
FIVE_RECIPIENT="${FIVE_RECIPIENT:-$GOVERNANCE}"
TREASURY="${TREASURY:-$GOVERNANCE}"

# DEX Configuration (PulseChain Mainnet)
ROUTER="${ROUTER:-0x165C3410fC91EF562C50559f7d2289fEbed552d9}"
FACTORY="${FACTORY:-0x29eA7545DEf87022BAdc76323F373EA1e707C523}"
WPLS="${WPLS:-0xA1077a294dDE1B09bB078844df40758a5D0f9a27}"

# Token Configuration
STATE_NAME="${STATE_NAME:-pSTATE}"
STATE_SYMBOL="${STATE_SYMBOL:-pSTATE}"
DAV_NAME="${DAV_NAME:-pDAV}"
DAV_SYMBOL="${DAV_SYMBOL:-pDAV}"

echo "=== DEPLOYMENT CONFIGURATION ==="
echo "Network RPC: $RPC_URL"
echo "Chain ID: $CHAIN_ID"
echo "Governance: $GOVERNANCE"
echo "Dev Wallet: $DEV_WALLET"
echo "Router: $ROUTER"
echo "Factory: $FACTORY"
echo "WPLS: $WPLS"
echo ""

# Verify prerequisites
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY environment variable not set"
    echo "   Export your private key: export PRIVATE_KEY=0x..."
    exit 1
fi

if ! command -v forge &> /dev/null; then
    echo "❌ Error: forge not found"
    echo "   Install Foundry: curl -L https://foundry.paradigm.xyz | bash"
    exit 1
fi

if ! command -v cast &> /dev/null; then
    echo "❌ Error: cast not found"
    echo "   Install Foundry: curl -L https://foundry.paradigm.xyz | bash"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq not found"
    echo "   Install jq: brew install jq"
    exit 1
fi

# Test RPC connection
echo "Testing RPC connection..."
BLOCK_NUMBER=$(cast block-number --rpc-url $RPC_URL 2>/dev/null || echo "")
if [ -z "$BLOCK_NUMBER" ]; then
    echo "❌ Error: Cannot connect to RPC at $RPC_URL"
    exit 1
fi
echo "✅ Connected to RPC (Block: $BLOCK_NUMBER)"

# Check deployer balance
DEPLOYER_ADDRESS=$(cast wallet address $PRIVATE_KEY)
BALANCE=$(cast balance $DEPLOYER_ADDRESS --rpc-url $RPC_URL)
BALANCE_ETH=$(cast to-unit $BALANCE ether)
echo "✅ Deployer balance: $BALANCE_ETH ETH"

if (( $(echo "$BALANCE_ETH < 0.1" | bc -l) )); then
    echo "⚠️  Warning: Low balance. You may need more ETH for deployment."
fi

echo ""

# =========================================================================
# STEP 1: DEPLOY CORE CONTRACTS
# =========================================================================

echo "=== STEP 1: DEPLOYING CORE CONTRACTS ==="

# Deploy SWAP_V3 (Main auction contract)
echo "1.1 Deploying SWAP_V3..."
SWAP=$(forge create src/AuctionSwap.sol:SWAP_V3 \
    --constructor-args $GOVERNANCE $DEV_WALLET \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$SWAP" = "null" ] || [ -z "$SWAP" ]; then
    echo "❌ SWAP_V3 deployment failed"
    exit 1
fi
echo "✅ SWAP_V3 deployed at: $SWAP"

# Deploy STATE_V3 (STATE token)
echo "1.2 Deploying STATE_V3..."
STATE=$(forge create src/StateToken.sol:STATE_V3 \
    --constructor-args "\"$STATE_NAME\"" "\"$STATE_SYMBOL\"" $FIVE_RECIPIENT $SWAP \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$STATE" = "null" ] || [ -z "$STATE" ]; then
    echo "❌ STATE_V3 deployment failed"
    exit 1
fi
echo "✅ STATE_V3 deployed at: $STATE"

# Deploy DAV_V3 (DAV token)
echo "1.3 Deploying DAV_V3..."
DAV=$(forge create src/DavToken.sol:DAV_V3 \
    --constructor-args $LIQUIDITY_WALLET $STATE $GOVERNANCE "\"$DAV_NAME\"" "\"$DAV_SYMBOL\"" \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$DAV" = "null" ] || [ -z "$DAV" ]; then
    echo "❌ DAV_V3 deployment failed"
    exit 1
fi
echo "✅ DAV_V3 deployed at: $DAV"

echo ""

# =========================================================================
# STEP 2: DEPLOY SUPPORT CONTRACTS
# =========================================================================

echo "=== STEP 2: DEPLOYING SUPPORT CONTRACTS ==="

# Deploy LPHelper
echo "2.1 Deploying LPHelper..."
LPHELPER=$(forge create src/LPHelper.sol:LPHelper \
    --constructor-args $ROUTER $FACTORY \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$LPHELPER" = "null" ] || [ -z "$LPHELPER" ]; then
    echo "❌ LPHelper deployment failed"
    exit 1
fi
echo "✅ LPHelper deployed at: $LPHELPER"

# Deploy AuctionAdmin
echo "2.2 Deploying AuctionAdmin..."
ADMIN=$(forge create src/AuctionAdmin.sol:AuctionAdmin \
    --constructor-args $SWAP \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$ADMIN" = "null" ] || [ -z "$ADMIN" ]; then
    echo "❌ AuctionAdmin deployment failed"
    exit 1
fi
echo "✅ AuctionAdmin deployed at: $ADMIN"

# Deploy AuctionMetrics
echo "2.3 Deploying AuctionMetrics..."
METRICS=$(forge create src/AuctionMetrics.sol:AuctionMetrics \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$METRICS" = "null" ] || [ -z "$METRICS" ]; then
    echo "❌ AuctionMetrics deployment failed"
    exit 1
fi
echo "✅ AuctionMetrics deployed at: $METRICS"

# Deploy SwapLens
echo "2.4 Deploying SwapLens..."
LENS=$(forge create src/SwapLens.sol:SwapLens \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$LENS" = "null" ] || [ -z "$LENS" ]; then
    echo "❌ SwapLens deployment failed"
    exit 1
fi
echo "✅ SwapLens deployed at: $LENS"

echo ""

# =========================================================================
# STEP 3: DEPLOY BUY & BURN SYSTEM
# =========================================================================

echo "=== STEP 3: DEPLOYING BUY & BURN SYSTEM ==="

# Deploy BuyAndBurnController_V2
echo "3.1 Deploying BuyAndBurnController_V2..."
CONTROLLER=$(forge create src/BuyAndBurnController_V2.sol:BuyAndBurnController_V2 \
    --constructor-args $STATE $WPLS $ROUTER $FACTORY $SWAP $SWAP \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$CONTROLLER" = "null" ] || [ -z "$CONTROLLER" ]; then
    echo "❌ BuyAndBurnController_V2 deployment failed"
    exit 1
fi
echo "✅ BuyAndBurnController_V2 deployed at: $CONTROLLER"

echo ""

# =========================================================================
# STEP 4: DEPLOY AIRDROP SYSTEM
# =========================================================================

echo "=== STEP 4: DEPLOYING AIRDROP SYSTEM ==="

# Deploy AirdropDistributor
echo "4.1 Deploying AirdropDistributor..."
AIRDROP=$(forge create src/AirdropDistributor.sol:AirdropDistributor \
    --constructor-args $SWAP $DAV $STATE $GOVERNANCE \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$AIRDROP" = "null" ] || [ -z "$AIRDROP" ]; then
    echo "❌ AirdropDistributor deployment failed"
    exit 1
fi
echo "✅ AirdropDistributor deployed at: $AIRDROP"

echo ""

# =========================================================================
# STEP 5: CONFIGURE CONTRACTS
# =========================================================================

echo "=== STEP 5: CONFIGURING CONTRACTS ==="

# Configure SWAP contract
echo "5.1 Configuring SWAP contract..."

# Set STATE token address
echo "  Setting STATE token address..."
cast send $SWAP "setStateTokenAddress(address)" $STATE \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ STATE token configured"

# Set DAV token address
echo "  Setting DAV token address..."
cast send $SWAP "setDavTokenAddress(address)" $DAV \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ DAV token configured"

# Set LP Helper
echo "  Setting LP Helper..."
cast send $SWAP "setLPHelperAddress(address)" $LPHELPER \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ LP Helper configured"

# Set AuctionAdmin
echo "  Setting AuctionAdmin..."
cast send $SWAP "setAuctionAdmin(address)" $ADMIN \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ AuctionAdmin configured"

# Configure DAV contract
echo "5.2 Configuring DAV contract..."

# Set SWAP contract in DAV
echo "  Setting SWAP contract..."
cast send $DAV "setSwapContract(address)" $SWAP \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ SWAP contract configured in DAV"

# Set Buy and Burn Controller
echo "  Setting Buy and Burn Controller..."
cast send $DAV "setBuyAndBurnController(address)" $CONTROLLER \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "  ✅ Buy and Burn Controller configured"

echo ""

# =========================================================================
# STEP 6: VERIFICATION
# =========================================================================

echo "=== STEP 6: VERIFYING DEPLOYMENT ==="

# Verify STATE token configuration in SWAP
echo "6.1 Verifying STATE token configuration..."
CONFIGURED_STATE=$(cast call $SWAP "stateToken()(address)" --rpc-url $RPC_URL 2>/dev/null || echo "")
if [ "$CONFIGURED_STATE" != "$STATE" ]; then
    echo "❌ STATE token verification failed"
    echo "   Expected: $STATE"
    echo "   Got: $CONFIGURED_STATE"
    exit 1
fi
echo "✅ STATE token verified"

# Verify DAV token configuration in SWAP
echo "6.2 Verifying DAV token configuration..."
CONFIGURED_DAV=$(cast call $SWAP "davToken()(address)" --rpc-url $RPC_URL 2>/dev/null || echo "")
if [ "$CONFIGURED_DAV" != "$DAV" ]; then
    echo "❌ DAV token verification failed"
    echo "   Expected: $DAV"
    echo "   Got: $CONFIGURED_DAV"
    exit 1
fi
echo "✅ DAV token verified"

# Verify LP Helper configuration in SWAP
echo "6.3 Verifying LP Helper configuration..."
CONFIGURED_LP=$(cast call $SWAP "lpHelper()(address)" --rpc-url $RPC_URL 2>/dev/null || echo "")
if [ "$CONFIGURED_LP" != "$LPHELPER" ]; then
    echo "❌ LP Helper verification failed"
    echo "   Expected: $LPHELPER"
    echo "   Got: $CONFIGURED_LP"
    exit 1
fi
echo "✅ LP Helper verified"

# Check token balances
echo "6.4 Checking token balances..."
STATE_GOV_BALANCE=$(cast call $STATE "balanceOf(address)(uint256)" $GOVERNANCE --rpc-url $RPC_URL)
STATE_SWAP_BALANCE=$(cast call $STATE "balanceOf(address)(uint256)" $SWAP --rpc-url $RPC_URL)
DAV_GOV_BALANCE=$(cast call $DAV "balanceOf(address)(uint256)" $GOVERNANCE --rpc-url $RPC_URL)

echo "📊 Token Distribution:"
echo "   STATE Governance: $(echo "scale=2; $STATE_GOV_BALANCE / 10^18" | bc) tokens"
echo "   STATE SWAP: $(echo "scale=2; $STATE_SWAP_BALANCE / 10^18" | bc) tokens"
echo "   DAV Governance: $(echo "scale=2; $DAV_GOV_BALANCE / 10^18" | bc) tokens"

echo ""

# =========================================================================
# DEPLOYMENT SUMMARY
# =========================================================================

echo "========================================="
echo "       DEPLOYMENT COMPLETED! 🎉"
echo "========================================="
echo "Deploy Date: $(date)"
echo "Chain ID: $CHAIN_ID"
echo "Deployer: $DEPLOYER_ADDRESS"
echo "Governance: $GOVERNANCE"
echo ""
echo "📋 CONTRACT ADDRESSES:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Core Contracts:"
echo "  SWAP_V3:       $SWAP"
echo "  STATE_V3:      $STATE"
echo "  DAV_V3:        $DAV"
echo ""
echo "Support Contracts:"
echo "  LPHelper:      $LPHELPER"
echo "  AuctionAdmin:  $ADMIN"
echo "  AuctionMetrics: $METRICS"
echo "  SwapLens:      $LENS"
echo ""
echo "Systems:"
echo "  BuyAndBurn:    $CONTROLLER"
echo "  Airdrop:       $AIRDROP"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Save deployment addresses
DEPLOYMENT_FILE="deployments/deployment_$(date +%Y%m%d_%H%M%S).json"
mkdir -p deployments

cat > $DEPLOYMENT_FILE << EOF
{
  "network": {
    "chainId": $CHAIN_ID,
    "rpcUrl": "$RPC_URL",
    "deploymentDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  },
  "deployer": "$DEPLOYER_ADDRESS",
  "governance": "$GOVERNANCE",
  "contracts": {
    "core": {
      "SWAP_V3": "$SWAP",
      "STATE_V3": "$STATE",
      "DAV_V3": "$DAV"
    },
    "support": {
      "LPHelper": "$LPHELPER",
      "AuctionAdmin": "$ADMIN",
      "AuctionMetrics": "$METRICS",
      "SwapLens": "$LENS"
    },
    "systems": {
      "BuyAndBurnController_V2": "$CONTROLLER",
      "AirdropDistributor": "$AIRDROP"
    }
  },
  "configuration": {
    "router": "$ROUTER",
    "factory": "$FACTORY",
    "wpls": "$WPLS",
    "stateToken": {
      "name": "$STATE_NAME",
      "symbol": "$STATE_SYMBOL"
    },
    "davToken": {
      "name": "$DAV_NAME",
      "symbol": "$DAV_SYMBOL"
    }
  }
}
EOF

echo ""
echo "💾 Deployment saved to: $DEPLOYMENT_FILE"
echo ""
echo "🚀 NEXT STEPS:"
echo "1. Run initialization script: ./initialize_contracts.sh"
echo "2. Create initial liquidity pools"
echo "3. Deploy project tokens and register for auctions"
echo "4. Start auction schedule"
echo ""
echo "✅ System ready for initialization and testing!"
echo "========================================="