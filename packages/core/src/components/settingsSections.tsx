/* The sections of Settings, and the words that find each one from the palette.
   One list, read by the panel's rail and by ⌘K, so a section that is added
   or renamed is found by the name it is shown under. `keywords` are the rows
   inside it — a reader looks for "wallpaper", not for "Appearance".

   A section can belong to one kind of archive (`only`), and can be found by
   other words in a document (`documentKeywords`), because Settings shows each
   kind the rows it has and nothing else. */
import {
  BookOpen,
  Chapters,
  Keyboard,
  Layers,
  Palette,
  ShieldCheck,
  Type,
  UserRound,
  Users,
} from "@/components/icons";

export const SETTINGS_SECTIONS = [
  {
    group: "Account",
    items: [
      {
        id: "profile",
        tone: "blue",
        name: "Profile",
        icon: <UserRound size={16} />,
        keywords: "nickname name avatar picture photo leave archive",
      },
      {
        id: "members",
        tone: "green",
        name: "Members",
        icon: <Users size={16} />,
        keywords: "seats invite invitation people partner",
      },
      {
        id: "spaces",
        tone: "indigo",
        name: "Archives",
        icon: <Layers size={16} />,
        keywords: "spaces archive switch new archive open",
      },
      {
        id: "security",
        tone: "slate",
        name: "Security",
        icon: <ShieldCheck size={16} />,
        keywords:
          "privacy sign out when idle lock roster presence collaborators keep archived notes private",
        documentKeywords: "privacy sign out when idle lock roster presence collaborators",
      },
    ],
  },
  {
    group: "Interface",
    items: [
      {
        id: "appearance",
        tone: "violet",
        name: "Appearance",
        icon: <Palette size={16} />,
        keywords:
          "theme dark light palette background image wallpaper blur darken contrast image fit",
        documentKeywords:
          "theme dark light palette background image wallpaper blur darken contrast image fit sheet page paper dark page colours ink",
      },
      {
        id: "style",
        tone: "pink",
        name: "Style",
        icon: <Layers size={16} />,
        keywords: "colour color tint folder colour highlight icon style material translucency",
        documentKeywords: "colour color tint highlight icon style material translucency",
      },
      {
        id: "reading",
        tone: "orange",
        name: "Reading",
        icon: <BookOpen size={16} />,
        keywords: "reading face preset font typeface size fine-tune",
        only: "notes",
      },
      {
        id: "document",
        tone: "orange",
        name: "Document",
        icon: <Chapters size={16} />,
        keywords:
          "document thesis book preset options numbering footnotes citations review word goal page setup paper size orientation margins font size line spacing indent",
        only: "document",
      },
      {
        id: "writing",
        tone: "teal",
        name: "Writing",
        icon: <Type size={16} />,
        keywords:
          "proofreading spelling correct as I type autocorrect words you kept live presence",
        documentKeywords:
          "proofreading spelling correct as I type autocorrect words you kept live presence focus typewriter statistics words today session",
      },
      {
        id: "shortcuts",
        tone: "gray",
        name: "Shortcuts",
        icon: <Keyboard size={16} />,
        keywords: "keyboard keys",
      },
    ],
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["items"][number]["id"];
