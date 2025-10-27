// ------------------------------
// 🔢 DATA STORAGE
// ------------------------------
const allPlinkoBets = [];
let mainData = JSON.parse(localStorage.getItem('plinkoMainData') || '[]');
let streakWindows = JSON.parse(localStorage.getItem('plinkoStreakWindows') || '[]');
let learnedPatterns = JSON.parse(localStorage.getItem('plinkoLearnedPatterns') || '[]');
let predictionHistory = JSON.parse(localStorage.getItem('plinkoPredictionHistory') || '[]');

// ------------------------------
// 🔔 UTILITY FUNCTIONS
// ------------------------------
function saveMainData() { localStorage.setItem('plinkoMainData', JSON.stringify(mainData)); }
function saveStreakWindows() { localStorage.setItem('plinkoStreakWindows', JSON.stringify(streakWindows)); }
function saveLearnedPatterns() { localStorage.setItem('plinkoLearnedPatterns', JSON.stringify(learnedPatterns)); }
function savePredictions() { localStorage.setItem('plinkoPredictionHistory', JSON.stringify(predictionHistory)); }

function playPredictionSound() {
    const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
    audio.volume = 0.4;
    audio.play().catch(() => console.warn("🔇 Sound blocked until user interacts."));
}

function colorEmoji(color) {
    return color === "green" ? "🟩" : color === "yellow" ? "🟨" : "🟥";
}

// ------------------------------
// 📊 BUCKET LOGIC
// ------------------------------
const BUCKET_SIZE = 100;
const TOTAL_GAMES = 40000;
const bucketCount = Math.ceil(TOTAL_GAMES / BUCKET_SIZE);
const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    start: i * BUCKET_SIZE,
    end: (i + 1) * BUCKET_SIZE - 1,
    hits: 0,
    multipliers: []
}));

function recordHitInBucket(gameNumber, multiplier) {
    const index = Math.floor(gameNumber / BUCKET_SIZE);
    if (index >= 0 && index < bucketCount) {
        buckets[index].hits++;
        buckets[index].multipliers.push(multiplier);
    }
}

// ------------------------------
// 🌟 HOTSPOT LOGIC
// ------------------------------
function recordHighHit(gameNumber, multiplier) {
    let hotspot = streakWindows.find(win => gameNumber >= win.start && gameNumber <= win.end);
    if (hotspot) {
        hotspot.hits++;
        hotspot.multipliers.push(multiplier);
    } else {
        const windowSize = 100;
        streakWindows.push({
            start: gameNumber - windowSize,
            end: gameNumber + windowSize,
            hits: 1,
            multipliers: [multiplier]
        });
    }
    saveStreakWindows();

    if (!mainData.find(h => h.gameNumber === gameNumber)) {
        mainData.push({ gameNumber, multiplier });
        saveMainData();
    }
}

function getAvgHits(recentCount = 50) {
    const recentWindows = streakWindows.slice(-recentCount);
    if (!recentWindows.length) return 1;
    const totalHits = recentWindows.reduce((sum, win) => sum + win.hits, 0);
    return totalHits / recentWindows.length;
}

function getHotspotColor(win, avgHits) {
    const ratio = win.hits / avgHits;
    if (ratio >= 1.5) return 'green';
    else if (ratio >= 0.8) return 'yellow';
    else return 'red';
}

// ------------------------------
// 📥 PATTERN LEARNING
// ------------------------------
const PATTERN_LENGTH = 5;

function recordPattern(gameNumber, multiplier) {
    if (gameNumber <= PATTERN_LENGTH) return;
    const pattern = allPlinkoBets.slice(gameNumber - PATTERN_LENGTH - 1, gameNumber - 1).map(b => b.payoutMultiplier);
    learnedPatterns.push({ pattern, result: multiplier });
    saveLearnedPatterns();
}

function matchPattern() {
    if (allPlinkoBets.length < PATTERN_LENGTH) return null;
    const recentSeq = allPlinkoBets.slice(-PATTERN_LENGTH).map(b => b.payoutMultiplier);
    const matches = learnedPatterns.filter(p => p.pattern.join(',') === recentSeq.join(','));
    if (!matches.length) return null;
    const freq = {};
    matches.forEach(m => { freq[m.result] = (freq[m.result] || 0) + 1; });
    return parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
}

