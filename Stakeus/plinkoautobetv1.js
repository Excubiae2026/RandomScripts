// ==UserScript==
// @name         Plinko Auto Bet Adjuster
// @description  Adjusts bet amount automatically based on 29x hits
// ==/UserScript==

const allPlinkoBets = [];

// Capture Plinko bets
function capturePlinkoBet(response) {
  if (!response.plinkoBet) return;

  const bet = response.plinkoBet;
  const captured = {
    id: bet.id,
    payoutMultiplier: bet.payoutMultiplier,
    updatedAt: new Date()
  };

  allPlinkoBets.push(captured);
 // console.log(`Captured Plinko bet #${allPlinkoBets.length}:`, captured);
}

// Hook into window.fetch
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

// Find the bet amount input box dynamically
function getBetInput() {
  return document.querySelector(
    'input[data-testid="input-game-amount"][type="number"]'
  );
}
// Logic to check hits in the last 10 seconds
function adjustBetBasedOnHits() {
  const now = Date.now();
  const tenSecAgo = now - 10000;

  // Get hits in last 10 seconds by multiplier type
  const hits26 = allPlinkoBets.filter(
    b => b.payoutMultiplier === 26 && b.updatedAt.getTime() >= tenSecAgo
  );
  const hits130 = allPlinkoBets.filter(
    b => b.payoutMultiplier === 130 && b.updatedAt.getTime() >= tenSecAgo
  );
  const hits1000 = allPlinkoBets.filter(
    b => b.payoutMultiplier === 1000 && b.updatedAt.getTime() >= tenSecAgo
  );

  const input = getBetInput();
  if (!input) {
    console.warn("⚠️ Could not find bet input box on page.");
    return;
  }

  // Example logic — you can tune the values however you want:
  if (hits1000.length > 0) {
   
    // If 1+ hits, set to 0.002
    if (parseFloat(input.value) !== 0.01) {
      input.value = 0.01;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("🔼 Set bet to 0.004 (recent 29x hit detected)");
    }  
    console.log("🔥 1000x hit detected — suggest 0.004 bet!");
  } else if (hits130.length > 0) {
   
      // If 1+ hits, set to 0.002
    if (parseFloat(input.value) !== 0.01) {
      input.value = 0.01;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("🔼 Set bet to 0.004 (recent 29x hit detected)");
    }
    console.log("⚡ 130x hit detected — suggest 0.002 bet!");
  } else if (hits26.length > 0) {
   
      // If 1+ hits, set to 0.002
    if (parseFloat(input.value) !== 0.0014) {
      input.value = 0.0014;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("🔼 Set bet to 0.004 (recent 29x hit detected)");
    }
    console.log("✨ 26x hit detected — suggest 0.0015 bet!");
  } else {
    input.value = 0.001;
    console.log("🕓 No high hits in last 10s — suggest 0.001 bet.");
  }

  // (Optional) Trigger update visually
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

// Logic to check hits in the last 10 seconds
function adjustBetBasedOnHits() {
  const now = Date.now();
  const tenSecAgo = now - 10000;

  // Get hits in last 10 seconds
  const hits = allPlinkoBets.filter(
    b => b.payoutMultiplier === 26 && b.updatedAt.getTime() >= tenSecAgo
  );

  const input = getBetInput();
  if (!input) {
    console.warn("⚠️ Could not find bet input box on page.");
    return;
  }

  if (hits.length > 0) {
    // If 1+ hits, set to 0.002
    if (parseFloat(input.value) !== 0.01) {
      input.value = 0.01;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("🔼 Set bet to 0.004 (recent 29x hit detected)");
    }
  } else {
    // If no hits, set to 0.01
    if (parseFloat(input.value) !== 0.001) {
      input.value = 0.001;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      console.log("🔽 Set bet to 0.001 (no recent 29x hits)");
    }
  }
}

// Check every 5 seconds
setInterval(adjustBetBasedOnHits, 1000);

console.log("✅ Plinko Auto Bet Adjuster active!");