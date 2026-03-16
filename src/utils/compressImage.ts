export async function compressImage(
  file: File,
  maxWidth = 1600,
  quality = 0.75
): Promise<File> {
  const imageBitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxWidth / imageBitmap.width);
  const width = Math.round(imageBitmap.width * scale);
  const height = Math.round(imageBitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create canvas context.");
  }

  ctx.drawImage(imageBitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", quality);
  });

  if (!blob) {
    throw new Error("Image compression failed.");
  }

  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}