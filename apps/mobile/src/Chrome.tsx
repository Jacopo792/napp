/* The phone's chrome, drawn from the reference Jacopo recorded (18 October
 * 2026): Revolut's structure and Shop's feed. There is no large title on a
 * list. A tab page opens under a bar of its own — the face, a wide search
 * pill, one round button — standing on the reader's wallpaper; the cards are
 * frosted glass over that picture and solid where there is none; content
 * fades under the bar and the tab bar instead of being cut; a card grows into
 * place as it scrolls in from the bottom; and a page that is still loading is
 * drawn as the shapes it is about to hold, never as a spinner.
 *
 * Every motion here runs on the UI thread. The reveal reads where the view is
 * on screen (`measure`) against the scroll it is told about, so a card nested
 * anywhere in a page — or a row in a virtualised list — reveals the same way. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  interpolate,
  makeMutable,
  measure,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import { Link, useRouter } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { useArchive, usePalette } from "./archive";
import { Avatar } from "./Avatar";
import { Backdrop } from "./Backdrop";
import { Card, Press, quiet } from "./Grouped";

export { Card };
import { SymbolView } from "./icons";

export const glassy = Platform.OS === "ios" && isLiquidGlassAvailable();
/** The bar's own height under the status bar. */
export const BAR = 56;
const FADE = 32;

/** A round button: glass where the system has it, a quiet disc elsewhere. */
export function RoundButton({
  icon,
  label,
  onPress,
  size = 40,
  disabled,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  size?: number;
  disabled?: boolean;
}) {
  const palette = usePalette();
  const disc = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Press
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={[disc, disabled && { opacity: 0.4 }]}
    >
      <Disc style={disc}>
        <SymbolView
          name={icon}
          size={Math.round(size * 0.46)}
          weight="semibold"
          tintColor={palette.ink}
        />
      </Disc>
    </Press>
  );
}

function Disc({ style, children }: { style: ViewStyle; children: ReactNode }) {
  const palette = usePalette();
  const centred = { alignItems: "center", justifyContent: "center" } as const;
  if (glassy)
    return (
      <GlassView
        glassEffectStyle="regular"
        colorScheme={palette.dark ? "dark" : "light"}
        style={[style, centred]}
      >
        {children}
      </GlassView>
    );
  return (
    <View style={[style, centred, { backgroundColor: palette.dark ? "#ffffff24" : "#0000000f" }]}>
      {children}
    </View>
  );
}

/** The search pill: a field where searching happens, a door to it elsewhere. */
export function SearchPill({
  value,
  onChange,
  onPress,
  autoFocus,
  style,
}: {
  value?: string;
  onChange?: (text: string) => void;
  onPress?: () => void;
  autoFocus?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  const inner = (
    <Disc style={styles.pill}>
      <View style={styles.pillRow}>
        <SymbolView name="magnifyingglass" size={17} weight="semibold" tintColor={palette.ink3} />
        {onChange ? (
          <TextInput
            accessibilityLabel="Search"
            value={value}
            onChangeText={onChange}
            autoFocus={autoFocus}
            placeholder="Search"
            placeholderTextColor={palette.ink3}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={{ flex: 1, color: palette.ink, fontSize: 17, paddingVertical: 0 }}
          />
        ) : (
          <Text style={{ flex: 1, color: palette.ink3, fontSize: 17 }}>Search</Text>
        )}
      </View>
    </Disc>
  );
  if (onChange) return <View style={[{ flex: 1 }, style]}>{inner}</View>;
  return (
    <Press
      feedback="scale"
      accessibilityRole="search"
      accessibilityLabel="Search"
      onPress={onPress}
      style={[{ flex: 1 }, style]}
    >
      {inner}
    </Press>
  );
}

/** Revolut's bar: whose app this is — the face, which opens Settings — the
 *  search, one or two round buttons.
 *  It stands on the page with nothing behind it until the page scrolls; then
 *  a ground fades in under it, solid at the top and gone at its foot, so what
 *  scrolls up dissolves into it rather than being cut by an edge. */
export function TopBar({
  scroll,
  search,
  right,
}: {
  scroll: SharedValue<number>;
  search: ReactNode;
  right?: ReactNode;
}) {
  const { session, profile } = useArchive();
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const ground = useAnimatedStyle(() => ({
    opacity: interpolate(scroll.value, [0, 48], [0, 1], "clamp"),
  }));
  /* Solid to the foot of the bar, then gone over the next few points. */
  const solid = Math.round(((inset.top + BAR - 4) / (inset.top + BAR + FADE)) * 100);
  return (
    <View style={[styles.bar, { paddingTop: inset.top }]} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            bottom: -FADE,
            backgroundImage: `linear-gradient(to bottom, ${palette.page} 0%, ${palette.page} ${solid}%, ${palette.page}00 100%)`,
          },
          ground,
        ]}
      />
      <View style={styles.barRow}>
        {/* Settings grows out of the face, as Revolut's profile does. */}
        <Link href="/settings" asChild>
          <Link.Trigger withAppleZoom>
            <Press
              feedback="scale"
              accessibilityRole="button"
              accessibilityLabel="Settings"
              hitSlop={6}
            >
              <Avatar
                face={{
                  userId: session.userId,
                  name: profile?.nickname ?? "",
                  avatarObject: profile?.avatarObject ?? null,
                }}
                email={session.email}
                size={40}
              />
            </Press>
          </Link.Trigger>
        </Link>
        {search}
        {right}
      </View>
    </View>
  );
}

