/* Which sections of Settings an archive of each kind shows — beside the list
   rather than in it, because a file of components exports nothing else. */
import { SETTINGS_SECTIONS } from "@/components/settingsSections";
import type { ArchiveKind } from "@/lib/spaceShape";

type SectionItem = (typeof SETTINGS_SECTIONS)[number]["items"][number] & {
  only?: ArchiveKind;
  documentKeywords?: string;
  adminOnly?: boolean;
};

/** The groups and sections an archive of this kind shows, with the words
 *  that find each one there. */
export function settingsSectionsFor(kind: ArchiveKind, usageAdministrator = false) {
  return SETTINGS_SECTIONS.map((group) => ({
    group: (kind === "document" && "documentGroup" in group && group.documentGroup) || group.group,
    items: (group.items as readonly SectionItem[])
      .filter(
        (item) => (!item.only || item.only === kind) && (!item.adminOnly || usageAdministrator),
      )
      .map((item) => ({
        ...item,
        keywords: (kind === "document" && item.documentKeywords) || item.keywords,
      })),
  }));
}
