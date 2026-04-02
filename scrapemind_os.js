let isRunning = false;
let engineInterval = null;

let playlistState = {};
let orderedQueue = []; 
let currentViewedVideo = null;
let showTimestamps = false;
let autoMuteOverride = false; 
let projectName = "Untitled Project";
let projectMode = "skillgain"; // Locks in the mode for the whole project

// ── Overhauled, Elite System Instructions ──
const defaultPrompts = {
  examprep: "You are an elite university professor. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML. Use <br><br> before EVERY <h2>, <h3>, and <ul> to prevent text clumping. Extract exact formulas, definitions, and core theories from the transcript. Ignore filler. \n\nRULE: If the instructor visually references a graph, circuit, or diagram, explicitly write this exact tag: [[DIAGRAM: Describe what the image shows]]. \n\nConclude with 3 Previous Year Question (PYQ) style exam problems.",
  skillgain: "You are a FAANG Senior Engineer conducting a training session. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML. Use <br><br> before EVERY <h2>, <h3>, and <ul> to prevent text clumping. Generate Active-Recall notes from the transcript. Focus heavily on algorithms, code logic, and practical application. \n\nRULE: Whenever a core block of code or logic is explained, write: [[DIAGRAM: Code snippet or architecture diagram being discussed]]. \n\nEnd the notes with 2 technical interview/OA round questions.",
  research: "You are a Post-Doc Researcher. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML. Use <br><br> before EVERY <h2>, <h3>, and <ul> to prevent text clumping. Synthesize the transcript into a critical literature review. Highlight hypotheses, methodologies, and edge-cases. \n\nRULE: Write [[DIAGRAM: Data chart or experimental setup shown]] whenever visual evidence is referenced."
};

let settings = { llmProvider: 'groq', groqKey: '', geminiKey: '', syllabus: '', prompts: { ...defaultPrompts } };

if (chrome.storage && chrome.storage.local) {
  chrome.storage.local.get(['sm_settings'], (res) => {
    if (res.sm_settings) {
      settings = { ...settings, ...res.sm_settings };
      if (!settings.prompts) settings.prompts = { ...defaultPrompts };
    }
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === 'LAUNCH_OS' && !isRunning) { isRunning = true; launchOS(msg.videos); }
});

