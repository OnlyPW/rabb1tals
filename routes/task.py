from apscheduler.schedulers.background import BackgroundScheduler
import subprocess
import os

def run_getprices():
    # Define the path to the getprices.py script
    script_path = os.path.join(os.path.dirname(__file__), '../utilitys', 'getprices.py')
    # Run the script using subprocess
    subprocess.run(['python3', script_path], check=True)

def start_scheduler():
    scheduler = BackgroundScheduler()
    scheduler.add_job(func=run_getprices, trigger='interval', minutes=5)
    scheduler.start()
    return scheduler 