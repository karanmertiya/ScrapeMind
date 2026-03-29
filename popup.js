// ═══════════════════════════════════════════════════════════════
// ScrapeMind — Popup Logic
// ═══════════════════════════════════════════════════════════════

// ── DOM refs ────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

const el = {
  badge:           $('badge'),
  pageInfo:        $('page-info'),
  pageTitle:       $('page-title'),

  panelYT:         $('panel-yt'),
  panelLLM:        $('panel-llm'),
  panelUnknown:    $('panel-unknown'),

  btnYTVideo:      $('btn-yt-video'),
  btnYTPlaylist:   $('btn-yt-playlist'),
  playlistCount:   $('playlist-count'),
  noCaptions:      $('no-captions'),

  llmPlatformLabel:$('llm-platform-label'),
  btnLLMLast:      $('btn-llm-last'),
  btnLLMAll:       $('btn-llm-all'),

  progressWrap:    $('progress-wrap'),
  progressText:    $('progress-text'),
  progressFraction:$('progress-fraction'),
  progressBar:     $('progress-bar'),

  resultArea:      $('result-area'),
  resultMeta:      $('result-meta'),
  resultPreview:   $('result-preview'),
  btnClear:        $('btn-clear'),

  exportBar:       $('export-bar'),
  btnCopy:         $('btn-copy'),
  btnSaveJSON:     $('btn-save-json'),
  btnSaveTXT:      $('btn-save-txt'),
  btnAPI:          $('btn-api'),
  apiConfig:       $('api-config'),
  apiUrl:          $('api-url'),
  btnSendAPI:      $('btn-send-api'),

  statusBar:       $('status-bar'),
  statusMsg:       $('status-msg'),
};

// ── State ───────────────────────────────────────────────────────
let currentTab    = null;
let pageInfo      = null;
let scrapedData   = null;
let pollTimer     = null;

const PLATFORM_NAMES = {
  chatgpt:   'ChatGPT',
  gemini:    'Gemini',
  claude:    'Claude',
  perplexity:'Perplexity',
  copilot:   'Copilot'
};

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
(async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Check for in-progress playlist scrape
  const { playlistProgress } = await chrome.storage.local.get('playlistProgress');
  if (playlistProgress && !playlistProgress.done) {
    showProgress(playlistProgress.current, playlistProgress.total);
    startPolling();
    return;
  }

  // Check for a completed but un-shown playlist result
  const { playlistResult } = await chrome.storage.local.get('playlistResult');
  if (playlistResult?.done) {
    scrapedData = playlistResult;
    showResult(playlistResult);
    await chrome.storage.local.remove(['playlistResult', 'playlistProgress']);
    return;
  }

  await detectPage();
})();

// ═══════════════════════════════════════════════════════════════
// PAGE DETECTION
// ═══════════════════════════════════════════════════════════════
async function detectPage() {
  if (!currentTab?.id) { showPanel('unknown'); return; }

  try {
    pageInfo = await bg('GET_PAGE_INFO', { tabId: currentTab.id });
  } catch (e) {
    showPanel('unknown');
    return;
  }

  switch (pageInfo.type) {
    case 'yt_video':
      setupYTVideo(pageInfo);
      break;
    case 'yt_playlist':
      setupYTPlaylist(pageInfo);
      break;
    case 'llm':
      setupLLM(pageInfo);
      break;
    default:
      showPanel('unknown');
  }
}

function setupYTVideo(info) {
  setBadge('YouTube', 'yt');
  setPageTitle(info.title || '');

  // Playlist button: enable if there's a list param
  if (info.listId) {
    el.btnYTPlaylist.disabled = false;
    el.btnYTPlaylist.dataset.listId = info.listId;
    el.playlistCount.textContent = ''; // we don't know count until scrape
  }

  if (!info.hasCaps) {
    el.noCaptions.classList.remove('hidden');
    el.btnYTVideo.disabled = true;
  }

  showPanel('yt');
}

function setupYTPlaylist(info) {
  setBadge('YouTube', 'yt');
  setPageTitle(info.title || 'Playlist');

  el.btnYTVideo.disabled = true;
  el.btnYTPlaylist.disabled = false;
  el.btnYTPlaylist.dataset.listId = info.listId;
  if (info.videoCount) el.playlistCount.textContent = info.videoCount;

  showPanel('yt');
}

function setupLLM(info) {
  const name = PLATFORM_NAMES[info.platform] || info.platform;
  setBadge(name, 'llm');
  el.llmPlatformLabel.textContent = `${name} — AI Responses`;
  setPageTitle(info.title || '');
  showPanel('llm');
}

// ═══════════════════════════════════════════════════════════════
// BUTTON HANDLERS
// ═══════════════════════════════════════════════════════════════

