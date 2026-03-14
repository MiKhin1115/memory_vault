function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { stage: 'method', error: 'Method not allowed' });
    }

    const tokenUrl = process.env.KBZPAY_TOKEN_URL;
    const clientId = process.env.KBZPAY_CLIENT_ID;
    const clientSecret = process.env.KBZPAY_CLIENT_SECRET;
    const addPhotoUrl = process.env.APPCUBE_ADD_PHOTO_URL;

    if (!tokenUrl || !clientId || !clientSecret || !addPhotoUrl) {
      return json(500, {
        stage: 'config',
        error: 'Missing required server environment variables',
        hasTokenUrl: Boolean(tokenUrl),
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        hasAddPhotoUrl: Boolean(addPhotoUrl),
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

    const tokenForm = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });

    let tokenResponse;
    let tokenText = '';

    try {
      tokenResponse = await fetchWithTimeout(
        tokenUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: tokenForm.toString(),
        },
        8000,
      );

      tokenText = await tokenResponse.text();
    } catch (error) {
      return json(500, {
        stage: 'token-fetch',
        error: error instanceof Error ? error.message : 'Token fetch failed',
      });
    }

    let tokenData = {};
    try {
      tokenData = tokenText ? JSON.parse(tokenText) : {};
    } catch {
      return json(500, {
        stage: 'token-parse',
        error: 'Token response was not valid JSON',
        raw: tokenText,
      });
    }

    if (!tokenResponse.ok) {
      return json(tokenResponse.status, {
        stage: 'token-response',
        error:
          tokenData?.error_description ||
          tokenData?.error ||
          'Token endpoint returned error',
        tokenData,
      });
    }

    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      return json(500, {
        stage: 'token-missing',
        error: 'No access_token returned',
        tokenData,
      });
    }

    let uploadResponse;
    let uploadText = '';

    try {
      uploadResponse = await fetchWithTimeout(
        addPhotoUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'access-token': accessToken,
          },
          body: JSON.stringify({
            guestName: guestName?.trim() || 'Guest',
            message: message?.trim() || '',
            photoId: photoId.trim(),
            base64String,
          }),
        },
        8000,
      );

      uploadText = await uploadResponse.text();
    } catch (error) {
      return json(500, {
        stage: 'upload-fetch',
        error: error instanceof Error ? error.message : 'Upload fetch failed',
      });
    }

    let uploadData = null;
    try {
      uploadData = uploadText ? JSON.parse(uploadText) : null;
    } catch {
      uploadData = { raw: uploadText };
    }

    return json(uploadResponse.status, {
      stage: 'upload-response',
      ok: uploadResponse.ok,
      upstreamStatus: uploadResponse.status,
      upstreamBody: uploadData,
    });
  } catch (error) {
    return json(500, {
      stage: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}
