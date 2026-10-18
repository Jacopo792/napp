import { TextPromptProvider } from "../TextPrompt";
/* The phone: three tabs under the system's floating tab bar — `(tabs)` — and
 * a stack the system draws over them for everything pushed: a folder, a note,
 * a page of Settings, each with the back gesture and a round glass back
 * button and no title in the bar, because the page says its own (Revolut's
 * shape; see Chrome.tsx). Nothing here animates by hand what UIKit already
 * animates. */
import { useCallback, useEffect, useRef, useState } from "react";
import { Appearance, Pressable, Text, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { DarkTheme, DefaultTheme, Stack, ThemeProvider, useRouter } from "expo-router";
import { supabase } from "@/lib/supabaseClient";
import { StatusBar } from "expo-status-bar";
import {
  chooseArchive,
  otherAccounts,
  loadArchiveOptions,
  resumeAccount,
  restoreSession,
  type AuthenticationResult,
  type AppSession,
} from "@/lib/session";
import { initAppearance, useAppearance } from "@/lib/appearance";
import { releaseAccountPreferences } from "@/lib/accountPreferences";
import { clearPictures } from "../Avatar";
import { initAxes } from "@/lib/axes";
import { ArchiveProvider, usePalette } from "../archive";
import { SignIn } from "../SignIn";
import { SkeletonCard } from "../Chrome";
import { HostedPageProvider } from "../HostedPage";

initAppearance();
initAxes();

export default function Root() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(null);
  const changing = useRef(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const accept = useCallback((next: AppSession) => {
    setChoosing(null);
    setSession(next);
  }, []);
  const userId = session?.userId;
  const archiveId = session?.archiveId;
  useEffect(() => {
    if (!userId || !archiveId) return;
    void supabase.auth.startAutoRefresh();
    router.replace("/");
  }, [router, userId, archiveId]);
  useEffect(() => {
    void (async () => {
      const restored = await restoreSession();
      if (!restored) {
        await releaseAccountPreferences();
        return setSession(null);
      }
      const archives = await loadArchiveOptions(restored.userId, { notesOnly: true });
      const target = archives.find((item) => item.archiveId === restored.archiveId) ?? archives[0];
      if (target)
        setSession(
          target.archiveId === restored.archiveId
            ? restored
            : await chooseArchive(restored, target.archiveId, { notesOnly: true }),
        );
      else {
        setChoosing({ account: restored, archives, session: null });
        setSession(null);
      }
    })().catch((reason) => {
      setError(reason instanceof Error ? reason.message : String(reason));
      setSession(null);
    });
  }, []);

  const changeAccount = useCallback(
    async (action: () => Promise<AuthenticationResult | null>) => {
      if (changing.current) return;
      changing.current = true;
      try {
        setError("");
        // Flush under the old identity before auth is changed or any screen disappears.
        await releaseAccountPreferences(session ?? undefined);
        if (session) router.replace("/");
        setSession(undefined);
        // Let React unmount the editor and all subscriptions before swapping credentials.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        clearPictures();
        try {
          const result = await action();
          setChoosing(result?.session ? null : result);
          setSession(result?.session ?? null);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : String(reason));
          let recovered: AppSession | null = null;
          if (session && otherAccounts("").some((account) => account.userId === session.userId)) {
            recovered =
              (await resumeAccount(session.userId, { notesOnly: true }).catch(() => null))
                ?.session ?? null;
          } else recovered = await restoreSession().catch(() => null);
          setSession(recovered);
        }
      } finally {
        changing.current = false;
      }
    },
    [router, session],
  );
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
          {error ? (
            <View
              style={{
                position: "absolute",
                top: 60,
                left: 16,
                right: 16,
                padding: 16,
                borderRadius: 16,
                zIndex: 10,
                backgroundColor: palette.paper,
              }}
            >
              <Text accessibilityRole="alert" style={{ color: palette.danger }}>
                {error}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss message"
                onPress={() => setError("")}
                style={{ minHeight: 44, justifyContent: "center" }}
              >
                <Text style={{ color: palette.ink }}>Dismiss</Text>
              </Pressable>
            </View>
          ) : null}
          {session === undefined ? (
            <View
              accessibilityLabel="Opening account"
              style={{ flex: 1, paddingTop: 90, backgroundColor: palette.page }}
            >
              <Text
                style={{
                  color: palette.ink3,
                  fontSize: 16,
                  paddingHorizontal: 24,
                  marginBottom: 20,
                }}
              >
                Opening account…
              </Text>
              <SkeletonCard rows={3} />
            </View>
          ) : session ? (
            <ArchiveProvider
              key={`${session.userId}:${session.archiveId}`}
              session={session}
              onSession={accept}
              onAccountChange={changeAccount}
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
            <SignIn
              onSession={accept}
              initialChoosing={choosing}
              onResume={(userId) => changeAccount(() => resumeAccount(userId, { notesOnly: true }))}
            />
          )}
        </ThemeProvider>
      </TextPromptProvider>
    </GestureHandlerRootView>
  );
}
