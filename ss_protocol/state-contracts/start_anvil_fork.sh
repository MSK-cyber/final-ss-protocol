#!/bin/bash

# =========================================================================
#         ANVIL FORK TESTING SCRIPT
# =========================================================================
# 
# This script starts Anvil with a fork of PulseChain mainnet and provides
# accounts with 100k ETH balance for testing the SS Protocol
# 
# Usage: ./start_anvil_fork.sh [NETWORK]
# 
# Networks:
#   pulsechain   - Fork PulseChain mainnet (default)
#   ethereum     - Fork Ethereum mainnet  
#   base         - Fork Base mainnet
#   arbitrum     - Fork Arbitrum mainnet
# 
# =========================================================================

# Configuration
NETWORK=${1:-"pulsechain"}
BALANCE="100000"  # 100k ETH per account

echo "========================================="
echo "    ANVIL FORK TESTING ENVIRONMENT"
echo "========================================="
echo "Network: $NETWORK"
echo "Balance per account: $BALANCE ETH"
echo ""

# Network configurations
case $NETWORK in
    "pulsechain")
        RPC_URL="https://rpc.pulsechain.com"
        CHAIN_ID=369
        echo "🔗 Forking PulseChain Mainnet"
        echo "   RPC: $RPC_URL"
        echo "   Chain ID: $CHAIN_ID"
        ;;
    "ethereum")
        RPC_URL="https://eth.llamarpc.com"
        CHAIN_ID=1
        echo "🔗 Forking Ethereum Mainnet"
        echo "   RPC: $RPC_URL"
        echo "   Chain ID: $CHAIN_ID"
        ;;
    "base")
        RPC_URL="https://mainnet.base.org"
        CHAIN_ID=8453
        echo "🔗 Forking Base Mainnet"
        echo "   RPC: $RPC_URL"
        echo "   Chain ID: $CHAIN_ID"
        ;;
    "arbitrum")
        RPC_URL="https://arb1.arbitrum.io/rpc"
        CHAIN_ID=42161
        echo "🔗 Forking Arbitrum Mainnet"
        echo "   RPC: $RPC_URL"
        echo "   Chain ID: $CHAIN_ID"
        ;;
    *)
        echo "❌ Unknown network: $NETWORK"
        echo "   Supported networks: pulsechain, ethereum, base, arbitrum"
        exit 1
        ;;
esac

# Check if anvil is installed
if ! command -v anvil &> /dev/null; then
    echo "❌ Error: anvil not found"
    echo "   Install Foundry: curl -L https://foundry.paradigm.xyz | bash"
    exit 1
fi

# Test RPC connection
echo ""
echo "🔄 Testing RPC connection..."
if ! curl -s -X POST -H "Content-Type: application/json" \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    $RPC_URL >/dev/null; then
    echo "❌ Error: Cannot connect to $RPC_URL"
    echo "   Please check your internet connection and try again"
    exit 1
fi
echo "✅ RPC connection successful"

# Create accounts file with test accounts
ACCOUNTS_FILE="test_accounts.json"
cat > $ACCOUNTS_FILE << 'EOF'
{
  "accounts": [
    {
      "name": "Deployer",
      "privateKey": "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
      "address": "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
    },
    {
      "name": "Alice",
      "privateKey": "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
      "address": "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
    },
    {
      "name": "Bob",
      "privateKey": "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
      "address": "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC"
    },
    {
      "name": "Charlie",
      "privateKey": "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
      "address": "0x90F79bf6EB2c4f870365E785982E1f101E93b906"
    },
    {
      "name": "Dave",
      "privateKey": "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
      "address": "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
    }
  ]
}
EOF

echo ""
echo "👥 Test accounts created:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Name     | Address                                    | Balance"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Deployer | 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 | $BALANCE ETH"
echo "Alice    | 0x70997970C51812dc3A010C7d01b50e0d17dc79C8 | $BALANCE ETH"
echo "Bob      | 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC | $BALANCE ETH"
echo "Charlie  | 0x90F79bf6EB2c4f870365E785982E1f101E93b906 | $BALANCE ETH"
echo "Dave     | 0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65 | $BALANCE ETH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Create environment file for easy testing
ENV_FILE=".env.anvil"
cat > $ENV_FILE << EOF
# Anvil Fork Environment Configuration
export RPC_URL="http://localhost:8545"
export CHAIN_ID="31337"
export DEPLOYER_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
export ALICE_PRIVATE_KEY="0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
export BOB_PRIVATE_KEY="0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"

