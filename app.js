// Configuration
const API_URL = '/api/fetch-data';

// DOM Elements
const ui = {
    refreshBtn: document.getElementById('refresh-btn'),
    loadingState: document.getElementById('loading-state'),
    contentSections: document.getElementById('contentSections'),
    errorBox: document.getElementById('error-box'),
    errorMessage: document.getElementById('error-message'),
    fallbackBanner: document.getElementById('fallback-banner'),
    lastUpdated: document.getElementById('last-updated'),
    
    hero: {
        temp: document.getElementById('temp'),
        condition: document.getElementById('condition'),
        rainToday: document.getElementById('rain-today'),
        rainChance: document.getElementById('rain-chance'),
        wind: document.getElementById('wind'),
        humidity: document.getElementById('humidity'),
        imdAlert: document.getElementById('imd-alert'),
        rainSummary: document.getElementById('rain-summary'),
    },
    
    lists: {
        trains: document.getElementById('trains-list'),
        waterlogging: document.getElementById('waterlogging-list'),
        commute: document.getElementById('commute-list'),
        sources: document.getElementById('sources-list'),
    }
};

// Prompt defined here so it's easy to tweak in frontend
const promptText = `
You are a Mumbai monsoon commute desk. Today is ${new Date().toLocaleDateString()}. Gather TODAY'S info
for Mumbai and Navi Mumbai from authentic sources: IMD Mumbai, weather services,
Central Railway & Western Railway official handles, BMC/MCGM disaster control, and
reputable local news (Mid-Day, HT, TOI, Indian Express). Use web search.

Return ONLY a JSON object — no prose, no markdown fences — in exactly this shape:
{
  "temp_c": 28,
  "condition": "short current sky condition",
  "rain_today_mm": "45",
  "rain_chance_pct": "90",
  "humidity_pct": "88",
  "wind_kmh": "22",
  "rain_summary": "1-2 sentence plain forecast for Mumbai rains today, cite IMD if possible",
  "imd_alert": "IMD colour alert (Red/Orange/Yellow/Green) + meaning, or 'None issued'",
  "trains":       [ {"line":"Western Line","status":"On time|Delayed|Suspended|Partial","detail":"short note"} ],
  "waterlogging": [ {"area":"place","severity":"Low|Moderate|Severe","detail":"short note"} ],
  "commute":      [ {"route":"Andheri → BKC","time":"45–60 min","note":"short note"} ],
  "sources":      [ {"name":"source","url":"https://..."} ]
}
Cover these lines: Western Line, Central Main Line, Harbour Line, Trans-Harbour Line,
Vasai–Roha (Diva–Panvel), Uran Line, Nerul–Uran, Mumbai Metro (all lines),
Navi Mumbai Metro Line 1. If a line has no reported disruption, mark it "On time" /
"No disruption reported". Cover commute/waterlogging around these hubs: CSMT, Dadar,
Bandra, Andheri, Borivali, Thane, Kurla/LTT, BKC, Vashi, Nerul, Belapur, Panvel, Airoli.
Keep every string short. Include 3–6 real source URLs. Numbers plain (no units inside).
`;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    ui.refreshBtn.addEventListener('click', fetchData);
    fetchData();
});

async function fetchData() {
    showLoading();
    
    try {
        // Try with search
        let data = await callApi(true);
        renderData(data);
        ui.fallbackBanner.classList.add('hidden');
    } catch (err1) {
        console.warn('API call with search failed, retrying without search', err1);
        try {
            // Try without search (best effort)
            let data = await callApi(false);
            renderData(data);
            ui.fallbackBanner.classList.remove('hidden');
        } catch (err2) {
            console.error('API call without search also failed', err2);
            showError(`Failed with search: ${err1.message}\nFailed without search: ${err2.message}`);
        }
    }
}

