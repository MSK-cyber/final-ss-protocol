#!/bin/bash

# 🧠 WALSO | Pool Creation Checklist (Mainnet Execution Flow)
# Executable bash script for PulseChain mainnet pool creation

set -e

echo "=== Pool Creation Checklist (Mainnet Execution Flow) ==="
echo

# Check environment variables
if [ -z "$PRIVATE_KEY" ]; then
    echo "❌ ERROR: PRIVATE_KEY environment variable not set"
    echo "Please set: export PRIVATE_KEY=0x..."
    exit 1
fi

if [ -z "$RPC_URL" ]; then
    RPC_URL="https://rpc.pulsechain.com"
    echo "Using default RPC: $RPC_URL"
fi

# STEP 1 — Verify Deployment & Token Addresses
echo "STEP 1 — Verify Deployment & Token Addresses"
echo

# From deployed addresses (pulsechain-mainnet.json)
SWAP_CONTRACT="0x9566c3E64d14fd86de6451Fdb96b37129b65C9D4"
STATE_TOKEN="0x66c9F985E02b2570B410AB03A3123Bd0ae575C6b"
DAV_TOKEN="0x015DeF0C81C27dFAaf7932FaD44947AAE2e7881E"
BUYBURN_CONTROLLER="0xd36ec9e7c311E5cEa720F7bc5E13564F3adc6073"
WPLS_TOKEN="0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
PULSEX_FACTORY="0x29eA7545DEf87022BAdc76323F373EA1e707C523"
GOVERNANCE="0xF4579FA5Aca398FfeeB3eD1298104d226Ef84ebd"

echo "✅ SWAP_CONTRACT: $SWAP_CONTRACT"
echo "✅ STATE_TOKEN: $STATE_TOKEN"
echo "✅ DAV_TOKEN: $DAV_TOKEN"
echo "✅ BUYBURN_CONTROLLER: $BUYBURN_CONTROLLER"
echo "✅ WPLS_TOKEN: $WPLS_TOKEN"
echo "✅ PULSEX_FACTORY: $PULSEX_FACTORY"
echo "✅ GOVERNANCE: $GOVERNANCE"
echo

# STEP 2 — Verify Existing Allowance for STATE
echo "STEP 2 — Verify Existing Allowance for STATE"
echo

echo "Checking STATE allowance from SWAP contract to BuyAndBurnController..."
allowance=$(cast call $STATE_TOKEN "allowance(address,address)" $SWAP_CONTRACT $BUYBURN_CONTROLLER --rpc-url $RPC_URL)
echo "Current allowance: $allowance"

if [ "$allowance" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
    echo "⚠️  No allowance set - need to configure SWAP vault allowance"
    NEED_ALLOWANCE=true
else
    echo "✅ Allowance already exists"
    NEED_ALLOWANCE=false
fi
echo

# STEP 3 — Check if pool already exists
echo "STEP 3 — Check Pool Status"
echo

echo "Checking if STATE/WPLS pool already exists..."
existing_pool=$(cast call $PULSEX_FACTORY "getPair(address,address)" $STATE_TOKEN $WPLS_TOKEN --rpc-url $RPC_URL)
if [ "$existing_pool" = "0x0000000000000000000000000000000000000000" ]; then
    echo "✅ No existing pool - ready to create"
    POOL_EXISTS=false
else
    echo "⚠️  Pool already exists at: $existing_pool"
    POOL_EXISTS=true
fi
echo

# STEP 4 — Check governance wallet balance
echo "STEP 4 — Check Governance Wallet"
echo

echo "Checking governance wallet PLS balance..."
balance=$(cast balance $GOVERNANCE --rpc-url $RPC_URL)
balance_eth=$(cast to-unit $balance ether)
echo "Governance PLS balance: $balance_eth PLS"

if (( $(echo "$balance_eth < 50000" | bc -l) )); then
    echo "⚠️  Insufficient PLS balance for pool creation (need ~50k PLS)"
else
    echo "✅ Sufficient PLS balance"
fi
echo

# STEP 5 — Execute Pool Creation
echo "STEP 5 — Execute Pool Creation"
echo

if [ "$POOL_EXISTS" = true ]; then
    echo "⚠️  Pool already exists - skipping creation"
elif [ "$NEED_ALLOWANCE" = true ]; then
    echo "🚀 Running pool creation script (will set allowance and create pool)..."
    
    # Use the Foundry script
    forge script script/MainnetPoolCreation.s.sol \
        --rpc-url $RPC_URL \
        --private-key $PRIVATE_KEY \
        --broadcast \
        --verify \
        --etherscan-api-key "placeholder" \
        -v
        
    echo "✅ Pool creation script completed"
else
    echo "🚀 Running pool creation script (allowance exists, creating pool only)..."
    
    # Use the Foundry script
    forge script script/MainnetPoolCreation.s.sol \
        --rpc-url $RPC_URL \
        --private-key $PRIVATE_KEY \
        --broadcast \
        --verify \
        --etherscan-api-key "placeholder" \
        -v
        
    echo "✅ Pool creation script completed"
fi
echo

# STEP 6 — Validate Pool Creation
echo "STEP 6 — Validate Pool Creation"
echo

echo "Checking if pool was created successfully..."
final_pool=$(cast call $PULSEX_FACTORY "getPair(address,address)" $STATE_TOKEN $WPLS_TOKEN --rpc-url $RPC_URL)
if [ "$final_pool" != "0x0000000000000000000000000000000000000000" ]; then
    echo "✅ Pool successfully created at: $final_pool"
    
    # Check pool balances
    echo "Checking pool token balances..."
    state_balance=$(cast call $STATE_TOKEN "balanceOf(address)" $final_pool --rpc-url $RPC_URL)
    wpls_balance=$(cast call $WPLS_TOKEN "balanceOf(address)" $final_pool --rpc-url $RPC_URL)
    
    state_balance_eth=$(cast to-unit $state_balance ether)
    wpls_balance_eth=$(cast to-unit $wpls_balance ether)
    
    echo "Pool STATE balance: $state_balance_eth STATE"
    echo "Pool WPLS balance: $wpls_balance_eth WPLS"
else
    echo "❌ Pool creation failed"
fi
echo

# STEP 7 — Record State
echo "STEP 7 — Record State"
echo

# Create deployment record
cat > pool_creation_record.json << EOF
{
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "network": "PulseChain Mainnet",
  "chainId": 369,
  "governance": "$GOVERNANCE",
  "contracts": {
    "SWAP_V3": "$SWAP_CONTRACT",
    "STATE_V3": "$STATE_TOKEN",
    "DAV_V3": "$DAV_TOKEN",
    "BuyAndBurnController": "$BUYBURN_CONTROLLER",
    "WPLS": "$WPLS_TOKEN",
    "PulseXFactory": "$PULSEX_FACTORY",
    "StateWplsPool": "$final_pool"
  },
  "poolCreation": {
    "poolAddress": "$final_pool",
    "allowanceSetFromSwap": "$NEED_ALLOWANCE",
    "poolExistedBefore": "$POOL_EXISTS"
  }
}
EOF

echo "✅ State recorded to: pool_creation_record.json"
echo

echo "=== Pool Creation Checklist Completed ==="
echo "📋 Summary:"
echo "  • Pool Address: $final_pool"
echo "  • STATE Token: $STATE_TOKEN"
echo "  • WPLS Token: $WPLS_TOKEN"
echo "  • BuyAndBurn Controller: $BUYBURN_CONTROLLER"
echo
echo "🎉 Pool creation process complete!"