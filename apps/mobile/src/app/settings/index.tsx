import { Link } from "expo-router";
import type { SFSymbol } from "expo-symbols";
import { useArchive } from "../../archive";
import { Group, Row } from "../../Grouped";
import { Avatar } from "../../Avatar";
import { attempt, SettingsPage } from "../../SettingsControls";

export default function Settings() {
  const { session, profile, signOut } = useArchive();
  /* System Settings' tiles, as the web's Settings rail draws them. */
  const items: { section: string; label: string; icon: SFSymbol; fill: string }[] = [
    { section: "archives", label: "Archives", icon: "square.stack.3d.up", fill: "#0a84ff" },
    { section: "members", label: "Members", icon: "person.2", fill: "#30d158" },
    { section: "appearance", label: "Appearance", icon: "paintpalette", fill: "#5e5ce6" },
    { section: "reading", label: "Reading", icon: "textformat.size", fill: "#ff9f0a" },
    { section: "writing", label: "Writing", icon: "pencil", fill: "#bf5af2" },
    { section: "security", label: "Privacy", icon: "hand.raised", fill: "#0a84ff" },
  ];
  return (
    <SettingsPage title="Settings">
      <Group>
        <Link href={{ pathname: "/settings/[section]", params: { section: "profile" } }} asChild>
          <Row
            leading={
              <Avatar
                face={{
                  userId: session.userId,
                  name: profile?.nickname ?? "",
                  avatarObject: profile?.avatarObject ?? null,
                }}
                email={session.email}
                size={54}
              />
            }
            label={profile?.nickname || "Profile"}
            note={session.email}
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
            <Row
              icon={item.icon}
              fill={item.fill}
              label={item.label}
              last={at === items.length - 1}
            />
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
