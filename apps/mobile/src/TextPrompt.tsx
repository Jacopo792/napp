import {
  useCallback,
  useEffect,
  createContext,
  useContext,
  useRef,
  useState,
  type ReactNode,
  type ComponentRef,
} from "react";
/* The app's own menu and its naming card, on both platforms.
 *
 * A menu grows out of the finger that asked for it, the way an iOS 26 context
 * menu does: the provider remembers the last touch anywhere under it, and the
 * popover is laid beside that point and scales out of it on a spring with no
 * overshoot. A button the touch never reached (a native toolbar item) gets the
 * bar's top-right corner, which is where those buttons are. Rows are a tile
 * and a name and nothing under it. Closing is a short fade-and-shrink, and
 * whatever was chosen runs once the Modal has gone, so a prompt or a picker
 * opened from it does not collide with it. */
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type KeyboardTypeOptions,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import * as Haptics from "expo-haptics";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import type { SFSymbol } from "expo-symbols";
import { SymbolView } from "./icons";
import { Press, quiet } from "./Grouped";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette, type Palette } from "./archive";

type Request = {
  title: string;
  message?: string;
  value: string;
  keyboard?: KeyboardTypeOptions;
  submit: (value: string) => void;
};
type Prompt = (
  title: string,
  message: string | undefined,
  submit: (value: string) => void,
  type?: "plain-text",
  value?: string,
  keyboard?: KeyboardTypeOptions,
) => void;
const Context = createContext<Prompt>(() => {});
export const useTextPrompt = () => useContext(Context);

export interface Choice {
  label: string;
  icon?: SFSymbol;
  /** Read to VoiceOver as a hint; never drawn under the label. */
  detail?: string;
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
type Choose = (
  title: string | undefined,
  choices: Choice[],
  preview?: ReactNode,
  anchor?: "toolbar",
) => void;
const Choices = createContext<Choose>(() => {});
/** A short list of acts, offered from a button: the ⋯ of a folder, the +. */
export const useChoice = () => useContext(Choices);

const glassy = Platform.OS === "ios" && isLiquidGlassAvailable();
const MENU_WIDTH = 256;
const ROW = 50;
const HEAD = 34;
const PAD = 6;
const PREVIEW = 260;
/** How long a touch still counts as the one that opened the menu. */
const FRESH_MS = 1500;
/** Open: the same no-overshoot spring as everything else, a little quicker. */
const grow = { dampingRatio: 1, duration: 340 } as const;
const shrink = { duration: 150, easing: Easing.out(Easing.quad) };

type Place = {
  top: number;
  left: number;
  width: number;
  height: number;
  origin: [number, number, number];
  preview?: { top: number };
};

export function TextPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [offer, setOffer] = useState<{
    title?: string;
    choices: Choice[];
    preview?: ReactNode;
    place: Place;
  } | null>(null);
  const [visible, setVisible] = useState<"offer" | "request" | null>(null);
  const afterDismiss = useRef<(() => void) | null>(null);
  const closing = useRef(false);
  const touch = useRef<{ x: number; y: number; at: number } | null>(null);
  const field = useRef<ComponentRef<typeof TextInput>>(null);
  const shown = useSharedValue(0);
  const screen = useWindowDimensions();
  const finishDismiss = useCallback(() => {
    if (!closing.current) return;
    closing.current = false;
    setOffer(null);
    setRequest(null);
    const action = afterDismiss.current;
    afterDismiss.current = null;
    action?.();
  }, []);
  const hide = useCallback(() => setVisible(null), []);
  const close = (action?: () => void) => {
    if (closing.current) return;
    closing.current = true;
    afterDismiss.current = action ?? null;
    if (visible === "offer")
      shown.value = withTiming(0, shrink, (finished) => {
        "worklet";
        if (finished) scheduleOnRN(hide);
      });
    else hide();
  };
  // Android omits onDismiss; iOS can omit it for a non-animated Modal too.
  // Keep the native callback, with an idempotent fallback after dismissal.
  useEffect(() => {
    if (visible || !closing.current) return;
    const timer = setTimeout(finishDismiss, offer ? 60 : 350);
    return () => clearTimeout(timer);
  }, [visible, offer, finishDismiss]);
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const choose = useCallback<Choose>(
    (title, all, preview, anchor) => {
      const choices = all.filter((choice) => !choice.disabled);
      const recent =
        anchor !== "toolbar" && touch.current && Date.now() - touch.current.at < FRESH_MS
          ? touch.current
          : null;
      const place = placeMenu({
        rows: choices.length,
        titled: Boolean(title),
        preview: Boolean(preview),
        at: recent,
        screen,
        inset,
      });
      setOffer({ title, choices, preview, place });
      shown.value = 0;
      setVisible("offer");
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    },
    [screen, inset, shown],
  );
  const prompt = useCallback<Prompt>((title, message, submit, _type, value = "", keyboard) => {
    setRequest({ title, message, submit, value, keyboard });
    setVisible("request");
  }, []);
  const accept = () => {
    if (request?.value.trim()) {
      close(() => request.submit(request.value));
    }
  };
  const ready = Boolean(request?.value.trim());
  return (
    <Context.Provider value={prompt}>
      <Choices.Provider value={choose}>
        <View
          style={{ flex: 1 }}
          onTouchStart={(event) => {
            touch.current = {
              x: event.nativeEvent.pageX,
              y: event.nativeEvent.pageY,
              at: Date.now(),
            };
          }}
        >
          {children}
        </View>
        <Modal
          onDismiss={finishDismiss}
          visible={visible === "offer"}
          transparent
          animationType="none"
          statusBarTranslucent
          navigationBarTranslucent
          onRequestClose={() => close()}
        >
          {offer ? (
            <Popover
              offer={offer}
              shown={shown}
              palette={palette}
              onClose={() => close()}
              onChoose={(choice) => close(choice.run)}
            />
          ) : null}
        </Modal>
        <Modal
          onDismiss={finishDismiss}
          visible={visible === "request"}
          onShow={() => field.current?.focus()}
          transparent
          animationType="fade"
          statusBarTranslucent
          onRequestClose={() => close()}
        >
          <KeyboardAvoidingView
            style={[styles.promptGround, { paddingBottom: inset.bottom }]}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              style={StyleSheet.absoluteFill}
              onPress={() => close()}
            />
            <View
              accessibilityViewIsModal
              style={[styles.promptCard, { backgroundColor: palette.paper }]}
            >
              <Text accessibilityRole="header" style={[styles.promptTitle, { color: palette.ink }]}>
                {request?.title}
              </Text>
              {request?.message ? (
                <Text style={{ color: palette.ink3, fontSize: 15, textAlign: "center" }}>
                  {request.message}
                </Text>
              ) : null}
              <TextInput
                ref={field}
                accessibilityLabel={request?.title}
                autoFocus
                selectTextOnFocus
                returnKeyType="done"
                autoCapitalize={request?.keyboard ? "none" : "sentences"}
                autoCorrect={!request?.keyboard}
                value={request?.value ?? ""}
                onChangeText={(value) => setRequest((prev) => prev && { ...prev, value })}
                keyboardType={request?.keyboard}
                onSubmitEditing={accept}
                placeholder="Name"
                placeholderTextColor={palette.ink4}
                selectionColor={palette.accent}
                style={[
                  styles.promptField,
                  { color: palette.ink, backgroundColor: quiet(palette) },
                ]}
              />
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Press
                  feedback="scale"
                  accessibilityRole="button"
                  style={[styles.promptButton, { backgroundColor: quiet(palette) }]}
                  onPress={() => close()}
                >
                  <Text style={[styles.promptButtonText, { color: palette.ink }]}>Cancel</Text>
                </Press>
                <Press
                  feedback="scale"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: !ready }}
                  disabled={!ready}
                  style={[
                    styles.promptButton,
                    { backgroundColor: palette.ink, opacity: ready ? 1 : 0.35 },
                  ]}
                  onPress={accept}
                >
                  <Text style={[styles.promptButtonText, { color: palette.page }]}>Save</Text>
                </Press>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Choices.Provider>
    </Context.Provider>
  );
}

