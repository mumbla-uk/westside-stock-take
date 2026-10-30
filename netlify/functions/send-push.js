exports.handler = async (event) => {
  // Handle CORS
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

  // Check possible env variable names
  const REST_KEY = 
    process.env.ONESIGNAL_REST_KEY || 
    process.env.VITE_ONESIGNAL_REST_KEY || 
    process.env.ONESIGNAL_API_KEY;

  if (!REST_KEY) {
    console.error('[Netlify Function] Missing ONESIGNAL_REST_KEY in environment variables.');
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'Server configuration error: Missing ONESIGNAL_REST_KEY' })
    };
  }

  try {
    const payload = JSON.parse(event.body);

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${REST_KEY.trim()}`
      },
      body: JSON.stringify(payload)
    });

    const resData = await response.json();
    console.log('[Netlify Function] OneSignal API response:', response.status, resData);

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(resData)
    };
  } catch (err) {
    console.error('[Netlify Function] Exception:', err);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: err.message })
    };
  }
};