import subprocess
import logging
import json
import os
from flask import Blueprint, jsonify, request
from decimal import Decimal, InvalidOperation, ROUND_DOWN

# Create a Blueprint for the bitcore library routes
bitcore_lib_bp = Blueprint('bitcore_lib', __name__)

# Configure logging
logging.basicConfig(level=logging.DEBUG)

# Base path to bitcore-libs relative to this file
BITCORE_BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'bitcore-libs'))

# NEW: DB logging helpers
from utilitys.logging_db import log_tx_event, log_mint_event, log_error

@bitcore_lib_bp.route('/generatekey/<ticker>', methods=['GET'])
def generate_key(ticker):
    try:
        t = (ticker or '').lower()
        # Construct the absolute path to the Node.js script based on the ticker
        script_path = os.path.join(BITCORE_BASE, t, 'generateKey.js')
        logging.debug(f"Script path: {script_path}")
        
        if not os.path.isfile(script_path):
            logging.error(f"Script not found for ticker: {ticker} at {script_path}")
            return jsonify({'error': f'Script not found for ticker: {ticker}'}), 404
        
        # Call the Node.js script with the specified ticker
        result = subprocess.run(
            ['node', script_path],
            cwd=os.path.dirname(script_path),
            capture_output=True,
            text=True,
            check=True
        )
                
        # Parse the output from the Node.js script
        output_lines = result.stdout.splitlines()
        if len(output_lines) >= 2 and ':' in output_lines[0] and ':' in output_lines[1]:
            wif_key = output_lines[0].split(': ', 1)[1]
            address = output_lines[1].split(': ', 1)[1]
        else:
            try:
                data = json.loads(result.stdout)
                wif_key = data.get('wif')
                address = data.get('address')
            except json.JSONDecodeError:
                logging.error("Unexpected output format from generateKey.js")
                return jsonify({'error': 'Unexpected output format from generateKey.js'}), 500

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
        required_wallet_fields = ['label', 'ticker', 'address', 'privkey', 'utxos']
        for field in required_wallet_fields:
            if field not in wallet_data:
                return jsonify({
                    'error': f'Missing required wallet field: {field}'
                }), 400

        # Construct the absolute path to the Node.js script
        script_path = os.path.join(BITCORE_BASE, ticker, 'generateTxHexWrapper.js')
        logging.debug(f"Script path: {script_path}")

        if not os.path.isfile(script_path):
            logging.error(f"Script not found for ticker: {ticker} at {script_path}")
            return jsonify({'error': f'Script not found for ticker: {ticker}'}), 404

        # Prepare the input data for the Node.js script
        input_data = json.dumps({
            'walletData': wallet_data,
            'receivingAddress': receiving_address,
            'amount': amount,
            'fee': fee
        })

        # Call the Node.js script
        process = subprocess.Popen(
            ['node', os.path.basename(script_path)],
            cwd=os.path.dirname(script_path),
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )

        # Send input data and get output
        stdout, stderr = process.communicate(input=input_data)
        
        if process.returncode != 0:
            logging.error(f"Node.js script error: {stderr}")
            # Log failure
            try:
                log_tx_event(ticker, 'generate-tx', 'fail', error=stderr, metadata={'input': json.loads(input_data)})
            except Exception:
                pass
            return jsonify({
                'error': 'Failed to generate transaction',
                'details': stderr
            }), 500

        # Parse the output
        try:
            result = json.loads(stdout)
            # Log success
            try:
                log_tx_event(ticker, 'generate-tx', 'ok', raw_tx=result.get('txHex'), metadata={'input': json.loads(input_data)})
            except Exception:
                pass
            return jsonify({
                'success': True,
                'txHex': result['txHex']
            })
        except json.JSONDecodeError as e:
            logging.error(f"Failed to parse script output: {stdout}")
            try:
                log_tx_event(ticker, 'generate-tx', 'fail', error=str(e), metadata={'stdout': stdout})
            except Exception:
                pass
            return jsonify({
                'error': 'Invalid script output format',
                'details': str(e)
            }), 500

    except FileNotFoundError:
        logging.error(f"Script not found for ticker: {ticker}")
        try:
            log_tx_event(ticker, 'generate-tx', 'fail', error='script not found')
        except Exception:
            pass
        return jsonify({
            'error': f'Script not found for ticker: {ticker}'
        }), 404
    except Exception as e:
        logging.error(f"Unexpected error: {str(e)}")
        try:
            log_tx_event('UNKNOWN', 'generate-tx', 'fail', error=str(e))
        except Exception:
            pass
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
    utxo_amount = data.get('utxo_amount')  # original coin units, not satoshis

    # Ensure 'vout' is an integer string for the command
    try:
        vout_str = str(int(vout))
    except (TypeError, ValueError):
        return jsonify({
            "status": "error",
            "message": f"Invalid vout: {vout}"
        }), 400
    
    try:
        # Convert utxo_amount to Decimal then to satoshis to avoid float rounding errors
        utxo_amount_dec = Decimal(str(utxo_amount))
        utxo_amount_satoshis = int((utxo_amount_dec * Decimal('100000000')).to_integral_value(rounding=ROUND_DOWN))
    except (InvalidOperation, ValueError, TypeError) as e:
        return jsonify({
            "status": "error",
            "message": f"Invalid utxo_amount: {utxo_amount}. Error: {str(e)}"
        }), 400

    # Only support B1T
    if ticker.lower() != 'b1t':
        return jsonify({
            "status": "error",
            "message": "Unsupported ticker type. Only B1T is supported."
        }), 400

    command_dir = os.path.join(BITCORE_BASE, 'b1t')
    script = 'getOrdTxsB1T.js'

    # Ensure script exists
    script_path = os.path.join(command_dir, script)
    if not os.path.isfile(script_path):
        return jsonify({
            "status": "error",
            "message": f"Script not found for ticker: {ticker}"
        }), 404

    # Define the command to run
    command = [
        'node', script, 'mint',
        str(receiving_address), str(meme_type), '-',
        str(sending_address), str(privkey), str(utxo), vout_str,
        str(script_hex), str(utxo_amount_satoshis)
    ]

    logging.debug(f"Running Node command: {' '.join(command)} in {command_dir}")

    try:
        # Run the command and capture the output, piping hex_data via stdin to avoid OS arg length limits
        result = subprocess.run(
            command,
            cwd=command_dir,
            capture_output=True,
            text=True,
            input=str(hex_data or ''),
            check=True
        )
        output = result.stdout.strip()
        error_output = result.stderr.strip()

        # Log both stdout and stderr for debugging
        logging.debug(f"Node stdout: {output}")
        logging.debug(f"Node stderr: {error_output}")

        # If stdout doesn't contain JSON, try to surface a meaningful error from stdout/stderr
        if '{' not in output:
            combined_err = (error_output + "\n" + output).strip()
            if combined_err:
                # Common errors surfaced by the Node script
                known_markers = [
                    'Not enough funds',
                    'Invalid number of arguments',
                    'Data must be a valid hex string',
                    'No data to mint',
                    'Content type too long',
                    'dust'
                ]
                if any(marker in combined_err for marker in known_markers):
                    logging.error(f"Mint error from Node: {combined_err}")
                    try:
                        log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, None, None, False, combined_err)
                    except Exception:
                        pass
                    return jsonify({
                        "status": "error",
                        "message": combined_err
                    }), 400

        # Extract final transaction id from any line starting with 'Final transaction:'
        final_tx_id = ""
        for line in output.splitlines():
            if line.strip().startswith("Final transaction:"):
                final_tx_id = line.split(":", 1)[1].strip()
                break

        # Locate JSON block within stdout (handle extra logs before/after)
        json_data = {}
        start_idx = output.find('{')
        end_idx = output.rfind('}')
        if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
            json_str = output[start_idx:end_idx+1]
            try:
                json_data = json.loads(json_str)
            except json.JSONDecodeError:
                # Try a more line-oriented approach: find first line that starts with '{'
                lines = output.splitlines()
                try:
                    first_json_line = next(i for i,l in enumerate(lines) if l.strip().startswith('{'))
                    json_str = "\n".join(lines[first_json_line:])
                    json_data = json.loads(json_str)
                except Exception as e:
                    logging.error(f"Failed to parse JSON from Node output: {e}")
                    # As a last resort, return combined stdout/stderr as error
                    combined_err = (error_output + "\n" + output).strip()
                    try:
                        log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, None, None, False, combined_err)
                    except Exception:
                        pass
                    return jsonify({
                        "status": "error",
                        "message": combined_err or "Failed to parse command output."
                    }), 500
        else:
            # stdout may contain only JSON or JSON in stderr (unlikely). Try stdout as-is.
            try:
                json_data = json.loads(output)
            except Exception:
                logging.error("No JSON object found in Node stdout")
                combined_err = (error_output + "\n" + output).strip()
                try:
                    log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, None, None, False, combined_err)
                except Exception:
                    pass
                return jsonify({
                    "status": "error",
                    "message": combined_err or "Failed to parse command output."
                }), 500

        # Build response
        response = {
            "finalTransaction": final_tx_id,
            "pendingTransactions": json_data.get("pendingTransactions", []),
            "instructions": json_data.get("instructions", "")
        }

        # Success log
        try:
            log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, final_tx_id or None, response.get('pendingTransactions'), True, None)
        except Exception:
            pass

        return jsonify(response)

    except subprocess.CalledProcessError as e:
        try:
            log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, None, None, False, e.stderr or e.stdout)
        except Exception:
            pass
        return jsonify({
            "status": "error",
            "message": f"Command failed with error: {e.stderr or e.stdout}"
        }), 500
    except Exception as e:
        try:
            log_mint_event('B1T', receiving_address, sending_address, meme_type or '-', len((hex_data or '')) // 2, utxo, vout, utxo_amount_satoshis, None, None, False, str(e))
        except Exception:
            pass
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500