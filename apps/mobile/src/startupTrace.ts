/** Opt-in startup timings. No account, token or note contents are recorded. */
export const startupTrace = __DEV__ && process.env.EXPO_PUBLIC_NAPP_TRACE === "1";
const started = Date.now();
const entries: { t: number; gap: number; line: string }[] = [];
let reducedMotion: boolean | undefined;

export function setStartupReducedMotion(value: boolean): void {
  reducedMotion = value;
}

export function traceStartup(stage: string): void {
  if (!startupTrace) return;
  const t = Date.now() - started;
  const gap = t - (entries.at(-1)?.t ?? 0);
  const line = `${t} (+${gap}) ${stage} r=${reducedMotion}`;
  entries.push({ t, gap, line });
  console.info(`[Napp startup] ${line}`);
}

export function startupLines(): string[] {
  const slow = entries
    .slice(0, -10)
    .filter((entry) => entry.gap >= 300)
    .slice(0, 6);
  return [
    ...slow.map((entry) => `SLOW ${entry.line}`),
    ...entries.slice(-10).map((entry) => entry.line),
  ];
}
