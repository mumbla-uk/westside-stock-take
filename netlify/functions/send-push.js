exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      },
      body: ''
    };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  const REST_KEY = 
    process.env.ONESIGNAL_REST_KEY || 
    process.env.VITE_ONESIGNAL_REST_KEY || 
    process.env.ONESIGNAL_API_KEY;

  if (!REST_KEY) {
    console.error('[send-push] Missing ONESIGNAL_REST_KEY in Netlify environment variables');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Missing ONESIGNAL_REST_KEY on server' })
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

    const authHeader = REST_KEY.trim().startsWith('os_v2_')
      ? `Key ${REST_KEY.trim()}`
      : `Basic ${REST_KEY.trim()}`;

    const response = await fetch('https://api.onesignal.com/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(resData)
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};