try {
  console.log('Forwarding to AppCube:', endpoint);
  console.log('Has token:', Boolean(accessToken));
  console.log('Photo ID:', photoId);
  console.log('Base64 length:', base64String.length);

  const upstreamResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'access-token': accessToken,
    },
    body: JSON.stringify({
      guestName,
      message,
      photoId,
      base64String,
    }),
  });

  const rawText = await upstreamResponse.text();

  console.log('AppCube status:', upstreamResponse.status);
  console.log('AppCube response:', rawText);

  res
    .status(upstreamResponse.status)
    .type('application/json')
    .send(rawText || '{}');
} catch (error) {
  console.error('Local /api/add-photo error:', error);
  res.status(502).json({
    error: error instanceof Error ? error.message : 'Unable to reach AppCube.',
  });
}