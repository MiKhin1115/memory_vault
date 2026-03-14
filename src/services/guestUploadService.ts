import { fileToBase64 } from '../utils/fileToBase64';

export type GuestUploadResult = {
  photoId: string;
  status: number;
  data: unknown;
};

type GuestUploadPayload = {
  guestName?: string;
  message?: string;
  photoId: string;
  base64String: string;
};

export async function uploadSingleGuestPhoto(
  file: File,
  guestName?: string,
  message?: string,
): Promise<GuestUploadResult> {
  const base64String = await fileToBase64(file);
  const payload: GuestUploadPayload = {
    guestName: guestName?.trim() || '',
    message: message?.trim() || '',
    photoId: createPhotoId(),
    base64String,
  };

  const response = await fetch('/api/add-photo', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const parsedBody = await parseResponseBody(response);

  if (!response.ok) {
    throw new Error(extractErrorMessage(parsedBody, response.statusText));
  }

  return {
    photoId: payload.photoId,
    status: response.status,
    data: parsedBody,
  };
}

export function uploadMultipleGuestPhotos(
  files: File[],
  guestName?: string,
  message?: string,
): Promise<GuestUploadResult[]> {
  return Promise.all(files.map((file) => uploadSingleGuestPhoto(file, guestName, message)));
}

function createPhotoId() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `P${Date.now()}${suffix}`;
}

async function parseResponseBody(response: Response) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText) as unknown;
  } catch {
    return {
      rawText,
      isNonJson: true
    }
  }
}

function extractErrorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string' && payload.trim()) {
    return payload;
  }

  if (payload && typeof payload === 'object') {
    const maybeError = payload as Record<string, unknown>;
    const candidates = [
      maybeError.error,
      maybeError.errorMessage,
      maybeError.message,
      maybeError.detail,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return fallback || 'Photo upload failed.';
}
