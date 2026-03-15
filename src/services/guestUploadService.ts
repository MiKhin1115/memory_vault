import { compressImage } from '../utils/compressImage';
import { fileToBase64 } from '../utils/fileToBase64';

export type GuestUploadResult = {
  photoId: string;
  status: number;
  data: unknown;
};

export type UploadProgress = {
  completedFiles: number;
  currentFileIndex: number;
  currentFileName: string;
  duplicateCount: number;
  progress: number;
  stage: 'preparing' | 'uploading' | 'retrying' | 'success';
  totalFiles: number;
};

type ProgressCallback = (progress: UploadProgress) => void;

type GuestUploadPayload = {
  guestName?: string;
  message?: string;
  photoId: string;
  base64String: string;
};

type UploadServiceError = Error & {
  isNetworkError?: boolean;
  responseStatus?: number;
};

const UPLOAD_ENDPOINT = '/api/add-photo';

export const MAX_PHOTOS_PER_SUBMISSION = 12;
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const MAX_RETRY_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [1000, 2000, 4000];
const ALLOWED_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'heic']);
const ALLOWED_MIME_TYPES = new Set([
  'image/jpg',
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
]);

export async function uploadSingleGuestPhoto(
  file: File,
  guestName?: string,
  message?: string,
  onProgress?: ProgressCallback,
): Promise<GuestUploadResult> {
  const [result] = await uploadPreparedFiles([file], guestName, message, onProgress);
  return result;
}

export function uploadMultipleGuestPhotos(
  files: File[],
  guestName?: string,
  message?: string,
  onProgress?: ProgressCallback,
): Promise<GuestUploadResult[]> {
  return uploadPreparedFiles(files, guestName, message, onProgress);
}

export function validateGuestPhotoFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!ALLOWED_EXTENSIONS.has(extension) && !ALLOWED_MIME_TYPES.has(file.type)) {
    return 'Please upload JPG, JPEG, PNG, or HEIC photos only.';
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return 'This photo is too large. Please choose a smaller image.';
  }

  return null;
}

async function uploadPreparedFiles(
  files: File[],
  guestName?: string,
  message?: string,
  onProgress?: ProgressCallback,
) {
  if (files.length === 0) {
    return [];
  }

  if (files.length > MAX_PHOTOS_PER_SUBMISSION) {
    throw new Error(`You can upload up to ${MAX_PHOTOS_PER_SUBMISSION} photos at a time.`);
  }

  const results: GuestUploadResult[] = [];
  const seenHashes = new Set<string>();
  let duplicateCount = 0;

  for (const [index, file] of files.entries()) {
    const validationError = validateGuestPhotoFile(file);

    if (validationError) {
      throw new Error(validationError);
    }

    onProgress?.({
      completedFiles: results.length,
      currentFileIndex: index,
      currentFileName: file.name,
      duplicateCount,
      progress: 0,
      stage: 'preparing',
      totalFiles: files.length,
    });

    const compressedBlob = await compressImage(file);
    const uploadFile = createUploadFile(file, compressedBlob);
    const base64String = await fileToBase64(uploadFile);
    const imageHash = await hashBase64(base64String);

    if (seenHashes.has(imageHash)) {
      duplicateCount += 1;
      onProgress?.({
        completedFiles: results.length,
        currentFileIndex: index,
        currentFileName: file.name,
        duplicateCount,
        progress: 100,
        stage: 'success',
        totalFiles: files.length,
      });
      continue;
    }

    seenHashes.add(imageHash);

    const payload: GuestUploadPayload = {
      guestName: guestName?.trim() || '',
      message: message?.trim() || '',
      photoId: createPhotoId(),
      base64String,
    };

    const result = await uploadWithRetry(payload, {
      currentFileIndex: index,
      currentFileName: file.name,
      duplicateCount,
      onProgress,
      totalFiles: files.length,
      uploadedCount: results.length,
    });

    results.push(result);
  }

  return results;
}

function createPhotoId() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `P${Date.now()}${suffix}`;
}

function parseResponseBody(rawText: string, status: number) {
  if (!rawText) {
    return null;
  }

  const trimmedText = rawText.trim();

  try {
    return JSON.parse(trimmedText) as unknown;
  } catch {
    if (looksLikeHtml(trimmedText)) {
      return { error: `Upload service returned an unexpected HTML response (status ${status}).` };
    }

    return { error: trimmedText };
  }
}

function looksLikeHtml(value: string) {
  return /<!doctype html>|<html[\s>]|<body[\s>]/i.test(value);
}

