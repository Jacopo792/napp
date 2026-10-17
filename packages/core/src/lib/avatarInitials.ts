/** The letters that stand in for a face nobody has uploaded. The web's Avatar
 *  and the phone's read this one rule. */
export function avatarInitials(name: string, email = ""): string {
  const source = name.trim() || email.split("@")[0]?.replace(/[._-]+/g, " ") || "";
  const words = source.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  /* One name, one letter, as Contacts draws it. Two letters of one word —
     "PR" for Preview — is an abbreviation, not a monogram. */
  if (words.length === 1) return words[0][0].toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
