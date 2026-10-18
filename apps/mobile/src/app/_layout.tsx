import { TextPromptProvider } from "../TextPrompt";
/* The phone, laid out the way Notes on the iPhone is: a stack the system
 * draws — large titles that collapse into the bar, the back gesture, Liquid
 * Glass bars and toolbars — over screens that read the archive from one place.
 * Nothing here animates by hand what UIKit already animates. */
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { restoreSession, type AppSession } from "@/lib/session";
import { initAppearance } from "@/lib/appearance";
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

  const theme = palette.dark ? DarkTheme : DefaultTheme;
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: palette.page }}>
      <TextPromptProvider>
        <ThemeProvider
          value={{
            ...theme,
            colors: {
              ...theme.colors,
              primary: palette.accent,
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
                    headerLargeTitle: true,
                    headerTransparent: true,
                    headerLargeTitleShadowVisible: false,
                    headerShadowVisible: false,
                    headerTintColor: palette.accent,
                    headerTitleStyle: { color: palette.ink },
                    headerLargeTitleStyle: {
                      color: palette.ink,
                      fontWeight: "700",
                    },
                    contentStyle: { backgroundColor: palette.page },
                  }}
                />
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
