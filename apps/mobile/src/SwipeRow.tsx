/* A note moves like a sheet of paper. Swiping reveals quiet, labelled tabs
 * in Napp's own material; only a destructive action uses the danger ink.
 * The row follows the finger, settles without bounce and closes on a tap.
 * A full swipe keeps the existing action and confirmation rules. */
import { useEffect, type ReactNode } from "react";
import {
  LayoutAnimation,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureDetector, usePanGesture } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { Link, type Href } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import * as Haptics from "expo-haptics";
import { SymbolView } from "./icons";
import { usePalette } from "./archive";
import { useCard } from "./Backdrop";
import { Card, CARD_RADIUS, quiet } from "./Grouped";
import { glide, release, travel } from "./theme";

export interface Act {
  label: string;
  icon: SFSymbol;
  destructive?: boolean;
  run: () => void;
  disabled?: boolean;
  /** Acts without taking the row away (an alert, a pin), so the row comes back. */
  stationary?: boolean;
}

interface Props {
  href: Href;
  children: ReactNode;
  /** Uncovered on the left by a push to the right: one labelled tab. */
  leading?: Act;
  /** Uncovered on the right by a push to the left, inner first; the last is
   *  outermost and is what a full push performs. */
  trailing?: Act[];
  /** The system menu a held row offers: `Link.Menu` and its actions. */
  menu: ReactNode;
  /** What a held row lifts above that menu. */
  preview?: ReactNode;
  /** Android has no lifted preview: a long press calls this instead. */
  onHold?: () => void;
  first: boolean;
  last: boolean;
  /** Inside a `Group`, which already is the card. */
  bare?: boolean;
  /** A card of its own, in glass over the reader's picture (a folder). */
  glass?: boolean;
  /** Close every other row; one row open at a time, as on the web. */
  onClaim: () => void;
  /** Hand the list a way to close this row when another one opens. */
  register: (close: () => void) => () => void;
}

/** Labelled paper tabs: the same corners and quiet rules as Napp cards. */
const TAB_WIDTH = 68;
const TAB_HEIGHT = 60;
const GAP = 8;
const SLOT = TAB_WIDTH + GAP;
/** Where the row rests open over `count` tabs. */
const openFor = (count: number) => count * SLOT;
/** Past this share of the row's width, letting go performs the outermost act. */
const ARM = 0.6;

const tap = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});

