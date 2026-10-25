#!/usr/bin/env node
// Manual operator tool. The default view contains queue metadata only;
// reported content is shown only by an explicit --show <report UUID>.
import assert from "node:assert/strict";
import { adminClient } from "./lib/admin-client.mjs";

const [action = "--queue", id] = process.argv.slice(2);
assert(
  ["--queue", "--show", "--hide", "--dismiss", "--erasures"].includes(action),
  "Use --queue, --show UUID, --hide UUID, --dismiss UUID or --erasures",
);
if (["--show", "--hide", "--dismiss"].includes(action))
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? ""),
    "Provide a report UUID",
  );
const client = await adminClient();
const result =
  action === "--queue"
    ? await client.rpc("pending_safety_reports")
    : action === "--erasures"
      ? await client.rpc("pending_account_erasures")
      : action === "--show"
        ? await client.rpc("safety_report_detail", { target_report_id: id })
        : await client.rpc("review_safety_report", {
            target_report_id: id,
            hide_content: action === "--hide",
          });
if (result.error) throw new Error("Operator action failed. Check project access and deployment.");
console.log(
  JSON.stringify(
    action === "--erasures"
      ? { pending: result.data?.length ?? 0 }
      : (result.data ?? { reviewed: true }),
    null,
    2,
  ),
);