async function launchOS(videos) {
  videos.forEach(v => {
    playlistState[v.id] = { id: v.id, title: v.title, status: 'waiting', transcript: [], userEdits: "" };
    orderedQueue.push(v.id);
  });

  const osHTML = `
    <div id="sm-os-root">
      <div id="sm-studio">
        <div class="sm-header">
          <h1 id="sm-project-title">ScrapeMind OS <input type="text" id="sm-oracle-search" class="sm-search" placeholder="🔍 Search Oracle..."></h1>
          <div class="sm-toolbar">
            <span id="sm-display-mode" style="background: rgba(168, 85, 247, 0.2); color: #a855f7; padding: 4px 10px; border-radius: 20px; font-size: 12px; font-weight: bold; margin-right: 15px; border: 1px solid #a855f7; display: none;"></span>
            <label class="sm-toggle-label"><input type="checkbox" id="sm-toggle-time"> Timestamps</label>
            <button class="sm-btn sm-btn-success" id="sm-btn-export">🖨️ Export PDF</button>
            <button class="sm-btn sm-btn-primary" id="sm-btn-ai">✨ Generate Notes</button>
            <button class="sm-btn" id="sm-close-os">Exit</button>
          </div>
        </div>
        
        <div id="sm-editor" contenteditable="true">
            <div style="text-align:center; padding-top: 80px; font-family: sans-serif;">
                <h2 style="color: #a855f7; font-size: 28px; margin-bottom: 10px;">Initialize Workspace</h2>
                <p style="color: #a1a1aa; margin-bottom: 25px;">Define your project scope and learning mode.</p>
                
                <input type="text" id="sm-init-project-name" placeholder="Name this Project..." style="padding: 12px; width: 300px; border-radius: 6px; border: 1px solid #3f3f46; background: #0f0f11; color: white; margin-bottom: 15px; font-size: 16px;"><br>
                
                <select id="sm-init-mode" style="padding: 12px; width: 300px; border-radius: 6px; border: 1px solid #a855f7; background: #18181b; color: white; margin-bottom: 25px; font-size: 14px; font-weight: bold; cursor: pointer; outline: none;">
                  <option value="examprep">📚 ExamPrep Mode</option>
                  <option value="skillgain" selected>🧠 SkillGain Mode</option>
                  <option value="research">🔬 Research Mode</option>
                </select><br>

                <button id="sm-start-project-btn" style="padding: 12px 24px; background: #a855f7; color: white; font-weight: bold; border: none; border-radius: 6px; cursor: pointer; font-size: 16px; width: 300px;">Launch Engine</button>
            </div>
        </div>
        
        <div id="sm-modal-bg">
          <div class="sm-modal-content">
            <div class="sm-tabs">
              <div class="sm-tab active" id="tab-api">API & Meta</div>
              <div class="sm-tab" id="tab-prompts">System Prompts</div>
            </div>

            <div id="content-api" class="sm-tab-content active">
              <div class="sm-form-group">
                <label>LLM Provider</label>
                <select id="setting-provider" class="sm-input">
                  <option value="groq">Groq (Llama 3.3 70B - Lightning Fast)</option>
                  <option value="gemini">Google Gemini (1.5 Pro)</option>
                </select>
              </div>
              <div class="sm-form-group"><label>Groq API Key</label><input type="password" id="setting-groq" class="sm-input" placeholder="gsk_..."></div>
              <div class="sm-form-group"><label>Gemini API Key</label><input type="password" id="setting-gemini" class="sm-input" placeholder="AIza..."></div>
              <div class="sm-form-group">
                <label>Global Syllabus / Goal (Injected into all prompts)</label>
                <textarea id="setting-syllabus" class="sm-input" style="height: 60px; resize: none;" placeholder="Paste your syllabus topics or learning target here..."></textarea>
              </div>
            </div>

            <div id="content-prompts" class="sm-tab-content">
              <div class="sm-form-group"><label>ExamPrep Instruction</label><textarea id="prompt-examprep" class="sm-input" style="height: 120px; resize: vertical;"></textarea></div>
              <div class="sm-form-group"><label>SkillGain Instruction</label><textarea id="prompt-skillgain" class="sm-input" style="height: 120px; resize: vertical;"></textarea></div>
              <div class="sm-form-group"><label>Research Instruction</label><textarea id="prompt-research" class="sm-input" style="height: 120px; resize: vertical;"></textarea></div>
            </div>

            <div class="sm-modal-actions">
              <button class="sm-btn sm-btn-primary" id="sm-save-settings" style="flex:1">Save Settings</button>
              <button class="sm-btn" id="sm-cancel-settings" style="flex:1">Cancel</button>
            </div>
          </div>
        </div>
      </div>

      <div id="sm-engine">
        <div class="sm-queue-header">
          <span>Playlist Queue</span>
          <div style="display:flex; gap: 8px; align-items:center;">
            <span id="sm-progress-text">0 / ${orderedQueue.length}</span>
            <button class="sm-btn" id="sm-open-settings" style="padding: 4px 8px;">⚙️ Meta</button>
          </div>
        </div>
        <div id="sm-queue-list"></div>
        <div class="sm-queue-adder">
          <input type="text" id="sm-add-url" placeholder="Paste YouTube Video URL...">
          <button id="sm-btn-add">Add</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', osHTML);
  document.body.style.overflow = 'hidden';

  // ── Project Initialization Logic ──
  document.getElementById('sm-start-project-btn').onclick = () => {
      const inputName = document.getElementById('sm-init-project-name').value.trim();
      projectName = inputName || "Untitled Project";
      
      // Lock in the mode for this project session
      projectMode = document.getElementById('sm-init-mode').value;
      const displayMode = document.getElementById('sm-display-mode');
      displayMode.style.display = 'inline-block';
      displayMode.innerText = projectMode.toUpperCase() + ' MODE';

      document.getElementById('sm-project-title').innerHTML = `${projectName} <input type="text" id="sm-oracle-search" class="sm-search" placeholder="🔍 Search Oracle...">`;
      document.getElementById('sm-editor').innerHTML = "Project initialized. Select a video from the queue to begin.";
      buildQueueUI(); 
      processVideo(orderedQueue[0], 0); // Start the background extraction ONLY after setup
  };

  engineInterval = setInterval(() => {
    const v = document.querySelector('video');
    if (v) {
      if (!autoMuteOverride && !v.muted) v.muted = true;
      const adBadge = document.querySelector('.ad-showing');
      if (adBadge) {
        v.playbackRate = 16; v.muted = true;
        const skipBtn = document.querySelector('.ytp-skip-ad-button') || document.querySelector('.ytp-ad-skip-button-modern');
        if (skipBtn) skipBtn.click();
      }
    }
  }, 100);

  // Bind UI Events
  document.getElementById('sm-close-os').onclick = exitOS;
  document.getElementById('sm-toggle-time').onchange = (e) => { showTimestamps = e.target.checked; renderWorkspace(currentViewedVideo); };
  document.getElementById('sm-editor').addEventListener('input', () => { if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = document.getElementById('sm-editor').innerHTML; });
  
  // ── Advanced LaTeX PDF Export via Microservice ──
  document.getElementById('sm-btn-export').onclick = async () => {
    const exportBtn = document.getElementById('sm-btn-export');
    const editor = document.getElementById('sm-editor');
    
    // Grab the innerHTML to send to the Pandoc microservice.
    const contentToExport = `<h1>${projectName}</h1><br><br>` + editor.innerHTML; 

    if (!contentToExport || contentToExport.includes("Select a video") || contentToExport.includes("Project initialized")) {
        alert("Generate notes first before exporting!");
        return;
    }

    const originalText = exportBtn.innerText;
    exportBtn.innerText = "⏳ Compiling PDF...";
    exportBtn.disabled = true;

    try {
        // MUST include /generate-pdf at the end!
        const response = await fetch('https://scrapemind-yj4c.onrender.com/generate-pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ markdown: contentToExport }) 
        });

        if (!response.ok) throw new Error("Microservice failed to compile PDF. Render might be sleeping. Try again in 30 seconds.");

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${projectName.replace(/\s+/g, '_')}_Notes.pdf`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
    } catch (error) {
        alert(`Export Error: ${error.message}\nMake sure your Render service is live and fully deployed!`);
    } finally {
        exportBtn.innerText = originalText;
        exportBtn.disabled = false;
    }
  };

  // ── URL Paste Fix ──
  document.getElementById('sm-btn-add').onclick = () => {
    const urlStr = document.getElementById('sm-add-url').value;
    try {
      const url = new URL(urlStr); 
      const vid = url.searchParams.get('v');
      if (vid && !playlistState[vid]) {
        // Blindly add to queue. The background extractor will fetch the real title when it navigates there.
        playlistState[vid] = { id: vid, title: `Pending Video (${vid})`, status: 'waiting', transcript: [], userEdits: "" };
        orderedQueue.push(vid); 
        buildQueueUI(); 
        document.getElementById('sm-add-url').value = "";
        
        const unfinished = orderedQueue.findIndex(id => playlistState[id].status === 'waiting');
        if (unfinished !== -1) processVideo(orderedQueue[unfinished], unfinished);
      } else {
        alert("Video already in queue or invalid ID.");
      }
    } catch(e) { 
        alert("Invalid URL. Please paste a full YouTube video link."); 
        document.getElementById('sm-add-url').value = "";
    }
  };

  // Re-bind search event delegation
  document.body.addEventListener('keyup', (e) => {
    if (e.target && e.target.id === 'sm-oracle-search') {
        const query = e.target.value.toLowerCase();
        document.querySelectorAll('.sm-queue-item').forEach(item => {
          const vidId = item.id.replace('q-item-', ''); const state = playlistState[vidId];
          const searchableText = (state.title + " " + state.transcript.map(t=>t.text).join(' ') + " " + state.userEdits).toLowerCase();
          item.classList.toggle('hidden', query.length > 0 && !searchableText.includes(query));
        });
    }
  });

  // Settings
  document.getElementById('sm-open-settings').onclick = () => {
    document.getElementById('setting-provider').value = settings.llmProvider;
    document.getElementById('setting-groq').value = settings.groqKey;
    document.getElementById('setting-gemini').value = settings.geminiKey;
    document.getElementById('setting-syllabus').value = settings.syllabus || '';
    document.getElementById('prompt-examprep').value = settings.prompts.examprep;
    document.getElementById('prompt-skillgain').value = settings.prompts.skillgain;
    document.getElementById('prompt-research').value = settings.prompts.research;
    document.getElementById('sm-modal-bg').style.display = 'flex';
  };
  document.getElementById('sm-cancel-settings').onclick = () => document.getElementById('sm-modal-bg').style.display = 'none';
  
  document.getElementById('tab-api').onclick = () => switchTab('api');
  document.getElementById('tab-prompts').onclick = () => switchTab('prompts');

  function switchTab(tab) {
    document.querySelectorAll('.sm-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.sm-tab-content').forEach(c => c.classList.remove('active'));
    document.getElementById(`tab-${tab}`).classList.add('active');
    document.getElementById(`content-${tab}`).classList.add('active');
  }

  document.getElementById('sm-save-settings').onclick = () => {
    settings.llmProvider = document.getElementById('setting-provider').value;
    settings.groqKey = document.getElementById('setting-groq').value.trim();
    settings.geminiKey = document.getElementById('setting-gemini').value.trim();
    settings.syllabus = document.getElementById('setting-syllabus').value.trim();
    settings.prompts.examprep = document.getElementById('prompt-examprep').value.trim();
    settings.prompts.skillgain = document.getElementById('prompt-skillgain').value.trim();
    settings.prompts.research = document.getElementById('prompt-research').value.trim();
    if (chrome.storage && chrome.storage.local) chrome.storage.local.set({ sm_settings: settings }, () => {
      document.getElementById('sm-modal-bg').style.display = 'none'; alert("Settings saved!");
    });
  };

  document.getElementById('sm-btn-ai').onclick = () => {
    if (!settings.groqKey && !settings.geminiKey) document.getElementById('sm-open-settings').click();
    else triggerAINotesChunked(); 
  };
}

