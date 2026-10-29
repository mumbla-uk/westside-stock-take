const ONESIGNAL_APP_ID = "93cb91c7-7f6c-4f75-a66b-40a5fb5375f9";
const ONESIGNAL_REST_KEY = import.meta.env.VITE_ONESIGNAL_REST_KEY || "";
const APP_LAUNCH_URL = typeof window !== 'undefined' ? window.location.origin : 'https://silly-cendol-6613d3.netlify.app';

// Standard venue staff aliases to ensure delivery even if segment sync lags
const VENUE_STAFF_ALIASES = ["Ross", "Josh", "Matt", "Luca", "Grant", "Duty Manager"];

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
      // 1. Direct targeted user (Comment / Reaction)
      const cleanTarget = String(targetManager).split("(")[0].trim();
      payload.include_aliases = { external_id: [cleanTarget] };
      payload.include_external_user_ids = [cleanTarget];
      payload.target_channel = "push";
    } else {
      // 2. Broadcast alerts (Deliveries, New Diaries, Petty Cash, Orders)
      // Broadcast to both standard active segments and direct staff aliases
      payload.included_segments = ["Total Subscriptions", "Subscribed Users"];
      payload.include_aliases = { external_id: VENUE_STAFF_ALIASES };
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