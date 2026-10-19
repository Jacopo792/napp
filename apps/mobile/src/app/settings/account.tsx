/* Everything about the account, behind the profile card: the account's title
 * page, then one card for you and one for the accounts on this phone. */
import { useState } from "react";
import { Link } from "expo-router";
import { useArchive } from "../../archive";
import { useAccountCards } from "../../Accounts";
import { ProfileHero } from "../../ProfilePhoto";
import { attempt, Line, Section, SettingsPage } from "../../SettingsControls";
import { useTextPrompt } from "../../TextPrompt";

export default function Account() {
  const { profile, updateProfile, preferences: p } = useArchive();
  const prompt = useTextPrompt();
  const [busy, setBusy] = useState(false);
  const accounts = useAccountCards(false);
  const go = (section: string) =>
    ({ pathname: "/settings/[section]", params: { section } }) as const;
  const rename = () =>
    prompt(
      "Name",
      undefined,
      (name) => {
        if (!profile || !name?.trim() || busy) return;
        setBusy(true);
        void attempt(() =>
          updateProfile({ ...profile, nickname: name.trim().slice(0, 40) }),
        ).finally(() => setBusy(false));
      },
      "plain-text",
      profile?.nickname,
    );
  return (
    <SettingsPage>
      <ProfileHero />
      <Section>
        <Line
          icon="person"
          label="Name"
          value={profile?.nickname || "Add"}
          disabled={!profile || busy}
          onPress={rename}
          opens
        />
        <Link href={go("security")} asChild>
          <Line
            icon="hand.raised"
            label="Privacy"
            note={p.presence ? "Online status shown" : "Online status hidden"}
            opens
          />
        </Link>
      </Section>
      {accounts}
    </SettingsPage>
  );
}
