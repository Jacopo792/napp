/* eslint-disable react-refresh/only-export-components -- TanStack's root-route factory must
   reference the three local screen components; splitting this file only hides that dependency. */
import { createRootRoute, Link, Outlet, useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { initAxes } from "@/lib/axes";

export const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function Root() {
  useEffect(() => {
    initAxes();
  }, []);
  return <Outlet />;
}

/** Error states share the same calm, elevated surface as the unlock screen. */
function Notice({
  figure,
  title,
  detail,
  action,
}: {
  figure: string;
  title: string;
  detail: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="soft-pane pane-glass w-full max-w-[26rem] p-8">
        <p
          aria-hidden
          className="font-display text-ink"
          style={{
            fontSize: "clamp(3.5rem, 10vw, 5.5rem)",
            lineHeight: 0.9,
            letterSpacing: "-0.045em",
            fontWeight: 700,
          }}
        >
          {figure}
        </p>
        <p className="font-display mt-5 text-lg font-semibold text-ink">{title}</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">{detail}</p>
        <div className="mt-5">{action}</div>
      </div>
    </div>
  );
}

function NotFoundComponent() {
  return (
    <Notice
      figure="404"
      title="No such page"
      detail="That address does not belong to this app."
      action={
        <Link to="/" className="label inline-flex rounded-lg bg-accent px-3 py-2 text-on-accent">
          Back to unlock →
        </Link>
      }
    />
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <Notice
      figure="Err"
      title="Something broke"
      detail={error.message}
      action={
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="label rounded-lg bg-accent px-3 py-2 text-on-accent transition-opacity hover:opacity-90"
        >
          Try again →
        </button>
      }
    />
  );
}
