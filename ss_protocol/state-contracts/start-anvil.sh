#!/bin/bash

# Anvil PulseChain Mainnet Fork Startup Script
# This script starts Anvil with a PulseChain mainnet fork and 100k PLS balance for test accounts

echo "🔥 Starting Anvil with PulseChain Mainnet Fork"
echo "💰 Setting up accounts with 100,000 PLS balance each"
echo ""

# PulseChain mainnet RPC URL
PULSECHAIN_RPC="https://rpc.pulsechain.com"

# Start Anvil with PulseChain fork
anvil \
  --fork-url $PULSECHAIN_RPC \
  --chain-id 369 \
  --balance 100000 \
  --accounts 10 \
  --host 0.0.0.0 \
  --port 8545 \
  --gas-limit 30000000 \
  --gas-price 20000000000 \
  --block-time 2 \
  --mnemonic "test test test test test test test test test test test junk" \
  --silent &

# Save the process ID
ANVIL_PID=$!
echo "🚀 Anvil started with PID: $ANVIL_PID"
echo "🌍 RPC URL: http://localhost:8545"
echo "⛓️  Chain ID: 369 (PulseChain)"
echo "🔗 Forked from: $PULSECHAIN_RPC"
echo ""

echo "📋 Test Accounts (each with 100,000 PLS):"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Account 0 (Governance): 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
echo "Account 1 (Dev Wallet):  0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
echo "Account 2 (Liquidity):   0x3C44CdDdB6a900fA2b585dd299e07d12fA4293BC"
echo "Account 3 (Executor):    0x90F79bf6EB2c4f870365E785982E1f101E93b906"
echo "Account 4 (User 1):      0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65"
echo "Account 5 (User 2):      0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc"
echo "Account 6 (User 3):      0x976EA74026E726554dB657fA54763abd0C3a0aa9"
echo "Account 7 (User 4):      0x14dC79964da2C08b23698B3D3cc7Ca32193d9955"
echo "Account 8 (User 5):      0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f"
echo "Account 9 (User 6):      0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
echo ""

echo "🔑 Private Keys:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Account 0: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "Account 1: 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d"
echo "Account 2: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a"
echo "Account 3: 0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6"
echo ""

echo "🔧 Environment Variables for Deployment:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo "export RPC_URL=http://localhost:8545"
echo "export CHAIN_ID=369"
echo ""

echo "🛠️  Deployment Commands:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "# 1. Deploy core contracts:"
echo "forge script script/AnvilMainnetDeploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo "# 2. Deploy test tokens (after setting STATE_ADDRESS, SWAP_ADDRESS, LP_HELPER_ADDRESS):"
echo "forge script script/AnvilTestTokenDeploy.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo "# 3. Deploy tokens via UI flow (proper auction integration):"
echo "forge script script/CompleteUIFlow.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""
echo "# 4. Check system status:"
echo "forge script script/SystemStatus.s.sol"
echo ""
echo "# 5. Run comprehensive tests:"
echo "forge script script/AnvilSystemTest.s.sol --rpc-url http://localhost:8545 --broadcast --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
echo ""

echo "⚠️  To stop Anvil:"
echo "kill $ANVIL_PID"
echo ""

echo "✅ Anvil is running in the background!"
echo "📡 Ready for contract deployment and testing"

# Wait a moment to ensure Anvil is fully started
sleep 3

# Test connection
echo "🔍 Testing connection to Anvil..."
curl -X POST -H "Content-Type: application/json" --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' http://localhost:8545 > /dev/null 2>&1

if [ $? -eq 0 ]; then
    echo "✅ Connection successful! Anvil is ready."
else
    echo "❌ Connection failed. Please check if Anvil started correctly."
fi