/* Plus bought on iPhone. Two callers, one rule: nothing counts until Apple's
 * signature over the transaction has been verified.
 *
 * - The phone, signed in, posts `{ transaction }` (StoreKit's JWS) after a
 *   purchase or a restore. The transaction must carry this account's id as
 *   its `appAccountToken`.
 * - App Store Server Notifications V2 post `{ signedPayload }` on renewals,
 *   refunds and revocations. The account is the transaction's token.
 *
 * Secrets: APPLE_ROOT_CERTIFICATES (base64 DER of Apple Root CA G3, comma
 * separated if more), APPLE_BUNDLE_ID, APPLE_PLUS_PRODUCT_IDS (comma
 * separated), APPLE_APP_ID (numeric App Store id; production needs it).
 * Sandbox transactions are accepted too: App Review buys in the sandbox. */
import { Buffer } from "node:buffer";
import { createClient } from "@supabase/supabase-js";
import {
  Environment,
  SignedDataVerifier,
  type JWSTransactionDecodedPayload,
} from "@apple/app-store-server-library";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const list = (name: string) =>
  (Deno.env.get(name) ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
const roots = list("APPLE_ROOT_CERTIFICATES").map((value) => Buffer.from(value, "base64"));
const bundleId = Deno.env.get("APPLE_BUNDLE_ID");
const appId = Number(Deno.env.get("APPLE_APP_ID")) || undefined;
const products = new Set(list("APPLE_PLUS_PRODUCT_IDS"));
const verifiers =
  roots.length && bundleId
    ? [
        ...(appId
          ? [new SignedDataVerifier(roots, true, Environment.PRODUCTION, bundleId, appId)]
          : []),
        new SignedDataVerifier(roots, true, Environment.SANDBOX, bundleId),
      ]
    : [];

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: object) => Response.json(body, { status, headers });

/** The first environment whose verifier accepts the signature, or null. */
async function verified<T>(
  decode: (verifier: SignedDataVerifier) => Promise<T>,
): Promise<T | null> {
  for (const verifier of verifiers) {
    try {
      return await decode(verifier);
    } catch {
      // Try the other environment.
    }
  }
  return null;
}
const unverified = () => reply(400, { error: "The App Store signature is invalid." });

async function record(transaction: JWSTransactionDecodedPayload, owner: string) {
  if (!transaction.productId || !products.has(transaction.productId)) return "unknown_product";
  if (!transaction.originalTransactionId || !transaction.expiresDate) return "invalid";
  const { data, error } = await admin.rpc("record_apple_period", {
    target_user_id: owner,
    original_transaction_id: transaction.originalTransactionId,
    expires_at: new Date(transaction.expiresDate).toISOString(),
    revoked: transaction.revocationDate != null,
  });
  if (error) throw error;
  return data as string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, { error: "Use POST." });
  if (!verifiers.length || !products.size)
    return reply(503, { error: "App Store purchases are unavailable." });
  if (Number(request.headers.get("content-length")) > 65_536)
    return reply(413, { error: "Request too large." });

  let body: { transaction?: unknown; signedPayload?: unknown };
  try {
    body = (await request.json()) ?? {};
  } catch {
    return reply(400, { error: "Invalid request." });
  }

  try {
    if (typeof body.signedPayload === "string") {
      const notification = await verified((v) =>
        v.verifyAndDecodeNotification(body.signedPayload as string),
      );
      if (!notification) return unverified();
      const signed = notification.data?.signedTransactionInfo;
      if (!signed) return new Response(null, { status: 204 });
      const transaction = await verified((v) => v.verifyAndDecodeTransaction(signed));
      if (!transaction) return unverified();
      if (transaction.appAccountToken && UUID.test(transaction.appAccountToken))
        await record(transaction, transaction.appAccountToken.toLowerCase());
      return new Response(null, { status: 204 });
    }

    const token = request.headers.get("Authorization")?.match(/^Bearer (\S+)$/i)?.[1];
    if (!token || typeof body.transaction !== "string")
      return reply(400, { error: "Invalid request." });
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous)
      return reply(401, { error: "Sign in to a registered Napp account." });
    const transaction = await verified((v) =>
      v.verifyAndDecodeTransaction(body.transaction as string),
    );
    if (!transaction) return unverified();
    if (transaction.appAccountToken?.toLowerCase() !== data.user.id.toLowerCase())
      return reply(200, { status: "other_account" });
    return reply(200, { status: await record(transaction, data.user.id) });
  } catch (error) {
    console.error("App Store request failed", error instanceof Error ? error.name : "Error");
    // Apple retries a notification that is not acknowledged with 2xx.
    return reply(503, { error: "App Store purchases are temporarily unavailable." });
  }
});
