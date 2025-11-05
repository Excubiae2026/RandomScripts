(function() {
    const pastBets = [];
    let lowBetHistory = []; // timestamps of bets <= 2.00
    let currentBet = 0.01;

    function calculateAutoBet() {
        const now = Date.now();
        // Keep only low bets from last 15 seconds
        lowBetHistory = lowBetHistory.filter(ts => now - ts <= 15000);

        // Set bet amount based on how many low bets occurred in last 15s
        if (lowBetHistory.length >= 3) {
            currentBet = 0.30;
        } else if (lowBetHistory.length >= 2) {
            currentBet = 0.20;
        } else if (lowBetHistory.length >= 1) {
            currentBet = 0.10;
        } else {
            currentBet = 0.01;
        }
    }

    function capturePastBetsAndBet() {
        const buttons = document.querySelectorAll('.past-bets button[data-past-bet-id]');
        buttons.forEach(btn => {
            const betId = btn.dataset.pastBetId;
            const index = parseInt(btn.dataset.lastBetIndex, 10);
            const valueDiv = btn.querySelector('div.contents');
            const value = parseFloat(valueDiv?.textContent || "0");

            if (!pastBets.some(b => b.id === betId)) {
                // Track low bets timestamps
                if (value <= 2.00) lowBetHistory.push(Date.now());

                pastBets.push({
                    id: betId,
                    index: index,
                    value: value,
                    timestamp: new Date().toLocaleTimeString()
                });

                // Update bet input field
                const betInput = document.querySelector('input[data-testid="input-game-amount"]');
                if (betInput) {
                    betInput.value = currentBet;
                    betInput.dispatchEvent(new Event('input', { bubbles: true }));
                }

                // Click the "Play" button
                const playSpan = Array.from(document.querySelectorAll('span[data-ds-text="true"]'))
                    .find(span => span.textContent.trim() === "Play");
                if (playSpan) {
                    const playButton = playSpan.closest('button');
                    if (playButton) {
                        playButton.click();
                        console.log(`🎯 Clicked Play — Bet: ${currentBet.toFixed(2)}`);
                    }
                }
            }
        });
    }

    // Run capture every 100ms
    setInterval(capturePastBetsAndBet, 100);

    // Update betting logic every 100ms
    setInterval(() => {
        calculateAutoBet();
        console.log(`⚡ Low bets (≤2.00) in last 15s: ${lowBetHistory.length}, bet = ${currentBet.toFixed(2)}`);
    }, 100);

    window.pastBetsData = pastBets;

    console.log("✅ Auto-bet script running — 1 bet=0.10 | 2+=0.20 | 3+=0.30");
})();
