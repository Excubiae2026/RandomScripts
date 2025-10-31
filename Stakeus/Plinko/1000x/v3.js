// ============================================================
// 🎯 Plinko AI Auto-Bet System v3.4 — Safe-Strategy + Hotkeys + Dashboard + 150ms Interval + Dynamic Boost + Probabilities
// ============================================================

// ------------------------------
// 🔢 DATA STORAGE
// ------------------------------
const allPlinkoBets = [];
let mainData = JSON.parse(localStorage.getItem('plinkoMainData') || '[]');
let streakWindows = JSON.parse(localStorage.getItem('plinkoStreakWindows') || '[]');
let learnedPatterns = JSON.parse(localStorage.getItem('plinkoLearnedPatterns') || '[]');
let predictionHistory = JSON.parse(localStorage.getItem('plinkoPredictionHistory') || '[]');

function saveMainData() { localStorage.setItem('plinkoMainData', JSON.stringify(mainData)); }
function saveStreakWindows() { localStorage.setItem('plinkoStreakWindows', JSON.stringify(streakWindows)); }
function saveLearnedPatterns() { localStorage.setItem('plinkoLearnedPatterns', JSON.stringify(learnedPatterns)); }
function savePredictions() { localStorage.setItem('plinkoPredictionHistory', JSON.stringify(predictionHistory)); }

// ------------------------------
// 🔔 AUDIO + UTILS
// ------------------------------
function playPredictionSound() {
  const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
  audio.volume = 0.4;
  audio.play().catch(() => console.warn("🔇 Sound blocked until user interacts."));
}
function colorEmoji(color) {
  return color === "green" ? "🟩" : color === "yellow" ? "🟨" : "🟥";
}

// ------------------------------
// 📊 BUCKET / HIT LOGIC
// ------------------------------
const TOTAL_GAMES = 50000;
const BUCKET_SIZE = 100;
const bucketCount = Math.ceil(TOTAL_GAMES / BUCKET_SIZE);
const buckets = Array.from({ length: bucketCount }, (_, i) => ({
  start: i * BUCKET_SIZE, end: (i + 1) * BUCKET_SIZE - 1, hits: 0, multipliers: []
}));

function recordHitInBucket(gameNumber, mult) {
  const idx = Math.floor(gameNumber / BUCKET_SIZE);
  if (idx >= 0 && idx < bucketCount) {
    buckets[idx].hits++; buckets[idx].multipliers.push(mult);
  }
}

function recordHighHit(gameNumber, mult) {
  let win = streakWindows.find(w => gameNumber >= w.start && gameNumber <= w.end);
  if (win) { win.hits++; win.multipliers.push(mult); }
  else streakWindows.push({ start: gameNumber - 100, end: gameNumber + 100, hits: 1, multipliers: [mult] });
  saveStreakWindows();
  if (!mainData.find(h => h.gameNumber === gameNumber)) {
    mainData.push({ gameNumber, multiplier: mult });
    saveMainData();
  }
}

function getAvgHits(count = 50) {
  const wins = streakWindows.slice(-count);
  if (!wins.length) return 1;
  return wins.reduce((s, w) => s + w.hits, 0) / wins.length;
}

function getHotspotColor(win, avg) {
  const r = win.hits / avg;
  return r >= 1.5 ? 'green' : r >= 0.8 ? 'yellow' : 'red';
}

// ------------------------------
// 📥 PATTERN LEARNING
// ------------------------------
const PATTERN_LENGTH = 5;
function recordPattern(gameNumber, mult) {
  if (gameNumber <= PATTERN_LENGTH) return;
  const pattern = allPlinkoBets.slice(gameNumber - PATTERN_LENGTH - 1, gameNumber - 1).map(b => b.payoutMultiplier);
  learnedPatterns.push({ pattern, result: mult });
  saveLearnedPatterns();
}

// ------------------------------
// 🧠 CAPTURE BETS
// ------------------------------
function capturePlinkoBet(response) {
  const bets = response.plinkoBet ? [response.plinkoBet] : response.bets || [];
  if (!bets.length) return;

  for (const b of bets) {
    const n = allPlinkoBets.length + 1;
    allPlinkoBets.push({ id: b.id, payoutMultiplier: b.payoutMultiplier, updatedAt: new Date(), gameNumber: n });

    if ([9,26,130,1000].includes(b.payoutMultiplier)) {
      recordHighHit(n, b.payoutMultiplier); 
      recordHitInBucket(n, b.payoutMultiplier); 
      recordPattern(n, b.payoutMultiplier);
    }

    updateSafeStrategy(b.payoutMultiplier);
  }
}

