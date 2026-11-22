#!/usr/bin/env node
// Manual operator tool. The default view contains queue metadata only;
// reported content is shown only by an explicit --show <report UUID>.
import assert from "node:assert/strict";
import { adminClient } from "./lib/admin-client.mjs";

const [action = "--queue", id, decision] = process.argv.slice(2);
const withoutId = ["--queue", "--erasures"];
const withId = ["--show", "--hide", "--dismiss", "--suspend", "--unsuspend", "--notice-decision"];
assert(
  [...withoutId, ...withId].includes(action),
  "Use --queue, --show UUID, --hide UUID, --dismiss UUID, --erasures, --suspend UUID, --unsuspend UUID or --notice-decision UUID TEXT",
);
if (withId.includes(action))
  assert(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? ""),
    "Provide a UUID",
  );
if (action === "--notice-decision")
  assert(decision?.trim(), "Provide the decision and redress options");

const client = await adminClient();
function checked(result) {
  if (result.error) throw new Error("Operator action failed. Check project access and deployment.");
  return result.data;
}

async function moderate() {
  switch (action) {
    case "--suspend":
      checked(await client.rpc("set_account_suspension", { target_user_id: id, suspended: true }));
      checked(await client.auth.admin.updateUserById(id, { ban_duration: "876000h" }));
      return { suspended: true };
    case "--unsuspend":
      checked(await client.auth.admin.updateUserById(id, { ban_duration: "none" }));
      checked(await client.rpc("set_account_suspension", { target_user_id: id, suspended: false }));
      return { suspended: false };
    case "--queue":
      return checked(await client.rpc("pending_safety_reports"));
    case "--erasures":
      return { pending: checked(await client.rpc("pending_account_erasures"))?.length ?? 0 };
    case "--show":
      return checked(await client.rpc("safety_report_detail", { target_report_id: id }));
    case "--notice-decision":
      checked(await client.rpc("decide_safety_notice", { target_report_id: id, decision }));
      return { reviewed: true };
    default:
      checked(
        await client.rpc("review_safety_report", {
          target_report_id: id,
          hide_content: action === "--hide",
        }),
      );
      return { reviewed: true };
  }
}
console.log(JSON.stringify(await moderate(), null, 2));
