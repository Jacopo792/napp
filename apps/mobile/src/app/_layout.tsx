import { traceStartup } from "../startupTrace";
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
import { mayStartAnonymous, SESSION_KEY } from "@/lib/sessionRestore";
import { StatusBar } from "expo-status-bar";
import {
  chooseArchive,
  notesArchives,
  otherAccounts,
  resumeAccount,
  SignInAgain,
  restoreSession,
  startAnonymous,
  type AuthenticationResult,
  type AppSession,
} from "@/lib/session";
import { initAppearance, useAppearance } from "@/lib/appearance";
import { releaseAccountPreferences } from "@/lib/accountPreferences";
import { clearPictures } from "../Avatar";
import { initAxes } from "@/lib/axes";
import { ArchiveProvider, usePalette } from "../archive";
import { SignIn } from "../SignIn";
import { ArchiveOpened, Launch } from "../Launch";
import { HostedPageProvider } from "../HostedPage";
import { PolicyGate } from "../PolicyGate";

initAppearance();
initAxes();

export default function Root() {
  const [session, setSession] = useState<AppSession | null | undefined>(undefined);
  const [choosing, setChoosing] = useState<AuthenticationResult | null>(null);
  const changing = useRef(false);
  const [error, setError] = useState("");
  /* An account whose token the server refused: the sign-in page opens on its
     address, never on "no archives". */
  const [prefill, setPrefill] = useState("");
  const fail = useCallback((reason: unknown) => {
    setError(reason instanceof Error ? reason.message : String(reason));
    if (reason instanceof SignInAgain) setPrefill(reason.email);
  }, []);
  const router = useRouter();
  const accept = useCallback((next: AppSession) => {
    setChoosing(null);
    setPrefill("");
    setSession(next);
  }, []);
  /* The launch stands until the archive it opened has its notes: which
     archive that was, so a change of account waits for the new one. */
  const [openedKey, setOpenedKey] = useState<string | null>(null);
  const sessionKey = session ? `${session.userId}:${session.archiveId}` : null;
  const archiveOpened = useCallback(() => setOpenedKey(sessionKey), [sessionKey]);
  const waiting = session === undefined || (sessionKey !== null && openedKey !== sessionKey);
  const userId = session?.userId;
  const archiveId = session?.archiveId;
  /* The initial URL already selects the route. Replacing it here remounts
     this root when the navigator first appears, restoring the account over
     and over and cancelling the launch's exit before it can finish. Account
     changes return Home only after the new credentials have been stored. */
  useEffect(() => {
    if (!userId || !archiveId) return;
    void supabase.auth.startAutoRefresh();
  }, [userId, archiveId]);
  useEffect(() => {
    void (async () => {
      /* The archives are asked for beside the token check, not after it: the
         two were round trips in series before anything could be drawn. A
         list fetched for an account that is not the one restored is dropped. */
      /* Read before anything below can clear the saved session. */
      const neverSignedIn = mayStartAnonymous(localStorage);
      const stored = storedSession();
      const early = stored ? notesArchives(stored) : null;
      early?.catch(() => {});
      traceStartup("restoreSession…");
      const restored = await restoreSession();
      traceStartup("restored " + Boolean(restored));
      if (!restored) {
        await releaseAccountPreferences();
        traceStartup("released prefs");
        /* A real account that did not come back is asked for again — never
           replaced by an anonymous one. */
        if (!neverSignedIn) {
          if (stored?.email) setPrefill(stored.email);
          return setSession(null);
        }
        /* A phone that never held an account opens on the notes, in one with
           no address, and asks for one only to share or to keep them. */
        traceStartup("startAnonymous…");
        const fresh = await startAnonymous({ notesOnly: true });
        traceStartup("anonymous " + Boolean(fresh.session));
        setChoosing(fresh.session ? null : fresh);
        return setSession(fresh.session);
      }
      traceStartup("notesArchives…");
      const archives =
        early && stored?.userId === restored.userId ? await early : await notesArchives(restored);
      traceStartup("archives " + archives.length);
      const target = archives.find((item) => item.archiveId === restored.archiveId) ?? archives[0];
      if (target) {
        traceStartup(
          target.archiveId === restored.archiveId ? "setSession restored" : "chooseArchive…",
        );
        setSession(
          target.archiveId === restored.archiveId
            ? restored
            : await chooseArchive(restored, target.archiveId, { notesOnly: true }),
        );
        traceStartup("setSession done");
      } else {
        traceStartup("no target");
        setChoosing({ account: restored, archives, session: null });
        setSession(null);
      }
    })().catch((reason) => {
      traceStartup("restore failed " + String(reason));
      fail(reason);
      setSession(null);
    });
  }, [fail]);

  const changeAccount = useCallback(
    async (action: () => Promise<AuthenticationResult | null>) => {
      if (changing.current) return;
      changing.current = true;
      traceStartup("account change begin");
      try {
        setError("");
        // Flush under the old identity before auth is changed or any screen disappears.
        // Identity rejection has already removed its saved archive. Do not
        // attempt one last write with that refused token before showing login.
        const retained = storedSession()?.userId === session?.userId;
        await releaseAccountPreferences(retained ? (session ?? undefined) : undefined);
        traceStartup("account prefs released");
        setSession(undefined);
        // Let React unmount the editor and all subscriptions before swapping credentials.
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        traceStartup("account old views unmounted");
        clearPictures();
        try {
          traceStartup("account authenticate…");
          let result = await action();
          traceStartup("account authenticated " + Boolean(result?.session));
          /* An empty list may be a read made without the account's token
             (the archive screen's own read on a wake, say): asked again. */
          if (result && !result.session && !result.archives.length) {
            const archives = await notesArchives(result.account);
            result = {
              ...result,
              archives,
              session: archives[0]
                ? await chooseArchive(result.account, archives[0].archiveId, { notesOnly: true })
                : null,
            };
          }
          setChoosing(result?.session ? null : result);
          setSession(result?.session ?? null);
          traceStartup("account session adopted");
          /* Navigating while auth is still changing can remount Root and
             restore the old identity. Its archive then reads with the new
             token and races the successful sign-in back to the login page.
             Navigate only once the new session is persisted. An archive
             chooser stays in place until it has an actual session. */
          if (!result || result.session) router.replace("/");
        } catch (reason) {
          fail(reason);
          /* A refused account is asked for its password; the one left is
             saved and waits under the form. */
          if (reason instanceof SignInAgain) return setSession(null);
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
    [router, session, fail],
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
            <View style={{ flex: 1 }} />
          ) : session ? (
            <ArchiveProvider
              key={`${session.userId}:${session.archiveId}`}
              session={session}
              onSession={accept}
              onAccountChange={changeAccount}
            >
              <ArchiveOpened onOpened={archiveOpened} />
              <PolicyGate>
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
                    <Stack.Screen
                      name="sign-in"
                      options={{ presentation: "pageSheet", headerShown: false }}
                    />
                  </Stack>
                </HostedPageProvider>
              </PolicyGate>
            </ArchiveProvider>
          ) : (
            <SignIn
              key={prefill}
              initialEmail={prefill}
              onSession={accept}
              initialChoosing={choosing}
              onResume={(userId) => changeAccount(() => resumeAccount(userId, { notesOnly: true }))}
              onSkip={() => changeAccount(() => startAnonymous({ notesOnly: true }))}
            />
          )}
          <Launch waiting={waiting} />
        </ThemeProvider>
      </TextPromptProvider>
    </GestureHandlerRootView>
  );
}

/** The account this phone was last open on, as it was written down — read
 *  before the server has confirmed it, and only to start asking early. */
function storedSession(): AppSession | null {
  try {
    const stored = JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
    return stored && typeof stored.userId === "string" && typeof stored.email === "string"
      ? stored
      : null;
  } catch {
    return null;
  }
}
