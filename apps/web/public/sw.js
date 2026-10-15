/* The one thing this worker does: Android's share sheet opens `share?…` with
   what was shared in the query, and a query is sent to the server — GitHub
   Pages, which has no business logging somebody's notes. Answered here, the
   request never leaves the phone: it becomes the app's address with the same
   words in the fragment, which no server ever sees (see `lib/capture.ts`).
   Everything else goes to the network untouched; nothing is cached. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (
    event.request.mode !== "navigate" ||
    url.pathname !== new URL("share", self.registration.scope).pathname
  )
    return;
  event.respondWith(
    Response.redirect(
      new URL(`notes#capture?${url.searchParams}`, self.registration.scope).href,
      303,
    ),
  );
});