export function SwipeRow(props: Props) {
  const { href, children, leading, trailing = [], menu, preview, first, last, bare, glass } = props;
  const { onClaim, register, onHold } = props;
  const palette = usePalette();
  const { card } = useCard();
  const { width: screen } = useWindowDimensions();
  /* The row's own width: the screen less the card's margins. */
  const width = screen - (bare ? 0 : 32);
  const x = useSharedValue(0);
  const start = useSharedValue(0);
  const armed = useSharedValue(false);
  /* 0 → 1 as the row arms: the inner tabs go and the outer one follows. */
  const arming = useSharedValue(0);
  /* The row's own height, so a row that leaves can close the gap it leaves:
     the rows below rise with it instead of jumping when the list re-renders. */
  const height = useSharedValue(0);
  const closing = useSharedValue(false);
  const released = useSharedValue(true);
  const swiped = useSharedValue(false);
  const outer = trailing[trailing.length - 1];
  const canRight = Boolean(leading);
  const canLeft = trailing.length > 0;
  const fullRight = Boolean(leading && !leading.disabled);
  const fullLeft = Boolean(outer && !outer.disabled);
  const openRight = openFor(leading ? 1 : 0);
  const openLeft = openFor(trailing.length);
  const reach = width * ARM;

  useEffect(() => register(() => (x.value = withSpring(0, glide))), [register, x]);

  const perform = (act: Act, direction: number) => {
    if (act.disabled) return;
    if (act.stationary) {
      arming.value = withSpring(0, release);
      x.value = withSpring(0, glide);
      act.run();
      return;
    }
    x.value = withTiming(direction * screen, travel, (done) => {
      if (!done) return;
      closing.value = true;
      height.value = withTiming(0, travel, (shut) => {
        if (shut) scheduleOnRN(leave, act.run);
      });
    });
  };
  /* The act removes the row from the list. One that was refused leaves it
     standing, so it is put back rather than left as a gap of nothing. */
  const leave = (run: () => void) => {
    /* What the act takes away with the row — the heading of a group it was
       the last of — moves on the same curve, natively, rather than jumping. */
    LayoutAnimation.configureNext(
      LayoutAnimation.create(travel.duration, LayoutAnimation.Types.easeInEaseOut, "opacity"),
    );
    run();
    setTimeout(() => {
      closing.value = false;
      arming.value = 0;
      x.value = withSpring(0, glide);
    }, 700);
  };
  const full = (direction: number) => {
    const act = direction > 0 ? leading : outer;
    if (act) perform(act, direction);
  };

  const pan = usePanGesture({
    enabled: canRight || canLeft,
    activeOffsetX: [-12, 12],
    failOffsetY: [-10, 10],
    onBegin: () => {
      swiped.value = false;
    },
    onActivate: () => {
      swiped.value = true;
      released.value = false;
      start.value = x.value;
      scheduleOnRN(onClaim);
    },
    onUpdate: (event) => {
      let raw = start.value + event.translationX;
      /* A side with nothing behind it only gives a little, like a list end. */
      if ((raw > 0 && !canRight) || (raw < 0 && !canLeft)) raw *= 0.1;
      x.value = Math.max(-width, Math.min(width, raw));
      const allowed = x.value > 0 ? fullRight : fullLeft;
      const arm = allowed && Math.abs(x.value) >= reach;
      if (arm !== armed.value) {
        armed.value = arm;
        arming.value = withSpring(arm ? 1 : 0, release);
        if (arm) scheduleOnRN(tap);
      }
    },
    onDeactivate: (event) => {
      if (event.canceled) return;
      // A quick swipe can activate and end before the first update frame.
      // The release still carries its travel; the last painted x may be zero.
      let raw = start.value + event.translationX;
      if ((raw > 0 && !canRight) || (raw < 0 && !canLeft)) raw *= 0.1;
      x.value = Math.max(-width, Math.min(width, raw));
      released.value = true;
      const wasArmed = (x.value > 0 ? fullRight : fullLeft) && Math.abs(x.value) >= reach;
      armed.value = false;
      const direction = x.value > 0 ? 1 : -1;
      /* Armed, the outer tab stays with the row until the act is done. */
      if (wasArmed) {
        scheduleOnRN(full, direction);
        return;
      }
      arming.value = withSpring(0, release);
      const thrown = x.value + event.velocityX * 0.1;
      const open = direction > 0 ? openRight : openLeft;
      const rest = open && Math.sign(thrown) === direction && Math.abs(thrown) >= open / 2;
      x.value = withSpring(rest ? direction * open : 0, glide);
    },
    /* Taken away rather than let go — the held row's menu claimed the touch —
       the row still comes to rest instead of staying where the finger was. */
    onFinalize: () => {
      if (released.value) return;
      released.value = true;
      armed.value = false;
      arming.value = withSpring(0, release);
      x.value = withSpring(0, glide);
    },
  });

  const base = {
    tl: first ? CARD_RADIUS : 0,
    tr: first ? CARD_RADIUS : 0,
    bl: last ? CARD_RADIUS : 0,
    br: last ? CARD_RADIUS : 0,
  };
  /* Moved, the row is rounded all the way round: the lifted sheet's edge. */
  const face = useAnimatedStyle(() => {
    const lift = Math.min(1, Math.abs(x.value) / 16);
    const round = (r: number) => r + (CARD_RADIUS - r) * lift;
    return {
      transform: [{ translateX: x.value }],
      borderTopLeftRadius: round(base.tl),
      borderTopRightRadius: round(base.tr),
      borderBottomLeftRadius: round(base.bl),
      borderBottomRightRadius: round(base.br),
    };
  });
  const frame = useAnimatedStyle(() => (closing.value ? { height: height.value } : {}));

  return (
    <Animated.View
      style={[styles.frame, bare && { marginHorizontal: 0 }, frame]}
      onLayout={(event) => {
        if (!closing.value) height.value = event.nativeEvent.layout.height;
      }}
    >
      {leading ? (
        <View style={[styles.side, { left: 0 }]} pointerEvents="box-none">
          <ActionTab
            act={leading}
            at={0}
            sign={1}
            x={x}
            arming={arming}
            closing={closing}
            outermost
            onPress={() => perform(leading, 1)}
          />
        </View>
      ) : null}
      {canLeft ? (
        <View style={[styles.side, { right: 0 }]} pointerEvents="box-none">
          {trailing.map((act, i) => (
            <ActionTab
              key={act.label}
              act={act}
              at={trailing.length - 1 - i}
              sign={-1}
              x={x}
              arming={arming}
              closing={closing}
              outermost={i === trailing.length - 1}
              onPress={() => perform(act, -1)}
            />
          ))}
        </View>
      ) : null}
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            {
              backgroundColor: bare || glass ? undefined : card,
              overflow: "hidden",
              borderCurve: "continuous",
            },
            face,
          ]}
        >
          {glass ? <Card style={StyleSheet.absoluteFill} /> : null}
          <Link
            href={href}
            asChild
            onPress={(event) => {
              // Native links can still deliver a press after a fast pan.
              // That same touch must leave the action open, never navigate.
              if (swiped.value) {
                event.preventDefault();
                return;
              }
              /* A press on an open row closes it rather than opening it. */
              if (x.value !== 0) {
                event.preventDefault();
                x.value = withSpring(0, glide);
              }
            }}
          >
            <Link.Trigger withAppleZoom>
              <Pressable
                onLongPress={Platform.OS === "android" ? onHold : undefined}
                style={({ pressed }) => pressed && { backgroundColor: quiet(palette) }}
              >
                {children}
              </Pressable>
            </Link.Trigger>
            {preview ? <Link.Preview>{preview}</Link.Preview> : null}
            {menu}
          </Link>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

