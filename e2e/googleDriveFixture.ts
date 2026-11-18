import { expect, type Page } from "@playwright/test";

export const DRIVE_FIXTURE_PDF = "%PDF-1.4\n%%EOF";

export async function mockGoogleDrive(page: Page): Promise<string[]> {
  const downloads: string[] = [];
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.google ??= {};
        window.google.accounts = { oauth2: {
          hasGrantedAllScopes: (_, scope) => scope === "https://www.googleapis.com/auth/drive.file",
          initTokenClient(options) {
            if (options.include_granted_scopes !== false) throw Error("Unexpected broad grant");
            return { requestAccessToken: () => options.callback({ access_token: "test-token" }) };
          }
        }};
      `,
    }),
  );
  await page.route("https://apis.google.com/js/api.js", (route) =>
    route.fulfill({
      contentType: "application/javascript",
      body: `
        window.google ??= {};
        window.gapi = { load: (_, options) => options.callback() };
        window.google.picker = {
          ViewId: { DOCS: "docs" },
          DocsViewMode: { LIST: "list" },
          Feature: { MULTISELECT_ENABLED: "multi" },
          Action: { PICKED: "picked", CANCEL: "cancel", ERROR: "error" },
          DocsView: class {
            setIncludeFolders() { return this; }
            setMode() { return this; }
            setMimeTypes() { return this; }
          },
          PickerBuilder: class {
            addView() { return this; }
            enableFeature(feature) { this.multi = feature === "multi"; return this; }
            setAppId() { return this; }
            setDeveloperKey() { return this; }
            setOAuthToken() { return this; }
            setOrigin() { return this; }
            setCallback(callback) { this.callback = callback; return this; }
            build() { return this; }
            dispose() {}
            setVisible() {
              if (!this.multi) throw Error("Multiselect was not enabled");
              const doc = { id: "doc", name: "Drive project notes", mimeType: "application/vnd.google-apps.document" };
              this.callback({ action: "picked", docs: [
                doc,
                doc,
                { id: "sheet", name: "Drive budget", mimeType: "application/vnd.google-apps.spreadsheet" },
                { id: "slides", name: "Drive slides", mimeType: "application/vnd.google-apps.presentation" },
                { id: "blocked", name: "Restricted file", mimeType: "application/pdf" },
                { id: "pdf", name: "Drive source.pdf", mimeType: "application/pdf" }
              ]});
            }
          }
        };
      `,
    }),
  );
  await page.route("https://www.googleapis.com/drive/v3/files/**", async (route) => {
    const url = new URL(route.request().url());
    const [, , , , id, operation] = url.pathname.split("/");
    expect(route.request().headers().authorization).toBe("Bearer test-token");
    if (url.searchParams.has("fields")) {
      await route.fulfill({ json: { capabilities: { canDownload: id !== "blocked" } } });
      return;
    }
    downloads.push(id);
    if (id === "doc") {
      expect(operation).toBe("export");
      expect(url.searchParams.get("mimeType")).toBe("text/markdown");
      await route.fulfill({
        contentType: "text/markdown",
        body: "# First section\n\nA **bold** plan.",
      });
    } else {
      if (id === "pdf") {
        expect(url.searchParams.get("alt")).toBe("media");
      } else {
        expect(operation).toBe("export");
        expect(url.searchParams.get("mimeType")).toBe("application/pdf");
      }
      await route.fulfill({ contentType: "application/pdf", body: DRIVE_FIXTURE_PDF });
    }
  });

  return downloads;
}
