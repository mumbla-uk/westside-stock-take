import { supabase, DEFAULT_VENUE_ID } from './db';

// Fallback to your actual OneSignal App ID if env var is missing
const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || 'c34b17e4-c5a4-49c5-8ee8-ef0736e65a6e';

/**
 * Universal Push Notification Dispatcher
 * Compatible with both object arguments and legacy positional arguments.
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
    // Legacy positional support: sendPushNotification(title, message, targetUser, dataPayload)
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

    // 1. Direct Target to a Single User (@mention or specific author)
    if (targetUser) {
      const cleanTarget = String(targetUser).replace('@', '').trim();
      if (excludeUser && cleanTarget.toLowerCase() === excludeUser.toLowerCase()) {
        return false;
      }
      // Support both modern aliases and legacy external_user_ids
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.include_external_user_ids = [cleanTarget];
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
      payload.include_external_user_ids = cleanList;
      payload.target_channel = 'push';
    } 
    // 3. Broadcast to All Subscribed Staff
    else {
      payload.included_segments = ['Subscribed Users'];
    }

    console.log('[Push] Dispatching payload:', payload);

    // Call Netlify Serverless Function directly first
    let response = await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      // Fallback: Supabase edge function if Netlify function fails
      const edgeUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
      response = await fetch(edgeUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
        },
        body: JSON.stringify(payload)
      });
    }

    const result = await response.json().catch(() => null);
    console.log('[Push] OneSignal Response:', result);

    if (result?.errors && result.errors.length > 0) {
      console.warn('[Push] OneSignal returned errors:', result.errors);
      return false;
    }

    return true;
  } catch (err) {
    console.error('[Push] Fatal dispatch error:', err);
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