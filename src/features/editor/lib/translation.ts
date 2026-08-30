export type TranslationLanguage = "it" | "fr" | "en";

interface DetectorResult {
  detectedLanguage: string;
  confidence: number;
}

interface Detector {
  detect(text: string): Promise<DetectorResult[]>;
  destroy?: () => void;
}

interface TranslatorSession {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}

interface TranslationApi {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<TranslatorSession>;
}

interface DetectorApi {
  availability(): Promise<string>;
  create(): Promise<Detector>;
}

function browserApis(): { Translator?: TranslationApi; LanguageDetector?: DetectorApi } {
  return window as unknown as { Translator?: TranslationApi; LanguageDetector?: DetectorApi };
}

/** The language of a passage, as a bare subtag: `it`, not `it-IT`.
 *
 *  Its own function because the proofreader needs the same answer, and asking
 *  twice in two places is how the two would drift apart. */
export async function detectLanguage(text: string): Promise<string> {
  const { LanguageDetector } = browserApis();
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

export async function translateText(
  text: string,
  targetLanguage: TranslationLanguage,
  onDownload?: (progress: number) => void,
): Promise<string> {
  const { Translator } = browserApis();
  if (!Translator) {
    throw new Error("Translation is available in Chrome 138 or newer on desktop");
  }

  const sourceLanguage = await detectLanguage(text);
  if (sourceLanguage === targetLanguage)
    throw new Error("The selection is already in this language");

  const availability = await Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === "unavailable") throw new Error("This language pair is not available");

  const translator = await Translator.create({
    sourceLanguage,
    targetLanguage,
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => {
        const progress = event as Event & { loaded?: number };
        onDownload?.(Math.round((progress.loaded ?? 0) * 100));
      });
    },
  });
  const translated = await translator.translate(text);
  translator.destroy?.();
  return translated;
}
