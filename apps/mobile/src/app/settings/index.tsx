import { Link } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { useArchive } from "../../archive";
import { Group, Row } from "../../Grouped";
import { attempt, SettingsPage } from "../../SettingsControls";

export default function Settings() {
  const { session, profile, signOut } = useArchive();
  const items: { section: string; label: string; icon: SFSymbol }[] = [
    { section: "archives", label: "Archives", icon: "square.stack.3d.up" },
    { section: "members", label: "Members", icon: "person.2" },
    { section: "appearance", label: "Appearance", icon: "paintpalette" },
    { section: "reading", label: "Reading", icon: "textformat.size" },
    { section: "writing", label: "Writing", icon: "pencil" },
    { section: "security", label: "Privacy", icon: "hand.raised" },
  ];
  return (
    <SettingsPage title="Settings">
      <Group>
        <Link href={{ pathname: "/settings/[section]", params: { section: "profile" } }} asChild>
          <Row
            icon="person.crop.circle"
            label={profile?.nickname || "Profile"}
            detail={session.email}
            last
          />
        </Link>
      </Group>
      <Group>
        {items.map((item, at) => (
          <Link
            key={item.section}
            href={{ pathname: "/settings/[section]", params: { section: item.section } }}
            asChild
          >
            <Row icon={item.icon} label={item.label} last={at === items.length - 1} />
          </Link>
        ))}
      </Group>
      <Group>
        <Row
          icon="rectangle.portrait.and.arrow.right"
          label="Sign Out"
          chevron={false}
          destructive
          last
          onPress={() => void attempt(signOut)}
        />
      </Group>
    </SettingsPage>
  );
}
