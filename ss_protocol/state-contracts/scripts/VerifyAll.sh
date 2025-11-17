#!/bin/bash

# Verification script for all deployed contracts on PulseChain
# Run after deployment to verify on Sourcify

# Contract addresses (update these after deployment)
SWAP_V3="0x329390c539008885491a09Df6798267e643182A1"
STATE_V3="0x72f55666a5CfB5a7C179F9E829402C34bd0708Bd"
AUCTION_ADMIN="0x3F3350E7Cc9F1309182E3280eF9aBB4d042d6aB4"
BUYANDBURN_V2="0xF6Cd74d4DEdB69bE6824F51d669D5F3483962335"
DAV_V3="0xb8bC708aF8dc74DeFAff6A45708f37E046B1498d"
AIRDROP_DISTRIBUTOR="0x0d0F194f1d2652185F42148b584F8381a5c3545F"
SWAP_LENS="0x458D1e955374f3a45278B38ac7ae75bCFfc1c444"

# Constructor arguments
GOV_ADDRESS="0x9FA004E13e780EF5b50ca225ad5DCD4D0Fe9ed70"

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
        --constructor-args $(cast abi-encode "constructor(string,string,address)" "PulseState" "pSTATE" "$SWAP_V3") \
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
    echo "Verifying DAV_V3 at $DAV_V3..."
    forge verify-contract \
        --chain-id 369 \
        --verifier sourcify \
        --constructor-args $(cast abi-encode "constructor(address,address,address,address,address,string,string)" "$STATE_V3" "$GOV_ADDRESS" "$AUCTION_ADMIN" "$BUYANDBURN_V2" "$SWAP_V3" "PulseDAV" "pDAV") \
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
