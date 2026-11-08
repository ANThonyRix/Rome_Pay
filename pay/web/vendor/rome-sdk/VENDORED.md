# Vendored Rome SDK

Source: https://github.com/rome-protocol/rome-sdk-ts tag v0.4.0, commit 45193d8410e9e69af69f1f11859cdae5c1e4d61c (MIT, see LICENSE).

Copied `src/*.ts` except the bridge module. Local change: relative imports drop the `.js`
suffix, because Turbopack does not map `./x.js` to `./x.ts`.

Logic change (2026-11-08, `solanaV1.ts`): Solflare inserts its own priority fee into the
v1 message before signing (seen live: 4389 micro-lamports/CU, message 8 bytes longer), so
the signature never matches the composed message and upstream refuses it. `LaneSigner` has
an optional `signV1WireWithMessage` that returns the message the wallet signed. `signChecked`
accepts it only when it equals the composed message byte for byte except the config mask
gaining the priority-fee bits and the inserted u64 fee (`walletAddedPriorityFee`), caps that
fee at `MAX_WALLET_PRIORITY_FEE_LAMPORTS` (0.001 SOL), verifies the signature over it, and
broadcasts it. Every other rewrite is still refused. Signers without the method behave as
upstream.

Replace with the npm package once `@rome-protocol/sdk` is published to the registry.
