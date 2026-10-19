/* Signing in stays deliberately small: the core owns the account flow; this
 * screen gives it a native, calm place to happen.
 *
 * The ground is a wall of notes drifting upward (NoteWall.tsx), the app's own
 * material; the form stands on it in a frosted card at the foot, Revolut's
 * onboarding.
 *
 * Every movement on it has a cause (Movement with a cause, CLAUDE.md). The
 * wall settles in first, then the title, then the card rises with its
 * contents a beat behind each other. Sign In and Create Account are one
 * form that changes shape: the switch's plate stretches toward the side it is
 * going to and gathers as it lands, the titles cross in the direction it
 * travels, and the repeated password grows out of the card rather than
 * appearing in it. Pressed, the button gathers into a ring and turns while the
 * account is asked for; refused, the card shakes once under the hand before
 * the status line says why; accepted, the page gathers itself and gives way to
 * the app. All of it on the UI thread, on springs with no overshoot, and a
 * fade alone under Reduce Motion. */
import { useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  interpolateColor,
  useAnimatedKeyboard,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import {
  authenticate,
  otherAccounts,
  chooseArchive,
  registerAccount,
  type AppSession,
  type AuthenticationResult,
} from "@/lib/session";
import { createSpace } from "@/lib/spaces";
import { DURATION, EASE } from "@/lib/motionTokens";
import { useTextPrompt } from "./TextPrompt";
import { usePalette, type Palette } from "./archive";
import { Press } from "./Grouped";
import { NoteWall } from "./NoteWall";
import { SymbolView } from "./icons";
import { glide, release } from "./theme";

type Mode = "sign-in" | "sign-up";

/** Whatever theme the reader chose, this page is light ink on a dark wall. */
function onWall(palette: Palette): Palette {
  return {
    ...palette,
    dark: true,
    page: "#14120f",
    paper: "rgba(255,255,255,0.10)",
    ink: "#ffffff",
    ink2: "rgba(255,255,255,0.84)",
    ink3: "rgba(255,255,255,0.62)",
    ink4: "rgba(255,255,255,0.40)",
    rule: "rgba(255,255,255,0.14)",
    danger: "#ff9b8f",
  };
}

const glassy = Platform.OS === "ios" && isLiquidGlassAvailable();

const COPY: Record<Mode, { title: string; lede: string; action: string }> = {
  "sign-in": { title: "Welcome back.", lede: "Sign in to your notes.", action: "Sign In" },
  "sign-up": {
    title: "Start an archive.",
    lede: "Your notes, shared with whom you choose.",
    action: "Create Account",
  },
};

const standard = Easing.bezier(
  EASE.standard[0],
  EASE.standard[1],
  EASE.standard[2],
  EASE.standard[3],
);
/** Arriving: slower than a press, still no overshoot. */
const arrive = { dampingRatio: 1, duration: 620 } as const;
/** The switch's two edges, as WhoseSwitch's: the leading one quicker. */
const lead = { dampingRatio: 1, duration: 300 } as const;
const trail = { dampingRatio: 1, duration: 460 } as const;
/** How long the page takes to gather before the app is mounted over it. */
const GATHER = 280;
const BUTTON = 58;

function haptic(kind: "error" | "success" | "selection") {
  const done =
    kind === "selection"
      ? Haptics.selectionAsync()
      : Haptics.notificationAsync(
          kind === "error"
            ? Haptics.NotificationFeedbackType.Error
            : Haptics.NotificationFeedbackType.Success,
        );
  void done.catch(() => {});
}

/** A block of the page arriving in its turn: a small rise and a fade, a beat
 *  behind the block above it. Reduce Motion keeps the fade. */
function Arrive({
  order,
  rise = 16,
  children,
  style,
}: {
  order: number;
  rise?: number;
  children: ReactNode;
  style?: object;
}) {
  const reduce = useReducedMotion();
  const shown = useSharedValue(0);
  useEffect(() => {
    const delay = 70 + order * 65;
    shown.value = reduce
      ? withDelay(delay, withTiming(1, { duration: DURATION.base }))
      : withDelay(delay, withSpring(1, arrive));
  }, [order, reduce, shown]);
  const motion = useAnimatedStyle(() => ({
    opacity: Math.min(1, shown.value * 1.4),
    transform: [{ translateY: reduce ? 0 : (1 - shown.value) * rise }],
  }));
  return <Animated.View style={[style, motion]}>{children}</Animated.View>;
}

/** Something that joins the page by growing the room it needs, so what is
 *  under it is pushed down rather than jumped. Its last content is kept while
 *  it closes, so words never vanish ahead of their space. */
function Grow({ open, children }: { open: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  const height = useSharedValue(0);
  const shown = useSharedValue(open ? 1 : 0);
  const kept = useRef(children);
  if (open) kept.current = children;
  useEffect(() => {
    shown.value = reduce
      ? withTiming(open ? 1 : 0, { duration: DURATION.base })
      : withSpring(open ? 1 : 0, glide);
  }, [open, reduce, shown]);
  const room = useAnimatedStyle(() => ({
    height: height.value * (reduce ? (open ? 1 : 0) : shown.value),
    opacity: shown.value * shown.value,
    transform: [{ scale: reduce ? 1 : 0.96 + 0.04 * shown.value }],
  }));
  return (
    <Animated.View
      style={[{ overflow: "hidden" }, room]}
      pointerEvents={open ? "auto" : "none"}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      <View
        style={{ position: "absolute", top: 0, left: 0, right: 0 }}
        onLayout={(event) => {
          height.value = event.nativeEvent.layout.height;
        }}
      >
        {kept.current}
      </View>
    </Animated.View>
  );
}

/** A field whose surface answers being written in: it lights a little and
 *  stands up off the page, the label coming to full ink. No ring. */
function Field({
  label,
  accessory,
  inputRef,
  palette,
  ...input
}: TextInputProps & {
  label: string;
  accessory?: ReactNode;
  inputRef?: React.Ref<ComponentRef<typeof TextInput>>;
  palette: Palette;
}) {
  const focus = useSharedValue(0);
  const rest = palette.paper;
  const surface = useAnimatedStyle(() => ({
    backgroundColor: palette.dark
      ? interpolateColor(focus.value * 0.12, [0, 1], [rest, "#ffffff"])
      : rest,
    borderColor: interpolateColor(focus.value, [0, 1], [palette.rule, "rgba(0,0,0,0)"]),
    shadowOpacity: palette.dark ? 0 : 0.1 * focus.value,
    transform: [{ scale: 1 + 0.012 * focus.value }],
  }));
  const ink = useAnimatedStyle(() => ({
    color: interpolateColor(focus.value, [0, 1], [palette.ink3, palette.ink]),
  }));
  return (
    <Animated.View style={[styles.field, surface]}>
      <View style={styles.fieldLabelRow}>
        <Animated.Text style={[styles.fieldLabel, ink]}>{label}</Animated.Text>
        {accessory}
      </View>
      <TextInput
        ref={inputRef}
        placeholderTextColor={palette.ink4}
        autoCapitalize="none"
        autoCorrect={false}
        accessibilityLabel={label}
        {...input}
        style={[styles.input, { color: palette.ink }]}
        onFocus={(event) => {
          focus.value = withTiming(1, { duration: DURATION.fast, easing: standard });
          input.onFocus?.(event);
        }}
        onBlur={(event) => {
          focus.value = withTiming(0, { duration: DURATION.base, easing: standard });
          input.onBlur?.(event);
        }}
      />
    </Animated.View>
  );
}

/** A small ring turning: what the button gathers into while it waits. */
function Ring({ color, turning }: { color: string; turning: boolean }) {
  const spin = useSharedValue(0);
  useEffect(() => {
    if (!turning) {
      cancelAnimation(spin);
      return;
    }
    spin.value = 0;
    spin.value = withRepeat(withTiming(360, { duration: 820, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(spin);
  }, [turning, spin]);
  const turn = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value}deg` }] }));
  return (
    <Animated.View
      style={[
        styles.ring,
        { borderColor: "transparent", borderTopColor: color, borderRightColor: color },
        turn,
      ]}
    />
  );
}

/** Sign In / Create Account: WhoseSwitch's plate with words in it. */
function ModeSwitch({
  mode,
  left,
  right,
  onChoose,
  palette,
}: {
  mode: Mode;
  left: SharedValue<number>;
  right: SharedValue<number>;
  onChoose: (next: Mode) => void;
  palette: Palette;
}) {
  const width = useSharedValue(0);
  const [measured, setMeasured] = useState(false);
  const place = useDerivedValue(() => (left.value + right.value - 1) / 2);
  const thumb = useAnimatedStyle(() => {
    const segment = width.value / 2;
    return {
      width: (right.value - left.value) * segment,
      transform: [{ translateX: left.value * segment }],
    };
  });
  const inkIn = useAnimatedStyle(() => ({
    color: interpolateColor(place.value, [0, 1], [palette.ink, palette.ink3]),
  }));
  const inkUp = useAnimatedStyle(() => ({
    color: interpolateColor(place.value, [0, 1], [palette.ink3, palette.ink]),
  }));
  const segments: [Mode, string, typeof inkIn][] = [
    ["sign-in", "Sign In", inkIn],
    ["sign-up", "Create Account", inkUp],
  ];
  return (
    <View style={[styles.switch, { backgroundColor: palette.paper }]}>
      <View
        accessibilityRole="tablist"
        style={{ flexDirection: "row" }}
        onLayout={(event) => {
          width.value = event.nativeEvent.layout.width;
          setMeasured(true);
        }}
      >
        {measured ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                backgroundColor: palette.dark ? "rgba(255,255,255,0.22)" : "#ffffff",
                shadowOpacity: palette.dark ? 0 : 0.12,
              },
              thumb,
            ]}
          />
        ) : null}
        {segments.map(([value, label, ink]) => (
          <Pressable
            key={value}
            accessibilityRole="tab"
            accessibilityState={{ selected: mode === value }}
            onPress={() => {
              if (mode === value) return;
              haptic("selection");
              onChoose(value);
            }}
            style={styles.segment}
          >
            <Animated.Text numberOfLines={1} style={[styles.segmentLabel, ink]}>
              {label}
            </Animated.Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
const SWITCH = 40;

/** Two lines of copy for the two modes, crossing in the direction the switch
 *  travels. The first is in the flow and holds the room. */
function Crossing({
  at,
  first,
  second,
  style,
}: {
  at: SharedValue<number>;
  first: string;
  second: string;
  style: object;
}) {
  const reduce = useReducedMotion();
  const out = useAnimatedStyle(() => ({
    opacity: interpolate(at.value, [0, 0.6], [1, 0], "clamp"),
    transform: [{ translateX: reduce ? 0 : -14 * at.value }],
  }));
  const into = useAnimatedStyle(() => ({
    opacity: interpolate(at.value, [0.4, 1], [0, 1], "clamp"),
    transform: [{ translateX: reduce ? 0 : 14 * (1 - at.value) }],
  }));
  return (
    <View>
      <Animated.Text style={[style, out]} numberOfLines={1}>
        {first}
      </Animated.Text>
      <Animated.Text
        style={[style, StyleSheet.absoluteFill, into]}
        numberOfLines={1}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {second}
      </Animated.Text>
    </View>
  );
}

/** What gives up its room when the keyboard comes: it folds away at the
 *  keyboard's own pace, so the card can ride up into the space. */
function Yield({ keyboard, children }: { keyboard: SharedValue<number>; children: ReactNode }) {
  const height = useSharedValue(0);
  const fold = useAnimatedStyle(() => {
    if (!height.value) return {};
    const up = interpolate(keyboard.value, [0, 220], [0, 1], "clamp");
    return { height: height.value * (1 - up), opacity: 1 - Math.min(1, up * 1.8) };
  });
  return (
    <Animated.View style={[{ overflow: "hidden" }, fold]}>
      <View
        onLayout={(event) => {
          height.value = event.nativeEvent.layout.height;
        }}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** The frosted card the form stands in: the system's glass where there is
 *  one, a translucent dark plate where there is not. */
function Glass({ children }: { children: ReactNode }) {
  if (glassy)
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme="dark"
        tintColor="rgba(20,16,12,0.35)"
        style={styles.glass}
      >
        {children}
      </GlassView>
    );
  return <View style={[styles.glass, styles.glassFallback]}>{children}</View>;
}

export function SignIn({
  onSession,
  initialChoosing = null,
  onResume,
}: {
  onSession: (session: AppSession) => void;
  initialChoosing?: AuthenticationResult | null;
  onResume: (userId: string) => Promise<void>;
}) {
  const prompt = useTextPrompt();
  const saved = otherAccounts("");
  const app = usePalette();
  const palette = useMemo(() => onWall(app), [app]);
  const insets = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [busy, setBusy] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(initialChoosing);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const repeatInput = useRef<ComponentRef<typeof TextInput>>(null);
  const signUp = mode === "sign-up";

  /* One driver for the change of mode: the switch's two edges, and `at`,
     the plate's centre, which the titles and the button's words read. */
  const left = useSharedValue(0);
  const right = useSharedValue(1);
  const at = useSharedValue(0);
  useEffect(() => {
    const to = signUp ? 1 : 0;
    if (reduce) {
      left.value = to;
      right.value = to + 1;
      at.value = withTiming(to, { duration: DURATION.base });
      return;
    }
    const forward = to + 1 > right.value;
    right.value = withSpring(to + 1, forward ? lead : trail);
    left.value = withSpring(to, forward ? trail : lead);
    at.value = withSpring(to, glide);
  }, [signUp, reduce, left, right, at]);

  /* The card's shake, the button's gathering, and the page's leaving. */
  const shake = useSharedValue(0);
  const gather = useSharedValue(0);
  const gone = useSharedValue(0);
  const buttonWidth = useSharedValue(0);
  useEffect(() => {
    gather.value = reduce
      ? withTiming(busy ? 1 : 0, { duration: DURATION.base })
      : withSpring(busy ? 1 : 0, busy ? glide : release);
  }, [busy, reduce, gather]);

  const keyboardHeight = useAnimatedKeyboard().height;

  function fail(message: string) {
    setError(message);
    haptic("error");
    if (reduce) return;
    shake.value = withSequence(
      withTiming(-11, { duration: 45, easing: standard }),
      withTiming(9, { duration: 70, easing: standard }),
      withTiming(-6, { duration: 65, easing: standard }),
      withTiming(3, { duration: 60, easing: standard }),
      withSpring(0, release),
    );
  }

  /** The page gathers itself, then the app is mounted in its place. If this
   *  screen is still here a moment later, the hand-over did not happen and
   *  the page comes back. */
  async function enter(session: AppSession) {
    haptic("success");
    gone.value = withTiming(1, { duration: GATHER, easing: standard });
    await new Promise((resolve) => setTimeout(resolve, GATHER));
    onSession(session);
    gone.value = withDelay(600, withTiming(0, { duration: DURATION.base }));
  }

  async function attempt(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      fail(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
      setOpening(null);
    }
  }

  const submit = () => {
    if (!email.trim() || !password) {
      fail("Enter your email and password.");
      return;
    }
    void attempt(async () => {
      if (signUp) {
        if (password.length < 8) throw new Error("Use at least 8 characters.");
        if (repeat !== password) throw new Error("The two passwords are different.");
        const result = await registerAccount(email.trim(), password);
        setPassword("");
        setRepeat("");
        if (result.confirmationRequired) setNotice(`Check ${email.trim()} to finish.`);
        else if (result.session) await enter(result.session);
        else setChoosing(result);
        return;
      }
      const result = await authenticate(email.trim(), password, undefined, { notesOnly: true });
      setPassword("");
      if (result.session) await enter(result.session);
      else setChoosing(result);
    });
  };

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setNotice("");
    setPassword("");
    setRepeat("");
    setPasswordVisible(false);
  }

  const page = useAnimatedStyle(() => ({
    opacity: 1 - gone.value,
    transform: [
      { translateY: reduce ? 0 : -14 * gone.value },
      { scale: reduce ? 1 : 1 - 0.04 * gone.value },
    ],
  }));
  const shaking = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  const pill = useAnimatedStyle(() => {
    if (!buttonWidth.value) return {};
    const narrow = reduce ? 0 : gather.value;
    return { width: buttonWidth.value - (buttonWidth.value - BUTTON) * narrow };
  });
  const words = useAnimatedStyle(() => ({
    opacity: interpolate(gather.value, [0, 0.45], [1, 0], "clamp"),
    transform: [{ scale: reduce ? 1 : 1 - 0.08 * gather.value }],
  }));
  const ring = useAnimatedStyle(() => ({
    opacity: interpolate(gather.value, [0.5, 1], [0, 1], "clamp"),
    transform: [{ scale: reduce ? 1 : 0.6 + 0.4 * gather.value }],
  }));

  const status = error || notice;
  let order = 3;

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <NoteWall
        ink={{
          ground: app.dark ? app.page : "#0f0e0c",
          card: app.dark ? app.paper : "#1f1d1a",
          ink: app.dark ? app.ink : "#efece6",
          quiet: "rgba(255,255,255,0.16)",
          edge: "rgba(255,255,255,0.08)",
        }}
      />
      <Animated.ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 10 }]}
        contentInsetAdjustmentBehavior="never"
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}
      >
        <Animated.View style={[styles.content, page]}>
          <Arrive order={0} style={styles.brand}>
            <Text style={[styles.wordmark, { color: palette.ink }]}>napp</Text>
            <View style={[styles.brandDot, { backgroundColor: palette.ink }]} />
          </Arrive>
          <View style={styles.air} />

          {choosing ? (
            <View key="choosing">
              <Yield keyboard={keyboardHeight}>
                <Arrive order={1} style={styles.intro}>
                  <Text style={[styles.title, { color: palette.ink }]}>Your spaces.</Text>
                  <Text style={[styles.lede, { color: palette.ink2 }]}>Choose your archive</Text>
                </Arrive>
              </Yield>
              <Arrive order={2} rise={40}>
                <Glass>
                  <Animated.View style={[styles.choiceList, shaking]}>
                    {!choosing.archives.length ? (
                      <Arrive order={order++} style={{ gap: 10 }}>
                        <Text style={{ color: palette.ink2, fontSize: 16, lineHeight: 23 }}>
                          No notes archives yet. Books stay on your computer.
                        </Text>
                        <Press
                          feedback="scale"
                          accessibilityRole="button"
                          disabled={busy}
                          style={[styles.archiveButton, { backgroundColor: palette.paper }]}
                          onPress={() =>
                            prompt("New Archive", "A space for your notes.", (name) => {
                              if (!name.trim()) return;
                              void attempt(async () =>
                                enter(
                                  await chooseArchive(
                                    choosing.account,
                                    await createSpace(name.trim(), "notes"),
                                    { notesOnly: true },
                                  ),
                                ),
                              );
                            })
                          }
                        >
                          <Text style={[styles.archiveName, { color: palette.ink }]}>
                            Create Notes Archive
                          </Text>
                          {busy ? <Ring color={palette.ink3} turning /> : null}
                        </Press>
                      </Arrive>
                    ) : null}
                    {choosing.archives.map((archive) => (
                      <Arrive key={archive.archiveId} order={order++}>
                        <Press
                          feedback="scale"
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={`Open ${archive.name}`}
                          style={[
                            styles.archiveButton,
                            {
                              backgroundColor: palette.paper,
                              opacity: busy && opening !== archive.archiveId ? 0.5 : 1,
                            },
                          ]}
                          onPress={() => {
                            setOpening(archive.archiveId);
                            void attempt(async () =>
                              enter(
                                await chooseArchive(choosing.account, archive.archiveId, {
                                  notesOnly: true,
                                }),
                              ),
                            );
                          }}
                        >
                          <Text style={[styles.archiveName, { color: palette.ink }]}>
                            {archive.name}
                          </Text>
                          {opening === archive.archiveId ? (
                            <Ring color={palette.ink3} turning />
                          ) : (
                            <Text style={[styles.archiveOpen, { color: palette.ink3 }]}>Open</Text>
                          )}
                        </Press>
                      </Arrive>
                    ))}
                  </Animated.View>
                  <Grow open={Boolean(error)}>
                    <StatusLine palette={palette} text={error} danger />
                  </Grow>
                  <Arrive order={order++}>
                    <Press
                      feedback="scale"
                      onPress={() => {
                        setChoosing(null);
                        setPassword("");
                        setError("");
                      }}
                      disabled={busy}
                      style={{ paddingTop: 16, paddingBottom: 4, alignSelf: "center" }}
                      accessibilityRole="button"
                    >
                      <Text style={{ color: palette.ink2, fontSize: 15, fontWeight: "500" }}>
                        Use another account
                      </Text>
                    </Press>
                  </Arrive>
                </Glass>
              </Arrive>
            </View>
          ) : (
            <View key="form">
              <Yield keyboard={keyboardHeight}>
                <Arrive order={1} style={styles.intro}>
                  <Crossing
                    at={at}
                    first={COPY["sign-in"].title}
                    second={COPY["sign-up"].title}
                    style={[styles.title, { color: palette.ink }]}
                  />
                  <Crossing
                    at={at}
                    first={COPY["sign-in"].lede}
                    second={COPY["sign-up"].lede}
                    style={[styles.lede, { color: palette.ink2 }]}
                  />
                </Arrive>
              </Yield>
              <Arrive order={2} rise={40}>
                <Glass>
                  <Arrive order={3} style={{ marginBottom: 14 }}>
                    <ModeSwitch
                      mode={mode}
                      left={left}
                      right={right}
                      onChoose={switchMode}
                      palette={palette}
                    />
                  </Arrive>
                  <Arrive order={4}>
                    <Animated.View style={shaking}>
                      <Field
                        palette={palette}
                        label="Email"
                        placeholder="you@example.com"
                        autoComplete="email"
                        keyboardType="email-address"
                        textContentType="emailAddress"
                        returnKeyType="next"
                        keyboardAppearance="dark"
                        value={email}
                        onSubmitEditing={() => passwordInput.current?.focus()}
                        onChangeText={(next) => {
                          setEmail(next);
                          if (error) setError("");
                        }}
                      />
                      <View style={{ height: 10 }} />
                      <Field
                        palette={palette}
                        inputRef={passwordInput}
                        label="Password"
                        accessory={
                          <Pressable
                            hitSlop={10}
                            onPress={() => setPasswordVisible((visible) => !visible)}
                            accessibilityRole="button"
                            accessibilityLabel={passwordVisible ? "Hide password" : "Show password"}
                          >
                            <Text style={[styles.reveal, { color: palette.ink3 }]}>
                              {passwordVisible ? "Hide" : "Show"}
                            </Text>
                          </Pressable>
                        }
                        placeholder={signUp ? "At least 8 characters" : "Your password"}
                        secureTextEntry={!passwordVisible}
                        autoComplete={signUp ? "new-password" : "current-password"}
                        textContentType={signUp ? "newPassword" : "password"}
                        returnKeyType={signUp ? "next" : "go"}
                        keyboardAppearance="dark"
                        value={password}
                        onChangeText={(next) => {
                          setPassword(next);
                          if (error) setError("");
                        }}
                        onSubmitEditing={() => (signUp ? repeatInput.current?.focus() : submit())}
                      />
                      <Grow open={signUp}>
                        <View style={{ paddingTop: 10 }}>
                          <Field
                            palette={palette}
                            inputRef={repeatInput}
                            label="Repeat Password"
                            placeholder="The same again"
                            secureTextEntry={!passwordVisible}
                            autoComplete="new-password"
                            textContentType="newPassword"
                            returnKeyType="go"
                            keyboardAppearance="dark"
                            value={repeat}
                            editable={signUp}
                            onChangeText={(next) => {
                              setRepeat(next);
                              if (error) setError("");
                            }}
                            onSubmitEditing={submit}
                          />
                        </View>
                      </Grow>
                    </Animated.View>
                  </Arrive>
                  <Grow open={Boolean(status)}>
                    <StatusLine palette={palette} text={status} danger={Boolean(error)} />
                  </Grow>
                  <Arrive order={5} style={styles.submitRow}>
                    <View
                      style={{ alignItems: "center" }}
                      onLayout={(event) => {
                        buttonWidth.value = event.nativeEvent.layout.width;
                      }}
                    >
                      <Animated.View style={[{ width: "100%" }, pill]}>
                        <Press
                          feedback="scale"
                          style={[styles.submit, { backgroundColor: palette.ink }]}
                          disabled={busy}
                          accessibilityRole="button"
                          accessibilityLabel={
                            busy ? (signUp ? "Creating account" : "Signing in") : COPY[mode].action
                          }
                          accessibilityState={{ busy }}
                          onPress={submit}
                        >
                          <Animated.View style={[styles.submitWords, words]}>
                            <Crossing
                              at={at}
                              first={COPY["sign-in"].action}
                              second={COPY["sign-up"].action}
                              style={[styles.submitLabel, { color: palette.page }]}
                            />
                            <SymbolView name="arrow.right" size={20} tintColor={palette.page} />
                          </Animated.View>
                          <Animated.View style={[styles.submitRing, ring]} pointerEvents="none">
                            <Ring color={palette.page} turning={busy} />
                          </Animated.View>
                        </Press>
                      </Animated.View>
                    </View>
                  </Arrive>
                  {saved.length ? (
                    <Yield keyboard={keyboardHeight}>
                      <View style={{ gap: 8, paddingTop: 20 }}>
                        <Arrive order={6}>
                          <Text style={[styles.savedHeading, { color: palette.ink3 }]}>
                            SAVED ON THIS PHONE
                          </Text>
                        </Arrive>
                        {saved.map((account, index) => (
                          <Arrive key={account.userId} order={7 + index}>
                            <Press
                              feedback="scale"
                              disabled={busy}
                              accessibilityRole="button"
                              accessibilityLabel={`Return to ${account.email}`}
                              style={[styles.savedButton, { backgroundColor: palette.paper }]}
                              onPress={() => void attempt(() => onResume(account.userId))}
                            >
                              <Text
                                numberOfLines={1}
                                style={[styles.archiveName, { color: palette.ink }]}
                              >
                                {account.email}
                              </Text>
                              <SymbolView name="arrow.right" size={18} tintColor={palette.ink3} />
                            </Press>
                          </Arrive>
                        ))}
                      </View>
                    </Yield>
                  ) : null}
                </Glass>
              </Arrive>
            </View>
          )}
          <KeyboardRoom height={keyboardHeight} bottom={insets.bottom} />
        </Animated.View>
      </Animated.ScrollView>
    </View>
  );
}

/** The room under the card: the safe area at rest, the keyboard when it is
 *  up, frame by frame with it — so the card rides up and the wall,
 *  drawn behind the scroller, stays where it is. */
function KeyboardRoom({ height, bottom }: { height: SharedValue<number>; bottom: number }) {
  const room = useAnimatedStyle(() => ({ height: Math.max(bottom, height.value) + 12 }));
  return <Animated.View style={room} />;
}

function StatusLine({
  palette,
  text,
  danger,
}: {
  palette: Palette;
  text: string;
  danger: boolean;
}) {
  return (
    <View style={styles.status} accessibilityRole={danger ? "alert" : undefined}>
      <SymbolView
        name={danger ? "exclamationmark.circle.fill" : "envelope"}
        size={16}
        tintColor={danger ? palette.danger : palette.ink3}
      />
      <Text style={[styles.statusText, { color: danger ? palette.danger : palette.ink2 }]}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#0f0e0c" },
  scroll: { flexGrow: 1, paddingHorizontal: 12 },
  content: { width: "100%", maxWidth: 440, alignSelf: "center", flexGrow: 1 },
  brand: { flexDirection: "row", alignItems: "baseline", gap: 3, paddingHorizontal: 16 },
  air: { flexGrow: 1, minHeight: 24 },
  wordmark: { fontSize: 30, fontWeight: "700", letterSpacing: -1.6 },
  brandDot: { width: 6, height: 6, borderRadius: 3 },
  intro: { paddingHorizontal: 16, paddingBottom: 20 },
  title: { fontSize: 40, fontWeight: "700", letterSpacing: -1.6, lineHeight: 46 },
  lede: { fontSize: 16, lineHeight: 23, marginTop: 5 },
  thumb: {
    position: "absolute",
    top: 0,
    left: 0,
    height: SWITCH,
    borderRadius: SWITCH / 2,
    borderCurve: "continuous",
    shadowColor: "#000",
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
  },
  switch: { borderRadius: SWITCH / 2 + 4, borderCurve: "continuous", padding: 4 },
  glass: { borderRadius: 32, borderCurve: "continuous", overflow: "hidden", padding: 16 },
  glassFallback: {
    backgroundColor: "rgba(24,21,18,0.82)",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  savedHeading: { fontSize: 12, fontWeight: "600", letterSpacing: 0.4, paddingHorizontal: 4 },
  savedButton: {
    minHeight: 52,
    borderRadius: 16,
    borderCurve: "continuous",
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  segment: { flex: 1, height: SWITCH, alignItems: "center", justifyContent: "center" },
  segmentLabel: { fontSize: 15, fontWeight: "600" },
  field: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 12,
    borderRadius: 18,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  fieldLabelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  fieldLabel: { fontSize: 12, fontWeight: "500" },
  reveal: { fontSize: 12, fontWeight: "600" },
  input: { fontSize: 17, minHeight: 27, padding: 0, marginTop: 4 },
  submitRow: { marginTop: 20 },
  submit: {
    height: BUTTON,
    borderRadius: BUTTON / 2,
    borderCurve: "continuous",
    overflow: "hidden",
    justifyContent: "center",
  },
  submitWords: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  submitLabel: { fontSize: 17, fontWeight: "600" },
  submitRing: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ring: { width: 22, height: 22, borderRadius: 11, borderWidth: 2.25 },
  status: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingTop: 14 },
  statusText: { flex: 1, fontSize: 14, lineHeight: 19, fontWeight: "500" },
  choiceList: { gap: 10 },
  archiveButton: {
    minHeight: 68,
    borderRadius: 18,
    borderCurve: "continuous",
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  archiveName: { flex: 1, flexShrink: 1, fontSize: 17, fontWeight: "600", paddingRight: 16 },
  archiveOpen: { flexShrink: 0, fontSize: 15, fontWeight: "500" },
});
