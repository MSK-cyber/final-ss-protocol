#!/bin/bash

target="0xc97e10ce"
echo "Looking for signature that matches: $target"
echo "Checking more specific patterns..."
echo ""

# More specific patterns including some with parameters
errors=(
    "TRANSFER_FROM_FAILED()"
    "APPROVE_FAILED()"
    "INSUFFICIENT_ALLOWANCE()"
    "INSUFFICIENT_BALANCE()"
    "INVALID_RECIPIENT()"
    "INVALID_SENDER()"
    "BURN_FAILED()"
    "MINT_FAILED()"
    "SWAP_FAILED()"
    "ADD_LIQUIDITY_FAILED()"
    "REMOVE_LIQUIDITY_FAILED()"
    "DEADLINE_EXCEEDED()"
    "ROUTER_EXPIRED()"
    "PAIR_EXISTS()"
    "IDENTICAL_ADDRESSES()"
    "INSUFFICIENT_A_AMOUNT()"
    "INSUFFICIENT_B_AMOUNT()"
    "OPTIMAL_AMOUNT_EXCEEDED()"
    "LOCKED()"
    "REENTRANCY()"
    "PAUSED()"
    "NOT_INITIALIZED()"
    "ALREADY_INITIALIZED()"
    "CALLER_NOT_AUTHORIZED()"
    "OPERATION_NOT_ALLOWED()"
    "STALE_PRICE()"
    "PRICE_TOO_OLD()"
    "ORACLE_FAILURE()"
    "NO_RESERVES()"
    "K_INVARIANT_VIOLATION()"
    "SAFETY_CHECK_FAILED()"
    "InvalidPermitSignature()"
    "PermitDeadlineExpired()"
    "InsufficientReserves()"
    "TransferAmountExceedsBalance()"
    "TransferAmountExceedsAllowance()"
    "TransferToZeroAddress()"
    "TransferFromZeroAddress()"
    "ApproveToZeroAddress()"
    "ApproveFromZeroAddress()"
    "MintToZeroAddress()"
    "BurnFromZeroAddress()"
    "BurnAmountExceedsBalance()"
)

for error in "${errors[@]}"; do
    hash=$(cast keccak "$error")
    sig="${hash:0:10}"
    printf "%-35s -> %s" "$error" "$sig"
    if [ "$sig" = "$target" ]; then
        echo " *** MATCH! ***"
    else
        echo ""
    fi
done
