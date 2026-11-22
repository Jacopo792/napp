import { AccountCard } from "@/components/AccountCard";
import "@/components/accountDeletion.css";
export default function AuthLinkResult({ result }: { result: { title: string; text: string } }) {
  return (
    <AccountCard title={result.title}>
      <div className="account-deletion">
        <p role="status">{result.text}</p>
        <button
          type="button"
          className="account-card-primary"
          onClick={() => window.location.replace(window.location.pathname + window.location.search)}
        >
          Continue to Napp
        </button>
      </div>
    </AccountCard>
  );
}
