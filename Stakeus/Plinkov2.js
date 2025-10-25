// ==UserScript==
// @name         Plinko Auto Bet Adjuster + Hotspot Analyzer + Smart Auto-Clicker + Hotkeys
// @description  Auto-adjust bets, track hotspots, color hotspots, auto-click Play with hotkeys (1=start, 2=stop)
// ==/UserScript==

// ------------------------------
// 🔢 DATA STORAGE
// ------------------------------
const allPlinkoBets = [];
let mainData = JSON.parse(localStorage.getItem('plinkoMainData') || '[]');
let streakWindows = JSON.parse(localStorage.getItem('plinkoStreakWindows') || '[]');
const BUCKET_SIZE = 100;
const TOTAL_GAMES = 40000;
const bucketCount = Math.ceil(TOTAL_GAMES / BUCKET_SIZE);
const buckets = Array.from({ length: bucketCount }, (_, i) => ({
    start: i * BUCKET_SIZE,
    end: (i + 1) * BUCKET_SIZE - 1,
    hits: 0,
    multipliers: []
}));

function saveStreakWindows() { localStorage.setItem('plinkoStreakWindows', JSON.stringify(streakWindows)); }
function saveMainData() { localStorage.setItem('plinkoMainData', JSON.stringify(mainData)); }

// ------------------------------
// 📥 CAPTURE PLINKO BETS
// ------------------------------
function capturePlinkoBet(response) {
    const bets = response.plinkoBet ? [response.plinkoBet] : response.bets || [];
    if (!bets.length) return;

    for (const bet of bets) {
        const gameNumber = allPlinkoBets.length + 1;
        const mult = Number(bet.payoutMultiplier);

        allPlinkoBets.push({
            id: bet.id,
            payoutMultiplier: mult,
            updatedAt: new Date(),
            gameNumber
        });

        if ([26, 130, 1000].includes(mult)) {
            recordHighHit(gameNumber, mult);
            recordHitInBucket(gameNumber, mult);
        }
    }
}

// Hook fetch
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

// Hook XHR
(function() {
    const open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        this.addEventListener("load", function() {
            try {
                const data = JSON.parse(this.responseText);
                capturePlinkoBet(data);
            } catch {}
        });
        open.apply(this, arguments);
    };
})();

// ------------------------------
// 🌟 HOTSPOT LOGIC
// ------------------------------
function recordHighHit(gameNumber, multiplier) {
    let hotspot = streakWindows.find(win => gameNumber >= win.start && gameNumber <= win.end);

    if (hotspot) {
        hotspot.hits++;
        hotspot.multipliers.push(Number(multiplier));
    } else {
        const windowSize = 100;
        streakWindows.push({
            start: gameNumber - windowSize,
            end: gameNumber + windowSize,
            hits: 1,
            multipliers: [Number(multiplier)]
        });
    }

    saveStreakWindows();

    if (!mainData.find(h => h.gameNumber === gameNumber)) {
        mainData.push({ gameNumber, multiplier: Number(multiplier) });
        saveMainData();
    }
}

// ------------------------------
// 📊 HOTSPOT COLORS
// ------------------------------
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

function displayHotspotsWithColors() {
    const avgHits = getAvgHits();
    const tableData = streakWindows.map((win, idx) => {
        const counts = { 26:0, 130:0, 1000:0 };
        win.multipliers.forEach(m => { const num = Number(m); if (counts[num] !== undefined) counts[num]++; });
        return {
            Index: idx,
            Start: win.start,
            End: win.end,
            Hits: win.hits,
            Counts: counts,
            Color: getHotspotColor(win, avgHits)
        };
    });
    console.table(tableData);
}
setInterval(displayHotspotsWithColors, 5000);

// ------------------------------
// 📊 BUCKET LOGIC
// ------------------------------
function recordHitInBucket(gameNumber, multiplier) {
    const index = Math.floor(gameNumber / BUCKET_SIZE);
    if (index >= 0 && index < bucketCount) {
        buckets[index].hits++;
        buckets[index].multipliers.push(multiplier);
    }
}

// ------------------------------
// ⚙️ BET ADJUSTER
// ------------------------------
let inSafetyMode = false;
async function getBalance() {
    const selector = 'button[data-active-currency="sweeps"] .text-neutral-default.ds-body-md-strong';
    return new Promise(resolve => {
        let attempts = 0;
        const maxAttempts = 10;
        const interval = setInterval(() => {
            const el = document.querySelector(selector);
            attempts++;
            if (el) {
                clearInterval(interval);
                resolve(parseFloat(el.textContent.replace(/,/g, '')));
            } else if (attempts >= maxAttempts) {
                clearInterval(interval);
                resolve(null);
            }
        }, 100);
    });
}

