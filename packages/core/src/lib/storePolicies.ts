import { platform } from "@/platform";

export const POLICY_VERSION = "2026-10-24";
export const NAPP_CONTROLLER = "Jacopo Vincenzo Ansalone";
export const NAPP_SUPPORT_EMAIL = "ansalonejacpo@gmail.com";

export type PolicyKind = "privacy" | "terms" | "support";
export function policyUrl(kind: PolicyKind): string {
  const url = new URL(platform().webOrigin());
  url.searchParams.set("page", kind);
  return url.toString();
}
export function deletionUrl(): string {
  const url = new URL(platform().webOrigin());
  url.searchParams.set("action", "delete-account");
  return url.toString();
}

export const PRIVACY_SECTIONS = [
  {
    title: "Who is responsible",
    text: `Napp is operated by ${NAPP_CONTROLLER}. Contact ${NAPP_SUPPORT_EMAIL} about your data, privacy or the service.`,
  },
  {
    title: "Data Napp processes",
    text: "Napp processes your account email and authentication records; your display name and profile image; notes, documents, attachments and version history; comments and reactions; archive membership and invitations; preferences and the online presence you choose to share. Service infrastructure also processes network and technical information, such as IP addresses and operational logs, to deliver and secure the service.",
  },
  {
    title: "Why data is used",
    text: "Account and content data is used to provide the service you request: storing, synchronising and sharing your writing with the people you choose. The legal basis for account and content processing is performing the service contract. Security and diagnostic information is used on the basis of legitimate interests in protecting accounts, preventing abuse and investigating failures. Optional presence and appearance settings are controlled in the app. Napp does not include advertising or third-party advertising trackers.",
  },
  {
    title: "Who can access it",
    text: "Members of an archive can access its shared content according to the app's permissions. Napp uses Supabase for authentication, database, storage and realtime services, GitHub Pages for the website, and Render for the collaboration service. The Supabase project is configured in the eu-west-1 region (Ireland). The developer and infrastructure providers may access data where needed to operate, secure and support the service. Content is access-controlled but is not end-to-end encrypted.",
  },
  {
    title: "Reports and safety",
    text: "When you report content, Napp records the reason, any details you supply and a copy of the reported note or comment so the developer can review it. Reports are private and are processed to protect users and address misuse. Pending reports are kept until review; reviewed reports expire after ninety days, or earlier if the linked account or content is deleted. A confirmed content restriction may remain after its report expires. Blocking records the blocked account and display name until you unblock it or either account is deleted.",
  },
  {
    title: "How long it is kept",
    text: "Account and content data is kept while you use Napp, until you delete it or request account deletion. Account deletion removes your profile, comments and your notes, including their shared copies and version history. Documents created by other people are kept, including your edits and files needed by those documents. Random deletion receipts contain no account details after completion and expire after seven days. Operational logs and backup copies follow the infrastructure's retention schedules and are not active account records.",
  },
  {
    title: "Devices and exported copies",
    text: "Napp keeps session tokens and content caches on your devices so it can stay signed in and reopen notes. Account deletion clears the saved session and attempts to clear the account's content caches on the device making the request. It cannot remove files you or other people have already exported, screenshots or copies outside Napp. Other devices must reconnect before the service can enforce changed access.",
  },
  {
    title: "Your choices and rights",
    text: `You can edit your profile, control presence, leave shared archives and initiate account deletion from Settings or the external account-deletion page. Contact ${NAPP_SUPPORT_EMAIL} to request access, correction, export, restriction or deletion of your personal data, or to object to processing where applicable. You may complain to your local data-protection authority; in Italy this is the Garante per la protezione dei dati personali.`,
  },
];

export const TERMS_SECTIONS = [
  {
    title: "Your account and writing",
    text: "Keep your sign-in details private and use an email address you are entitled to use. You retain rights to your writing. You allow Napp to store, process and deliver your content as needed to provide the service and share it with the archive members you choose. Only upload material you have the right to use and share.",
  },
  {
    title: "Shared archives",
    text: "Sharing an archive gives its members access to the content and collaboration features provided by Napp. Check its membership before sharing sensitive material. Other members may edit, export or copy shared writing. Leaving an archive does not recall copies that other people have already received.",
  },
  {
    title: "Prohibited content and behaviour",
    text: "Do not use Napp for harassment, bullying, threats, hateful abuse, sexual exploitation, non-consensual intimate imagery, exploitation or sexualisation of minors, promotion of violence, illegal activity, malware or infringement of other people's rights. Do not impersonate another person, bypass access controls or use the service to send unwanted invitations or spam.",
  },
  {
    title: "Reports and moderation",
    text: `Report content or behaviour that violates these rules through the app's safety controls or contact ${NAPP_SUPPORT_EMAIL}. Reports are reviewed to determine appropriate action, which can include restricting access, removing content or suspending an account. Relevant reported content may be accessed as part of that review. Use reporting tools honestly; false or abusive reports are also misuse.`,
  },
  {
    title: "Deleting an account",
    text: "Deleting your account permanently removes your profile, comments, your notes and their attachments and history, including notes shared with other members. Documents created by other people stay, including your edits and files required by those documents. Export what you need before confirming. Files and copies outside Napp remain under the control of their recipients.",
  },
  {
    title: "Service and contact",
    text: `Features and availability can change as Napp is maintained. These terms do not limit rights that applicable consumer law gives you. Questions, assistance and notices can be sent to ${NAPP_SUPPORT_EMAIL}.`,
  },
];
