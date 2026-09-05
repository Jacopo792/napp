export function pasteMediaDecision(input: {
  html: string;
  text: string;
  fileCount: number;
  hasNativeClipboard: boolean;
}): { handle: boolean; readNative: boolean } {
  const htmlHasImage = /<img\b/i.test(input.html);
  const readNative =
    input.hasNativeClipboard &&
    input.fileCount === 0 &&
    (htmlHasImage || (!input.html && !input.text));
  return {
    handle: htmlHasImage || input.fileCount > 0 || readNative,
    readNative,
  };
}
