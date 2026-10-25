import { createClient } from "@supabase/supabase-js";
import { processErasure, type ErasureBackend, type ErasureObject } from "./worker.ts";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const publicKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, serviceKey, options);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
function response(status: number, body: object): Response {
  return Response.json(body, { status, headers: cors });
}
function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Erasure operation failed");
  return result.data;
}
const backend: ErasureBackend = {
  listObjects: async (userId) =>
    checked(
      await admin.rpc("account_erasure_objects", { target_user_id: userId }),
    ) as ErasureObject[],
  remove: async (bucket, paths) => {
    checked(await admin.storage.from(bucket).remove(paths));
  },
  acknowledge: async (userId, bucket, paths) => {
    checked(
      await admin.rpc("ack_account_erasure_objects", { target_user_id: userId, bucket, paths }),
    );
  },
  finish: async (userId) =>
    checked(await admin.rpc("finish_account_erasure", { target_user_id: userId })) === true,
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return response(405, { error: "Use POST" });
  if (Number(request.headers.get("content-length")) > 8192)
    return response(413, { error: "Request too large" });
  const authorization = request.headers.get("Authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) return response(401, { error: "Sign in again" });
  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8192) return response(413, { error: "Request too large" });
    body = JSON.parse(raw);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
  } catch {
    return response(400, { error: "Invalid request" });
  }
  const deadline = Date.now() + 12_000;
  if (authorization === `Bearer ${serviceKey}`) {
    if (body.action !== "resume") return response(400, { error: "Invalid worker action" });
    try {
      const jobs = checked(await admin.rpc("pending_account_erasures")) as { user_id: string }[];
      let completed = 0;
      for (const job of jobs) {
        try {
          if (await processErasure(backend, job.user_id, deadline)) completed += 1;
        } catch {
          // The durable manifest stays queued. No credentials or personal
          // data in logs; the next scheduled run retries this job.
          console.error("Account erasure retry deferred");
        }
      }
      return response(200, { completed });
    } catch {
      return response(503, { error: "Worker temporarily unavailable" });
    }
  }
  if (
    body.action !== "delete" ||
    body.confirm !== true ||
    typeof body.expected_user_id !== "string" ||
    typeof body.password !== "string" ||
    typeof body.request_token !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      body.request_token,
    )
  )
    return response(400, { error: "Confirm this account and enter its password" });

  const verified = await admin.auth.getUser(authorization.slice(7));
  if (verified.error || !verified.data.user || verified.data.user.id !== body.expected_user_id)
    return response(401, { error: "Sign in to this account again" });
  /* An account with no address (the phone's own notes) has no password to
     ask for: holding its session is the only proof it has. */
  if (!verified.data.user.is_anonymous) {
    if (!verified.data.user.email) return response(401, { error: "Sign in to this account again" });
    if (!body.password)
      return response(400, { error: "Confirm this account and enter its password" });
    const reauth = createClient(url, publicKey, options);
    const signed = await reauth.auth.signInWithPassword({
      email: verified.data.user.email,
      password: body.password as string,
    });
    if (signed.error || signed.data.user?.id !== verified.data.user.id)
      return response(403, { error: "The password is incorrect" });
    // Do not revoke or replace the app's current session during reauthentication.
    await reauth.auth.signOut({ scope: "local" });
  }
  body.password = undefined;

  let token: string;
  try {
    checked(
      await admin.rpc("configure_account_erasure_worker", {
        endpoint: `${url}/functions/v1/delete-account`,
        worker_key: serviceKey,
      }),
    );
    token = checked(
      await admin.rpc("begin_account_erasure", {
        target_user_id: verified.data.user.id,
        request_token: body.request_token,
      }),
    ) as string;
  } catch {
    return response(503, { error: "Could not start deletion. Please try again." });
  }
  try {
    const completed = await processErasure(backend, verified.data.user.id, deadline);
    return response(completed ? 200 : 202, {
      status: completed ? "completed" : "processing",
      requestToken: token,
    });
  } catch {
    return response(202, { status: "processing", requestToken: token });
  }
});