async function uploadWithRetry(
  payload: GuestUploadPayload,
  options: {
    currentFileIndex: number;
    currentFileName: string;
    duplicateCount: number;
    onProgress?: ProgressCallback;
    totalFiles: number;
    uploadedCount: number;
  },
) {
  let lastError: UploadServiceError | null = null;

  for (let attempt = 1; attempt <= MAX_RETRY_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      options.onProgress?.({
        completedFiles: options.uploadedCount,
        currentFileIndex: options.currentFileIndex,
        currentFileName: options.currentFileName,
        duplicateCount: options.duplicateCount,
        progress: 0,
        stage: 'retrying',
        totalFiles: options.totalFiles,
      });

      await delay(RETRY_DELAYS_MS[attempt - 2] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }

    try {
      return await sendUploadRequest(payload, options);
    } catch (error) {
      const normalizedError = normalizeUploadError(error);

      if (!shouldRetryUpload(normalizedError) || attempt === MAX_RETRY_ATTEMPTS) {
        throw normalizedError;
      }

      lastError = normalizedError;
    }
  }

  throw lastError ?? createUploadError('The server is busy. Please try again.');
}

function sendUploadRequest(
  payload: GuestUploadPayload,
  options: {
    currentFileIndex: number;
    currentFileName: string;
    duplicateCount: number;
    onProgress?: ProgressCallback;
    totalFiles: number;
    uploadedCount: number;
  },
) {
  return new Promise<GuestUploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();

    xhr.open('POST', UPLOAD_ENDPOINT);
    xhr.responseType = 'text';
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.setRequestHeader('Accept', 'application/json');

    xhr.upload.onprogress = (event) => {
      const progress = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : 0;

      options.onProgress?.({
        completedFiles: options.uploadedCount,
        currentFileIndex: options.currentFileIndex,
        currentFileName: options.currentFileName,
        duplicateCount: options.duplicateCount,
        progress,
        stage: 'uploading',
        totalFiles: options.totalFiles,
      });
    };

    xhr.onerror = () => {
      reject(createUploadError('Upload failed. Please check your connection.', { isNetworkError: true }));
    };

    xhr.onabort = () => {
      reject(createUploadError('Upload was cancelled.', { isNetworkError: true }));
    };

    xhr.onload = () => {
      const parsedBody = parseResponseBody(xhr.responseText || '', xhr.status);

      if (xhr.status >= 200 && xhr.status < 300) {
        options.onProgress?.({
          completedFiles: options.uploadedCount + 1,
          currentFileIndex: options.currentFileIndex,
          currentFileName: options.currentFileName,
          duplicateCount: options.duplicateCount,
          progress: 100,
          stage: 'success',
          totalFiles: options.totalFiles,
        });

        resolve({
          photoId: payload.photoId,
          status: xhr.status,
          data: parsedBody,
        });
        return;
      }

      reject(
        createUploadError(
          extractErrorMessage(parsedBody, `Photo upload failed with status ${xhr.status}.`, xhr.status),
          { responseStatus: xhr.status },
        ),
      );
    };

    try {
      xhr.send(JSON.stringify(payload));
    } catch (error) {
      reject(
        createUploadError(
          error instanceof Error
            ? `Unable to reach the upload service: ${error.message}`
            : 'Unable to reach the upload service.',
          { isNetworkError: true },
        ),
      );
    }
  });
}

function extractErrorMessage(payload: unknown, fallback: string, status?: number) {
  if (payload && typeof payload === 'object') {
    const maybeError = payload as Record<string, unknown>;

    const candidates = [
      maybeError.stage && maybeError.error
        ? `${String(maybeError.stage)}: ${String(maybeError.error)}`
        : undefined,
      maybeError.error,
      maybeError.errorMessage,
      maybeError.message,
      maybeError.detail,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return humanizeError(candidate, status);
      }
    }
  }

  return humanizeError(fallback, status);
}

function humanizeError(message: string, status?: number) {
  const normalizedMessage = message.toLowerCase();

  if (normalizedMessage.includes('network') || normalizedMessage.includes('connection')) {
    return 'Upload failed. Please check your connection.';
  }

  if (normalizedMessage.includes('too large') || normalizedMessage.includes('size')) {
    return 'This photo is too large. Please choose a smaller image.';
  }

  if (status && status >= 500) {
    return 'The server is busy. Please try again.';
  }

  if (normalizedMessage.includes('html response')) {
    return 'The server returned an unexpected response. Please try again.';
  }

  return message;
}

function normalizeUploadError(error: unknown) {
  if (error instanceof Error) {
    return error as UploadServiceError;
  }

  return createUploadError('The server is busy. Please try again.');
}

function shouldRetryUpload(error: UploadServiceError) {
  if (error.isNetworkError) {
    return true;
  }

  if (typeof error.responseStatus === 'number') {
    return error.responseStatus >= 500;
  }

  return false;
}

function createUploadError(
  message: string,
  metadata: { isNetworkError?: boolean; responseStatus?: number } = {},
) {
  const error = new Error(message) as UploadServiceError;
  error.isNetworkError = metadata.isNetworkError;
  error.responseStatus = metadata.responseStatus;
  return error;
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function createUploadFile(originalFile: File, blob: Blob) {
  if (blob === originalFile) {
    return originalFile;
  }

  const nextName = originalFile.name.replace(/\.(png|jpe?g|heic|heif)$/i, '.jpg');
  return new File([blob], nextName, { type: 'image/jpeg' });
}

async function hashBase64(base64String: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(base64String));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}
