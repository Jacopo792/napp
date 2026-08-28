const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_EDGE = 2560;

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not process image"))),
      "image/webp",
      quality,
    );
  });
}

/**
 * Downscales local images before their bytes are encrypted and uploaded.
 */
export async function prepareImageForNote(file: File): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is too large (20 MB maximum)");
  }

  const bitmap = await createImageBitmap(file);
  try {
    let scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    let quality = 0.86;

    for (let attempt = 0; attempt < 8; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable");
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_OUTPUT_BYTES) return blob;

      if (quality > 0.58) quality -= 0.09;
      else scale *= 0.82;
    }
  } finally {
    bitmap.close();
  }

  throw new Error("Image could not be reduced below 4 MB");
}

export function imageAltFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[\\\]]/g, "")
      .trim() || "Image"
  );
}
