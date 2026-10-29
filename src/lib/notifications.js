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
      headings: { en: title },
      contents: { en: message },
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
      // 2. Broadcast alert (New Handover, Delivery Check-In, Petty Cash, Orders)
      // We pass 'Total Subscriptions' which is the default active segment in OneSignal
      payload.included_segments = ["Total Subscriptions"];
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