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
 * Downscales local images before their bytes are uploaded.
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

/* An avatar is a small square. The bucket accepts two megabytes and the
   picture is drawn at 40px in a row and 72px on the profile, so nothing is
   gained by carrying more than a 512px edge — and the square is cropped from
   the middle rather than squashed, which is what every face expects. */
const AVATAR_EDGE = 512;
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

export async function prepareAvatar(file: File): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is too large (20 MB maximum)");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const edge = Math.min(bitmap.width, bitmap.height);
    const sourceX = Math.round((bitmap.width - edge) / 2);
    const sourceY = Math.round((bitmap.height - edge) / 2);
    const size = Math.min(AVATAR_EDGE, edge);

    let quality = 0.9;
    for (let attempt = 0; attempt < 6; attempt++) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Image processing is unavailable");
      context.drawImage(bitmap, sourceX, sourceY, edge, edge, 0, 0, size, size);

      const blob = await canvasToBlob(canvas, quality);
      if (blob.size <= MAX_AVATAR_BYTES) return blob;
      quality -= 0.12;
    }
  } finally {
    bitmap.close();
  }

  throw new Error("Picture could not be reduced far enough");
}

export function imageAltFromFilename(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[\\\]]/g, "")
      .trim() || "Image"
  );
}
