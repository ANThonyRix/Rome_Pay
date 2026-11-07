# Rome Pay

USDC payment links for [Rome Protocol](https://www.rome.builders/). One invoice can be paid from an
Ethereum wallet (MetaMask) or a Solana wallet (Solflare). The USDC goes straight from the payer to the
merchant in a single transaction. Rome Pay never holds the funds.

> Status: live on **Rome Hadrian testnet** (chain ID 200010). Not deployed on mainnet yet.

## How it works

1. A merchant creates a payment link: a fixed amount, or an open amount the payer enters.
2. The payer opens `/pay/<id>`, picks a wallet, and follows the route shown on the page.
3. `PayRouter.pay(merchant, amount, ref)` moves wUSDC from the payer to the merchant and emits
   `Paid(ref, merchant, payer, amount, fee)`. `ref` is derived from the invoice ID, so every payment
   can be matched to its invoice on-chain.

Rome runs EVM transactions on Solana, so both wallets reach the same contract:

| Lane | Wallet | Steps before `pay` |
|---|---|---|
| EVM | MetaMask on Rome Hadrian | wrap gas USDC into wUSDC, one-time wrapper grant, approve |
| Solana | Solflare on Solana Devnet | one-time account setup, approve, fund, grant |

One-time steps are skipped when the wallet has already done them.

## Fees

The protocol fee is set in the contract (`feeBps`, capped at 1% by `MAX_FEE_BPS`). It is taken out of
the payment amount and sent to the treasury in the same transaction. On testnet the fee is **1%**.
Each `Paid` event records the fee, so the service's earnings can be checked on-chain.

## Deployments

| Network | Contract | Address |
|---|---|---|
| Rome Hadrian (200010) | PayRouter | [`0xb2c77558e9720da0888ac9632192cb086de377db`](https://via-hadrian.testnet.romeprotocol.xyz/address/0xb2c77558e9720da0888ac9632192cb086de377db) |
| Rome Hadrian (200010) | wUSDC (token) | `0xbce339ba4c3a8de3bb8af1c5539e6ac11da3112d` |
| Rome Hadrian (200010) | Fee treasury | `0xdc2f0Cc3FFe14d4563571711a0bd817d8Fb20388` |

## Repository layout

```
pay/
  contracts/   PayRouter (Solidity 0.8.28, Hardhat 3, OpenZeppelin 5), tests and scripts
  web/         Checkout app (Next.js 16, React 19, viem, @solana/web3.js)
    vendor/rome-sdk/   Rome SDK v0.4.0, vendored (MIT, see VENDORED.md)
```

## Run the checkout locally

Requires Node.js 22+.

```bash
cd pay/web
npm install
npm run dev
```

Open http://localhost:3000/pay/demo. To pay on testnet you need:

- **MetaMask**: test USDC on Rome Hadrian. Get Sepolia or Solana Devnet USDC from the
  [Circle faucet](https://faucet.circle.com/), then bridge it with the
  [Rome bridge](https://bridge-api.devnet.romeprotocol.xyz/?chain=200010).
  The checkout adds the Hadrian network to MetaMask for you.
- **Solflare**: switched to Devnet, with some devnet SOL and Devnet USDC from the Circle faucet.

## Contracts

```bash
cd pay/contracts
npm install
npm test                      # unit tests
npx hardhat keystore set PRIVATE_KEY   # deployer key, stored encrypted by Hardhat
npm run deploy:hadrian
```

Owner scripts (the private key is read from the Hardhat keystore):

| Command | Env | What it does |
|---|---|---|
| `npm run fee:hadrian` | `PAY_ROUTER`, `FEE_RECIPIENT`, `FEE_BPS` (default 100) | Sets the protocol fee |
| `npm run smoke:hadrian` | `PAY_ROUTER`, `PAY_MERCHANT`, `PAY_AMOUNT` | Sends one real test payment |

Contracts are compiled for the `paris` EVM version, because Rome does not document support for
`PUSH0`, `MCOPY` or `TSTORE`.

## Deploy to Vercel

Import this repository in Vercel and set **Root Directory** to `pay/web`. The framework preset is
detected as Next.js. Every push to `main` triggers a new deployment.

## Roadmap

- Merchant dashboard with wallet sign-in: create links, operation history
- Open-amount links for tips and donations
- Payment verification and signed webhooks for merchants
- Public earnings page: fees collected and treasury balance
- Mainnet (Rome Rubicon) deployment
