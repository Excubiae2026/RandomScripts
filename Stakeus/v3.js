// ============================================================
// 🎯 Plinko AI Auto-Bet System v3.5 — Local Save + Restore
// ============================================================

// ------------------------------
// 🔢 DATA STORAGE (now fully persistent)
// ------------------------------
let allPlinkoBets = JSON.parse(localStorage.getItem('plinkoAllBets') || '[]');
let mainData = JSON.parse(localStorage.getItem('plinkoMainData') || '[]');
let streakWindows = JSON.parse(localStorage.getItem('plinkoStreakWindows') || '[]');
let learnedPatterns = JSON.parse(localStorage.getItem('plinkoLearnedPatterns') || '[]');
let predictionHistory = JSON.parse(localStorage.getItem('plinkoPredictionHistory') || '[]');

function saveAllBets() { localStorage.setItem('plinkoAllBets', JSON.stringify(allPlinkoBets)); }
function saveMainData() { localStorage.setItem('plinkoMainData', JSON.stringify(mainData)); }
function saveStreakWindows() { localStorage.setItem('plinkoStreakWindows', JSON.stringify(streakWindows)); }
function saveLearnedPatterns() { localStorage.setItem('plinkoLearnedPatterns', JSON.stringify(learnedPatterns)); }
function savePredictions() { localStorage.setItem('plinkoPredictionHistory', JSON.stringify(predictionHistory)); }

function clearPlinkoData() {
  localStorage.removeItem('plinkoAllBets');
  localStorage.removeItem('plinkoMainData');
  localStorage.removeItem('plinkoStreakWindows');
  localStorage.removeItem('plinkoLearnedPatterns');
  localStorage.removeItem('plinkoPredictionHistory');
  allPlinkoBets = [];
  mainData = [];
  streakWindows = [];
  learnedPatterns = [];
  predictionHistory = [];
  console.log('🧹 Local Plinko data cleared.');
}

