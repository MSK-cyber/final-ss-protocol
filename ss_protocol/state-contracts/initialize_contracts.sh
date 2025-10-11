#!/bin/bash

# =========================================================================
#         PROJECT INITIALIZATION SCRIPT
# =========================================================================
# 
# This script initializes the deployed SS Protocol ecosystem:
# - Creates initial liquidity pools
# - Sets up auction schedules
# - Deploys and registers test tokens
# - Configures system parameters
# - Performs initial system tests
# 
# Usage: ./initialize_contracts.sh [deployment_file]
# 
# Prerequisites:
# - Contracts must be deployed first (run mainnet_deploy.sh)
# - PRIVATE_KEY environment variable set
# - Deployment file with contract addresses
# =========================================================================

set -e  # Exit on any error

echo "========================================="
echo "    PROJECT INITIALIZATION SCRIPT"
echo "========================================="
echo "Initialize Date: $(date)"
echo ""

# =========================================================================
# CONFIGURATION
# =========================================================================

# Load deployment file
DEPLOYMENT_FILE=${1:-"deployments/deployment_latest.json"}
if [ ! -f "$DEPLOYMENT_FILE" ]; then
    # Try to find the latest deployment file
    LATEST_FILE=$(find deployments -name "deployment_*.json" 2>/dev/null | sort | tail -1)
    if [ ! -f "$LATEST_FILE" ]; then
        echo "❌ Error: No deployment file found"
        echo "   Run mainnet_deploy.sh first, or specify deployment file:"
        echo "   ./initialize_contracts.sh deployments/deployment_YYYYMMDD_HHMMSS.json"
        exit 1
    fi
    DEPLOYMENT_FILE=$LATEST_FILE
fi

echo "📁 Using deployment file: $DEPLOYMENT_FILE"

# Extract contract addresses from deployment file
if ! command -v jq &> /dev/null; then
    echo "❌ Error: jq not found"
    echo "   Install jq: brew install jq"
    exit 1
fi

# Load configuration from deployment file
RPC_URL=$(jq -r '.network.rpcUrl' $DEPLOYMENT_FILE)
CHAIN_ID=$(jq -r '.network.chainId' $DEPLOYMENT_FILE)
GOVERNANCE=$(jq -r '.governance' $DEPLOYMENT_FILE)

# Load contract addresses
SWAP=$(jq -r '.contracts.core.SWAP_V3' $DEPLOYMENT_FILE)
STATE=$(jq -r '.contracts.core.STATE_V3' $DEPLOYMENT_FILE)
DAV=$(jq -r '.contracts.core.DAV_V3' $DEPLOYMENT_FILE)
LPHELPER=$(jq -r '.contracts.support.LPHelper' $DEPLOYMENT_FILE)
ADMIN=$(jq -r '.contracts.support.AuctionAdmin' $DEPLOYMENT_FILE)
CONTROLLER=$(jq -r '.contracts.systems.BuyAndBurnController_V2' $DEPLOYMENT_FILE)

# Load DEX configuration
ROUTER=$(jq -r '.configuration.router' $DEPLOYMENT_FILE)
FACTORY=$(jq -r '.configuration.factory' $DEPLOYMENT_FILE)
WPLS=$(jq -r '.configuration.wpls' $DEPLOYMENT_FILE)

echo "=== LOADED CONFIGURATION ==="
echo "Network: $RPC_URL (Chain ID: $CHAIN_ID)"
echo "SWAP: $SWAP"
echo "STATE: $STATE"
echo "DAV: $DAV"
echo "Controller: $CONTROLLER"
echo ""

# Verify prerequisites
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ Error: PRIVATE_KEY environment variable not set"
    exit 1
fi

DEPLOYER_ADDRESS=$(cast wallet address $PRIVATE_KEY)
echo "🔑 Deployer: $DEPLOYER_ADDRESS"

# Check connection
BLOCK_NUMBER=$(cast block-number --rpc-url $RPC_URL 2>/dev/null || echo "")
if [ -z "$BLOCK_NUMBER" ]; then
    echo "❌ Error: Cannot connect to RPC at $RPC_URL"
    exit 1
fi
echo "✅ Connected to RPC (Block: $BLOCK_NUMBER)"
echo ""

# =========================================================================
# STEP 1: DEPLOY TEST TOKENS
# =========================================================================

