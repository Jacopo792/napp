# iPhone startup debug – 24 October 2026

## Reproduced cause

On the physical iPhone, the startup effect in `apps/mobile/src/app/_layout.tsx`
called `router.replace("/")` once the session appeared. The root and archive
provider repeatedly unmounted and restored the session again. Every cycle
started the launch exit and cancelled its cleanup timer before it could hide
the overlay. Reduce Motion was false. This contradicts the earlier hypothesis
that Reduce Motion alone explained the stuck launch.

Removing that startup redirect stopped the repeated mounts. Account changes
still return Home through the existing explicit path in `changeAccount`.
The timer fallback previously added to `Launch.tsx` remains, so hiding the
overlay does not depend exclusively on an animation callback.

## Verification

- Two full Debug launches on the physical iPhone reached Home. The overlay
  left at 1,573 ms and 4,398 ms after the trace module started, respectively.
  These timings exclude native startup and Metro bundle download. The second
  run spent 2,260 ms restoring auth; the previous 14-second wait was not
  reproduced, and network latency remains variable.
- Release build succeeded, was installed on the same iPhone and reached Home
  without the lock overlay or debug trace.
- Mobile TypeScript passed. ESLint on the changed startup files passed with
  two existing Fast Refresh warnings in `archive.tsx`. The 27 session and
  session-restore tests passed. `git diff --check` passed.

## Diagnostics

`apps/mobile/src/startupTrace.ts` provides typed, opt-in timing output with
`EXPO_PUBLIC_NAPP_TRACE=1` in development. It is disabled in Release. The
screen updater stops when the launch overlay is hidden. This replaces the
temporary untyped globals and malformed trace markup from the earlier debug.

The earlier Metro process used CI mode, which disabled reloads and kept serving
the older diagnosis. A fresh Metro instance was used to verify current files.
Build output: `/private/tmp/napp-startup-release-build.log`.
