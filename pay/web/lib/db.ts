import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

// Neon HTTP driver (@neondatabase/serverless 1.x): one fetch per query, fits Vercel functions.
let client: NeonQueryFunction<false, false> | null = null;

export const dbConfigured = (): boolean => Boolean(process.env.DATABASE_URL);

export function db(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}
