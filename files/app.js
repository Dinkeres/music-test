/* ── WAVR — app.js ───────────────────────────────────────────────── */

const API = '';   // same origin; change to 'http://localhost:5000' if running separately

// ── State ──────────────────────────────────────────────────────────
const state = {
  queue:        [],
  queueIndex:   -1,
  shuffle:      false,
  repeat:       false,   // 'none' | 'one' | 'all'
  liked:        new Set(JSON.parse(localStorage.getItem('liked') || '[]')),
  playlists:    JSON.parse(localStorage.getItem('playlists') || '{}'),
  volume:       80,
};

// ── DOM refs ───────────────────────────────────────────────────────
const audio          = document.getElementById('audio-engine');
const searchInput    = document.getElementById('search-input');
const content        = document.getElementById('content');
const playerThumb    = document.getElementById('player-thumb');
const playerTitle    = document.getElementById('player-title');
const playerArtist   = document.getElementById('player-artist');
const playBtn        = document.getElementById('play-btn');
const iconPlay       = playBtn.querySelector('.icon-play');
const iconPause      = playBtn.querySelector('.icon-pause');
const progressFill   = document.getElementById('progress-fill');
const progressThumb  = document.getElementById('progress-thumb');
const progressBar    = document.getElementById('progress-bar');
const timeCurrent    = document.getElementById('time-current');
const timeTotal      = document.getElementById('time-total');
const volumeSlider   = document.getElementById('volume-slider');
const likeBtn        = document.getElementById('like-btn');
const shuffleBtn     = document.getElementById('shuffle-btn');
const nextBtn        = document.getElementById('next-btn');
const prevBtn        = document.getElementById('prev-btn');
const repeatBtn      = document.getElementById('repeat-btn');
const queuePanel     = document.getElementById('queue-panel');
const queueList      = document.getElementById('queue-list');
const queueToggleBtn = document.getElementById('queue-toggle-btn');
const clearQueueBtn  = document.getElementById('clear-queue-btn');
const lyricsModal    = document.getElementById('lyrics-modal');
const lyricsClose    = document.getElementById('lyrics-close');
const lyricsTitle    = document.getElementById('lyrics-title');
const lyricsBody     = document.getElementById('lyrics-body');
const playlistList   = document.getElementById('playlist-list');
const newPlaylistBtn = document.getElementById('new-playlist-btn');

// ── Helpers ────────────────────────────────────────────────────────
function fmtTime(s) {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function saveLiked()     { localStorage.setItem('liked',     JSON.stringify([...state.liked])); }
function savePlaylists() { localStorage.setItem('playlists', JSON.stringify(state.playlists)); }

function currentTrack() { return state.queue[state.queueIndex] || null; }

// ── Search ─────────────────────────────────────────────────────────
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') doSearch(searchInput.value.trim());
});

async function doSearch(query) {
  if (!query) return;
  content.innerHTML = `
    <div class="loading"><div class="spinner"></div> Searching for "${query}"…</div>`;

  try {
    const res = await fetch(`${API}/search?q=${encodeURIComponent(query)}`);
    const tracks = await res.json();

    if (!tracks.length) {
      content.innerHTML = `<p style="color:var(--muted);padding:20px">No results found.</p>`;
      return;
    }

    content.innerHTML = `
      <h2 class="section-title">Results for "${query}"</h2>
      <div class="track-list" id="track-list"></div>`;

    const list = document.getElementById('track-list');
    tracks.forEach((t, i) => list.appendChild(makeTrackEl(t, i + 1, tracks)));

  } catch (err) {
    content.innerHTML = `<p style="color:#ff5555;padding:20px">Error: ${err.message}</p>`;
  }
}

