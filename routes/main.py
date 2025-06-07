from flask import Blueprint, render_template, send_from_directory, request

main_bp = Blueprint('main', __name__)

@main_bp.route('/endpoints', methods=['GET'])
def show_endpoints():
    return render_template('endpoints.html') 

@main_bp.route('/wallet')
def index():
    return render_template('wallet.html')

@main_bp.route('/developer')
def developer():
    return render_template('developer.html')

@main_bp.route('/')
def settings():
    return render_template('index.html')

@main_bp.route('/manifest.json')
def manifest():
    return send_from_directory('static', 'manifest.json')

@main_bp.route('/service-worker.js')
def service_worker():
    return send_from_directory('static/js', 'service-worker.js')

@main_bp.route('/block_explorers')
def block_explorers():
    return render_template('block_explorers.html')

@main_bp.route('/ord_explorers')
def ord_explorers():
    return render_template('ord_explorers.html')

@main_bp.route('/faucets')
def faucets():
    return render_template('faucets.html')

@main_bp.route('/rc001')
def rc001():
    return render_template('rc001.html')

@main_bp.route('/api/debug/receive', methods=['POST'])
def debug_receive():
    data = request.get_json()
    print(f"[DEBUG] Receive button pressed: {data}")
    return {'status': 'ok'}, 200