// ------------------------------
// 📥 CAPTURE BETS
// ------------------------------
function capturePlinkoBet(response) {
    const bets = response.plinkoBet ? [response.plinkoBet] : response.bets || [];
    if (!bets.length) return;

    for (const bet of bets) {
        const gameNumber = allPlinkoBets.length + 1;
        allPlinkoBets.push({
            id: bet.id,
            payoutMultiplier: bet.payoutMultiplier,
            updatedAt: new Date(),
            gameNumber
        });

        if ([9, 26, 130, 1000].includes(bet.payoutMultiplier)) {
            recordHighHit(gameNumber, bet.payoutMultiplier);
            recordHitInBucket(gameNumber, bet.payoutMultiplier);
            recordPattern(gameNumber, bet.payoutMultiplier);
        }
    }
}

// Hook fetch + XHR
const originalFetch = window.fetch;
window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
        const cloned = response.clone();
        const data = await cloned.json();
        capturePlinkoBet(data);
    } catch {}
    return response;
};
(function () {
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.addEventListener("load", function () {
            try {
                const data = JSON.parse(this.responseText);
                capturePlinkoBet(data);
            } catch {}
        });
        open.apply(this, arguments);
    };
})();

// ------------------------------
// 🤖 AI INSIGHTS
// ------------------------------
function generateAIInsight() {
    if (!allPlinkoBets.length) return "🤖 AI Insight: Awaiting data...";
    const recent = allPlinkoBets.slice(-50);
    const counts = { 9: 0, 26: 0, 130: 0, 1000: 0 };
    recent.forEach(b => { if (counts[b.payoutMultiplier] !== undefined) counts[b.payoutMultiplier]++; });
    const maxMultiplier = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    if (maxMultiplier[1] / recent.length > 0.5) {
        return `🤖 AI Insight: Multiplier ${maxMultiplier[0]} is dominating. Increase bet slightly.`;
    } else {
        return "🤖 AI Insight: Mixed pattern — stay conservative.";
    }
}

function suggestAIBet() {
    const avgHits = getAvgHits();
    const hotspot = streakWindows.slice(-5).find(win => win.hits >= avgHits * 1.2);
    if (hotspot) return "💡 Hotspot detected — consider moderate bet increase!";
    return "💡 No strong pattern detected — maintain base bet.";
}

function getAIMood() {
    const recent = allPlinkoBets.slice(-50);
    const hotHits = recent.filter(b => [26, 130, 1000].includes(b.payoutMultiplier)).length;
    if (hotHits > 10) return "🤖 Mood: Excited";
    if (hotHits < 2) return "🤖 Mood: Cautious";
    return "🤖 Mood: Neutral";
}

// ------------------------------
// ⚙️ BALANCE & BETTING
// ------------------------------
let inSafetyMode = false;
let autoAdjustEnabled = true;

