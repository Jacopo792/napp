/* One note, open. The words are the core's editor in a WebView — the page in
 * editor/ — and everything around them is drawn here.
 *
 * The page is loaded as a string with `https://notes` as its base URL: that is
 * the Origin the collaboration server accepts, where an HTML string loaded any
 * other way sends `null` and is refused. What crosses into it is which note,
 * as whom, and the access token, set before its script runs; a refreshed token
 * follows it in. The refresh token never crosses — see editor/main.tsx. */
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import { DEFAULT_APPEARANCE } from "@/lib/appearance";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseClient";

const { background: ground, foreground: ink, accent } = DEFAULT_APPEARANCE;

/* Built by `pnpm editor` before Metro runs; read once per launch. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PAGE: number = require("../editor/dist/index.html");
let page: Promise<string> | null = null;
const pageHtml = () =>
  (page ??= Asset.fromModule(PAGE)
    .downloadAsync()
    .then((asset) => new File(asset.localUri!).text()));

interface Props {
  session: AppSession;
  noteId: string;
  name: string;
  canEdit: boolean;
  onBack: () => void;
}

export function NoteScreen({ session, noteId, name, canEdit, onBack }: Props) {
  const [html, setHtml] = useState<string | null>(null);
  const [accessToken, setAccessToken] = useState<string | null | undefined>(undefined);
  const [state, setState] = useState<HostedNoteState | null>(null);
  /* `WebView<object>`: the library's default type argument is `undefined`,
     and its props intersected with `undefined` are `never`. */
  const web = useRef<WebView<object>>(null);

  useEffect(() => {
    void pageHtml().then(setHtml);
    void supabase.auth
      .getSession()
      .then(({ data }) => setAccessToken(data.session?.access_token ?? null));
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "TOKEN_REFRESHED" && next)
        web.current?.injectJavaScript(
          `window.nappToken(${JSON.stringify(next.access_token)});true;`,
        );
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const opening = useMemo(
    () =>
      accessToken === undefined
        ? null
        : `window.napp = ${JSON.stringify({ session, noteId, name, canEdit, accessToken })};true;`,
    [session, noteId, name, canEdit, accessToken],
  );

  const status = !state
    ? ""
    : state.refusal ||
      (state.connection === "offline"
        ? "Offline"
        : state.ready
          ? ""
          : state.waking
            ? "Waking the server"
            : "Connecting");

  return (
    <View style={styles.screen}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={12}>
          <Text style={styles.back}>‹ Notes</Text>
        </Pressable>
        <Text style={styles.status}>{status}</Text>
      </View>
      {html && opening ? (
        <WebView<object>
          ref={web}
          style={styles.page}
          source={{ html, baseUrl: "https://notes" }}
          originWhitelist={["*"]}
          injectedJavaScriptBeforeContentLoaded={opening}
          onMessage={(event) => setState(JSON.parse(event.nativeEvent.data) as HostedNoteState)}
          keyboardDisplayRequiresUserAction={false}
          hideKeyboardAccessoryView
          webviewDebuggingEnabled={__DEV__}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: ground },
  bar: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: accent, fontSize: 17 },
  status: { color: `${ink}88`, fontSize: 13 },
  page: { flex: 1, backgroundColor: ground },
});
