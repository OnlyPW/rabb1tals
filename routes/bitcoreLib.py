import subprocess
import logging
import json
from flask import Blueprint, jsonify, request

# Create a Blueprint for the bitcore library routes
bitcore_lib_bp = Blueprint('bitcore_lib', __name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

@bitcore_lib_bp.route('/generatekey/<ticker>', methods=['GET'])
def generate_key(ticker):
    try:
        # Construct the absolute path to the Node.js script based on the ticker
        script_path = f'/root/plugzWallet2/bitcore-libs/{ticker.lower()}/generateKey.js'
        logging.debug(f"Script path: {script_path}")
        
        # Call the Node.js script with the specified ticker
        result = subprocess.run(
            ['node', script_path],
            capture_output=True,
            text=True,
            check=True
        )
                
        # Parse the output from the Node.js script
        output_lines = result.stdout.splitlines()
        wif_key = output_lines[0].split(': ')[1]
        address = output_lines[1].split(': ')[1]

        return jsonify({'wif': wif_key, 'address': address})
    except subprocess.CalledProcessError as e:
        logging.error(f"Subprocess error: {e.stderr}")
        return jsonify({'error': 'Failed to generate key', 'details': e.stderr}), 500
    except IndexError:
        logging.error("Unexpected output format from generateKey.js")
        return jsonify({'error': 'Unexpected output format from generateKey.js'}), 500
    except FileNotFoundError:
        logging.error(f"Script not found for ticker: {ticker}")
        return jsonify({'error': f'Script not found for ticker: {ticker}'}), 404 

@bitcore_lib_bp.route('/generate-tx', methods=['POST'])
def generate_tx():
    try:
        # Get JSON data from request
        data = request.get_json()
        
        # Validate required fields
        required_fields = ['walletData', 'receivingAddress', 'amount', 'fee']
        for field in required_fields:
            if field not in data:
                return jsonify({
                    'error': f'Missing required field: {field}'
                }), 400

        # Extract data
        wallet_data = data['walletData']
        receiving_address = data['receivingAddress']
        amount = data['amount']  # Should be in satoshis
        fee = data['fee']  # Should be in satoshis
        ticker = wallet_data.get('ticker', '').lower()

        # Validate wallet data structure
        required_wallet_fields = ['label', 'ticker', 'address', 'privkey', 'balance', 'utxos']
        for field in required_wallet_fields:
            if field not in wallet_data:
                return jsonify({
                    'error': f'Missing required wallet field: {field}'
                }), 400

        # Construct the absolute path to the Node.js script
        script_path = f'/root/plugzWallet2/bitcore-libs/{ticker}/generateTxHexWrapper.js'
        logging.debug(f"Script path: {script_path}")

        # Prepare the input data for the Node.js script
        input_data = json.dumps({
            'walletData': wallet_data,
            'receivingAddress': receiving_address,
            'amount': amount,
            'fee': fee
        })

        # Call the Node.js script
        process = subprocess.Popen(
            ['node', script_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Send input data and get output
        stdout, stderr = process.communicate(input=input_data)
        
        if process.returncode != 0:
            logging.error(f"Node.js script error: {stderr}")
            return jsonify({
                'error': 'Failed to generate transaction',
                'details': stderr
            }), 500

        # Parse the output
        try:
            result = json.loads(stdout)
            return jsonify({
                'success': True,
                'txHex': result['txHex']
            })
        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse script output: {stdout}")
            return jsonify({
                'error': 'Invalid script output format',
                'details': str(e)
            }), 500

    except FileNotFoundError:
        logging.error(f"Script not found for ticker: {ticker}")
        return jsonify({
            'error': f'Script not found for ticker: {ticker}'
        }), 404
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
        return jsonify({
            'error': str(e)
        }), 500 

@bitcore_lib_bp.route('/generate_ord_hexs/<ticker>', methods=['POST'])
def mint(ticker):
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

    # Convert 'vout' and 'utxo_amount' to strings for the command
    vout_str = str(vout)
    
    try:
        # Convert utxo_amount to a float, then to satoshis
        utxo_amount_float = float(utxo_amount)
        utxo_amount_satoshis = int(utxo_amount_float * 100000000)
    except ValueError as e:
        return jsonify({
            "status": "error",
            "message": f"Invalid utxo_amount: {utxo_amount}. Error: {str(e)}"
        }), 400

    # Determine the command directory and script based on the ticker
    if ticker.lower() == 'doge':
        command_dir = './bitcore-libs/doge'
        script = 'getOrdTxsDoge.js'
    elif ticker.lower() == 'lky':
        command_dir = './bitcore-libs/lky'
        script = 'getOrdTxsLKY.js'
    elif ticker.lower() == 'ltc':
        command_dir = './bitcore-libs/ltc'
        script = 'getOrdTxsLTC.js'
    elif ticker.lower() in ('pepe', 'pep'):
        command_dir = './bitcore-libs/pep'
        script = 'getOrdTxsPepe.js'
    elif ticker.lower() == 'shic':
        command_dir = './bitcore-libs/shic'
        script = 'getOrdTxsShic.js'
    elif ticker.lower() in ('bonk', 'bonc'):
        command_dir = './bitcore-libs/bonc'
        script = 'getOrdTxsBonk.js'
    elif ticker.lower() == 'flop':
        command_dir = './bitcore-libs/flop'
        script = 'getOrdTxsFlop.js'
    elif ticker.lower() in ('digi', 'dgb'):
        command_dir = './bitcore-libs/dgb'
        script = 'getOrdTxsDigi.js'
    elif ticker.lower() in ('dev', 'bonc'):
        command_dir = './bitcore-libs/dev'
        script = 'getOrdTxsDev.js'
    elif ticker.lower() == 'b1t':
        command_dir = './bitcore-libs/b1t'
        script = 'getOrdTxsB1T.js'
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