/* Which sections of Settings an archive of each kind shows — beside the list
   rather than in it, because a file of components exports nothing else. */
import { SETTINGS_SECTIONS } from "@/components/settingsSections";
import type { ArchiveKind } from "@/lib/spaceShape";

type SectionItem = (typeof SETTINGS_SECTIONS)[number]["items"][number] & {
  only?: ArchiveKind;
  documentKeywords?: string;
};

/** The groups and sections an archive of this kind shows, with the words
 *  that find each one there. */
export function settingsSectionsFor(kind: ArchiveKind) {
  return SETTINGS_SECTIONS.map((group) => ({
    group: group.group,
    items: (group.items as readonly SectionItem[])
      .filter((item) => !item.only || item.only === kind)
      .map((item) => ({
        ...item,
        keywords: (kind === "document" && item.documentKeywords) || item.keywords,
      })),
  }));
}
