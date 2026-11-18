import type { DriveImportFile } from "../platform";

export const driveFileScope = "https://www.googleapis.com/auth/drive.file";
const googleDocs = "application/vnd.google-apps.document";
const pdf = "application/pdf";
export const allowedMimeTypes = [
  googleDocs,
  "application/vnd.google-apps.spreadsheet",
  "application/vnd.google-apps.presentation",
  pdf,
];

export interface DriveFileMetadata {
  id: string;
  name: string;
  mimeType: string;
  resourceKey?: string;
}

async function download(
  file: DriveFileMetadata,
  token: string,
  signal: AbortSignal,
): Promise<Blob> {
  const endpoint = fileEndpoint(file.id);
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  if (file.resourceKey) headers.set("X-Goog-Drive-Resource-Keys", `${file.id}/${file.resourceKey}`);

  const details = await fetch(
    `${endpoint}?fields=capabilities(canDownload)&supportsAllDrives=true`,
    { headers, signal },
  );
  if (details.status === 401)
    throw new Error("Google authorization expired. Select the file again.");
  if (!details.ok) throw new Error("Google Drive could not open this file.");
  const { capabilities } = (await details.json()) as { capabilities?: { canDownload?: boolean } };
  if (!capabilities?.canDownload) throw new Error("Google Drive blocks downloads for this file.");

  const mimeType = file.mimeType === googleDocs ? "text/markdown" : pdf;
  const url =
    file.mimeType === pdf
      ? `${endpoint}?alt=media&supportsAllDrives=true`
      : `${endpoint}/export?mimeType=${encodeURIComponent(mimeType)}`;
  const response = await fetch(url, { headers, signal });
  if (response.status === 401)
    throw new Error("Google authorization expired. Select the file again.");
  if (!response.ok) {
    const failure = await response.json().catch(() => null);
    if (
      failure?.error?.errors?.some(
        (error: { reason?: string }) => error.reason === "exportSizeLimitExceeded",
      )
    ) {
      throw new Error("This export exceeds Google Drive’s 10 MB limit.");
    }
    throw new Error("Google Drive could not download this file.");
  }
  return response.blob();
}

function fileEndpoint(id: string) {
  return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`;
}

export function driveImportFile(file: DriveFileMetadata, token: string): DriveImportFile {
  return {
    name: file.name,
    format: file.mimeType === googleDocs ? "markdown" : "pdf",
    download: (signal) => download(file, token, signal),
  };
}

export async function readDriveSelection(
  ids: string[],
  token: string,
  signal: AbortSignal,
): Promise<DriveImportFile[]> {
  const files: DriveImportFile[] = [];
  for (const id of ids) {
    const url = `${fileEndpoint(id)}?fields=id,name,mimeType,resourceKey&supportsAllDrives=true`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal });
    if (!response.ok) throw new Error("Google Drive could not read the selected files.");
    const file: DriveFileMetadata = await response.json();
    if (allowedMimeTypes.includes(file.mimeType)) files.push(driveImportFile(file, token));
  }
  if (!files.length) throw new Error("Choose a Google Doc, Sheet, Slide deck or PDF.");
  return files;
}
