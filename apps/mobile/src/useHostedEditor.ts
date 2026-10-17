/* Requests keep the page mounted while native sheets cover it. The response
 * belongs to this note's WebView, and every outstanding request ends with it. */
import { useCallback, useEffect, useRef } from "react";
import { Directory, File, Paths } from "expo-file-system";
import { shareAsync } from "expo-sharing";
import { randomUUID } from "expo-crypto";
import type { WebView, WebViewMessageEvent } from "react-native-webview";
import { HostedRequests } from "@/lib/hostedRequests";
import type { HostedCommand } from "@/lib/hostedCommands";
import type { HostedNoteState } from "@notes-app/core/hosted";

const literal = (value: unknown) => JSON.stringify(value).replace(/</g, "\\u003c");

export function useHostedEditor(
  noteId: string,
  onState: (state: HostedNoteState) => void,
  onLink: (id: string) => void,
  onLinkPrompt: () => void,
  onComment: (threadId: string) => void,
) {
  const web = useRef<WebView<object>>(null);
  const waiting = useRef(new HostedRequests());
  const generation = useRef(0);
  const ready = useRef(false);
  const reset = useCallback(() => {
    generation.current += 1;
    ready.current = false;
    waiting.current.reset("The note was closed or reloaded");
  }, []);
  useEffect(() => {
    reset();
    return reset;
  }, [noteId, reset]);

  const execute = useCallback(<T = unknown>(command: HostedCommand): Promise<T> => {
    if (!web.current || !ready.current)
      return Promise.reject(new Error("The note is still loading"));
    const id = randomUUID();
    return waiting.current.request<T>(
      id,
      () => {
        web.current!.injectJavaScript(
          `window.nappCommand?.(${literal(id)}, ${literal(command)});true;`,
        );
      },
      240000,
    );
  }, []);

  const onMessage = async (event: WebViewMessageEvent) => {
    const currentGeneration = generation.current;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(event.nativeEvent.data) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!message || typeof message !== "object") return;
    if (message.kind === "result" && typeof message.id === "string") {
      waiting.current.settle(
        message.id,
        message.value,
        typeof message.error === "string" ? message.error : undefined,
      );
    } else if (message.kind === "commentOpen" && typeof message.threadId === "string") {
      onComment(message.threadId);
    } else if (message.kind === "linkPrompt") {
      onLinkPrompt();
    } else if (message.kind === "link" && typeof message.noteId === "string") {
      onLink(message.noteId);
    } else if (message.kind === "file" && typeof message.id === "string") {
      let error: string | undefined;
      try {
        if (
          typeof message.name !== "string" ||
          typeof message.base64 !== "string" ||
          !["open", "save"].includes(String(message.operation))
        )
          throw new Error("Invalid file request");
        const directory = new Directory(Paths.cache, `export-${randomUUID()}`);
        directory.create();
        const file = new File(directory, message.name.replace(/[/\\]/g, "-") || "Note");
        file.create();
        await file.write(message.base64, { encoding: "base64" });
        const options = { mimeType: typeof message.mime === "string" ? message.mime : undefined };
        const preview = message.operation === "open" && (await file.canPreview(options));
        if (generation.current !== currentGeneration) return;
        if (preview) await file.preview(options);
        else await shareAsync(file.uri, options);
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
      }
      if (generation.current === currentGeneration)
        web.current?.injectJavaScript(
          `window.nappFileResult?.(${literal(message.id)},${literal(error ?? null)});true;`,
        );
    } else if (typeof message.ready === "boolean" && typeof message.connection === "string") {
      ready.current = Boolean(message.available ?? message.ready);
      onState(message as unknown as HostedNoteState);
    }
  };
  return { web, execute, onMessage, onLoadStart: reset };
}