// ------------------------------
// 🔔 AUDIO + UTILS
// ------------------------------
function playPredictionSound() {
  const audio = new Audio("https://actions.google.com/sounds/v1/alarms/alarm_clock.ogg");
  audio.volume = 0.5;
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
function getAvgHits(count = 5) {
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
const PATTERN_LENGTH = 25;
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
    saveAllBets();

    if ([9,26,130,1000].includes(b.payoutMultiplier)) {
      recordHighHit(n, b.payoutMultiplier); 
      recordHitInBucket(n, b.payoutMultiplier); 
      recordPattern(n, b.payoutMultiplier);
    }
  }
}
// Hook network
const origFetch = window.fetch;
window.fetch = async function(...args){
  const res = await origFetch.apply(this,args);
  try{ const c=res.clone(); const d=await c.json(); capturePlinkoBet(d); }catch{}
  return res;
};
(function(){
  const open=XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open=function(m,u){
    this.addEventListener("load",function(){
      try{const d=JSON.parse(this.responseText);capturePlinkoBet(d);}catch{}
    }); open.apply(this,arguments);
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
      if(e){clearInterval(i);r(parseFloat(e.textContent.replace(/,/g,'')));}
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
function get1000xHitProbability(cur=allPlinkoBets.length, end=TOTAL_GAMES){
  const hits=allPlinkoBets.filter(b=>b.payoutMultiplier===1000);
  if(!hits.length)return 0;
  const total=end-cur; const future=hits.filter(h=>h.gameNumber>=cur&&h.gameNumber<=end);
  const rate=hits.length/allPlinkoBets.length; const exp=total*rate;
  const obs=future.length/total; return ((rate*0.6+obs*0.4)*100).toFixed(2);
}

// ------------------------------
// 🖥️ ENHANCED DASHBOARD + HOTKEY LEGEND
// ------------------------------
const dash = document.createElement('div');
dash.style.cssText = `
  position:fixed;top:10px;right:10px;width:390px;background:#111;color:#fff;
  font-family:'Consolas',monospace;font-size:12px;z-index:9999;padding:10px;
  border-radius:8px;box-shadow:0 0 10px rgba(0,255,100,0.3);
  border:1px solid rgba(0,255,100,0.2);
`;
document.body.appendChild(dash);

const legend = document.createElement('div');
legend.style.cssText = `
  position:fixed;top:10px;right:415px;width:180px;background:#000;
  color:#0f0;font-family:monospace;font-size:11px;padding:8px;
  border-radius:8px;z-index:9999;display:none;
`;
legend.innerHTML = `
<b>🎮 Hotkeys</b><br>
Q → +10% bet<br>
W → -10% bet<br>
A → Toggle auto adjust<br>
S → Toggle safety<br>
Z → Start auto-click<br>
X → Stop auto-click<br>
P → One manual click<br>
O → Toggle dashboard`;
document.body.appendChild(legend);

function updateDashboard() {
  const avg = getAvgHits();
  const total = allPlinkoBets.length;
  const prob = get1000xHitProbability();
  const all1000s = allPlinkoBets.filter(b => b.payoutMultiplier === 1000);

  let last1000 = all1000s.length ? all1000s[all1000s.length - 1] : null;
  let lastGame = last1000 ? last1000.gameNumber : "N/A";
  let sinceLast = last1000 ? (total - lastGame) : "N/A";

  let avgSpacing = "N/A";
  if (all1000s.length > 1) {
    let diffs = all1000s.slice(1).map((hit, i) => hit.gameNumber - all1000s[i].gameNumber);
    avgSpacing = (diffs.reduce((a, b) => a + b, 0) / diffs.length).toFixed(0);
  }

  let hot = "None";
  if (all1000s.length) {
    const nearHot = streakWindows
      .filter(w => w.multipliers.includes(1000))
      .slice(-3)
      .map(w => `💎 [${w.start}-${w.end}] hits:${w.hits}`)
      .join(' ');
    hot = nearHot || "No recent 1000× zones";
  }

  dash.innerHTML = `
  <div style="color:#0f0;font-weight:bold;font-size:13px;">🤖 Plinko AI Dashboard - 3.5</div>
  <hr style="border:0;border-top:1px solid #333;margin:4px 0;">
  <div>💰 <b>Balance Goal:</b> ${startingBalance ? (startingBalance * 1000).toFixed(2) : "..."}</div>
  <div>🎯 <b>Boost:</b> ×${betBoostFactor.toFixed(1)} | 🛡️ ${inSafetyMode ? "Safety ON" : "Safety OFF"}</div>
  <div>📈 <b>Avg Hits:</b> ${avg.toFixed(2)} | <b>Bets Logged:</b> ${total}</div>
  <hr style="border:0;border-top:1px solid #333;margin:4px 0;">
  <div>💎 <b>1000× Stats</b></div>
  <div>• Last Hit: ${lastGame}</div>
  <div>• Since Last: ${sinceLast}</div>
  <div>• Avg Gap: ${avgSpacing}</div>
  <div>• 1000× Probability (Next 10k): ${prob}%</div>
  ${all1000s.length ? `<div style="margin-top:6px;">🔥 <b>Hotspots:</b> ${hot}</div>` : ""}
  `;
}

let dashVisible = true;
function toggleDashboard() {
  dashVisible = !dashVisible;
  dash.style.display = dashVisible ? 'block' : 'none';
  legend.style.display = dashVisible ? 'block' : 'none';
}

// ------------------------------
// ⚙️ SMART BET ADJUSTMENT
// ------------------------------
async function adjustBetBasedOnHits() {
  if (!autoAdjustEnabled) return;

  const bal = await getBalance(); if (!bal) return;
  const input = getBetInput(); if (!input) return;

  if (startingBalance === null && bal > 0) {
    startingBalance = bal;
    console.log(`💰 Starting Balance: ${bal}`);
  }

  const net = await getNetGain();
  const total = allPlinkoBets.length;

  if (total >= 40000 && total <= 50000) {
    const tinyBet = 0.01 + ((total - 40000) / 10000) * 0.01;
    await delayedBet(tinyBet.toFixed(6));
    console.log(`🎯 Tiny bet active: ${tinyBet.toFixed(6)} Sweeps (Game ${total})`);
    return;
  }

  if (allPlinkoBets.some(b => b.payoutMultiplier === 1000)) {
    clearInterval(autoClickerInterval); 
    clearInterval(autoAdjustLoop);
    playPredictionSound(); 
    dash.style.border = '2px solid lime'; 
    return;
  }

  const safe = bal / TOTAL_GAMES;
  const prog = startingBalance ? bal / startingBalance : 1;
  const risk = Math.min(1 + Math.log10(prog + 0.1) * 0.5, 5);
  let bet = safe * risk * betBoostFactor;

  const cur = total + 1;
  const hot = streakWindows.find(w => cur >= w.start && cur <= w.end);
  if (hot && getHotspotColor(hot, getAvgHits()) === 'green') {
    bet *= 2;
  }

  bet = Math.min(bet, bal * 0.01);
  bet = Math.max(bet, safe);
  await delayedBet(bet.toFixed(6));
}

// ------------------------------
// 🎯 PLAY BUTTON / AUTO CLICKER
// ------------------------------
function pressPlayButton(){
  const btn = document.querySelector('button[data-testid="bet-button"]');
  if(!btn || btn.disabled) return;

  if(allPlinkoBets.length >= TOTAL_GAMES){
    if(autoClickerInterval){
      clearInterval(autoClickerInterval);
      autoClickerInterval = null;
      alert('🚨 Reached 40,000 bets! Auto-clicker stopped.');
      console.log('⏹️ Auto-clicker stopped due to 40,000 bets');
    }
    return;
  }

  if(allPlinkoBets.some(b => b.payoutMultiplier === 1000)){
    if(autoClickerInterval){
      clearInterval(autoClickerInterval);
      autoClickerInterval = null;
      alert('🏆 1000x hit detected! Auto-clicker stopped.');
      console.log('⏹️ Auto-clicker stopped due to 1000x hit');
    }
    return;
  }

  btn.click();
}

// ------------------------------
// 🎮 HOTKEYS
// ------------------------------
document.addEventListener('keydown',e=>{
  const k=e.key.toLowerCase(); const inp=getBetInput(); if(!inp)return;
  let val=parseFloat(inp.value)||0;
  if(k==='q'){val*=1.1;}
  if(k==='w'){val*=0.9;}
  if(['q','w'].includes(k)){
    inp.value=val.toFixed(6); inp.dispatchEvent(new Event('input',{bubbles:true}));
    console.log(`🎚️ Bet adjusted: ${val.toFixed(6)}`);
  }
  if(k==='a'){autoAdjustEnabled=!autoAdjustEnabled;console.log(`⚙️ Auto-adjust: ${autoAdjustEnabled}`);}
  if(k==='s'){inSafetyMode=!inSafetyMode;console.log(`🛡️ Safety mode: ${inSafetyMode}`);}
  if(k==='z'&&!autoClickerInterval){
    autoClickerInterval=setInterval(pressPlayButton,100);
    console.log('▶️ Auto-clicker started (100ms)');
  }
  if(k==='x'&&autoClickerInterval){
    clearInterval(autoClickerInterval);autoClickerInterval=null;
    console.log('⏹️ Auto-clicker stopped');
  }
  if(k==='p'){pressPlayButton();}
  if(k==='o'){toggleDashboard();}
});

// ------------------------------
// 🔁 MAIN LOOPS
// ------------------------------
dashboardLoop=setInterval(updateDashboard,2000);
autoAdjustLoop=setInterval(adjustBetBasedOnHits,500);
console.log("✅ Plinko AI Auto-Bet System v3.5 Initialized (with local save + restore)");
