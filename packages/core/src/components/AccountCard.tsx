import type { ReactNode } from "react";
import logoUrl from "../assets/napp-logo.png";
import "./accountDeletion.css";

/** The account pages outside the app: the mark, a title and one card. */
export function AccountCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="account-deletion-page">
      <section className="account-card">
        <img className="account-card-logo" src={logoUrl} alt="Napp" />
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}
