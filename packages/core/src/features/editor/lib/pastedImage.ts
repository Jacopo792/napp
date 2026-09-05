import { supabase } from "@/lib/supabaseClient";

export async function loadPastedImage(source: string, noteId: string): Promise<File> {
  let response: Response;
  if (/^(data:image\/(png|jpeg|webp|gif);|blob:)/i.test(source)) {
    response = await fetch(source);
  } else {
    const url = new URL(source);
    if (url.protocol !== "https:")
      throw new Error("Copy the image itself or attach the downloaded file");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Sign in to copy images");
    const endpoint = new URL(import.meta.env.VITE_COLLAB_URL as string);
    endpoint.protocol = endpoint.protocol === "wss:" ? "https:" : "http:";
    endpoint.pathname = "/import-image";
    endpoint.search = "";
    endpoint.searchParams.set("url", url.href);
    endpoint.searchParams.set("note", noteId);
    response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${data.session.access_token}` },
      signal: AbortSignal.timeout(60000),
    });
  }
  if (!response.ok)
    throw new Error("Could not copy an image. Download it from the source and attach it.");
  const blob = await response.blob();
  return new File([blob], "Pasted image", { type: blob.type });
}
