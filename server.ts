import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";

dotenv.config({ path: ".env.local" });

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT ?? "3000", 10);

// Lazy initialization of Gemini client
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY environment variable is not configured. Please set it in the Secrets panel.");
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

// 1. Crowd-sourced Traffic Update Endpoint
app.post("/api/traffic/report", async (req, res) => {
  const { rawInput, reportedBy } = req.body;
  if (!rawInput) {
    return res.status(400).json({ error: "Missing rawInput data" });
  }

  try {
    const ai = getGeminiClient();
    const systemInstruction = `
      You are an expert Kampala Transit Dispatcher who understands local language patterns including Ugandan English, Luganda, street slang, and mixed Lugablow expressions.
      Analyze the raw input and output a structured JSON response identifying traffic parameters.
      If the user specifies local locations, match them to standard Kampala transportation nodes: 'Old Taxi Park (Central)', 'Wandegeya / Makerere', 'Kawempe', 'Jinja Road / Nakawa', 'Ntinda Corner', 'Gayaza', 'Bweyogerere', 'Seeta / Mukono', 'Ggaba Road'.
      
      Examples:
      - "Webale, traffic engezeeko e Seeta, a trailer has broken down" -> Location: 'Seeta / Mukono', Cause: 'Broken down trailer', Severity: 'High', Alternate suggested: True, Alternative: bypass Bukerere rd.
      - "Nakawa market has a minor accident blocking lanes" -> Location: 'Jinja Road / Nakawa', Cause: 'Minor accident blocking lanes', Severity: 'Critical'.
      - "Kaveera, clear skies and zero lines in Ntinda" -> Location: 'Ntinda Corner', Cause: 'Normal moving traffic, clear skies', Severity: 'Low'.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Parse this raw traffic feedback from a commuter: "${rawInput}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            location: { 
              type: Type.STRING, 
              description: "Must map to one of these: 'Old Taxi Park (Central)', 'Wandegeya / Makerere', 'Kawempe', 'Jinja Road / Nakawa', 'Ntinda Corner', 'Gayaza', 'Bweyogerere', 'Seeta / Mukono', 'Ggaba Road'. If outside these, use the closest recognizable Kampala node name." 
            },
            severity: { 
              type: Type.STRING, 
              description: "Traffic severity level. Options: 'Low', 'Medium', 'High', 'Critical'" 
            },
            cause: { 
              type: Type.STRING, 
              description: "What is causing the congestion (e.g., breakdown, accident, police check, peak hour gridlock, clear road)" 
            },
            alternativeRouteSuggested: { 
              type: Type.BOOLEAN, 
              description: "True if there is an easy workaround alternative route or if the commuter suggests one" 
            },
            alternativeRouteDetails: { 
              type: Type.STRING, 
              description: "Details or instructions for the alternative route. If none, suggest a simple logical Kampala bypass." 
            },
            language: { 
              type: Type.STRING, 
              description: "Language detected: 'English', 'Luganda', or 'Mix'" 
            }
          },
          required: ["location", "severity", "cause", "alternativeRouteSuggested", "alternativeRouteDetails", "language"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");
    
    // Add runtime attributes
    const incident = {
      id: "inc_" + Math.random().toString(36).substr(2, 9),
      location: parsedResult.location,
      severity: parsedResult.severity || "Medium",
      cause: parsedResult.cause || "Unknown obstruction",
      alternativeRouteSuggested: !!parsedResult.alternativeRouteSuggested,
      alternativeRouteDetails: parsedResult.alternativeRouteDetails || "None suggested.",
      rawInput,
      language: parsedResult.language || "English",
      timestamp: new Date().toISOString(),
      reportedBy: reportedBy || "Anonymous Commuter"
    };

    return res.json(incident);
  } catch (error: any) {
    console.error("Traffic Parse Error:", error);
    return res.status(500).json({ error: error.message || "Failed to parse traffic report due to an AI or server error." });
  }
});

// 2. Dynamic Taxi Fare Predictor Endpoint (utilizes Few-Shot template)
app.post("/api/fare/predict", async (req, res) => {
  const { start, destination, weather, timeOfDay } = req.body;
  if (!start || !destination) {
    return res.status(400).json({ error: "Missing starting point or destination" });
  }

  try {
    const ai = getGeminiClient();
    const systemInstruction = `
      You are the Kampala Smart Transport Assistant.
      You dynamically estimate Taxi fares based on weather, time-of-day peak rushes, and local staging knowledge.
      Fares in Uganda fluctuate heavily based on conditions.
      
      Historical context rules for calculation:
      - Normal base fare from Kampala Old Taxi Park to Ntinda is around 2,000 UGX.
      - Normal base fare from Old Taxi Park to Gayaza is 2,500 UGX.
      - Normal base fare to Kawempe is 2,000 UGX.
      - Normal base fare to Jinja Road/Nakawa is 1,500 UGX.
      - Normal base fare to Bweyogerere is 2,500 UGX.
      - Normal base fare to Seeta/Mukono is 3,500 UGX.
      - Normal base fare to Ggaba is 2,500 UGX.
      
      Markup multi-pliers to calculate dynamic price ranges:
      - If weather is 'Rain', multiply base fare by 1.3
      - If weather is 'Heavy Rain', multiply base fare by 1.6
      - If time of day is 'Morning Rush' or 'Evening Rush' (peak times), multiply by 1.4 or add 1,000 UGX.
      - Combined parameters can compound or accumulate.
      
      Format the response strictly using the requested JSON schema. Fares must be rounded to the nearest 500 UGX increment (e.g. 2,000, 2,500, 3,000) as is custom in Kampala Taxis.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Estimate the taxi fare from: "${start}" to "${destination}". Current physical conditions: Weather: "${weather}", Time of day: "${timeOfDay}". Provide full details matching the schema.`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            baseFare: { type: Type.INTEGER, description: "Normal standard fare for off-peak and clear sky in UGX" },
            predictedRangeMin: { type: Type.INTEGER, description: "Calculated minimum dynamic fare under current conditions in UGX" },
            predictedRangeMax: { type: Type.INTEGER, description: "Calculated maximum dynamic fare under current conditions in UGX" },
            bestStage: { type: Type.STRING, description: "The specific stage, gate, or park board yard where they can catch a taxi (e.g. 'Old Taxi Park - block block', 'Nakawa Stage under the bridge')" },
            explanation: { type: Type.STRING, description: "Explain the calculation to the user clearly (e.g. 'Base is 2,000 UGX. High demand during Evening Rush adds 1,000 UGX...')" },
            tips: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Give 2 helpful local commuter safety/financial tips specific to this route and conditions" 
            }
          },
          required: ["baseFare", "predictedRangeMin", "predictedRangeMax", "bestStage", "explanation", "tips"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");
    return res.json(parsedResult);
  } catch (error: any) {
    console.error("Fare Prediction Error:", error);
    return res.status(500).json({ error: error.message || "Failed to compute fare prediction." });
  }
});

// 3. Boda-Safety Behavior & Feedback Endpoint
app.post("/api/boda/analyze", async (req, res) => {
  const { reviewText, riderPlate } = req.body;
  if (!reviewText || !riderPlate) {
    return res.status(400).json({ error: "Missing reviewText or riderPlate" });
  }

  try {
    const ai = getGeminiClient();
    const systemInstruction = `
      You are a specialized Boda Boda Safety Analyst in Kampala.
      Analyze raw user reviews submitted anonymously and categorize safety indicators, flags, sentiments, and safety ratings.
      
      Risk categorization rules:
      - Classify issues into key incident types: 'Severe Speeding', 'No Helmet', 'Reckless Overtaking', 'Safe Ride', 'Overloading', 'Polite Assistant'.
      - Score safety grade from 0 (outright threat, near-death reckless) to 10 (perfect defensive safe rider).
      - Extract any specific behavioral flags.
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: `Rider plate: "${riderPlate}". Passenger review: "${reviewText}"`,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            incidentType: { type: Type.STRING, description: "Must be exactly one of: 'Severe Speeding', 'No Helmet', 'Reckless Overtaking', 'Safe Ride', 'Overloading', 'Polite Assistant'" },
            sentiment: { type: Type.STRING, description: "Overall sentiment: 'Positive', 'Neutral', or 'Negative'" },
            safetyScore: { type: Type.INTEGER, description: "Score out of 10. High for safe rides, extremely low for speeders or helmetless riders." },
            flags: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING }, 
              description: "Short phrases listing visual safety issues observed (e.g. 'No Helmet', 'Splitting Lanes', 'Sidewalk Riding', 'Slowing Down')" 
            }
          },
          required: ["incidentType", "sentiment", "safetyScore", "flags"]
        }
      }
    });

    const parsedResult = JSON.parse(response.text || "{}");
    const reviewedItem = {
      id: "rev_" + Math.random().toString(36).substr(2, 9),
      riderPlate: riderPlate.toUpperCase().trim(),
      incidentType: parsedResult.incidentType || "Safe Ride",
      sentiment: parsedResult.sentiment || "Neutral",
      reviewText,
      safetyScore: Number(parsedResult.safetyScore ?? 5),
      timestamp: new Date().toISOString()
    };

    return res.json(reviewedItem);
  } catch (error: any) {
    console.error("Boda Analysis Error:", error);
    return res.status(500).json({ error: error.message || "Failed to analyze feedback reviews." });
  }
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", keyAvailable: !!process.env.GEMINI_API_KEY });
});

// Vite server hosting middleware / static static folder setup
async function setupServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    console.log("Vite development server middleware loaded.");
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
    console.log("Production static file server configured.");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server listening at http://0.0.0.0:${PORT}`);
  });
}

// Export app for serverless platforms like Vercel
export default app;

if (process.env.VERCEL !== "1") {
  setupServer().catch((err) => {
    console.error("Server boot error:", err);
  });
}
