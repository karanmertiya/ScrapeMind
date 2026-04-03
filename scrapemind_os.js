let isRunning = false;
let engineInterval = null;

let playlistState = {};
let orderedQueue = []; 
let currentViewedVideo = null;
let showTimestamps = false;
let autoMuteOverride = false; 
let projectName = "Untitled Project";
let projectMode = "skillgain"; 

// ── Overhauled, Elite System Instructions (Safely Encoded) ──
const defaultPrompts = {
  examprep: "You are an elite university professor. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML, EXCEPT for code snippets and lists. Use <br><br> before EVERY <h2> and <h3> to prevent clumping. Format code blocks using triple backticks (e.g., \x60\x60\x60python code \x60\x60\x60). For lists, use standard markdown * or 1. at the start of new lines. Extract exact formulas, definitions, and core theories from the transcript.\n\nRULE: If the instructor visually references a graph, circuit, or diagram, explicitly write this exact tag: [[DIAGRAM: [MM:SS] Describe what the image shows]]. (Replace MM:SS with the video timestamp).",
  skillgain: "You are a FAANG Senior Engineer conducting a training session. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML, EXCEPT for code snippets and lists. Use <br><br> before EVERY <h2> and <h3> to prevent clumping. Format code blocks using triple backticks (e.g., \x60\x60\x60python code \x60\x60\x60). For lists, use standard markdown * or 1. at the start of new lines. Focus heavily on algorithms, code logic, and practical application.\n\nRULE: Whenever a core block of code or logic is explained, write: [[DIAGRAM: [MM:SS] Code snippet or architecture diagram being discussed]]. (Replace MM:SS with the video timestamp).",
  research: "You are a Post-Doc Researcher. CRITICAL INSTRUCTION: You MUST format your entire response in strict HTML, EXCEPT for code snippets and lists. Use <br><br> before EVERY <h2> and <h3> to prevent clumping. Format code blocks using triple backticks. For lists, use standard markdown * or 1. at the start of new lines. Synthesize the transcript into a critical literature review.\n\nRULE: Write [[DIAGRAM: [MM:SS] Data chart or experimental setup shown]] whenever visual evidence is referenced. (Replace MM:SS with the video timestamp)."
};

