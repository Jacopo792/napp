import { useState } from "react";
import { AuthCaptcha } from "@/components/AuthCaptcha";

const sitekey = import.meta.env.VITE_AUTH_CAPTCHA_SITE_KEY?.trim();

export function useAuthCaptcha() {
  const [token, setToken] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  return {
    token,
    ready: !sitekey || Boolean(token),
    reset() {
      if (!sitekey) return;
      setToken(undefined);
      setAttempt((previous) => previous + 1);
    },
    widget: sitekey ? <AuthCaptcha key={attempt} sitekey={sitekey} onToken={setToken} /> : null,
  };
}
