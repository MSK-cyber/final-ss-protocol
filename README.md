# State Protocol - Decentralized Auction System

A comprehensive DeFi protocol on PulseChain implementing a dual-auction system (Normal & Reverse) for token distribution, powered by time-limited DAV (Decentralized Auction Voucher) tokens.

## 🌟 Overview

State Protocol is a decentralized token distribution platform featuring:

- **50 Auction Tokens** rotating daily over 1,000 days (20 cycles per token)
- **24-hour auction duration** with daily boundaries at GMT+3 17:00 (5 PM)
- **DAV Token System** - Time-limited vouchers (30-day expiry) granting auction access
- **Dual Auction Mechanism** - Normal auctions (burn for STATE) and Reverse auctions (swap STATE for tokens)
- **Buy & Burn Economics** - 80% of DAV mint fees fund STATE buyback and permanent burn
- **Holder Rewards** - 10% of DAV mint fees distributed to active DAV holders
- **Maximum 2,500 unique participants** across all auctions

## 📋 Table of Contents

- [Core Contracts](#core-contracts)
- [Architecture](#architecture)
- [Auction Mechanics](#auction-mechanics)
- [DAV Token Economics](#dav-token-economics)
- [Deployment](#deployment)
- [Security Features](#security-features)
- [Technical Specifications](#technical-specifications)
- [Frontend](#frontend)
- [License](#license)

## 🏗️ Core Contracts

### 1. **SWAP_V3** (AuctionSwap.sol)
Main auction contract managing both Normal and Reverse auctions.

**Key Features:**
- 50 token auction schedule over 1,000 days
- Normal Auction: Burn 30% of airdropped tokens → Receive 2x STATE based on pool ratio
- Reverse Auction: Swap tokens → STATE → Burn STATE → Receive 2x tokens
- PulseX DEX integration for liquidity operations
- Automated price oracle using pool reserves

**Important Functions:**
```solidity
// Normal Auction (Step 2)
function normalAuction(address token, uint256 amountIn, uint256 minStateOut, uint256 deadline)

// Reverse Auction (Step 1: Swap tokens for STATE)
function reverseAuction(address token, uint256 amountIn, uint256 minStateOut, uint256 deadline)

// Reverse Auction (Step 2: Burn STATE for 2x tokens)
function reverseClaimDoubleBurn(address token, uint256 stateAmount, uint256 minTokensOut)
```

### 2. **STATE_V3** (StateToken.sol)
Protocol native token with fixed supply.

**Specifications:**
- **Total Supply:** 100 trillion tokens (100,000,000,000,000 × 10^18)
- **Symbol:** pSTATE1
- **Allocation:** 100% minted to SWAP_V3 contract at deployment
- **Governance:** Ownership renounced - fully decentralized
- **Security:** No mint, burn, or admin functions post-deployment

### 3. **DAV_V3** (DavToken.sol)
Decentralized Auction Voucher - time-limited access token.

**Features:**
- **Mint Cost:** 1,500,000 PLS per DAV token
- **Expiry:** 30 days from mint (refreshed on governance transfers)
- **Max Supply:** 10,000,000 DAV tokens
- **Holder Cap:** 2,500 unique wallets
- **Fee Distribution:**
  - 80% → Buy & Burn Controller (STATE buyback)
  - 10% → Active DAV holder rewards
  - 5% → Development wallet
  - 5% → Referral bonus (if applicable)

**Holder Rewards:**
- Proportional distribution based on active DAV balance
- ROI verification required (portfolio value ≥ DAV mint cost)
- Claimable after meeting ROI threshold

### 4. **AirdropDistributor**
Distributes auction tokens to DAV holders during Normal auction days.

**Mechanics:**
- **Airdrop Amount:** 10,000 tokens per 1 DAV unit
- **Eligibility:** Active DAV balance (non-expired)
- **Cycle Tracking:** Independent consumption tracking per token cycle
- **Availability:** Normal auction days only (disabled on Reverse days)

### 5. **AuctionAdmin**
Administrative contract with governance timelock.

**Capabilities:**
- Token deployment (new auction tokens)
- Governance transfer (7-day timelock)
- Development fee wallet management (max 5 wallets)
- PulseX liquidity pool creation

**Security:**
- 7-day timelock on all governance changes
- Multi-signature governance support
- Fee wallet percentage validation (must sum to 100%)

### 6. **BuyAndBurnController_V2**
Manages STATE buyback and permanent burn operations.

**Functions:**
- PLS → WPLS conversion
- STATE/WPLS pool creation and management
- Optimal ratio-aware buy & burn execution
- LP token burning (permanent liquidity lock)
- Governance-controlled operations

### 7. **SwapLens**
Read-only view contract for efficient data aggregation.

**Provides:**
- User auction statistics
- Portfolio valuation
- Active auction schedules
- Pool reserve data
- Gas-optimized batch queries

## 🎯 Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     State Protocol                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │   DAV_V3     │──────│  SWAP_V3     │                   │
│  │ (1.5M PLS)   │      │  (Auctions)  │                   │
│  └──────┬───────┘      └──────┬───────┘                   │
│         │                     │                            │
│         │ 80% Fees            │ Pool Integration           │
│         ↓                     ↓                            │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │ BuyAndBurn   │      │   PulseX     │                   │
│  │ Controller   │──────│     DEX      │                   │
│  └──────────────┘      └──────────────┘                   │
│         │                     │                            │
│         │                     │                            │
│         ↓                     ↓                            │
│  ┌──────────────────────────────────┐                     │
│  │      STATE Token (100T)          │                     │
│  │  Buyback → Burn → Deflation      │                     │
│  └──────────────────────────────────┘                     │
│                                                             │
│  ┌──────────────┐      ┌──────────────┐                   │
│  │ AuctionAdmin │      │  SwapLens    │                   │
│  │ (Governance) │      │  (Analytics) │                   │
│  └──────────────┘      └──────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

## 🔄 Auction Mechanics

### Normal Auction (3-Step Process)

**Step 1: Claim Airdrop** (via AirdropDistributor)
```
- User has active DAV balance
- Claims 10,000 tokens per 1 DAV unit
- DAV units consumed and tracked per cycle
```

**Step 2: Burn for STATE** (via SWAP_V3)
```
- Burn 30% of airdropped tokens (3,000 from 10,000)
- Receive 2x STATE based on STATE/Token pool ratio
- STATE transferred to user's wallet
```

**Step 3: Use STATE**
```
- Swap STATE for other tokens on PulseX
- Participate in reverse auctions
- Hold for long-term appreciation
```

### Reverse Auction (2-Step Process)

**Step 1: Swap Tokens for STATE** (via SWAP_V3)
```
- Deposit auction tokens
- Swap via PulseX STATE/Token pool
- Receive STATE tokens
```

**Step 2: Burn STATE for 2x Tokens** (via SWAP_V3)
```
- Burn received STATE tokens
- Get 2x auction tokens based on pool ratio
- Tokens transferred to user's wallet
```

## 💰 DAV Token Economics

### Minting Process

1. **Cost:** 1,500,000 PLS per DAV token
2. **Fee Distribution:**
   - 80% (1,200,000 PLS) → BuyAndBurnController
   - 10% (150,000 PLS) → Active DAV holder pool
   - 5% (75,000 PLS) → Development wallet
   - 5% (75,000 PLS) → Referral code owner (optional)

### Holder Rewards

**Accumulation:**
- 10% of every DAV mint distributed to holders
- Proportional to active DAV balance
- Real-time calculation (no caching)

**Claiming Requirements:**
1. Portfolio value ≥ Total DAV mint cost
2. Active DAV balance (non-expired)
3. ROI verification via portfolio valuation

**Calculation:**
```solidity
Portfolio Value = Sum of all auction token values in PLS
Required Value = (DAV minted count) × 1,500,000 PLS
Claimable = Portfolio Value ≥ Required Value
```

### Expiry System

- **Duration:** 30 days from mint timestamp
- **Refresh:** Governance transfers reset expiry
- **Grace Period:** None - hard cutoff at 30 days
- **Effect:** Expired DAV excluded from rewards and airdrop claims

## 🚀 Deployment

### Prerequisites

```bash
# Install Foundry
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Clone repository
git clone https://github.com/CoolBoyMSK/final-ss-protocol.git
cd final-ss-protocol/ss_protocol/state-contracts

# Install dependencies
forge install
```

### Build

```bash
# Compile contracts
forge build

# Run tests
forge test

# Gas report
forge test --gas-report
```

### Deploy to PulseChain Mainnet

Sequential deployment required (7 contracts):

```bash
# 1. Deploy SWAP_V3
forge script scripts/Deploy01_SWAP_V3.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 2. Deploy STATE_V3
forge script scripts/Deploy02_STATE_V3.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 3. Deploy AuctionAdmin
forge script scripts/Deploy03_AuctionAdmin.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 4. Deploy BuyAndBurnController_V2
forge script scripts/Deploy04_BuyAndBurnController.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 5. Deploy DAV_V3
forge script scripts/Deploy05_DAV_V3.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 6. Deploy AirdropDistributor
forge script scripts/Deploy06_AirdropDistributor.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify

# 7. Deploy SwapLens
forge script scripts/Deploy07_SwapLens.s.sol --rpc-url $PULSECHAIN_RPC --broadcast --verify
```

### Verify All Contracts

```bash
cd scripts
./VerifyAll.sh
```

## 🔒 Security Features

### Smart Contract Security

- **Solidity 0.8.20:** Built-in overflow/underflow protection
- **OpenZeppelin Contracts:** Battle-tested ERC20, Ownable, ReentrancyGuard
- **SafeERC20:** Protected token transfers with revert on failure
- **Paris EVM:** PulseChain compatibility (no MCOPY opcode)

### Access Control

- **Ownership Renounced:** STATE_V3, AirdropDistributor (fully autonomous)
- **Governance Timelock:** 7-day delay on all governance changes
- **Multi-signature Support:** Compatible with Gnosis Safe
- **Pausable System:** Emergency pause via governance (DAV transfers only)

### Economic Security

- **Hard Caps:**
  - Maximum 2,500 unique participants
  - Maximum 10,000,000 DAV tokens
  - Fixed 100 trillion STATE supply
  
- **Anti-Manipulation:**
  - Slippage protection on all swaps
  - Deadline checks on time-sensitive operations
  - Pool reserve validation

- **Transparency:**
  - All calculations on-chain (no oracles)
  - Complete mint/expiry history preserved
  - Public audit trail via events

### Reentrancy Protection

All state-changing functions protected with `nonReentrant` modifier:
- DAV minting and claiming
- Auction participation
- Buy & Burn operations
- Token swaps and transfers

## 📊 Technical Specifications

### Network
- **Blockchain:** PulseChain Mainnet
- **Chain ID:** 369
- **DEX:** PulseX (Uniswap V2 fork)
- **Gas Token:** PLS

### Token Standards
- **ERC20:** STATE_V3, DAV_V3, TOKEN_V3
- **Decimals:** 18 (all tokens)

### Time Configuration
- **Timezone:** GMT+3 (UTC+3)
- **Daily Boundary:** 17:00 (5 PM)
- **Auction Duration:** 24 hours
- **DAV Expiry:** 30 days
- **Governance Timelock:** 7 days

### Limits & Constants
```solidity
// SWAP_V3
MAX_CYCLES_PER_TOKEN = 20        // 20 cycles per auction token
AUCTION_SCHEDULE_SIZE = 50       // 50 unique auction tokens
AIRDROP_PER_DAV = 10,000         // Tokens per DAV unit
NORMAL_AUCTION_BURN_PCT = 30     // 30% burn in normal auction

// DAV_V3
DAV_MINT_COST = 1,500,000 PLS    // Cost per DAV token
MAX_SUPPLY = 10,000,000          // Maximum DAV tokens
MAX_HOLDERS = 2,500              // Maximum unique wallets
DAV_EXPIRY_DURATION = 30 days    // Time until expiry

// STATE_V3
TOTAL_SUPPLY = 100 trillion      // Fixed total supply

// AuctionAdmin
GOVERNANCE_TIMELOCK = 7 days     // Governance change delay
MAX_DEV_WALLETS = 5              // Maximum fee wallets
```

### Libraries

**TimeUtilsLib:**
- GMT+3 17:00 boundary calculations
- Daily index computation
- Timestamp validation

**AuctionLib:**
- Auction cycle management
- Schedule validation
- State transitions

**NormalAuctionCalculations:**
- 2x STATE output calculation
- 30% burn mechanics
- Pool ratio integration

**ReverseAuctionCalculations:**
- 2x token output calculation
- STATE burn requirements
- Slippage validation

**BurnLib:**
- Permanent token burning
- Burn event emission
- Balance verification

**SwapCoreLib:**
- PulseX integration
- Liquidity operations
- Price oracle

**Distribution:**
- DAV holder rewards
- Proportional allocation
- Gas-optimized iteration

**ReferralCodeLib:**
- Code generation and validation
- Referral tracking
- 5% bonus distribution

## 🎨 Frontend

Located in `ss_protocol/Frontend/`:

### Features
- Live auction dashboard
- DAV minting interface
- Portfolio tracker with ROI calculation
- Airdrop claiming
- Normal/Reverse auction participation
- Holder rewards management
- Real-time price feeds

### Stack
- React 18
- Vite build tool
- Wagmi + RainbowKit (wallet connection)
- TailwindCSS
- Ethers.js v6

### Running Locally

```bash
cd ss_protocol/Frontend
npm install
npm run dev
```

### Production Build

```bash
npm run build
```

## 📄 License

This project is licensed under the MIT License.

## 🔗 Links

- **Repository:** https://github.com/CoolBoyMSK/final-ss-protocol
- **PulseChain:** https://pulsechain.com
- **PulseX DEX:** https://pulsex.com

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Use at your own risk. Always conduct your own research and due diligence before interacting with any smart contracts.

---

**Built with ❤️ for the PulseChain ecosystem**
