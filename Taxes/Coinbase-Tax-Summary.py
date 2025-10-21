import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# -------------------- Settings --------------------
ASSET_NAME = 'BTC'
TXHASH_COL = 'Bitcoin Hash (visit https://www.coinbase.com/tx/[HASH] in your browser for more info)'
TO_ADDRESS_COL = 'To'
FALLBACK_PRICE = 2217.79  # fallback BTC price in USD

# -------------------- Load CSVs --------------------
df = pd.read_csv("transactions.csv")
btc_prices = pd.read_csv("btc_historical.csv", parse_dates=['Date'])
btc_prices.set_index('Date', inplace=True)

# Convert timestamps to UTC
df['Timestamp'] = pd.to_datetime(df['Timestamp'], utc=True)

# -------------------- Separate transaction types --------------------
buys = df[(df['Amount'] > 0) & (df['Transfer Total'].notnull())].copy()
sells = df[(df['Amount'] < 0) & (df['Transfer Total'].notnull())].copy()
outs = df[(df['Amount'] < 0) & (df['Transfer Total'].isnull())].copy()

# -------------------- Prepare FIFO queue --------------------
buy_queue = []
for _, row in buys.iterrows():
    btc_amount = row['Amount']
    cost_usd = float(row['Transfer Total']) + float(row['Transfer Fee'])
    buy_queue.append({'btc': btc_amount, 'usd_per_btc': cost_usd / btc_amount, 'acquired_date': row['Timestamp']})
    print(f"Queued buy: {btc_amount} BTC at ${cost_usd:.2f} total, ${cost_usd/btc_amount:.2f}/BTC")

# -------------------- Helper Functions --------------------
def wrap_text(text, width=30):
    """Wrap long strings into multiple lines for PDF table"""
    if pd.isna(text) or text is None:
        text = ''
    text = str(text)
    return '\n'.join([text[i:i+width] for i in range(0, len(text), width)])

def apply_fifo(btc_needed):
    """Apply FIFO to determine cost basis and acquisition date"""
    global buy_queue
    cost_basis = 0
    date_acquired = None
    while btc_needed > 0 and buy_queue:
        buy = buy_queue[0]
        if buy['btc'] <= btc_needed:
            cost_basis += buy['btc'] * buy['usd_per_btc']
            btc_needed -= buy['btc']
            date_acquired = buy['acquired_date'] if date_acquired is None else date_acquired
            buy_queue.pop(0)
        else:
            cost_basis += btc_needed * buy['usd_per_btc']
            date_acquired = buy['acquired_date'] if date_acquired is None else date_acquired
            buy['btc'] -= btc_needed
            btc_needed = 0
    return cost_basis, date_acquired

def get_btc_price(timestamp):
    """Get historical BTC price from CSV, fallback if missing"""
    date = timestamp.date()
    if date in btc_prices.index:
        return btc_prices.loc[date, 'Close']
    else:
        print(f"Price not found for {date}, using fallback ${FALLBACK_PRICE}")
        return FALLBACK_PRICE

# -------------------- Process Transactions --------------------
results = []

# --- Sells (capital gains/losses) ---
for _, row in sells.iterrows():
    btc_to_sell = -row['Amount']
    proceeds_usd = float(row['Transfer Total']) - float(row['Transfer Fee'])
    cost_basis, date_acquired = apply_fifo(btc_to_sell)
    realized_pl = proceeds_usd - cost_basis
    holding_period = 'Long-term' if date_acquired and (row['Timestamp'] - date_acquired).days > 365 else 'Short-term'
    if date_acquired is None:
        holding_period = 'Unknown'
    
    results.append({
        'Asset': ASSET_NAME,
        'Date Acquired': date_acquired.date() if date_acquired else '',
        'Date Sold': row['Timestamp'].date(),
        'Proceeds USD': round(proceeds_usd, 2),
        'Cost Basis USD': round(cost_basis, 2),
        'Holding Period': holding_period,
        'Gain/Loss USD': round(realized_pl, 2),
        'TxHash': wrap_text(row.get(TXHASH_COL, '')),
        'From Address': '',
        'To Address': row.get(TO_ADDRESS_COL, '')
    })
    print(f"Processed sell: {btc_to_sell} BTC, P/L ${realized_pl:.2f}")

# --- BTC sent to other addresses (losses) ---
for _, row in outs.iterrows():
    btc_to_send = -row['Amount']
    btc_price = get_btc_price(row['Timestamp'])
    sent_loss_usd = btc_to_send * btc_price
    results.append({
        'Asset': ASSET_NAME,
        'Date Acquired': '',
        'Date Sold': row['Timestamp'].date(),
        'Proceeds USD': 0.0,
        'Cost Basis USD': round(sent_loss_usd, 2),
        'Holding Period': 'Unknown',
        'Gain/Loss USD': round(-sent_loss_usd, 2),
        'TxHash': wrap_text(row.get(TXHASH_COL, '')),
        'From Address': '',
        'To Address': row.get(TO_ADDRESS_COL, '')
    })
    print(f"BTC sent: {btc_to_send} BTC on {row['Timestamp'].date()}, loss ${sent_loss_usd:.2f}")

# -------------------- Prepare DataFrame --------------------
combined_df = pd.DataFrame(results)
combined_df.sort_values('Date Sold', inplace=True)
combined_df.reset_index(drop=True, inplace=True)

total_realized = combined_df['Gain/Loss USD'].sum()
print(f"\nTotal Realized Profit/Loss: ${total_realized:.2f}")

# -------------------- PDF Export --------------------
pdf_file = "crypto_profit_loss.pdf"
with PdfPages(pdf_file) as pdf:
    fig, ax = plt.subplots(figsize=(14, max(6, len(combined_df)*0.25)))
    ax.axis('tight')
    ax.axis('off')
    table = ax.table(cellText=combined_df.values,
                     colLabels=combined_df.columns,
                     cellLoc='center',
                     loc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(7)
    table.scale(1, 1.5)  # taller to fit multi-line TxHash
    plt.title("Bitcoin Transaction Realized P/L", fontsize=14, pad=20)
    pdf.savefig(fig, bbox_inches='tight')
    plt.close()

print(f"\nPDF saved as {pdf_file}")
