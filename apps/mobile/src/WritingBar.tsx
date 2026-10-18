/* The bar that rides on the keyboard while a note is being written, drawn the
 * way Notes draws its own: one glass capsule just above the keys, whose row
 * swaps in place — the tools, then the formatting once words are chosen or Aa
 * is pressed, then a style, a list or an ink. Nothing floats over the words;
 * the selection itself keeps the system's edit menu.
 *
 * It stands on the keyboard's own top edge, read from the system's keyboard
 * frame and eased on the keyboard's own duration — not measured against the
 * screen's bottom, which a native stack does not promise is the window's.
 * What it shows as pressed is what the page reports the selection is set in. */
import { useEffect, useState, type ReactNode } from "react";
import { Keyboard, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { GlassView } from "expo-glass-effect";
import type { SFSymbol } from "expo-symbols";
import type { HostedCommand, HostedFormat } from "@/lib/hostedCommands";
import type { TextColor } from "@/features/editor/lib/content";
import { usePalette } from "./archive";
import { glassy } from "./Chrome";
import { Press } from "./Grouped";
import { SymbolView } from "./icons";

const BAR_HEIGHT = 52;

type Row = "tools" | "format" | "styles" | "lists" | "inks";

/* The editor's tints, as styles.css draws them on each ground. */
const INKS: Record<TextColor, [dark: string, light: string]> = {
  yellow: ["#e8c46a", "#9c7a00"],
  purple: ["#c69cf0", "#6741d9"],
  pink: ["#f095b7", "#c2255c"],
  orange: ["#efa86f", "#d9480f"],
  mint: ["#79ddb2", "#2b8a3e"],
  blue: ["#8fb6f5", "#1c64c6"],
};

export function WritingBar({
  format,
  run,
  onLink,
  onAttach,
  onComment,
  frameTop,
}: {
  format: HostedFormat;
  run: (command: HostedCommand) => void;
  onLink: () => void;
  onAttach: (image: boolean) => void;
  onComment: () => void;
  /** Where the screen's own top edge stands in the window. */
  frameTop: number;
}) {
  const palette = usePalette();
  /* The keyboard's top edge in the window; Infinity while it is away. */
  const edge = useSharedValue(Number.POSITIVE_INFINITY);
  useEffect(() => {
    const ios = Platform.OS === "ios";
    const move = (event: { endCoordinates: { screenY: number }; duration?: number }) => {
      const to = event.endCoordinates.screenY;
      edge.value = Number.isFinite(edge.value)
        ? withTiming(to, { duration: event.duration || 250, easing: Easing.out(Easing.cubic) })
        : to;
    };
    const subscriptions = [
      Keyboard.addListener(ios ? "keyboardWillChangeFrame" : "keyboardDidShow", move),
      Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", () => {
        edge.value = Number.POSITIVE_INFINITY;
        setRow("tools");
      }),
    ];
    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [edge]);
  const [row, setRow] = useState<Row>("tools");
  /* Choosing words is asking how they should look. */
  useEffect(() => {
    if (format.selection) setRow((current) => (current === "tools" ? "format" : current));
  }, [format.selection]);
  const ride = useAnimatedStyle(() =>
    Number.isFinite(edge.value)
      ? { top: edge.value - frameTop - BAR_HEIGHT - 8 }
      : /* Parked below the screen rather than faded: a glass view that has
           been at opacity 0 comes back without its material. */
        { top: 4000 },
  );

  const act = (mark: HostedFormat["marks"][number]) => format.marks.includes(mark);
  const style = (action: HostedCommand & { type: "format" }) => () => run(action);
  const back = <Key icon="chevron.backward" label="Back" onPress={() => setRow("format")} />;

  let keys: ReactNode;
  if (row === "tools")
    keys = (
      <>
        <Key icon="textformat" label="Format" onPress={() => setRow("format")} />
        <Key
          icon="checklist"
          label="Checklist"
          on={format.list === "checklist"}
          onPress={() => run({ type: "format", action: "checklist" })}
        />
        <Key
          icon="tablecells"
          label="Table"
          onPress={() => run({ type: "format", action: "table-3" })}
        />
        <Key icon="photo" label="Insert Image" onPress={() => onAttach(true)} />
        <Key icon="paperclip" label="Attach File" onPress={() => onAttach(false)} />
        <Key
          icon="pencil.tip.crop.circle"
          label="Markup"
          onPress={() => run({ type: "format", action: "drawing-page" })}
        />
        <Key icon="text.bubble" label="Comment" onPress={onComment} />
      </>
    );
  else if (row === "format")
    keys = (
      <>
        <Key icon="xmark" label="Close Formatting" onPress={() => setRow("tools")} />
        <Key icon="textformat.size" label="Text Style" onPress={() => setRow("styles")} />
        <Key
          icon="bold"
          label="Bold"
          on={act("bold")}
          onPress={() => run({ type: "format", action: "bold" })}
        />
        <Key
          icon="italic"
          label="Italic"
          on={act("italic")}
          onPress={() => run({ type: "format", action: "italic" })}
        />
        <Key
          icon="underline"
          label="Underline"
          on={act("underline")}
          onPress={() => run({ type: "edit", action: "underline" })}
        />
        <Key
          icon="strikethrough"
          label="Strikethrough"
          on={act("strike")}
          onPress={() => run({ type: "format", action: "strike" })}
        />
        <Key icon="highlighter" label="Text Colour" onPress={() => setRow("inks")} />
        <Key icon="link" label="Link" on={act("link")} onPress={onLink} />
        <Key
          icon="list.bullet"
          label="Lists"
          on={format.list !== null}
          onPress={() => setRow("lists")}
        />
      </>
    );
  else if (row === "styles")
    keys = (
      <>
        {back}
        {(
          [
            ["heading-1", "Title", 20, "700"],
            ["heading-2", "Heading", 17, "700"],
            ["heading-3", "Subheading", 15, "600"],
            ["body", "Body", 15, "400"],
            ["quote", "Quote", 15, "400"],
          ] as const
        ).map(([action, label, size, weight]) => (
          <Word
            key={action}
            label={label}
            on={format.block === action}
            size={size}
            weight={weight}
            onPress={style({ type: "format", action })}
          />
        ))}
        <Word
          label="Mono"
          mono
          on={act("code")}
          onPress={style({ type: "format", action: "code" })}
        />
      </>
    );
  else if (row === "lists")
    keys = (
      <>
        {back}
        <Key
          icon="list.bullet"
          label="Bulleted List"
          on={format.list === "bullet-list"}
          onPress={() => run({ type: "format", action: "bullet-list" })}
        />
        <Key
          icon="list.number"
          label="Numbered List"
          on={format.list === "ordered-list"}
          onPress={() => run({ type: "format", action: "ordered-list" })}
        />
        <Key
          icon="checklist"
          label="Checklist"
          on={format.list === "checklist"}
          onPress={() => run({ type: "format", action: "checklist" })}
        />
        <Key
          icon="decrease.indent"
          label="Outdent"
          disabled={!format.list}
          onPress={() => run({ type: "edit", action: "outdent" })}
        />
        <Key
          icon="increase.indent"
          label="Indent"
          disabled={!format.list}
          onPress={() => run({ type: "edit", action: "indent" })}
        />
      </>
    );
  else
    keys = (
      <>
        {back}
        {(Object.keys(INKS) as TextColor[]).map((ink) => (
          <Press
            key={ink}
            feedback="scale"
            accessibilityRole="button"
            accessibilityLabel={`${ink} text`}
            onPress={() => run({ type: "format", action: `color-${ink}` })}
            style={styles.key}
          >
            <View style={[styles.ink, { backgroundColor: INKS[ink][palette.dark ? 0 : 1] }]} />
          </Press>
        ))}
        <Key
          icon="circle.slash"
          label="No Colour"
          onPress={() => run({ type: "format", action: "color-clear" })}
        />
      </>
    );

  const ground = { height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2, overflow: "hidden" as const };
  return (
    <Animated.View pointerEvents="box-none" style={[styles.rail, ride]}>
      {glassy ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={palette.dark ? "dark" : "light"}
          style={ground}
        >
          <Keys key={row}>{keys}</Keys>
        </GlassView>
      ) : (
        <View
          style={[
            ground,
            {
              backgroundColor: palette.paper,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: palette.rule,
            },
          ]}
        >
          <Keys key={row}>{keys}</Keys>
        </View>
      )}
    </Animated.View>
  );
}

