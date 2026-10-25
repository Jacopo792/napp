/* The sections of Settings, and the words that find each one from the palette.
   One list, read by the panel's rail and by ⌘K, so a section that is added
   or renamed is found by the name it is shown under. `keywords` are the rows
   inside it — a reader looks for "wallpaper", not for "Appearance".

   The phone's index, in the phone's words: you first, as a card; then how
   this computer looks and writes; then the archive you are in. The group
   called "This Mac" is named after the shell at the head of the rail
   (`deviceGroupName`) — "This PC" on Windows, "This Computer" in a tab. The
   computer keeps two rows the phone has no use for: Shortcuts, because a
   keyboard is the desktop's, and Document, because the book is.

   A section can belong to one kind of archive (`only`), and can be found by
   other words in a document (`documentKeywords`), because Settings shows each
   kind the rows it has and nothing else. */
import {
  Chapters,
  Eye,
  Keyboard,
  Layers,
  Palette,
  Pencil,
  UserRound,
  Users,
} from "@/components/icons";

export const SETTINGS_SECTIONS = [
  {
    /* Drawn as the card at the head of the rail, never as a row. */
    group: "Account",
    items: [
      {
        id: "profile",
        tone: "blue",
        name: "Profile",
        icon: <UserRound size={16} />,
        keywords: "account nickname name avatar picture photo leave archive sign out",
      },
    ],
  },
  {
    group: "This Mac",
    items: [
      {
        id: "appearance",
        tone: "violet",
        name: "Appearance",
        icon: <Palette size={16} />,
        keywords:
          "theme dark light automatic palette background image wallpaper blur darken contrast image fit colour color tint folder colour highlight icon style material translucency",
        documentKeywords:
          "theme dark light automatic palette background image wallpaper blur darken contrast image fit sheet page paper dark page colours ink colour color tint highlight icon style material translucency",
      },
      {
        id: "writing",
        tone: "teal",
        name: "Writing",
        icon: <Pencil size={16} />,
        keywords:
          "proofreading spelling correct as I type autocorrect words you kept live presence column width measure",
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
  {
    group: "Archive",
    items: [
      {
        id: "security",
        tone: "slate",
        name: "Privacy",
        icon: <Eye size={16} />,
        keywords:
          "privacy security sign out when idle lock roster presence online status collaborators keep archived notes private",
        documentKeywords:
          "privacy security sign out when idle lock roster presence online status collaborators",
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
        id: "document",
        tone: "orange",
        name: "Document",
        icon: <Chapters size={16} />,
        keywords:
          "document thesis book preset options numbering footnotes citations review word goal page setup paper size orientation margins font size line spacing indent references labels captions figure table cross-reference footnote numbers continuous reading face serif literata weight text",
        only: "document",
      },
    ],
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["items"][number]["id"];
