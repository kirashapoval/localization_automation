import os
import queue
import threading
import logging
import json
import time
from pathlib import Path
from flask import Flask, render_template, request, jsonify, send_from_directory, Response
from flask_cors import CORS
from werkzeug.utils import secure_filename

from translator import HTMLTranslator, load_config, TranslationConfig

# Configure Flask app
app = Flask(__name__)
CORS(app)

# Configuration
UPLOAD_FOLDER = 'uploads'
OUTPUT_FOLDER = 'translated_output'
ALLOWED_EXTENSIONS = {'html', 'htm'}

app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['OUTPUT_FOLDER'] = OUTPUT_FOLDER

# Ensure directories exist
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
os.makedirs(OUTPUT_FOLDER, exist_ok=True)

# Global state
message_queue = queue.Queue()
is_processing = False

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def sse_format(data):
    return f"data: {json.dumps(data)}\n\n"

def progress_callback(data):
    """Callback passed to translator to receive updates"""
    message_queue.put(data)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    if 'files[]' not in request.files:
        return jsonify({'error': 'No file part'}), 400
    
    files = request.files.getlist('files[]')
    saved_files = []
    
    # Clean upload directory
    for f in os.listdir(app.config['UPLOAD_FOLDER']):
        os.remove(os.path.join(app.config['UPLOAD_FOLDER'], f))
        
    for file in files:
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)
            saved_files.append(filename)
    
    return jsonify({'message': f'Successfully uploaded {len(saved_files)} files', 'files': saved_files})

@app.route('/start', methods=['POST'])
def start_translation():
    global is_processing
    if is_processing:
        return jsonify({'error': 'Already processing'}), 409
    
    data = request.json
    target_languages = data.get('languages', ['de'])
    
    # Load base config
    try:
        config = load_config()
        config.target_languages = target_languages
        config.output_directory = app.config['OUTPUT_FOLDER']
        config.output_suffix = True
    except Exception as e:
        return jsonify({'error': str(e)}), 500

    # Start translation in background thread
    thread = threading.Thread(target=run_translation, args=(config,))
    thread.daemon = True
    thread.start()
    
    return jsonify({'message': 'Translation started'})

def run_translation(config):
    global is_processing
    is_processing = True
    message_queue.put({'type': 'start', 'message': 'Starting translation process...'})
    
    try:
        # Clear output directory before starting
        output_dir = Path(app.config['OUTPUT_FOLDER'])
        for f in output_dir.glob('*'):
            try:
                if f.is_file():
                    f.unlink()
            except Exception as e:
                logging.error(f"Error deleting file {f}: {e}")

        translator = HTMLTranslator(config, progress_callback=progress_callback)
        input_dir = Path(app.config['UPLOAD_FOLDER'])
        
        # Process all files in upload directory
        translator.process_directory(input_dir)
        
        # Get list of generated files
        output_files = []
        output_dir = Path(app.config['OUTPUT_FOLDER'])
        for f in output_dir.glob('*.html'):
            output_files.append(f.name)
            
        message_queue.put({
            'type': 'complete', 
            'message': 'Translation completed successfully!',
            'files': output_files
        })
        
    except Exception as e:
        logging.error(f"Translation error: {e}")
        message_queue.put({'type': 'error', 'message': str(e)})
    finally:
        is_processing = False

@app.route('/stream')
def stream():
    def event_stream():
        while True:
            try:
                # Get message from queue with shorter timeout for better keepalive
                message = message_queue.get(timeout=10)
                yield sse_format(message)
            except queue.Empty:
                # Send keepalive every 10 seconds
                yield sse_format({'type': 'ping'})
                
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/download/<filename>')
def download_file(filename):
    return send_from_directory(app.config['OUTPUT_FOLDER'], filename, as_attachment=True)

if __name__ == '__main__':
    app.run(debug=True, port=5000)

