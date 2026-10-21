/* The two bars a note's page draws for itself, in the glass of iOS 26's own
 * bottom bars (Notes, Messages): at rest, a capsule of the tools reached for
 * most with Comments in a circle of the same height beside it; while finding,
 * a field standing on the keyboard with the count, the two steps and a close.
 *
 * They are ours rather than the system's toolbar because the system's would
 * not take the size the page asked for, and a native toolbar mounted and
 * unmounted with the keyboard while a sheet was over the screen came back
 * empty — the page lost its tools until it was left and entered again. */
import { useEffect, type ReactNode } from "react";
import {
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { SFSymbol } from "expo-symbols";
import { usePalette } from "./archive";
import { glassy } from "./Chrome";
import { Press } from "./Grouped";
import { SymbolView } from "./icons";
import { useChoice } from "./TextPrompt";

/** The bar's height, and the circle's: one line for the eye to rest on. */
export const NOTE_BAR = 52;
const GLYPH = 22;
const EDGE = 16;

function Glass({ style, children }: { style: StyleProp<ViewStyle>; children?: ReactNode }) {
  const palette = usePalette();
  if (glassy)
    return (
      <GlassView
        glassEffectStyle="regular"
        isInteractive
        colorScheme={palette.dark ? "dark" : "light"}
        style={style}
      >
        {children}
      </GlassView>
    );
  return (
    <View
      style={[
        style,
        {
          backgroundColor: palette.paper,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: palette.rule,
        },
      ]}
    >
      {children}
    </View>
  );
}

function Key({
  icon,
  label,
  onPress,
  disabled = false,
  size = NOTE_BAR,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}) {
  const palette = usePalette();
  return (
    <Press
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={[styles.key, { width: size, height: size }, disabled && { opacity: 0.35 }]}
    >
      <SymbolView name={icon} size={GLYPH} weight="regular" tintColor={palette.ink} />
    </Press>
  );
}

/** At rest: checklist, attach and Markup in one capsule, Comments apart. */
export function NoteBar({
  canEdit,
  busy,
  onChecklist,
  onAttach,
  onMarkup,
  onComments,
}: {
  canEdit: boolean;
  busy: boolean;
  onChecklist: () => void;
  onAttach: (image: boolean) => void;
  onMarkup: () => void;
  onComments: () => void;
}) {
  const insets = useSafeAreaInsets();
  const choose = useChoice();
  const off = !canEdit || busy;
  return (
    <View
      pointerEvents="box-none"
      style={[styles.rest, { bottom: Math.max(insets.bottom - 4, 12) }]}
    >
      <Glass style={styles.capsule}>
        <Key icon="checklist" label="Checklist" disabled={off} onPress={onChecklist} />
        <Key
          icon="paperclip"
          label="Attach"
          disabled={off}
          onPress={() =>
            choose(undefined, [
              { label: "Choose Photo", icon: "photo", run: () => onAttach(true) },
              { label: "Attach File", icon: "doc", run: () => onAttach(false) },
            ])
          }
        />
        <Key icon="pencil.tip.crop.circle" label="Markup" disabled={off} onPress={onMarkup} />
      </Glass>
      <Glass style={styles.circle}>
        <Key icon="bubble.left.and.bubble.right" label="Comments" onPress={onComments} />
      </Glass>
    </View>
  );
}

/** Find in Note, standing on the keyboard as Safari's and Notes' do. */
export function FindBar({
  query,
  onQuery,
  current,
  total,
  onPrevious,
  onNext,
  onClose,
}: {
  query: string;
  onQuery: (query: string) => void;
  current: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  /* The keyboard's top edge in the window; Infinity while it is away, when
     the bar stands where the resting bar does. */
  const edge = useSharedValue(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const move = (event: { endCoordinates: { screenY: number }; duration?: number }) => {
      edge.value = withTiming(event.endCoordinates.screenY, {
        duration: event.duration || 250,
        easing: Easing.out(Easing.cubic),
      });
    };
    const subscriptions = [
      Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", move),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
        edge.value = Number.POSITIVE_INFINITY;
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [edge]);
  const rest = Math.max(insets.bottom - 4, 12);
  const { height } = useWindowDimensions();
  /* Stands where the resting bar does, lifted onto the keyboard's edge. */
  const ride = useAnimatedStyle(() => ({
    transform: [
      {
        translateY: Number.isFinite(edge.value) ? Math.min(0, edge.value - 8 - (height - rest)) : 0,
      },
    ],
  }));
  const step = NOTE_BAR - 4;
  return (
    <Animated.View pointerEvents="box-none" style={[styles.find, { bottom: rest }, ride]}>
      <Glass style={styles.field}>
        <SymbolView name="magnifyingglass" size={17} weight="medium" tintColor={palette.ink3} />
        <TextInput
          accessibilityLabel="Find in Note"
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          value={query}
          onChangeText={onQuery}
          onSubmitEditing={onNext}
          submitBehavior="submit"
          placeholder="Find in Note"
          placeholderTextColor={palette.ink3}
          selectionColor={palette.accent}
          style={[styles.input, { color: palette.ink }]}
        />
        {query ? (
          <Text style={[styles.count, { color: palette.ink3 }]}>
            {total ? `${current} of ${total}` : "No results"}
          </Text>
        ) : null}
      </Glass>
      <Glass style={[styles.round, { width: step, height: step, borderRadius: step / 2 }]}>
        <Key
          icon="chevron.up"
          label="Previous Match"
          size={step}
          disabled={!total}
          onPress={onPrevious}
        />
      </Glass>
      <Glass style={[styles.round, { width: step, height: step, borderRadius: step / 2 }]}>
        <Key
          icon="chevron.down"
          label="Next Match"
          size={step}
          disabled={!total}
          onPress={onNext}
        />
      </Glass>
      <Glass style={[styles.round, { width: step, height: step, borderRadius: step / 2 }]}>
        <Key icon="xmark" label="Close Find" size={step} onPress={onClose} />
      </Glass>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  rest: {
    position: "absolute",
    left: EDGE,
    right: EDGE,
    height: NOTE_BAR,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  capsule: {
    height: NOTE_BAR,
    borderRadius: NOTE_BAR / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  circle: {
    width: NOTE_BAR,
    height: NOTE_BAR,
    borderRadius: NOTE_BAR / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  key: { alignItems: "center", justifyContent: "center" },
  find: {
    position: "absolute",
    left: EDGE - 6,
    right: EDGE - 6,
    height: NOTE_BAR,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  field: {
    flex: 1,
    height: NOTE_BAR,
    borderRadius: NOTE_BAR / 2,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 14,
    gap: 8,
  },
  input: { flex: 1, fontSize: 17, height: NOTE_BAR },
  count: { fontSize: 15, fontVariant: ["tabular-nums"] },
  round: { alignItems: "center", justifyContent: "center" },
});
