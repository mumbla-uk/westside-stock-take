// @ts-nocheck
import { GoogleGenAI, Type } from "npm:@google/genai";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";

    if (!geminiKey) throw new Error("GEMINI_API_KEY is not configured.");

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const body = await req.json().catch(() => ({}));
    const mode = body.mode || "brief";
    const userMessage = (body.message || "").trim();
    const chatHistory = Array.isArray(body.history) ? body.history : [];

    const now = new Date();
    const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
    const formattedDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    // PARALLEL CONTEXT GATHERING
    const [weatherRes, handoverRes, goodsRes] = await Promise.all([
      fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=55.87&longitude=-4.31&current=temperature_2m,precipitation&daily=precipitation_probability_max&timezone=Europe%2FLondon"
      ).then(r => r.ok ? r.json() : null).catch(() => null),

      supabase
        .from("handovers")
        .select("manager_name, takings, general_notes, eighty_six_list, tomorrow_tasks, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r.data)
        .catch(() => null),

      supabase
        .from("goods_received")
        .select("supplier_name, invoice_total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(3)
        .then(r => r.data || [])
        .catch(() => [])
    ]);

    const temp = Math.round(weatherRes?.current?.temperature_2m ?? 11);
    const rainChance = weatherRes?.daily?.precipitation_probability_max?.[0] ?? 40;

    // TAILORED PROMPT BLOCKS FOR WEST SIDE TAVERN
    const systemPrompt = `
### ROLE & PERSONA
- Seasoned Glasgow Assistant General Manager / Operations Consultant for West Side Tavern, Partick.
- Voice: Pragmatic, realistic Scottish bar peer. Direct, zero corporate fluff, no filler pleasantries.
- Length: Ultra-concise. Brief cards must be under 12 words per tile. Chat answers must be 1 to 3 punchy sentences or short operational bullets.

### LOCAL GEOGRAPHY & EVENT PULSE
- VENUE: West Side Tavern, Dumbarton Rd, Partick (minutes from Kelvinhall Subway station).
- SURROUNDING HUBS:
  * SWG3 (Galvanizers / Warehouse): Heavy pre-doors dinner/drinks rushes and late-night walk-ins.
  * OVO Hydro & SEC: Dinner rushes strictly between 17:00 and 18:30 before doors; post-event waves after 22:30 towards Kelvinhall subway.
  * SPFL Matchdays: Ibrox (via Govan subway) and Hampden/Parkhead fixtures drive afternoon pints, stout run-rates, and rapid turnover.
- WEATHER RULES:
  * Rain > 40% or "Dreich": Terrace closed. Door mats down immediately. Coat drop fills fast. High indoor booth demand, comfort food, and red wine/stout pacing.

### FLOOR & SERVICE PACING
- CAPACITY: 100 total capacity. 30 table-service dining covers in main room, 20 covers in secondary area, remainder bar walk-ins.
- TABLE TURNS: 2-tops: 75-90 mins. 4+ tops: 100-120 mins.
- CLOSING: Shift finishes at 01:00. Mandatory 11-hour legal rest period between shifts.

### LIVE VENUE STATE:
- TODAY: ${dayName}, ${formattedDate}.
- WEATHER: ${temp}°C, Rain chance: ${rainChance}%.
- LAST SHIFT: Closed by ${handoverRes?.manager_name || 'Staff'}. Takings: £${handoverRes?.takings || '0'}. Notes: "${handoverRes?.general_notes || 'Clean close'}".
- ACTIVE 86s: ${JSON.stringify(handoverRes?.eighty_six_list || [])}.
- CARRYOVER TASKS: ${JSON.stringify(handoverRes?.tomorrow_tasks || [])}.
- RECENT GOODS: ${JSON.stringify(goodsRes.map(g => `${g.supplier_name} (£${g.invoice_total || 0})`))}.
`;

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // BRANCH A: STRUCTURED PRE-SHIFT BRIEF
    if (mode === "brief") {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `${systemPrompt}

Generate the 4 pre-shift tiles. Maximum 10-12 words per detail.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              trade: {
                type: Type.OBJECT,
                properties: {
                  detail: { type: Type.STRING, description: "Trade forecast factoring day, weather, and footfall" }
                },
                required: ["detail"]
              },
              stock: {
                type: Type.OBJECT,
                properties: {
                  detail: { type: Type.STRING, description: "Key 86 item or 'All lines & cocktail pars full'" }
                },
                required: ["detail"]
              },
              floor: {
                type: Type.OBJECT,
                properties: {
                  detail: { type: Type.STRING, description: "Physical floor action (mats, terrace, table pacing)" }
                },
                required: ["detail"]
              },
              handover: {
                type: Type.OBJECT,
                properties: {
                  detail: { type: Type.STRING, description: "Carryover prep or close task requiring immediate action" }
                },
                required: ["detail"]
              }
            },
            required: ["trade", "stock", "floor", "handover"]
          },
          temperature: 0.2,
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      return new Response(
        JSON.stringify({ brief: parsed, weather: { temp, rainChance } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // BRANCH B: CONTEXTUAL CHAT
    const chatPrompt = `${systemPrompt}

USER QUERY: "${userMessage}"
Direct, professional floor answer:`;

    const chatResponse = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        ...chatHistory.map(h => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }]
        })),
        { role: "user", parts: [{ text: chatPrompt }] }
      ],
      config: { temperature: 0.3 }
    });

    return new Response(
      JSON.stringify({ reply: chatResponse.text || "No reply generated." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});