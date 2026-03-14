export async function handler(event) {
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Method not allowed' }),
      };
    }

    const tokenUrl = process.env.KBZPAY_TOKEN_URL;
    const clientId = process.env.KBZPAY_CLIENT_ID;
    const clientSecret = process.env.KBZPAY_CLIENT_SECRET;
    const addPhotoUrl = process.env.APPCUBE_ADD_PHOTO_URL;

    if (!tokenUrl || !clientId || !clientSecret || !addPhotoUrl) {
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Missing required server environment variables',
        }),
      };
    }

    let requestBody;
    try {
      requestBody = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'Invalid JSON body' }),
      };
    }

    const { guestName, message, photoId, base64String } = requestBody || {};

    if (!photoId || typeof photoId !== 'string' || !photoId.trim()) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'photoId is required' }),
      };
    }

    if (!base64String || typeof base64String !== 'string' || !base64String.trim()) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ error: 'base64String is required' }),
      };
    }

    // Step 1: get fresh OAuth token
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

    const tokenText = await tokenResponse.text();

    let tokenData = {};
    try {
      tokenData = tokenText ? JSON.parse(tokenText) : {};
    } catch {
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'Invalid token response',
          raw: tokenText,
        }),
      };
    }

    if (!tokenResponse.ok) {
      return {
        statusCode: tokenResponse.status,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error:
            tokenData?.error_description ||
            tokenData?.error ||
            'Token request failed',
          tokenResponse: tokenData,
        }),
      };
    }

    const accessToken = tokenData?.access_token;

    if (!accessToken) {
      return {
        statusCode: 502,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          error: 'No access_token found in token response',
          tokenResponse: tokenData,
        }),
      };
    }

    // Step 2: call add_photo API with fresh token
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

    const uploadText = await uploadResponse.text();

    return {
      statusCode: uploadResponse.status,
      headers: {
        'Content-Type': 'application/json',
      },
      body:
        uploadText ||
        JSON.stringify({
          success: uploadResponse.ok,
        }),
    };
  } catch (error) {
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown server error',
      }),
    };
  }
}