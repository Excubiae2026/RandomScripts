const allPlinkoBets = [];

function capturePlinkoBet(response) {
  if (!response.plinkoBet) return;
  const bet = response.plinkoBet;
  const captured = {
    id: bet.id,
    payoutMultiplier: bet.payoutMultiplier,
    updatedAt: new Date()
  };
  allPlinkoBets.push(captured);
}

// Hook fetch to intercept Plinko bets
const originalFetch = window.fetch;
window.fetch = async function (...args) {
  const response = await originalFetch.apply(this, args);
  try {
    const cloned = response.clone();
    const data = await cloned.json();
    capturePlinkoBet(data);
  } catch {
    // Ignore non-JSON responses
  }
  return response;
};

// ==========================
// 💰 Helpers
// ==========================
function getBetInput() {
  return document.querySelector('input[data-testid="input-game-amount"][type="number"]');
}

function getPlayButton() {
  return document.querySelector('button[data-testid="bet-button"]');
}

function getBalance() {
  const selector = 'button[data-active-currency="sweeps"] .text-neutral-default.ds-body-md-strong';
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
      const el = document.querySelector(selector);
      attempts++;
      if (el) {
        clearInterval(interval);
        const balance = parseFloat(el.textContent.replace(/,/g, ''));
        resolve(balance);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        resolve(null);
      }
    }, 100);
  });
}

// ==========================
// 🎯 Auto Bet Adjuster Logic
// ==========================
async function adjustBetBasedOnHits() {
  const balance = await getBalance();
  if (!balance) {
    console.warn("⚠️ Could not read balance.");
    return;
  }

  const input = getBetInput();
  if (!input) {
    console.warn("⚠️ Could not find bet input box on page.");
    return;
  }

  const now = Date.now();
  const tenSecAgo = now - 10000;

  const hits26 = allPlinkoBets.filter(b => b.payoutMultiplier === 26 && b.updatedAt.getTime() >= tenSecAgo);
  const hits130 = allPlinkoBets.filter(b => b.payoutMultiplier === 130 && b.updatedAt.getTime() >= tenSecAgo);
  const hits1000 = allPlinkoBets.filter(b => b.payoutMultiplier === 1000 && b.updatedAt.getTime() >= tenSecAgo);

  let targetBet = balance * 0.001; // Default base bet

  if (hits1000.length > 0) {
    targetBet = balance * 0.005;
    console.log("🔥 1000x hit detected — increasing bet to", targetBet.toFixed(6));
  } else if (hits130.length > 0) {
    targetBet = balance * 0.003;
    console.log("⚡ 130x hit detected — increasing bet to", targetBet.toFixed(6));
  } else if (hits26.length > 0) {
    targetBet = balance * 0.002;
    console.log("✨ 26x hit detected — increasing bet to", targetBet.toFixed(6));
  } else {
    console.log("🕓 No recent high hits — base bet at", targetBet.toFixed(6));
  }

  if (parseFloat(input.value) !== targetBet) {
    input.value = targetBet;
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

// Run bet adjustment every second
setInterval(adjustBetBasedOnHits, 1000);

console.log("✅ Plinko Auto Bet Adjuster active!");

// ==========================
// 🖱️ Auto Play Button Control
// ==========================
let clickerInterval = null;

function pressPlayButton() {
  const playButton = getPlayButton();
  if (playButton) {
    playButton.click();
    console.log("🎯 Pressed Play!");
  } else {
    console.warn("⚠️ Play button not found!");
  }
}

function startClicker() {
  if (clickerInterval) {
    console.warn("⚠️ Clicker already running!");
    return;
  }

  console.log("🚀 Started pressing Play automatically!");
  clickerInterval = setInterval(() => {
    pressPlayButton();
    adjustBetBasedOnHits();

    // Stop automatically on 1000x hit
    const hit1000 = allPlinkoBets.find(b => b.payoutMultiplier === 1000);
    if (hit1000) {
      console.log("🔥 1000x hit detected — stopping Play!");
      stopClicker();
    }
  }, 150); // Adjust how fast it presses (in ms)
}

function stopClicker() {
  if (!clickerInterval) {
    console.warn("⚠️ Clicker not running.");
    return;
  }
  clearInterval(clickerInterval);
  clickerInterval = null;
  console.log("🛑 Stopped pressing Play.");
}
