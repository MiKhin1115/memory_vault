export async function handler(event) {
  const json = (statusCode, payload) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  console.log('function invoked');

  try {
    if (event.httpMethod !== 'POST') {
      console.log('wrong method:', event.httpMethod);
      return json(405, { error: 'Method not allowed' });
    }

    const tokenUrl = process.env.KBZPAY_TOKEN_URL;
    const clientId = process.env.KBZPAY_CLIENT_ID;
    const clientSecret = process.env.KBZPAY_CLIENT_SECRET;
    const addPhotoUrl = process.env.APPCUBE_ADD_PHOTO_URL;

    console.log('env check', {
      hasTokenUrl: !!tokenUrl,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasAddPhotoUrl: !!addPhotoUrl,
    });

    const requestBody = JSON.parse(event.body || '{}');
    const { guestName, message, photoId, base64String } = requestBody || {};

    console.log('request parsed', {
      hasPhotoId: !!photoId,
      hasBase64: !!base64String,
      base64Length: typeof base64String === 'string' ? base64String.length : 0,
    });

    console.log('starting token request');

    const tokenForm = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    });

    const tokenResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: tokenForm.toString(),
    });

    console.log('token response received', tokenResponse.status);

    const tokenText = await tokenResponse.text();
    const tokenData = tokenText ? JSON.parse(tokenText) : {};

    if (!tokenResponse.ok) {
      console.log('token error body', tokenData);
      return json(tokenResponse.status, {
        stage: 'token-response',
        error: tokenData?.error_description || tokenData?.error || 'Token request failed',
        tokenData,
      });
    }

    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      console.log('missing access token');
      return json(500, {
        stage: 'token-missing',
        error: 'No access_token returned',
      });
    }

    console.log('starting upload request');

    const uploadResponse = await fetch(addPhotoUrl, {
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

    console.log('upload response received', uploadResponse.status);

    const uploadText = await uploadResponse.text();
    console.log('upload response text length', uploadText.length);

    return json(uploadResponse.status, {
      stage: 'upload-response',
      ok: uploadResponse.ok,
      raw: uploadText,
    });
  } catch (error) {
    console.log('function error', error);
    return json(500, {
      stage: 'unknown',
      error: error instanceof Error ? error.message : 'Unknown server error',
    });
  }
}
