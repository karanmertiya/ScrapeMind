// ═══════════════════════════════════════════════════════════════
// ScrapeMind — Background Service Worker
// Handles: YouTube (single + playlist), message routing, storage
// ═══════════════════════════════════════════════════════════════

// ── Keep-alive: prevent SW from dying during long playlist ops ──
const KEEPALIVE_INTERVAL = 20_000;
let keepAliveTimer = null;

function startKeepAlive() {
  stopKeepAlive();
  keepAliveTimer = setInterval(() => {
    chrome.runtime.getPlatformInfo(() => {});
  }, KEEPALIVE_INTERVAL);
}

function stopKeepAlive() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
}

// ── Message Router ──────────────────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg)
    .then(sendResponse)
    .catch(err => sendResponse({ error: err.message || String(err) }));
  return true; // keep channel open for async
});

async function handleMessage(msg) {
  switch (msg.action) {

    case 'GET_PAGE_INFO':
      return await getPageInfo(msg.tabId);

    case 'SCRAPE_YT_VIDEO':
      return await scrapeYTVideo(msg.tabId);

    case 'SCRAPE_YT_PLAYLIST':
      // Fire-and-forget with progress updates via storage
      scrapeYTPlaylist(msg.tabId, msg.playlistId, msg.videoIds).catch(console.error);
      return { started: true };

    case 'GET_PLAYLIST_RESULT':
      return await chrome.storage.local.get('playlistResult').then(r => r.playlistResult || null);

    case 'CLEAR_PLAYLIST_RESULT':
      await chrome.storage.local.remove(['playlistResult', 'playlistProgress']);
      return { ok: true };

    default:
      throw new Error(`Unknown action: ${msg.action}`);
  }
}

// ═══════════════════════════════════════════════════════════════
// PAGE INFO — detect what tab we're on
// ═══════════════════════════════════════════════════════════════
async function getPageInfo(tabId) {
  const tab = await chrome.tabs.get(tabId);
  const url = new URL(tab.url);

  // ── YouTube ──
  if (url.hostname === 'www.youtube.com') {
    const videoId  = url.searchParams.get('v');
    const listId   = url.searchParams.get('list');
    const isListPage = url.pathname === '/playlist';

    if (isListPage && listId) {
      const info = await fetchPlaylistMeta(listId);
      return { type: 'yt_playlist', listId, ...info };
    }

    if (videoId) {
      // Read ytInitialPlayerResponse from MAIN world
      const [res] = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => {
          const d = window.ytInitialPlayerResponse;
          if (!d) return null;
          const vd = d.videoDetails || {};
          const tracks = d.captions
            ?.playerCaptionsTracklistRenderer
            ?.captionTracks || [];
          const listId = new URL(location.href).searchParams.get('list');
          return {
            videoId:  vd.videoId,
            title:    vd.title,
            channel:  vd.author,
            hasCaps:  tracks.length > 0,
            listId
          };
        }
      });
      return { type: 'yt_video', videoId, ...(res?.result || {}) };
    }

    return { type: 'yt_other' };
  }

  // ── LLM sites ──
  const LLM_MAP = {
    'chat.openai.com':      'chatgpt',
    'chatgpt.com':          'chatgpt',
    'gemini.google.com':    'gemini',
    'claude.ai':            'claude',
    'www.perplexity.ai':    'perplexity',
    'copilot.microsoft.com':'copilot'
  };

  if (LLM_MAP[url.hostname]) {
    return { type: 'llm', platform: LLM_MAP[url.hostname], title: tab.title };
  }

  return { type: 'unknown', title: tab.title };
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE — single video
// ═══════════════════════════════════════════════════════════════
async function scrapeYTVideo(tabId) {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: () => {
      const d = window.ytInitialPlayerResponse;
      if (!d) return null;
      const vd = d.videoDetails || {};
      const tracks = d.captions
        ?.playerCaptionsTracklistRenderer
        ?.captionTracks || [];
      return {
        videoId:  vd.videoId,
        title:    vd.title,
        channel:  vd.author,
        duration: Number(vd.lengthSeconds || 0),
        tracks: tracks.map(t => ({
          lang:    t.languageCode,
          name:    t.name?.simpleText,
          baseUrl: t.baseUrl
        }))
      };
    }
  });

  const pageData = res?.result;
  if (!pageData)       throw new Error('Cannot read YouTube page data. Refresh the page and try again.');
  if (!pageData.tracks?.length) throw new Error('No transcript/captions available for this video.');

  const transcript = await fetchTranscriptLines(pageData.tracks);

  return {
    videoId:  pageData.videoId,
    title:    pageData.title,
    channel:  pageData.channel,
    duration: fmtSeconds(pageData.duration),
    transcript,
    fullText: transcript.map(l => l.text).join(' ')
  };
}

// ═══════════════════════════════════════════════════════════════
// YOUTUBE — playlist (background, saves to storage)
// ═══════════════════════════════════════════════════════════════
async function scrapeYTPlaylist(tabId, playlistId, videoIds) {
  startKeepAlive();

  try {
    // If videoIds not provided, fetch from playlist page
    if (!videoIds?.length) {
      const meta = await fetchPlaylistMeta(playlistId);
    console.log(`[ScrapeMind] Playlist meta: title="${meta.title}", videoIds=${meta.videoIds?.length}`);
      videoIds = meta.videoIds || [];
    }

    console.log(`[ScrapeMind] Starting playlist scrape: ${videoIds.length} videos`);
    if (!videoIds.length) throw new Error('No videos found in this playlist.');

    const videos = [];
    const errors = [];

    for (let i = 0; i < videoIds.length; i++) {
      const vid = videoIds[i];

      // Save progress to storage so popup can poll it
      await chrome.storage.local.set({
        playlistProgress: { current: i + 1, total: videoIds.length, videoId: vid }
      });

      try {
        const result = await fetchVideoById(vid);
        videos.push(result);
      } catch (e) {
        errors.push({ videoId: vid, error: e.message });
      }

      // Rate-limit: be gentle with YouTube
      if (i < videoIds.length - 1) await sleep(600 + Math.random() * 400);
    }

    console.log(`[ScrapeMind] Playlist done. ${videos.length} scraped, ${errors.length} errors.`);

    // Store final result
    await chrome.storage.local.set({
      playlistResult: { done: true, videos, errors, scraped: videos.length, total: videoIds.length },
      playlistProgress: { done: true, current: videoIds.length, total: videoIds.length }
    });

  } finally {
    stopKeepAlive();
  }
}

