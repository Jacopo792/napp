import { createClient } from "@supabase/supabase-js";

declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (request: Request) => Promise<Response>): void;
};

type Upload = {
  download(): Promise<Blob>;
  bucket: string;
};
interface ScanProvider {
  scan(upload: Upload): Promise<"clear" | "match">;
}

// Disabled by default. An approved provider must implement this interface
// before a deployment enables scanning of member uploads.
const noopProvider: ScanProvider = { scan: async () => "clear" };
const provider = Deno.env.get("SAFETY_SCAN_PROVIDER") ?? "noop";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: {
    fetch: (input, init) => {
      const timeout = AbortSignal.timeout(10_000);
      return fetch(input, {
        ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout,
      });
    },
  },
});
const evidence = admin.storage.from("safety-evidence");

type Job = {
  kind: "scan" | "copy" | "quarantine" | "orphan" | "expire";
  id: string | null;
  bucket: string;
  path: string;
  uploader: string | null;
};

function checked<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw new Error("Safety worker operation failed");
  return result.data;
}

async function processJob(job: Job) {
  const source = admin.storage.from(job.bucket);
  switch (job.kind) {
    case "scan": {
      if (provider !== "noop") throw new Error("Unknown safety scan provider");
      if (!job.id) throw new Error("Scan has no object identifier");
      // The no-op provider has no reason to read the upload bytes.
      if (
        (await noopProvider.scan({
          download: async () => {
            const bytes = checked(await source.download(job.path));
            if (!bytes) throw new Error("Upload bytes are missing");
            return bytes;
          },
          bucket: job.bucket,
        })) === "match"
      ) {
        checked(await admin.rpc("flag_safety_scan", { target_object_id: job.id }));
        return;
      }
      break;
    }
    case "copy": {
      if (!job.id) throw new Error("Evidence has no identifier");
      // A previous run may have copied the bytes and stopped before acknowledging.
      const copied = await source.copy(job.path, job.id, { destinationBucket: "safety-evidence" });
      if (copied.error && !checked(await evidence.exists(job.id))) throw copied.error;
      break;
    }
    case "quarantine": {
      if (job.uploader) {
        const banned = await admin.auth.admin.updateUserById(job.uploader, {
          ban_duration: "876000h",
        });
        if (banned.error && banned.error.code !== "user_not_found") throw banned.error;
      }
      checked(await source.remove([job.path]));
      break;
    }
    case "orphan":
    case "expire":
      checked(await source.remove([job.path]));
      break;
  }
  checked(
    await admin.rpc("safety_worker_ack", {
      job_kind: job.kind,
      job_id: job.id,
      job_path: job.path,
    }),
  );
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(null, { status: 405 });
  if (!serviceKey || request.headers.get("Authorization") !== `Bearer ${serviceKey}`)
    return new Response(null, { status: 401 });
  const deadline = Date.now() + 40_000;
  try {
    const lease = checked(await admin.rpc("safety_worker_start"));
    if (!lease) return new Response(null, { status: 204 });
    const jobs = checked(await admin.rpc("safety_worker_jobs")) as Job[];
    for (const job of jobs) {
      if (Date.now() >= deadline) break;
      try {
        await processJob(job);
      } catch {
        console.error(`Safety worker deferred ${job.kind} job`);
        if (job.kind === "scan" || job.kind === "quarantine")
          await admin.rpc("safety_scan_retry", { target_object_id: job.id });
        if (job.kind === "copy")
          await admin.rpc("safety_worker_ack", {
            job_kind: "defer_copy",
            job_id: job.id,
            job_path: job.path,
          });
      }
    }
    checked(await admin.rpc("safety_worker_finish", { lease }));
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
});
