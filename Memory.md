# Memory — ROME

Cross-session project memory. Imported by CLAUDE.md. Keep it short; replace stale entries.

## Project
- Name: ROME. Path: `C:\Users\VIBE\Desktop\CODE\ROME`. Git repo (branch `main`, no commits yet).
- Layout: `pay/contracts` = Hardhat 3.21 + toolbox-viem 5.0 + viem 2.57 + OZ 5.6, solc 0.8.28, evmVersion paris, node:test. `npm test` passes (11). Planned: `pay/web` (Next.js), `pay/server` (Node + Postgres listener/webhooks).
- Goal: join Rome Protocol builder program (Arena, launched 2026-11-04); ship useful dual-lane apps on Rubicon mainnet. Plan: `building.md`. Ideas + verdicts: `ideas.md`.
- Rome facts: Hadrian testnet chainId 200010, Rubicon mainnet chainId 7531, gas = USDC. No Via explorer API, no indexer, no debug_traceTransaction. create-rome-app pinned to registry v0.2.0 (no Rubicon; need v0.3.0+). Phantom lacks Solana v1 signing, use Solflare. No Rome token/airdrop announced (2026-11-06).

## Decisions
- 2026-11-06: First app = **Rome Pay** (USDC payment links + Claim Links, register via `?idea=USDC Payments`). Then Watch (reuses Pay event listener) -> Index -> Pulse -> Devtools. Skip Activity (conflicts with Civitas). ~~Grant application after "Built on testnet"~~ superseded 2026-11-07: no grant program is live (see Rome Arena).
- 2026-11-06: Rules set in CLAUDE.md (Russian chat, English code, Context7 doc check, Playwright research, UX/UI principles).
- 2026-11-06: Installed in project: `design-taste-frontend` (taste-skill) and `impeccable` (skill + 4 agents + hooks in `.claude/settings.local.json`).
- 2026-11-06: Context window set to 200k (`autoCompactWindow`).
- 2026-11-07: pay/web design: PRODUCT.md written (impeccable init), buildPath code-first (`.impeccable/config.json`). Visual world = **Interchange** (metro rail diagram on midnight enamel: MetaMask and Solflare lines converge at PayRouter interchange, terminus = merchant; seed e4f69ee6, bolder reroll). Refs in `.impeccable/refs/`. First surface = checkout `/pay/<id>`. UI copy English. User anti-goal: must not look like a scam.
- 2026-11-07: User chose: invoices stored in Postgres (not signed URLs, not on-chain), host on Vercel, per-merchant dashboard with wallet login, plus an "open amount" mode where the payer enters the sum (tips/donations). Reference: user's own LitVM app https://pay-litvm.vercel.app/ (on-chain requests via contract, `amount 0` = "Any amount", feeBasisPoints + FeeCollected, embed widget `/widget/pay/<addr>?amount&label&tokens`, usernames).
- 2026-11-07: Fee = 1% (100 bps, the contract max) already on testnet, to treasury `0xdc2f0Cc3FFe14d4563571711a0bd817d8Fb20388`, SET on Hadrian (setFee tx 0x7521f029…); smoke pay 0.1 gave fee 0.001 to treasury (pay tx 0x17bbbb6b…, gas 2,544,921 because the first transfer creates the treasury's token account; later pays are cheap); `npm run fee:hadrian` (scripts/set-fee.ts, env PAY_ROUTER, FEE_RECIPIENT, FEE_BPS). Need a public "how the service earns" view (fees from Paid events + treasury balance). Dashboard must show operation history. GitHub: private repo, whole ROME without `.claude/skills/` (gitignored); user creates the empty repo on github.com (no gh CLI); Vercel Root Directory = `pay/web`.
- Vercel Hobby cron = once per day only (Pro = per minute). So payment confirmation must not depend on cron: verify the tx receipt when the checkout reports it, plus a daily reconcile via `getLogs` (Paid indexes ref + merchant).

## Rome Arena (from Rome Discord admin Sid, 2026-11-07)
- Arena: https://arena.mainnet.romeprotocol.xyz/ — "Put your app in the Arena, or become an ambassador, and earn Laurels."
- Admin answer on grants: **"Currently we don't have any grant program live."** No funding to plan around; reward path is Arena rank / Laurels.

## Rome Rubicon (mainnet) — official links (from Rome Discord)
- Runs on Solana mainnet. Gas = real USDC (symbol USDC), no faucet.
- Network name: Rome Rubicon. Chain ID: 7531.
- RPC: https://rubicon.mainnet.romeprotocol.xyz/
- Explorer (Via): https://via-rubicon.mainnet.romeprotocol.xyz/
- Bridge (USDC onto Rubicon): https://bridge-api.mainnet.romeprotocol.xyz/
- Rome App: https://app.mainnet.romeprotocol.xyz/
- Network guide: https://docs.rome.builders/networks/rubicon
- Docs: https://docs.rome.builders/ | GitHub: https://github.com/rome-protocol | Site: https://www.rome.builders/

## Rome Hadrian (testnet) — official links (from Rome Discord)
- Runs on Solana Devnet. Gas = test USDC (symbol USDC).
- Network name: Rome Hadrian. Chain ID: 200010.
- RPC: https://hadrian.testnet.romeprotocol.xyz/
- Explorer (Via): https://via-hadrian.testnet.romeprotocol.xyz/
- Faucet: Circle Faucet https://faucet.circle.com/ (pick Solana Devnet or Ethereum Sepolia)
- Bridge into Hadrian: https://bridge-api.devnet.romeprotocol.xyz/?chain=200010
- Network guide: https://docs.rome.builders/networks/hadrian
- Docs / GitHub / Site: same as Rubicon section.

## Environment
- Windows 11, PowerShell. Node 24.14, npm 11.9, Python 3.14.
- Global scrapers installed: Scrapling 0.4.15, autoscraper 1.1.14, Crawl4AI 0.9.2, Scrapy 2.18, crawlee 3.18 (npm), Firecrawl (MCP + firecrawl-py + JS SDK).
- MCP available: context7, firecrawl, lightpanda, 21st, etherscan. `higgsfield` fails with 401 (token invalid).

## Conventions
- Language: chat in Russian, all code/comments/commits in English (also commands and placeholders given in chat).
- 2026-11-07: Review every contract before any deploy: manual review + tests (all reverts, value conservation) + Slither + bytecode scan for post-paris opcodes. Report severities, then give deploy commands.

## Open tasks
- 2026-11-07: `pay/web` checkout `/pay/<id>` built (Next 16.4.5 cacheComponents + React 19.3, viem 2.57, @solana/web3.js 1.99, EIP-6963 + Wallet Standard, no wagmi). Demo link `/pay/demo` (invoices hardcoded in `lib/invoices.ts`). Build + tsc + impeccable detector clean; screenshots in `.impeccable/review/`. Not yet tested with real wallets.
- 2026-11-07: PayRouter (reviewed v2) deployed on Hadrian `0xb2c77558e9720da0888ac9632192cb086de377db`, bytecode verified vs artifact; old v1 `0x45ea…f1b2` abandoned (owner = dev wallet `0xf35f…5c2a`, fee 0), recorded in `pay/contracts/deployments.json`. Dev wallet funded ~15 USDC via Sepolia CCTP bridge. Key in hardhat keystore (user types password; Claude cannot run deploy/smoke scripts).
- 2026-11-07: smoke pay passed on old router (tx 0xae07cc52…). Security review done; source changed (InvalidRecipient guard, indexed FeeUpdated.feeRecipient), so old deploy is stale.
- 2026-11-07: smoke on v2 passed (pay tx 0xeae14952…, Paid + Transfer decoded, gas 10001; approve gas 1,056,481 = new allowance slot). EVM lane done.
- Next: manual test of both lanes in `pay/web` (MetaMask on Hadrian; Solflare with Solana Devnet USDC + devnet SOL), then merchant dashboard + landing, then `pay/server`.
- Ask Rome Discord: what counts as "Audited", rank thresholds, Arena API, whether Rome builds Two-Sided Analytics / Stalk In itself.

## Pitfalls
- Rome: take value as ERC-20 wUSDC (6 dec), never `msg.value` (Solana users hold only the SPL wrapper). Every user needs one-time `approve_spl` grant via Helper `0xff..09` (else SPL error 0x4); MetaMask users wrap gas first via `withdraw_to_ata` at `0x42..16` (wei multiple of 1e12). Solana synthetic needs `create_pda` once.
- Rome opcode support (PUSH0/MCOPY/TSTORE) undocumented: compile with evmVersion paris, avoid transient-storage libs.
- `npm audit` 12 high = zod DoS inside Hardhat dev tooling; not shipped, ignore.
- rome-sdk-ts is not on npm and `npm install github:...` is blocked by the auto-mode classifier: SDK vendored at `pay/web/vendor/rome-sdk` (v0.4.0, `.js` import suffixes stripped for Turbopack; see VENDORED.md).
- Next 16 cacheComponents: await `params` inside a `<Suspense>` child, else blocking-prerender build error.
- Windows: TaskStop on a background `npx next start` leaves the node child alive (port stays busy, stale build serves 500s). Start servers as `exec node node_modules/next/dist/bin/next start -p <port>`.
- 2026-11-07: Solflare v1 signing failed with "the wallet signed a different transaction" when using `signedTransaction.slice(-64)`. `lib/wallets.ts` `pickV1Signature` now searches the returned bytes for a signature that verifies, and reports when the wallet rewrote the message. Fix not yet retested with a real Solflare.
- `npx impeccable install` can fail once with "invalid zip data"; retry works.
- taste-skill shows a "Critical Risk" rating from the Gen scanner on skills.sh; review `.claude/skills/design-taste-frontend` scripts before running them.
