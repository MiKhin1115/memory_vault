const MAX_WIDTH = 1600;
const JPEG_QUALITY = 0.75;

export async function compressImage(file: File): Promise<Blob> {
  if (typeof window === 'undefined' || !file.type.startsWith('image/')) {
    return file;
  }

  try {
    const source = await loadImageSource(file);
    const { width, height } = fitWithinBounds(source.width, source.height, MAX_WIDTH);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      cleanupImageSource(source);
      return file;
    }

    context.drawImage(source, 0, 0, width, height);
    cleanupImageSource(source);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY);
    });

    return blob ?? file;
  } catch {
    return file;
  }
}

async function loadImageSource(file: File): Promise<HTMLImageElement | ImageBitmap> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, {
        imageOrientation: 'from-image',
      });
    } catch {
      return loadImageElement(file);
    }
  }

  return loadImageElement(file);
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  const imageUrl = URL.createObjectURL(file);

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(imageUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(imageUrl);
      reject(new Error('Unable to process image.'));
    };
    image.src = imageUrl;
  });
}

function cleanupImageSource(image: HTMLImageElement | ImageBitmap) {
  if ('close' in image && typeof image.close === 'function') {
    image.close();
  }
}

function fitWithinBounds(width: number, height: number, maxWidth: number) {
  if (width <= maxWidth) {
    return { width, height };
  }

  return {
    width: maxWidth,
    height: Math.round((height / width) * maxWidth),
  };
}
