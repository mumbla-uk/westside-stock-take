import { supabase, DEFAULT_VENUE_ID } from './db';

const ONESIGNAL_APP_ID = import.meta.env.VITE_ONESIGNAL_APP_ID || '';
const ONESIGNAL_REST_API_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || '';

/**
 * Sends a OneSignal push notification either directly or via Netlify Edge / Supabase edge function
 */
export async function sendPushNotification(title, message, targetUserOrGroup = null, dataPayload = {}) {
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

    if (targetUserOrGroup) {
      const cleanTarget = String(targetUserOrGroup).replace('@', '').trim();
      
      if (['Openers', 'Closers', 'Kitchen', 'Bar'].includes(cleanTarget)) {
        payload.filters = [
          { field: 'tag', key: 'role', relation: 'exists' },
          { field: 'tag', key: 'shift_group', relation: '=', value: cleanTarget.toLowerCase() }
        ];
      } else {
        payload.include_aliases = {
          external_id: [cleanTarget]
        };
        payload.target_channel = 'push';
      }
    } else {
      payload.included_segments = ['Subscribed Users'];
    }

    const edgeFunctionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-push`;
    const response = await fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok && ONESIGNAL_REST_API_KEY) {
      await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${ONESIGNAL_REST_API_KEY}`
        },
        body: JSON.stringify(payload)
      });
    }

    return true;
  } catch (err) {
    console.warn("Could not dispatch targeted push notification:", err);
    return false;
  }
}

/**
 * Scans any block of text for @mentions and fires push notifications to each tagged person
 */
export async function dispatchMentionsFromText(text, authorName, contextTitle, dataPayload = {}) {
  if (!text || !text.includes('@')) return;

  const matches = text.match(/@(\w+)/g) || [];
  const mentioned = Array.from(new Set(matches.map(m => m.replace('@', '').trim())));

  for (const target of mentioned) {
    if (target.toLowerCase() === String(authorName || '').toLowerCase()) continue;

    const snippet = text.length > 70 ? `${text.slice(0, 67)}...` : text;

    await sendPushNotification(
      `Mention from ${authorName}`,
      `${contextTitle}: "${snippet}"`,
      target,
      dataPayload
    );
  }
}