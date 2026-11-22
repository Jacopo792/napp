import { AccountCard } from "@/components/AccountCard";
import { AccountDeletionForm } from "@/components/AccountDeletionForm";

/** Public entry point for the Google Play deletion URL. No app installation,
 * existing browser session or archive membership is required. */
export default function AccountDeletion() {
  return (
    <AccountCard title="Delete your account">
      <AccountDeletionForm />
    </AccountCard>
  );
}
