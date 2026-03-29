// ═══════════════════════════════════════════════════════════════
// ScrapeMind — LLM Content Script
// Detects platform → scrapes AI responses from DOM
// Runs on: ChatGPT, Gemini, Claude, Perplexity, Copilot
// ═══════════════════════════════════════════════════════════════

const PLATFORM = detectPlatform();

function detectPlatform() {
  const h = location.hostname;
  if (h.includes('chat.openai.com') || h.includes('chatgpt.com')) return 'chatgpt';
  if (h.includes('gemini.google.com'))  return 'gemini';
  if (h.includes('claude.ai'))          return 'claude';
  if (h.includes('perplexity.ai'))      return 'perplexity';
  if (h.includes('copilot.microsoft'))  return 'copilot';
  return 'unknown';
}

// ── Selector configs per platform ──────────────────────────────
const CONFIGS = {
  chatgpt: {
    // Each assistant turn container
    turnSelector:  '[data-message-author-role="assistant"]',
    // The rendered markdown inside
    textSelector:  '.markdown, .prose',
    // Fallback: whole turn
    fallback:      '[data-message-author-role="assistant"]'
  },
  gemini: {
    turnSelector:  'model-response, .model-response',
    textSelector:  '.response-content, .markdown, .content-text, p',
    fallback:      'model-response, .model-response'
  },
  claude: {
    turnSelector:  '[data-is-streaming="false"] .font-claude-message, .font-claude-message',
    textSelector:  null,  // use the element itself
    fallback:      '.font-claude-message'
  },
  perplexity: {
    turnSelector:  '.prose, [data-testid="answer-text"], .answer-content',
    textSelector:  null,
    fallback:      '.prose'
  },
  copilot: {
    turnSelector:  '[class*="response"], cib-message[source="bot"]',
    textSelector:  'cib-message-group, .content',
    fallback:      'cib-message[source="bot"]'
  }
};

// ── Listen for popup messages ───────────────────────────────────
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'SCRAPE_LLM') {
    try {
      const result = scrape(msg.mode); // 'last' | 'all'
      sendResponse({ ok: true, ...result });
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  }
  return false; // sync response
});

// ── Core scraper ────────────────────────────────────────────────
function scrape(mode = 'last') {
  const cfg = CONFIGS[PLATFORM];
  if (!cfg) throw new Error(`Platform "${PLATFORM}" not supported yet.`);

  let elements = qsa(cfg.turnSelector);

  // Fallback selector
  if (!elements.length && cfg.fallback !== cfg.turnSelector) {
    elements = qsa(cfg.fallback);
  }

  if (!elements.length) {
    throw new Error(
      `No AI responses found on this page. Make sure the conversation has finished loading.`
    );
  }

  if (mode === 'last') {
    const last = elements[elements.length - 1];
    const text = extractText(last, cfg.textSelector);
    if (!text.trim()) throw new Error('Last response appears empty.');
    return {
      platform: PLATFORM,
      mode: 'last',
      responses: [{ index: elements.length, text: text.trim() }]
    };
  }

  // All responses
  const responses = elements
    .map((el, i) => ({ index: i + 1, text: extractText(el, cfg.textSelector).trim() }))
    .filter(r => r.text.length > 0);

  if (!responses.length) throw new Error('No response text could be extracted.');

  return { platform: PLATFORM, mode: 'all', responses };
}

function extractText(el, childSelector) {
  if (!el) return '';
  // If a child selector is provided, prefer that subtree
  if (childSelector) {
    const child = el.querySelector(childSelector);
    if (child) return child.innerText || child.textContent || '';
  }
  return el.innerText || el.textContent || '';
}

function qsa(selector) {
  // Handle multiple comma-separated selectors safely
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}
