// @solana/web3.js and @solana/spl-token expect a global Buffer in the browser.
// Import this module before anything that touches Solana code.
import { Buffer } from "buffer";

if (typeof globalThis !== "undefined") {
  (globalThis as { Buffer?: typeof Buffer }).Buffer ??= Buffer;
}