function makeTrackEl(track, num, allTracks) {
  const el = document.createElement('div');
  el.className = 'track-item';
  el.dataset.id = track.id;
  el.innerHTML = `
    <span class="track-num">${num}</span>
    <div class="track-play-hover">▶</div>
    <img class="track-thumb" src="${track.thumbnail}" onerror="this.style.display='none'" loading="lazy"/>
    <div class="track-info">
      <div class="track-title">${track.title}</div>
      <div class="track-artist">${track.artist}${track.album ? ' · ' + track.album : ''}</div>
    </div>
    <span class="track-duration">${track.duration || ''}</span>
    <button class="track-more" title="More">•••</button>`;

  el.addEventListener('click', e => {
    if (e.target.classList.contains('track-more')) return;
    // Replace queue with this tracklist and play
    state.queue = [...allTracks];
    state.queueIndex = allTracks.indexOf(track);
    playCurrentTrack();
    renderQueue();
    updateAllTrackHighlights();
  });

  el.querySelector('.track-more').addEventListener('click', e => {
    e.stopPropagation();
    showContextMenu(e, track);
  });

  return el;
}

function updateAllTrackHighlights() {
  const cur = currentTrack();
  document.querySelectorAll('.track-item').forEach(el => {
    el.classList.toggle('playing', el.dataset.id === cur?.id);
  });
}

// ── Playback ───────────────────────────────────────────────────────
function playCurrentTrack() {
  const track = currentTrack();
  if (!track) return;

  audio.src = `${API}/stream?id=${track.id}`;
  audio.volume = state.volume / 100;
  audio.play().catch(() => {});

  playerTitle.textContent  = track.title;
  playerArtist.textContent = track.artist;
  playerThumb.style.backgroundImage = track.thumbnail ? `url(${track.thumbnail})` : '';

  likeBtn.classList.toggle('liked', state.liked.has(track.id));
  likeBtn.textContent = state.liked.has(track.id) ? '♥' : '♡';

  setPlayingUI(true);
  updateAllTrackHighlights();
  renderQueue();

  if ('mediaSession' in navigator) {
    navigator.mediaSession.metadata = new MediaMetadata({
      title:  track.title,
      artist: track.artist,
      artwork: track.thumbnail ? [{ src: track.thumbnail }] : []
    });
  }
}

function setPlayingUI(playing) {
  iconPlay.style.display  = playing ? 'none' : '';
  iconPause.style.display = playing ? '' : 'none';
}

playBtn.addEventListener('click', () => {
  if (audio.paused) { audio.play(); setPlayingUI(true); }
  else              { audio.pause(); setPlayingUI(false); }
});

audio.addEventListener('ended', () => {
  if (state.repeat === 'one') { audio.currentTime = 0; audio.play(); return; }
  if (state.shuffle) {
    state.queueIndex = Math.floor(Math.random() * state.queue.length);
  } else {
    state.queueIndex++;
    if (state.queueIndex >= state.queue.length) {
      if (state.repeat === 'all') state.queueIndex = 0;
      else { state.queueIndex = state.queue.length - 1; setPlayingUI(false); return; }
    }
  }
  playCurrentTrack();
});

nextBtn.addEventListener('click', () => {
  if (!state.queue.length) return;
  if (state.shuffle) state.queueIndex = Math.floor(Math.random() * state.queue.length);
  else state.queueIndex = (state.queueIndex + 1) % state.queue.length;
  playCurrentTrack();
});

prevBtn.addEventListener('click', () => {
  if (!state.queue.length) return;
  if (audio.currentTime > 3) { audio.currentTime = 0; return; }
  state.queueIndex = (state.queueIndex - 1 + state.queue.length) % state.queue.length;
  playCurrentTrack();
});

// ── Progress ───────────────────────────────────────────────────────
audio.addEventListener('timeupdate', () => {
  const pct = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
  progressFill.style.width  = pct + '%';
  progressThumb.style.left  = pct + '%';
  timeCurrent.textContent   = fmtTime(audio.currentTime);
  timeTotal.textContent     = fmtTime(audio.duration);
});

let scrubbing = false;

progressBar.addEventListener('mousedown', e => {
  scrubbing = true;
  seek(e);
});

document.addEventListener('mousemove', e => { if (scrubbing) seek(e); });
document.addEventListener('mouseup',   () => { scrubbing = false; });

function seek(e) {
  const rect = progressBar.getBoundingClientRect();
  const pct  = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  progressFill.style.width = (pct * 100) + '%';
  progressThumb.style.left = (pct * 100) + '%';
  if (audio.duration) {
    audio.currentTime = pct * audio.duration;
  }
}

