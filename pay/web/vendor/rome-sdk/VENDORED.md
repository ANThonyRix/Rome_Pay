# Vendored Rome SDK

Source: https://github.com/rome-protocol/rome-sdk-ts tag v0.4.0, commit 45193d8410e9e69af69f1f11859cdae5c1e4d61c (MIT, see LICENSE).

Copied `src/*.ts` except the bridge module. Local change: relative imports drop the `.js`
suffix, because Turbopack does not map `./x.js` to `./x.ts`. No logic changed.

Replace with the npm package once `@rome-protocol/sdk` is published to the registry.
