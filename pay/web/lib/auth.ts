import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAddress, isAddress, verifyMessage, type Hex } from "viem";
import { generateSiweNonce, parseSiweMessage } from "viem/siwe";
import { CHAIN } from "./chain";
import { db } from "./db";
import { getMerchant, upsertMerchant, type Merchant } from "./store";

// Sign-In with Ethereum (EIP-4361) via viem/siwe. The nonce lives in a short-lived httpOnly cookie,
// the session is a random token whose sha256 is stored in Postgres. No signing secret is needed.

const NONCE_COOKIE = "rp_nonce";
const SESSION_COOKIE = "rp_session";
const NONCE_TTL_S = 10 * 60;
const SESSION_TTL_S = 7 * 24 * 60 * 60;

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const cookieBase = { httpOnly: true, secure: true, path: "/" } as const;

export async function issueNonce(): Promise<string> {
  const nonce = generateSiweNonce();
  (await cookies()).set(NONCE_COOKIE, nonce, { ...cookieBase, sameSite: "strict", maxAge: NONCE_TTL_S });
  return nonce;
}

export class SignInError extends Error {}

/** Checks a signed SIWE message against the nonce cookie and this host, then opens a session. */
export async function signIn(message: string, signature: Hex, host: string): Promise<Hex> {
  const jar = await cookies();
  const nonce = jar.get(NONCE_COOKIE)?.value;
  if (!nonce) throw new SignInError("The sign-in request expired. Try again.");

  const fields = parseSiweMessage(message);
  if (!fields.address || !isAddress(fields.address)) throw new SignInError("The message has no valid address.");
  if (fields.nonce !== nonce) throw new SignInError("The sign-in request does not match. Try again.");
  if (fields.domain !== host) throw new SignInError("The message was made for another site.");
  if (fields.chainId !== CHAIN.chainId) throw new SignInError(`Sign in on ${CHAIN.name}.`);
  if (fields.version !== "1") throw new SignInError("Unsupported message version.");
  const issued = fields.issuedAt?.getTime() ?? 0;
  if (Math.abs(Date.now() - issued) > NONCE_TTL_S * 1000) throw new SignInError("The sign-in request expired. Try again.");
  if (fields.expirationTime && fields.expirationTime.getTime() < Date.now()) throw new SignInError("The message expired.");

  // EOA signatures only (MetaMask). verifyMessage recovers the signer offline.
  const address = getAddress(fields.address);
  const valid = await verifyMessage({ address, message, signature }).catch(() => false);
  if (!valid) throw new SignInError("The signature does not match the address.");

  await upsertMerchant(address);
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_TTL_S * 1000);
  const sql = db();
  await sql.transaction([
    sql`delete from sessions where expires_at < now()`,
    sql`insert into sessions (token_hash, address, expires_at) values (${sha256(token)}, ${address.toLowerCase()}, ${expires.toISOString()})`,
  ]);
  jar.delete(NONCE_COOKIE);
  jar.set(SESSION_COOKIE, token, { ...cookieBase, sameSite: "lax", expires });
  return address;
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