// ── Volume ─────────────────────────────────────────────────────────
volumeSlider.addEventListener('input', () => {
  state.volume = +volumeSlider.value;
  audio.volume = state.volume / 100;
});

// ── Like ───────────────────────────────────────────────────────────
likeBtn.addEventListener('click', () => {
  const track = currentTrack();
  if (!track) return;
  if (state.liked.has(track.id)) {
    state.liked.delete(track.id);
    likeBtn.textContent = '♡';
    likeBtn.classList.remove('liked');
  } else {
    state.liked.add(track.id);
    likeBtn.textContent = '♥';
    likeBtn.classList.add('liked');
  }
  saveLiked();
});

// ── Shuffle / Repeat ───────────────────────────────────────────────
shuffleBtn.addEventListener('click', () => {
  state.shuffle = !state.shuffle;
  shuffleBtn.classList.toggle('active', state.shuffle);
});

repeatBtn.addEventListener('click', () => {
  const modes = ['none', 'all', 'one'];
  const idx   = modes.indexOf(state.repeat === false ? 'none' : state.repeat);
  state.repeat = modes[(idx + 1) % 3];
  repeatBtn.classList.toggle('active', state.repeat !== 'none');
  repeatBtn.title = state.repeat === 'one' ? 'Repeat One' : state.repeat === 'all' ? 'Repeat All' : 'Repeat';
});

// ── Queue ──────────────────────────────────────────────────────────
queueToggleBtn.addEventListener('click', () => {
  document.body.classList.toggle('queue-open');
});

clearQueueBtn.addEventListener('click', () => {
  state.queue = [];
  state.queueIndex = -1;
  renderQueue();
});

function renderQueue() {
  queueList.innerHTML = '';
  if (!state.queue.length) {
    queueList.innerHTML = '<p style="color:var(--muted);font-size:13px;padding:8px 10px">Queue is empty</p>';
    return;
  }
  state.queue.forEach((t, i) => {
    const el = document.createElement('div');
    el.className = 'queue-item' + (i === state.queueIndex ? ' active' : '');
    el.innerHTML = `
      <img src="${t.thumbnail}" onerror="this.style.display='none'" loading="lazy"/>
      <div style="overflow:hidden;flex:1">
        <div class="q-title">${t.title}</div>
        <div class="q-artist">${t.artist}</div>
      </div>`;
    el.addEventListener('click', () => {
      state.queueIndex = i;
      playCurrentTrack();
    });
    queueList.appendChild(el);
  });
}

// ── Context Menu ───────────────────────────────────────────────────
let activeMenu = null;

function showContextMenu(e, track) {
  removeContextMenu();

  const menu = document.createElement('div');
  menu.className = 'ctx-menu';
  menu.style.top  = e.clientY + 'px';
  menu.style.left = e.clientX + 'px';

  const playlistEntries = Object.keys(state.playlists).map(name => `
    <div class="ctx-item" data-action="add-to" data-playlist="${name}">
      Add to ${name}
    </div>`).join('');

  menu.innerHTML = `
    <div class="ctx-item" data-action="play-next">Play Next</div>
    <div class="ctx-item" data-action="add-queue">Add to Queue</div>
    <div class="ctx-item" data-action="lyrics">View Lyrics</div>
    ${playlistEntries}
    <div class="ctx-item" data-action="new-playlist">New Playlist…</div>`;

  menu.addEventListener('click', e => {
    const action = e.target.dataset.action;
    if (!action) return;

    if (action === 'play-next') {
      state.queue.splice(state.queueIndex + 1, 0, track);
      renderQueue();
    } else if (action === 'add-queue') {
      state.queue.push(track);
      renderQueue();
    } else if (action === 'lyrics') {
      showLyrics(track);
    } else if (action === 'add-to') {
      const pl = e.target.dataset.playlist;
      if (!state.playlists[pl]) state.playlists[pl] = [];
      state.playlists[pl].push(track);
      savePlaylists();
    } else if (action === 'new-playlist') {
      createPlaylist(track);
    }
    removeContextMenu();
  });

  document.body.appendChild(menu);
  activeMenu = menu;

  // Keep inside viewport
  const rect = menu.getBoundingClientRect();
  if (rect.right  > window.innerWidth)  menu.style.left = (e.clientX - rect.width)  + 'px';
  if (rect.bottom > window.innerHeight) menu.style.top  = (e.clientY - rect.height) + 'px';
}