// ── YouTube: single video ──
el.btnYTVideo.addEventListener('click', async () => {
  setLoading(el.btnYTVideo, true);
  clearStatus();

  try {
    const result = await bg('SCRAPE_YT_VIDEO', { tabId: currentTab.id });
    scrapedData = result;
    showResult(result);
    setStatus('✓ Transcript loaded', 'success');
  } catch (e) {
    setStatus(`✕ ${e.message}`, 'error');
  } finally {
    setLoading(el.btnYTVideo, false);
  }
});

// ── YouTube: playlist ──
el.btnYTPlaylist.addEventListener('click', async () => {
  const listId = el.btnYTPlaylist.dataset.listId;
  if (!listId) { setStatus('No playlist ID found.', 'error'); return; }

  setLoading(el.btnYTPlaylist, true);
  clearStatus();
  showProgress(0, '?');

  await bg('CLEAR_PLAYLIST_RESULT', {});
  await bg('SCRAPE_YT_PLAYLIST', {
    tabId:      currentTab.id,
    playlistId: listId,
    videoIds:   pageInfo?.videoIds || null
  });

  // Background scraping started — poll for progress
  startPolling();
  setLoading(el.btnYTPlaylist, false);
});

// ── LLM: last response ──
el.btnLLMLast.addEventListener('click', () => scrapeLLM('last'));

// ── LLM: all responses ──
el.btnLLMAll.addEventListener('click', () => scrapeLLM('all'));

async function scrapeLLM(mode) {
  const btn = mode === 'last' ? el.btnLLMLast : el.btnLLMAll;
  setLoading(btn, true);
  clearStatus();

  try {
    const result = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'SCRAPE_LLM',
      mode
    });

    if (!result?.ok) throw new Error(result?.error || 'Scraping failed');

    scrapedData = result;
    showResult(result);
    setStatus(`✓ ${result.responses.length} response(s) extracted`, 'success');
  } catch (e) {
    setStatus(`✕ ${e.message}`, 'error');
  } finally {
    setLoading(btn, false);
  }
}

// ── Export: Copy ──
el.btnCopy.addEventListener('click', async () => {
  if (!scrapedData) return;
  try {
    await navigator.clipboard.writeText(buildTextOutput(scrapedData));
    el.btnCopy.textContent = '✓ Copied';
    setTimeout(() => { el.btnCopy.textContent = '📋 Copy'; }, 1800);
  } catch {
    setStatus('Clipboard access denied.', 'error');
  }
});

// ── Export: Save JSON ──
el.btnSaveJSON.addEventListener('click', () => {
  if (!scrapedData) return;
  const filename = buildFilename(scrapedData, 'json');
  downloadText(JSON.stringify(scrapedData, null, 2), filename, 'application/json');
});

// ── Export: Save TXT ──
el.btnSaveTXT.addEventListener('click', () => {
  if (!scrapedData) return;
  const filename = buildFilename(scrapedData, 'txt');
  downloadText(buildTextOutput(scrapedData), filename, 'text/plain');
});

// ── Export: API toggle ──
el.btnAPI.addEventListener('click', () => {
  el.apiConfig.classList.toggle('hidden');

  // Load saved API URL
  chrome.storage.local.get('apiUrl').then(r => {
    if (r.apiUrl) el.apiUrl.value = r.apiUrl;
  });
});

