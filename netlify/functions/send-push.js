exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  // 1. Retrieve and sanitize the key
  let rawKey =
    process.env.ONESIGNAL_REST_KEY ||
    process.env.VITE_ONESIGNAL_REST_KEY ||
    process.env.ONESIGNAL_API_KEY ||
    '';

  // Strip leading/trailing quotes or spaces that often get copied into Netlify env vars
  const cleanKey = rawKey.replace(/^["']|["']$/g, '').trim();

  if (!cleanKey) {
    console.error('[send-push] ERROR: No OneSignal REST API key found in environment.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing ONESIGNAL_REST_KEY in Netlify environment variables' })
    };
  }

  try {
    const rawPayload = JSON.parse(event.body || '{}');

    const payload = {
      app_id: rawPayload.app_id || 'c34b17e4-c5a4-49c5-8ee8-ef0736e65a6e',
      headings: rawPayload.headings,
      contents: rawPayload.contents,
      data: rawPayload.data || {}
    };

    if (rawPayload.include_aliases?.external_id?.length > 0) {
      payload.include_aliases = rawPayload.include_aliases;
      payload.target_channel = 'push';
    } else {
      payload.included_segments = ['Subscribed Users'];
    }

    // Determine authorization header format:
    // v2 keys start with 'os_v2_app_' and require 'Key '
    // Legacy keys require 'Basic ' or 'Key '
    const authHeader = cleanKey.startsWith('os_v2_')
      ? `Key ${cleanKey}`
      : (cleanKey.toLowerCase().startsWith('basic ') || cleanKey.toLowerCase().startsWith('key '))
        ? cleanKey
        : `Basic ${cleanKey}`;

    console.log('[send-push] Sending to OneSignal using auth prefix:', authHeader.slice(0, 10) + '...');

    let response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    let resData = await response.json();

    // If 'Basic' was rejected with 403, retry once with 'Key ' format
    if (response.status === 403 && !cleanKey.startsWith('os_v2_')) {
      console.log('[send-push] Retrying with "Key" header format...');
      const retryResponse = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Key ${cleanKey}`
        },
        body: JSON.stringify(payload)
      });
      if (retryResponse.ok) {
        response = retryResponse;
        resData = await retryResponse.json();
      }
    }

    console.log('[send-push] OneSignal Response (HTTP ' + response.status + '):', JSON.stringify(resData));

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resData)
    };
  } catch (err) {
    console.error('[send-push] Error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};