let settings = { llmProvider: 'groq', groqKey: '', geminiKey: '', cfAccount: '', cfToken: '', syllabus: '', prompts: { ...defaultPrompts } };

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
    playlistState[v.id] = { id: v.id, title: v.title, status: 'waiting', transcript: [], comments: [], userEdits: "" };
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
            <button class="sm-btn sm-btn-success" id="sm-btn-export-all">🖨️ Export All</button>
            <button class="sm-btn sm-btn-success" id="sm-btn-export">🖨️ Export Current</button>
            <button class="sm-btn" id="sm-btn-edit" style="background:#f59e0b; border-color:#f59e0b;">✏️ Edit</button>
            <button class="sm-btn sm-btn-primary" id="sm-btn-ai-all">✨ Generate All</button>
            <button class="sm-btn sm-btn-primary" id="sm-btn-ai">✨ Generate Current</button>
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
              <div style="display:flex; gap:10px;">
                <div class="sm-form-group" style="flex:1"><label>Groq API Key</label><input type="password" id="setting-groq" class="sm-input" placeholder="gsk_..."></div>
                <div class="sm-form-group" style="flex:1"><label>Gemini API Key</label><input type="password" id="setting-gemini" class="sm-input" placeholder="AIza..."></div>
              </div>
              <div style="display:flex; gap:10px;">
                <div class="sm-form-group" style="flex:1"><label>Cloudflare Account ID</label><input type="password" id="setting-cf-acc" class="sm-input" placeholder="For AI Images..."></div>
                <div class="sm-form-group" style="flex:1"><label>Cloudflare API Token</label><input type="password" id="setting-cf-tok" class="sm-input" placeholder="For AI Images..."></div>
              </div>
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
      
      projectMode = document.getElementById('sm-init-mode').value;
      const displayMode = document.getElementById('sm-display-mode');
      displayMode.style.display = 'inline-block';
      displayMode.innerText = projectMode.toUpperCase() + ' MODE';

      document.getElementById('sm-project-title').innerHTML = `${projectName} <input type="text" id="sm-oracle-search" class="sm-search" placeholder="🔍 Search Oracle...">`;
      document.getElementById('sm-editor').innerHTML = "Project initialized. Select a video from the queue to begin.";
      
      fetch('https://scrapemind-yj4c.onrender.com/').catch(e => console.log("Pinged Render Server"));
      buildQueueUI(); 
      runQueueProcessor();
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

  document.getElementById('sm-close-os').onclick = exitOS;
  document.getElementById('sm-toggle-time').onchange = (e) => { showTimestamps = e.target.checked; renderWorkspace(currentViewedVideo); };
  
  const editorNode = document.getElementById('sm-editor');
  editorNode.addEventListener('input', () => { if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = editorNode.innerHTML; });
  
  // ── Event Delegation for Editor (Diagrams & Blur Elements) ──
  editorNode.addEventListener('click', (e) => {
    const target = e.target;

    if (target.classList.contains('sm-blurred-line')) {
        target.style.filter = 'none';
        target.style.cursor = 'text';
        target.classList.remove('sm-blurred-line');
        if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = editorNode.innerHTML;
        return;
    }

    if (!target.classList.contains('sm-diagram-btn')) return;

    const wrapper = target.closest('.sm-diagram-wrapper');
    const gallery = wrapper.querySelector('.sm-diagram-gallery');
    const desc = wrapper.querySelector('.sm-diagram-desc').getAttribute('data-desc');

    if (target.classList.contains('sm-action-seek')) {
        const time = target.getAttribute('data-time');
        const v = document.querySelector('video');
        if (v) { v.currentTime = parseInt(time); v.muted = false; autoMuteOverride = true; setTimeout(() => autoMuteOverride = false, 8000); }
    }
    else if (target.classList.contains('sm-action-search')) {
        const query = encodeURIComponent(projectName + " " + desc);
        window.open(`https://www.google.com/search?tbm=isch&q=${query}`, '_blank');
    }
    else if (target.classList.contains('sm-action-upload')) {
        const fileInput = wrapper.querySelector('.sm-file-upload');
        fileInput.click();
        fileInput.onchange = (ev) => {
            const file = ev.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (readerEvent) => {
                    const img = document.createElement('img');
                    img.src = readerEvent.target.result;
                    gallery.appendChild(img);
                };
                reader.readAsDataURL(file);
            }
        };
    }
    else if (target.classList.contains('sm-action-generate')) {
        // We wrap the user's description in a strict styling prompt so SD doesn't draw literal humans
        const defaultStylePrompt = `A clean, technical educational diagram showing: ${desc}. Minimalist flat vector style, computer science schematic, white background, no text.`;
        const userPrompt = prompt("Edit the image generation prompt for Stable Diffusion:", defaultStylePrompt);
        
        if (userPrompt) {
            if (!settings.cfAccount || !settings.cfToken) {
                alert("Please add your Cloudflare Account ID and Token in the Meta settings first!");
                return;
            }
            target.innerText = "⏳ Generating...";
            target.disabled = true;
            
            fetch('https://scrapemind-yj4c.onrender.com/generate-image', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: userPrompt, account_id: settings.cfAccount, api_token: settings.cfToken })
            }).then(res => res.json())
            .then(data => {
                if (data.image_base64) {
                    const img = document.createElement('img');
                    img.src = "data:image/png;base64," + data.image_base64;
                    gallery.appendChild(img);
                } else {
                    alert("API returned no image data.");
                }
            }).catch(err => alert("Cloudflare Generator Error: " + err.message))
            .finally(() => { target.innerText = "🎨 Generate AI Image"; target.disabled = false; });
        }
    }
    else if (target.classList.contains('sm-action-capture')) {
        const v = document.querySelector('video');
        if (!v) { alert("Video not playing."); return; }
        try {
            const canvas = document.createElement('canvas');
            canvas.width = v.videoWidth; canvas.height = v.videoHeight;
            canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = document.createElement('img');
            img.src = canvas.toDataURL('image/jpeg', 0.8);
            gallery.appendChild(img);
        } catch(err) { alert("Could not capture frame."); }
    }
    else if (target.classList.contains('sm-action-dismiss')) {
        wrapper.remove();
    }

    if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = document.getElementById('sm-editor').innerHTML;
  });

  // ── Inline "Make it Perfect" Editor ──
  document.getElementById('sm-btn-edit').onclick = async () => {
    const selection = window.getSelection();
    const highlightedText = selection.toString().trim();
    if (!highlightedText) { alert("Please highlight the text you want to edit first."); return; }

    const instruction = prompt("How should the AI rewrite this?");
    if (!instruction) return;

    if (!settings.groqKey) { alert("Please set your Groq API key."); return; }

    const originalBtnText = document.getElementById('sm-btn-edit').innerText;
    document.getElementById('sm-btn-edit').innerText = "⏳ Rewriting...";

    const promptText = `You are a precision editing assistant. \nUser Instruction: "${instruction}"\n\nTarget Text to Rewrite:\n"${highlightedText}"\n\nReturn ONLY the perfectly rewritten text formatted in HTML. Do not include any other commentary.`;

    try {
        const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST", headers: { "Authorization": `Bearer ${settings.groqKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: promptText }], temperature: 0.2 })
        });
        const data = await response.json();
        let newText = data.choices[0].message.content.replace(/\x60\x60\x60html|\x60\x60\x60/g, '');
        
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const tempDiv = document.createElement("div"); tempDiv.innerHTML = newText;
        const frag = document.createDocumentFragment();
        while (tempDiv.firstChild) { frag.appendChild(tempDiv.firstChild); }
        range.insertNode(frag);
        
        if(currentViewedVideo) playlistState[currentViewedVideo].userEdits = editorNode.innerHTML;
    } catch (e) { alert(`Edit failed: ${e.message}`); } finally { document.getElementById('sm-btn-edit').innerText = originalBtnText; }
  };

  // ── Master Generate All Logic ──
  document.getElementById('sm-btn-ai-all').onclick = async () => {
      if (!settings.groqKey) { document.getElementById('sm-open-settings').click(); return; }
      
      const originalText = document.getElementById('sm-btn-ai-all').innerText;
      document.getElementById('sm-btn-ai-all').innerText = "⏳ Generating All...";
      document.getElementById('sm-btn-ai-all').disabled = true;

      for (const vid of orderedQueue) {
          // Only process videos that have been fully extracted and don't already have notes
          if (playlistState[vid].status === 'done' && !playlistState[vid].userEdits) {
              currentViewedVideo = vid; // Visually switch to the video being processed
              renderWorkspace(vid);
              await triggerAINotesChunked();
              await sleep(2000); // Small buffer between full video generation
          }
      }

      document.getElementById('sm-btn-ai-all').innerText = originalText;
      document.getElementById('sm-btn-ai-all').disabled = false;
      alert("Finished generating notes for all processed videos in the queue!");
  };

  // ── Master PDF Cleanup Helper ──
  function cleanupForPDF(container) {
      container.querySelectorAll('.sm-blurred-line').forEach(el => { el.style.filter = 'none'; el.style.display = 'block'; });
      
      container.querySelectorAll('img').forEach(img => {
          const placeholder = document.createElement('div');
          placeholder.innerHTML = `<div style="text-align:center; padding: 10px; border: 1px dashed #666; margin: 10px 0;"><strong style="color: #444; font-size: 14px;">[Image omitted to prevent LaTeX compilation errors]</strong></div>`;
          img.replaceWith(placeholder);
      });

      container.querySelectorAll('.sm-diagram-wrapper').forEach(w => {
          const descEl = w.querySelector('.sm-diagram-desc');
          const desc = descEl ? descEl.getAttribute('data-desc') : "";
          w.outerHTML = `<div style="text-align:center; margin: 25px 0; padding: 10px; border: 1px dashed #666;"><strong style="color: #444; font-size: 14px;">[Diagram Placeholder: ${desc}]</strong><br></div><br>`;
      });
  }

  // ── Single Export ──
  document.getElementById('sm-btn-export').onclick = async () => {
    const cloneEditor = editorNode.cloneNode(true);
    cleanupForPDF(cloneEditor);

    const contentToExport = `<h1>${projectName}</h1><br><br>` + cloneEditor.innerHTML; 
    if (!contentToExport || contentToExport.includes("Select a video") || contentToExport.includes("Project initialized")) { alert("Generate notes first!"); return; }

    await exportPDFPayload(contentToExport, document.getElementById('sm-btn-export'));
  };

  // ── Master Export All ──
  document.getElementById('sm-btn-export-all').onclick = async () => {
    let combinedHTML = `<h1>${projectName} - Full Course Notes</h1><br><br>`;
    let hasNotes = false;

    for (const vid of orderedQueue) {
        if (playlistState[vid].userEdits) {
            hasNotes = true;
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = playlistState[vid].userEdits;
            cleanupForPDF(tempDiv);
            // Append with a page break between videos
            combinedHTML += tempDiv.innerHTML + `<div style="page-break-before: always;"></div>`;
        }
    }

    if (!hasNotes) { alert("No notes to export yet! Generate notes for at least one video."); return; }
    await exportPDFPayload(combinedHTML, document.getElementById('sm-btn-export-all'));
  };

  async function exportPDFPayload(htmlContent, btnElement) {
      const originalText = btnElement.innerText;
      btnElement.innerText = "⏳ Compiling PDF...";
      btnElement.disabled = true;
      try {
          const response = await fetch('https://scrapemind-yj4c.onrender.com/generate-pdf', {
              method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ markdown: htmlContent }) 
          });
          if (!response.ok) throw new Error("Microservice failed to compile PDF. Try again in 30 seconds.");
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a'); a.style.display = 'none'; a.href = url;
          a.download = `${projectName.replace(/\s+/g, '_')}_Notes.pdf`;
          document.body.appendChild(a); a.click(); window.URL.revokeObjectURL(url);
      } catch (error) { alert(`Export Error: ${error.message}`); } 
      finally { btnElement.innerText = originalText; btnElement.disabled = false; }
  }

  // ── Queue Adder ──
  document.getElementById('sm-btn-add').onclick = () => {
    const urlStr = document.getElementById('sm-add-url').value;
    try {
      const url = new URL(urlStr); 
      const vid = url.searchParams.get('v');
      if (vid && !playlistState[vid]) {
        playlistState[vid] = { id: vid, title: `Pending Video (${vid})`, status: 'waiting', transcript: [], comments: [], userEdits: "" };
        orderedQueue.push(vid); buildQueueUI(); document.getElementById('sm-add-url').value = "";
        runQueueProcessor();
      } else { alert("Video already in queue or invalid ID."); }
    } catch(e) { alert("Invalid URL."); document.getElementById('sm-add-url').value = ""; }
  };

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

  // Settings UI
  document.getElementById('sm-open-settings').onclick = () => {
    document.getElementById('setting-provider').value = settings.llmProvider;
    document.getElementById('setting-groq').value = settings.groqKey;
    document.getElementById('setting-gemini').value = settings.geminiKey;
    document.getElementById('setting-cf-acc').value = settings.cfAccount || '';
    document.getElementById('setting-cf-tok').value = settings.cfToken || '';
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
    settings.cfAccount = document.getElementById('setting-cf-acc').value.trim();
    settings.cfToken = document.getElementById('setting-cf-tok').value.trim();
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

function timeToSeconds(timeStr) { const p = timeStr.split(':').map(Number); return p.length === 3 ? p[0]*3600 + p[1]*60 + p[2] : p[0]*60 + p[1]; }

function renderWorkspace(videoId) {
  const editor = document.getElementById('sm-editor');
  if (!videoId || !playlistState[videoId]) { editor.innerHTML = "Project initialized. Select a video from the queue..."; return; }
  const data = playlistState[videoId];
  if (data.userEdits !== "") { editor.innerHTML = data.userEdits; return; }
  if (data.transcript.length === 0) { editor.innerHTML = data.status === 'extracting' ? "Loading transcript..." : "No transcript available yet."; return; }

  let html = `<h2>=== ${data.title} ===</h2><br><br>`;
  if (showTimestamps) {
    html += data.transcript.map(t => { const sec = timeToSeconds(t.time); return `<div><a class="sm-timestamp-link" contenteditable="false" data-time="${sec}">[${t.time}]</a> ${t.text}</div>`; }).join('');
  } else { html += data.transcript.map(t => t.text).join(' '); }
  editor.innerHTML = html;
}

function buildQueueUI() {
  const qList = document.getElementById('sm-queue-list'); 
  if(!qList) return; 
  qList.innerHTML = '';
  orderedQueue.forEach(id => {
    const v = playlistState[id]; const thumbUrl = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`;
    const div = document.createElement('div'); div.className = 'sm-queue-item'; div.id = `q-item-${v.id}`;
    
    let statusText = "⏳ Waiting";
    if (v.status === 'done') { statusText = "✅ Complete"; div.classList.add('done'); }
    else if (v.status === 'skipped') { statusText = "⏭️ Skipped"; div.classList.add('skipped'); }
    else if (v.status === 'hard_skipped') { statusText = "⏭️ Ignored"; div.classList.add('skipped'); }
    else if (v.status === 'waiting_retry') { statusText = "⏳ Retrying..."; div.classList.add('skipped'); }
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

    div.querySelector('.delete').onclick = () => { 
        if (v.status === 'waiting' || v.status === 'extracting') { v.status = 'skipped'; } else { v.status = 'hard_skipped'; }
        buildQueueUI();
    };
    qList.appendChild(div);
  });
  const doneCount = orderedQueue.filter(id => playlistState[id].status === 'done' || playlistState[id].status === 'hard_skipped').length;
  document.getElementById('sm-progress-text').innerText = `${doneCount} / ${orderedQueue.length}`;
}

// ── Helper: Format Markdown to HTML ──
function formatLLMOutput(rawText) {
    let cleanText = rawText;

    cleanText = cleanText.replace(/\[\[SOLUTION_START\]\]([\s\S]*?)\[\[SOLUTION_END\]\]/g, (match, content) => {
        const lines = content.trim().split('\n').map(line => {
            if (!line.trim()) return '<br>';
            return `<div class="sm-blurred-line" style="filter: blur(6px); cursor: pointer; user-select: none; margin-bottom: 4px; display: inline-block;">${line}</div><br>`;
        }).join('');
        return `<div style="margin-top: 20px; padding: 15px; border: 1px solid #3f3f46; border-radius: 8px; background: #0f0f11;"><strong style="color:#30d158; margin-bottom: 10px; display: block;">🔍 Practice Solutions (Click line to reveal)</strong>${lines}</div>`;
    });

    cleanText = cleanText.replace(/\x60\x60\x60(\w+)?\n([\s\S]*?)\x60\x60\x60/g, (match, lang, code) => {
        return `<pre class="sourceCode ${lang || ''}" style="background:#0f0f11; padding:15px; border-radius:6px; border:1px solid #3f3f46; color:#a855f7; overflow-x:auto; margin: 15px 0; font-family: monospace;"><code>${code}</code></pre>`;
    });

    cleanText = cleanText.replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
    cleanText = cleanText.replace(/^### (.*$)/gim, '<br><br><h3>$1</h3>');
    cleanText = cleanText.replace(/^## (.*$)/gim, '<br><br><h2>$1</h2>');
    cleanText = cleanText.replace(/^# (.*$)/gim, '<br><br><h1>$1</h1>');
    cleanText = cleanText.replace(/^\> (.*$)/gim, '<blockquote style="border-left: 3px solid #a855f7; padding-left: 10px; margin: 10px 0;">$1</blockquote>');
    
    cleanText = cleanText.replace(/^\s*[\*\-]\s+(.*$)/gim, '<div style="margin-left: 20px; display: list-item; list-style-type: disc; margin-bottom: 5px;">$1</div>');
    cleanText = cleanText.replace(/^\s*\d+\.\s+(.*$)/gim, '<div style="margin-left: 20px; display: list-item; list-style-type: decimal; margin-bottom: 5px;">$1</div>');
        
    return cleanText;
}

// ── Phase 2: CHUNKING PIPELINE FOR MASSIVE VIDEOS ──
async function triggerAINotesChunked() {
  if (!currentViewedVideo || !playlistState[currentViewedVideo].transcript.length) return;

  const mode = projectMode; 
  const editor = document.getElementById('sm-editor');
  const originalHTML = editor.innerHTML;
  
  const state = playlistState[currentViewedVideo];
  const segments = state.transcript;
  
  editor.innerHTML = `<h3>🤖 Initializing AI...</h3><p>Analyzing video transcript to build custom prompt...</p>`;
  
  // ── Transcript Pre-Analyzer (Top Comment) ──
  let customInstruction = "";
  try {
      const sampleTranscript = segments.slice(0, 40).map(t => t.text).join(' ');
      
      // Inject YouTube Comments into the pre-analyzer context
      let commentContext = "";
      if (state.comments && state.comments.length > 0) {
          commentContext = `\n\nTop Community Comments (May contain corrections or insights):\n- ${state.comments.join('\n- ')}`;
      }

      const prePrompt = `Analyze this video transcript excerpt. Write a strict 2-sentence instruction on what specific themes, concepts, or formulas to prioritize when taking notes for this specific topic. Return ONLY the instructions.\n\nTranscript:\n${sampleTranscript}${commentContext}`;
      
      const preRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", headers: { "Authorization": `Bearer ${settings.groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ model: "llama-3.3-70b-versatile", messages: [{ role: "user", content: prePrompt }], temperature: 0.3 })
      });
      const preData = await preRes.json();
      customInstruction = preData.choices[0].message.content;
  } catch(e) { console.log("Pre-analysis failed, using defaults."); }

  const chunkSize = 80; 
  const chunks = [];
  for (let i = 0; i < segments.length; i += chunkSize) chunks.push(segments.slice(i, i + chunkSize));

  let finalNotesHTML = `<h2>🧠 AI Notes: ${playlistState[currentViewedVideo].title} (${mode.toUpperCase()} Mode)</h2>`;
  
  if (customInstruction) {
      finalNotesHTML += `
      <blockquote style="background: rgba(168, 85, 247, 0.1); border-left: 4px solid #a855f7; padding: 15px; border-radius: 4px; margin: 20px 0; font-style: italic; color: #d4d4d8;">
        <strong style="color: #a855f7; font-style: normal; display: block; margin-bottom: 5px;">🎯 Custom Focus for this Video:</strong>
        ${customInstruction}
      </blockquote>`;
  }
  
  editor.innerHTML = `<h3>🤖 Segmenting video into ${chunks.length} parts...</h3>`;

  let basePrompt = settings.prompts[mode];
  if (customInstruction) basePrompt += `\n\nCRITICAL CONTEXT FOR THIS VIDEO:\n${customInstruction}`;
  if (settings.syllabus) basePrompt += `\n\nSYLLABUS TO FOLLOW:\n${settings.syllabus}`;
  if (state.comments && state.comments.length > 0) basePrompt += `\n\nCommunity Comments:\n- ${state.comments.join('\n- ')}`;

  let extractedSolutions = [];

  for (let c = 0; c < chunks.length; c++) {
    editor.innerHTML += `<p>⏳ Analyzing Part ${c + 1} of ${chunks.length}...</p>`;
    
    const isLastChunk = (c === chunks.length - 1);
    const chunkText = chunks[c].map(t => t.text).join(' ');
    let chunkPrompt = c === 0 
      ? `${basePrompt}\n\nThis is PART 1 of the transcript. Begin formatting the structured notes.` 
      : `${basePrompt}\n\nThis is PART ${c + 1} of the transcript. Continue the structured notes seamlessly. Do not repeat introductory headers.`;

    if (isLastChunk) {
        chunkPrompt += "\n\nCRITICAL: Since this is the final part, conclude with 3 Practice Questions. IMMEDIATELY follow them with their solutions wrapped EXACTLY in [[SOLUTION_START]] and [[SOLUTION_END]] tags.";
    }

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
      
      aiResponse = aiResponse.replace(/\[\[SOLUTION_START\]\]([\s\S]*?)\[\[SOLUTION_END\]\]/g, (match, content) => {
          extractedSolutions.push(content.trim());
          return ""; 
      });

      finalNotesHTML += formatLLMOutput(aiResponse) + "<br><br>";

    } catch (e) {
      editor.innerHTML = `<h3 style="color:red">❌ Failed on Part ${c + 1}: ${e.message}</h3>`;
      setTimeout(() => { editor.innerHTML = originalHTML; }, 4000);
      return;
    }
  }

  // ── Append Solutions Page to the end ──
  if (extractedSolutions.length > 0) {
      let solHTML = `<div style="page-break-before: always; margin-top: 50px; padding-top: 20px; border-top: 2px dashed #a855f7;">
          <h2 style="color:#30d158; margin-bottom: 20px;">🔍 Practice Solutions Page</h2>`;
          
      extractedSolutions.forEach((sol, i) => {
          const lines = sol.split('\n').map(line => {
              if (!line.trim()) return '<br>';
              return `<div class="sm-blurred-line" style="filter: blur(6px); cursor: pointer; user-select: none; margin-bottom: 4px; display: inline-block;">${line}</div><br>`;
          }).join('');
          solHTML += `<div style="margin-bottom: 20px; padding: 15px; background: #0f0f11; border-radius: 8px;"><strong>Solution ${i+1}</strong><br>${lines}</div>`;
      });
      solHTML += `</div>`;
      finalNotesHTML += solHTML;
  }

  // Convert Diagram Tags to the Interactive UI
  finalNotesHTML = finalNotesHTML.replace(/\[\[DIAGRAM:\s*(?:\[([\d:]+)\])?\s*(.*?)\]\]/g, (match, timeStr, desc) => {
    let seekButtonHtml = "";
    if (timeStr) {
        const sec = timeToSeconds(timeStr);
        seekButtonHtml = `<button class="sm-diagram-btn sm-action-seek" data-time="${sec}">⏱️ Seek to ${timeStr}</button>`;
    }
    
    return `
    <div class="sm-diagram-wrapper" contenteditable="false">
      <div class="sm-diagram-desc" data-desc="${desc.replace(/"/g, '&quot;')}">📸 Requested Diagram: ${desc}</div>
      <div class="sm-diagram-actions" style="flex-wrap: wrap;">
        ${seekButtonHtml}
        <button class="sm-diagram-btn sm-action-capture">📸 Capture Frame</button>
        <button class="sm-diagram-btn sm-action-generate">🎨 Generate AI Image</button>
        <button class="sm-diagram-btn sm-action-search">🔍 Search Web</button>
        <input type="file" class="sm-file-upload" accept="image/*" style="display:none;">
        <button class="sm-diagram-btn sm-action-upload">📁 Upload PC Image</button>
        <button class="sm-diagram-btn sm-action-dismiss" style="border-color:#ef4444;">❌ Dismiss</button>
      </div>
      <div class="sm-diagram-gallery" contenteditable="true"></div>
    </div><br><br>`;
  });
  
  playlistState[currentViewedVideo].userEdits = finalNotesHTML; 
  editor.innerHTML = finalNotesHTML;
}

