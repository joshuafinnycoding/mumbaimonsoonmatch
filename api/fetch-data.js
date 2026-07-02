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

        // Process Weather Values
        const temp_c = Math.round(weatherData.temperature_2m);
        const condition = weatherCodeText(weatherData.weather_code);
        const rain_today_mm = (weatherData.precipitation || 0).toString();
        const humidity_pct = (weatherData.relative_humidity_2m || 80).toString();
        const wind_kmh = Math.round(weatherData.wind_speed_10m || 15).toString();
        const rain_chance_pct = (weatherData.precipitation > 0) ? "100" : (weatherData.relative_humidity_2m > 85 ? "80" : "40");

        // Parse Train Disruptions from news
        const trainLines = [
            { name: "Central Line", keywords: ["central railway", "central line", "kurla", "thane", "csmt", "harbour"] },
            { name: "Western Line", keywords: ["western railway", "western line", "andheri", "bandra", "borivali", "dadar"] },
            { name: "Mumbai Metro", keywords: ["metro"] }
        ];
        const trains = [];
        for (const item of newsItems) {
            const titleLower = item.title.toLowerCase();
            for (const line of trainLines) {
                if (line.keywords.some(k => titleLower.includes(k)) && 
                    (titleLower.includes("delay") || titleLower.includes("suspend") || titleLower.includes("disrupt") || titleLower.includes("cancel") || titleLower.includes("slow") || titleLower.includes("waterlog") || titleLower.includes("shut"))) {
                    trains.push({
                        line: line.name,
                        status: (titleLower.includes("suspend") || titleLower.includes("shut")) ? "Suspended" : "Delayed",
                        detail: item.title.split(" - ")[0]
                    });
                    break;
                }
            }
        }
        if (trains.length === 0) {
            trains.push({
                line: "Local Railway Networks",
                status: "On time",
                detail: "No major train disruptions reported in local news today."
            });
        }

        // Parse Waterlogging Spots from news
        const waterlogging = [];
        const areas = ["Dadar", "Andheri", "Hindmata", "Kurla", "Sion", "Chembur", "Milan Subway", "King's Circle", "Goregaon", "Bandra", "Panvel", "Thane"];
        const waterlogKeywords = ["waterlog", "flood", "submerge", "water accumulation", "inundat"];
        for (const item of newsItems) {
            const titleLower = item.title.toLowerCase();
            if (waterlogKeywords.some(k => titleLower.includes(k))) {
                const matchedArea = areas.find(a => titleLower.includes(a.toLowerCase())) || "Low-lying areas";
                waterlogging.push({
                    area: matchedArea,
                    severity: (titleLower.includes("severe") || titleLower.includes("heavy") || titleLower.includes("extreme")) ? "Severe" : "Moderate",
                    detail: item.title.split(" - ")[0]
                });
            }
        }
        if (waterlogging.length === 0) {
            waterlogging.push({
                area: "General",
                severity: "Low",
                detail: "No major waterlogging reported across road intersections today."
            });
        }

        // Parse Commute Alerts from news
        const commute = [];
        const trafficKeywords = ["traffic", "jam", "slow", "block", "close", "divert", "waterlog"];
        for (const item of newsItems) {
            const titleLower = item.title.toLowerCase();
            if (trafficKeywords.some(k => titleLower.includes(k)) && (titleLower.includes("road") || titleLower.includes("highway") || titleLower.includes("flyover"))) {
                commute.push({
                    route: "Road commute alert",
                    time: "Expect delays",
                    note: item.title.split(" - ")[0]
                });
            }
        }
        if (commute.length === 0) {
            commute.push({
                route: "Main Road Hubs",
                time: "Normal",
                note: "Traffic is moving normally across major flyovers."
            });
        }

        // Determine IMD alert from news
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

        // Generate dynamic rain forecast text
        let rainSummary = `Current weather is ${condition.toLowerCase()} with temperature around ${temp_c}°C. `;
        if (weatherData.precipitation > 0) {
            rainSummary += `Precipitation is actively recorded at ${rain_today_mm} mm. Commuters are advised to carry umbrellas.`;
        } else {
            rainSummary += `No active rain recorded by regional weather sensors. Humidity is at ${humidity_pct}%.`;
        }

        // Map Sources
        const sources = newsItems.map(it => ({
            name: it.source || "News Bulletin",
            url: it.link
        })).slice(0, 5);

        // Final payload construction matching index.html expected response
        const responseJson = {
            temp_c,
            condition,
            rain_today_mm,
            rain_chance_pct,
            humidity_pct,
            wind_kmh,
            rain_summary: rainSummary,
            imd_alert: imdAlert,
            trains: trains.slice(0, 6),
            waterlogging: waterlogging.slice(0, 6),
            commute: commute.slice(0, 6),
            sources
        };

        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).json(responseJson);

    } catch (error) {
        console.error('Serverless function error:', error);
        res.status(500).json({ error: error.message });
    }
}