async function getBalance() {
    const selector = 'button[data-active-currency="sweeps"] .text-neutral-default.ds-body-md-strong';
    return new Promise(resolve => {
        let attempts = 0;
        const interval = setInterval(() => {
            const el = document.querySelector(selector);
            attempts++;
            if (el) {
                clearInterval(interval);
                resolve(parseFloat(el.textContent.replace(/,/g, '')));
            } else if (attempts >= 10) {
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
    });
}

function getBetInput() { return document.querySelector('input[data-testid="input-game-amount"][type="number"]'); }

async function delayedBet(targetBet) {
    const input = getBetInput();
    if (!input) return;
    const delay = 200 + Math.random() * 300;
    await new Promise(r => setTimeout(r, delay));
    input.value = targetBet;
    input.dispatchEvent(new Event("input", { bubbles: true }));
}

async function getNetGain() {
    const el = document.querySelector('span[data-testid="bets-stats-profit"]');
    if (!el) return 0;
    const value = parseFloat(el.textContent.replace(/,/g, ''));
    return isNaN(value) ? 0 : value;
}

// ------------------------------
// 🎯 1000× HIT PROBABILITY
// ------------------------------
function get1000xHitProbability(currentGame = allPlinkoBets.length, rangeEnd = TOTAL_GAMES) {
    const hits = allPlinkoBets.filter(b => b.payoutMultiplier === 1000);
    if (!hits.length) return 0;
    const totalGames = rangeEnd - currentGame;
    const futureHits = hits.filter(h => h.gameNumber >= currentGame && h.gameNumber <= rangeEnd);
    const hitRate = hits.length / allPlinkoBets.length;
    const observedRate = futureHits.length / totalGames;
    const probability = (hitRate * 0.6 + observedRate * 0.4) * 100;
    return probability.toFixed(2);
}

// ------------------------------
// 🖥️ DASHBOARD
// ------------------------------
const dashboard = document.createElement('div');
dashboard.style.cssText = `
position:fixed;top:10px;right:10px;width:360px;background:#111;color:#fff;
font-family:sans-serif;font-size:12px;z-index:9999;padding:10px 12px;border-radius:6px;
box-shadow:0 0 8px rgba(0,0,0,0.6);
`;
document.body.appendChild(dashboard);

let startingBalance = null;

function updateDashboard() {
    const avgHits = getAvgHits();
    const currentGame = allPlinkoBets.length;
    const prob1000 = get1000xHitProbability(currentGame, TOTAL_GAMES);
    const hotspotInfo = streakWindows.slice(-5)
        .map(win => `${colorEmoji(getHotspotColor(win, avgHits))} [${win.start}-${win.end}] Hits:${win.hits}`)
        .join(' ');
    dashboard.innerHTML = `
<b>Plinko Dashboard</b><br>
🎯 1000× Probability from ${currentGame}-${TOTAL_GAMES}: ${prob1000}%<br>
Balance Goal: ${startingBalance ? (startingBalance * 1000).toFixed(2) : "Calculating..."}<br>
AVG Hits: ${avgHits.toFixed(2)}<br>
Hotspots: ${hotspotInfo || "None"}<br>
${generateAIInsight()}<br>
${suggestAIBet()}<br>
${getAIMood()}
    `;
}

// ------------------------------
// ⚙️ AUTO BET ADJUSTER
// ------------------------------
async function adjustBetBasedOnHits() {
    if (!autoAdjustEnabled) return;
    const balance = await getBalance();
    if (!balance) return;
    const input = getBetInput();
    if (!input) return;

    if (startingBalance === null && balance > 0) startingBalance = balance;
    const netGain = await getNetGain();
    const totalGames = allPlinkoBets.length;
    const thousandHit = allPlinkoBets.some(b => b.payoutMultiplier === 1000);

    if (thousandHit) {
        playPredictionSound();
        dashboard.style.border = "2px solid lime";
        dashboard.style.boxShadow = "0 0 20px lime";
        console.log("💎 1000× MULTIPLIER HIT — AUTO STOP");
        clearInterval(autoAdjustLoop);
        clearInterval(dashboardLoop);
        return;
    }

    const safeBaseBet = balance / TOTAL_GAMES;
    const riskMultiplier = Math.min(1 + Math.log10(balance / (startingBalance || 1) + 0.1) * 0.5, 5);
    let targetBet = safeBaseBet * riskMultiplier;

    const hotspot = streakWindows.find(win => totalGames + 1 >= win.start && totalGames + 1 <= win.end);
    if (hotspot && getHotspotColor(hotspot, getAvgHits()) === "green") targetBet *= 2;

    targetBet = Math.min(targetBet, balance * 0.01);
    targetBet = Math.max(targetBet, safeBaseBet);

    console.log(`🎯 Bet: ${targetBet.toFixed(6)} | Bal: ${balance.toFixed(2)}`);
    await delayedBet(targetBet.toFixed(6));
}

// ------------------------------
// 🔁 START MAIN LOOPS
// ------------------------------
const dashboardLoop = setInterval(updateDashboard, 2000);
const autoAdjustLoop = setInterval(adjustBetBasedOnHits, 1000);

console.log("✅ Plinko AI Auto-Bet System Initialized with 1000× Probability Tracker");
