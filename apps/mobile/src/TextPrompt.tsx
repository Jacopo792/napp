import { createContext, useContext, useState, type ReactNode } from "react";
/* The system's own dialogs, where the system has them: a text prompt and a
 * list of acts to choose from. iOS draws both itself (`Alert.prompt`,
 * `ActionSheetIOS`); Android has neither, so they are drawn here. */
import {
  ActionSheetIOS,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePalette } from "./archive";

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
  run: () => void;
  destructive?: boolean;
  disabled?: boolean;
}
type Choose = (title: string | undefined, choices: Choice[], preview?: ReactNode) => void;
const Choices = createContext<Choose>(() => {});
/** A short list of acts, offered from a button: the ⋯ of a folder, the +. */
export const useChoice = () => useContext(Choices);

export function TextPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const [offer, setOffer] = useState<{
    title?: string;
    choices: Choice[];
    preview?: ReactNode;
  } | null>(null);
  const palette = usePalette();
  const inset = useSafeAreaInsets();
  const choose: Choose = (title, all, preview) => {
    const choices = all.filter((choice) => !choice.disabled);
    if (Platform.OS !== "ios") return setOffer({ title, choices, preview });
    const destructive = choices.findIndex((choice) => choice.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...choices.map((choice) => choice.label), "Cancel"],
        cancelButtonIndex: choices.length,
        destructiveButtonIndex: destructive < 0 ? undefined : destructive,
        userInterfaceStyle: palette.dark ? "dark" : "light",
      },
      (at) => choices[at]?.run(),
    );
  };
  const prompt: Prompt = (title, message, submit, _type, value = "", keyboard) => {
    if (Platform.OS === "ios") Alert.prompt(title, message, submit, "plain-text", value, keyboard);
    else setRequest({ title, message, submit, value, keyboard });
  };
  const accept = () => {
    if (request) {
      setRequest(null);
      request.submit(request.value);
    }
  };
  return (
    <Context.Provider value={prompt}>
      <Choices.Provider value={choose}>
        {children}
        <Modal
          visible={Boolean(offer)}
          transparent
          animationType="fade"
          onRequestClose={() => setOffer(null)}
        >
          <Pressable
            style={{
              flex: 1,
              justifyContent: "flex-end",
              padding: 16,
              paddingBottom: 16 + inset.bottom,
              backgroundColor: "#00000088",
            }}
            onPress={() => setOffer(null)}
          >
            {offer?.preview ? (
              <View
                style={{
                  height: 340,
                  borderRadius: 24,
                  overflow: "hidden",
                  marginBottom: 12,
                  backgroundColor: palette.canvas,
                }}
              >
                {offer.preview}
              </View>
            ) : null}
            <View style={{ borderRadius: 24, backgroundColor: palette.paper, paddingVertical: 8 }}>
              {offer?.title ? (
                <Text style={{ color: palette.ink3, fontSize: 13, fontWeight: "600", padding: 16 }}>
                  {offer.title}
                </Text>
              ) : null}
              {offer?.choices.map((choice) => (
                <Pressable
                  key={choice.label}
                  accessibilityRole="button"
                  onPress={() => {
                    setOffer(null);
                    choice.run();
                  }}
                  style={({ pressed }) => ({
                    paddingVertical: 16,
                    paddingHorizontal: 20,
                    opacity: pressed ? 0.5 : 1,
                  })}
                >
                  <Text
                    style={{
                      color: choice.destructive ? palette.danger : palette.ink,
                      fontSize: 17,
                      fontWeight: "500",
                    }}
                  >
                    {choice.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Modal>
        <Modal
          visible={Boolean(request)}
          transparent
          animationType="fade"
          onRequestClose={() => setRequest(null)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1, justifyContent: "center", padding: 32, backgroundColor: "#00000088" }}
            behavior="padding"
          >
            <View
              style={{ padding: 24, borderRadius: 24, backgroundColor: palette.paper, gap: 20 }}
            >
              <Text style={{ color: palette.ink, fontSize: 22, fontWeight: "600" }}>
                {request?.title}
              </Text>
              <TextInput
                accessibilityLabel={request?.title}
                autoFocus
                value={request?.value ?? ""}
                onChangeText={(value) => setRequest((prev) => prev && { ...prev, value })}
                keyboardType={request?.keyboard}
                onSubmitEditing={accept}
                style={{
                  color: palette.ink,
                  fontSize: 17,
                  borderBottomColor: palette.rule,
                  borderBottomWidth: 1,
                  paddingVertical: 12,
                }}
              />
              <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 28 }}>
                <Pressable onPress={() => setRequest(null)}>
                  <Text style={{ color: palette.ink2, fontSize: 17 }}>Cancel</Text>
                </Pressable>
                <Pressable onPress={accept}>
                  <Text style={{ color: palette.accent, fontSize: 17, fontWeight: "600" }}>
                    Save
                  </Text>
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </Modal>
      </Choices.Provider>
    </Context.Provider>
  );
}