function getBetInput() {
    return document.querySelector('input[data-testid="input-game-amount"][type="number"]');
}

async function adjustBetBasedOnHits() {
    const balance = await getBalance();
    if (!balance) return;
    const input = getBetInput();
    if (!input) return;

    const safeBaseBet = balance / TOTAL_GAMES;
    let baseMultiplierBets = { 9: safeBaseBet, 26: safeBaseBet*4, 130: safeBaseBet*7, 1000: safeBaseBet*5 };
    const multiplierBets = {};
    for (const [mult, value] of Object.entries(baseMultiplierBets))
        multiplierBets[mult] = inSafetyMode ? value*0.5 : value;

    const now = Date.now();
    const tenSecAgo = now - 10000;
    let recentMultiplier = null;
    for (const multiplier of Object.keys(multiplierBets)) {
        const hit = allPlinkoBets.find(b => b.payoutMultiplier === parseInt(multiplier) && b.updatedAt.getTime() >= tenSecAgo);
        if (hit) { recentMultiplier = multiplier; break; }
    }

    const currentGame = allPlinkoBets.length + 1;
    let targetBet = recentMultiplier ? multiplierBets[recentMultiplier] : safeBaseBet;

    const hotspot = streakWindows.find(win => currentGame >= win.start && currentGame <= win.end);
    if (hotspot) {
        const counts = { 26:0,130:0,1000:0 };
        hotspot.multipliers.forEach(m => { const num = Number(m); if (counts[num] !== undefined) counts[num]++; });

        const avgHits = getAvgHits();
        const dynamicMultiplier = (count, baseScale) => 1 + ((count / avgHits) * (baseScale - 1));

        targetBet *= dynamicMultiplier(counts[26],3);
        targetBet *= dynamicMultiplier(counts[130],7);
        if(counts[1000]>0) targetBet *= dynamicMultiplier(counts[1000],5);

        const maxBet = balance * 0.10;
        targetBet = Math.min(targetBet, maxBet);

        console.log(`💥 Dynamic hotspot bet: ${targetBet.toFixed(6)} (26=${counts[26]},130=${counts[130]},1000=${counts[1000]},avg=${avgHits.toFixed(2)},color=${getHotspotColor(hotspot, avgHits)})`);
    }

    if (parseFloat(input.value) !== targetBet) {
        input.value = targetBet;
        input.dispatchEvent(new Event("input",{bubbles:true}));
        console.log(`${recentMultiplier?"🔼":"🔽"} Set bet to ${targetBet.toFixed(6)}${inSafetyMode?" ⚠️[Safety]":""}`);
    }
}
setInterval(adjustBetBasedOnHits,1000);

// ------------------------------
// 🖱️ AUTO CLICKER + HOTKEYS
// ------------------------------
let clickerInterval = null;

function clickPlayButton() {
    const button = document.querySelector('button[data-testid="bet-button"]');
    if (button) button.click();
}

function startClicker(speedMs = 100) {
    if (clickerInterval) return;
    clickerInterval = setInterval(() => {
        clickPlayButton();
        const recentHit1000 = allPlinkoBets.slice(-50).find(b => b.payoutMultiplier === 1000);
        if (recentHit1000) stopClicker();
    }, speedMs);
    console.log("▶️ Auto-clicker started.");
}

function stopClicker() {
    if (!clickerInterval) return;
    clearInterval(clickerInterval);
    clickerInterval = null;
    console.log("⏹️ Auto-clicker stopped.");
}

// 🔥 Hotkey support
window.addEventListener('keydown', (e) => {
    if (e.key === '1') startClicker();
    if (e.key === '2') stopClicker();
});

// ------------------------------
// 📉 SAFETY MODE
// ------------------------------
let lastPayout = null;
let consecutiveLosses = 0;
const SAFETY_LOSS_THRESHOLD = 3;

function checkPayoutPattern() {
    if (allPlinkoBets.length < 2) return;
    const latest = allPlinkoBets[allPlinkoBets.length - 1];
    const previous = allPlinkoBets[allPlinkoBets.length - 2];
    consecutiveLosses = latest.payoutMultiplier < previous.payoutMultiplier ? consecutiveLosses + 1 : 0;
    inSafetyMode = consecutiveLosses >= SAFETY_LOSS_THRESHOLD;
    lastPayout = latest.payoutMultiplier;
}
setInterval(checkPayoutPattern, 1000);

console.log("✅ Plinko Auto Bet Adjuster + Hotkeys active (Press 1=Start, 2=Stop).");
