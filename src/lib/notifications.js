import { supabase, DEFAULT_VENUE_ID } from './db';

const ONESIGNAL_APP_ID = "93cb91c7-7f6c-4f75-a66b-40a5fb5375f9";
const ONESIGNAL_REST_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || "";
const APP_LAUNCH_URL = typeof window !== 'undefined' ? window.location.origin : 'https://silly-cendol-6613d3.netlify.app';

export async function sendPushNotification(title, message, targetManager = null, customData = {}) {
  try {
    if (!ONESIGNAL_REST_KEY) {
      console.warn("OneSignal REST key not found in environment (VITE_ONESIGNAL_REST_KEY is empty).");
      return;
    }

    let targetUrl = APP_LAUNCH_URL;
    if (customData?.module) {
      const params = new URLSearchParams({ module: customData.module });
      if (customData.entryId) params.append("entryId", customData.entryId);
      targetUrl = `${APP_LAUNCH_URL}?${params.toString()}`;
    }

    const payload = {
      app_id: ONESIGNAL_APP_ID,
      headings: { en: String(title || "West Side Tavern") },
      contents: { en: String(message || "New operations update.") },
      url: targetUrl,
      data: customData,
    };

    if (targetManager) {
      // 1. Direct 1-to-1 alert (Comment / Reaction)
      const cleanTarget = String(targetManager).split("(")[0].trim();
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.include_external_user_ids = [cleanTarget];
      payload.target_channel = "push";
    } else {
      // 2. Broadcast alerts (Deliveries, New Diaries, Petty Cash, Orders)
      // Query active team roster dynamically from Supabase
      let staffAliases = [];
      try {
        const { data: staffData } = await supabase
          .from('staff')
          .select('name')
          .eq('venue_id', DEFAULT_VENUE_ID);
        if (staffData && staffData.length > 0) {
          staffAliases = staffData.map(s => s.name.trim()).filter(Boolean);
        }
      } catch (err) {
        console.warn("Could not query dynamic staff roster:", err);
      }

      payload.included_segments = ["Total Subscriptions", "Subscribed Users"];
      if (staffAliases.length > 0) {
        payload.include_aliases = { external_id: staffAliases };
      }
      payload.target_channel = "push";
    }

    const res = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Basic ${ONESIGNAL_REST_KEY}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("OneSignal API error response:", data);
    } else {
      console.log("OneSignal push dispatched successfully:", data);
    }
  } catch (err) {
    console.warn("Push dispatch error:", err);
  }
}

export const sendNotification = sendPushNotification;
export default sendPushNotification;