import cors from 'cors';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const app = express();
app.set('trust proxy', 1);

const PORT = Number(process.env.PORT || 3001);
const KBZPAY_TOKEN_URL = process.env.KBZPAY_TOKEN_URL;
const KBZPAY_CLIENT_ID = process.env.KBZPAY_CLIENT_ID;
const KBZPAY_CLIENT_SECRET = process.env.KBZPAY_CLIENT_SECRET;
const APPCUBE_ADD_PHOTO_URL = process.env.APPCUBE_ADD_PHOTO_URL;
const MAX_PAYLOAD_BYTES = 25 * 1024 * 1024;
const MAX_UPLOADS_PER_MINUTE = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const ALLOWED_BASE64_PREFIX = /^data:image\/(jpeg|jpg|png|heic|heif);base64,/i;

const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://localhost:8888',
  'https://weddingmemory.netlify.app',
]);

let cachedToken = null;
const uploadRateLimits = new Map();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed: ${origin}`));
    },
  }),
);

app.use((request, _response, next) => {
  request.requestId = crypto.randomUUID();
  next();
});

app.use(
  express.json({
    limit: '25mb',
    verify(request, _response, buffer) {
      request.rawBodySize = buffer.length;
    },
  }),
);

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/add-photo', rateLimitUploads, async (request, response) => {
  try {
    const validationError = validateAddPhotoRequest(request);

    if (validationError) {
      logFailure(request, 'validate-request', validationError.details);
      response.status(400).json(validationError);
      return;
    }

    const accessToken = await getAccessToken();
    const uploadResult = await sendPhotoToAppCube(request.body, accessToken);

    response.status(uploadResult.status).json(uploadResult.body);
  } catch (error) {
    const normalizedError = normalizeError(error);
    logFailure(request, normalizedError.stage, normalizedError);
    response.status(normalizedError.statusCode).json({
      stage: normalizedError.stage,
      error: normalizedError.error,
      ...(normalizedError.details ? { details: normalizedError.details } : {}),
    });
  }
});

app.use((error, request, response, _next) => {
  const normalizedError = normalizeError(error);
  logFailure(request, normalizedError.stage, normalizedError);
  response.status(normalizedError.statusCode).json({
    stage: normalizedError.stage,
    error: normalizedError.error,
    ...(normalizedError.details ? { details: normalizedError.details } : {}),
  });
});

app.listen(PORT, () => {
  console.log(`Wedding memory proxy listening on port ${PORT}`);
});

function validateAddPhotoRequest(request) {
  if ((request.rawBodySize ?? 0) > MAX_PAYLOAD_BYTES) {
    return {
      stage: 'validate-request',
      error: 'Payload is too large',
    };
  }

  const photoId = typeof request.body?.photoId === 'string' ? request.body.photoId.trim() : '';
  const base64String =
    typeof request.body?.base64String === 'string' ? request.body.base64String.trim() : '';

  if (!photoId) {
    return {
      stage: 'validate-request',
      error: 'photoId is required',
      details: { field: 'photoId' },
    };
  }

  if (!base64String) {
    return {
      stage: 'validate-request',
      error: 'base64String is required',
      details: { field: 'base64String' },
    };
  }

  if (!ALLOWED_BASE64_PREFIX.test(base64String)) {
    return {
      stage: 'validate-request',
      error: 'base64String must be a valid image data URI',
      details: { field: 'base64String' },
    };
  }

  if (Buffer.byteLength(base64String, 'utf8') > MAX_PAYLOAD_BYTES) {
    return {
      stage: 'validate-request',
      error: 'Payload is too large',
      details: { field: 'base64String' },
    };
  }

  return null;
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return cachedToken.accessToken;
  }

  ensureRequiredEnv();

  const tokenForm = new URLSearchParams({
    client_id: KBZPAY_CLIENT_ID,
    client_secret: KBZPAY_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  let tokenResponse;
  try {
    tokenResponse = await fetch(KBZPAY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenForm.toString(),
    });
  } catch (error) {
    throw createProxyError('token-fetch', 502, 'Failed to reach KBZPay token endpoint', {
      cause: getErrorMessage(error),
    });
  }

  const tokenPayload = await parseJsonResponse(tokenResponse, 'token-response');

  if (!tokenResponse.ok) {
    throw createProxyError(
      'token-response',
      tokenResponse.status,
      extractUpstreamError(tokenPayload, 'KBZPay token request failed'),
      { upstreamStatus: tokenResponse.status },
    );
  }

  if (!tokenPayload || typeof tokenPayload !== 'object') {
    throw createProxyError('token-response', 502, 'Token response was not valid JSON');
  }

  const accessToken =
    typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token.trim() : '';
  const expiresIn = normalizeExpiresIn(tokenPayload.expires_in);

  if (!accessToken) {
    throw createProxyError('token-missing', 502, 'No access_token returned by KBZPay');
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + Math.max(expiresIn - 60, 30) * 1000,
  };

  return accessToken;
}

async function sendPhotoToAppCube(body, accessToken) {
  let uploadResponse;

  try {
    uploadResponse = await fetch(APPCUBE_ADD_PHOTO_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access-token': accessToken,
      },
      body: JSON.stringify({
        guestName: sanitizeOptionalText(body.guestName),
        message: sanitizeOptionalText(body.message),
        photoId: body.photoId.trim(),
        base64String: body.base64String,
      }),
    });
  } catch (error) {
    throw createProxyError('upload-fetch', 502, 'Failed to reach AppCube', {
      cause: getErrorMessage(error),
    });
  }

  const uploadBody = await parseJsonResponse(uploadResponse, 'upload-response');

  if (!uploadResponse.ok) {
    throw createProxyError(
      'upload-response',
      uploadResponse.status,
      extractUpstreamError(uploadBody, 'AppCube add_photo request failed'),
      { upstreamStatus: uploadResponse.status },
    );
  }

  return {
    status: uploadResponse.status,
    body: uploadBody,
  };
}

async function parseJsonResponse(response, stage) {
  const rawText = await response.text();

  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw createProxyError(stage, 502, 'Upstream response was not valid JSON', {
      upstreamStatus: response.status,
      cause: getErrorMessage(error),
    });
  }
}

function extractUpstreamError(payload, fallback) {
  if (payload && typeof payload === 'object') {
    const candidates = [
      payload.error_description,
      payload.error,
      payload.message,
      payload.detail,
    ];

    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim()) {
        return candidate;
      }
    }
  }

  return fallback;
}

function sanitizeOptionalText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeExpiresIn(value) {
  const parsedValue = Number(value);

  if (Number.isFinite(parsedValue) && parsedValue > 0) {
    return parsedValue;
  }

  return 300;
}

function ensureRequiredEnv() {
  const missingKeys = [
    ['KBZPAY_TOKEN_URL', KBZPAY_TOKEN_URL],
    ['KBZPAY_CLIENT_ID', KBZPAY_CLIENT_ID],
    ['KBZPAY_CLIENT_SECRET', KBZPAY_CLIENT_SECRET],
    ['APPCUBE_ADD_PHOTO_URL', APPCUBE_ADD_PHOTO_URL],
  ]
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missingKeys.length > 0) {
    throw createProxyError('token-response', 500, 'Missing required proxy environment variables', {
      missingKeys,
    });
  }
}

function createProxyError(stage, statusCode, error, details) {
  return {
    stage,
    statusCode,
    error,
    details,
  };
}

function normalizeError(error) {
  if (error?.type === 'entity.too.large') {
    return {
      stage: 'validate-request',
      statusCode: 413,
      error: 'Payload is too large',
    };
  }

  if (error instanceof Error && error.message.startsWith('Origin not allowed:')) {
    return {
      stage: 'validate-request',
      statusCode: 403,
      error: error.message,
    };
  }

  if (error && typeof error === 'object' && 'stage' in error && 'error' in error) {
    return {
      stage: typeof error.stage === 'string' ? error.stage : 'upload-response',
      statusCode: typeof error.statusCode === 'number' ? error.statusCode : 500,
      error: typeof error.error === 'string' ? error.error : 'Unexpected proxy error',
      details: 'details' in error ? error.details : undefined,
    };
  }

  return {
    stage: 'upload-response',
    statusCode: 500,
    error: getErrorMessage(error),
  };
}

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'Unknown server error';
}

function logFailure(request, stage, details) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId: request?.requestId,
      ip: request ? getClientIp(request) : undefined,
      stage,
      details,
    }),
  );
}

function rateLimitUploads(request, _response, next) {
  const now = Date.now();
  const ip = getClientIp(request);
  const recentRequests = (uploadRateLimits.get(ip) ?? []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS,
  );

  if (recentRequests.length >= MAX_UPLOADS_PER_MINUTE) {
    next(
      createProxyError('validate-request', 429, 'Too many uploads. Please wait a minute and try again.'),
    );
    return;
  }

  recentRequests.push(now);
  uploadRateLimits.set(ip, recentRequests);
  next();
}

function getClientIp(request) {
  const forwardedFor = request.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return request.ip || request.socket.remoteAddress || 'unknown';
}
