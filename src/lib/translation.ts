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

export async function translateText(
  text: string,
  targetLanguage: TranslationLanguage,
  onDownload?: (progress: number) => void,
): Promise<string> {
  const { Translator, LanguageDetector } = browserApis();
  if (!Translator || !LanguageDetector) {
    throw new Error("Translation is available in Chrome 138 or newer on desktop");
  }

  const detectorAvailability = await LanguageDetector.availability();
  if (detectorAvailability === "unavailable") {
    throw new Error("Language detection is not available in this browser");
  }

  const detector = await LanguageDetector.create();
  const [best] = await detector.detect(text);
  detector.destroy?.();
  const sourceLanguage = best?.detectedLanguage?.split("-")[0];
  if (!sourceLanguage) throw new Error("Could not detect the language of the selection");
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