function exitOS() { document.getElementById('sm-os-root').remove(); document.body.style.overflow = 'auto'; clearInterval(engineInterval); isRunning = false; }

// ── Multi-Capture Diagram UI ──
window.smSeekVideo = (seconds) => {
  const v = document.querySelector('video');
  if (v) { v.currentTime = seconds; v.muted = false; autoMuteOverride = true; setTimeout(() => { autoMuteOverride = false; }, 8000); }
};

window.captureDiagramFrame = (btn) => {
  const v = document.querySelector('video');
  if (!v) { alert("Video not playing."); return; }
  try {
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
    const img = document.createElement('img');
    img.src = canvas.toDataURL('image/jpeg', 0.8);
    const gallery = btn.closest('.sm-diagram-wrapper').querySelector('.sm-diagram-gallery');
    gallery.appendChild(img);
    if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = document.getElementById('sm-editor').innerHTML;
  } catch(e) { alert("Could not capture frame."); }
};

window.pasteImageURL = (btn) => {
  const url = prompt("Paste direct Image URL or Web Link:");
  if(url) {
    const gallery = btn.closest('.sm-diagram-wrapper').querySelector('.sm-diagram-gallery');
    // Basic check: if it ends in image extensions, embed as image. Otherwise, make it a clickable reference link.
    if(url.match(/\.(jpeg|jpg|gif|png|webp)$/i) != null) {
        const img = document.createElement('img'); img.src = url;
        gallery.appendChild(img);
    } else {
        const link = document.createElement('a');
        link.href = url; link.target = "_blank"; link.textContent = `🔗 Context Reference Link: ${url}`;
        link.style.color = "#a855f7"; link.style.display = "block"; link.style.marginTop = "10px";
        gallery.appendChild(link);
    }
    if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = document.getElementById('sm-editor').innerHTML;
  }
};

