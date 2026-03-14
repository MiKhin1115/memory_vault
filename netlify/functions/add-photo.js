export async function handler(event) {
  try {
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: "Method not allowed" }),
      };
    }

    const apiUrl = process.env.APPCUBE_ADD_PHOTO_URL;
    const accessToken = process.env.APPCUBE_ACCESS_TOKEN;

    if (!apiUrl) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing APPCUBE_ADD_PHOTO_URL" }),
      };
    }

    if (!accessToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing APPCUBE_ACCESS_TOKEN" }),
      };
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch (parseError) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON body" }),
      };
    }

    const { guestName, message, photoId, base64String } = body;

    if (!photoId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "photoId is required" }),
      };
    }

    if (!base64String) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "base64String is required" }),
      };
    }

    const upstreamResponse = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
         "access-token": accessToken,
      },
      body: JSON.stringify({
        guestName: guestName || "Guest",
        message: message || "",
        photoId,
        base64String,
      }),
    });

    const text = await upstreamResponse.text();

    return {
      statusCode: upstreamResponse.status,
      headers: {
        "Content-Type": "application/json",
         "access-token": accessToken,
      },
      body: text || JSON.stringify({ success: upstreamResponse.ok }),
    };
  } catch (error) {
    console.error("Netlify function add-photo error:", error);

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown server error",
      }),
    };
  }
}