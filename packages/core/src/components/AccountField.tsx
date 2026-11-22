import type { InputHTMLAttributes } from "react";

export function AccountField({
  label,
  ...input
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="account-field">
      <span>{label}</span>
      <input {...input} />
    </label>
  );
}