window.dismissDiagram = (btn) => {
  btn.closest('.sm-diagram-wrapper').remove();
  if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = document.getElementById('sm-editor').innerHTML;
};

// ── Workspace Render ──
function timeToSeconds(timeStr) { const p = timeStr.split(':').map(Number); return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1]; }

function renderWorkspace(videoId) {
  const editor = document.getElementById('sm-editor');
  if (!videoId || !playlistState[videoId]) { editor.innerHTML = "Project initialized. Select a video from the queue..."; return; }
  const data = playlistState[videoId];
  if (data.userEdits !== "") { editor.innerHTML = data.userEdits; return; }
  if (data.transcript.length === 0) { editor.innerHTML = data.status === 'extracting' ? "Loading transcript..." : "No transcript available yet."; return; }

  let html = `<h2>=== ${data.title} ===</h2><br><br>`;
  if (showTimestamps) {
    html += data.transcript.map(t => { const sec = timeToSeconds(t.time); return `<div><a class="sm-timestamp-link" contenteditable="false" onclick="window.smSeekVideo(${sec})">[${t.time}]</a> ${t.text}</div>`; }).join('');
  } else { html += data.transcript.map(t => t.text).join(' '); }
  editor.innerHTML = html;
}

function buildQueueUI() {
  const qList = document.getElementById('sm-queue-list'); 
  if(!qList) return; // Guard for initialization state
  qList.innerHTML = '';
  orderedQueue.forEach(id => {
    const v = playlistState[id]; const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    const div = document.createElement('div'); div.className = 'sm-queue-item'; div.id = `q-item-${v.id}`;
    
    let statusText = "⏳ Waiting";
    if (v.status === 'done') { statusText = "✅ Complete"; div.classList.add('done'); }
    else if (v.status === 'skipped') { statusText = "⏭️ Skipped"; div.classList.add('skipped'); }
    else if (v.status === 'extracting') { statusText = "⚡ Extracting..."; div.classList.add('active'); }

    div.innerHTML = `
      <img src="${thumbUrl}" class="sm-thumb">
      <div class="sm-info"><div class="sm-title">${v.title}</div><div class="sm-status" id="q-status-${v.id}">${statusText}</div></div>
      <div class="sm-actions"><button class="sm-icon-btn delete" data-id="${v.id}" title="Skip">🗑️</button></div>
    `;

    div.onclick = (e) => {
      if (e.target.tagName === 'BUTTON') return; 
      document.querySelectorAll('.sm-queue-item').forEach(el => el.classList.remove('active'));
      div.classList.add('active'); currentViewedVideo = v.id; renderWorkspace(v.id);
    };
    div.querySelector('.delete').onclick = () => { v.status = 'skipped'; div.classList.add('skipped'); div.querySelector('.sm-status').textContent = "⏭️ Skipped"; };
    qList.appendChild(div);
  });
  const doneCount = orderedQueue.filter(id => playlistState[id].status === 'done' || playlistState[id].status === 'skipped').length;
  document.getElementById('sm-progress-text').innerText = `${doneCount} / ${orderedQueue.length}`;
}