async function fetchPlaylistMeta(playlistId) {
  const resp = await fetch(`https://www.youtube.com/playlist?list=${playlistId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  });
  const html = await resp.text();

  // ── Title: try multiple known locations ──
  let title = 'Playlist';
  const titleMatch = html.match(/"title"\s*:\s*\{\s*"simpleText"\s*:\s*"([^"]+)"\s*\}/)
    || html.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) title = titleMatch[1].replace(' - YouTube', '').trim();

  // ── Video IDs: regex sweep — immune to structural changes ──
  // YouTube embeds {"videoId":"xxxx"} for each playlist item in the page HTML
  const seen = new Set();
  const videoIds = [];

  // Primary: playlistVideoRenderer objects always have "videoId":"ID" right next to "index"
  const primaryRe = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = primaryRe.exec(html)) !== null) {
    const id = m[1];
    if (!seen.has(id)) {
      seen.add(id);
      videoIds.push(id);
    }
  }

  // De-dupe artefacts: YouTube also embeds suggested/related videoIds in the sidebar.
  // The playlist items appear in a dense block — take only IDs that appear inside
  // a "playlistVideoRenderer" context. We do a second pass to filter.
  const cleanIds = extractPlaylistVideoIds(html) || videoIds;

  return { title, videoCount: cleanIds.length, videoIds: cleanIds };
}

// Stricter extractor: find the playlistVideoListRenderer blob and pull IDs from it only
function extractPlaylistVideoIds(html) {
  const marker = 'playlistVideoListRenderer';
  const start  = html.indexOf(marker);
  if (start === -1) return null;

  // Grab a large slice from that point (covers all 100 items)
  const slice = html.slice(start, start + 300_000);
  const seen  = new Set();
  const ids   = [];
  const re    = /"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/g;
  let m;
  while ((m = re.exec(slice)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids.length ? ids : null;
}

async function fetchVideoById(videoId) {
  const resp = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: { 'Accept-Language': 'en-US,en;q=0.9' }
  });
  const html = await resp.text();
  const data = extractJSON(html, 'ytInitialPlayerResponse');
  if (!data) throw new Error('Could not parse video page');

  const vd = data.videoDetails || {};
  const tracks = (data.captions?.playerCaptionsTracklistRenderer?.captionTracks || [])
    .map(t => ({ lang: t.languageCode, name: t.name?.simpleText, baseUrl: t.baseUrl }));

  if (!tracks.length) throw new Error('No captions available');

  const transcript = await fetchTranscriptLines(tracks);
  return {
    videoId,
    title:    vd.title    || videoId,
    channel:  vd.author   || '',
    duration: fmtSeconds(Number(vd.lengthSeconds || 0)),
    transcript,
    fullText: transcript.map(l => l.text).join(' ')
  };
}

// ═══════════════════════════════════════════════════════════════
// TRANSCRIPT FETCHER
// ═══════════════════════════════════════════════════════════════
async function fetchTranscriptLines(tracks) {
  // Prefer English, fallback to auto-generated English, then first available
  const track = tracks.find(t => t.lang === 'en')
    || tracks.find(t => t.lang?.startsWith('en'))
    || tracks[0];

  const resp = await fetch(track.baseUrl + '&fmt=json3');
  if (!resp.ok) throw new Error('Failed to fetch transcript');

  const json = await resp.json();
  return (json.events || [])
    .filter(e => e.segs?.length)
    .map(e => ({
      startMs:    e.tStartMs,
      durationMs: e.dDurationMs,
      timestamp:  fmtMs(e.tStartMs),
      text: e.segs.map(s => s.utf8 || '').join('').replace(/\n/g, ' ').trim()
    }))
    .filter(e => e.text);
}

// ═══════════════════════════════════════════════════════════════
// UTILS
// ═══════════════════════════════════════════════════════════════

// Robust JSON extractor — handles deeply nested objects in HTML
function extractJSON(html, varName) {
  const marker = `${varName} = `;
  const start  = html.indexOf(marker);
  if (start === -1) return null;

  let pos       = start + marker.length;
  let depth     = 0;
  let inStr     = false;
  let esc       = false;
  const jsonStart = pos;

  for (; pos < html.length; pos++) {
    const ch = html[pos];
    if (esc)              { esc = false; continue; }
    if (ch === '\\' && inStr) { esc = true; continue; }
    if (ch === '"')       { inStr = !inStr; continue; }
    if (inStr)            continue;
    if (ch === '{')       depth++;
    else if (ch === '}')  { depth--; if (depth === 0) break; }
  }

  try { return JSON.parse(html.slice(jsonStart, pos + 1)); }
  catch { return null; }
}

function fmtMs(ms) {
  return fmtSeconds(Math.floor(ms / 1000));
}

function fmtSeconds(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return `${m}:${String(s).padStart(2,'0')}`;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
