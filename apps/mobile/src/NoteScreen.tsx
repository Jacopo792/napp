/* One note, open. The words are the core's editor in a WebView — the page in
 * editor/ — and everything around them is drawn here.
 *
 * The page is loaded as a string with `https://notes` as its base URL: that is
 * the Origin the collaboration server accepts, where an HTML string loaded any
 * other way sends `null` and is refused. What crosses into it is which note,
 * as whom, and the access token, set before its script runs; a refreshed token
 * follows it in. The refresh token never crosses — see editor/main.tsx.
 *
 * The movement has a cause, as lib/motion.ts asks: the note opens out of the
 * row that was touched and closes back into it. What grows is a window over a
 * page that is already full size, so the WebView is laid out once and never
 * per frame. The left edge takes the page back under the finger, and a page
 * pushed far enough or fast enough goes home into its row. */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { WebView } from "react-native-webview";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { Asset } from "expo-asset";
import { File } from "expo-file-system";
import type { HostedNoteState } from "@notes-app/core/hosted";
import type { AppSession } from "@/lib/session";
import { supabase } from "@/lib/supabaseClient";
import { ChevronLeft } from "./icons";
import type { Origin } from "./SwipeRow";
import { accent, ground, muted, settle, travel } from "./theme";

/* How far the page has to be pushed, or how fast, to go home. */
const HOME_AT = 0.33;
const HOME_FAST = 800;

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
  /** The row the note was opened from, in window coordinates. */
  origin: Origin;
  /** The page is back in its row; the list may forget it. */
  onClosed: () => void;
}

export function NoteScreen({ session, noteId, name, canEdit, origin, onClosed }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const open = useSharedValue(0);
  const pushed = useSharedValue(0);

  useEffect(() => {
    open.value = withTiming(1, travel);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [open]);

  const close = useCallback(() => {
    pushed.value = withTiming(0, travel);
    open.value = withTiming(0, travel, (done) => {
      if (done) scheduleOnRN(onClosed);
    });
  }, [open, pushed, onClosed]);

  const edge = usePanGesture({
    activeOffsetX: 8,
    failOffsetY: [-14, 14],
    onUpdate: (event) => {
      pushed.value = Math.max(0, event.translationX);
    },
    onDeactivate: (event) => {
      if (pushed.value > width * HOME_AT || event.velocityX > HOME_FAST) {
        scheduleOnRN(close);
      } else {
        pushed.value = withTiming(0, settle);
      }
    },
  });

  /* The window: from the row's box to the screen's. */
  const frame = useAnimatedStyle(() => ({
    left: interpolate(open.value, [0, 1], [origin.x, 0]),
    top: interpolate(open.value, [0, 1], [origin.y, 0]),
    width: interpolate(open.value, [0, 1], [origin.width, width]),
    height: interpolate(open.value, [0, 1], [origin.height, height]),
    borderRadius: interpolate(open.value, [0, 1], [12, 0]) + Math.min(24, pushed.value / 8),
    transform: [{ translateX: pushed.value }, { scale: 1 - (pushed.value / width) * 0.08 }],
  }));
  /* The page under it stays where the screen is, so the window uncovers it. */
  const content = useAnimatedStyle(() => ({
    left: interpolate(open.value, [0, 1], [-origin.x, 0]),
    top: interpolate(open.value, [0, 1], [-origin.y, 0]),
    opacity: interpolate(open.value, [0, 0.5], [0, 1], "clamp"),
  }));
  const shade = useAnimatedStyle(() => ({
    opacity: open.value * 0.5 * (1 - pushed.value / width),
  }));
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
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[styles.shade, shade]} pointerEvents="none" />
      <Animated.View style={[styles.frame, frame]}>
        <Animated.View style={[styles.content, { width, height }, content]}>
          <View style={[styles.bar, { marginTop: insets.top }]}>
            <Pressable onPress={close} hitSlop={12} style={styles.backPress}>
              <ChevronLeft size={22} color={accent} weight="bold" />
              <Text style={styles.back}>Notes</Text>
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
          {/* The left edge belongs to the gesture, not to the words. */}
          <GestureDetector gesture={edge}>
            {/* Never flattened away: without a native view of its own the
                strip lets the touch through to the editor under it. */}
            <View collapsable={false} style={[styles.edge, { top: insets.top + 44 }]} />
          </GestureDetector>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  shade: { ...StyleSheet.absoluteFill, backgroundColor: "#000000" },
  frame: { position: "absolute", overflow: "hidden", backgroundColor: ground },
  content: { position: "absolute", backgroundColor: ground },
  edge: { position: "absolute", left: 0, bottom: 0, width: 24 },
  backPress: { flexDirection: "row", alignItems: "center", gap: 2 },
  bar: {
    height: 44,
    paddingHorizontal: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  back: { color: accent, fontSize: 17 },
  status: { color: muted, fontSize: 13 },
  page: { flex: 1, backgroundColor: ground },
});
