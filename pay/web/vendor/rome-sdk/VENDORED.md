# Vendored Rome SDK

Source: https://github.com/rome-protocol/rome-sdk-ts tag v0.4.0, commit 45193d8410e9e69af69f1f11859cdae5c1e4d61c (MIT, see LICENSE).

Copied `src/*.ts` except the bridge module. Local change: relative imports drop the `.js`
suffix, because Turbopack does not map `./x.js` to `./x.ts`.

Logic change (2026-11-08, `solanaV1.ts`): Solflare re-serializes the v1 message before
signing it (seen live: adds its own priority fee, 4389 micro-lamports/CU, and reorders the
read-only account keys with remapped instruction indices), so its signature never matches
the composed message and upstream refuses it. `LaneSigner` has an optional
`signV1WireWithMessage` that returns the message the wallet signed. `signChecked` accepts
it only when `compareWalletMessage` finds the same transaction (same blockhash, header,
compute limit, loaded-accounts size, heap; same keys in the same roles, signers in order;
same instructions by program, account keys and data), with at most a priority fee added
where none was composed, capped at `MAX_WALLET_PRIORITY_FEE_LAMPORTS` (0.001 SOL). It then
verifies the signature over that message and broadcasts it. `ParsedV1Message` also exposes
`loadedAccountsBytes`. Signers without the method behave as upstream.

Replace with the npm package once `@rome-protocol/sdk` is published to the registry.

Local change (2026-11-08, `solana.ts`): imports `Buffer` from `buffer` (v6) instead of using
the global. In the browser the global can be Next's bundled polyfill, which has no
`writeBigUInt64LE`; the fund leg failed with "writeBigUInt64LE is not a function".
