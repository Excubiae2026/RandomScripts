// Array to store all captured Plinko bets
const allPlinkoBets = [];

// Helper function to process a Plinko bet response
function capturePlinkoBet(response) {
  if (!response.plinkoBet) return;

  const bet = response.plinkoBet;

  // Store the essential information
  const captured = {
    id: bet.id,
    amount: bet.amount,
    amountMultiplier: bet.amountMultiplier,
    payout: bet.payout,
    payoutMultiplier: bet.payoutMultiplier,
    currency: bet.currency,
    updatedAt: bet.updatedAt,
    userId: bet.user.id,
    userName: bet.user.name,
    state: bet.state
  };

  allPlinkoBets.push(captured);
  console.log(`Captured Plinko bet #${allPlinkoBets.length}:`, captured);
}

// Example: intercepting fetch responses
// Override window.fetch to capture Plinko responses
const originalFetch = window.fetch;
window.fetch = async function(...args) {
  const response = await originalFetch.apply(this, args);
  
  try {
    // Clone the response so we can read it without affecting the app
    const cloned = response.clone();
    const data = await cloned.json();

    // Check if it has a plinkoBet
    capturePlinkoBet(data);
  } catch (err) {
    // Ignore non-JSON responses
  }

  return response; // Return the original response to not break the app
};

// Function to download captured bets as CSV
function downloadCSV() {
  if (!allPlinkoBets.length) {
    console.log('No bets to export!');
    return;
  }

  const csvRows = [
    ['ID', 'User', 'Amount', 'Amount Multiplier', 'Payout', 'Payout Multiplier', 'Currency', 'UpdatedAt', 'State'],
    ...allPlinkoBets.map(b => [
      b.id,
      b.userName,
      b.amount,
      b.amountMultiplier,
      b.payout,
      b.payoutMultiplier,
      b.currency,
      b.updatedAt,
      JSON.stringify(b.state)
    ])
  ];

  const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.map(r => r.join(',')).join('\n');
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', 'all_plinko_bets.csv');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  console.log('CSV downloaded!');
}
