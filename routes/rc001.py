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

DATABASE_FILE = os.path.abspath(os.path.join(os.path.dirname(__file__), '../rc001/collections/all_collections.db'))

# Function to sanitize the collection name
def sanitize_filename(name):
    return re.sub(r'[^\w\-]', '', name)

@rc001_bp.route('/collections', methods=['GET'])
def list_collections():
    """List all collections from the database with their details."""
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Fetch all collections
            cursor.execute("SELECT * FROM collections ORDER BY created_at DESC")
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
    sanitized_collection_name = sanitize_filename(collection_name)
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection data
            cursor.execute("SELECT * FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (coin_ticker, sanitized_collection_name))
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
            html_content = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="p" content="rc001"><meta name="op" content="mint"><meta name="sn" content="{sn}"><title>{collection_name}</title></head><body><script src="/content/{collection['parent_inscription_id']}"></script></body></html>"""
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
    sanitized_collection_name = sanitize_filename(collection_name)
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection ID
            cursor.execute("SELECT collection_id FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (coin_ticker, sanitized_collection_name))
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
    sanitized_collection_name = sanitize_filename(collection_name)
    logger.info(f"Request for coin_ticker={coin_ticker}, collection_name={collection_name}, sanitized_name={sanitized_collection_name}")
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Log all collections for debugging
            cursor.execute("SELECT coin_ticker, sanitized_name FROM collections")
            all_collections = cursor.fetchall()
            logger.info(f"Available collections: {[(row['coin_ticker'], row['sanitized_name']) for row in all_collections]}")
            
            cursor.execute("SELECT collection_id FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (coin_ticker, sanitized_collection_name))
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
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get all collections
            cursor.execute("SELECT collection_id, coin_ticker, name, sanitized_name, deploy_address, deploy_txid, parent_inscription_id FROM collections")
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
    sanitized_collection_name = sanitize_filename(collection_name)
    
    try:
        with sqlite3.connect(DATABASE_FILE) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Get collection data
            cursor.execute("SELECT * FROM collections WHERE UPPER(coin_ticker) = UPPER(?) AND UPPER(sanitized_name) = UPPER(?)", 
                         (coin_ticker, sanitized_collection_name))
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
            html_content = f"""<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="p" content="rc001"><meta name="op" content="mint"><meta name="sn" content="{sn}"><title>{collection_name}</title></head><body><script src="/content/{collection['parent_inscription_id']}"></script></body></html>"""
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

    # Determine the command directory and script based on the ticker
    if ticker.lower() == 'doge':
        command_dir = './bitcore-libs/doge'
        script = 'getRc001tx.js'
    elif ticker.lower() == 'lky':
        command_dir = './bitcore-libs/lky'
        script = 'getRc001tx.js'
    elif ticker.lower() == 'ltc':
        command_dir = './bitcore-libs/ltc'
        script = 'getRc001tx.js'
    elif ticker.lower() in ('pepe', 'pep'):
        command_dir = './bitcore-libs/pep'
        script = 'getRc001tx.js'
    elif ticker.lower() == 'shic':
        command_dir = './bitcore-libs/shic'
        script = 'getRc001tx.js'
    elif ticker.lower() in ('bonk', 'bonc'):
        command_dir = './bitcore-libs/bonk'
        script = 'getRc001tx.js'
    elif ticker.lower() == 'flop':
        command_dir = './bitcore-libs/flop'
        script = 'getRc001tx.js'
    elif ticker.lower() in ('digi', 'dgb'):
        command_dir = './bitcore-libs/dgb'
        script = 'getRc001tx.js'
    elif ticker.lower() == 'dev':
        command_dir = './bitcore-libs/dev'
        script = 'getRc001tx.js'
    else:
        return jsonify({
            "status": "error",
            "message": "Unsupported ticker type."
        }), 400

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

    try:
        # Run the command and capture the output
        result = subprocess.run(
            command,
            cwd=command_dir,
            capture_output=True,
            text=True,
            check=True
        )
        output = result.stdout.strip()
        error_output = result.stderr.strip()

        # Print both stdout and stderr
        print("Command output:", output)
        print("Command error output:", error_output)

        # Assume output format:
        # Final transaction: <txid>
        # {
        #   "pendingTransactions": [...],
        #   "instructions": "..."
        # }

        # Split the output into the final transaction line and the JSON part
        final_tx_line, json_part = output.split('\n', 1)
        final_tx_id = final_tx_line.replace("Final transaction: ", "").strip()
        json_data = json.loads(json_part)

        # Structure the response as desired
        response = {
            "finalTransaction": final_tx_id,
            "pendingTransactions": json_data.get("pendingTransactions", []),
            "instructions": json_data.get("instructions", "")
        }

        return jsonify(response)

    except subprocess.CalledProcessError as e:
        return jsonify({
            "status": "error",
            "message": f"Command failed with error: {e.stderr}"
        }), 500
    except ValueError:
        return jsonify({
            "status": "error",
            "message": "Failed to parse command output."
        }), 500
    except json.JSONDecodeError:
        return jsonify({
            "status": "error",
            "message": "Invalid JSON format in command output."
        }), 500
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500