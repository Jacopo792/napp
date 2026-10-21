/* A picture from a note, shown as Photos shows one. It flies out of its own
 * rectangle in the note to the whole screen while the ground darkens with the
 * flight; two fingers zoom it, two taps zoom to where they landed, and a
 * finger pulling it down takes it back — it follows the finger, shrinks a
 * little as it goes, and on release flies home to the place it came from.
 *
 * The page hands over the bytes and the rectangle (`ShownImage`); the picture
 * in the note is hidden once this copy is drawn over it and shown again when
 * the copy lands, so it is seen to leave rather than to be doubled. Markup
 * and Delete act on that same picture in the note. */
import { useEffect, useState } from "react";
import { Image, Modal, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  GestureDetector,
  GestureHandlerRootView,
  useExclusiveGestures,
  usePanGesture,
  usePinchGesture,
  useSimultaneousGestures,
  useTapGesture,
} from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ShownImage } from "./HostedPage";
import { RoundButton } from "./Chrome";
import { glide, release } from "./theme";

/** How far down a finger takes the picture before letting go closes it. */
const DISMISS = 110;
const MAX_ZOOM = 5;
const DOUBLE_ZOOM = 2.5;
/** The picture's corner in the note, which it loses on the way out. */
const NOTE_RADIUS = 10;

