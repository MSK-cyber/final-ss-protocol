# State Protocol - Frontend Setup

This document provides setup instructions for the State Protocol frontend application.

## Prerequisites

- Node.js 18+ and npm
- Git
- Foundry (for smart contract development)
- Code editor (VS Code recommended)
- Wallet browser extension (MetaMask, Rabby, etc.)

## Quick Start

### Clone the Repository

Clone the State Protocol repository from GitHub:

```bash
git clone https://github.com/MSK-cyber/final-ss-protocol.git
```

### Navigate to the Frontend Directory

Move into the Frontend directory:

```bash
cd final-ss-protocol/ss_protocol/Frontend
```

### Install Dependencies

Install the required npm packages:

```bash
npm install
```

### Configure Environment Variables

Create a `.env.local` file in the `Frontend` directory with the following variables:

```env
# Required - Wallet Connection
VITE_REOWN_PROJECT_ID="your_reown_project_id_here"

# Optional - Governance Address Override (for testing)
# VITE_GOVERNANCE_ADDRESS="0xYourGovernanceAddressHere"
```

**Note:** 
- Get your Reown Project ID from [Reown Cloud](https://cloud.reown.com/)
- `VITE_GOVERNANCE_ADDRESS` is for development/testing only - production uses on-chain governance

### Run the Development Server

Start the Vite development server:

```bash
npm run dev
```

The application will be available at `http://localhost:5173`

### Build for Production

Create an optimized production build:

```bash
npm run build
```

The build output will be in the `dist/` directory.

## Features

- **Live Auction Dashboard** - Real-time auction status and participation
- **DAV Token Minting** - Mint DAV tokens to access auctions
- **Portfolio Tracker** - View your holdings and ROI across all auction tokens
- **Airdrop Claims** - Claim your 10,000 token airdrop per DAV unit
- **Normal Auctions** - Burn 30% of tokens for 2x STATE
- **Reverse Auctions** - Swap tokens for STATE, then burn for 2x tokens
- **Holder Rewards** - Claim accumulated DAV holder rewards
- **Admin Console** - Governance-only access for protocol management

## Tech Stack

- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **Wagmi v2** - Ethereum React hooks
- **RainbowKit** - Wallet connection UI
- **TailwindCSS** - Styling
- **Ethers.js v6** - Ethereum library

## Smart Contracts Setup

### Navigate to Contracts Directory

```bash
cd ../state-contracts
```

### Install Dependencies

```bash
forge install
```

### Build Contracts

```bash
forge build
```

### Run Tests

```bash
forge test
```

For detailed deployment instructions, see the main [README.md](../../README.md) in the repository root.

## Configuration

Contract addresses are configured in `src/Constants/ContractAddresses.js`. Update these after deploying contracts:

```javascript
export const CONTRACT_ADDRESSES = {
  369: { // PulseChain Mainnet
    AUCTION: "0xYourSwapV3Address",
    STATE: "0xYourStateV3Address",
    DAV: "0xYourDavV3Address",
    AIRDROP_DISTRIBUTOR: "0xYourAirdropAddress",
    AUCTION_ADMIN: "0xYourAuctionAdminAddress",
    BUY_BURN_CONTROLLER: "0xYourBuyBurnAddress",
    SWAP_LENS: "0xYourSwapLensAddress"
  }
};
```

## Troubleshooting

**Wallet Connection Issues:**
- Ensure you have a Web3 wallet extension installed
- Check that you're connected to PulseChain (Chain ID: 369)
- Try refreshing the page or reconnecting your wallet

**Build Errors:**
- Clear node_modules: `rm -rf node_modules package-lock.json && npm install`
- Ensure Node.js version is 18 or higher: `node --version`

**Contract Interaction Errors:**
- Verify contract addresses in `ContractAddresses.js`
- Check that ABIs in `src/ABI/` match deployed contracts
- Ensure you have sufficient PLS for gas fees

## Contributing

This is a decentralized protocol with renounced ownership on core contracts. Community contributions are welcome via pull requests.

## License

MIT License - see [LICENSE](../../../LICENSE) for details

## Support

- **Repository:** https://github.com/MSK-cyber/final-ss-protocol
- **Issues:** https://github.com/MSK-cyber/final-ss-protocol/issues
