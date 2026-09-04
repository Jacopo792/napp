interface DetectorResult {
  detectedLanguage: string;
  confidence: number;
}

interface Detector {
  detect(text: string): Promise<DetectorResult[]>;
  destroy?: () => void;
}

interface DetectorApi {
  availability(): Promise<string>;
  create(): Promise<Detector>;
}

/** The language of a passage, as a bare subtag: `it`, not `it-IT`.
 *
 *  It lived beside the translator, which had the same question to ask. The
 *  translator is gone — three languages nobody chose, in a menu of its own,
 *  over an archive written in one — so the question comes home to the only
 *  thing that still asks it. */
async function detectLanguage(text: string): Promise<string> {
  const { LanguageDetector } = window as unknown as { LanguageDetector?: DetectorApi };
  if (!LanguageDetector || (await LanguageDetector.availability()) === "unavailable") {
    throw new Error("Language detection is not available in this browser");
  }

  const detector = await LanguageDetector.create();
  const [best] = await detector.detect(text);
  detector.destroy?.();
  const language = best?.detectedLanguage?.split("-")[0];
  if (!language) throw new Error("Could not detect the language of the selection");
  return language;
}

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
