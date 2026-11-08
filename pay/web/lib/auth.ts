import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { ed25519 } from "@noble/curves/ed25519";
import { base58 } from "@scure/base";
import { getAddress, isAddress, keccak256, verifyMessage, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { CHAIN } from "./chain";
import { db } from "./db";
import { getMerchant, upsertMerchant, type Merchant } from "./store";

// Sign-In with Ethereum (EIP-4361) via viem/siwe for MetaMask, and the same message shape for Solana
// wallets (Sign-In with Solana text format, checked with ed25519). The nonce is stored in Postgres and
// consumed once, and it is also bound to the browser by a short-lived httpOnly cookie. The session is a
// random token whose sha256 is stored in Postgres. No signing secret is needed.

const NONCE_COOKIE = "rp_nonce";
const SESSION_COOKIE = "rp_session";
const NONCE_TTL_S = 10 * 60;
const SESSION_TTL_S = 7 * 24 * 60 * 60;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieBase = { httpOnly: true, secure: true, path: "/" } as const;

export async function issueNonce(): Promise<string> {
  const nonce = generateSiweNonce();
  const sql = db();
  await sql.transaction([
    sql`delete from auth_nonces where expires_at < now()`,
    sql`insert into auth_nonces (nonce, expires_at) values (${nonce}, now() + make_interval(secs => ${NONCE_TTL_S}))`,
  ]);
  (await cookies()).set(NONCE_COOKIE, nonce, { ...cookieBase, sameSite: "strict", maxAge: NONCE_TTL_S });
  return nonce;
}

/** Uses the nonce up. True only for the first caller, so a signed message cannot be replayed. */
async function consumeNonce(nonce: string): Promise<void> {
  const rows = await db()`delete from auth_nonces where nonce = ${nonce} and expires_at > now() returning nonce`;
  if (!rows.length) throw new SignInError("The sign-in request expired. Try again.");
}

export class SignInError extends Error {}

/** Checks a signed SIWE message against the nonce cookie and this host, then opens a session. */
export async function signIn(message: string, signature: Hex, host: string): Promise<Hex> {
  const nonce = await expectedNonce();
  const fields = parseSiweMessage(message);
  if (!fields.address || !isAddress(fields.address)) throw new SignInError("The message has no valid address.");
  if (fields.nonce !== nonce) throw new SignInError("The sign-in request does not match. Try again.");
  if (fields.domain !== host) throw new SignInError("The message was made for another site.");
  if (fields.chainId !== CHAIN.chainId) throw new SignInError(`Sign in on ${CHAIN.name}.`);
  if (fields.version !== "1") throw new SignInError("Unsupported message version.");
  checkTimes(fields.issuedAt, fields.expirationTime);

  // EOA signatures only (MetaMask). verifyMessage recovers the signer offline.
  const address = getAddress(fields.address);
  const valid = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!valid) throw new SignInError("The signature does not match the address.");

  await consumeNonce(nonce);
  await upsertMerchant(address);
  await openSession(address);
  return address;
}

/** Solana chain id written in the message, per the Sign-In with Solana text format. */
export const solanaSignInChain = () => (CHAIN.solanaCluster === "mainnet" ? "solana:mainnet" : "solana:devnet");

/**
 * Checks a Sign-In with Solana message signed by a Wallet Standard `solana:signMessage`, then opens a
 * session for the wallet's Rome synthetic address, keccak256(pubkey)[12:]; the same derivation as the
 * Rome SDK's syntheticAddress, so payments to that address are the ones this wallet controls.
 */
export async function signInSolana(message: string, signatureB58: string, host: string): Promise<Hex> {
  const nonce = await expectedNonce();
  const lines = message.split("\n");
  const header = /^(.+) wants you to sign in with your Solana account:$/.exec(lines[0] ?? "");
  const pubkeyText = lines[1] ?? "";
  if (!header || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pubkeyText)) throw new SignInError("The message is not a Rome Pay sign-in.");
  const field = (name: string) => lines.find((line) => line.startsWith(`${name}: `))?.slice(name.length + 2);
  if (header[1] !== host) throw new SignInError("The message was made for another site.");
  if (field("Nonce") !== nonce) throw new SignInError("The sign-in request does not match. Try again.");
  if (field("Chain ID") !== solanaSignInChain()) throw new SignInError(`Switch your wallet to Solana ${CHAIN.solanaCluster} and try again.`);
  if (field("Version") !== "1") throw new SignInError("Unsupported message version.");
  const issued = field("Issued At");
  const expires = field("Expiration Time");
  checkTimes(issued ? new Date(issued) : undefined, expires ? new Date(expires) : undefined);

  let pubkey: Uint8Array;
  let signature: Uint8Array;
  try {
    pubkey = base58.decode(pubkeyText);
    signature = base58.decode(signatureB58);
  } catch {
    throw new SignInError("The signature is not readable.");
  }
  const valid = pubkey.length === 32 && signature.length === 64 && ed25519.verify(signature, new TextEncoder().encode(message), pubkey);
  if (!valid) throw new SignInError("The signature does not match the wallet.");

  await consumeNonce(nonce);
  const address = getAddress(`0x${keccak256(pubkey).slice(-40)}`);
  await upsertMerchant(address, pubkeyText);
  await openSession(address);
  return address;
}

async function expectedNonce(): Promise<string> {
  const nonce = (await cookies()).get(NONCE_COOKIE)?.value;
  if (!nonce) throw new SignInError("The sign-in request expired. Try again.");
  return nonce;
}

function checkTimes(issuedAt: Date | undefined, expiresAt: Date | undefined) {
  const issued = issuedAt?.getTime() ?? NaN;
  if (!Number.isFinite(issued) || Math.abs(Date.now() - issued) > NONCE_TTL_S * 1000) {
    throw new SignInError("The sign-in request expired. Try again.");
  }
  if (expiresAt && expiresAt.getTime() < Date.now()) throw new SignInError("The message expired.");
}

async function openSession(address: Hex): Promise<void> {
  const jar = await cookies();
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_S * 1000);
  const sql = db();
  await sql.transaction([
    sql`delete from sessions where expires_at < now()`,
    sql`insert into sessions (token_hash, address, expires_at) values (${sha256(token)}, ${address.toLowerCase()}, ${expires.toISOString()})`,
  ]);
  jar.delete(NONCE_COOKIE);
  jar.set(SESSION_COOKIE, token, { ...cookieBase, sameSite: "lax", expires });
}

/** The signed-in merchant, or null. Reads cookies, so callers render dynamically. */
export async function currentMerchant(): Promise<Merchant | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const [row] = await db()`
    select address from sessions where token_hash = ${sha256(token)} and expires_at > now()`;
  return row ? getMerchant(row.address as Hex) : null;
}

export async function signOut(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db()`delete from sessions where token_hash = ${sha256(token)}`;
  jar.delete(SESSION_COOKIE);
}
