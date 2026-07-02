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
        const { prompt, useSearch } = req.body;
        
        if (!prompt) {
            res.status(400).json({ error: 'Missing prompt in request body' });
            return;
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            res.status(500).json({ error: 'Server configuration error (missing API key)' });
            return;
        }

        // Construct the Gemini API payload
        const payload = {
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                responseMimeType: 'application/json'
            }
        };

        // Enable Google Search grounding if requested
        if (useSearch) {
            payload.tools = [
                { googleSearch: {} }
            ];
        }

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

        const geminiRes = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });

        const geminiData = await geminiRes.json();

        if (!geminiRes.ok) {
            console.error('Gemini API Error:', geminiData);
            res.status(geminiRes.status).json({ error: 'Failed to fetch from Gemini API', details: geminiData });
            return;
        }

        // Extract the text response
        const textResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (!textResponse) {
            res.status(500).json({ error: 'Invalid response structure from Gemini API' });
            return;
        }

        // Vercel Serverless Functions will automatically set application/json
        // when returning res.send/json, but the prompt says:
        // "Return the raw Anthropic JSON to the caller" (now Gemini JSON).
        // Since the prompt asks Gemini to return ONLY JSON, textResponse should be the JSON string.
        
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-Type', 'application/json');
        res.status(200).send(textResponse);

    } catch (error) {
        console.error('Worker error:', error);
        res.status(500).json({ error: error.message });
    }
}