/** The foot of a tab page: what scrolls down fades into the page under the
 *  tab bar instead of running into its edge. */
export function BottomFade() {
  const palette = usePalette();
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        height: 120,
        backgroundImage: `linear-gradient(to bottom, ${palette.page}00 0%, ${palette.page}e6 70%, ${palette.page} 100%)`,
      }}
    />
  );
}

/* ── The reveal ─────────────────────────────────────────────────────────── */

const Scroll = createContext<SharedValue<number> | null>(null);
export const RevealScroll = Scroll.Provider;

/** The scroll offset a page's reveals and its bar read, and the handler that
 *  writes it. */
export function usePageScroll() {
  const scroll = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((event) => {
    scroll.value = event.contentOffset.y;
  });
  return { scroll, onScroll };
}

/** Grows into place as it rises from the bottom of the screen, as Shop's feed
 *  cards do: from 92% and half-seen to whole over the last 180 points. A row
 *  inside a card only fades — a row that shrank would open gaps in its card. */
export function Reveal({
  children,
  row,
  style,
}: {
  children: ReactNode;
  row?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const scroll = useContext(Scroll);
  const { height } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const reveal = useAnimatedStyle(() => {
    /* The first style is computed off the UI thread, where nothing can be
       measured; the reveal starts on the first frame after it. */
    if (!scroll || !(globalThis as { _WORKLET?: boolean })._WORKLET) return {};
    void scroll.value;
    const box = measure(ref);
    if (!box) return {};
    const t = Math.min(1, Math.max(0, (height - box.pageY) / 180));
    return row
      ? { opacity: 0.25 + 0.75 * t }
      : { opacity: 0.45 + 0.55 * t, transform: [{ scale: 0.92 + 0.08 * t }] };
  });
  return (
    <Animated.View ref={ref} style={[style, reveal]}>
      {children}
    </Animated.View>
  );
}

/* ── Loading ────────────────────────────────────────────────────────────── */

/** One light sweeping across every placeholder on screen at once, measured
 *  in screen points, so the bones of two cards read as one surface catching
 *  it rather than each blinking on its own. It runs only while a placeholder
 *  is mounted, and not at all under Reduce Motion. */
const sweep = makeMutable(0);
let sweepers = 0;
const BAND = 180;

function useSweep() {
  const still = useReducedMotion();
  useEffect(() => {
    if (still) return;
    sweepers += 1;
    if (sweepers === 1) {
      sweep.value = 0;
      sweep.value = withRepeat(
        withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.quad) }),
        -1,
        false,
      );
    }
    return () => {
      sweepers -= 1;
      if (sweepers === 0) cancelAnimation(sweep);
    };
  }, [still]);
  return !still;
}