# For deployment scripts
export PRIVATE_KEY="\$DEPLOYER_PRIVATE_KEY"
export GOVERNANCE="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
export DEV_WALLET="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"

# Network-specific DEX addresses (will be overridden for local testing)
export ROUTER="0x165C3410fC91EF562C50559f7d2289fEbed552d9"
export FACTORY="0x29eA7545DEf87022BAdc76323F373EA1e707C523"
export WPLS="0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
EOF

echo ""
echo "⚙️  Environment file created: $ENV_FILE"
echo "   Load with: source $ENV_FILE"

echo ""
echo "🚀 Starting Anvil fork..."
echo "   Port: 8545"
echo "   Fork URL: $RPC_URL"
echo "   Account balance: $BALANCE ETH each"
echo ""

# Build the anvil command
ANVIL_CMD="anvil --fork-url $RPC_URL --chain-id 31337 --host 0.0.0.0 --port 8545"

# Add account configurations with high balances
ANVIL_CMD="$ANVIL_CMD --balance $BALANCE"

# Add specific accounts
ANVIL_CMD="$ANVIL_CMD --accounts 10"

echo "💻 Anvil command:"
echo "   $ANVIL_CMD"
echo ""

# Create a startup script that users can run
STARTUP_SCRIPT="start_fork.sh"
cat > $STARTUP_SCRIPT << EOF
#!/bin/bash
echo "Starting Anvil fork of $NETWORK..."
echo "Press Ctrl+C to stop"
echo ""
$ANVIL_CMD
EOF
chmod +x $STARTUP_SCRIPT

echo "📝 Created startup script: $STARTUP_SCRIPT"
echo ""

# Instructions
echo "========================================="
echo "           NEXT STEPS"
echo "========================================="
echo ""
echo "1️⃣  START ANVIL FORK:"
echo "   ./$STARTUP_SCRIPT"
echo "   (or run the anvil command directly)"
echo ""
echo "2️⃣  LOAD ENVIRONMENT:"
echo "   source $ENV_FILE"
echo ""
echo "3️⃣  DEPLOY CONTRACTS:"
echo "   ./mainnet_deploy.sh"
echo ""
echo "4️⃣  INITIALIZE SYSTEM:"
echo "   ./initialize_contracts.sh"
echo ""
echo "5️⃣  START TESTING:"
echo "   # Test DAV minting"
echo "   cast send [DAV_ADDRESS] \"mintDAV(uint256,string)\" 1000000000000000000 \"TEST\" \\"
echo "     --value 0.1ether --private-key \$ALICE_PRIVATE_KEY --rpc-url \$RPC_URL"
echo ""
echo "   # Check balances"
echo "   cast call [STATE_ADDRESS] \"balanceOf(address)(uint256)\" [USER_ADDRESS] --rpc-url \$RPC_URL"
echo ""
echo "📊 MONITORING COMMANDS:"
echo "   # Check current block"
echo "   cast block-number --rpc-url \$RPC_URL"
echo ""
echo "   # Check account balance"
echo "   cast balance [ADDRESS] --rpc-url \$RPC_URL"
echo ""
echo "   # Check auction status"
echo "   cast call [SWAP_ADDRESS] \"getTodayStatus()(address,bool,bool,uint256)\" --rpc-url \$RPC_URL"
echo ""
echo "🔄 USEFUL CAST COMMANDS:"
echo "   # Advance time (1 day = 86400 seconds)"
echo "   cast rpc evm_increaseTime [SECONDS] --rpc-url \$RPC_URL"
echo "   cast rpc evm_mine --rpc-url \$RPC_URL"
echo ""
echo "   # Impersonate an account"
echo "   cast rpc anvil_impersonateAccount [ADDRESS] --rpc-url \$RPC_URL"
echo ""
echo "   # Set account balance"
echo "   cast rpc anvil_setBalance [ADDRESS] [BALANCE_IN_WEI] --rpc-url \$RPC_URL"
echo ""
echo "========================================="
echo "Ready to start testing! 🧪"
echo "Run ./$STARTUP_SCRIPT to begin"
echo "========================================="