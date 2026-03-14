let cachedToken = null;

export async function handler(event) {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  try {
    if (event.httpMethod !== 'POST') {
      return json(405, {
        stage: 'validate-request',
        error: 'Method not allowed',
      });
    }

    const tokenUrl = process.env.KBZPAY_TOKEN_URL;
    const clientId = process.env.KBZPAY_CLIENT_ID;
    const clientSecret = process.env.KBZPAY_CLIENT_SECRET;
    const addPhotoUrl = process.env.APPCUBE_ADD_PHOTO_URL;

    if (!tokenUrl || !clientId || !clientSecret || !addPhotoUrl) {
      return json(500, {
        stage: 'unknown',
        error: 'Missing required server environment variables',
      });
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch {
      return json(400, {
        stage: 'validate-request',
        error: 'Invalid JSON body',
      });
    }

    const { guestName, message, photoId, base64String } = requestBody || {};

    if (!photoId || typeof photoId !== 'string' || !photoId.trim()) {
      return json(400, {
        stage: 'validate-request',
        error: 'photoId is required',
      });
    }

    if (!base64String || typeof base64String !== 'string' || !base64String.trim()) {
      return json(400, {
        stage: 'validate-request',
        error: 'base64String is required',
      });
    }

    const accessTokenResult = await getAccessToken({
      clientId,
      clientSecret,
      json,
      tokenUrl,
    });

    if ('statusCode' in accessTokenResult) {
      return accessTokenResult;
    }

    let uploadResponse;
    let uploadText = '';

    try {
      uploadResponse = await fetch(addPhotoUrl, {
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
      return json(500, {
        stage: 'upload-fetch',
        error: error instanceof Error ? error.message : 'Upload request failed',
      });
    }

    const uploadBody = parseJson(uploadText);

    if (uploadBody === INVALID_JSON) {
      return json(500, {
        stage: 'upload-response',
        error: 'Upload response was not valid JSON',
        upstreamStatus: uploadResponse.status,
      });
    }

    if (!uploadResponse.ok) {
      return json(uploadResponse.status, {
        stage: 'upload-response',
        error: extractErrorMessage(uploadBody, 'AppCube add_photo request failed'),
        upstreamStatus: uploadResponse.status,
        upstreamBody: uploadBody,
      });
    }

    return json(uploadResponse.status, uploadBody ?? {});
  } catch (error) {
    return json(500, {
      stage: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}

async function getAccessToken({ clientId, clientSecret, json, tokenUrl }) {
  if (cachedToken && cachedToken.expiresAt > Date.now()) {
    return { accessToken: cachedToken.accessToken };
  }

  const tokenForm = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials',
  });

  let tokenResponse;
  let tokenText = '';

  try {
    tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenForm.toString(),
    });

    tokenText = await tokenResponse.text();
  } catch (error) {
    return json(500, {
      stage: 'token-fetch',
      error: error instanceof Error ? error.message : 'Token request failed',
    });
  }

  const tokenData = parseJson(tokenText);

  if (tokenData === INVALID_JSON) {
    return json(500, {
      stage: 'token-parse',
      error: 'Token response was not valid JSON',
    });
  }

  if (!tokenResponse.ok) {
    return json(tokenResponse.status, {
      stage: 'token-response',
      error: extractErrorMessage(tokenData, 'Token endpoint returned error'),
      upstreamStatus: tokenResponse.status,
      upstreamBody: tokenData,
    });
  }

  const accessToken =
    tokenData && typeof tokenData.access_token === 'string' ? tokenData.access_token.trim() : '';
  const expiresIn =
    tokenData && typeof tokenData.expires_in !== 'undefined' ? Number(tokenData.expires_in) : 0;

  if (!accessToken) {
    return json(500, {
      stage: 'token-missing',
      error: 'No access_token in token response',
    });
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
