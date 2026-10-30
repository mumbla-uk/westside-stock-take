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
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const REST_KEY = process.env.ONESIGNAL_REST_KEY || process.env.VITE_ONESIGNAL_REST_KEY;
  if (!REST_KEY) {
    console.error("Missing ONESIGNAL_REST_KEY in environment variables.");
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing REST API Key' }) };
  }

  try {
    const payload = JSON.parse(event.body);

    const response = await fetch('https://onesignal.com/api/v1/notifications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${REST_KEY}`
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
      body: JSON.stringify({ error: err.message })
    };
  }
};