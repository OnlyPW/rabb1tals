import configparser
from flask import Blueprint, jsonify, request
from bitcoinrpc.authproxy import AuthServiceProxy, JSONRPCException
import logging
import time
from collections import defaultdict

# Create a Blueprint for the Bitcoin RPC routes
bitcoin_rpc_bp = Blueprint('bitcoin_rpc', __name__)

# Read the RPC configuration file
config = configparser.ConfigParser()
config.read('./config/rpc.conf')

# Configure a logger for address import requests and API calls
address_logger = logging.getLogger('addressLogger')
address_logger.setLevel(logging.INFO)
address_handler = logging.FileHandler('address.log')
address_handler.setFormatter(logging.Formatter('%(asctime)s - %(message)s'))
address_logger.addHandler(address_handler)

# Simple rate-limiting mechanism
request_timestamps = defaultdict(list)

@bitcoin_rpc_bp.route('/health/<ticker>', methods=['GET'])
def check_node_health(ticker):
    """Check if a cryptocurrency node is accessible."""
    try:
        if ticker not in config:
            return jsonify({
                "status": "error",
                "message": f"No configuration found for ticker: {ticker}"
            }), 404
        
        rpc_connection = get_rpc_connection(ticker)
        
        # Try to get basic blockchain info to test connection
        try:
            info = rpc_connection.getblockchaininfo()
            return jsonify({
                "status": "success",
                "data": {
                    "ticker": ticker,
                    "connected": True,
                    "blocks": info.get('blocks', 'unknown'),
                    "headers": info.get('headers', 'unknown'),
                    "chain": info.get('chain', 'unknown')
                }
            })
        except Exception as e:
            return jsonify({
                "status": "error",
                "message": f"Node connected but RPC call failed: {str(e)}",
                "data": {
                    "ticker": ticker,
                    "connected": True,
                    "rpc_error": str(e)
                }
            }), 200
            
    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"Failed to connect to {ticker} node: {str(e)}",
            "data": {
                "ticker": ticker,
                "connected": False,
                "error": str(e)
            }
        }), 503

@bitcoin_rpc_bp.route('/health', methods=['GET'])
def check_all_nodes_health():
    """Check health of all configured cryptocurrency nodes."""
    health_status = {}
    
    for ticker in config.sections():
        try:
            rpc_connection = get_rpc_connection(ticker)
            info = rpc_connection.getblockchaininfo()
            health_status[ticker] = {
                "connected": True,
                "blocks": info.get('blocks', 'unknown'),
                "headers": info.get('headers', 'unknown'),
                "chain": info.get('chain', 'unknown')
            }
        except Exception as e:
            health_status[ticker] = {
                "connected": False,
                "error": str(e)
            }
    
    return jsonify({
        "status": "success",
        "data": {
            "total_nodes": len(config.sections()),
            "connected_nodes": len([s for s in health_status.values() if s.get('connected')]),
            "nodes": health_status
        }
    })

def rate_limit(endpoint, ticker, identifier, window=5, max_requests=10):
    """
    Rate limit requests to an endpoint.
    endpoint: The API endpoint (e.g., 'listunspent')
    ticker: The ticker (e.g., 'GEMMA')
    identifier: The address or txid
    window: Time window in seconds (default: 5 seconds)
    max_requests: Maximum requests allowed in the window (default: 10 requests)
    """
    key = f"{endpoint}:{ticker}:{identifier}"
    current_time = time.time()
    
    # Clean up old timestamps
    request_timestamps[key] = [t for t in request_timestamps[key] if current_time - t < window]
    
    # Check if request should be rate-limited
    if len(request_timestamps[key]) >= max_requests:
        address_logger.warning(f"Rate limit exceeded for {key}")
        return False
    
    # Add current request timestamp
    request_timestamps[key].append(current_time)
    return True

