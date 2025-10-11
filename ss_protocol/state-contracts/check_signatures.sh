#!/bin/bash

target="0xc97e10ce"
echo "Looking for signature that matches: $target"
echo ""

# Common error patterns to check
errors=(
    "TokenNotFound()"
    "InvalidToken()"
    "ZeroAmount()"
    "ZeroAddress()"
    "NotOwner()"
    "CallFailed()"
    "ExecutionFailed()"
    "InsufficientBalance()"
    "TransferFailed()"
    "ApproveFailed()"
    "InvalidAddress()"
    "InvalidAmount()"
    "Unauthorized()"
    "Forbidden()"
    "NotAllowed()"
    "InvalidState()"
    "ContractPaused()"
    "InvalidInput()"
    "OutOfBounds()"
    "Overflow()"
    "Underflow()"
    "DivisionByZero()"
    "InvalidSignature()"
    "ExpiredDeadline()"
    "SlippageExceeded()"
    "InsufficientLiquidity()"
    "PairNotFound()"
    "ReserveOverflow()"
    "InvalidPath()"
    "ExcessiveInputAmount()"
    "InsufficientOutputAmount()"
    "InsufficientInputAmount()"
    "UniswapV2InsufficientOutputAmount()"
    "UniswapV2InsufficientInputAmount()"
    "UniswapV2ExcessiveInputAmount()"
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
