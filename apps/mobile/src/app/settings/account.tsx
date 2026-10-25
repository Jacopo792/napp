/* Everything about the account, behind the profile card: the account's title
 * page, then one card for you and one for the accounts on this phone. */
import { useState } from "react";
import { useArchive } from "../../archive";
import { useAccountCards } from "../../Accounts";
import { ProfileHero } from "../../ProfilePhoto";
import { attempt, Line, Section, SettingsPage, ZoomLink } from "../../SettingsControls";
import { useTextPrompt } from "../../TextPrompt";

export default function Account() {
  const { profile, updateProfile } = useArchive();
  const prompt = useTextPrompt();
  const [busy, setBusy] = useState(false);
  const accounts = useAccountCards();
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
      </Section>
      {accounts}
      <Section>
        <ZoomLink href="/settings/delete-account">
          <Line icon="trash" label="Delete Account" tone="danger" opens />
        </ZoomLink>
      </Section>
    </SettingsPage>
  );
}
