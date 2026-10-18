import { TextPromptProvider } from "../TextPrompt";
/* The phone: four tabs under the system's floating tab bar — `(tabs)` — and
 * a stack the system draws over them for everything pushed: a folder, a note,
 * a page of Settings, each with the back gesture and a round glass back
 * button and no title in the bar, because the page says its own (Revolut's
 * shape; see Chrome.tsx). Nothing here animates by hand what UIKit already
 * animates. */
import { useEffect, useState } from "react";
import { Appearance } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { restoreSession, type AppSession } from "@/lib/session";
import { initAppearance, useAppearance } from "@/lib/appearance";
import { initAxes } from "@/lib/axes";
import { ArchiveProvider, usePalette } from "../archive";
import { SignIn } from "../SignIn";
import { HostedPageProvider } from "../HostedPage";

initAppearance();
initAxes();

export default function Root() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  useEffect(() => {
    restoreSession().then(setSession, () => setSession(null));
  }, []);
  const palette = usePalette();
  /* The system's own surfaces — the tab bar, the glass, the bar buttons, the
     menus — wear the theme the reader chose, not the phone's. */
  const chosen = useAppearance().theme;
  useEffect(() => {
    Appearance.setColorScheme(
      chosen === "system" ? "unspecified" : palette.dark ? "dark" : "light",
    );
  }, [chosen, palette.dark]);

  const theme = palette.dark ? DarkTheme : DefaultTheme;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.page }}>
      <TextPromptProvider>
        <ThemeProvider
          value={{
            ...theme,
            colors: {
              ...theme.colors,
              primary: palette.ink,
              background: palette.page,
              card: palette.page,
              text: palette.ink,
              border: palette.rule,
            },
          }}
        >
          <StatusBar style={palette.dark ? "light" : "dark"} />
          {session === undefined ? null : session ? (
            <ArchiveProvider
              key={`${session.userId}:${session.archiveId}`}
              session={session}
              onSession={setSession}
              onSignedOut={() => setSession(null)}
            >
              <HostedPageProvider>
                <Stack
                  screenOptions={{
                    title: "",
                    headerTransparent: true,
                    headerShadowVisible: false,
                    headerBackButtonDisplayMode: "minimal",
                    headerTintColor: palette.ink,
                    headerTitleStyle: { color: palette.ink },
                    contentStyle: { backgroundColor: palette.page },
                  }}
                >
                  <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                </Stack>
              </HostedPageProvider>
            </ArchiveProvider>
          ) : (
            <SignIn onSession={setSession} />
          )}
        </ThemeProvider>
      </TextPromptProvider>
    </GestureHandlerRootView>
  );
}
