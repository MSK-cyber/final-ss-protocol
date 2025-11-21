#!/bin/bash

# Verification script for all deployed contracts on PulseChain
# Run after deployment to verify on Sourcify

# Contract addresses (update these after deployment)
SWAP_V3="0xad63be034EB210e8870Ddb22541856f96302C344"
STATE_V3="0xd290bC9cFaEdf2A90174f669BF9Aad7E71180451"
AUCTION_ADMIN="0x5094FA04929684b6904bb9184f813D686906533a"
BUYANDBURN_V2="0xe90444017e9349Dd62abC09FE26e6907E6350C56"
DAV_V3="0xE843FE90dF63659d1957237ee8E91232Eedd36B3"
AIRDROP_DISTRIBUTOR="0x5346B394b5b36D6d9f1fE4785D56C0D4644085d3"
SWAP_LENS="0xAF2190CC157b184A371016Ca0EA471D6bFdbF541"

# Constructor arguments
GOV_ADDRESS="0xBAaB2913ec979d9d21785063a0e4141e5B787D28"

echo "=== VERIFYING CONTRACTS ON SOURCIFY ==="
echo ""

# Verify SWAP_V3
if [ ! -z "$SWAP_V3" ]; then
    echo "Verifying SWAP_V3 at $SWAP_V3..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address)" "$GOV_ADDRESS") \
        $SWAP_V3 \
        src/AuctionSwap.sol:SWAP_V3
    echo ""
fi

# Verify STATE_V3
if [ ! -z "$STATE_V3" ]; then
    echo "Verifying STATE_V3 at $STATE_V3..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(string,string,address)" "PulseState" "pSTATE1" "$SWAP_V3") \
        $STATE_V3 \
        src/StateToken.sol:STATE_V3
    echo ""
fi

# Verify AuctionAdmin
if [ ! -z "$AUCTION_ADMIN" ]; then
    echo "Verifying AuctionAdmin at $AUCTION_ADMIN..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address,address)" "$SWAP_V3" "$GOV_ADDRESS") \
        $AUCTION_ADMIN \
        src/AuctionAdmin.sol:AuctionAdmin
    echo ""
fi

# Verify BuyAndBurnController_V2
if [ ! -z "$BUYANDBURN_V2" ]; then
    WPLS="0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
    PULSEX_ROUTER="0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"
    PULSEX_FACTORY="0x1715a3E4A142d8b698131108995174F37aEBA10D"
    
    echo "Verifying BuyAndBurnController_V2 at $BUYANDBURN_V2..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address,address,address,address,address,address,address)" "$STATE_V3" "$WPLS" "$PULSEX_ROUTER" "$PULSEX_FACTORY" "$SWAP_V3" "$AUCTION_ADMIN" "$GOV_ADDRESS") \
        $BUYANDBURN_V2 \
        src/BuyAndBurnController_V2.sol:BuyAndBurnController_V2
    echo ""
fi

# Verify DAV_V3
if [ ! -z "$DAV_V3" ]; then
    PULSEX_ROUTER_V2="0x98bf93ebf5c380C0e6Ae8e192A7e2AE08edAcc02"
    WPLS="0xA1077a294dDE1B09bB078844df40758a5D0f9a27"
    
    echo "Verifying DAV_V3 at $DAV_V3..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address,address,address,address,address,address,address,string,string)" "$STATE_V3" "$GOV_ADDRESS" "$AUCTION_ADMIN" "$BUYANDBURN_V2" "$SWAP_V3" "$PULSEX_ROUTER_V2" "$WPLS" "PulseDAV" "pDAV1") \
        $DAV_V3 \
        src/DavToken.sol:DAV_V3
    echo ""
fi

# Verify AirdropDistributor
if [ ! -z "$AIRDROP_DISTRIBUTOR" ]; then
    echo "Verifying AirdropDistributor at $AIRDROP_DISTRIBUTOR..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address,address,address)" "$SWAP_V3" "$DAV_V3" "$STATE_V3") \
        $AIRDROP_DISTRIBUTOR \
        src/AirdropDistributor.sol:AirdropDistributor
    echo ""
fi

# Verify SwapLens
if [ ! -z "$SWAP_LENS" ]; then
    echo "Verifying SwapLens at $SWAP_LENS..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        $SWAP_LENS \
        src/SwapLens.sol:SwapLens
    echo ""
fi

echo "=== VERIFICATION COMPLETE ==="
echo ""
echo "Check verification status at:"
echo "https://repo.sourcify.dev/contracts/full_match/369/"
