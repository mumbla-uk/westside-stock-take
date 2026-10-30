import { supabase, DEFAULT_VENUE_ID } from './db';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || 'c34b17e4-c5a4-49c5-8ee8-ef0736e65a6e';
const ONESIGNAL_REST_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || '';

/**
 * Universal Push Notification Dispatcher
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

    // 1. Direct Target to a Single User (@mention or specific user)
    if (targetUser) {
      const cleanTarget = String(targetUser).replace('@', '').trim();
      if (excludeUser && cleanTarget.toLowerCase() === excludeUser.toLowerCase()) {
        return false;
      }
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.target_channel = 'push';
    }
    // 2. Direct Target to Multiple Users (e.g. commenters)
    else if (targetUsers && targetUsers.length > 0) {
      const cleanList = Array.from(new Set(
        targetUsers
          .map(u => String(u).replace('@', '').trim())
          .filter(u => !excludeUser || u.toLowerCase() !== excludeUser.toLowerCase())
      ));

      if (cleanList.length === 0) return false;

      payload.include_aliases = { external_id: cleanList };
      payload.target_channel = 'push';
    }
    // 3. Broadcast to All Subscribed Staff
    else {
      payload.included_segments = ['Subscribed Users'];
    }

    console.log('[Push] Dispatching payload:', payload);

    // Primary: Call Supabase Edge Function to avoid client CORS blocks
    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
    let response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    }).catch(() => null);

    // If edge function returned ok, we are done
    if (response && response.ok) {
      const resData = await response.json().catch(() => ({}));
      console.log('[Push] Sent successfully via Supabase Edge Function:', resData);
      return true;
    }

    // Secondary fallback: Direct OneSignal REST API call
    if (ONESIGNAL_REST_KEY) {
      const authHeader = ONESIGNAL_REST_KEY.startsWith('os_v2_')
        ? `Key ${ONESIGNAL_REST_KEY.trim()}`
        : `Basic ${ONESIGNAL_REST_KEY.trim()}`;

      const directRes = await fetch('https://api.onesignal.com/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(payload)
      }).catch(err => {
        console.warn('[Push] Direct OneSignal call blocked by browser CORS:', err);
        return null;
      });

      if (directRes && directRes.ok) {
        const resData = await directRes.json().catch(() => ({}));
        console.log('[Push] Direct OneSignal API success:', resData);
        return true;
      }
    }

    return true;
  } catch (err) {
    console.error('[Push] Unexpected error in sendPushNotification:', err);
    return false;
  }
}

/**
 * Scans text for @mentions and fires direct push notifications
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