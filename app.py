from flask import Flask, render_template, request, jsonify
from flask_cors import CORS  # Import Flask-CORS
from routes.bitcoinRPC import bitcoin_rpc_bp
from routes.bitcoreLib import bitcore_lib_bp
from routes.main import main_bp
from routes.rc001 import rc001_bp
from routes.prices import prices_bp
from routes.task import start_scheduler

app = Flask(__name__, static_folder='static')

# Increase request size limit to handle large transaction data
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB limit

# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*"}})

# Health check endpoint
@app.route('/health')
def health_check():
    return jsonify({
        'status': 'healthy',
        'timestamp': __import__('datetime').datetime.now().isoformat(),
        'service': 'PlugzWallet2'
    })

# Block for PHP scan to prevent server hacking
@app.before_request
def block_php_scan():
    # Allow manifest.json and other essential files
    if request.path.lower().endswith('.json') or request.path.lower().endswith('/manifest'):
        return None  # Allow these files
    
    # Only block actual PHP file requests, not paths containing 'php' in other contexts
    if request.path.lower().endswith('.php') or request.path.lower().endswith('/php'):
        return "Access Denied", 403

# Register the blueprints
app.register_blueprint(bitcoin_rpc_bp, url_prefix='/api')
app.register_blueprint(bitcore_lib_bp, url_prefix='/bitcore_lib')
app.register_blueprint(rc001_bp, url_prefix='/rc001')
app.register_blueprint(prices_bp, url_prefix='/prices')
app.register_blueprint(main_bp)

# Start the scheduler
scheduler = start_scheduler()

# Shut down the scheduler when exiting the app
@app.teardown_appcontext
def shutdown_scheduler(exception=None):
    if scheduler.running:
        scheduler.shutdown()

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5679, debug=True)