/** One act: a tab standing at its own place behind the row, `at` slots in
 *  from the edge. It grows as the row uncovers that place; armed, the inner
 *  ones go and the outermost rides beside the row's edge. */
function ActionTab({
  act,
  at,
  sign,
  x,
  arming,
  closing,
  outermost,
  onPress,
}: {
  act: Act;
  at: number;
  sign: 1 | -1;
  x: SharedValue<number>;
  arming: SharedValue<number>;
  closing: SharedValue<boolean>;
  outermost: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const ink = act.disabled ? palette.ink4 : act.destructive ? palette.danger : palette.ink;
  const style = useAnimatedStyle(() => {
    const travelled = Math.max(0, sign * x.value);
    const grown = Math.min(1, Math.max(0, (travelled - at * SLOT) / SLOT));
    const shown = outermost ? grown : grown * (1 - arming.value);
    /* Where the row's edge has gone, less the tab's own slot. */
    const follow = outermost ? arming.value * Math.max(0, travelled - SLOT) : 0;
    return {
      opacity: closing.value ? 0 : shown,
      transform: [{ translateX: sign * (follow - 10 * (1 - shown)) }],
    };
  });
  return (
    <Animated.View style={[styles.slot, style]}>
      <Pressable
        style={({ pressed }) => [
          styles.tab,
          { backgroundColor: pressed ? quiet(palette) : palette.paper, borderColor: palette.rule },
        ]}
        onPress={onPress}
        disabled={act.disabled}
        accessibilityRole="button"
        accessibilityLabel={act.label}
      >
        <SymbolView name={act.icon} size={20} tintColor={ink} weight="regular" />
        <Text style={[styles.label, { color: ink }]} numberOfLines={2}>
          {act.label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  frame: { marginHorizontal: 16 },
  side: {
    position: "absolute",
    top: 0,
    bottom: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: GAP,
  },
  slot: { width: TAB_WIDTH, height: TAB_HEIGHT },
  label: { fontSize: 10, fontWeight: "600", textAlign: "center" },
  tab: {
    flex: 1,
    borderRadius: 17,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    gap: 5,
    paddingHorizontal: 3,
    alignItems: "center",
    justifyContent: "center",
  },
});