// Hook network
const origFetch = window.fetch;
window.fetch = async function(...args){
  const res = await origFetch.apply(this,args);
  try { 
    const c = res.clone(); 
    const d = await c.json(); 
    capturePlinkoBet(d); 
  } catch {}
  return res;
};

(function(){
  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m,u){
    this.addEventListener("load", function(){
      try { const d = JSON.parse(this.responseText); capturePlinkoBet(d); } catch {}
    }); 
    open.apply(this, arguments);
  };
})();

// ------------------------------
// ⚙️ SYSTEM VARS
// ------------------------------
let inSafetyMode=false, autoAdjustEnabled=true, startingBalance=null;
let autoClickerInterval=null, dashboardLoop=null, autoAdjustLoop=null;
let betBoostFactor=1.0;

// ------------------------------
// 🧮 HELPERS
// ------------------------------
async function getBalance(){
  const sel='button[data-active-currency="sweeps"] .text-neutral-default.ds-body-md-strong';
  return new Promise(r=>{
    let a=0;const i=setInterval(()=>{
      const e=document.querySelector(sel);a++;
      if(e){clearInterval(i);r(parseFloat(e.textContent.replace(/,/g,''))); }
      else if(a>=10){clearInterval(i);r(null);}
    },100);
  });
}

function getBetInput(){return document.querySelector('input[data-testid="input-game-amount"][type="number"]');}

async function delayedBet(v){
  const input=getBetInput(); if(!input)return;
  await new Promise(r=>setTimeout(r,150+Math.random()*50));
  input.value=v; input.dispatchEvent(new Event("input",{bubbles:true}));
}

async function getNetGain(){
  const e=document.querySelector('span[data-testid="bets-stats-profit"]');
  if(!e)return 0; const v=parseFloat(e.textContent.replace(/,/g,'')); return isNaN(v)?0:v;
}

// ------------------------------
// 📈 PROBABILITY
// ------------------------------
function getHitProbability(multiplier, cur = allPlinkoBets.length, end = TOTAL_GAMES) {
  const hits = allPlinkoBets.filter(b => b.payoutMultiplier === multiplier);
  if (!hits.length || allPlinkoBets.length === 0) return 0;
  const total = end - cur;
  const future = hits.filter(h => h.gameNumber >= cur && h.gameNumber <= end);
  const rate = hits.length / allPlinkoBets.length;
  const obs = future.length / total;
  const prob = ((rate * 0.6 + obs * 0.4) * 100).toFixed(2);
  return prob;
}

// Keep compatibility
function get1000xHitProbability() {
  return getHitProbability(1000);
}

// ------------------------------
// 🖥️ DASHBOARD + HOTKEY LEGEND
// ------------------------------
const dash=document.createElement('div');
dash.style.cssText='position:fixed;top:10px;right:10px;width:370px;background:#111;color:#fff;font-family:sans-serif;font-size:12px;z-index:9999;padding:10px;border-radius:8px;box-shadow:0 0 8px #000;';
document.body.appendChild(dash);

const legend=document.createElement('div');
legend.style.cssText='position:fixed;top:10px;right:395px;width:180px;background:#000;color:#0f0;font-family:monospace;font-size:11px;padding:8px;border-radius:8px;z-index:9999;display:none;';
legend.innerHTML=`
<b>🎮 Hotkeys</b><br>
Q → +10% bet<br>
W → -10% bet<br>
A → Toggle auto adjust<br>
S → Toggle safety<br>
Z → Start auto-click<br>
X → Stop auto-click<br>
P → One manual click<br>
O → Toggle dashboard<br>
R → Boost +10%<br>
F → Boost -10%`;
document.body.appendChild(legend);

// ------------------------------
// ⏱️ 0.2x per second gain tracker
// ------------------------------
let lastBalance = null;
let gainPerSec = 0;

async function trackGainPerSecond() {
  const bal = await getBalance();
  if (bal === null) return;
  if (lastBalance !== null) gainPerSec = bal - lastBalance;
  lastBalance = bal;
}

// ------------------------------
// ⚙️ SAFE STRATEGY AI
// ------------------------------
const SAFEZONE_PERCENT = 0.01;
const STRAT_STEP = 0.1;
let safeStrat = { betMultiplier: 1.0, lastResult: 0 };

