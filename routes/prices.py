import json
import os
from flask import Blueprint, jsonify

# Create a Blueprint for the app routes
prices_bp = Blueprint('prices', __name__)

# Path to the JSON file containing prices
PRICES_JSON_PATH = os.path.join(os.path.dirname(__file__), '../temp/prices.json')

def load_prices_from_json():
    """Load prices from the JSON file."""
    if not os.path.exists(PRICES_JSON_PATH):
        print(f"Prices file not found at {PRICES_JSON_PATH}")
        return {}

    try:
        with open(PRICES_JSON_PATH, 'r') as f:
            prices = json.load(f)
            print(f"Loaded prices from {PRICES_JSON_PATH}")
            return prices
    except (IOError, json.JSONDecodeError) as e:
        print(f"Error reading prices from {PRICES_JSON_PATH}: {e}")
        return {}

@prices_bp.route('/prices', methods=['GET'])
def get_prices_route():
    """Endpoint to get the aggregated prices."""
    prices = load_prices_from_json()
    return jsonify(prices)
