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

## FAQ

`/faq` explains the service in plain words for payers and merchants (paying, getting paid, fees, safety).
The text lives in `pay/web/app/faq/page.tsx`; keep it in step with the checkout and fee when they change.

## Merchant dashboard and payment records

- `/dashboard`: the merchant signs in with their wallet, a free message signature: any EVM wallet
  such as MetaMask or Rabby (Sign-In with Ethereum), or any Solana wallet such as Solflare, Phantom or Backpack
  (Sign-In with Solana). The dashboard belongs to the address, not the wallet app. There they create links (fixed or open amount, single-use or reusable), copy or close
  them, set a display name and see every payment with its fee. A fixed-amount link takes either one
  payment (an invoice) or many (a price tag). A link that never took a payment can be deleted; paid
  links are closed instead, so the history keeps saying what each payment was for.
- Links, sessions and payments live in Postgres (Neon). A payment is recorded three ways, each
  idempotent: the checkout reports its transaction hash to `/api/payments` (the server reads the
  receipt), pages pick up new `Paid` events with `eth_getLogs` when opened, and a daily Vercel cron
  (`/api/cron/reconcile`) catches anything left over.
- Links cover invoices (fixed amount, one payment), price tags (fixed amount, many payments), and
  tips, gifts or donations (open amount, the payer enters it).

### Solflare merchants

A merchant who signs in with Solflare is paid to the wallet's Rome address: the Rome synthetic of
the Solflare key, `keccak256(pubkey)[12:]`, the same derivation as the Rome SDK. The dashboard shows
that balance and a **Move to Solflare** button. It sets up the synthetic once (`create_pda`), creates
the wallet's USDC account if missing, then moves the whole balance with the SDK's sweep leg
(`HelperProgram.transfer_spl`). Solana network fees are paid in SOL.

## Payment notifications

Every payment stored for the first time is queued once per channel (an outbox table). Delivery runs
right after the checkout reports a payment, after a dashboard visit that finds new payments, and in
the daily cron. A failed delivery is retried at 1 min, 5 min, 30 min, 2 h and 12 h, at the next of
those triggers; after 6 attempts it is marked as given up. The dashboard lists recent deliveries.

### Telegram

The merchant presses **Connect Telegram**, opens the bot and presses Start. The bot then sends a
message for every payment: amount, what it was for, payer and a receipt link. `/stop` in the chat
turns it off.

Setup: create a bot with [@BotFather](https://t.me/BotFather), put its token in `TELEGRAM_BOT_TOKEN`
and redeploy. The first Connect registers the bot's webhook at `/api/telegram` on the production
domain; Telegram's requests are checked with a secret derived from the token.

### Webhooks

The merchant saves an HTTPS address. Each payment is sent as a `POST` with a JSON body:

```json
{
  "id": "evt_<tx hash without 0x>_<n>",
  "type": "payment.received",
  "created": 1762560000,
  "network": { "chainId": 200010, "name": "Rome Hadrian", "testnet": true },
  "data": {
    "link": { "id": "Ab3...", "memo": "Order 1042", "amount": "5000000" },
    "merchant": "0x...", "payer": "0x...", "token": "wUSDC", "decimals": 6,
    "amount": "5000000", "fee": "50000", "net": "4950000",
    "txHash": "0x...", "blockNumber": "519700000", "paidAt": "2026-11-08T12:00:00.000Z",
    "receiptUrl": "https://via-hadrian.testnet.romeprotocol.xyz/tx/0x..."
  }
}
```

Amounts and the block number are strings; amounts are in base units (6 decimals). `link` is `null` for a payment that did not come
from one of the merchant's links. The **Send test event** button sends `"type": "test"`.

Headers: `rome-pay-event-id` (same as `id`, use it to ignore repeats) and
`rome-pay-signature: t=<unix seconds>,v1=<hex>`, where `v1` is HMAC-SHA256 of `"<t>.<raw body>"`
with the merchant's signing secret (`whsec_...`, shown in the dashboard). Answer with any 2xx within
8 seconds. Redirects are not followed, and addresses that resolve to private networks are refused.

```js
import { createHmac, timingSafeEqual } from "node:crypto";

// rawBody: the request body exactly as received, before JSON.parse.
function verifyRomePay(rawBody, header, secret, toleranceSec = 300) {
  const parts = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  const t = Number(parts.t);
  if (!t || Math.abs(Date.now() / 1000 - t) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const given = String(parts.v1 ?? "");
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
```

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

Open http://localhost:3000/pay/demo. The demo link works without a database. For the dashboard,
link the project to Vercel and pull its environment, then create the tables once:

```bash
npx vercel link
npx vercel env pull .env.local
npm run db:migrate
```

| Variable | Where it comes from | Used for |
|---|---|---|
| `DATABASE_URL` | Neon integration in Vercel | links, sessions, payments |
| `CRON_SECRET` | set by hand in Vercel, any long random string | authorizes the daily reconcile cron |
| `TELEGRAM_BOT_TOKEN` | optional, from @BotFather | Telegram payment messages |
| `WEBHOOK_ALLOW_PRIVATE` | optional, `1` in local development only | lets webhooks reach `http://localhost` (ignored in production) |
| `NEXT_PUBLIC_SOLANA_RPC` | optional | Solana Devnet RPC for the Solflare lane |

To pay on testnet you need:

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
detected as Next.js. Every push to `main` triggers a new deployment. Add the Neon integration
(it sets `DATABASE_URL`) and `CRON_SECRET`, then run `npm run db:migrate` once. `vercel.json`
schedules the reconcile cron daily at 04:00 UTC (the Hobby plan allows one run per day).

## Roadmap

- Mainnet (Rome Rubicon) deployment