function removeContextMenu() {
  if (activeMenu) { activeMenu.remove(); activeMenu = null; }
}

document.addEventListener('click', removeContextMenu);
document.addEventListener('keydown', e => { if (e.key === 'Escape') removeContextMenu(); });

// ── Playlists ──────────────────────────────────────────────────────
function createPlaylist(trackToAdd) {
  const name = prompt('Playlist name:');
  if (!name) return;
  if (!state.playlists[name]) state.playlists[name] = [];
  if (trackToAdd) state.playlists[name].push(trackToAdd);
  savePlaylists();
  renderPlaylists();
}

newPlaylistBtn.addEventListener('click', () => createPlaylist(null));

function renderPlaylists() {
  // Remove old playlist items (keep new-playlist btn)
  document.querySelectorAll('.playlist-item:not(.new-playlist)').forEach(e => e.remove());

  Object.keys(state.playlists).forEach(name => {
    const el = document.createElement('div');
    el.className = 'playlist-item';
    el.textContent = name;
    el.addEventListener('click', () => showPlaylist(name));
    playlistList.insertBefore(el, newPlaylistBtn);
  });
}

function showPlaylist(name) {
  const tracks = state.playlists[name] || [];
  content.innerHTML = `
    <h2 class="section-title">${name}</h2>
    <div class="track-list" id="track-list"></div>`;

  if (!tracks.length) {
    content.innerHTML += `<p style="color:var(--muted);padding:12px">No tracks yet.</p>`;
    return;
  }

  const list = document.getElementById('track-list');
  tracks.forEach((t, i) => list.appendChild(makeTrackEl(t, i + 1, tracks)));
}

renderPlaylists();

// ── Lyrics ─────────────────────────────────────────────────────────
async function showLyrics(track) {
  lyricsTitle.textContent = `${track.title} — ${track.artist}`;
  lyricsBody.textContent  = 'Loading lyrics…';
  lyricsModal.classList.add('open');

  try {
    const res  = await fetch(`${API}/lyrics?artist=${encodeURIComponent(track.artist)}&title=${encodeURIComponent(track.title)}`);
    const data = await res.json();
    lyricsBody.textContent = data.lyrics || 'Lyrics not found for this track.';
  } catch {
    lyricsBody.textContent = 'Could not load lyrics.';
  }
}

lyricsClose.addEventListener('click', () => lyricsModal.classList.remove('open'));
lyricsModal.addEventListener('click', e => {
  if (e.target === lyricsModal) lyricsModal.classList.remove('open');
});

// ── Keyboard Shortcuts ─────────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (e.target === searchInput) return;

  if (e.code === 'Space') {
    e.preventDefault();
    playBtn.click();
  } else if (e.code === 'ArrowRight') {
    e.preventDefault();
    audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + 5);
  } else if (e.code === 'ArrowLeft') {
    e.preventDefault();
    audio.currentTime = Math.max(0, audio.currentTime - 5);
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    state.volume = Math.min(100, state.volume + 5);
    volumeSlider.value = state.volume;
    audio.volume = state.volume / 100;
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    state.volume = Math.max(0, state.volume - 5);
    volumeSlider.value = state.volume;
    audio.volume = state.volume / 100;
  }
});

// ── Media Session ──────────────────────────────────────────────────
if ('mediaSession' in navigator) {
  navigator.mediaSession.setActionHandler('play',         () => { audio.play();   setPlayingUI(true);  });
  navigator.mediaSession.setActionHandler('pause',        () => { audio.pause();  setPlayingUI(false); });
  navigator.mediaSession.setActionHandler('nexttrack',    () => nextBtn.click());
  navigator.mediaSession.setActionHandler('previoustrack',() => prevBtn.click());
}

audio.addEventListener('play',  () => setPlayingUI(true));
audio.addEventListener('pause', () => setPlayingUI(false));
