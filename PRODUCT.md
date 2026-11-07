# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Next.js 16 (App Router, cacheComponents), deployed on Vercel. viem + EIP-6963 discovery for EVM wallets (MetaMask), Wallet Standard for Solflare (no wagmi, no wallet-adapter). Rome SDK vendored at `pay/web/vendor/rome-sdk`. Contracts live in `pay/contracts` (Hardhat 3, Solidity 0.8.28). Backend listener and webhooks planned in `pay/server` (Node + Postgres). UI copy in English.

## Users

- **Merchants (broad, no single segment):** anyone who wants to get paid in USDC with a link: freelancers sending an invoice, creators selling a digital good, small online businesses, teams building on Rome. v1 optimizes for the shortest path: create a link, share it, see the money arrive.
- **Payers:** anyone holding USDC on Rome, either from an EVM wallet (MetaMask) or a Solana wallet (Solflare). Many will be first-time Rome users.

## Product Purpose

Rome Pay turns a USDC amount into a shareable payment link that both Ethereum-style and Solana wallets can pay on the same chain. Success: a merchant creates a link in under a minute, a payer from either wallet completes payment without understanding Rome internals, and the merchant sees the payment confirmed (dashboard, webhook).

## Positioning

Dual-lane checkout on Rome: one link, one contract, payable from MetaMask or Solflare, settled in USDC with USDC gas. Non-custodial: the `PayRouter` contract moves funds straight from payer to merchant and never holds them.

## Operating Context

- Networks: Rome Hadrian testnet (chainId 200010) for v1, Rome Rubicon mainnet (chainId 7531) later. Gas is paid in USDC.
- Value moves as wUSDC (ERC-20, 6 decimals). Payer flows include one-time setup steps (Solana: `create_pda`, `approve_spl` grant; MetaMask: wrap gas USDC into wUSDC, grant) before `approve` and `pay`. The UI must hide or explain these steps plainly.
- Invoices live off-chain; the backend matches `Paid` events by `ref`, validates emitter, merchant and amount, and dedupes.
- Explorer: Via (`via-hadrian.testnet.romeprotocol.xyz`). Funding: Circle faucet and Rome Bridge.

## Capabilities and Constraints

- Live: `PayRouter` v2 on Hadrian `0xb2c77558e9720da0888ac9632192cb086de377db`, fee 0 (cap 1%), reviewed and smoke-tested on the EVM lane.
- v1 scope: payment page `/pay/<id>` (amount, QR, wallet choice, gas estimate), merchant dashboard (create link, payments list, status, CSV export), webhooks.
- Later (v2+): bridge inside checkout, Claim Links, Rubicon mainnet, protocol fee, embeddable widget.
- An `approve` creates a new storage slot on Rome and costs far more gas than `pay`; the UI should set expectations for first-time payers.
- Undecided: merchant auth method, hosting of the backend, custom branding per merchant.

## Brand Commitments

- Name: **Rome Pay**. Built for the Rome Protocol builder program (Arena); not an official Rome Protocol product. Say "Built on Rome" where relevant; do not use Rome Protocol's logo or imply endorsement.

## Evidence on Hand

- Deployed, verified contract and successful testnet payments (Hadrian txs recorded in `Memory.md`).
- No users, testimonials, volume metrics, partners or audits yet. Do not fabricate any.

## Product Principles

1. Payment first: the payer's path from link to confirmed payment is the product; every other screen serves it.
2. Explain the chain only when it matters: hide Rome mechanics, but show exact amounts, fees, gas and tx links.
3. Never hold funds; never claim more trust than the contract earns.
4. Both wallets are first-class: no lane is a fallback.
5. Honest state: every pending, failed or confirmed step is visible and recoverable.

## Accessibility & Inclusion

WCAG AA contrast, keyboard-reachable wallet flows, visible focus states, 44px touch targets, `prefers-reduced-motion` respected (from project CLAUDE.md).
