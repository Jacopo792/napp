import assert from "node:assert/strict";
import { test } from "node:test";
import { authLinkResult } from "./authLinkResult.ts";

test("each emailed link says what happened", () => {
  assert.equal(authLinkResult("#access_token=x&type=signup")?.title, "Address confirmed");
  assert.equal(authLinkResult("#access_token=x&type=email_change")?.title, "Email changed");
  assert.equal(authLinkResult("#message=Confirmation+link+accepted")?.title, "One more link");
  assert.equal(
    authLinkResult("#error=access_denied&error_code=otp_expired")?.title,
    "This link has expired",
  );
  assert.equal(authLinkResult("#access_token=x&type=recovery"), null);
  assert.equal(authLinkResult(""), null);
});
