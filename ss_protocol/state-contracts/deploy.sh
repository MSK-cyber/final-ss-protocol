#!/bin/bash

# Simple mainnet-style deployment script
# Usage: ./deploy.sh

echo "========================================="
echo "    SIMPLE MAINNET DEPLOYMENT SCRIPT"
echo "========================================="

# Configuration
GOVERNANCE="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
DEV_WALLET="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
RPC_URL="http://localhost:8545"

echo "Governance: $GOVERNANCE"
echo "Dev Wallet: $DEV_WALLET"
echo "RPC URL: $RPC_URL"
echo ""

# Step 1: Deploy SWAP contract first
echo "1. Deploying SWAP_V3..."
SWAP=$(forge create src/AuctionSwap.sol:SWAP_V3 \
    --constructor-args $GOVERNANCE $DEV_WALLET \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$SWAP" = "null" ] || [ -z "$SWAP" ]; then
    echo "❌ SWAP deployment failed"
    exit 1
fi
echo "✅ SWAP_V3 deployed at: $SWAP"

# Step 2: Deploy STATE token with SWAP address
echo "2. Deploying STATE_V3..."
STATE=$(forge create src/StateToken.sol:STATE_V3 \
    --constructor-args $SWAP $GOVERNANCE \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$STATE" = "null" ] || [ -z "$STATE" ]; then
    echo "❌ STATE deployment failed"
    exit 1
fi
echo "✅ STATE_V3 deployed at: $STATE"

# Step 3: Deploy DAV token
echo "3. Deploying DAV_V3..."
DAV=$(forge create src/DavToken.sol:DAV_V3 \
    --constructor-args $GOVERNANCE $DEV_WALLET \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$DAV" = "null" ] || [ -z "$DAV" ]; then
    echo "❌ DAV deployment failed"
    exit 1
fi
echo "✅ DAV_V3 deployed at: $DAV"

# Step 4: Deploy LP Helper
echo "4. Deploying LPHelper..."
LPHELPER=$(forge create src/LPHelper.sol:LPHelper \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$LPHELPER" = "null" ] || [ -z "$LPHELPER" ]; then
    echo "❌ LPHelper deployment failed"
    exit 1
fi
echo "✅ LPHelper deployed at: $LPHELPER"

# Step 5: Deploy AuctionAdmin
echo "5. Deploying AuctionAdmin..."
ADMIN=$(forge create src/AuctionAdmin.sol:AuctionAdmin \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy \
    --json | jq -r '.deployedTo')

if [ "$ADMIN" = "null" ] || [ -z "$ADMIN" ]; then
    echo "❌ AuctionAdmin deployment failed"
    exit 1
fi
echo "✅ AuctionAdmin deployed at: $ADMIN"

# Step 6: Configure SWAP contract
echo "6. Configuring SWAP contract..."

# Set STATE token
cast send $SWAP "setStateTokenAddress(address)" $STATE \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy
echo "✅ STATE token configured"

# Set LP Helper
cast send $SWAP "setLPHelperAddress(address)" $LPHELPER \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy
echo "✅ LP Helper configured"

# Set AuctionAdmin
cast send $SWAP "setAuctionAdmin(address)" $ADMIN \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy
echo "✅ AuctionAdmin configured"

# Step 7: Verify deployment
echo "7. Verifying deployment..."

# Check STATE token in SWAP
CONFIGURED_STATE=$(cast call $SWAP "stateToken()(address)" --rpc-url $RPC_URL)
if [ "$CONFIGURED_STATE" != "$STATE" ]; then
    echo "❌ STATE token verification failed"
    exit 1
fi
echo "✅ STATE token verified"

# Check LP Helper in SWAP
CONFIGURED_LP=$(cast call $SWAP "lpHelper()(address)" --rpc-url $RPC_URL)
if [ "$CONFIGURED_LP" != "$LPHELPER" ]; then
    echo "❌ LP Helper verification failed"
    exit 1
fi
echo "✅ LP Helper verified"

# Check token balances
GOV_BALANCE=$(cast call $STATE "balanceOf(address)(uint256)" $GOVERNANCE --rpc-url $RPC_URL)
SWAP_BALANCE=$(cast call $STATE "balanceOf(address)(uint256)" $SWAP --rpc-url $RPC_URL)

echo "📊 Token balances:"
echo "   Governance: $(echo $GOV_BALANCE | awk '{print $1/10^18}') STATE tokens"
echo "   SWAP contract: $(echo $SWAP_BALANCE | awk '{print $1/10^18}') STATE tokens"

echo ""
echo "========================================="
echo "       DEPLOYMENT COMPLETED! 🎉"
echo "========================================="
echo "STATE_V3:      $STATE"
echo "DAV_V3:        $DAV" 
echo "SWAP_V3:       $SWAP"
echo "LPHelper:      $LPHELPER"
echo "AuctionAdmin:  $ADMIN"
echo ""
echo "Save these addresses to DEPLOYED_ADDRESSES.md"
echo "System is ready for UI token deployment and trading!"
echo "========================================="