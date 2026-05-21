from flask import Flask, request, Response, jsonify, send_from_directory
from flask_cors import CORS
import subprocess
import json
import os

app = Flask(__name__, static_folder='frontend')
CORS(app)

# ─── Serve Frontend ────────────────────────────────────────────────────────────

@app.route('/')
def index():
    return send_from_directory('frontend', 'index.html')

@app.route('/<path:path>')
def static_files(path):
    return send_from_directory('frontend', path)

# ─── Search ────────────────────────────────────────────────────────────────────

@app.route('/search')
def search():
    query = request.args.get('q', '')
    if not query:
        return jsonify([])

    try:
        from ytmusicapi import YTMusic
        yt = YTMusic()
        results = yt.search(query, filter='songs', limit=20)

        tracks = []
        for r in results:
            try:
                tracks.append({
                    'id':        r['videoId'],
                    'title':     r['title'],
                    'artist':    r['artists'][0]['name'] if r.get('artists') else 'Unknown',
                    'album':     r['album']['name'] if r.get('album') else '',
                    'thumbnail': r['thumbnails'][-1]['url'] if r.get('thumbnails') else '',
                    'duration':  r.get('duration', ''),
                })
            except Exception:
                continue

        return jsonify(tracks)

    except Exception as e:
        return jsonify({'error': str(e)}), 500

# ─── Stream ────────────────────────────────────────────────────────────────────

@app.route('/stream')
def stream():
    video_id = request.args.get('id', '')
    if not video_id:
        return jsonify({'error': 'No video ID'}), 400

    url = f'https://www.youtube.com/watch?v={video_id}'

    def generate():
        process = subprocess.Popen(
            [
                'yt-dlp',
                '-f', 'bestaudio',
                '--extract-audio',
                '--audio-format', 'mp3',
                '--audio-quality', '0',
                '-o', '-',          # pipe to stdout, no file saved
                '--quiet',
                url
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL
        )
        try:
            while True:
                chunk = process.stdout.read(4096)
                if not chunk:
                    break
                yield chunk
        finally:
            process.stdout.close()
            process.wait()

    return Response(generate(), mimetype='audio/mpeg')

# ─── Lyrics (optional, free API) ───────────────────────────────────────────────

@app.route('/lyrics')
def lyrics():
    artist = request.args.get('artist', '')
    title  = request.args.get('title', '')
    if not artist or not title:
        return jsonify({'lyrics': None})

    import urllib.request
    try:
        api_url = f'https://api.lyrics.ovh/v1/{urllib.parse.quote(artist)}/{urllib.parse.quote(title)}'
        with urllib.request.urlopen(api_url, timeout=5) as resp:
            data = json.loads(resp.read())
            return jsonify({'lyrics': data.get('lyrics', None)})
    except Exception:
        return jsonify({'lyrics': None})

import urllib.parse

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