/** Where the menu stands: beside the touch that asked for it, opening away
 *  from the nearer edge, its origin at that touch. */
function placeMenu({
  rows,
  titled,
  preview,
  at,
  screen: window,
  inset,
}: {
  rows: number;
  titled: boolean;
  preview: boolean;
  at: { x: number; y: number } | null;
  screen: { width: number; height: number };
  inset: { top: number; bottom: number };
}): Place {
  const margin = 12;
  const width = Math.min(MENU_WIDTH, window.width - margin * 2);
  const room = window.height - inset.top - inset.bottom - margin * 2;
  const height = Math.min(
    rows * ROW + (titled ? HEAD : 0) + PAD * 2,
    (preview ? room - PREVIEW - 10 : room * 0.7) | 0,
  );
  if (preview) {
    // A held note: the note lifted in the middle, its acts under it.
    const top = Math.max(inset.top + margin, (window.height - PREVIEW - 10 - height) / 2);
    const left = margin + 4;
    return {
      top: top + PREVIEW + 10,
      left,
      width,
      height,
      origin: [width / 2, 0, 0],
      preview: { top },
    };
  }
  const x = at?.x ?? window.width - 36;
  const y = at?.y ?? inset.top + 22;
  const right = x > window.width / 2;
  const below = y < window.height * 0.55;
  const clampX = (v: number) => Math.min(Math.max(v, margin), window.width - margin - width);
  const clampY = (v: number) =>
    Math.min(Math.max(v, inset.top + margin), window.height - inset.bottom - margin - height);
  // 22 points past the finger is the far edge of a 40-point button.
  const left = clampX(right ? x + 22 - width : x - 22);
  const top = clampY(below ? y + 28 : y - 28 - height);
  return {
    top,
    left,
    width,
    height,
    origin: [Math.min(Math.max(x - left, 0), width), Math.min(Math.max(y - top, 0), height), 0],
  };
}