// ── Helper: Format Markdown to HTML to fix Clumping ──
function formatLLMOutput(rawText) {
    let cleanText = rawText.replace(/```html|```/g, ''); // Strip codeblocks
    // If the LLM disobeyed and sent Markdown instead of HTML, intercept and fix it with line breaks
    cleanText = cleanText
        .replace(/^### (.*$)/gim, '<br><br><h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<br><br><h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<br><br><h1>$1</h1>')
        .replace(/^\> (.*$)/gim, '<blockquote style="border-left: 3px solid #a855f7; padding-left: 10px; margin: 10px 0;">$1</blockquote>')
        .replace(/\*\*(.*)\*\*/gim, '<b>$1</b>')
        .replace(/^- (.*$)/gim, '<ul style="margin-bottom: 10px;"><li>$1</li></ul>'); 
    return cleanText;
}

// ── Phase 2: CHUNKING PIPELINE FOR MASSIVE VIDEOS ──
async function triggerAINotesChunked() {
  if (!currentViewedVideo || !playlistState[currentViewedVideo].transcript.length) return;

  const mode = projectMode; // Use the globally locked project mode
  const editor = document.getElementById('sm-editor');
  const originalHTML = editor.innerHTML;
  
  const segments = playlistState[currentViewedVideo].transcript;
  const chunkSize = 80; 
  const chunks = [];
  for (let i = 0; i < segments.length; i += chunkSize) chunks.push(segments.slice(i, i + chunkSize));

  let finalNotesHTML = `<h2>🧠 AI Notes: ${playlistState[currentViewedVideo].title} (${mode.toUpperCase()} Mode)</h2><br><br>`;
  editor.innerHTML = `<h3>🤖 Initializing AI... Segmenting video into ${chunks.length} parts.</h3>`;

  let basePrompt = settings.prompts[mode];
  if (settings.syllabus) basePrompt += `\n\nCRITICAL CONTEXT / SYLLABUS TO FOLLOW:\n${settings.syllabus}`;

  for (let c = 0; c < chunks.length; c++) {
    editor.innerHTML += `<p>⏳ Analyzing Part ${c + 1} of ${chunks.length}...</p>`;
    
    const chunkText = chunks[c].map(t => t.text).join(' ');
    const chunkPrompt = c === 0 
      ? `${basePrompt}\n\nThis is PART 1 of the transcript. Begin formatting the structured notes.` 
      : `${basePrompt}\n\nThis is PART ${c + 1} of the transcript. Continue the structured notes seamlessly from the previous concepts. Do not repeat introductory headers.`;

    try {
      let aiResponse = "";
      if (settings.llmProvider === 'groq') {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Authorization": `Bearer ${settings.groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile", 
            messages: [
              { role: "system", content: chunkPrompt },
              { role: "user", content: `Transcript Chunk ${c + 1}:\n${chunkText}` }
            ], temperature: 0.2
          })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        aiResponse = data.choices[0].message.content;
      }
      
      finalNotesHTML += formatLLMOutput(aiResponse) + "<br><br>";

    } catch (e) {
      editor.innerHTML = `<h3 style="color:red">❌ Failed on Part ${c + 1}: ${e.message}</h3>`;
      setTimeout(() => { editor.innerHTML = originalHTML; }, 4000);
      return;
    }
  }

  // Convert Diagram Tags to the Interactive UI
  finalNotesHTML = finalNotesHTML.replace(/\[\[DIAGRAM:\s*(.*?)\]\]/g, 
    `<div class="sm-diagram-wrapper" contenteditable="false">
      <div class="sm-diagram-desc">📸 Requested Diagram: $1</div>
      <div class="sm-diagram-actions">
        <button class="sm-diagram-btn" onclick="window.captureDiagramFrame(this)">Capture Frame</button>
        <button class="sm-diagram-btn" onclick="window.pasteImageURL(this)">Add Context/URL</button>
        <button class="sm-diagram-btn" style="border-color:#ef4444;" onclick="window.dismissDiagram(this)">Dismiss</button>
      </div>
      <div class="sm-diagram-gallery" contenteditable="true"></div>
    </div><br><br>`
  );
  
  playlistState[currentViewedVideo].userEdits = finalNotesHTML; 
  editor.innerHTML = finalNotesHTML;
}

