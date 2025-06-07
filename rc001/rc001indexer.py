import json
import base64
import binascii
import sqlite3
from bitcoinrpc.authproxy import AuthServiceProxy, JSONRPCException
from bs4 import BeautifulSoup
import time
import os
import re
from decimal import Decimal
import logging
from logging.handlers import RotatingFileHandler
from contextlib import contextmanager
import configparser
from typing import Optional, Tuple, List, Dict, Any

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)
handler = RotatingFileHandler('blockchain_scanner.log', maxBytes=5*1024*1024, backupCount=3)
logger.addHandler(handler)

# Configuration constants
CONFIG_DIR = "./collections"
LAST_BLOCK_FILE = "./last_block_scanned.json"
RPC_CONFIG_FILE = "../config/rpc.conf"
DATABASE_FILE = "./collections/all_collections.db"
SCAN_INTERVAL = 30
RETRY_DELAY = 5

class BlockchainScanner:
    def __init__(self):
        self.rpc_configs = self._load_rpc_configs()
        self.rpc_connections = {}
        os.makedirs(CONFIG_DIR, exist_ok=True)
        self._initialize_database()

    def _load_rpc_configs(self) -> Dict[str, Dict[str, str]]:
        """Load RPC configurations from RPC.conf"""
        config = configparser.ConfigParser()
        if not os.path.exists(RPC_CONFIG_FILE):
            logger.error(f"RPC configuration file {RPC_CONFIG_FILE} not found")
            raise FileNotFoundError(f"RPC configuration file {RPC_CONFIG_FILE} not found")
        config.read(RPC_CONFIG_FILE)
        return {section: dict(config[section]) for section in config.sections()}

    def _initialize_database(self) -> None:
        """Initialize the single database with required tables"""
        with self.get_db_connection() as conn:
            c = conn.cursor()
            c.execute('''CREATE TABLE IF NOT EXISTS collections (
                        collection_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        coin_ticker TEXT,
                        name TEXT,
                        sanitized_name TEXT,
                        mint_address TEXT,
                        mint_price TEXT,
                        parent_inscription_id TEXT,
                        emblem_inscription_id TEXT,
                        website TEXT,
                        deploy_txid TEXT,
                        deploy_address TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(coin_ticker, sanitized_name)
                        )''')
            c.execute('''CREATE TABLE IF NOT EXISTS serial_ranges (
                        range_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        collection_id INTEGER,
                        range_index INTEGER,
                        range_value TEXT,
                        FOREIGN KEY (collection_id) REFERENCES collections(collection_id)
                        )''')
            c.execute('''CREATE TABLE IF NOT EXISTS items (
                        item_id INTEGER PRIMARY KEY AUTOINCREMENT,
                        collection_id INTEGER,
                        inscription_id TEXT UNIQUE,
                        sn TEXT,
                        inscription_status TEXT,
                        inscription_address TEXT,
                        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                        sequence_number INTEGER,
                        UNIQUE(collection_id, sn),
                        FOREIGN KEY (collection_id) REFERENCES collections(collection_id)
                        )''')
            conn.commit()

    @contextmanager
    def get_rpc_connection(self, coin_ticker: str):
        """Context manager for chain-specific RPC connection"""
        if coin_ticker not in self.rpc_configs:
            logger.error(f"No RPC configuration found for coin {coin_ticker}")
            raise ValueError(f"No RPC configuration found for coin {coin_ticker}")
        rpc_config = self.rpc_configs[coin_ticker]
        rpc_url = f"http://{rpc_config['rpcuser']}:{rpc_config['rpcpassword']}@{rpc_config['rpchost']}:{rpc_config['rpcport']}"
        try:
            rpc = AuthServiceProxy(rpc_url, timeout=60)
            yield rpc
        except Exception as e:
            logger.error(f"Error connecting to RPC server for {coin_ticker}: {e}")
            raise
        finally:
            pass

    @contextmanager
    def get_db_connection(self):
        """Context manager for database connection"""
        conn = None
        try:
            conn = sqlite3.connect(DATABASE_FILE, timeout=10)
            yield conn
        except sqlite3.Error as e:
            logger.error(f"Database error: {e}")
            raise
        finally:
            if conn:
                conn.close()

    def load_last_block_heights(self) -> Dict[str, Dict[str, int]]:
        """Load the last scanned block heights for all coins"""
        try:
            with open(LAST_BLOCK_FILE, 'r') as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            logger.warning("Last block file not found or invalid, using defaults")
            return {
                "DOGE": {"start_block_height": 5455286, "last_block_height": 5455285},
                "PEP": {"start_block_height": 0, "last_block_height": 0},
                "SHIC": {"start_block_height": 0, "last_block_height": 0},
                "DEV": {"start_block_height": 0, "last_block_height": 0},
                "BONC": {"start_block_height": 0, "last_block_height": 0},
                "DGB": {"start_block_height": 5455286, "last_block_height": 5455285}
            }

    def update_last_block_heights(self, block_heights: Dict[str, Dict[str, int]]) -> None:
        """Update the last scanned block heights for all coins"""
        try:
            with open(LAST_BLOCK_FILE, 'w') as f:
                json.dump(block_heights, f, indent=4)
        except Exception as e:
            logger.error(f"Error updating last block heights: {e}")
            raise

    @staticmethod
    def hex_to_base64(hex_str: str) -> Optional[str]:
        """Convert hex string to base64"""
        try:
            if len(hex_str) % 2 != 0:
                return None
            return base64.b64encode(binascii.unhexlify(hex_str)).decode('utf-8')
        except binascii.Error as e:
            logger.error(f"Error decoding hex to base64: {e}")
            return None

    @staticmethod
    def base64_to_text(base64_str: str) -> Optional[str]:
        """Convert base64 string to text"""
        try:
            return base64.b64decode(base64_str).decode('utf-8')
        except (binascii.Error, UnicodeDecodeError) as e:
            logger.error(f"Error decoding base64 to text: {e}")
            return None

    @staticmethod
    def hex_to_ascii(hex_string: str) -> Optional[str]:
        """Convert hex string to ASCII"""
        try:
            if len(hex_string) % 2 != 0:
                return None
            return binascii.unhexlify(hex_string).decode('ascii')
        except Exception as e:
            logger.error(f"Error converting hex to ASCII: {e}")
            return None

    @staticmethod
    def sanitize_filename(name: str) -> str:
        """Sanitize filename to prevent injection"""
        return re.sub(r'[^\w\-]', '', name)

    def _get_collection_id(self, coin_ticker: str, sanitized_name: str) -> Optional[int]:
        """Get collection ID from coin ticker and sanitized name"""
        with self.get_db_connection() as conn:
            c = conn.cursor()
            c.execute('SELECT collection_id FROM collections WHERE coin_ticker = ? AND sanitized_name = ?', 
                     (coin_ticker, sanitized_name))
            result = c.fetchone()
            return result[0] if result else None

    def _get_collection_config(self, collection_id: int) -> Dict[str, Any]:
        """Get collection configuration from database"""
        config = {}
        with self.get_db_connection() as conn:
            c = conn.cursor()
            c.execute('SELECT * FROM collections WHERE collection_id = ?', (collection_id,))
            collection_data = c.fetchone()
            if not collection_data:
                return {}
            c.execute('SELECT range_index, range_value FROM serial_ranges WHERE collection_id = ? ORDER BY range_index', 
                     (collection_id,))
            ranges = c.fetchall()
            config['coin_ticker'] = collection_data[1]
            config['mint_address'] = collection_data[4]
            config['mint_price'] = collection_data[5]
            config['parent_inscription_id'] = collection_data[6]
            for range_index, range_value in ranges:
                if range_index == 0 and '-' in range_value and len(range_value.split('-')[0]) > 2:
                    config['sn_range'] = range_value
                config[f'sn_index_{range_index}'] = range_value
        return config

    def is_valid_sn(self, sn: str, coin_ticker: str, collection_name: str) -> bool:
        """Validate serial number against collection configuration"""
        try:
            collection_id = self._get_collection_id(coin_ticker, collection_name)
            if not collection_id:
                logger.error(f"Collection {collection_name} not found on coin {coin_ticker}")
                return False
            config = self._get_collection_config(collection_id)
            if not config:
                logger.error(f"Configuration for collection {collection_name} on coin {coin_ticker} not found")
                return False
            if 'sn_range' in config:
                valid_range = config['sn_range'].split('-')
                if len(valid_range[0]) > 2 and len(valid_range[1]) > 2:
                    padded_sn = sn.zfill(len(valid_range[1]))
                    if valid_range[0] <= padded_sn <= valid_range[1]:
                        return True
                    return False
            sn_index_keys = [key for key in config if key.startswith('sn_index_')]
            if len(sn_index_keys) == 1:
                valid_range = config[sn_index_keys[0]].split('-')
                padded_sn = sn.zfill(len(valid_range[1]))
                if valid_range[0] <= padded_sn <= valid_range[1]:
                    return True
                return False
            segments = [sn[i:i+2] for i in range(0, len(sn), 2)]
            for i, segment in enumerate(segments):
                range_key = f'sn_index_{i}'
                if range_key in config:
                    valid_range = config[range_key].split('-')
                    padded_segment = segment.zfill(len(valid_range[1]))
                    if not (valid_range[0] <= padded_segment <= valid_range[1]):
                        return False
                else:
                    return False
            return True
        except Exception as e:
            logger.error(f"Error validating serial number: {e}")
            return False

    def extract_inscription_data(self, asm_data: List[str]) -> Tuple[Optional[str], Optional[str]]:
        """Extract inscription data from ASM"""
        try:
            data_string = ""
            mime_type = None
            index = 1
            if index >= len(asm_data) or not asm_data[index].lstrip('-').isdigit():
                return None, None
            index += 1
            if index >= len(asm_data):
                return None, None
            mime_type_hex = asm_data[index]
            mime_type = self.hex_to_ascii(mime_type_hex)
            index += 1
            while index < len(asm_data):
                part = asm_data[index]
                if part.lstrip('-').isdigit():
                    index += 1
                    if index >= len(asm_data):
                        return None, None
                    data_string += asm_data[index]
                    index += 1
                else:
                    break
            return data_string, mime_type
        except Exception as e:
            logger.error(f"Error extracting inscription data: {e}")
            return None, None

    def process_transaction(self, coin_ticker: str, tx: Dict[str, Any], rpc_connection: AuthServiceProxy, block: Dict[str, Any]) -> None:
        """Process a single transaction"""
        try:
            if not tx.get('vin') or not tx['vin'][0].get('scriptSig', {}).get('asm'):
                return
            asm_data = tx['vin'][0]['scriptSig']['asm'].split()
            if not asm_data or asm_data[0] != '6582895':
                return
            data_string, mime_type = self.extract_inscription_data(asm_data)
            if not data_string or not mime_type or 'text/html' not in mime_type.lower():
                return
            html_data_base64 = self.hex_to_base64(data_string)
            if not html_data_base64:
                return
            html_data_text = self.base64_to_text(html_data_base64)
            if not html_data_text or '<meta name="p" content="rc001">' not in html_data_text:
                return
            soup = BeautifulSoup(html_data_text, 'html.parser')
            op_meta = soup.find('meta', attrs={'name': 'op'})
            if not op_meta:
                return
            operation = op_meta.get('content')
            if operation == 'deploy':
                self.handle_deploy_operation(coin_ticker, soup, tx['txid'], tx)
            elif operation == 'mint':
                self.handle_mint_operation(coin_ticker, soup, tx['txid'], tx, block)
        except Exception as e:
            logger.error(f"Error processing transaction {tx['txid']} on coin {coin_ticker}: {e}")

    def handle_deploy_operation(self, coin_ticker: str, soup: BeautifulSoup, txid: str, tx: Dict[str, Any]) -> None:
        """Handle deploy operation"""
        try:
            title = soup.find('title').string if soup.find('title') else 'Untitled'
            sanitized_title = self.sanitize_filename(title)
            with self.get_db_connection() as conn:
                c = conn.cursor()
                c.execute('SELECT collection_id FROM collections WHERE coin_ticker = ? AND sanitized_name = ?', 
                         (coin_ticker, sanitized_title))
                if c.fetchone():
                    logger.warning(f"Collection {sanitized_title} already exists on coin {coin_ticker} with txid {txid}")
                    return
            json_script = soup.find('script', attrs={'type': 'application/json', 'id': 'json-data'})
            if not json_script or not json_script.string:
                logger.error(f"No valid JSON data found in deploy operation with txid {txid}")
                return
            json_data = json.loads(json_script.string.strip().replace('\xa0', ' '))
            sn_ranges = json_data.get('sn', [])
            mint_address = json_data.get('mint_address', 'Unknown')
            mint_price = json_data.get('mint_price', 'Unknown')
            parent_inscription_id = json_data.get('parent_inscription_id', 'Unknown')
            emblem_inscription_id = json_data.get('emblem_inscription_id', 'Unknown')
            website = json_data.get('website', 'Unknown')
            inscription_address = None
            if tx['vout'] and tx['vout'][0].get('scriptPubKey', {}).get('addresses'):
                inscription_address = tx['vout'][0]['scriptPubKey']['addresses'][0]
            with self.get_db_connection() as conn:
                c = conn.cursor()
                c.execute('''INSERT INTO collections (
                            coin_ticker, name, sanitized_name, mint_address, mint_price, parent_inscription_id,
                            emblem_inscription_id, website, deploy_txid, deploy_address
                            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                         (coin_ticker, title, sanitized_title, mint_address, mint_price, parent_inscription_id,
                          emblem_inscription_id, website, txid, inscription_address))
                collection_id = c.lastrowid
                for i, sn in enumerate(sn_ranges):
                    c.execute('INSERT INTO serial_ranges (collection_id, range_index, range_value) VALUES (?, ?, ?)',
                             (collection_id, i, sn["range"]))
                conn.commit()
            logger.info(f"Deployed collection {sanitized_title} on coin {coin_ticker} with txid {txid}")
        except Exception as e:
            logger.error(f"Error handling deploy operation on coin {coin_ticker} with txid {txid}: {e}")

    def handle_mint_operation(self, coin_ticker: str, soup: BeautifulSoup, txid: str, tx: Dict[str, Any], block: Dict[str, Any]) -> None:
        """Handle mint operation"""
        try:
            title = soup.find('title').string if soup.find('title') else 'Untitled'
            sanitized_title = self.sanitize_filename(title)
            collection_id = self._get_collection_id(coin_ticker, sanitized_title)
            if not collection_id:
                logger.error(f"Collection {sanitized_title} not found on coin {coin_ticker}")
                return
            config = self._get_collection_config(collection_id)
            if not config:
                logger.error(f"Configuration for collection {sanitized_title} on coin {coin_ticker} not found")
                return
            sn_meta = soup.find('meta', attrs={'name': 'sn'})
            sn = sn_meta['content'] if sn_meta else 'Unknown'
            if not self.is_valid_sn(sn, coin_ticker, sanitized_title):
                logger.warning(f"Invalid serial number {sn} for collection {sanitized_title} on coin {coin_ticker}")
                return
            parent_inscription_id = config.get('parent_inscription_id', 'Unknown')
            script_tag = soup.find('script', src=True)
            if not script_tag or script_tag['src'].split('/')[-1] != parent_inscription_id:
                logger.warning(f"Parent inscription ID mismatch or no script tag found for {sanitized_title} on {coin_ticker}")
                return
            mint_price_sats = float(config.get('mint_price', '0'))
            mint_price_btc = Decimal(mint_price_sats) / Decimal(100000000)
            mint_address = config.get('mint_address', 'Unknown')
            if mint_price_btc > 0:
                valid_payment = any(
                    Decimal(vout['value']) == mint_price_btc and mint_address in vout['scriptPubKey']['addresses']
                    for vout in tx['vout']
                    if 'value' in vout and 'scriptPubKey' in vout and 'addresses' in vout['scriptPubKey']
                )
                if not valid_payment:
                    logger.warning(f"Invalid payment for mint: {mint_price_btc} to {mint_address} on {coin_ticker}")
                    return

            # Retrieve the block height from the block data
            block_height = block.get('height', None)
            if block_height is None:
                logger.error(f"Block height not found for transaction {txid} on coin {coin_ticker}")
                return

            with self.get_db_connection() as conn:
                c = conn.cursor()
                c.execute('SELECT item_id FROM items WHERE collection_id = ? AND sn = ?', (collection_id, sn))
                if c.fetchone():
                    logger.warning(f"Serial number {sn} already exists in collection {sanitized_title} on {coin_ticker}")
                    return
                inscription_id = f"{txid}i0"
                inscription_address = None
                if tx['vout'] and tx['vout'][0].get('scriptPubKey', {}).get('addresses'):
                    inscription_address = tx['vout'][0]['scriptPubKey']['addresses'][0]

                # Calculate the next sequence number
                c.execute('SELECT COUNT(*) FROM items WHERE collection_id = ?', (collection_id,))
                sequence_number = c.fetchone()[0] + 1

                c.execute('''INSERT INTO items (
                            collection_id, inscription_id, sn, inscription_status, inscription_address, created_at, sequence_number
                            ) VALUES (?, ?, ?, ?, ?, ?, ?)''',
                         (collection_id, inscription_id, sn, 'minted', inscription_address, block_height, sequence_number))
                conn.commit()
            logger.info(f"Minted item with SN {sn} for collection {sanitized_title} on coin {coin_ticker} with txid {txid}")
        except Exception as e:
            logger.error(f"Error handling mint operation on coin {coin_ticker}: {e}")

    def run(self) -> None:
        """Main scanning loop for multiple blockchains"""
        block_heights = self.load_last_block_heights()
        while True:
            for coin_ticker, heights in block_heights.items():
                try:
                    if coin_ticker not in self.rpc_configs:
                        logger.warning(f"Skipping coin {coin_ticker}: No RPC configuration found")
                        continue
                    with self.get_rpc_connection(coin_ticker) as rpc:
                        current_block_height = rpc.getblockcount()
                        start_height = heights["start_block_height"]
                        last_height = heights["last_block_height"]
                        scan_start_height = max(start_height, last_height + 1)
                        if scan_start_height > current_block_height:
                            logger.info(f"No new blocks to process for {coin_ticker} at height {current_block_height}")
                            continue
                        logger.info(f"Processing blocks for {coin_ticker} from {scan_start_height} to {current_block_height}")
                        for block_height in range(scan_start_height, current_block_height + 1):
                            try:
                                block_hash = rpc.getblockhash(block_height)
                                block = rpc.getblock(block_hash, 2)
                                for tx in block['tx']:
                                    self.process_transaction(coin_ticker, tx, rpc, block)
                                block_heights[coin_ticker]["last_block_height"] = block_height
                                self.update_last_block_heights(block_heights)
                            except Exception as e:
                                logger.error(f"Error processing block {block_height} for {coin_ticker}: {e}")
                                continue  # Skip to next block if one fails
                except Exception as e:
                    logger.error(f"Error in RPC connection or block retrieval for {coin_ticker}: {e}")
                    time.sleep(RETRY_DELAY)
                    continue  # Skip to next coin if RPC fails
            time.sleep(SCAN_INTERVAL)

if __name__ == "__main__":
    scanner = BlockchainScanner()
    scanner.run()