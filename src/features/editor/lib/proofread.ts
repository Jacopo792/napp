import { detectLanguage } from "@/features/editor/lib/translation";

interface Correction {
  startIndex: number;
  endIndex: number;
  correction: string;
}

interface ProofreaderSession {
  proofread(text: string): Promise<{ correctedInput: string; corrections?: Correction[] }>;
  destroy?: () => void;
}

interface ProofreaderApi {
  availability(options: { expectedInputLanguages: string[] }): Promise<string>;
  create(options: {
    expectedInputLanguages: string[];
    monitor?: (monitor: EventTarget) => void;
  }): Promise<ProofreaderSession>;
}

function browserApi(): ProofreaderApi | undefined {
  return (window as unknown as { Proofreader?: ProofreaderApi }).Proofreader;
}

/* Whether the tool is offered at all. A per-browser choice rather than an
   archive setting: it changes what this window's toolbar draws, and nothing
   the other member can see. Presence is stored the same way. */
const KEY = "napp:proofreader";

export function loadProofreaderPreference(): boolean {
  try {
    /* Absent means on. The correction only ever runs from a deliberate click,
       so an untouched setting has nothing to interrupt. */
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function saveProofreaderPreference(enabled: boolean): void {
  try {
    localStorage.setItem(KEY, enabled ? "on" : "off");
  } catch {
    /* The tool stays offered when local preferences are unavailable. */
  }
}

/** Grammar, spelling and punctuation, corrected on this device.
 *
 *  The count is what the readout says afterwards: replacing the words without
 *  saying how many changed leaves the writer unable to tell a clean passage
 *  from one the model declined to touch. */
export async function proofreadText(
  text: string,
  onDownload?: (progress: number) => void,
): Promise<{ corrected: string; count: number }> {
  const Proofreader = browserApi();
  if (!Proofreader) {
    throw new Error("Proofreading is available in Chrome 141 or newer on desktop");
  }

  const language = await detectLanguage(text);
  const expectedInputLanguages = [language];
  if ((await Proofreader.availability({ expectedInputLanguages })) === "unavailable") {
    throw new Error(`Proofreading is not available for ${language}`);
  }

  const proofreader = await Proofreader.create({
    expectedInputLanguages,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progress = event as Event & { loaded?: number };
        onDownload?.(Math.round((progress.loaded ?? 0) * 100));
      });
    },
  });
  const result = await proofreader.proofread(text);
  proofreader.destroy?.();
  return { corrected: result.correctedInput, count: result.corrections?.length ?? 0 };
}