export function ImageViewer({
  image,
  top,
  onShown,
  onClosed,
}: {
  image: ShownImage;
  /** Where the page's own top edge stands in the window. */
  top: number;
  onShown: () => void;
  onClosed: (then?: "markup" | "remove") => void;
}) {
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  /* Where it lands: fitted to the whole screen, centred, as in Photos. */
  const fit = Math.min(W / image.width, H / image.height);
  const to = { width: image.width * fit, height: image.height * fit };
  const toLeft = (W - to.width) / 2;
  const toTop = (H - to.height) / 2;
  const from = { ...image.rect, y: image.rect.y + top };
  const fromScale = from.width / to.width;
  const fromX = from.x + from.width / 2 - W / 2;
  const fromY = from.y + from.height / 2 - H / 2;

  /** 0 in the note, 1 on the whole screen. */
  const flight = useSharedValue(0);
  const zoom = useSharedValue(1);
  const zoomFrom = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const xFrom = useSharedValue(0);
  const yFrom = useSharedValue(0);
  /** The pull that takes it back, while the picture is not zoomed. */
  const pullX = useSharedValue(0);
  const pullY = useSharedValue(0);
  const chrome = useSharedValue(1);
  const [loaded, setLoaded] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    onShown();
    flight.value = withSpring(1, glide);
  }, [loaded, onShown, flight]);

  const close = (then?: "markup" | "remove") => {
    if (leaving) return;
    setLeaving(true);
    if (then === "remove") {
      onClosed(then);
      return;
    }
    zoom.value = withSpring(1, glide);
    x.value = withSpring(0, glide);
    y.value = withSpring(0, glide);
    pullX.value = withSpring(0, glide);
    pullY.value = withSpring(0, glide);
    flight.value = withSpring(0, glide, (done) => {
      "worklet";
      if (done) scheduleOnRN(onClosed, then);
    });
  };

  const pinch = usePinchGesture({
    onActivate: () => {
      zoomFrom.value = zoom.value;
      xFrom.value = x.value;
      yFrom.value = y.value;
    },
    onUpdate: (event) => {
      const next = Math.min(MAX_ZOOM * 1.2, Math.max(0.8, zoomFrom.value * event.scale));
      /* The point under the fingers stays under them. */
      const fx = event.focalX - W / 2;
      const fy = event.focalY - H / 2;
      const ratio = next / zoomFrom.value;
      x.value = fx - ratio * (fx - xFrom.value);
      y.value = fy - ratio * (fy - yFrom.value);
      zoom.value = next;
    },
    onDeactivate: () => {
      const next = Math.min(MAX_ZOOM, Math.max(1, zoom.value));
      zoom.value = withSpring(next, release);
      if (next === 1) {
        x.value = withSpring(0, release);
        y.value = withSpring(0, release);
      }
    },
  });

  const pan = usePanGesture({
    maxPointers: 2,
    onActivate: () => {
      xFrom.value = x.value;
      yFrom.value = y.value;
    },
    onUpdate: (event) => {
      if (zoom.value > 1.01) {
        x.value = xFrom.value + event.translationX;
        y.value = yFrom.value + event.translationY;
        return;
      }
      pullX.value = event.translationX;
      pullY.value = event.translationY;
    },
    onDeactivate: (event) => {
      if (zoom.value > 1.01) {
        /* Kept inside the picture's own edges, as Photos does. */
        const spanX = Math.max(0, (to.width * zoom.value - W) / 2);
        const spanY = Math.max(0, (to.height * zoom.value - H) / 2);
        x.value = withSpring(Math.max(-spanX, Math.min(spanX, x.value)), release);
        y.value = withSpring(Math.max(-spanY, Math.min(spanY, y.value)), release);
        return;
      }
      if (pullY.value > DISMISS || event.velocityY > 900) {
        scheduleOnRN(close);
        return;
      }
      pullX.value = withSpring(0, release);
      pullY.value = withSpring(0, release);
    },
  });

  const twice = useTapGesture({
    numberOfTaps: 2,
    onDeactivate: (event) => {
      if (zoom.value > 1.01) {
        zoom.value = withSpring(1, glide);
        x.value = withSpring(0, glide);
        y.value = withSpring(0, glide);
        return;
      }
      const fx = event.x - W / 2;
      const fy = event.y - H / 2;
      zoom.value = withSpring(DOUBLE_ZOOM, glide);
      x.value = withSpring(fx - DOUBLE_ZOOM * fx, glide);
      y.value = withSpring(fy - DOUBLE_ZOOM * fy, glide);
    },
  });
  const once = useTapGesture({
    onDeactivate: () => {
      chrome.value = withSpring(chrome.value > 0.5 ? 0 : 1, release);
    },
  });
  const gestures = useSimultaneousGestures(pinch, pan, useExclusiveGestures(twice, once));

  const ground = useAnimatedStyle(() => ({
    opacity: flight.value * interpolate(Math.abs(pullY.value), [0, 300], [1, 0], "clamp"),
  }));
  const picture = useAnimatedStyle(() => {
    const p = flight.value;
    const pulled = interpolate(Math.abs(pullY.value), [0, 400], [1, 0.7], "clamp");
    return {
      borderRadius: NOTE_RADIUS * (1 - p) * (1 / Math.max(0.01, fromScale + (1 - fromScale) * p)),
      transform: [
        { translateX: fromX * (1 - p) + x.value + pullX.value },
        { translateY: fromY * (1 - p) + y.value + pullY.value },
        { scale: (fromScale + (1 - fromScale) * p) * zoom.value * pulled },
      ],
    };
  });
  const bar = useAnimatedStyle(() => ({
    opacity:
      flight.value * chrome.value * interpolate(Math.abs(pullY.value), [0, 80], [1, 0], "clamp"),
  }));

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => close()}
    >
      <GestureHandlerRootView style={StyleSheet.absoluteFill}>
        <GestureDetector gesture={gestures}>
          <View style={StyleSheet.absoluteFill}>
            <Animated.View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: "#000" }, ground]}
            />
            <Animated.View
              style={[
                {
                  position: "absolute",
                  left: toLeft,
                  top: toTop,
                  width: to.width,
                  height: to.height,
                  overflow: "hidden",
                },
                picture,
              ]}
            >
              <Image
                source={{ uri: image.uri }}
                accessibilityLabel={image.alt}
                resizeMode="cover"
                style={StyleSheet.absoluteFill}
                onLoad={() => setLoaded(true)}
                onError={() => onClosed()}
              />
            </Animated.View>
          </View>
        </GestureDetector>
        <Animated.View
          style={[styles.bar, { top: insets.top + 6 }, bar]}
          pointerEvents={leaving ? "none" : "box-none"}
        >
          <RoundButton icon="xmark" label="Close" size={44} onPress={() => close()} />
          {image.editable ? (
            <View style={styles.acts}>
              <RoundButton
                icon="pencil.tip.crop.circle"
                label="Markup"
                size={44}
                onPress={() => close("markup")}
              />
              <RoundButton icon="trash" label="Delete" size={44} onPress={() => close("remove")} />
            </View>
          ) : null}
        </Animated.View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: 16,
    right: 16,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  acts: { flexDirection: "row", gap: 12 },
});
