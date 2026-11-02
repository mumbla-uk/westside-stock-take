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

  let rawKey =
    process.env.ONESIGNAL_REST_KEY ||
    process.env.VITE_ONESIGNAL_REST_KEY ||
    process.env.ONESIGNAL_API_KEY ||
    '';

  const cleanKey = rawKey.replace(/^["']|["']$/g, '').trim();

  if (!cleanKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Missing ONESIGNAL_REST_KEY in Netlify environment variables' })
    };
  }

  try {
    const rawPayload = JSON.parse(event.body || '{}');

    // Use your real App ID
    const payload = {
      app_id: '93cb91c7-7f6c-4f75-a66b-40a5fb5375f9',
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

    const authHeader = cleanKey.startsWith('os_v2_')
      ? `Key ${cleanKey}`
      : (cleanKey.toLowerCase().startsWith('basic ') || cleanKey.toLowerCase().startsWith('key '))
        ? cleanKey
        : `Basic ${cleanKey}`;

    let response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    let resData = await response.json();

    if (response.status === 403 && !cleanKey.startsWith('os_v2_')) {
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

    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resData)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};