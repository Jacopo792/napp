/* The app, and nothing about where it is running.
 *
 * Two routes and no search-param API, so the route tree is written out rather
 * than generated: the file-based generator wanted a plugin in every shell's
 * bundler config, all writing the same `routeTree.gen.ts`, which is a conflict
 * waiting for the second shell. What the generator did earn was code
 * splitting, and `lazyRouteComponent` keeps it — the sign-in page must not
 * download ProseMirror, which is the whole of why `session.ts` is careful
 * about what it imports. The built chunks are the proof, not this comment.
 *
 * A shell supplies the history and nothing else. The browser gets the real one
 * and a basepath; the desktop window gets a hash history, because there is no
 * server under it to answer a deep path. */
import { StrictMode, useState } from "react";
import {
  createHashHistory,
  createRoute,
  createRouter,
  lazyRouteComponent,
  RouterProvider,
} from "@tanstack/react-router";
import { rootRoute } from "./screens/Root";
import { initAxes } from "./lib/axes";
import { initAppearance } from "./lib/appearance";
import { initWritingPreferences } from "./lib/writingPreferences";

/* Before React, as they always have been: these write CSS custom properties on
   the document element, and a first paint that happens first is a flash of the
   wrong palette. */
initAppearance();
initAxes();
initWritingPreferences();

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: lazyRouteComponent(() => import("./screens/Login")),
});

const notesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/notes",
  component: lazyRouteComponent(() => import("./screens/Notes")),
});

const routeTree = rootRoute.addChildren([loginRoute, notesRoute]);

/** Which history a shell wants, rather than which history object — so a shell
 *  never imports the router, and the routing stays one thing in one package. */
export type HistoryKind = "browser" | "hash";

function createAppRouter({ history, basepath }: AppProps) {
  return createRouter({
    routeTree,
    basepath,
    history: history === "hash" ? createHashHistory() : undefined,
  });
}

interface AppProps {
  /** "hash" for a window with no server under it. Defaults to the browser's
   *  own history. */
  history?: HistoryKind;
  basepath?: string;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}

/** The whole interface. A shell mounts this and owns nothing else.
 *
 *  The router is built once and kept: it holds the history, and rebuilding it
 *  on a re-render would throw away where the reader is. */
export function App({ history, basepath }: AppProps) {
  const [router] = useState(() => createAppRouter({ history, basepath }));
  return (
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>
  );
}