async function callApi(useSearch) {
    const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, useSearch })
    });
    
    const text = await res.text();
    
    if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${text}`);
    }
    
    return parseResilientJson(text);
}

// Resilient JSON parser to handle truncated AI output
function parseResilientJson(jsonStr) {
    // 1. Strip markdown fences and prose
    let cleanStr = jsonStr.trim();
    const firstBrace = cleanStr.indexOf('{');
    if (firstBrace !== -1) {
        cleanStr = cleanStr.substring(firstBrace);
    }
    
    // Strip trailing markdown backticks if any
    const lastBacktick = cleanStr.lastIndexOf('`');
    if (lastBacktick !== -1 && lastBacktick > cleanStr.length - 5) {
         cleanStr = cleanStr.replace(/```\s*$/, '');
    }

    try {
        // Try naive parse first
        return JSON.parse(cleanStr);
    } catch (e) {
        console.warn('JSON parse failed, attempting resilient salvage', e);
        // 2. Salvage truncated JSON
        let openBraces = 0;
        let openBrackets = 0;
        let inString = false;
        let escapeNext = false;
        let validUpTo = 0;
        
        for (let i = 0; i < cleanStr.length; i++) {
            const char = cleanStr[i];
            
            if (escapeNext) {
                escapeNext = false;
                continue;
            }
            
            if (char === '\\') {
                escapeNext = true;
                continue;
            }
            
            if (char === '"') {
                inString = !inString;
                continue;
            }
            
            if (!inString) {
                if (char === '{') openBraces++;
                if (char === '}') {
                    openBraces--;
                    // If we close the root object early, we can stop here
                    if (openBraces === 0) {
                        validUpTo = i + 1;
                        break;
                    }
                }
                if (char === '[') openBrackets++;
                if (char === ']') openBrackets--;
            }
        }
        
        // If we didn't find the clean end, attempt to close
        let salvagedStr = cleanStr;
        if (validUpTo > 0) {
            salvagedStr = cleanStr.substring(0, validUpTo);
        } else {
            // Close string
            if (inString) salvagedStr += '"';
            
            // Remove trailing commas to make valid before closing
            salvagedStr = salvagedStr.replace(/,\s*$/, '');
            
            // Close arrays
            while (openBrackets > 0) {
                salvagedStr += ']';
                openBrackets--;
            }
            
            // Close objects
            while (openBraces > 0) {
                salvagedStr += '}';
                openBraces--;
            }
        }
        
        try {
            return JSON.parse(salvagedStr);
        } catch (salvageErr) {
            throw new Error(`Could not parse AI response. Salvage failed: ${salvagedStr}`);
        }
    }
}

function showLoading() {
    ui.loadingState.classList.remove('hidden');
    ui.contentSections = document.getElementById('content-sections'); // refresh ref
    ui.contentSections.classList.add('hidden');
    ui.errorBox.classList.add('hidden');
    ui.refreshBtn.classList.add('rotating');
}

function showError(msg) {
    ui.loadingState.classList.add('hidden');
    ui.errorBox.classList.remove('hidden');
    ui.errorMessage.textContent = msg;
    ui.refreshBtn.classList.remove('rotating');
}

function renderData(data) {
    ui.loadingState.classList.add('hidden');
    ui.contentSections.classList.remove('hidden');
    ui.refreshBtn.classList.remove('rotating');
    
    // Set timestamp
    ui.lastUpdated.textContent = `Last updated: ${new Date().toLocaleTimeString()}`;
    
    // Render Hero
    ui.hero.temp.textContent = data.temp_c ? `${data.temp_c}°C` : '--°C';
    ui.hero.condition.textContent = data.condition || '';
    ui.hero.rainToday.textContent = data.rain_today_mm ? `${data.rain_today_mm} mm` : '-- mm';
    ui.hero.rainChance.textContent = data.rain_chance_pct ? `${data.rain_chance_pct}%` : '--%';
    ui.hero.wind.textContent = data.wind_kmh ? `${data.wind_kmh} km/h` : '-- km/h';
    ui.hero.humidity.textContent = data.humidity_pct ? `${data.humidity_pct}%` : '--%';
    ui.hero.rainSummary.textContent = data.rain_summary || '';
    
    // IMD Alert
    if (data.imd_alert && data.imd_alert !== 'None issued') {
        ui.hero.imdAlert.classList.remove('hidden');
        ui.hero.imdAlert.textContent = data.imd_alert;
        ui.hero.imdAlert.className = 'imd-alert'; // reset classes
        const textLower = data.imd_alert.toLowerCase();
        if (textLower.includes('red')) ui.hero.imdAlert.classList.add('alert-red');
        else if (textLower.includes('orange')) ui.hero.imdAlert.classList.add('alert-orange');
        else if (textLower.includes('yellow')) ui.hero.imdAlert.classList.add('alert-yellow');
        else if (textLower.includes('green')) ui.hero.imdAlert.classList.add('alert-green');
        else ui.hero.imdAlert.classList.add('alert-yellow'); // default
    } else {
        ui.hero.imdAlert.classList.add('hidden');
    }
    
    // Render Trains
    renderList(ui.lists.trains, data.trains, (train) => {
        let pillClass = 'pill-neutral';
        const statLow = (train.status || '').toLowerCase();
        if (statLow.includes('on time') || statLow.includes('no disruption')) pillClass = 'pill-green';
        else if (statLow.includes('delayed') || statLow.includes('partial')) pillClass = 'pill-amber';
        else if (statLow.includes('suspended')) pillClass = 'pill-red';
        
        return `
            <div class="list-item">
                <div class="item-header">
                    <span class="item-title">${train.line || 'Unknown Line'}</span>
                    <span class="pill ${pillClass}">${train.status || 'Unknown'}</span>
                </div>
                ${train.detail ? `<div class="item-detail">${train.detail}</div>` : ''}
            </div>
        `;
    });
    
    // Render Waterlogging
    if (!data.waterlogging || data.waterlogging.length === 0) {
        ui.lists.waterlogging.innerHTML = '<div class="list-item"><div class="item-detail">No significant waterlogging reported.</div></div>';
    } else {
        renderList(ui.lists.waterlogging, data.waterlogging, (item) => {
            let pillClass = 'pill-neutral';
            const sevLow = (item.severity || '').toLowerCase();
            if (sevLow === 'low') pillClass = 'pill-green';
            else if (sevLow === 'moderate') pillClass = 'pill-amber';
            else if (sevLow === 'severe') pillClass = 'pill-red';
            
            return `
                <div class="list-item">
                    <div class="item-header">
                        <span class="item-title">${item.area || 'Unknown Area'}</span>
                        <span class="pill ${pillClass}">${item.severity || 'Unknown'}</span>
                    </div>
                    ${item.detail ? `<div class="item-detail">${item.detail}</div>` : ''}
                </div>
            `;
        });
    }
    
    // Render Commute
    renderList(ui.lists.commute, data.commute, (item) => `
        <div class="list-item">
            <div class="item-header">
                <span class="item-title">${item.route || 'Route'}</span>
                <span class="item-title">${item.time || ''}</span>
            </div>
            ${item.note ? `<div class="item-detail">${item.note}</div>` : ''}
        </div>
    `);
    
    // Render Sources
    if (!data.sources || data.sources.length === 0) {
        ui.lists.sources.innerHTML = '<li>No sources available</li>';
    } else {
        ui.lists.sources.innerHTML = data.sources.map(s => 
            `<li><a href="${s.url || '#'}" target="_blank" rel="noopener noreferrer">${s.name || 'Source'}</a></li>`
        ).join('');
    }
    
    // Render Engine Status
    const engineEl = document.getElementById('engine-status');
    if (engineEl) {
        if (data.powered_by_llm) {
            engineEl.textContent = "Engine: LLM AI Parser";
            engineEl.style.background = "rgba(18, 54, 94, 0.1)";
            engineEl.style.color = "var(--color-hero-start)";
        } else {
            engineEl.textContent = "Engine: Local Programmatic Parser";
            engineEl.style.background = "rgba(16, 185, 129, 0.1)";
            engineEl.style.color = "var(--color-green)";
        }
    }
}

function renderList(container, array, templateFn) {
    if (!array || !Array.isArray(array) || array.length === 0) {
        container.innerHTML = '<div class="list-item"><div class="item-detail">No data available</div></div>';
        return;
    }
    container.innerHTML = array.map(templateFn).join('');
}
