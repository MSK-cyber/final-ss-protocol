#!/bin/bash

# Verification script for all deployed contracts on PulseChain
# Run after deployment to verify on Sourcify

# Contract addresses (update these after deployment)
SWAP_V3="0x27a7F4Adc36A8a94696BE83519AFd391A4719C7A"
STATE_V3="0x834A4eE2849E25b94A4aB6bC19D3CD0542256244"
AUCTION_ADMIN="0xA001442C5147BBCbA73CafA86Ef90225086cF7e1"
BUYANDBURN_V2="0x1ACC1dc6E734A0fb7ca8Ab128F3D34f20092bC11"
DAV_V3="0xf01D3b66458Ef4a419679480ba59ADf646E4c838"
AIRDROP_DISTRIBUTOR="0x99F563cb688834134668858837dF97d50346F906"
SWAP_LENS="0x82c3491e629Da99b785FFBb86cec02a77E5732Fb"

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
        --constructor-args $(cast abi-encode "constructor(string,string,address)" "PulseSTATE1" "pSTATE1" "$SWAP_V3") \
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
        --constructor-args $(cast abi-encode "constructor(address,address,address,address,address,address,address,string,string)" "$STATE_V3" "$GOV_ADDRESS" "$AUCTION_ADMIN" "$BUYANDBURN_V2" "$SWAP_V3" "$PULSEX_ROUTER_V2" "$WPLS" "PulseDAV1" "pDAV1") \
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
