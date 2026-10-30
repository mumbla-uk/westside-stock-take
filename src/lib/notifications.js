import { supabase, DEFAULT_VENUE_ID } from './db';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || 'c34b17e4-c5a4-49c5-8ee8-ef0736e65a6e';
const ONESIGNAL_REST_API_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || '';

/**
 * Universal Push Notification Dispatcher
 * Directly calls OneSignal REST API while supporting Supabase and Netlify fallbacks.
 */
export async function sendPushNotification(arg1, arg2, arg3, arg4) {
  let title, message, targetUser, targetUsers, prefKey, excludeUser, dataPayload;

  if (typeof arg1 === 'object' && arg1 !== null) {
    title = arg1.title;
    message = arg1.message;
    targetUser = arg1.targetUser || null;
    targetUsers = arg1.targetUsers || [];
    prefKey = arg1.prefKey || null;
    excludeUser = arg1.excludeUser || null;
    dataPayload = arg1.dataPayload || {};
  } else {
    title = arg1;
    message = arg2;
    targetUser = arg3 || null;
    targetUsers = [];
    prefKey = null;
    excludeUser = null;
    dataPayload = arg4 || {};
  }

  if (!title || !message) {
    console.warn('[Push] Skipping: title and message are required.');
    return false;
  }

  try {
    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: title },
      contents: { en: message },
      data: {
        venue_id: DEFAULT_VENUE_ID,
        ...dataPayload
      }
    };

    // 1. Target single specific user (@mention or diary author)
    if (targetUser) {
      const cleanTarget = String(targetUser).replace('@', '').trim();
      if (excludeUser && cleanTarget.toLowerCase() === excludeUser.toLowerCase()) {
        return false;
      }
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.include_external_user_ids = [cleanTarget];
      payload.target_channel = 'push';
    } 
    // 2. Target list of specific users (e.g. commenters)
    else if (targetUsers && targetUsers.length > 0) {
      const cleanList = Array.from(new Set(
        targetUsers
          .map(u => String(u).replace('@', '').trim())
          .filter(u => !excludeUser || u.toLowerCase() !== excludeUser.toLowerCase())
      ));

      if (cleanList.length === 0) return false;

      payload.include_aliases = { external_id: cleanList };
      payload.include_external_user_ids = cleanList;
      payload.target_channel = 'push';
    } 
    // 3. Broadcast to all subscribed staff
    else {
      payload.included_segments = ['Subscribed Users'];
    }

    // Try direct OneSignal REST API call first if key is present
    if (ONESIGNAL_REST_API_KEY) {
      const directRes = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(payload)
      });

      if (directRes.ok) {
        return true;
      }
    }

    // Fallback: Netlify Serverless Function
    const netlifyRes = await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (netlifyRes && netlifyRes.ok) {
      return true;
    }

    // Fallback: Supabase Edge Function
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
    await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    }).catch(() => null);

    return true;
  } catch (err) {
    console.warn('[Push] Dispatch error:', err);
    return false;
  }
}

/**
 * Scans text for @mentions and triggers direct pushes
 */
export async function dispatchMentionsFromText(text, authorName, contextTitle, dataPayload = {}) {
  if (!text || !text.includes('@')) return;

  const matches = text.match(/@(\w+)/g) || [];
  const mentioned = Array.from(new Set(matches.map(m => m.replace('@', '').trim())));

  for (const target of mentioned) {
    if (authorName && target.toLowerCase() === authorName.toLowerCase()) continue;

    const snippet = text.length > 70 ? `${text.slice(0, 67)}...` : text;

    await sendPushNotification({
      title: `Mention from ${authorName}`,
      message: `${contextTitle}: "${snippet}"`,
      targetUser: target,
      dataPayload
    });
  }
}