// Helper to decode HTML entities in XML parsing
function decodeHTML(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&apos;/g, "'")
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
}

// Simple regex-based RSS parser to convert Google News XML to JSON items
function parseGoogleNewsRSS(xml) {
    const items = [];
    const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/g);
    for (const match of itemMatches) {
        const content = match[1];
        const titleMatch = content.match(/<title>([\s\S]*?)<\/title>/);
        const linkMatch = content.match(/<link>([\s\S]*?)<\/link>/);
        const pubDateMatch = content.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
        const sourceMatch = content.match(/<source[^>]*>([\s\S]*?)<\/source>/);

        const title = titleMatch ? decodeHTML(titleMatch[1].trim()) : "";
        const link = linkMatch ? linkMatch[1].trim() : "";
        const pubDate = pubDateMatch ? pubDateMatch[1].trim() : "";
        const source = sourceMatch ? decodeHTML(sourceMatch[1].trim()) : "";

        items.push({ title, link, pubDate, source });
    }
    return items;
}

// Fetch real-time weather from Open-Meteo
async function fetchWeather() {
    try {
        const res = await fetch("https://api.open-meteo.com/v1/forecast?latitude=19.0760&longitude=72.8777&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m");
        if (!res.ok) return "Weather data temporarily unavailable";
        const data = await res.json();
        const cur = data.current;
        return `Current Mumbai Weather (Open-Meteo):
- Temp: ${cur.temperature_2m}°C (feels like ${cur.apparent_temperature}°C)
- Humidity: ${cur.relative_humidity_2m}%
- Rain/Precipitation: ${cur.precipitation} mm (Rain: ${cur.rain} mm)
- Wind Speed: ${cur.wind_speed_10m} km/h`;
    } catch (e) {
        return "Weather data temporarily unavailable due to fetch error";
    }
}

// Fetch latest traffic/monsoon news from Google News RSS
async function fetchNews() {
    try {
        const res = await fetch("https://news.google.com/rss/search?q=Mumbai+monsoon+rains+railway+waterlogging&hl=en-IN&gl=IN&ceid=IN:en", {
            headers: {
                'User-Agent': 'Mozilla/5.0'
            }
        });
        if (!res.ok) return "Local news updates temporarily unavailable";
        const xml = await res.text();
        const items = parseGoogleNewsRSS(xml).slice(0, 10);
        if (items.length === 0) return "No recent news updates found.";
        return "Recent Mumbai Monsoon/Traffic News:\n" + items.map((it, idx) => `${idx + 1}. [${it.source}] ${it.title} (${it.pubDate})\n   Link: ${it.link}`).join('\n');
    } catch (e) {
        return "Local news updates temporarily unavailable due to fetch error";
    }
}

export default async function handler(req, res) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.status(200).end();
        return;
    }

    // Only allow POST
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    try {
        const { prompt } = req.body;
        
        if (!prompt) {
            res.status(400).json({ error: 'Missing prompt in request body' });
            return;
        }

        const openRouterKey = (process.env.OPENROUTER_API_KEY || "").trim();
        const geminiKey = (process.env.GEMINI_API_KEY || "").trim();

        // Fetch real-time weather and news context
        const [weatherContext, newsContext] = await Promise.all([
            fetchWeather(),
            fetchNews()
        ]);

        // Inject retrieved real-time context into prompt
        const augmentedPrompt = `REAL-TIME WEATHER AND NEWS CONTEXT FOR MUMBAI:
===
${weatherContext}

${newsContext}
===

INSTRUCTIONS:
You are the Mumbai Monsoon Commute Desk. Using ONLY the real-time context above, complete the request:
${prompt}`;

        let textResponse;

        if (openRouterKey && openRouterKey !== 'undefined' && openRouterKey !== 'null') {
            // Use OpenRouter
            console.log("Using OpenRouter API...");
            const payload = {
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                messages: [
                    { role: 'user', content: augmentedPrompt }
                ],
                response_format: { type: 'json_object' }
            };

            const apiUrl = 'https://openrouter.ai/api/v1/chat/completions';

            const openRouterRes = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${openRouterKey}`
                },
                body: JSON.stringify(payload)
            });

            const openRouterData = await openRouterRes.json();

            if (!openRouterRes.ok) {
                console.error('OpenRouter API Error:', openRouterData);
                res.status(openRouterRes.status).json({ error: 'Failed to fetch from OpenRouter API', details: openRouterData });
                return;
            }

            textResponse = openRouterData.choices?.[0]?.message?.content;

        } else if (geminiKey && geminiKey !== 'undefined' && geminiKey !== 'null') {
            // Use Google Gemini API directly
            console.log("Using Google Gemini API...");
            const payload = {
                contents: [
                    {
                        parts: [{ text: augmentedPrompt }]
                    }
                ],
                generationConfig: {
                    responseMimeType: 'application/json'
                }
            };

            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`;

            const geminiRes = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            const geminiData = await geminiRes.json();

            if (!geminiRes.ok) {
                console.error('Gemini API Error:', geminiData);
                res.status(geminiRes.status).json({ error: 'Failed to fetch from Gemini API', details: geminiData });
                return;
            }

            textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        } else {
            // Fallback to keyless Pollinations AI (openai model)
            console.log("No API keys configured. Falling back to keyless Pollinations AI...");
            const payload = {
                messages: [
                    { role: 'user', content: augmentedPrompt }
                ],
                model: 'openai'
            };

            const apiUrl = 'https://text.pollinations.ai/';

            const pollinationsRes = await fetch(apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!pollinationsRes.ok) {
                const errText = await pollinationsRes.text();
                if (pollinationsRes.status === 429) {
                    res.status(500).json({
                        error: 'API Key Configuration Required',
                        details: 'Vercel\'s shared server IP is currently rate-limited by the keyless fallback API. To run this app, please configure your API key in Vercel\'s Environment Variables (either GEMINI_API_KEY from Google AI Studio, or OPENROUTER_API_KEY from openrouter.ai).'
                    });
                    return;
                }
                throw new Error(`Pollinations AI responded with status ${pollinationsRes.status}: ${errText}`);
            }

            textResponse = await pollinationsRes.text();
        }
        
        if (!textResponse) {
            res.status(500).json({ error: 'Invalid response structure from LLM API' });
            return;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(textResponse);

    } catch (error) {
        console.error('Serverless function error:', error);
        res.status(500).json({ error: error.message });
    }
}