// ── Smart Background Extractor with Loop-Back & Comment Scraping ──
function runQueueProcessor() {
    let nextId = orderedQueue.find(id => playlistState[id].status === 'waiting');
    if (nextId) { processVideo(nextId); return; }
    
    let skippedQueue = orderedQueue.filter(id => playlistState[id].status === 'skipped');
    if (skippedQueue.length > 0) {
        skippedQueue.forEach(id => playlistState[id].status = 'waiting_retry');
        buildQueueUI();
        processVideo(skippedQueue[0]);
        return;
    }
    
    let retryId = orderedQueue.find(id => playlistState[id].status === 'waiting_retry');
    if (retryId) { processVideo(retryId); }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function processVideo(vid) {
  const state = playlistState[vid];

  state.status = 'extracting'; buildQueueUI(); 

  if (!window.location.href.includes(vid)) {
    const links = Array.from(document.querySelectorAll(`a[href*="${vid}"]`));
    const visibleLink = links.find(a => a.offsetParent !== null);
    if (visibleLink) visibleLink.click();
    else if (document.querySelector('.ytp-next-button')) document.querySelector('.ytp-next-button').click();
  }

  await sleep(3000); 
  state.title = document.title.replace(' - YouTube', ''); 
  
  // ── Scrape Top YouTube Comments ──
  window.scrollBy(0, 800); // Scroll down to trigger comment loading
  await sleep(2000);
  window.scrollBy(0, 800); // Secondary scroll just in case
  await sleep(1000);
  const commentEls = document.querySelectorAll('ytd-comment-thread-renderer #content-text');
  if (commentEls.length > 0) {
      state.comments = Array.from(commentEls).slice(0, 3).map(el => el.textContent.trim());
  }

  // ── Scrape Transcript ──
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
  runQueueProcessor();
}
