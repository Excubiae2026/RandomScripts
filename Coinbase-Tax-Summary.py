import pandas as pd
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages

# -------------------- Load Data --------------------
df = pd.read_csv("transactions.csv")
btc_prices = pd.read_csv("btc_historical.csv", parse_dates=['Date'])
btc_prices.set_index('Date', inplace=True)

df['Timestamp'] = pd.to_datetime(df['Timestamp'], utc=True)

# Separate transaction types
buys = df[(df['Amount'] > 0) & (df['Transfer Total'].notnull())].copy()
sells = df[(df['Amount'] < 0) & (df['Transfer Total'].notnull())].copy()
outs = df[(df['Amount'] < 0) & (df['Transfer Total'].isnull())].copy()

# -------------------- FIFO Queue for Buys --------------------
buy_queue = []
for _, row in buys.iterrows():
    btc_amount = row['Amount']
    cost_usd = float(row['Transfer Total']) + float(row['Transfer Fee'])
    buy_queue.append({
        'btc': btc_amount,
        'usd_per_btc': cost_usd / btc_amount,
        'date_acquired': row['Timestamp']
    })
    print(f"Queued buy: {btc_amount} BTC at ${cost_usd:.2f} total, ${cost_usd / btc_amount:.2f}/BTC")


# -------------------- Utility Functions --------------------
def wrap_text(text, width=30):
    if pd.isna(text):
        text = ''
    text = str(text)
    return '\n'.join([text[i:i + width] for i in range(0, len(text), width)])


def apply_fifo(btc_needed):
    global buy_queue
    cost_basis = 0
    date_acquired = None
    while btc_needed > 0 and buy_queue:
        buy = buy_queue[0]
        if date_acquired is None:
            date_acquired = buy['date_acquired']
        if buy['btc'] <= btc_needed:
            cost_basis += buy['btc'] * buy['usd_per_btc']
            btc_needed -= buy['btc']
            buy_queue.pop(0)
        else:
            cost_basis += btc_needed * buy['usd_per_btc']
            buy['btc'] -= btc_needed
            btc_needed = 0
    return cost_basis, date_acquired


def get_btc_price(timestamp):
    date = timestamp.date()
    if date in btc_prices.index:
        return btc_prices.loc[date, 'Close']
    else:
        print(f"Price not found for {date}, using fallback $2217.79")
        return 2217.79


# -------------------- Column Names --------------------
TXHASH_COL = 'Bitcoin Hash (visit https://www.coinbase.com/tx/[HASH] in your browser for more info)'
TO_ADDRESS_COL = 'To'
ASSET_NAME = 'BTC'

# -------------------- Process Disposals (Sells) --------------------
results = []

for _, row in sells.iterrows():
    btc_to_sell = -row['Amount']
    proceeds_usd = float(row['Transfer Total']) - float(row['Transfer Fee'])
    cost_basis, date_acquired = apply_fifo(btc_to_sell)
    realized_pl = proceeds_usd - cost_basis

    # Safely compute holding period
    if date_acquired is not None:
        holding_period = 'Long-term' if (row['Timestamp'] - date_acquired).days > 365 else 'Short-term'
    else:
        holding_period = 'Unknown'

    txhash_wrapped = wrap_text(row.get(TXHASH_COL, ''))

    results.append({
        'Asset': ASSET_NAME,
        'Date Acquired': date_acquired.date() if date_acquired else '',
        'Date Sold': row['Timestamp'].date(),
        'Proceeds USD': proceeds_usd,
        'Cost Basis USD': cost_basis,
        'Holding Period': holding_period,
        'Gain/Loss USD': realized_pl,
        'TxHash': txhash_wrapped,
        'From Address': '',
        'To Address': row.get(TO_ADDRESS_COL, '')
    })
    print(f"Processed sell: {btc_to_sell} BTC, P/L ${realized_pl:.2f}")

# -------------------- Process BTC Sent --------------------
for _, row in outs.iterrows():
    btc_to_send = -row['Amount']
    btc_price = get_btc_price(row['Timestamp'])
    sent_loss_usd = btc_to_send * btc_price
    cost_basis, date_acquired = apply_fifo(btc_to_send)

    if date_acquired is not None:
        holding_period = 'Long-term' if (row['Timestamp'] - date_acquired).days > 365 else 'Short-term'
    else:
        holding_period = 'Unknown'

    txhash_wrapped = wrap_text(row.get(TXHASH_COL, ''))

    results.append({
        'Asset': ASSET_NAME,
        'Date Acquired': date_acquired.date() if date_acquired else '',
        'Date Sold': row['Timestamp'].date(),
        'Proceeds USD': 0,
        'Cost Basis USD': sent_loss_usd,
        'Holding Period': holding_period,
        'Gain/Loss USD': -sent_loss_usd,
        'TxHash': txhash_wrapped,
        'From Address': '',
        'To Address': row.get(TO_ADDRESS_COL, '')
    })
    print(f"BTC sent: {btc_to_send} BTC on {row['Timestamp'].date()}, loss ${sent_loss_usd:.2f}")

# -------------------- Final DataFrame --------------------
combined_df = pd.DataFrame(results)
combined_df.sort_values('Date Sold', inplace=True)
combined_df.reset_index(drop=True, inplace=True)
total_realized = combined_df['Gain/Loss USD'].sum()

print(f"\nTotal Realized Profit/Loss: ${total_realized:.2f}")

# -------------------- PDF Export --------------------
pdf_file = "crypto_tax_report.pdf"
with PdfPages(pdf_file) as pdf:
    fig, ax = plt.subplots(figsize=(14, max(6, len(combined_df) * 0.25)))
    ax.axis('tight')
    ax.axis('off')
    table = ax.table(cellText=combined_df.values,
                     colLabels=combined_df.columns,
                     cellLoc='center',
                     loc='center')
    table.auto_set_font_size(False)
    table.set_fontsize(7)
    table.scale(1, 1.5)  # taller for multi-line TxHash
    plt.title("Bitcoin Transaction Realized P/L (Tax Report)", fontsize=14, pad=20)
    pdf.savefig(fig, bbox_inches='tight')
    plt.close()

print(f"\nPDF saved as {pdf_file}")