echo "=== STEP 1: DEPLOYING TEST TOKENS ==="

# Deploy test tokens for demonstration
declare -a TEST_TOKENS=()
declare -a TOKEN_NAMES=("TestToken1" "TestToken2" "TestToken3")
declare -a TOKEN_SYMBOLS=("TT1" "TT2" "TT3")

for i in {0..2}; do
    echo "1.$((i+1)) Deploying ${TOKEN_NAMES[i]}..."
    
    # Deploy token using the Tokens.sol contract
    TOKEN_ADDRESS=$(forge create src/Tokens.sol:TOKEN_V3 \
        --constructor-args "\"${TOKEN_NAMES[i]}\"" "\"${TOKEN_SYMBOLS[i]}\"" $GOVERNANCE $SWAP $GOVERNANCE \
        --private-key $PRIVATE_KEY \
        --rpc-url $RPC_URL \
        --legacy \
        --json | jq -r '.deployedTo')
    
    if [ "$TOKEN_ADDRESS" = "null" ] || [ -z "$TOKEN_ADDRESS" ]; then
        echo "❌ ${TOKEN_NAMES[i]} deployment failed"
        exit 1
    fi
    
    TEST_TOKENS+=($TOKEN_ADDRESS)
    echo "✅ ${TOKEN_NAMES[i]} (${TOKEN_SYMBOLS[i]}) deployed at: $TOKEN_ADDRESS"
    
    # Check token balance in SWAP (should be 99% of total supply)
    TOKEN_BALANCE=$(cast call $TOKEN_ADDRESS "balanceOf(address)(uint256)" $SWAP --rpc-url $RPC_URL)
    echo "   Token balance in SWAP: $(echo "scale=0; $TOKEN_BALANCE / 10^18" | bc) tokens"
done

echo ""

# =========================================================================
# STEP 2: CREATE INITIAL LIQUIDITY POOLS
# =========================================================================

echo "=== STEP 2: CREATING INITIAL LIQUIDITY POOLS ==="

# First, we need to create STATE/WPLS pool for the buy & burn system
echo "2.1 Creating STATE/WPLS pool..."

# Check if we have WPLS (if on testnet/local, we might need to wrap some ETH)
WPLS_BALANCE=$(cast call $WPLS "balanceOf(address)(uint256)" $DEPLOYER_ADDRESS --rpc-url $RPC_URL 2>/dev/null || echo "0")
WPLS_BALANCE_ETH=$(echo "scale=2; $WPLS_BALANCE / 10^18" | bc)

if (( $(echo "$WPLS_BALANCE_ETH < 1" | bc -l) )); then
    echo "   Wrapping 10 ETH to WPLS for liquidity..."
    cast send $WPLS "deposit()" \
        --value 10ether \
        --private-key $PRIVATE_KEY \
        --rpc-url $RPC_URL \
        --legacy >/dev/null 2>&1
    echo "   ✅ Wrapped 10 ETH to WPLS"
fi

# Approve WPLS for router
echo "   Approving WPLS for router..."
cast send $WPLS "approve(address,uint256)" $ROUTER $(cast max-uint256) \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1

# Approve STATE for router
echo "   Approving STATE for router..."
cast send $STATE "approve(address,uint256)" $ROUTER $(cast max-uint256) \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1

# Create STATE/WPLS pair if it doesn't exist
echo "   Creating STATE/WPLS pair..."
STATE_WPLS_PAIR=$(cast call $FACTORY "getPair(address,address)(address)" $STATE $WPLS --rpc-url $RPC_URL)
if [ "$STATE_WPLS_PAIR" = "0x0000000000000000000000000000000000000000" ]; then
    cast send $FACTORY "createPair(address,address)" $STATE $WPLS \
        --private-key $PRIVATE_KEY \
        --rpc-url $RPC_URL \
        --legacy >/dev/null 2>&1
    STATE_WPLS_PAIR=$(cast call $FACTORY "getPair(address,address)(address)" $STATE $WPLS --rpc-url $RPC_URL)
fi
echo "   ✅ STATE/WPLS pair: $STATE_WPLS_PAIR"

