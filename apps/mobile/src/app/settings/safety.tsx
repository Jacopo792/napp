import { useEffect, useState } from "react";
import { Alert } from "react-native";
import { useRouter } from "expo-router";
import {
  BLOCK_CONSEQUENCES,
  blockUser,
  loadBlockedUsers,
  unblockUser,
  type BlockedUser,
} from "@/lib/storeSafety";
import { useArchive } from "../../archive";
import { Line, Section, SettingsPage, Status } from "../../SettingsControls";
import { useChoice } from "../../TextPrompt";

export default function Safety() {
  const { snapshot, refresh } = useArchive();
  const router = useRouter();
  const choose = useChoice();
  const [blocked, setBlocked] = useState<BlockedUser[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    void loadBlockedUsers()
      .then((users) => {
        if (live) setBlocked(users);
      })
      .catch((reason: Error) => {
        if (live) setError(reason.message);
      });
    return () => {
      live = false;
    };
  }, [attempt]);
  const run = async (act: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await act();
      setAttempt((n) => n + 1);
      refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not update safety settings");
    } finally {
      setBusy(false);
    }
  };
  return (
    <SettingsPage title="Safety">
      {error ? <Status>{error}</Status> : null}
      <Section title="People in this archive">
        {snapshot?.members
          .filter((member) => !member.isSelf)
          .map((member) => (
            <Line
              key={member.userId}
              icon="person"
              label={member.nickname || "Member"}
              disabled={busy}
              opens
              onPress={() =>
                choose(member.nickname || "Member", [
                  {
                    label: "Report user",
                    icon: "flag",
                    run: () =>
                      router.push({
                        pathname: "/settings/report",
                        params: { userId: member.userId },
                      }),
                  },
                  {
                    label: "Block user",
                    icon: "hand.raised.fill",
                    destructive: true,
                    run: () =>
                      Alert.alert("Block this user?", BLOCK_CONSEQUENCES, [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Block",
                          style: "destructive",
                          onPress: () => void run(() => blockUser(member.userId)),
                        },
                      ]),
                  },
                ])
              }
            />
          ))}
      </Section>
      <Section title="Blocked accounts">
        {blocked.length ? (
          blocked.map((member) => (
            <Line
              key={member.blocked_id}
              label={member.blocked_name || "Member"}
              value="Unblock"
              disabled={busy}
              onPress={() => void run(() => unblockUser(member.blocked_id))}
            />
          ))
        ) : (
          <Line label="No blocked accounts" disabled />
        )}
      </Section>
      {error ? (
        <Section>
          <Line
            label="Try again"
            disabled={busy}
            onPress={() => {
              setError("");
              setAttempt((n) => n + 1);
            }}
          />
        </Section>
      ) : null}
    </SettingsPage>
  );
}
