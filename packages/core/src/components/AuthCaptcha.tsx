import { useEffect, useRef, useState } from "react";

type Widget = {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  remove(id: string): void;
};

const provider = import.meta.env.VITE_AUTH_CAPTCHA_PROVIDER?.trim() || "turnstile";
const source =
  provider === "hcaptcha"
    ? "https://js.hcaptcha.com/1/api.js?render=explicit"
    : "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
const hosts = window as Window & {
  hcaptcha?: Widget;
  turnstile?: Widget;
  nappCaptchaReady?: () => void;
};
let loading: Promise<Widget> | undefined;

function loadWidget() {
  loading ??= new Promise<Widget>((resolve, reject) => {
    if (provider !== "hcaptcha" && provider !== "turnstile") {
      reject(new Error("Invalid CAPTCHA provider"));
      return;
    }
    const script = document.createElement("script");
    const fail = () => {
      window.clearTimeout(timeout);
      delete hosts.nappCaptchaReady;
      script.remove();
      loading = undefined;
      reject(new Error("Could not load the security check"));
    };
    const timeout = window.setTimeout(fail, 15_000);
    hosts.nappCaptchaReady = () => {
      window.clearTimeout(timeout);
      delete hosts.nappCaptchaReady;
      const widget = provider === "hcaptcha" ? hosts.hcaptcha : hosts.turnstile;
      if (widget) resolve(widget);
      else fail();
    };
    script.src = source + "&onload=nappCaptchaReady";
    script.async = true;
    script.onerror = fail;
    document.head.append(script);
  });
  return loading;
}

export function AuthCaptcha({
  sitekey,
  onToken,
}: {
  sitekey: string;
  onToken: (token?: string) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    let remove: (() => void) | undefined;
    const fail = () => {
      if (!live) return;
      onToken();
      setFailed(true);
    };
    void loadWidget()
      .then((widget) => {
        if (!live || !host.current) return;
        const id = widget.render(host.current, {
          sitekey,
          callback: (token: string) => live && onToken(token),
          "expired-callback": () => live && onToken(),
          "error-callback": fail,
        });
        remove = () => widget.remove(id);
      })
      .catch(fail);
    return () => {
      live = false;
      remove?.();
    };
  }, [attempt, onToken, sitekey]);
  return (
    <div>
      <div ref={host} />
      {failed && (
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((previous) => previous + 1);
          }}
        >
          Retry security check
        </button>
      )}
    </div>
  );
}
