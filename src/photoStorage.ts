const PHOTO_URL_PREFIX = "/user-images/";
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 700 * 1024;
const MAX_DIMENSION = 1600;

export interface OptimizedPhoto {
  blob: Blob;
  width: number;
  height: number;
  originalBytes: number;
}

export function isLocalPhotoReference(value: string | null | undefined): boolean {
  return Boolean(value?.startsWith(PHOTO_URL_PREFIX));
}

export function isEmbeddedPhoto(value: string | null | undefined): boolean {
  return /^data:image\//i.test(value ?? "");
}

function loadImage(file: File): Promise<{ source: CanvasImageSource; width: number; height: number; close: () => void }> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then((bitmap) => ({
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo format could not be opened. Try a JPG, PNG, or WebP image."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("The photo could not be prepared for saving.")),
      "image/webp",
      quality,
    );
  });
}

export async function optimizePhoto(file: File): Promise<OptimizedPhoto> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file such as JPG, PNG, or WebP.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("That photo is larger than 25 MB. Choose a smaller photo.");

  let loaded: Awaited<ReturnType<typeof loadImage>>;
  try {
    loaded = await loadImage(file);
  } catch (error) {
    throw error instanceof Error ? error : new Error("The selected photo could not be opened.");
  }

  try {
    if (!loaded.width || !loaded.height) throw new Error("The selected photo has no usable image data.");
    let scale = Math.min(1, MAX_DIMENSION / Math.max(loaded.width, loaded.height));
    let best: { blob: Blob; width: number; height: number } | null = null;

    for (let sizePass = 0; sizePass < 4; sizePass += 1) {
      const width = Math.max(1, Math.round(loaded.width * scale));
      const height = Math.max(1, Math.round(loaded.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("This browser could not prepare the photo.");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(loaded.source, 0, 0, width, height);

      for (const quality of [0.86, 0.76, 0.66, 0.56]) {
        const blob = await canvasBlob(canvas, quality);
        best = { blob, width, height };
        if (blob.size <= MAX_OUTPUT_BYTES) return { ...best, originalBytes: file.size };
      }
      scale *= 0.78;
    }

    if (!best) throw new Error("The photo could not be prepared for saving.");
    return { ...best, originalBytes: file.size };
  } finally {
    loaded.close();
  }
}

async function savePhotoBlob(blob: Blob): Promise<string> {
  const response = await fetch("/api/images/upload", {
    method: "POST",
    headers: { "Content-Type": blob.type || "application/octet-stream" },
    body: blob,
  });
  const payload = await response.json() as { url?: string; error?: string };
  if (!response.ok || !payload.url) throw new Error(payload.error || "The app could not save the photo in its user-images folder.");
  return payload.url;
}

export async function uploadLocalPhoto(file: File): Promise<{ reference: string; photo: OptimizedPhoto }> {
  const photo = await optimizePhoto(file);
  const reference = await savePhotoBlob(photo.blob);
  return { reference, photo };
}

export async function getLocalPhoto(reference: string): Promise<Blob | null> {
  if (!isLocalPhotoReference(reference)) return null;
  const response = await fetch(reference, { cache: "no-store" });
  return response.ok ? response.blob() : null;
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not include a photo in the backup."));
    reader.readAsDataURL(blob);
  });
}

export async function embeddedPhotoToLocalReference(dataUrl: string): Promise<string> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("A photo in the backup could not be read.");
  return savePhotoBlob(await response.blob());
}
