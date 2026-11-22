import type { Page } from "@playwright/test";
import { CURRENT_RELEASE } from "../packages/core/src/lib/whatsNew.ts";

export async function dismissWorkspaceHints(page: Page) {
  await page.context().addInitScript((release) => {
    localStorage.setItem("napp:spotlight-learned", "1");
    localStorage.setItem("napp:whats-new-seen", release);
  }, CURRENT_RELEASE);
}
