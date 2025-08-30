import os
import sqlite3
import random
import datetime
import base64
import re
from flask import Blueprint, jsonify, make_response, request
from collections import OrderedDict
import logging
from logging.handlers import RotatingFileHandler
import subprocess
import json
# NEW: reuse existing RPC helper for broadcasting
from routes.bitcoinRPC import get_rpc_connection
from bitcoinrpc.authproxy import JSONRPCException

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
handler = RotatingFileHandler('rc001.log', maxBytes=5*1024*1024, backupCount=3)
logger.addHandler(handler)

# Create a new Blueprint for rc001
rc001_bp = Blueprint('rc001', __name__)

SUPPORTED_TICKER = 'B1T'

DATABASE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '../rc001/collections/all_collections.db'))
COLLECTIONS_DIR = os.path.dirname(DATABASE_FILE)

# Function to sanitize the collection name
def sanitize_filename(name):
    return re.sub(r'[^\w\-]', '', name)

@rc001_bp.route('/collections', methods=['GET'])
def list_collections():
    """List all collections from the database with their details."""
    # If the collections DB hasn't been created yet, return an empty set instead of a 500
    if not os.path.exists(DATABASE_FILE):
        logger.warning(f"Collections database not found at {DATABASE_FILE}. Returning empty list.")
        return jsonify({
            "status": "success",
            "collections": {},
            "message": "Collections database not initialized yet."
        })
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Fetch B1T collections only
            cursor.execute("SELECT * FROM collections WHERE UPPER(coin_ticker) = UPPER(?) ORDER BY created_at DESC", (SUPPORTED_TICKER,))
            collections_data = cursor.fetchall()
            
            if not collections_data:
                return jsonify({
                    "status": "success",
                    "collections": {},
                    "message": "No collections found."
                })

            collections = {}
            for row in collections_data:
                collection_id = row['collection_id']
                sanitized_name = row['sanitized_name']
                coin_ticker = row['coin_ticker']

                # Calculate max_supply from serial ranges
                cursor.execute("SELECT range_value FROM serial_ranges WHERE collection_id = ? ORDER BY range_index", 
                             (collection_id,))
                ranges = cursor.fetchall()
                
                max_supply = 1
                for range_value, in ranges:
                    try:
                        start, end = map(int, range_value.split('-'))
                        max_supply *= (end - start + 1)
                    except ValueError:
                        logger.error(f"Invalid range format for collection {sanitized_name}: '{range_value}'")
                        return jsonify({
                            "status": "error",
                            "message": f"Invalid range format for collection {sanitized_name}: '{range_value}'"
                        }), 400

                # Count minted items
                cursor.execute("SELECT COUNT(*) FROM items WHERE collection_id = ? AND inscription_id IS NOT NULL", 
                             (collection_id,))
                minted = cursor.fetchone()[0]

                left_to_mint = max_supply - minted
                percent_minted = round((minted / max_supply) * 100, 2) if max_supply > 0 else 0

                # Create ordered dictionary for consistent output
                ordered_collection_data = OrderedDict([
                    ('coin_ticker', coin_ticker),
                    ('mint_address', row['mint_address']),
                    ('deploy_address', row['deploy_address']),
                    ('mint_price', row['mint_price']),
                    ('parent_inscription_id', row['parent_inscription_id']),
                    ('emblem_inscription_id', row['emblem_inscription_id']),
                    ('website', row['website']),
                    ('deploy_txid', row['deploy_txid']),
                    ('max_supply', max_supply),
                    ('minted', minted),
                    ('left_to_mint', left_to_mint),
                    ('percent_minted', percent_minted),
                    # Add block height information
                    ('block_height', row['created_at']),  # Assuming 'created_at' now stores block height
                ])

                # Add serial ranges
                for i, (range_value,) in enumerate(ranges):
                    ordered_collection_data[f'sn_index_{i}'] = range_value

                # Fetch items with sequence numbers
                cursor.execute("SELECT sn, inscription_id, inscription_status, inscription_address, sequence_number FROM items WHERE collection_id = ? ORDER BY sequence_number", 
                             (collection_id,))
                items = cursor.fetchall()
                ordered_collection_data['items'] = [
                    {
                        'sn': item['sn'],
                        'inscription_id': item['inscription_id'],
                        'inscription_status': item['inscription_status'],
                        'inscription_address': item['inscription_address'],
                        'sequence_number': item['sequence_number']
                    }
                    for item in items
                ]

                collections[sanitized_name] = ordered_collection_data

            return jsonify({
                "status": "success",
                "collections": collections
            })

    except sqlite3.Error as e:
        logger.error(f"Database error in list_collections: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in list_collections: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

def generate_unique_sn(collection_id: int, conn):
    """Generate a unique SN that is not already minted or older than 24 hours."""
    cursor = conn.cursor()
    
    # Get serial ranges
    cursor.execute("SELECT range_value FROM serial_ranges WHERE collection_id = ? ORDER BY range_index", 
                  (collection_id,))
    ranges = [tuple(map(int, r[0].split('-'))) for r in cursor.fetchall()]
    
    # Get existing SNs
    cursor.execute("""
        SELECT sn FROM items 
        WHERE collection_id = ? 
        AND (inscription_id IS NOT NULL 
             OR (created_at < ?))
    """, (collection_id, datetime.datetime.now() - datetime.timedelta(hours=24)))
    existing_sns = {row[0] for row in cursor.fetchall()}

    while True:
        if len(ranges) == 1 and len(str(ranges[0][0])) > 2:  # Single range case
            start, end = ranges[0]
            sn = f"{random.randint(start, end):06d}"
        else:  # Segmented ranges
            sn_parts = [f"{random.randint(start, end):02d}" for start, end in ranges]
            sn = ''.join(sn_parts)
        
        if sn not in existing_sns:
            return sn

@rc001_bp.route('/mint/<coin_ticker>/<collection_name>', methods=['GET'])
def generate_html(coin_ticker, collection_name):
    """Generate an HTML page with a unique SN for a specific collection on a coin."""
    if str(coin_ticker).upper() != SUPPORTED_TICKER:
        return jsonify({
            "status": "error",
            "message": f"Unsupported coin '{coin_ticker}'. Only {SUPPORTED_TICKER} is supported."
        }), 400
    sanitized_collection_name = sanitize_filename(collection_name)

    # Gracefully handle missing database
    if not os.path.exists(DATABASE_FILE):
        logger.warning(f"Collections database not found at {DATABASE_FILE}. Cannot generate HTML.")
        return jsonify({
            "status": "error",
            "message": "Collections database not initialized yet."
        }), 404
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection data
            cursor.execute("SELECT * FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (SUPPORTED_TICKER, sanitized_collection_name))
            collection = cursor.fetchone()
            
            if not collection:
                logger.error(f"Collection not found in generate_html: coin_ticker={coin_ticker}, sanitized_name={sanitized_collection_name}")
                return jsonify({
                    "status": "error",
                    "message": f"Collection '{collection_name}' not found on coin '{coin_ticker}'"
                }), 404

            # Generate unique SN
            sn = generate_unique_sn(collection['collection_id'], conn)

            # Construct HTML content
            html_content = f"""<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><meta name=\"p\" content=\"rc001\"><meta name=\"op\" content=\"mint\"><meta name=\"sn\" content=\"{sn}\"><title>{collection_name}</title></head><body><script src=\"/content/{collection['parent_inscription_id']}\"></script></body></html>"""
            response = make_response(html_content)
            response.headers['Content-Type'] = 'text/html;charset=utf-8'
            return response

    except sqlite3.Error as e:
        logger.error(f"Database error in generate_html: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in generate_html: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@rc001_bp.route('/inscriptions/<coin_ticker>/<collection_name>/<address>', methods=['GET'])
def list_inscriptions_by_collection_and_address(coin_ticker, collection_name, address):
    """List all inscription_ids for an address in a specific collection on a coin."""
    if str(coin_ticker).upper() != SUPPORTED_TICKER:
        return jsonify({
            "status": "error",
            "message": f"Unsupported coin '{coin_ticker}'. Only {SUPPORTED_TICKER} is supported."
        }), 400
    sanitized_collection_name = sanitize_filename(collection_name)
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection ID
            cursor.execute("SELECT collection_id FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (SUPPORTED_TICKER, sanitized_collection_name))
            collection = cursor.fetchone()
            
            if not collection:
                logger.error(f"Collection not found in list_inscriptions: coin_ticker={coin_ticker}, sanitized_name={sanitized_collection_name}")
                return jsonify({
                    "status": "error",
                    "message": f"Collection '{collection_name}' not found on coin '{coin_ticker}'"
                }), 404

            # Get inscriptions
            cursor.execute("SELECT inscription_id FROM items WHERE collection_id = ? AND inscription_address = ? AND inscription_id IS NOT NULL", 
                         (collection['collection_id'], address))
            inscriptions = [row['inscription_id'] for row in cursor.fetchall()]

            return jsonify({
                "status": "success",
                "inscriptions": inscriptions
            })

    except sqlite3.Error as e:
        logger.error(f"Database error in list_inscriptions: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in list_inscriptions: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@rc001_bp.route('/collection/<coin_ticker>/<collection_name>', methods=['GET'])
def list_collection_as_json(coin_ticker, collection_name):
    """List all entries in the specified collection as JSON."""
    if str(coin_ticker).upper() != SUPPORTED_TICKER:
        return jsonify({
            "status": "error",
            "message": f"Unsupported coin '{coin_ticker}'. Only {SUPPORTED_TICKER} is supported."
        }), 400
    sanitized_collection_name = sanitize_filename(collection_name)
    logger.info(f"Request for coin_ticker={coin_ticker}, collection_name={collection_name}, sanitized_name={sanitized_collection_name}")

    # Gracefully handle missing database
    if not os.path.exists(DATABASE_FILE):
        logger.warning(f"Collections database not found at {DATABASE_FILE}. Cannot list collection data.")
        return jsonify({
            "status": "error",
            "message": "Collections database not initialized yet."
        }), 404

    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Log all collections for debugging (B1T only)
            cursor.execute("SELECT coin_ticker, sanitized_name FROM collections WHERE UPPER(coin_ticker) = UPPER(?)", (SUPPORTED_TICKER,))
            all_collections = cursor.fetchall()
            logger.info(f"Available collections: {[(row['coin_ticker'], row['sanitized_name']) for row in all_collections]}")
            
            cursor.execute("SELECT collection_id FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (SUPPORTED_TICKER, sanitized_collection_name))
            collection = cursor.fetchone()
            
            if not collection:
                logger.error(f"Collection not found in list_collection_as_json: coin_ticker={coin_ticker}, sanitized_name={sanitized_collection_name}")
                return jsonify({
                    "status": "error",
                    "message": f"Collection '{collection_name}' not found on coin '{coin_ticker}'"
                }), 404

            cursor.execute("SELECT * FROM items WHERE collection_id = ?", (collection['collection_id'],))
            collection_data = [dict(row) for row in cursor.fetchall()]
            logger.info(f"Found {len(collection_data)} items for {coin_ticker}/{sanitized_collection_name}")

            return jsonify({
                "status": "success",
                "collection": collection_data
            })

    except sqlite3.Error as e:
        logger.error(f"Database error in list_collection_as_json: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in list_collection_as_json: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@rc001_bp.route('/validate/<inscription_id>', methods=['GET'])
def validate_inscription(inscription_id):
    """Validate an inscription_id across all collections."""
    # Gracefully handle missing database
    if not os.path.exists(DATABASE_FILE):
        logger.warning(f"Collections database not found at {DATABASE_FILE}. Cannot validate inscriptions.")
        return jsonify({
            "status": "error",
            "message": "Collections database not initialized yet."
        }), 404
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get all collections (B1T only)
            cursor.execute("SELECT collection_id, coin_ticker, name, sanitized_name, deploy_address, deploy_txid, parent_inscription_id FROM collections WHERE UPPER(coin_ticker) = UPPER(?)", (SUPPORTED_TICKER,))
            collections = cursor.fetchall()

            for collection in collections:
                cursor.execute("SELECT inscription_id, inscription_address FROM items WHERE collection_id = ? ORDER BY created_at", 
                             (collection['collection_id'],))
                results = cursor.fetchall()

                for index, row in enumerate(results, start=1):
                    if row['inscription_id'] == inscription_id:
                        return jsonify({
                            "status": "success",
                            "coin_ticker": collection['coin_ticker'],
                            "collection_name": collection['sanitized_name'],
                            "number": index,
                            "deploy_address": collection['deploy_address'],
                            "deploy_txid": collection['deploy_txid'],
                            "parent_inscription_id": collection['parent_inscription_id'],
                            "inscription_address": row['inscription_address']
                        })

            return jsonify({
                "status": "error",
                "message": f"Inscription ID '{inscription_id}' not found in any collection."
            }), 404

    except sqlite3.Error as e:
        logger.error(f"Database error in validate_inscription: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in validate_inscription: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@rc001_bp.route('/mint_hex/<coin_ticker>/<collection_name>', methods=['GET'])
def generate_hex(coin_ticker, collection_name):
    """Generate a hex representation of an HTML page with a unique SN."""
    if str(coin_ticker).upper() != SUPPORTED_TICKER:
        return jsonify({
            "status": "error",
            "message": f"Unsupported coin '{coin_ticker}'. Only {SUPPORTED_TICKER} is supported."
        }), 400
    sanitized_collection_name = sanitize_filename(collection_name)

    # Gracefully handle missing database
    if not os.path.exists(DATABASE_FILE):
        logger.warning(f"Collections database not found at {DATABASE_FILE}. Cannot generate mint hex.")
        return jsonify({
            "status": "error",
            "message": "Collections database not initialized yet."
        }), 404

    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection data
            cursor.execute("SELECT * FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (SUPPORTED_TICKER, sanitized_collection_name))
            collection = cursor.fetchone()
            
            if not collection:
                logger.error(f"Collection not found in generate_hex: coin_ticker={coin_ticker}, sanitized_name={sanitized_collection_name}")
                return jsonify({
                    "status": "error",
                    "message": f"Collection '{collection_name}' not found on coin '{coin_ticker}'"
                }), 404

            # Generate unique SN
            sn = generate_unique_sn(collection['collection_id'], conn)

            # Construct HTML content
            html_content = f"""<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\"><meta name=\"p\" content=\"rc001\"><meta name=\"op\" content=\"mint\"><meta name=\"sn\" content=\"{sn}\"><title>{collection_name}</title></head><body><script src=\"/content/{collection['parent_inscription_id']}\"></script></body></html>"""
            hex_content = html_content.encode('utf-8').hex()

            return jsonify({
                "status": "success",
                "hex": hex_content
            })

    except sqlite3.Error as e:
        logger.error(f"Database error in generate_hex: {e}")
        return jsonify({
            "status": "error",
            "message": f"Database error: {e}"
        }), 500
    except Exception as e:
        logger.error(f"Unexpected error in generate_hex: {e}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500
    
@rc001_bp.route('/mint_rc001/<ticker>', methods=['POST'])
def mint_rc001(ticker):
    data = request.json

    # Enforce B1T only
    if str(ticker).lower() != 'b1t':
        return jsonify({
            "status": "error",
            "message": f"Unsupported ticker '{ticker}'. Only B1T is supported."
        }), 400

    # Extract parameters
    receiving_address = data.get('receiving_address')
    meme_type = data.get('meme_type')
    hex_data = data.get('hex_data')
    sending_address = data.get('sending_address')
    privkey = data.get('privkey')
    utxo = data.get('utxo')
    vout = data.get('vout')
    script_hex = data.get('script_hex')
    utxo_amount = data.get('utxo_amount')  # Ensure this is a string
    mint_address = data.get('mint_address')  # Optional parameter
    mint_price_satoshis = data.get('mint_price')  # Already in satoshis

    # NEW: backend broadcasting toggle and fee/policy overrides
    broadcast = data.get('broadcast', True)
    override_fee_per_kb = data.get('fee_per_kb')  # integer sat/kB
    override_dust_satoshis = data.get('dust_satoshis')  # integer sats
    # Optional inscription dev fee overrides
    dev_fee_enable = data.get('enable_inscription_dev_fee')
    dev_fee_percent = data.get('inscription_dev_fee_percent')
    dev_fee_address = data.get('inscription_dev_fee_address')

    # Log the extracted parameters for debugging
    print(f"Received mint request with parameters: {data}")

    # Convert 'vout' and 'utxo_amount' to strings for the command
    vout_str = str(vout)
    
    try:
        # Convert utxo_amount to a float, then to satoshis
        utxo_amount_float = float(utxo_amount)
        utxo_amount_satoshis = int(utxo_amount_float * 100000000)
        
        # Log mint price in satoshis
        print(f"Mint Address: {mint_address}, Mint Price (satoshis): {mint_price_satoshis}")
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": f"Invalid amount: {utxo_amount}. Error: {str(e)}"
        }), 400

    # Only B1T supported
    command_dir = './bitcore-libs/b1t'
    script = 'getOrdTxsB1T.js'

    # Define the command to run
    command = [
        'node', script, 'mint',
        receiving_address, meme_type, hex_data,
        sending_address, privkey, utxo, vout_str,
        script_hex, str(utxo_amount_satoshis)
    ]

    # Add mint_address and mint_price to the command if they are provided
    if mint_address and mint_price_satoshis is not None:
        command.extend([mint_address, str(mint_price_satoshis)])

    # Build environment for the subprocess, allowing overrides without touching .env file
    child_env = os.environ.copy()
    if override_fee_per_kb is not None:
        try:
            child_env['FEE_PER_KB'] = str(int(override_fee_per_kb))
        except Exception:
            pass
    if override_dust_satoshis is not None:
        try:
            child_env['DUST_SATOSHIS'] = str(int(override_dust_satoshis))
        except Exception:
            pass
    if dev_fee_enable is not None:
        child_env['ENABLE_INSCRIPTION_DEV_FEE'] = 'true' if bool(dev_fee_enable) else 'false'
    if dev_fee_percent is not None:
        try:
            child_env['INSCRIPTION_DEV_FEE_PERCENT'] = str(float(dev_fee_percent))
        except Exception:
            pass
    if dev_fee_address is not None:
        child_env['INSCRIPTION_DEV_FEE_ADDRESS'] = str(dev_fee_address)

    try:
        # Run the command and capture the output
        result = subprocess.run(
            command,
            cwd=command_dir,
            capture_output=True,
            text=True,
            check=True,
            env=child_env
        )
        output = result.stdout.strip()
        error_output = result.stderr.strip()

        # Print both stdout and stderr
        print("Command output:", output)
        print("Command error output:", error_output)

        # For B1T script, the output is JSON containing pendingTransactions
        try:
            json_data = json.loads(output)
            response = {
                "pendingTransactions": json_data.get("pendingTransactions", []),
                "instructions": json_data.get("instructions", "")
            }
        except json.JSONDecodeError:
            # Fallback: attempt legacy split if ever needed
            try:
                final_tx_line, json_part = output.split('\n', 1)
                final_tx_id = final_tx_line.replace("Final transaction: ", "").strip()
                json_data = json.loads(json_part)
                response = {
                    "finalTransaction": final_tx_id,
                    "pendingTransactions": json_data.get("pendingTransactions", []),
                    "instructions": json_data.get("instructions", "")
                }
            except Exception:
                return jsonify({
                    "status": "error",
                    "message": "Failed to parse command output."
                }), 500

        # Optionally broadcast transactions (in order) via local RPC
        broadcast_results = []
        if broadcast:
            try:
                rpc = get_rpc_connection('B1T')
                for tx in response.get('pendingTransactions', []):
                    raw_hex = tx.get('hex')
                    txid = tx.get('txid')
                    try:
                        sent_txid = rpc.sendrawtransaction(raw_hex)
                        broadcast_results.append({
                            'requested_txid': txid,
                            'sent_txid': sent_txid,
                            'status': 'ok'
                        })
                    except Exception as be:
                        broadcast_results.append({
                            'requested_txid': txid,
                            'status': 'error',
                            'error': str(be)
                        })
                response['broadcasted'] = True
                response['broadcastResults'] = broadcast_results
            except Exception as e:
                response['broadcasted'] = False
                response['broadcastError'] = str(e)

        return jsonify(response)

    except subprocess.CalledProcessError as e:
        return jsonify({
            "status": "error",
            "message": f"Command failed with error: {e.stderr}"
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500

@rc001_bp.route('/broadcast_pending/<ticker>', methods=['POST'])
def broadcast_pending(ticker):
    """Broadcast a list of raw transactions for the given ticker.
    Expected JSON body: { "raw_txs": ["hex1", "hex2", ...] }
    Returns per-transaction results with txid or error.
    """
    try:
        data = request.get_json(silent=True) or {}
        raw_txs = data.get('raw_txs') or data.get('rawTxs') or []
        if not isinstance(raw_txs, list) or not raw_txs:
            return jsonify({
                'status': 'error',
                'message': 'Missing or invalid raw_txs list'
            }), 400

        # Obtain RPC connection (will validate ticker internally; only B1T allowed)
        rpc = get_rpc_connection(ticker)
        results = []
        for raw in raw_txs:
            if not isinstance(raw, str) or len(raw.strip()) == 0:
                results.append({'success': False, 'error': 'invalid hex'})
                continue
            try:
                txid = rpc.sendrawtransaction(raw.strip())
                results.append({'success': True, 'txid': txid})
            except JSONRPCException as e:
                msg = str(e)
                # Common cases: already in mempool/chain -> attempt to decode txid if present in message
                results.append({'success': False, 'error': msg})
            except Exception as e:
                results.append({'success': False, 'error': str(e)})

        return jsonify({'status': 'success', 'results': results}), 200
    except ValueError as e:
        return jsonify({'status': 'error', 'message': str(e)}), 400
    except Exception as e:
        logger.exception('Unexpected error in broadcast_pending')
        return jsonify({'status': 'error', 'message': 'Unexpected server error'}), 500
    
    data = request.json or {}
    
    # Accept multiple input shapes
    pending = data.get('pendingTransactions') or data.get('transactions') or []
    raw_txs = data.get('raw_txs') or []
    
    # Normalize into a list of dicts with at least 'hex'
    tx_items = []
    if isinstance(pending, list) and pending:
        for item in pending:
            if isinstance(item, dict) and item.get('hex'):
                tx_items.append({
                    'txid': item.get('txid'),
                    'hex': item.get('hex')
                })
    if not tx_items and isinstance(raw_txs, list) and raw_txs:
        for hx in raw_txs:
            if isinstance(hx, str) and hx.strip():
                tx_items.append({'hex': hx.strip()})
    
    if not tx_items:
        return jsonify({
            "status": "error",
            "message": "No transactions provided. Supply 'pendingTransactions' (with hex) or 'raw_txs'."
        }), 400
    
    continue_on_error = bool(data.get('continue_on_error', True))
    
    results = []
    try:
        rpc = get_rpc_connection('B1T')
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"RPC connection error: {str(e)}"
        }), 500
    
    for idx, tx in enumerate(tx_items, start=1):
        hex_str = tx.get('hex')
        req_txid = tx.get('txid')
        if not hex_str or not isinstance(hex_str, str):
            results.append({
                'index': idx,
                'requested_txid': req_txid,
                'status': 'error',
                'error': 'Missing or invalid hex'
            })
            if not continue_on_error:
                break
            else:
                continue
        try:
            sent_txid = rpc.sendrawtransaction(hex_str)
            results.append({
                'index': idx,
                'requested_txid': req_txid,
                'sent_txid': sent_txid,
                'status': 'ok'
            })
        except Exception as e:
            # Common benign errors we can surface and continue
            err_msg = str(e)
            results.append({
                'index': idx,
                'requested_txid': req_txid,
                'status': 'error',
                'error': err_msg
            })
            if not continue_on_error:
                break
    
    overall_status = 'success' if any(r.get('status') == 'ok' for r in results) and not any(r.get('status') == 'error' for r in results if not continue_on_error) else 'partial' if any(r.get('status') == 'ok' for r in results) else 'error'
    
    return jsonify({
        'status': overall_status,
        'results': results,
        'count': len(results)
    })