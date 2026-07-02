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

// Weather interpretation codes based on WMO
function weatherCodeText(code) {
    if (code === 0) return "Clear Sky";
    if (code >= 1 && code <= 3) return "Partly Cloudy";
    if (code === 45 || code === 48) return "Foggy";
    if (code >= 51 && code <= 55) return "Drizzle";
    if (code >= 61 && code <= 65) return "Rainy";
    if (code >= 80 && code <= 82) return "Rain Showers";
    if (code >= 95 && code <= 99) return "Thunderstorms";
    return "Cloudy";
}

// Resilient JSON parser to clean up markdown fences
function parseResilientJson(jsonStr) {
    let cleanStr = jsonStr.trim();
    const firstBrace = cleanStr.indexOf('{');
    if (firstBrace !== -1) {
        cleanStr = cleanStr.substring(firstBrace);
    }
    const lastBacktick = cleanStr.lastIndexOf('`');
    if (lastBacktick !== -1 && lastBacktick > cleanStr.length - 5) {
         cleanStr = cleanStr.replace(/```\s*$/, '');
    }
    return JSON.parse(cleanStr);
}

// Deterministic programmatic parser (no-LLM fallback)
function runDeterministicParser(weatherData, newsItems) {
    const temp_c = Math.round(weatherData.temperature_2m);
    const condition = weatherCodeText(weatherData.weather_code);
    const rain_today_mm = (weatherData.precipitation || 0).toString();
    const humidity_pct = (weatherData.relative_humidity_2m || 80).toString();
    const wind_kmh = Math.round(weatherData.wind_speed_10m || 15).toString();
    const rain_chance_pct = (weatherData.precipitation > 0) ? "100" : (weatherData.relative_humidity_2m > 85 ? "80" : "40");

    // Enforce exactly one status per train line
    const trainLines = [
        { name: "Western Line", keywords: ["western railway", "western line", "churchgate", "virar", "borivali"] },
        { name: "Central Main Line", keywords: ["central railway", "central line", "kalyan", "dombivli", "titwala"] },
        { name: "Harbour Line", keywords: ["harbour line", "harbour railway", "vashi", "belapur", "nerul"] },
        { name: "Trans-Harbour Line", keywords: ["trans-harbour", "trans harbour", "airoli", "rabale", "kopar khairane"] },
        { name: "Vasai–Roha Line", keywords: ["vasai", "roha", "diva", "panvel railway"] },
        { name: "Uran Line", keywords: ["uran line", "uran railway"] },
        { name: "Mumbai Metro", keywords: ["mumbai metro", "metro line", "metro 3", "metro 2", "metro 7"] },
        { name: "Navi Mumbai Metro", keywords: ["navi mumbai metro"] }
    ];

    const trainsMap = {};
    for (const line of trainLines) {
        trainsMap[line.name] = {
            line: line.name,
            status: "On time",
            detail: "No disruptions reported."
        };
    }

    for (const item of newsItems) {
        const titleLower = item.title.toLowerCase();
        if (titleLower.includes("delay") || titleLower.includes("suspend") || titleLower.includes("disrupt") || 
            titleLower.includes("cancel") || titleLower.includes("slow") || titleLower.includes("waterlog") || 
            titleLower.includes("shut") || titleLower.includes("stalled") || titleLower.includes("hit")) {
            for (const line of trainLines) {
                if (line.keywords.some(k => titleLower.includes(k))) {
                    const status = (titleLower.includes("suspend") || titleLower.includes("shut") || titleLower.includes("stall")) ? "Suspended" : "Delayed";
                    trainsMap[line.name] = {
                        line: line.name,
                        status: status,
                        detail: item.title.split(" - ")[0]
                    };
                    break;
                }
            }
        }
    }
    const trains = Object.values(trainsMap);

    // Specific waterlogged area names
    const areas = [
        { name: "Dadar", keywords: ["dadar", "hindmata"] },
        { name: "Sion", keywords: ["sion", "king's circle", "kings circle"] },
        { name: "Kurla", keywords: ["kurla", "ltt"] },
        { name: "Andheri", keywords: ["andheri", "milan subway"] },
        { name: "Goregaon", keywords: ["goregaon"] },
        { name: "Chembur", keywords: ["chembur"] },
        { name: "Bandra", keywords: ["bandra"] },
        { name: "Thane", keywords: ["thane"] },
        { name: "Borivali", keywords: ["borivali"] },
        { name: "Panvel", keywords: ["panvel"] },
        { name: "Vashi", keywords: ["vashi"] }
    ];

    const waterlogKeywords = ["waterlog", "flood", "submerge", "water accumulation", "inundat"];
    const waterloggingMap = {};

    for (const item of newsItems) {
        const titleLower = item.title.toLowerCase();
        if (waterlogKeywords.some(k => titleLower.includes(k))) {
            for (const area of areas) {
                if (area.keywords.some(k => titleLower.includes(k))) {
                    waterloggingMap[area.name] = {
                        area: area.name,
                        severity: (titleLower.includes("severe") || titleLower.includes("heavy") || titleLower.includes("extreme") || titleLower.includes("submerge")) ? "Severe" : "Moderate",
                        detail: item.title.split(" - ")[0]
                    };
                    break;
                }
            }
        }
    }
    const waterlogging = Object.values(waterloggingMap);
    if (waterlogging.length === 0) {
        waterlogging.push({
            area: "None reported",
            severity: "Low",
            detail: "No active waterlogging reported in major hubs today."
        });
    }

    // Commute destinations and estimated travel times
    const routes = [
        { route: "Andheri → BKC", baseMin: 30, keywords: ["andheri", "bkc", "western express", "weh"] },
        { route: "Thane → Dadar", baseMin: 50, keywords: ["thane", "dadar", "eastern express", "eeh"] },
        { route: "Borivali → Andheri", baseMin: 40, keywords: ["borivali", "andheri", "western express", "weh"] },
        { route: "Kurla → CSMT", baseMin: 35, keywords: ["kurla", "csmt", "central line"] },
        { route: "Vashi → Kurla", baseMin: 30, keywords: ["vashi", "kurla", "harbour line"] },
        { route: "Belapur → Panvel", baseMin: 25, keywords: ["belapur", "panvel", "highway"] }
    ];

    const commute = [];
    const rainAmount = weatherData.precipitation || 0;
    
    let rainDelay = 0;
    if (rainAmount > 0 && rainAmount <= 5) rainDelay = 10;
    else if (rainAmount > 5 && rainAmount <= 15) rainDelay = 25;
    else if (rainAmount > 15) rainDelay = 50;

    for (const r of routes) {
        let trafficDelay = 0;
        let note = "Normal monsoon traffic speeds.";
        for (const item of newsItems) {
            const titleLower = item.title.toLowerCase();
            if (r.keywords.some(k => titleLower.includes(k)) && 
                (titleLower.includes("traffic") || titleLower.includes("jam") || titleLower.includes("slow") || 
                 titleLower.includes("waterlog") || titleLower.includes("delay") || titleLower.includes("choke"))) {
                trafficDelay = 20;
                note = item.title.split(" - ")[0];
                break;
            }
        }
        if (rainDelay > 20 || trafficDelay > 0) {
            note = note !== "Normal monsoon traffic speeds." ? note : "Delayed due to heavy rainfall.";
        }

        const totalMin = r.baseMin + rainDelay + trafficDelay;
        const timeRange = `${totalMin}–${totalMin + 15} min`;

        commute.push({
            route: r.route,
            time: timeRange,
            note: note
        });
    }

    let imdAlert = "Green (No alert issued)";
    const alertColors = ["Red", "Orange", "Yellow"];
    for (const item of newsItems) {
        const titleLower = item.title.toLowerCase();
        if (titleLower.includes("alert") && titleLower.includes("imd")) {
            const color = alertColors.find(c => titleLower.includes(c.toLowerCase()));
            if (color) {
                imdAlert = `${color} alert issued for Mumbai region today.`;
                break;
            }
        }
    }

    let rainSummary = `Current weather is ${condition.toLowerCase()} with temperature around ${temp_c}°C. `;
    if (weatherData.precipitation > 0) {
        rainSummary += `Precipitation is actively recorded at ${rain_today_mm} mm. Commuters are advised to carry umbrellas.`;
    } else {
        rainSummary += `No active rain recorded by regional weather sensors. Humidity is at ${humidity_pct}%.`;
    }

    const sources = newsItems.map(it => ({
        name: it.source || "News Bulletin",
        url: it.link
    })).slice(0, 5);

    return {
        temp_c,
        condition,
        rain_today_mm,
        rain_chance_pct,
        humidity_pct,
        wind_kmh,
        rain_summary: rainSummary,
        imd_alert: imdAlert,
        trains,
        waterlogging,
        commute,
        sources
    };
}

// LLM fetch router
async function queryLLM(openRouterKey, geminiKey, augmentedPrompt) {
    if (openRouterKey) {
        console.log("Querying OpenRouter (meta-llama/llama-3.3-70b-instruct)...");
        const payload = {
            model: 'meta-llama/llama-3.3-70b-instruct',
            messages: [{ role: 'user', content: augmentedPrompt }],
            response_format: { type: 'json_object' }
        };
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openRouterKey}`
            },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            return data.choices?.[0]?.message?.content;
        } else {
            throw new Error(data.error?.message || JSON.stringify(data));
        }
    } else if (geminiKey) {
        console.log("Querying Google Gemini (gemini-2.5-flash)...");
        const payload = {
            contents: [{ parts: [{ text: augmentedPrompt }] }],
            generationConfig: { responseMimeType: 'application/json' }
        };
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const data = await response.json();
        if (response.ok) {
            return data.candidates?.[0]?.content?.parts?.[0]?.text;
        } else {
            throw new Error(data.error?.message || JSON.stringify(data));
        }
    }
    return null;
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

        // Fetch weather from Open-Meteo (lat/long for Mumbai)
        let weatherData = {
            temperature_2m: 28,
            relative_humidity_2m: 85,
            precipitation: 0,
            rain: 0,
            wind_speed_10m: 15,
            weather_code: 3
        };
        try {
            const wRes = await fetch("https://api.open-meteo.com/v1/forecast?latitude=19.0760&longitude=72.8777&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,rain,weather_code,wind_speed_10m");
            if (wRes.ok) {
                const wJson = await wRes.json();
                if (wJson.current) weatherData = wJson.current;
            }
        } catch (we) {
            console.error("Weather fetch failed:", we.message);
        }

        // Fetch news headlines from Google News RSS
        let newsItems = [];
        try {
            const nRes = await fetch("https://news.google.com/rss/search?q=Mumbai+monsoon+rains+railway+waterlogging&hl=en-IN&gl=IN&ceid=IN:en", {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (nRes.ok) {
                const xml = await nRes.text();
                newsItems = parseGoogleNewsRSS(xml);
            }
        } catch (ne) {
            console.error("News fetch failed:", ne.message);
        }

        // Inject retrieved real-time context into prompt
        const augmentedPrompt = `REAL-TIME WEATHER AND NEWS CONTEXT FOR MUMBAI:
===
Current Mumbai Weather (Open-Meteo):
- Temp: ${weatherData.temperature_2m}°C
- Humidity: ${weatherData.relative_humidity_2m}%
- Rain today: ${weatherData.precipitation} mm
- Wind speed: ${weatherData.wind_speed_10m} km/h

Recent Mumbai Monsoon/Traffic News:
${newsItems.slice(0, 10).map((it, idx) => `${idx + 1}. [${it.source}] ${it.title} (${it.pubDate})`).join('\n')}
===

INSTRUCTIONS:
You are the Mumbai Monsoon Commute Desk. Using ONLY the real-time context above, complete the request:
${prompt}`;

        let responseJson;
        let llmSuccess = false;

        // Try LLM generation if keys are set
        if ((openRouterKey && openRouterKey !== 'undefined' && openRouterKey !== 'null') || 
            (geminiKey && geminiKey !== 'undefined' && geminiKey !== 'null')) {
            try {
                const textResponse = await queryLLM(openRouterKey, geminiKey, augmentedPrompt);
                if (textResponse) {
                    responseJson = parseResilientJson(textResponse);
                    responseJson.powered_by_llm = true;
                    llmSuccess = true;
                    console.log("Successfully generated response using LLM.");
                }
            } catch (llmError) {
                console.warn("LLM generation failed, falling back to deterministic parser:", llmError.message);
            }
        }

        // Fallback to programmatic parser if LLM failed or no keys are set
        if (!llmSuccess) {
            console.log("Running deterministic programmatic parser...");
            responseJson = runDeterministicParser(weatherData, newsItems);
            responseJson.powered_by_llm = false;
        }

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(responseJson);

    } catch (error) {
        console.error('Serverless function error:', error);
        res.status(500).json({ error: error.message });
    }
}
