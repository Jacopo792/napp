const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
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
 *
 * A `Blob`, not a `File`: nothing here reads a name or a modified date, and
 * the wallpaper arrives from IndexedDB rather than from a file input.
 */
export async function prepareImageForNote(file: Blob): Promise<Blob> {
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
   gained by carrying more than a 512px edge — and the square is cropped rather
   than squashed, which is what every face expects. Where that square sits is
   the photographer's business, not the centre of the file: a portrait taken in
   landscape has its face nowhere near the middle. */
const AVATAR_EDGE = 512;
const MAX_AVATAR_BYTES = 1.5 * 1024 * 1024;

/** A square in the source image's own pixels. */
export interface AvatarCrop {
  x: number;
  y: number;
  edge: number;
}

/**
 * Turns what the cropper is showing into the square to cut.
 *
 * The viewport is a square of `viewport` px. The image is first scaled to
 * cover it, then multiplied by `zoom` and shifted by `offsetX` / `offsetY`,
 * which are viewport pixels — exactly what the preview does with a CSS
 * transform. This reverses that, and clamps the result inside the image so a
 * drag that outruns an edge cuts a square that still exists.
 */
export function avatarCropRect(view: {
  imageWidth: number;
  imageHeight: number;
  viewport: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
}): AvatarCrop {
  const { imageWidth, imageHeight, viewport, zoom, offsetX, offsetY } = view;
  const scale = (viewport / Math.min(imageWidth, imageHeight)) * zoom;
  const edge = Math.min(viewport / scale, imageWidth, imageHeight);
  const x = imageWidth / 2 - edge / 2 - offsetX / scale;
  const y = imageHeight / 2 - edge / 2 - offsetY / scale;
  return {
    x: Math.min(Math.max(x, 0), imageWidth - edge),
    y: Math.min(Math.max(y, 0), imageHeight - edge),
    edge,
  };
}

/** How far the picture may be dragged before the viewport would show nothing:
 *  half of whatever the scaled image has over the square. */
export function avatarDragBound(view: {
  imageSide: number;
  imageShortSide: number;
  viewport: number;
  zoom: number;
}): number {
  const scale = (view.viewport / view.imageShortSide) * view.zoom;
  return Math.max(0, (view.imageSide * scale - view.viewport) / 2);
}

export async function prepareAvatar(file: File, crop?: AvatarCrop): Promise<Blob> {
  if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image");
  }
  if (file.size > MAX_SOURCE_BYTES) {
    throw new Error("Image is too large (20 MB maximum)");
  }

  const bitmap = await createImageBitmap(file);
  try {
    const edge = Math.round(crop?.edge ?? Math.min(bitmap.width, bitmap.height));
    const sourceX = Math.round(crop?.x ?? (bitmap.width - edge) / 2);
    const sourceY = Math.round(crop?.y ?? (bitmap.height - edge) / 2);
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
