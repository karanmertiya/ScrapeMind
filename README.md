# ⚡ ScrapeMind — Chrome Extension

Scrape YouTube transcripts and LLM responses in one click.

---

## Supported Sources

| Source | What it scrapes |
|--------|----------------|
| YouTube (video) | Full timestamped transcript |
| YouTube (playlist) | All video transcripts in background |
| ChatGPT | AI-only responses |
| Gemini | AI-only responses |
| Claude | AI-only responses |
| Perplexity | AI-only responses |
| Copilot | AI-only responses |

## Export Options
- **Copy** — clipboard
- **Save JSON** — structured with timestamps, titles, metadata
- **Save TXT** — human-readable with timestamps
- **Send to API** — POST to your own backend (URL persisted between sessions)

---

## Installation (Developer Mode)

1. Open Chrome → `chrome://extensions/`
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked**
4. Select **this repository's root folder** (the folder containing `manifest.json`)

That's it. No build step required.

---

## How to Use

### YouTube Video
1. Open any YouTube video
2. Click the ⚡ ScrapeMind icon in the toolbar
3. Click **Scrape This Video**
4. Export via Copy / JSON / TXT / API

> ⚠ Video must have captions/subtitles enabled. Auto-generated captions work too.

### YouTube Playlist
1. Open a YouTube playlist page (`youtube.com/playlist?list=...`)
   OR open any video that's part of a playlist
2. Click ⚡ ScrapeMind
3. Click **Scrape Full Playlist**
4. Scraping runs in the background — you can minimize the popup
5. Re-open the popup to see progress and download results when done

> Large playlists (100+ videos) may take a few minutes. A 500ms delay between
> requests is built in to avoid rate-limiting.

### LLM Sites (ChatGPT / Gemini / Claude / Perplexity / Copilot)
1. Open a chat conversation
2. Click ⚡ ScrapeMind
3. Choose:
   - **Scrape Last Response** — just the final AI reply
   - **Scrape All AI Responses** — entire conversation (AI turns only)
4. Export as needed

---

## JSON Output Format

### YouTube Video
```json
{
  "videoId": "abc123",
  "title": "Video Title",
  "channel": "Channel Name",
  "duration": "12:34",
  "transcript": [
    { "startMs": 0, "durationMs": 3200, "timestamp": "0:00", "text": "Hello everyone..." }
  ],
  "fullText": "Hello everyone ..."
}
```

### YouTube Playlist
```json
{
  "done": true,
  "total": 15,
  "scraped": 14,
  "errors": [{ "videoId": "xyz", "error": "No captions available" }],
  "videos": [ /* array of video objects above */ ]
}
```

### LLM Response
```json
{
  "platform": "chatgpt",
  "mode": "last",
  "responses": [
    { "index": 3, "text": "Sure! Here's the answer..." }
  ]
}
```

---

## Your Backend API

When you click **⚡ API**, the entire JSON object above is POSTed to your endpoint:

```
POST https://your-server.com/ingest
Content-Type: application/json

{ ...scraped data... }
```

The API URL is saved locally so you don't have to re-enter it.

---

## File Structure

```
ScrapeMind/               ← load this folder in Chrome
├── manifest.json         # MV3 config, permissions, host_permissions
├── background.js         # Service worker: YouTube fetch, playlist loop
├── popup.html            # UI shell
├── popup.css             # Adaptive dark/light styles
├── popup.js              # UI logic, export, polling
├── content/
│   └── llm.js            # DOM scraper for all LLM sites
└── tests/
    └── utils.test.js     # Node.js unit tests (run: node tests/utils.test.js)
```

---

## Running Tests

Pure utility functions are covered by a Node.js test suite (no browser required):

```bash
node tests/utils.test.js
```

This tests `extractJSON`, `fmtSeconds`, `fmtMs`, and `extractPlaylistVideoIds`.

---

## Notes & Limitations

- **No YouTube API key needed** — transcripts are fetched directly from YouTube's internal caption endpoint
- **Playlist cap** — YouTube only includes ~100 videos in the initial page load. Playlists beyond that require scrolling/pagination (not yet implemented)
- **LLM DOM selectors** — these platforms update their UI frequently. If scraping stops working on a site, the selectors in `content/llm.js` → `CONFIGS` need updating
- **No captions** — some YouTube videos have no captions at all (live streams, auto-cap disabled). Nothing can be done in that case
- **Rate limiting** — a 500–1000ms random delay is applied between playlist video fetches to avoid YouTube rate limits