function Popover({
  offer,
  shown,
  palette,
  onClose,
  onChoose,
}: {
  offer: { title?: string; choices: Choice[]; preview?: ReactNode; place: Place };
  shown: SharedValue<number>;
  palette: Palette;
  onClose: () => void;
  onChoose: (choice: Choice) => void;
}) {
  const { place } = offer;
  // Grows once it is on screen; the Modal mounts it in the same breath.
  useEffect(() => {
    shown.value = withSpring(1, grow);
  }, [shown]);
  const dim = useAnimatedStyle(() => ({ opacity: shown.value }));
  const grows = useAnimatedStyle(() => ({
    // UIVisualEffectView needs an opaque ancestor to composite its material.
    opacity: glassy ? 1 : interpolate(shown.value, [0, 0.35], [0, 1], "clamp"),
    transform: [{ scale: 0.3 + 0.7 * shown.value }],
  }));
  const lifts = useAnimatedStyle(() => ({
    opacity: shown.value,
    transform: [{ scale: 0.94 + 0.06 * shown.value }],
  }));
  const fits = place.height >= offer.choices.length * ROW + (offer.title ? HEAD : 0) + PAD * 2;
  const shape = {
    width: place.width,
    height: place.height,
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden",
  } as const;
  const rows = (
    <ScrollView
      scrollEnabled={!fits}
      bounces={false}
      contentContainerStyle={{ paddingVertical: PAD }}
    >
      {offer.title ? (
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[styles.menuTitle, { color: palette.ink3 }]}
        >
          {offer.title}
        </Text>
      ) : null}
      {offer.choices.map((choice) => {
        const tint = choice.destructive ? palette.danger : palette.ink;
        return (
          <Press
            key={choice.label}
            accessibilityRole="button"
            accessibilityLabel={choice.label}
            accessibilityHint={choice.detail}
            style={styles.menuRow}
            onPress={() => onChoose(choice)}
          >
            <View style={[styles.menuTile, { backgroundColor: quiet(palette) }]}>
              <SymbolView
                name={choice.icon ?? actionIcon(choice.label)}
                size={17}
                weight="medium"
                tintColor={tint}
              />
            </View>
            <Text numberOfLines={1} style={[styles.menuLabel, { color: tint }]}>
              {choice.label}
            </Text>
          </Press>
        );
      })}
    </ScrollView>
  );
  return (
    <View style={{ flex: 1 }}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: palette.dark ? "#00000066" : "#0000002e" },
          dim,
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          style={StyleSheet.absoluteFill}
          onPress={onClose}
        />
      </Animated.View>
      {offer.preview && place.preview ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.preview,
            { top: place.preview.top, backgroundColor: palette.canvas },
            lifts,
          ]}
        >
          {offer.preview}
        </Animated.View>
      ) : null}
      <Animated.View
        accessibilityViewIsModal
        style={[
          styles.menuShadow,
          { top: place.top, left: place.left, transformOrigin: place.origin },
          grows,
        ]}
      >
        {glassy ? (
          <GlassView
            glassEffectStyle="regular"
            colorScheme={palette.dark ? "dark" : "light"}
            style={shape}
          >
            {rows}
          </GlassView>
        ) : (
          <View
            style={[
              shape,
              {
                backgroundColor: palette.paper,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: palette.rule,
              },
            ]}
          >
            {rows}
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  menuShadow: {
    position: "absolute",
    borderRadius: 24,
    shadowColor: "#000",
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  menuTitle: {
    height: HEAD,
    paddingHorizontal: 18,
    paddingTop: 9,
    fontSize: 13,
    fontWeight: "600",
  },
  menuRow: {
    height: ROW,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 10,
    marginHorizontal: 6,
    borderRadius: 16,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  menuTile: {
    width: 32,
    height: 32,
    borderRadius: 10,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  menuLabel: { flex: 1, fontSize: 17, fontWeight: "500", letterSpacing: -0.3 },
  preview: {
    position: "absolute",
    left: 16,
    right: 16,
    height: PREVIEW,
    borderRadius: 24,
    borderCurve: "continuous",
    overflow: "hidden",
  },
  promptGround: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
    backgroundColor: "#00000080",
  },
  promptCard: {
    padding: 20,
    paddingTop: 22,
    borderRadius: 28,
    borderCurve: "continuous",
    gap: 16,
  },
  promptTitle: { fontSize: 20, fontWeight: "600", letterSpacing: -0.4, textAlign: "center" },
  promptField: {
    height: 48,
    borderRadius: 14,
    borderCurve: "continuous",
    paddingHorizontal: 14,
    fontSize: 17,
  },
  promptButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
  },
  promptButtonText: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
});

function actionIcon(label: string): SFSymbol {
  if (/folder/i.test(label)) return "folder";
  if (/import/i.test(label)) return "arrow.down.doc";
  if (/note/i.test(label)) return "square.and.pencil";
  if (/rename|name/i.test(label)) return "pencil";
  if (/delete|remove/i.test(label)) return "trash";
  if (/archive/i.test(label)) return "archivebox";
  if (/pin/i.test(label)) return "pin";
  if (/lock/i.test(label)) return "lock";
  if (/account|sign out/i.test(label)) return "person.crop.circle";
  return "arrow.right";
}
