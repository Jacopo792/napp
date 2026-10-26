import { AccountDeletionForm } from "@/components/AccountDeletionForm";

/** Public entry point for the Google Play deletion URL. No app installation,
 * existing browser session or archive membership is required. */
export default function AccountDeletion() {
  return (
    <main className="account-deletion-page">
      <h1>Delete your Napp account</h1>
      <AccountDeletionForm />
    </main>
  );
}
