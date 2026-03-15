import path from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';
import express from 'express';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = Number(process.env.PORT || 3001);
const KBZPAY_TOKEN_URL = process.env.KBZPAY_TOKEN_URL;
const KBZPAY_CLIENT_ID = process.env.KBZPAY_CLIENT_ID;
const KBZPAY_CLIENT_SECRET = process.env.KBZPAY_CLIENT_SECRET;
const APPCUBE_ADD_PHOTO_URL = process.env.APPCUBE_ADD_PHOTO_URL;
const distPath = path.resolve(__dirname, '..', 'dist');
const indexPath = path.join(distPath, 'index.html');

let cachedToken = null;

app.use(express.json({ limit: '25mb' }));
app.use(express.static(distPath));

app.get('/api/health', (_request, response) => {
  response.json({ ok: true });
});

app.post('/api/add-photo', async (request, response) => {
  try {
    const { guestName, message, photoId, base64String } = request.body || {};

    if (!photoId || typeof photoId !== 'string' || !photoId.trim()) {
      response.status(400).json({
        stage: 'validate-request',
        error: 'photoId is required',
      });
      return;
    }

    if (!base64String || typeof base64String !== 'string' || !base64String.trim()) {
      response.status(400).json({
        stage: 'validate-request',
        error: 'base64String is required',
      });
      return;
    }

    const accessTokenResult = await getAccessToken();

    if ('statusCode' in accessTokenResult) {
      response.status(accessTokenResult.statusCode).json(accessTokenResult.payload);
      return;
    }

    let uploadResponse;
    let uploadText = '';

    try {
      uploadResponse = await fetch(APPCUBE_ADD_PHOTO_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access-token': accessTokenResult.accessToken,
        },
        body: JSON.stringify({
          guestName: typeof guestName === 'string' ? guestName.trim() : '',
          message: typeof message === 'string' ? message.trim() : '',
          photoId: photoId.trim(),
          base64String,
        }),
      });

      uploadText = await uploadResponse.text();
    } catch (error) {
      response.status(500).json({
        stage: 'upload-fetch',
        error: error instanceof Error ? error.message : 'Upload request failed',
      });
      return;
    }

    const uploadBody = parseJson(uploadText);

    if (uploadBody === INVALID_JSON) {
      response.status(500).json({
        stage: 'upload-response',
        error: 'Upload response was not valid JSON',
        upstreamStatus: uploadResponse.status,
      });
      return;
    }

    if (!uploadResponse.ok) {
      response.status(uploadResponse.status).json({
        stage: 'upload-response',
        error: extractErrorMessage(uploadBody, 'AppCube add_photo request failed'),
        upstreamStatus: uploadResponse.status,
        upstreamBody: uploadBody,
      });
      return;
    }

    response.status(uploadResponse.status).json(uploadBody ?? {});
  } catch (error) {
    response.status(500).json({
      stage: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
});

app.get('*', (_request, response) => {
  response.sendFile(indexPath);
});

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return { accessToken: cachedToken.accessToken };
  }

  if (!KBZPAY_TOKEN_URL || !KBZPAY_CLIENT_ID || !KBZPAY_CLIENT_SECRET || !APPCUBE_ADD_PHOTO_URL) {
    return {
      statusCode: 500,
      payload: {
        stage: 'unknown',
        error: 'Missing required server environment variables',
      },
    };
  }

  const tokenForm = new URLSearchParams({
    client_id: KBZPAY_CLIENT_ID,
    client_secret: KBZPAY_CLIENT_SECRET,
    grant_type: 'client_credentials',
  });

  let tokenResponse;
  let tokenText = '';

  try {
    tokenResponse = await fetch(KBZPAY_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenForm.toString(),
    });

    tokenText = await tokenResponse.text();
  } catch (error) {
    return {
      statusCode: 500,
      payload: {
        stage: 'token-fetch',
        error: error instanceof Error ? error.message : 'Token request failed',
      },
    };
  }

  const tokenData = parseJson(tokenText);

  if (tokenData === INVALID_JSON) {
    return {
      statusCode: 500,
      payload: {
        stage: 'token-response',
        error: 'Token response was not valid JSON',
      },
    };
  }

  if (!tokenResponse.ok) {
    return {
      statusCode: tokenResponse.status,
      payload: {
        stage: 'token-response',
        error: extractErrorMessage(tokenData, 'Token endpoint returned error'),
        upstreamStatus: tokenResponse.status,
        upstreamBody: tokenData,
      },
    };
  }

  const accessToken =
    tokenData && typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : '';
  const expiresIn =
    tokenData && typeof tokenData.expires_in !== 'undefined' ? Number(tokenData.expires_in) : 0;

  if (!accessToken) {
    return {
      statusCode: 500,
      payload: {
        stage: 'token-missing',
        error: 'No access_token in token response',
      },
    };
  }

  cachedToken = {
    accessToken,
    expiresAt: Date.now() + Math.max((Number.isFinite(expiresIn) ? expiresIn : 300) - 60, 30) * 1000,
  };

  return { accessToken };
}

const INVALID_JSON = Symbol('invalid-json');

function parseJson(rawText) {
  if (!rawText) {
    return null;
  }

  try {
    return JSON.parse(rawText);
  } catch {
    return INVALID_JSON;
  }
}

function extractErrorMessage(payload, fallback) {
  if (payload && payload !== INVALID_JSON && typeof payload === 'object') {
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
