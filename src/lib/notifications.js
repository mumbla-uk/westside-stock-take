import { supabase, DEFAULT_VENUE_ID } from './db';


const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '93cb91c7-7f6c-4f75-a66b-40a5fb5375f9';

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

    // 1. Single user targeting (@mention or direct author)
    if (targetUser) {
      const cleanTarget = String(targetUser).replace('@', '').trim();
      if (excludeUser && cleanTarget.toLowerCase() === excludeUser.toLowerCase()) {
        console.log(`[Push] Suppressed: Target "${cleanTarget}" matches excludeUser.`);
        return false;
      }
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.target_channel = 'push';
    } 
    // 2. Multiple user targeting
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
    // 3. Broadcast to all subscribed staff
    else {
      payload.included_segments = ['Subscribed Users'];
    }

    console.log('[Push] Dispatching to /.netlify/functions/send-push:', payload);

    const response = await fetch('/.netlify/functions/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const resData = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('[Push] Netlify function returned error:', response.status, resData);
      return false;
    }

    console.log('[Push] Successfully delivered to OneSignal:', resData);
    return true;
  } catch (err) {
    console.error('[Push] Network/Dispatch error:', err);
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