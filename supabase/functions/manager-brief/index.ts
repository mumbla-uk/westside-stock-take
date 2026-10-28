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

    // 1. Parallel Context Gathering
    const now = new Date();
    const dayName = now.toLocaleDateString("en-GB", { weekday: "long" });
    const formattedDate = now.toLocaleDateString("en-GB", { day: "numeric", month: "short" });

    const [weatherRes, handoverRes, goodsRes] = await Promise.all([
      // Live Glasgow Partick Weather
      fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=55.87&longitude=-4.31&current=temperature_2m,precipitation,weather_code&daily=precipitation_probability_max,temperature_2m_max&timezone=Europe%2FLondon"
      ).then(r => r.ok ? r.json() : null).catch(() => null),

      // Latest closing handover
      supabase
        .from("handovers")
        .select("manager_name, takings, general_notes, eighty_six_list, tomorrow_tasks, created_at")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
        .then(r => r.data)
        .catch(() => null),

      // Recent deliveries/goods received
      supabase
        .from("goods_received")
        .select("supplier_name, invoice_total, status, created_at")
        .order("created_at", { ascending: false })
        .limit(3)
        .then(r => r.data || [])
        .catch(() => [])
    ]);

    const temp = Math.round(weatherRes?.current?.temperature_2m ?? 11);
    const rainChance = weatherRes?.daily?.precipitation_probability_max?.[0] ?? 30;

    // 2. Build High-Density Venue Prompt
    const venueContext = `VENUE: West Side Tavern, Dumbarton Rd, Partick, Glasgow.
LOCALITY: Near Kelvinhall Subway & SWG3. High footfall from University of Glasgow students, local regulars, and SEC/Hydro event crowds.
TODAY: ${dayName}, ${formattedDate}.
WEATHER: ${temp}°C, Rain probability: ${rainChance}%.
LAST CLOSE: Closed by ${handoverRes?.manager_name || 'Floor Staff'}. Takings: £${handoverRes?.takings || '0'}. Notes: "${handoverRes?.general_notes || 'Clean close'}".
CURRENT 86 LIST: ${JSON.stringify(handoverRes?.eighty_six_list || [])}.
CARRYOVER TASKS: ${JSON.stringify(handoverRes?.tomorrow_tasks || [])}.
RECENT DELIVERIES: ${JSON.stringify(goodsRes.map(g => `${g.supplier_name} (£${g.invoice_total || 0})`))}.

TONE & PERSONA:
- Experienced Glasgow AGM peer (sharp, realistic, direct, zero corporate fluff).
- Pragmatic hospitality mindset: Focus on covers, pass pacing, ice/garnish pars, wet floor hazards, and prep.`;

    const ai = new GoogleGenAI({ apiKey: geminiKey });

    // --- EXECUTION BRANCH A: PRE-SHIFT 4-TILE BRIEF ---
    if (mode === "brief") {
      const response = await ai.models.generateContent({
        model: "gemini-3.8-flash",
        contents: `${venueContext}

Analyze the operational parameters and generate a high-speed shift briefing.
Output MUST follow the exact schema provided. Keep each description under 10-12 words.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              trade: {
                type: Type.OBJECT,
                properties: {
                  status: { type: Type.STRING, description: "e.g. Moderate, Peak Surge, Steady Lunch" },
                  detail: { type: Type.STRING, description: "Short trade forecast factoring day and weather" }
                },
                required: ["status", "detail"]
              },
              floor: {
                type: Type.OBJECT,
                properties: {
                  alert: { type: Type.STRING, description: "Key door or floor priority (e.g. Mats Down, Terrace Closed, Reserve Pass)" },
                  detail: { type: Type.STRING, description: "Practical setup action for the floor team" }
                },
                required: ["alert", "detail"]
              },
              stock: {
                type: Type.OBJECT,
                properties: {
                  shortagesCount: { type: Type.INTEGER, description: "Number of active 86s or critical shortages" },
                  headline: { type: Type.STRING, description: "Most urgent shortage or 'All Lines Active'" }
                },
                required: ["shortagesCount", "headline"]
              },
              carryover: {
                type: Type.OBJECT,
                properties: {
                  owner: { type: Type.STRING, description: "Who logged it or assigned team" },
                  task: { type: Type.STRING, description: "High priority carryover prep or safe/till task" }
                },
                required: ["owner", "task"]
              }
            },
            required: ["trade", "floor", "stock", "carryover"]
          },
          temperature: 0.15,
        }
      });

      const parsed = JSON.parse(response.text || "{}");
      return new Response(
        JSON.stringify({ brief: parsed, weather: { temp, rainChance } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // --- EXECUTION BRANCH B: CONTEXTUAL OPS CHAT ---
    const chatPrompt = `${venueContext}

USER QUERY: "${userMessage}"

INSTRUCTIONS:
- Answer in 1 to 3 punchy sentences or short operational bullet points.
- If drafting a message to a supplier or team, write ready-to-copy text directly.
- Never introduce yourself or say 'Sure thing' or 'As an AI'. Answer immediately.`;

    const chatResponse = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        ...chatHistory.map(h => ({
          role: h.role === "assistant" ? "model" : "user",
          parts: [{ text: h.content }]
        })),
        { role: "user", parts: [{ text: chatPrompt }] }
      ],
      config: {
        temperature: 0.3,
      }
    });

    return new Response(
      JSON.stringify({ reply: chatResponse.text || "No response generated." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});