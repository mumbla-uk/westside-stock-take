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

  const REST_KEY = 
    process.env.ONESIGNAL_REST_KEY || 
    process.env.VITE_ONESIGNAL_REST_KEY || 
    process.env.ONESIGNAL_API_KEY;

  if (!REST_KEY) {
    console.error('[send-push] ERROR: ONESIGNAL_REST_KEY is not set in Netlify Environment Variables.');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing ONESIGNAL_REST_KEY in Netlify environment' })
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

    // Audience targeting
    if (rawPayload.include_aliases?.external_id?.length > 0) {
      payload.include_aliases = rawPayload.include_aliases;
      payload.target_channel = 'push';
    } else {
      payload.included_segments = ['Subscribed Users'];
    }

    // Support both new v2 key format (os_v2_app_...) and legacy UUID keys
    const trimmedKey = REST_KEY.trim();
    const authHeader = trimmedKey.startsWith('os_v2_')
      ? `Key ${trimmedKey}`
      : `Basic ${trimmedKey}`;

    console.log('[send-push] Sending to OneSignal with payload:', JSON.stringify(payload));

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();
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
    console.error('[send-push] Handler Exception:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};