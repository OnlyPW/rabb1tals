import json
import os
import requests
from decimal import Decimal, InvalidOperation, getcontext
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Set decimal precision high enough to handle small values accurately
getcontext().prec = 18

# Define the API endpoints
NONKYC_API_URL = "https://api.nonkyc.io/api/v2/asset/getbyticker"
XEGGEX_API_URL = "https://api.xeggex.com/api/v2/asset/getbyticker"
MECACEX_API_URL = "https://mecacex.com/api/v2/trade/public/markets/tickers"
EXBITRON_API_URL = "https://api.exbitron.digital/api/v1/cg/tickers"
BITCOINTRY_API_URL = "https://api.bitcointry.com/api/v1/summary"

# Manually extracted JSON data from networks.js
coins = [
    { "name": "B1T", "ticker": "B1T" }
]

def requests_retry_session(
    retries=3,
    backoff_factor=0.3,
    status_forcelist=(500, 502, 504),
    session=None,
):
    session = session or requests.Session()
    retry = Retry(
        total=retries,
        read=retries,
        connect=retries,
        backoff_factor=backoff_factor,
        status_forcelist=status_forcelist,
        raise_on_status=False
    )
    adapter = HTTPAdapter(max_retries=retry)
    session.mount('http://', adapter)
    session.mount('https://', adapter)
    return session

def fetch_data(url):
    print(f"Fetching data from {url}")
    try:
        session = requests_retry_session()
        response = session.get(url)
        response.raise_for_status()
        print(f"Successfully fetched data from {url}")
        return response.json()
    except requests.RequestException as e:
        print(f"Error fetching data from {url}: {e}")
        return None

def get_price_from_sources(tickers, price_function):
    for ticker in tickers:
        print(f"Fetching price for ticker: {ticker}")
        price = price_function(ticker)
        if price is not None:
            print(f"Price for {ticker}: {price}")
            return price
    print(f"No valid price found for tickers: {tickers}")
    return None

def validate_decimal(value):
    try:
        Decimal(value)
        return True
    except (InvalidOperation, TypeError):
        return False

def get_price_from_nonkyc(ticker):
    data = fetch_data(f"{NONKYC_API_URL}/{ticker.lower()}")
    if data:
        usd_value = data.get('usdValue', None)
        if usd_value and validate_decimal(usd_value):
            return Decimal(usd_value)
    return None

def get_price_from_xeggex(ticker):
    data = fetch_data(f"{XEGGEX_API_URL}/{ticker.lower()}")
    if data:
        usd_value = data.get('usdValue', None)
        if usd_value and validate_decimal(usd_value):
            return Decimal(usd_value)
    return None

def get_price_from_mecacex(tickers, mecacex_data):
    if not mecacex_data:
        print("Mecacex data is empty.")
        return None

    print(f"Mecacex data received: {mecacex_data}")  # Debugging line

    for ticker in tickers:
        # Construct the expected key format in the Mecacex data
        pair_key = f"{ticker.lower()}usdt"  # Assuming the pair is in lowercase and uses 'usdt'
        
        # Check if the pair exists in the Mecacex data
        if pair_key in mecacex_data:
            last_price_str = mecacex_data[pair_key]['ticker'].get('last', None)
            print(f"Found pair {pair_key} in Mecacex data with last price: {last_price_str}")  # Debugging line
            if last_price_str and validate_decimal(last_price_str):
                return Decimal(last_price_str)
            else:
                print(f"Invalid or missing last price for {pair_key} in Mecacex data.")  # Debugging line
        else:
            print(f"No market pair found in Mecacex data for ticker={ticker}")  # Debugging line

    print(f"No valid Mecacex price found for tickers: {tickers}")
    return None

def get_price_from_exbitron(tickers, exbitron_data):
    if not exbitron_data:
        print("Exbitron data is empty.")
        return None
    for ticker in tickers:
        for item in exbitron_data:
            if item['base_currency'] == ticker and item['target_currency'] == 'USDT':
                last_price_str = item.get('last_price', None)
                if last_price_str and validate_decimal(last_price_str):
                    return Decimal(last_price_str)
    return None

def get_price_from_bitcointry(tickers, bitcointry_data):
    if not bitcointry_data:
        print("BitcoinTry data is empty.")
        return None

    for ticker in tickers:
        for item in bitcointry_data:
            if item['base_currency'] == ticker and item['quote_currency'] == 'USDT':
                last_price_str = item.get('last_price', None)
                if last_price_str and validate_decimal(last_price_str):
                    return Decimal(last_price_str)
    return None

def fetch_prices():
    print("Starting to fetch prices...")
    mecacex_data = fetch_data(MECACEX_API_URL)
    exbitron_data = fetch_data(EXBITRON_API_URL)
    bitcointry_data = fetch_data(BITCOINTRY_API_URL)

    prices = {}
    for coin in coins:
        tickers = [ticker.strip().upper() for ticker in coin['ticker'].split(',')]
        print(f"Processing coin: {coin['name']} with tickers: {tickers}")

        price_nonkyc = get_price_from_sources(tickers, get_price_from_nonkyc)
        price_xeggex = get_price_from_sources(tickers, get_price_from_xeggex)
        price_mecacex = get_price_from_mecacex(tickers, mecacex_data)
        price_exbitron = get_price_from_exbitron(tickers, exbitron_data)
        price_bitcointry = get_price_from_bitcointry(tickers, bitcointry_data)

        # Calculate the aggregated price
        price_list = [price for price in [price_nonkyc, price_xeggex, price_mecacex, price_exbitron, price_bitcointry] if price is not None]
        aggregated_price = None
        if price_list:
            try:
                aggregated_price = sum(price_list) / Decimal(len(price_list))
                aggregated_price = round(aggregated_price, 10)
                print(f"Aggregated price for {coin['name']}: {aggregated_price}")
            except (InvalidOperation, ZeroDivisionError) as e:
                print(f"Error calculating aggregated price for {coin['name']}: {e}")

        prices[coin['name']] = {
            'nonkyc': str(price_nonkyc) if price_nonkyc else None,
            'xeggex': str(price_xeggex) if price_xeggex else None,
            'mecacex': str(price_mecacex) if price_mecacex else None,
            'exbitron': str(price_exbitron) if price_exbitron else None,
            'bitcointry': str(price_bitcointry) if price_bitcointry else None,
            'aggregated': str(aggregated_price) if aggregated_price else None
        }
        print(f"Prices for {coin['name']}: {prices[coin['name']]}")

    print("Finished fetching prices.")
    return prices

def save_prices_to_file(prices, filepath):
    os.makedirs(os.path.dirname(filepath), exist_ok=True)
    with open(filepath, 'w') as f:
        json.dump(prices, f, indent=4)
    print(f"Prices saved to {filepath}")

if __name__ == "__main__":
    prices = fetch_prices()
    save_prices_to_file(prices, './temp/prices.json')