function Keys({ children }: { children: ReactNode }) {
  return (
    <ScrollView
      horizontal
      style={{ height: BAR_HEIGHT }}
      keyboardShouldPersistTaps="always"
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.keys}
    >
      {children}
    </ScrollView>
  );
}

function Key({
  icon,
  label,
  onPress,
  on = false,
  disabled = false,
}: {
  icon: SFSymbol;
  label: string;
  onPress: () => void;
  on?: boolean;
  disabled?: boolean;
}) {
  const palette = usePalette();
  return (
    <Press
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.key,
        on && { backgroundColor: palette.dark ? "#ffffff2e" : "#0000001a" },
        disabled && { opacity: 0.35 },
      ]}
    >
      <SymbolView name={icon} size={21} weight="medium" tintColor={palette.ink} />
    </Press>
  );
}

function Word({
  label,
  onPress,
  on,
  size = 15,
  weight = "400",
  mono = false,
}: {
  label: string;
  onPress: () => void;
  on: boolean;
  size?: number;
  weight?: "400" | "600" | "700";
  mono?: boolean;
}) {
  const palette = usePalette();
  return (
    <Press
      feedback="scale"
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.word, on && { backgroundColor: palette.dark ? "#ffffff2e" : "#0000001a" }]}
    >
      <Text
        style={{
          color: palette.ink,
          fontSize: size,
          fontWeight: weight,
          fontFamily: mono ? Platform.select({ ios: "Menlo", default: "monospace" }) : undefined,
        }}
      >
        {label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  rail: { position: "absolute", left: 10, right: 10 },
  keys: { alignItems: "center", paddingHorizontal: 6, height: BAR_HEIGHT },
  key: {
    width: 42,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  word: {
    height: 40,
    paddingHorizontal: 12,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  ink: { width: 24, height: 24, borderRadius: 12 },
});