// ── Export: Send to API ──
el.btnSendAPI.addEventListener('click', async () => {
  const url = el.apiUrl.value.trim();
  if (!url) { setStatus('Enter an API endpoint URL.', 'error'); return; }
  if (!scrapedData) { setStatus('Nothing to send.', 'error'); return; }

  // Persist URL
  await chrome.storage.local.set({ apiUrl: url });

  setLoading(el.btnSendAPI, true);
  clearStatus();

  try {
    const resp = await fetch(url, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(scrapedData)
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
    setStatus(`✓ Sent to API (${resp.status})`, 'success');
  } catch (e) {
    setStatus(`✕ API error: ${e.message}`, 'error');
  } finally {
    setLoading(el.btnSendAPI, false);
  }
});

// ── Clear result ──
el.btnClear.addEventListener('click', () => {
  scrapedData = null;
  el.resultArea.classList.add('hidden');
  el.exportBar.classList.add('hidden');
  el.apiConfig.classList.add('hidden');
  clearStatus();
});

// ═══════════════════════════════════════════════════════════════
// PLAYLIST POLLING
// ═══════════════════════════════════════════════════════════════
function startPolling() {
  stopPolling();
  pollTimer = setInterval(async () => {
    const { playlistProgress, playlistResult } =
      await chrome.storage.local.get(['playlistProgress', 'playlistResult']);

    if (playlistProgress) {
      showProgress(playlistProgress.current, playlistProgress.total);
    }

    if (playlistResult?.done) {
      stopPolling();
      hideProgress();
      scrapedData = playlistResult;
      showResult(playlistResult);
      setStatus(
        `✓ Playlist done — ${playlistResult.scraped}/${playlistResult.total} videos`,
        'success'
      );
      await chrome.storage.local.remove(['playlistResult', 'playlistProgress']);
    }
  }, 800);
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

// ═══════════════════════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════════════════════
function showPanel(type) {
  el.panelYT.classList.add('hidden');
  el.panelLLM.classList.add('hidden');
  el.panelUnknown.classList.add('hidden');

  if (type === 'yt')      el.panelYT.classList.remove('hidden');
  if (type === 'llm')     el.panelLLM.classList.remove('hidden');
  if (type === 'unknown') el.panelUnknown.classList.remove('hidden');
}

function setBadge(text, type) {
  el.badge.textContent = text;
  el.badge.className   = `badge badge--${type}`;
}

function setPageTitle(title) {
  if (title) {
    el.pageTitle.textContent = title;
    el.pageInfo.classList.remove('hidden');
  }
}

function showProgress(current, total) {
  el.progressWrap.classList.remove('hidden');
  el.progressText.textContent   = 'Scraping playlist…';
  el.progressFraction.textContent = `${current} / ${total}`;
  const pct = total && total !== '?' ? Math.round((current / total) * 100) : 0;
  el.progressBar.style.width = `${pct}%`;
}

function hideProgress() {
  el.progressWrap.classList.add('hidden');
}

function showResult(data) {
  const preview = buildPreviewText(data);
  el.resultPreview.value = preview;
  el.resultMeta.textContent = buildResultMeta(data);
  el.resultArea.classList.remove('hidden');
  el.exportBar.classList.remove('hidden');
}

function buildResultMeta(data) {
  if (data.videos) {
    return `Playlist · ${data.videos.length} videos · ${totalWords(data)} words`;
  }
  if (data.transcript) {
    return `${data.title || 'Video'} · ${data.transcript.length} segments`;
  }
  if (data.responses) {
    return `${PLATFORM_NAMES[data.platform] || data.platform} · ${data.responses.length} response(s)`;
  }
  return 'Result ready';
}

function buildPreviewText(data) {
  if (data.videos) {
    return data.videos
      .map(v => `[${v.title}]\n${v.fullText}`)
      .join('\n\n' + '─'.repeat(40) + '\n\n');
  }
  if (data.fullText) return data.fullText;
  if (data.transcript) return data.transcript.map(l => `[${l.timestamp}] ${l.text}`).join('\n');
  if (data.responses) return data.responses.map(r => `[${r.index}] ${r.text}`).join('\n\n');
  return JSON.stringify(data, null, 2);
}

function buildTextOutput(data) {
  if (data.videos) {
    return data.videos.map(v =>
      `=== ${v.title} ===\nChannel: ${v.channel}\nDuration: ${v.duration}\n\n` +
      v.transcript.map(l => `[${l.timestamp}] ${l.text}`).join('\n')
    ).join('\n\n' + '═'.repeat(60) + '\n\n');
  }
  if (data.transcript) {
    return `${data.title || ''}\nChannel: ${data.channel || ''}\n\n` +
      data.transcript.map(l => `[${l.timestamp}] ${l.text}`).join('\n');
  }
  if (data.responses) {
    const hdr = `Platform: ${PLATFORM_NAMES[data.platform] || data.platform}\nMode: ${data.mode}\n\n`;
    return hdr + data.responses.map(r => `[Response ${r.index}]\n${r.text}`).join('\n\n' + '─'.repeat(40) + '\n\n');
  }
  return JSON.stringify(data, null, 2);
}

function buildFilename(data, ext) {
  const ts   = new Date().toISOString().slice(0, 10);
  const slug = (data.title || data.platform || 'scraped')
    .replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  return `scrapmind_${slug}_${ts}.${ext}`;
}

function downloadText(content, filename, mimeType) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

function totalWords(data) {
  if (!data.videos) return 0;
  return data.videos.reduce((sum, v) => sum + (v.fullText || '').split(/\s+/).length, 0);
}

function setStatus(msg, type = '') {
  el.statusMsg.textContent = msg;
  el.statusBar.className   = `status-bar ${type}`;
  el.statusBar.classList.remove('hidden');
}

function clearStatus() {
  el.statusBar.classList.add('hidden');
  el.statusMsg.textContent = '';
}

function setLoading(btn, loading) {
  btn.disabled = loading;
  if (loading) {
    btn.dataset.origText = btn.innerHTML;
    btn.innerHTML = '<span class="btn-icon">⏳</span> Working…';
  } else if (btn.dataset.origText) {
    btn.innerHTML = btn.dataset.origText;
    delete btn.dataset.origText;
  }
}

// ── Background message helper ──
function bg(action, payload = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...payload }, res => {
      if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
      if (res?.error) return reject(new Error(res.error));
      resolve(res);
    });
  });
}
