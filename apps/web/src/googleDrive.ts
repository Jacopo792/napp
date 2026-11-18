import type { DriveImportFile } from "@notes-app/core/platform";
import {
  allowedMimeTypes,
  driveFileScope,
  driveImportFile,
  type DriveFileMetadata,
} from "@notes-app/core/google-drive";

const clientId = import.meta.env.VITE_GOOGLE_DRIVE_CLIENT_ID?.trim();
const developerKey = import.meta.env.VITE_GOOGLE_DRIVE_API_KEY?.trim();
const appId = import.meta.env.VITE_GOOGLE_DRIVE_PROJECT_NUMBER?.trim();
interface PickerView {
  setMode(mode: string): PickerView;
  setIncludeFolders(include: boolean): PickerView;
  setMimeTypes(types: string): PickerView;
}

interface Picker {
  setVisible(visible: boolean): void;
  dispose(): void;
}

interface PickerBuilder {
  addView(view: PickerView): PickerBuilder;
  enableFeature(feature: string): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setCallback(
    callback: (response: { action: string; docs?: DriveFileMetadata[] }) => void,
  ): PickerBuilder;
  build(): Picker;
}

interface TokenResponse {
  access_token?: string;
  error?: string;
}

type GoogleWindow = Window & {
  gapi: {
    load(
      library: "picker",
      options: {
        callback: () => void;
        onerror: () => void;
        ontimeout: () => void;
        timeout: number;
      },
    ): void;
  };
  google: {
    accounts: {
      oauth2: {
        initTokenClient(options: {
          client_id: string;
          scope: string;
          include_granted_scopes: boolean;
          callback: (response: TokenResponse) => void;
          error_callback: (error: { type: string }) => void;
        }): { requestAccessToken(options: { prompt: string }): void };
        hasGrantedAllScopes(response: TokenResponse, scope: string): boolean;
      };
    };
    picker: {
      PickerBuilder: new () => PickerBuilder;
      DocsView: new (id: string) => PickerView;
      ViewId: { DOCS: string };
      DocsViewMode: { LIST: string };
      Feature: { MULTISELECT_ENABLED: string };
      Action: { PICKED: string; CANCEL: string; ERROR: string };
    };
  };
};

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      clearTimeout(timeout);
      script.remove();
      reject(new Error("Could not load Google Drive. Check your connection and try again."));
    };
    const timeout = window.setTimeout(fail, 15_000);
    script.src = src;
    script.onload = () => {
      clearTimeout(timeout);
      resolve();
    };
    script.onerror = fail;
    document.head.append(script);
  });
}

let identityReady: Promise<void> | undefined;
let pickerReady: Promise<void> | undefined;

export const prepareDriveImport =
  clientId && developerKey && appId
    ? async () => {
        const host = window as unknown as GoogleWindow;
        identityReady ??= loadScript("https://accounts.google.com/gsi/client").catch((error) => {
          identityReady = undefined;
          throw error;
        });
        pickerReady ??= (async () => {
          if (!host.gapi) await loadScript("https://apis.google.com/js/api.js");
          await new Promise<void>((resolve, reject) => {
            const fail = () => reject(new Error("Could not load the Google Drive file picker."));
            host.gapi.load("picker", {
              callback: resolve,
              onerror: fail,
              ontimeout: fail,
              timeout: 15_000,
            });
          });
        })().catch((error) => {
          pickerReady = undefined;
          throw error;
        });
        await Promise.all([identityReady, pickerReady]);

        return (signal: AbortSignal) =>
          new Promise<DriveImportFile[]>((resolve, reject) => {
            signal.throwIfAborted();
            const { oauth2 } = host.google.accounts;
            const pickerApi = host.google.picker;
            let picker: Picker | undefined;
            function dispose() {
              signal.removeEventListener("abort", cancel);
              picker?.dispose();
              picker = undefined;
            }
            function cancel() {
              dispose();
              resolve([]);
            }
            function fail(message: string) {
              dispose();
              reject(new Error(message));
            }
            signal.addEventListener("abort", cancel, { once: true });
            try {
              const oauth = oauth2.initTokenClient({
                client_id: clientId,
                scope: driveFileScope,
                include_granted_scopes: false,
                error_callback: (error) => {
                  if (error.type === "popup_closed") cancel();
                  else fail("Could not open Google authorization. Allow pop-ups and try again.");
                },
                callback: (response) => {
                  if (signal.aborted) return;
                  const token = response.access_token;
                  if (
                    !token ||
                    response.error ||
                    !oauth2.hasGrantedAllScopes(response, driveFileScope)
                  ) {
                    fail("Google Drive access was not granted.");
                    return;
                  }

                  try {
                    const view = new pickerApi.DocsView(pickerApi.ViewId.DOCS)
                      .setIncludeFolders(true)
                      .setMode(pickerApi.DocsViewMode.LIST)
                      .setMimeTypes(allowedMimeTypes.join(","));
                    picker = new pickerApi.PickerBuilder()
                      .addView(view)
                      .enableFeature(pickerApi.Feature.MULTISELECT_ENABLED)
                      .setOrigin(window.location.origin)
                      .setAppId(appId)
                      .setDeveloperKey(developerKey)
                      .setOAuthToken(token)
                      .setCallback(({ action, docs }) => {
                        if (action === pickerApi.Action.CANCEL) cancel();
                        if (action === pickerApi.Action.ERROR)
                          fail("Google Drive could not open the file picker.");
                        if (action !== pickerApi.Action.PICKED) return;

                        dispose();
                        const files = new Map<string, DriveImportFile>();
                        for (const file of docs ?? []) {
                          if (!file.id || !allowedMimeTypes.includes(file.mimeType)) continue;
                          files.set(file.id, driveImportFile(file, token));
                        }
                        if (files.size === 0)
                          fail("Choose a Google Doc, Sheet, Slide deck or PDF.");
                        else resolve([...files.values()]);
                      })
                      .build();
                    picker.setVisible(true);
                  } catch {
                    fail("Could not open the Google Drive file picker.");
                  }
                },
              });
              oauth.requestAccessToken({ prompt: "select_account" });
            } catch {
              fail("Could not open Google authorization.");
            }
          });
      }
    : undefined;