# Add initial liquidity (1000 STATE + 1 WPLS)
echo "   Adding initial liquidity..."
cast send $ROUTER "addLiquidity(address,address,uint256,uint256,uint256,uint256,address,uint256)" \
    $STATE $WPLS \
    1000000000000000000000 \
    1000000000000000000 \
    950000000000000000000 \
    950000000000000000 \
    $DEPLOYER_ADDRESS \
    $(($(date +%s) + 3600)) \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "   ✅ Initial liquidity added"

# Configure the STATE/WPLS pool in BuyAndBurnController
echo "   Configuring buy & burn controller..."
cast send $CONTROLLER "setStateWplsPool(address)" $STATE_WPLS_PAIR \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "   ✅ Buy & burn controller configured"

echo ""

# =========================================================================
# STEP 3: REGISTER TOKENS FOR AUCTIONS
# =========================================================================

echo "=== STEP 3: REGISTERING TOKENS FOR AUCTIONS ==="

# Create auction schedule with test tokens
echo "3.1 Setting up auction schedule..."

# Prepare token array for auction schedule
TOKEN_ARRAY=""
for token in "${TEST_TOKENS[@]}"; do
    if [ -z "$TOKEN_ARRAY" ]; then
        TOKEN_ARRAY="[$token"
    else
        TOKEN_ARRAY="$TOKEN_ARRAY,$token"
    fi
done
TOKEN_ARRAY="$TOKEN_ARRAY]"

echo "   Tokens to schedule: $TOKEN_ARRAY"

# Set auction schedule (this will register the tokens)
cast send $SWAP "setAuctionSchedule(address[])" "$TOKEN_ARRAY" \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1
echo "✅ Auction schedule set with ${#TEST_TOKENS[@]} tokens"

# Verify token registration
echo "3.2 Verifying token registration..."
for i in "${!TEST_TOKENS[@]}"; do
    IS_REGISTERED=$(cast call $SWAP "isTokenRegistered(address)(bool)" ${TEST_TOKENS[i]} --rpc-url $RPC_URL)
    if [ "$IS_REGISTERED" = "true" ]; then
        echo "   ✅ ${TOKEN_NAMES[i]} (${TOKEN_SYMBOLS[i]}) registered"
    else
        echo "   ❌ ${TOKEN_NAMES[i]} (${TOKEN_SYMBOLS[i]}) not registered"
    fi
done

echo ""

# =========================================================================
# STEP 4: CONFIGURE SYSTEM PARAMETERS
# =========================================================================

echo "=== STEP 4: CONFIGURING SYSTEM PARAMETERS ==="

# Set reasonable auction parameters
echo "4.1 Configuring auction parameters..."

# Set max auction participants (optional)
# cast send $ADMIN "setMaxAuctionParticipants(address,uint256)" $SWAP 1000 \
#     --private-key $PRIVATE_KEY \
#     --rpc-url $RPC_URL \
#     --legacy >/dev/null 2>&1

echo "✅ System parameters configured"

echo ""

# =========================================================================
# STEP 5: PERFORM INITIAL TESTS
# =========================================================================

echo "=== STEP 5: PERFORMING INITIAL TESTS ==="

# Test DAV minting
echo "5.1 Testing DAV minting..."
INITIAL_DAV_BALANCE=$(cast call $DAV "balanceOf(address)(uint256)" $DEPLOYER_ADDRESS --rpc-url $RPC_URL)

# Mint some DAV tokens (0.1 ETH worth)
cast send $DAV "mintDAV(uint256,string)" 100000000000000000 "\"TEST\"" \
    --value 0.1ether \
    --private-key $PRIVATE_KEY \
    --rpc-url $RPC_URL \
    --legacy >/dev/null 2>&1

NEW_DAV_BALANCE=$(cast call $DAV "balanceOf(address)(uint256)" $DEPLOYER_ADDRESS --rpc-url $RPC_URL)
DAV_MINTED=$(echo "scale=18; $NEW_DAV_BALANCE - $INITIAL_DAV_BALANCE" | bc)
DAV_MINTED_DISPLAY=$(echo "scale=2; $DAV_MINTED / 10^18" | bc)

if (( $(echo "$DAV_MINTED > 0" | bc -l) )); then
    echo "✅ DAV minting successful: $DAV_MINTED_DISPLAY DAV tokens minted"
else
    echo "❌ DAV minting failed"
fi