/** One shape of something not here yet: a quiet block the sweep passes over. */
export function Bone({ style }: { style?: StyleProp<ViewStyle> }) {
  const palette = usePalette();
  const moving = useSweep();
  const { width } = useWindowDimensions();
  const ref = useAnimatedRef<Animated.View>();
  const band = useAnimatedStyle(() => {
    if (!(globalThis as { _WORKLET?: boolean })._WORKLET) return { opacity: 0 };
    const box = measure(ref);
    if (!box) return { opacity: 0 };
    return {
      opacity: 1,
      transform: [{ translateX: -BAND + sweep.value * (width + 2 * BAND) - box.pageX }],
    };
  });
  const light = palette.dark ? "#ffffff14" : "#ffffffa6";
  return (
    <Animated.View
      ref={ref}
      style={[{ backgroundColor: quiet(palette), borderRadius: 8, overflow: "hidden" }, style]}
    >
      {moving ? (
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              width: BAND,
              backgroundImage: `linear-gradient(to right, ${light.slice(0, 7)}00 0%, ${light} 50%, ${light.slice(0, 7)}00 100%)`,
            },
            band,
          ]}
        />
      ) : null}
    </Animated.View>
  );
}

/** Rows that are not here yet: a disc, a name and a line under it, a value at
 *  the end — the shape of what will arrive, inside a card. It fades where it
 *  stood as what it stood for arrives (see `useArrival`). */
export function SkeletonCard({ rows = 3, style }: { rows?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Animated.View
      exiting={FadeOut.duration(220)}
      accessibilityLabel="Loading"
      style={[{ marginHorizontal: 16, marginBottom: 16 }, style]}
    >
      <Card style={{ flexGrow: 1, paddingVertical: 8 }}>
        {Array.from({ length: rows }, (_, at) => (
          <View key={at} style={styles.boneRow}>
            <Bone style={{ width: 40, height: 40, borderRadius: 20 }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Bone style={{ width: at % 2 ? "54%" : "66%", height: 14 }} />
              <Bone style={{ width: at % 2 ? "30%" : "40%", height: 11 }} />
            </View>
            <Bone style={{ width: 36, height: 12 }} />
          </View>
        ))}
      </Card>
    </Animated.View>
  );
}

const ARRIVE = FadeIn.duration(320);

/** The entrance for what replaces a skeleton: a fade over the shapes fading
 *  out, for the moment after the wait only — what mounts later (a row
 *  scrolled into a list, a tab come back to) simply is there. */
export function useArrival(ready: boolean) {
  const [fresh, setFresh] = useState(!ready);
  useEffect(() => {
    if (!ready || !fresh) return;
    const timer = setTimeout(() => setFresh(false), 600);
    return () => clearTimeout(timer);
  }, [ready, fresh]);
  return ready && fresh ? ARRIVE : undefined;
}

/* ── Pages ──────────────────────────────────────────────────────────────── */

/** A tab's page: the wallpaper, the bar over it, and a scroller that fades
 *  under both ends. A page with a `title` (Settings) says its name instead of
 *  offering the search, as Revolut's own profile page does. */
export function TabPage({
  children,
  title,
  search,
  right,
  onRefresh,
  reach,
}: {
  children: ReactNode;
  /** How far down the reader's picture stands (see Backdrop). */
  reach?: number;
  title?: string;
  search?: ReactNode;
  right?: ReactNode;
  onRefresh?: () => void;
}) {
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const router = useRouter();
  const { scroll, onScroll } = usePageScroll();
  return (
    <View style={{ flex: 1, backgroundColor: palette.page }}>
      <Backdrop reach={reach} />
      <RevealScroll value={scroll}>
        <Animated.ScrollView
          onScroll={onScroll}
          scrollEventThrottle={16}
          contentInsetAdjustmentBehavior="never"
          keyboardDismissMode="on-drag"
          contentContainerStyle={{
            paddingTop: title ? inset.top + 16 : inset.top + BAR + 8,
            paddingBottom: 140,
          }}
          refreshControl={
            onRefresh ? (
              <RefreshControl
                refreshing={false}
                onRefresh={onRefresh}
                tintColor={palette.ink3}
                progressViewOffset={inset.top + BAR}
              />
            ) : undefined
          }
        >
          {title ? <PageTitle>{title}</PageTitle> : null}
          {children}
        </Animated.ScrollView>
      </RevealScroll>
      <BottomFade />
      {title ? (
        <StatusGround scroll={scroll} />
      ) : (
        <TopBar
          scroll={scroll}
          search={search ?? <SearchPill onPress={() => router.push("/search")} />}
          right={right}
        />
      )}
    </View>
  );
}

/** Under the status bar on a page with no bar: a ground that fades in once
 *  the page scrolls, so the words do not run under the clock. */
function StatusGround({ scroll }: { scroll: SharedValue<number> }) {
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const ground = useAnimatedStyle(() => ({
    opacity: interpolate(scroll.value, [0, 24], [0, 1], "clamp"),
  }));
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bar,
        {
          height: inset.top + 24,
          backgroundImage: `linear-gradient(to bottom, ${palette.page} 0%, ${palette.page} 60%, ${palette.page}00 100%)`,
        },
        ground,
      ]}
    />
  );
}

