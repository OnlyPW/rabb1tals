from flask import Flask, render_template, request, jsonify, g
from flask_cors import CORS  # Import Flask-CORS
from routes.bitcoinRPC import bitcoin_rpc_bp
from routes.bitcoreLib import bitcore_lib_bp
from routes.main import main_bp
from routes.rc001 import rc001_bp
from routes.prices import prices_bp
from routes.task import start_scheduler
from functools import wraps
import time
import json

# NEW: DB logging helper
from utilitys.logging_db import init_db, log_api

app = Flask(__name__, static_folder='static')

# Enable CORS for all routes
CORS(app, resources={r"/*": {"origins": "*"}})

# Initialize database tables on startup
init_db()

# DDoS protection variables
request_limit = 100  # Max requests per minute
request_times = {}

# --- Request/Response timing for API logging ---
@app.before_request
def _start_timer():
    g._start_time = time.time()

@app.after_request
def _log_response(response):
    try:
        start = getattr(g, '_start_time', time.time())
        duration_ms = int((time.time() - start) * 1000)
        # Only log JSON bodies up to a small size to avoid heavy writes
        req_body = None
        if request.method in ('POST', 'PUT', 'PATCH'):
            try:
                req_body = request.get_data(as_text=True)
            except Exception:
                req_body = None
        resp_body = None
        try:
            # Avoid huge binary bodies
            if response.content_type and 'json' in response.content_type:
                resp_body = response.get_data(as_text=True)
        except Exception:
            resp_body = None
        log_api(request.method, request.path, request.remote_addr or '-', response.status_code, duration_ms, req_body, resp_body)
    except Exception:
        pass
    return response

def ddos_protection(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        ip = request.remote_addr
        current_time = time.time()
        if ip not in request_times:
            request_times[ip] = []
        # Remove timestamps older than 60 seconds
        request_times[ip] = [timestamp for timestamp in request_times[ip] if current_time - timestamp < 60]
        # Check if the request limit is exceeded
        if len(request_times[ip]) >= request_limit:
            return jsonify({"error": "Too many requests"}), 429
        request_times[ip].append(current_time)
        return f(*args, **kwargs)
    return decorated_function

# Block for PHP scan to prevent server hacking
@app.before_request
def block_php_scan():
    if 'php' in request.path.lower():
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
    # Disable debug and reloader for service usage
    import os
    port = int(os.environ.get('PORT', 5679))
    app.run(host='0.0.0.0', port=port, debug=False, use_reloader=False)