def get_rpc_connection(ticker):
    """Get RPC connection for a given ticker."""
    if ticker not in config:
        raise ValueError(f"No configuration found for ticker: {ticker}")
    
    try:
        rpc_user = config[ticker]['rpcuser']
        rpc_password = config[ticker]['rpcpassword']
        rpc_host = config[ticker]['rpchost']
        rpc_port = config[ticker]['rpcport']
        rpcwallet = config[ticker].get('rpcwallet', '').strip()
        
        # Validate configuration values
        if not all([rpc_user, rpc_password, rpc_host, rpc_port]):
            raise ValueError(f"Incomplete RPC configuration for {ticker}")
        
        # Check if host is localhost and validate port
        if rpc_host == 'localhost' and not (1024 <= int(rpc_port) <= 65535):
            raise ValueError(f"Invalid port number for {ticker}: {rpc_port}")
        
        if rpcwallet:
            rpc_url = f'http://{rpc_user}:{rpc_password}@{rpc_host}:{rpc_port}/wallet/{rpcwallet}'
        else:
            rpc_url = f'http://{rpc_user}:{rpc_password}@{rpc_host}:{rpc_port}'
        
        # Test connection with timeout
        import socket
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(5)  # 5 second timeout
        
        try:
            sock.connect((rpc_host, int(rpc_port)))
            sock.close()
        except (socket.timeout, socket.error) as e:
            sock.close()
            raise ConnectionError(f"Cannot connect to {rpc_host}:{rpc_port} - {str(e)}")
        
        return AuthServiceProxy(rpc_url)
        
    except KeyError as e:
        raise ValueError(f"Missing RPC configuration for {ticker}: {e}")
    except ValueError as e:
        raise e
    except Exception as e:
        raise ConnectionError(f"Failed to establish RPC connection for {ticker}: {str(e)}")

@bitcoin_rpc_bp.route('/listunspent/<ticker>/<address>', methods=['GET'])
def get_unspent_txs(ticker, address):
    if not rate_limit('listunspent', ticker, address, window=5, max_requests=10):
        return jsonify({"status": "error", "message": "Rate limit exceeded, please try again later"}), 429

    address_logger.info(f"Fetching unspent transactions for ticker: {ticker}, address: {address}")
    
    try:
        rpc_connection = get_rpc_connection(ticker)
    except Exception as e:
        error_msg = f"Failed to connect to {ticker} RPC node: {str(e)}"
        address_logger.error(error_msg)
        return jsonify({
            "status": "error", 
            "message": error_msg,
            "details": "The cryptocurrency node may be offline or unreachable"
        }), 503
    
    try:
        utxos = rpc_connection.listunspent(0, 9999999, [address])
        return jsonify({
            "status": "success",
            "data": {
                "network": ticker,
                "address": address,
                "txs": [
                    {
                        "txid": utxo['txid'],
                        "vout": utxo['vout'],
                        "script_hex": utxo['scriptPubKey'],
                        "value": utxo['amount'],
                        "confirmations": utxo['confirmations']
                    } for utxo in utxos
                ]
            }
        })
    except JSONRPCException as e:
        address_logger.error(f"RPC error fetching unspent transactions for {ticker}: {str(e)}")
        return jsonify({
            "status": "error", 
            "message": f"RPC error: {str(e)}",
            "details": "The cryptocurrency node returned an error"
        }), 400
    except Exception as e:
        error_msg = f"Unexpected error fetching unspent transactions for {ticker}: {str(e)}"
        address_logger.error(error_msg)
        return jsonify({
            "status": "error", 
            "message": error_msg,
            "details": "An unexpected error occurred while communicating with the node"
        }), 500

