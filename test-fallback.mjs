import handler from './api/fetch-data.js';

// Ensure no keys are configured
delete process.env.OPENROUTER_API_KEY;
delete process.env.GEMINI_API_KEY;

const req = {
    method: 'POST',
    body: {
        prompt: `Return ONLY a JSON object (no markdown formatting, no backticks, no prose) matching this format:
{
  "temp_c": 28,
  "condition": "Rainy",
  "rain_today_mm": "10",
  "rain_chance_pct": "80",
  "humidity_pct": "90",
  "wind_kmh": "15",
  "rain_summary": "Summary of rain today",
  "imd_alert": "None",
  "trains": [],
  "waterlogging": [],
  "commute": [],
  "sources": []
}`
    }
};

const res = {
    headers: {},
    statusCode: 200,
    setHeader(name, value) {
        this.headers[name] = value;
        return this;
    },
    status(code) {
        this.statusCode = code;
        return this;
    },
    send(data) {
        console.log(`\n[TEST SUCCESS] Response received (status ${this.statusCode}):`);
        console.log(data);
    },
    json(data) {
        console.log(`\n[TEST ERROR] Response received (status ${this.statusCode}):`, data);
    }
};

console.log("Starting serverless handler fallback test (making real network requests)...");
handler(req, res).catch(console.error);
