export async function handler(event) {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  try {
    if (event.httpMethod !== 'POST') {
      return json(405, { error: 'Method not allowed' });
    }

    const tokenUrl = process.env.KBZPAY_TOKEN_URL;
    const clientId = process.env.KBZPAY_CLIENT_ID;
    const clientSecret = process.env.KBZPAY_CLIENT_SECRET;
    const addPhotoUrl = process.env.APPCUBE_ADD_PHOTO_URL;

    if (!tokenUrl || !clientId || !clientSecret || !addPhotoUrl) {
      return json(500, {
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
      return json(400, { error: 'Invalid JSON body' });
    }

    const { guestName, message, photoId, base64String } = requestBody || {};

    if (!photoId || typeof photoId !== 'string' || !photoId.trim()) {
      return json(400, { error: 'photoId is required' });
    }

    if (!base64String || typeof base64String !== 'string' || !base64String.trim()) {
      return json(400, { error: 'base64String is required' });
    }

    // Step 1: get token
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
        error: 'No access_token in token response',
        tokenData,
      });
    }

    // Step 2: upload photo
    let uploadResponse;
    let uploadText = '';

    try {
      uploadResponse = await fetch(addPhotoUrl, {
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
      });

      uploadText = await uploadResponse.text();
    } catch (error) {
      return json(500, {
        stage: 'upload-fetch',
        error: error instanceof Error ? error.message : 'Upload request failed',
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