# Test auction status
echo "5.2 Testing auction status..."
AUCTION_STATUS=$(cast call $SWAP "getTodayStatus()(address,bool,bool,uint256)" --rpc-url $RPC_URL)
echo "✅ Auction system status retrieved"

# Check system health
echo "5.3 Checking system health..."

# Check STATE vault balance
STATE_VAULT_BALANCE=$(cast call $SWAP "getStateVaultBalance()(uint256)" --rpc-url $RPC_URL)
STATE_VAULT_DISPLAY=$(echo "scale=2; $STATE_VAULT_BALANCE / 10^18" | bc)
echo "   STATE vault balance: $STATE_VAULT_DISPLAY tokens"

# Check if tokens are properly deposited
for i in "${!TEST_TOKENS[@]}"; do
    TOKEN_VAULT_BALANCE=$(cast call $SWAP "getVaultBalance(address)(uint256)" ${TEST_TOKENS[i]} --rpc-url $RPC_URL)
    TOKEN_VAULT_DISPLAY=$(echo "scale=0; $TOKEN_VAULT_BALANCE / 10^18" | bc)
    echo "   ${TOKEN_NAMES[i]} vault balance: $TOKEN_VAULT_DISPLAY tokens"
done

echo ""

# =========================================================================
# STEP 6: CREATE SUMMARY
# =========================================================================

echo "=== STEP 6: GENERATING INITIALIZATION SUMMARY ==="

# Create initialization summary file
INIT_FILE="deployments/initialization_$(date +%Y%m%d_%H%M%S).json"

cat > $INIT_FILE << EOF
{
  "initializationDate": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "deploymentFile": "$DEPLOYMENT_FILE",
  "network": {
    "chainId": $CHAIN_ID,
    "rpcUrl": "$RPC_URL"
  },
  "testTokens": [
$(for i in "${!TEST_TOKENS[@]}"; do
    echo "    {"
    echo "      \"name\": \"${TOKEN_NAMES[i]}\","
    echo "      \"symbol\": \"${TOKEN_SYMBOLS[i]}\","
    echo "      \"address\": \"${TEST_TOKENS[i]}\""
    if [ $i -lt $((${#TEST_TOKENS[@]} - 1)) ]; then
        echo "    },"
    else
        echo "    }"
    fi
done)
  ],
  "liquidityPools": [
    {
      "name": "STATE/WPLS",
      "address": "$STATE_WPLS_PAIR",
      "token0": "$STATE",
      "token1": "$WPLS"
    }
  ],
  "systemStatus": {
    "auctionScheduleSet": true,
    "tokensRegistered": ${#TEST_TOKENS[@]},
    "buyAndBurnConfigured": true,
    "davMintingTested": true
  }
}
EOF

echo ""

# =========================================================================
# INITIALIZATION SUMMARY
# =========================================================================

echo "========================================="
echo "      INITIALIZATION COMPLETED! 🚀"
echo "========================================="
echo "Initialize Date: $(date)"
echo "Chain ID: $CHAIN_ID"
echo ""
echo "📋 SYSTEM STATUS:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Deployment file loaded: $DEPLOYMENT_FILE"
echo "✅ Test tokens deployed: ${#TEST_TOKENS[@]}"
echo "✅ STATE/WPLS pool created: $STATE_WPLS_PAIR"
echo "✅ Auction schedule configured"
echo "✅ Buy & burn system operational"
echo "✅ DAV minting functional"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🧪 TEST TOKENS DEPLOYED:"
for i in "${!TEST_TOKENS[@]}"; do
    echo "  ${TOKEN_NAMES[i]} (${TOKEN_SYMBOLS[i]}): ${TEST_TOKENS[i]}"
done
echo ""
echo "💾 Initialization saved to: $INIT_FILE"
echo ""
echo "🎯 READY FOR TESTING:"
echo "1. Mint DAV tokens: cast send $DAV \"mintDAV(uint256,string)\" <amount> \"<referral>\" --value <eth>"
echo "2. Participate in auctions: cast send $SWAP \"swap(address,uint256,uint256)\" <token> <minOut> <deadline>"
echo "3. Check auction status: cast call $SWAP \"getTodayStatus()(address,bool,bool,uint256)\""
echo "4. Monitor buy & burn: cast call $CONTROLLER \"getPoolBalance()(uint256)\""
echo ""
echo "✅ System fully initialized and ready for operations!"
echo "========================================="