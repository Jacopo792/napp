import { createContext, useContext, useState, type ReactNode } from "react";
import {
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

export function TextPromptProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<Request | null>(null);
  const palette = usePalette();
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
      {children}
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
          <View style={{ padding: 24, borderRadius: 24, backgroundColor: palette.paper, gap: 20 }}>
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
                <Text style={{ color: palette.accent, fontSize: 17, fontWeight: "600" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </Context.Provider>
  );
}
