import type { ReactNode } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "./archive";

export function NoteSheet({
  title,
  onClose,
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      backdropColor={palette.page}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: palette.page }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            padding: 20,
            paddingTop: Platform.OS === "android" ? inset.top + 16 : 22,
            borderBottomWidth: 0.5,
            borderColor: palette.rule,
          }}
        >
          <Text
            accessibilityRole="header"
            style={{ color: palette.ink, fontSize: 22, fontWeight: "700", flex: 1 }}
          >
            {title}
          </Text>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={onClose}>
            <Text style={{ color: palette.accent, fontSize: 17 }}>Done</Text>
          </Pressable>
        </View>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingTop: 20, paddingBottom: 24 }}
        >
          {children}
        </ScrollView>
        {footer ? (
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 12,
              paddingBottom: Math.max(inset.bottom, 20),
              backgroundColor: palette.paper,
            }}
          >
            {footer}
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
