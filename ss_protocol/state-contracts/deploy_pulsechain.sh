#!/bin/bash

# Start Anvil with Pulsechain fork
echo "Starting Anvil with Pulsechain mainnet fork..."

# Kill any existing anvil processes
pkill -f anvil

# Start anvil with Pulsechain fork
anvil \
  --fork-url https://rpc.pulsechain.com \
  --fork-block-number latest \
  --host 0.0.0.0 \
  --port 8545 \
  --chain-id 369 \
  --gas-limit 30000000 \
  --accounts 10 \
  --balance 10000 \
  --block-time 1 \
  &

# Wait for anvil to start
sleep 3

echo "Anvil started! Deploying contracts..."

# Deploy the contracts
forge script script/DeployComplete.s.sol:DeployComplete \
  --rpc-url http://localhost:8545 \
  --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  --broadcast \
  --legacy

echo "Deployment complete!"
echo "Anvil is running on http://localhost:8545"
echo "Chain ID: 369 (PulseChain)"
echo "Default private key: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"