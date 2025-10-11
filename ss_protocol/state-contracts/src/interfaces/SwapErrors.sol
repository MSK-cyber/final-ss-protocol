// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface SwapErrors {
    error NotGovernance();
    error Unauthorized();
    error PausedErr();
    error UnsupportedToken();
    error ZeroAddr();
    error AlreadySet();
    error ScheduleNotSet();
    error NotStarted();
    error NotToday();
    error Ended();
    error AlreadySwapped();
    error AlreadyReverse();
    error StateNotSet();
    error DavInsufficient();
    error InvalidParam();
    error PairInvalid();
    error PairUsed();
    error TokenExists();
    error NoDAV();
    error InvalidReserves();
    error ReserveFetchFail();
    error InsufficientVault();
    error AmountZero();
    error TimelockNotExpired();
    error NoPendingGov();
    error BadTreasury();
    error ReverseDayLPOonly();
    error ParticipantCapReached();
    error InsufficientBalance();
    error InsufficientAllowance();
    error Step1NotCompleted();
    error Step2NotCompleted();
    error UserNotEligible();
}