/** A pushed page's own title, in the page rather than in a bar: Revolut's
 *  "Programma" under its round back button. */
export function PageTitle({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="header"
      numberOfLines={2}
      style={{
        color: palette.ink,
        fontSize: 32,
        fontWeight: "700",
        letterSpacing: -0.8,
        marginHorizontal: 20,
        marginTop: 4,
        marginBottom: 18,
      }}
    >
      {children}
    </Text>
  );
}

/** A heading between cards, as Shop's "Recently viewed": the words, and a
 *  chevron when the heading itself goes somewhere. */
export function Heading({ children, onPress }: { children: string; onPress?: () => void }) {
  const palette = usePalette();
  const words = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Text style={{ color: palette.ink, fontSize: 20, fontWeight: "700", letterSpacing: -0.4 }}>
        {children}
      </Text>
      {onPress ? (
        <SymbolView name="chevron.right" size={13} weight="bold" tintColor={palette.ink3} />
      ) : null}
    </View>
  );
  return (
    <View style={{ marginHorizontal: 22, marginTop: 10, marginBottom: 12 }}>
      {onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} hitSlop={8}>
          {words}
        </Pressable>
      ) : (
        words
      )}
    </View>
  );
}

/** Shop's chip row: a few words, one or more of them on. */
export function Chips<T extends string>({
  items,
  style,
}: {
  items: { id: T; label: string; icon?: SFSymbol; on: boolean; onPress: () => void }[];
  style?: StyleProp<ViewStyle>;
}) {
  const palette = usePalette();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[{ flexGrow: 0 }, style]}
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 14 }}
    >
      {items.map((item) => (
        <Press
          key={item.id}
          feedback="scale"
          accessibilityRole="button"
          accessibilityState={{ selected: item.on }}
          onPress={item.onPress}
          style={[
            styles.chip,
            { backgroundColor: item.on ? palette.ink : palette.dark ? "#ffffff1f" : "#0000000d" },
          ]}
        >
          {item.icon ? (
            <SymbolView
              name={item.icon}
              size={14}
              weight="semibold"
              tintColor={item.on ? palette.page : palette.ink}
            />
          ) : null}
          <Text
            style={{
              color: item.on ? palette.page : palette.ink,
              fontSize: 15,
              fontWeight: "600",
              letterSpacing: -0.2,
            }}
          >
            {item.label}
          </Text>
        </Press>
      ))}
    </ScrollView>
  );
}

/** The page's one decisive act, as a full-width pill at its foot. */
export function PillButton({
  label,
  onPress,
  disabled,
  tone = "ink",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "ink" | "danger";
}) {
  const palette = usePalette();
  return (
    <Press
      feedback="scale"
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.pillButton,
        { backgroundColor: palette.dark ? "#ffffff24" : "#0000000f" },
        disabled && { opacity: 0.4 },
      ]}
    >
      <Text
        style={{
          color: tone === "danger" ? palette.danger : palette.ink,
          fontSize: 17,
          fontWeight: "600",
          letterSpacing: -0.3,
        }}
      >
        {label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  bar: { position: "absolute", top: 0, left: 0, right: 0 },
  barRow: {
    height: BAR,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
  },
  pill: { height: 40, borderRadius: 20, justifyContent: "center" },
  pillRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  boneRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderCurve: "continuous",
  },
  pillButton: {
    height: 54,
    borderRadius: 27,
    borderCurve: "continuous",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 24,
  },
});