// ── Background Extractor ──
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function processVideo(vid, index) {
  if (index >= orderedQueue.length) return; 
  const state = playlistState[vid];
  if (state.status === 'skipped') { buildQueueUI(); processVideo(orderedQueue[index + 1], index + 1); return; }

  state.status = 'extracting'; buildQueueUI(); 

  if (!window.location.href.includes(vid)) {
    const links = Array.from(document.querySelectorAll(`a[href*="${vid}"]`));
    const visibleLink = links.find(a => a.offsetParent !== null);
    if (visibleLink) visibleLink.click();
    else if (document.querySelector('.ytp-next-button')) document.querySelector('.ytp-next-button').click();
  }

  await sleep(3000); 
  // Update the title dynamically if it was added via URL Paste
  state.title = document.title.replace(' - YouTube', ''); 
  
  const expandBtn = document.querySelector('tp-yt-paper-button#expand') || document.querySelector('ytd-text-inline-expander button');
  if (expandBtn) expandBtn.click();
  
  await sleep(1000);
  const tBtns = Array.from(document.querySelectorAll('button'));
  const transcriptBtn = tBtns.find(b => b.textContent?.trim().toLowerCase() === 'show transcript' || b.getAttribute('aria-label') === 'Show transcript');

  if (transcriptBtn) {
    transcriptBtn.click();
    let attempts = 0;
    while(attempts < 10) {
      await sleep(500);
      const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
      if (segments.length > 0) {
        const parsedData = [];
        segments.forEach(s => {
          const timeEl = s.querySelector('.segment-timestamp'); const textEl = s.querySelector('.segment-text');
          if (textEl) parsedData.push({ time: timeEl ? timeEl.textContent.trim() : "", text: textEl.textContent.replace(/\s+/g, ' ').trim() });
        });
        state.transcript = parsedData; break;
      }
      attempts++;
    }
    if (state.transcript.length > 0) {
      state.status = 'done';
      if (currentViewedVideo === vid) renderWorkspace(vid);
    } else { state.status = 'failed'; }
  } else { state.status = 'failed'; }

  buildQueueUI(); await sleep(1500);
  processVideo(orderedQueue[index + 1], index + 1);
}