@bitcoin_rpc_bp.route('/sendrawtransaction/<ticker>', methods=['POST'])
def send_raw_transaction(ticker):
    address_logger.info(f"Sending raw transaction for ticker: {ticker}")
    try:
        rpc_connection = get_rpc_connection(ticker)
        raw_tx = request.json.get('raw_tx')
        txid = rpc_connection.sendrawtransaction(raw_tx)
        return jsonify({'txid': txid})
    except (JSONRPCException, ValueError) as e:
        address_logger.error(f"Error sending raw transaction: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bitcoin_rpc_bp.route('/getblockchaininfo/<ticker>', methods=['GET'])
def get_blockchain_info(ticker):
    address_logger.info(f"Fetching blockchain info for ticker: {ticker}")
    try:
        rpc_connection = get_rpc_connection(ticker)
        info = rpc_connection.getblockchaininfo()
        return jsonify(info)
    except (JSONRPCException, ValueError) as e:
        address_logger.error(f"Error fetching blockchain info: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bitcoin_rpc_bp.route('/estimatesmartfee/<ticker>/<conf_target>', methods=['GET'])
def estimate_smart_fee(ticker, conf_target):
    address_logger.info(f"Estimating smart fee for ticker: {ticker}, conf_target: {conf_target}")
    try:
        rpc_connection = get_rpc_connection(ticker)
        fee_estimate = rpc_connection.estimatesmartfee(int(conf_target))
        return jsonify(fee_estimate)
    except (JSONRPCException, ValueError) as e:
        address_logger.error(f"Error estimating smart fee: {str(e)}")
        return jsonify({'error': str(e)}), 500

@bitcoin_rpc_bp.route('/getlasttransactions/<ticker>/<address>', methods=['GET'])
def get_last_transactions(ticker, address):
    if not rate_limit('getlasttransactions', ticker, address, window=5, max_requests=10):
        return jsonify({"status": "error", "message": "Rate limit exceeded, please try again later"}), 429

    address_logger.info(f"Fetching last transactions for ticker: {ticker}, address: {address}")
    try:
        rpc_connection = get_rpc_connection(ticker)
        
        transactions = rpc_connection.listtransactions("*", 10, 0, True)
        
        filtered_transactions = [
            tx for tx in transactions if tx.get('address') == address
        ]

        tx_dict = {}
        for tx in filtered_transactions:
            txid = tx['txid']
            if txid in tx_dict:
                existing_tx = tx_dict[txid]
                if tx['confirmations'] > existing_tx['confirmations']:
                    tx_dict[txid] = tx
                elif tx['confirmations'] == existing_tx['confirmations']:
                    existing_time = existing_tx.get('time', float('inf'))
                    current_time = tx.get('time', float('inf'))
                    if current_time < existing_time:
                        tx_dict[txid] = tx
            else:
                tx_dict[txid] = tx

        unique_transactions = list(tx_dict.values())
        unique_transactions.sort(key=lambda x: x.get('time', 0), reverse=True)

        formatted_transactions = [
            {
                "txid": tx['txid'],
                "amount": f"{tx['amount']:.8f}",
                "confirmations": tx['confirmations'],
                "time": tx.get('time', 'N/A'),
                "address": tx.get('address', 'N/A')
            }
            for tx in unique_transactions
        ]

        return jsonify({
            "status": "success",
            "data": {
                "network": ticker,
                "address": address,
                "transactions": formatted_transactions
            }
        })
    except (JSONRPCException, ValueError) as e:
        address_logger.error(f"Error fetching last transactions: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@bitcoin_rpc_bp.route('/importaddress/<ticker>', methods=['POST'])
def import_address(ticker):
    rpc_connection = get_rpc_connection(ticker)
    data = request.json

    address_logger.info(f"Received import address request for {ticker}: {data}")

    address = data.get('address')

    if not address or not isinstance(address, str) or address.strip() == '':
        address_logger.error("Invalid address provided for import")
        return jsonify({"status": "error", "message": "A single valid address is required."}), 400

    try:
        rpc_connection.importaddress(address, "", False)
        return jsonify({
            "status": "success",
            "imported_address": address
        }), 200
    except JSONRPCException as e:
        address_logger.error(f"Error importing address: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 500

@bitcoin_rpc_bp.route('/gettransaction/<ticker>/<txid>', methods=['GET'])
def get_transaction_details(ticker, txid):
    if not rate_limit('gettransaction', ticker, txid, window=5, max_requests=10):
        return jsonify({"status": "error", "message": "Rate limit exceeded, please try again later"}), 429

    address_logger.info(f"Fetching transaction details for ticker: {ticker}, txid: {txid}")
    try:
        rpc_connection = get_rpc_connection(ticker)
        tx_details = rpc_connection.getrawtransaction(txid, 1)
        
        formatted_tx = {
            "txid": tx_details['txid'],
            "size": tx_details['size'],
            "vsize": tx_details.get('vsize', tx_details['size']),
            "version": tx_details['version'],
            "locktime": tx_details['locktime'],
            "vin": [{
                "txid": vin.get('txid', ''),
                "vout": vin.get('vout', ''),
                "sequence": vin.get('sequence', 0)
            } for vin in tx_details['vin']],
            "vout": [{
                "value": vout['value'],
                "n": vout['n'],
                "scriptPubKey": {
                    "asm": vout['scriptPubKey'].get('asm', ''),
                    "hex": vout['scriptPubKey'].get('hex', ''),
                    "type": vout['scriptPubKey'].get('type', ''),
                    "addresses": vout['scriptPubKey'].get('addresses', [])
                }
            } for vout in tx_details['vout']],
            "confirmations": tx_details.get('confirmations', 0),
            "time": tx_details.get('time', 0),
            "blocktime": tx_details.get('blocktime', 0),
            "blockhash": tx_details.get('blockhash', '')
        }

        return jsonify({
            "status": "success",
            "data": formatted_tx
        })
    except JSONRPCException as e:
        address_logger.error(f"Error fetching transaction details: {str(e)}")
        return jsonify({
            "status": "error",
            "message": str(e)
        }), 400
    except Exception as e:
        address_logger.error(f"Unexpected error fetching transaction details: {str(e)}")
        return jsonify({
            "status": "error",
            "message": f"Unexpected error: {str(e)}"
        }), 500