function updateSafeStrategy(multiplier) {
  safeStrat.lastResult = multiplier;
  if(multiplier > 1) safeStrat.betMultiplier *= 1 + STRAT_STEP;
  else safeStrat.betMultiplier *= 1 - STRAT_STEP;
  safeStrat.betMultiplier = Math.max(0.5, Math.min(2, safeStrat.betMultiplier));
}

async function adjustBetSafeStrategy() {
  if (!autoAdjustEnabled) return;
  const bal = await getBalance();
  if (!bal) return;
  const input = getBetInput();
  if (!input) return;
  if (startingBalance === null && bal > 0) startingBalance = bal;

  let safeBet = bal * SAFEZONE_PERCENT;
  let bet = safeBet * safeStrat.betMultiplier * betBoostFactor;

  bet = Math.min(bet, bal * SAFEZONE_PERCENT);
  bet = Math.max(bet, 0.000001);

  await delayedBet(bet.toFixed(6));
}

// ------------------------------
// 🎮 HOTKEYS + AUTO-CLICKER
// ------------------------------
function pressPlayButton(){
  const btn = document.querySelector('button[data-testid="bet-button"]');
  if(!btn || btn.disabled) return;

  if(allPlinkoBets.length >= TOTAL_GAMES){
    if(autoClickerInterval){ clearInterval(autoClickerInterval); autoClickerInterval = null; alert('🚨 Reached 50,000 bets! Auto-clicker stopped.'); }
    return;
  }
  if(allPlinkoBets.some(b => b.payoutMultiplier === 1000)){
    if(autoClickerInterval){ clearInterval(autoClickerInterval); autoClickerInterval = null; alert('🏆 1000x hit detected! Auto-clicker stopped.'); }
    return;
  }

  btn.click();
}

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  const inp = getBetInput();
  if(!inp) return;
  let val = parseFloat(inp.value) || 0;

  if(k === 'q'){ val *= 1.1; }
  if(k === 'w'){ val *= 0.9; }
  if(['q','w'].includes(k)){ inp.value = val.toFixed(6); inp.dispatchEvent(new Event('input',{bubbles:true})); }

  if(k === 'a'){ autoAdjustEnabled = !autoAdjustEnabled; }
  if(k === 's'){ inSafetyMode = !inSafetyMode; }
  if(k === 'z' && !autoClickerInterval){ autoClickerInterval = setInterval(pressPlayButton,150); }
  if(k === 'x' && autoClickerInterval){ clearInterval(autoClickerInterval); autoClickerInterval=null; }
  if(k === 'p'){ pressPlayButton(); }
  if(k === 'o'){ dash.style.display = dash.style.display==='none'?'block':'none'; legend.style.display = legend.style.display==='none'?'block':'none'; }
  if(k==='r'){ betBoostFactor*=1.1; }
  if(k==='f'){ betBoostFactor*=0.9; }
});

// ------------------------------
// 📊 DASHBOARD LOOP
// ------------------------------
async function updateDashboard() {
  const bal = await getBalance();
  const net = await getNetGain();
  const avgHits = getAvgHits(50);
  let html = `<b>Plinko AI v3.4 — Safe-Strategy</b><br>`;
  html += `Balance: ${bal ? bal.toFixed(2) : 'N/A'}<br>`;
  html += `Net Gain: ${net.toFixed(2)}<br>`;
  html += `Bet Boost: ${(betBoostFactor*100).toFixed(1)}%<br>`;
  html += `Auto-Adjust: ${autoAdjustEnabled ? '✅':'❌'}<br>`;
  html += `Safe Mode: ${inSafetyMode ? '✅':'❌'}<br>`;
  html += `Last Safe Mult: ${safeStrat.betMultiplier.toFixed(2)}<br>`;
  html += `Avg Hits (50): ${avgHits.toFixed(2)}<br>`;
  html += `26x Hit Prob: ${getHitProbability(26)}%<br>`;
  html += `130x Hit Prob: ${getHitProbability(130)}%<br>`;
  html += `1000x Hit Prob: ${getHitProbability(1000)}%<br>`;
  dash.innerHTML = html;
}

// ------------------------------
// ⏱️ LOOPS
// ------------------------------
if(!dashboardLoop) dashboardLoop=setInterval(updateDashboard,500);
if(!autoAdjustLoop) autoAdjustLoop=setInterval(adjustBetSafeStrategy,500);

// ============================================================
// ✅ FULL v3.4 WITH 26x, 130x, 1000x PROBABILITIES + SAFE STRATEGY
// ============================================================
console.log("🚀 Plinko AI v3.4 loaded — Safe-Strategy active + Probabilities Enabled");
