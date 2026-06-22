import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { isDocumentResponse, MavMarkdown } from './mavUtils.js';
import './styles.css';

const WORKFLOW_MODES = [
  { id: 'ask',      label: 'ASK MAVERICK', accent: 'cyan',  tooltip: "Ask anything — Maverick will automatically recognize when you're scoping a job and shift into estimator mode." },
  { id: 'estimate', label: 'ESTIMATE',     accent: 'amber', tooltip: 'Start a new job estimate — describe the project or upload blueprints/proposals. Maverick scopes it, matches the price book, and pushes a real HCP estimate (same pipeline as the email watcher).' },
  { id: 'ops',      label: 'OPERATIONS',   accent: 'green', tooltip: 'Personal assistant — read emails, Word/PDF docs, build spreadsheets, send emails, create agents and skills' },
];

const MAX_FILE_BYTES = 8000;
const MAX_TOTAL_BYTES = 32000;

const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']);

async function readFileText(file) {
  const ext = file.name.split('.').pop().toLowerCase();

  // Images → return base64 for vision API
  if (IMAGE_EXTS.has(ext)) {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target.result;
        const data = dataUrl.split(',')[1] || '';
        resolve({ __image: true, data, mimeType: file.type || 'image/jpeg' });
      };
      reader.onerror = () => resolve({ __image: true, data: null, mimeType: file.type });
      reader.readAsDataURL(file);
    });
  }

  if (ext === 'pdf' || ext === 'docx') {
    return new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = async e => {
        try {
          const base64 = e.target.result.split(',')[1];
          const res = await fetch('/api/extract-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: file.name, data: base64 }),
          });
          const json = await res.json();
          resolve(json.text || '[empty document]');
        } catch { resolve('[unreadable]'); }
      };
      reader.onerror = () => resolve('[unreadable]');
      reader.readAsDataURL(file);
    });
  }
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result || '');
    reader.onerror = () => resolve('[unreadable]');
    reader.readAsText(file);
  });
}

function MaverickLogo({ className = 'assistantLogo' }) {
  return <img src="/assets/maverick-core-assistant-logo.png" className={className} alt="Maverick Core Assistant" />;
}


function FolderPickerModal({ onSelect, onClose }) {
  const [currentPath, setCurrentPath] = useState('C:\\');
  const [inputVal, setInputVal] = useState('C:\\');
  const [dirs, setDirs] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  async function loadPath(p) {
    setLoading(true);
    try {
      const res = await fetch(`/api/list-dirs?path=${encodeURIComponent(p)}`);
      const data = await res.json();
      setCurrentPath(data.path);
      setInputVal(data.path);
      setDirs(data.dirs || []);
      setFiles(data.files || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => { loadPath('C:\\'); }, []);
  useEffect(() => { inputRef.current?.focus(); }, []);

  function handleInputKey(e) {
    if (e.key === 'Enter') loadPath(inputVal);
  }

  function navigate(sub) {
    loadPath(currentPath.replace(/[\\/]$/, '') + '\\' + sub);
  }

  function selectFile(name) {
    onSelect({ path: currentPath.replace(/[\\/]$/, '') + '\\' + name, type: 'file' });
    onClose();
  }

  function winJoin(parts) {
    const joined = parts.join('\\');
    return /^[A-Za-z]:$/.test(joined) ? joined + '\\' : joined || 'C:\\';
  }

  function goUp() {
    const parts = currentPath.replace(/[\\/]$/, '').split(/[\\/]/).filter(Boolean);
    if (parts.length <= 1) return;
    parts.pop();
    loadPath(winJoin(parts));
  }

  const crumbs = currentPath.replace(/[\\/]$/, '').split(/[\\/]/).filter(Boolean);

  return (
    <div className="folderPickerOverlay" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="folderPickerModal">
        <div className="folderPickerHeader">
          <span className="folderPickerTitle">PC DRIVES</span>
          <button className="folderPickerClose" onClick={onClose}>✕</button>
        </div>
        <div className="folderPickerDrives">
          {['C:\\', 'D:\\', 'E:\\'].map(drive => (
            <button
              key={drive}
              className={`folderPickerDriveBtn${currentPath.toUpperCase().startsWith(drive.toUpperCase()) ? ' active' : ''}`}
              onClick={() => loadPath(drive)}
            >
              {drive.replace('\\', ':')} {drive === 'C:\\' ? 'SYSTEM' : drive === 'D:\\' ? 'STORAGE' : 'ARCHIVE'}
            </button>
          ))}
        </div>
        <div className="folderPickerCrumbs">
          {crumbs.map((seg, i) => (
            <React.Fragment key={i}>
              <button className="folderPickerCrumb" onClick={() => loadPath(winJoin(crumbs.slice(0, i + 1)))}>{seg}</button>
              {i < crumbs.length - 1 && <span className="folderPickerSep">›</span>}
            </React.Fragment>
          ))}
        </div>
        <div className="folderPickerPathRow">
          <input
            ref={inputRef}
            className="folderPickerInput"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onKeyDown={handleInputKey}
            placeholder="Type a path and press Enter"
            spellCheck={false}
          />
          <button className="folderPickerGoBtn" onClick={() => loadPath(inputVal)}>Go</button>
        </div>
        <div className="folderPickerList">
          {crumbs.length > 1 && <button className="folderPickerEntry folderPickerUp" onClick={goUp}>↑ ..</button>}
          {loading && <div className="folderPickerLoading">Loading…</div>}
          {!loading && dirs.length === 0 && files.length === 0 && <div className="folderPickerEmpty">Empty directory</div>}
          {!loading && dirs.map(name => (
            <button key={`d:${name}`} className="folderPickerEntry folderPickerDir" onDoubleClick={() => navigate(name)} onClick={() => setInputVal(currentPath.replace(/[\\/]$/, '') + '\\' + name)}>
              <span className="folderPickerIcon">📁</span> {name}
            </button>
          ))}
          {!loading && files.map(name => (
            <button key={`f:${name}`} className="folderPickerEntry folderPickerFile" onClick={() => selectFile(name)}>
              <span className="folderPickerIcon">📄</span> {name}
            </button>
          ))}
        </div>
        <div className="folderPickerFooter">
          <span className="folderPickerSelected">{inputVal}</span>
          <div className="folderPickerActions">
            <button className="folderPickerCancel" onClick={onClose}>Cancel</button>
            <button className="folderPickerConfirm" onClick={() => { onSelect({ path: inputVal, type: 'folder' }); onClose(); }}>Add Path</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Job history helpers ─────────────────────────────────────────────────────
const JOB_INDEX_KEY = 'mav-job-index';
const JOB_KEY = id => `mav-job-${id}`;

function loadJobIndex() {
  try { return JSON.parse(localStorage.getItem(JOB_INDEX_KEY) || '[]'); } catch { return []; }
}

function saveJob(id, label, history) {
  try {
    localStorage.setItem(JOB_KEY(id), JSON.stringify(history.slice(-40)));
    const index = loadJobIndex().filter(j => j.id !== id);
    const preview = history.find(m => m.role === 'user')?.content?.slice(0, 80) || '';
    index.unshift({ id, label, preview, savedAt: new Date().toISOString() });
    localStorage.setItem(JOB_INDEX_KEY, JSON.stringify(index.slice(0, 20)));
  } catch {}
}

function loadJob(id) {
  try { return JSON.parse(localStorage.getItem(JOB_KEY(id)) || '[]'); } catch { return []; }
}

function JobHistoryPanel({ onLoad, onClose }) {
  const jobs = loadJobIndex();
  if (jobs.length === 0) return (
    <div className="jobPanel">
      <div className="jobPanelHeader"><span>JOB HISTORY</span><button onClick={onClose}>✕</button></div>
      <div className="jobPanelEmpty">No saved jobs yet.</div>
    </div>
  );
  return (
    <div className="jobPanel">
      <div className="jobPanelHeader"><span>JOB HISTORY</span><button onClick={onClose}>✕</button></div>
      <div className="jobPanelList">
        {jobs.map(j => (
          <button key={j.id} className="jobPanelItem" onClick={() => { onLoad(j.id); onClose(); }}>
            <span className="jobPanelLabel">{j.label || 'Untitled Job'}</span>
            <span className="jobPanelPreview">{j.preview}</span>
            <span className="jobPanelDate">{new Date(j.savedAt).toLocaleDateString()}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function App() {
  const [workflowMode, setWorkflowMode] = useState('ask');
  const [chatHistory, setChatHistory] = useState(() => {
    try { return JSON.parse(localStorage.getItem('mav-assistant-history') || '[]'); } catch { return []; }
  });
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState([]);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [showJobHistory, setShowJobHistory] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const historyRef = useRef(null);
  const fileInputRef = useRef(null);
  const chatAbortRef = useRef(null);
  const rafRef = useRef(null);
  const recognitionRef = useRef(null);

  function toggleVoice() {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = 'en-US';
    let final = chatInput;
    rec.onresult = e => {
      let interim = '';
      for (let j = e.resultIndex; j < e.results.length; j++) {
        if (e.results[j].isFinal) final += e.results[j][0].transcript + ' ';
        else interim = e.results[j][0].transcript;
      }
      setChatInput(final + interim);
    };
    rec.onend = () => setIsListening(false);
    rec.onerror = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
    setIsListening(true);
  }

  useEffect(() => {
    if (!chatHistory.length) return;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = historyRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(rafRef.current);
  }, [chatHistory]);

  function pushChat(messages) {
    setChatHistory(prev => {
      const next = typeof messages === 'function' ? messages(prev) : messages;
      try { localStorage.setItem('mav-assistant-history', JSON.stringify(next.slice(-40))); } catch {}
      return next;
    });
  }

  async function handleFilePick(e) {
    const files = Array.from(e.target.files || []);
    let total = 0;
    const items = [];
    for (const file of files.slice(0, 60)) {
      if (total >= MAX_TOTAL_BYTES) break;
      const raw = await readFileText(file);
      if (raw && raw.__image) {
        if (raw.data) items.push({ name: file.name, type: 'image', data: raw.data, mimeType: raw.mimeType });
      } else {
        const content = (typeof raw === 'string' ? raw : '').slice(0, MAX_FILE_BYTES);
        items.push({ name: file.name, content });
        total += content.length;
      }
    }
    if (items.length) setAttachedFiles(prev => [...prev, ...items]);
    e.target.value = '';
  }

  async function handleFolderSelect(item) {
    if (!item?.path) return;
    const name = item.path.split(/[\\/]/).filter(Boolean).pop() || item.path;
    if (item.type === 'file') {
      const ext = name.split('.').pop().toLowerCase();
      if (ext === 'pdf' || ext === 'docx' || ext === 'txt' || ext === 'md') {
        try {
          const res = await fetch('/api/extract-file', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, path: item.path }),
          });
          const json = await res.json();
          setAttachedFiles(prev => [...prev, { name, content: json.text || '[empty]' }]);
          return;
        } catch {}
      }
    }
    setAttachedFiles(prev => [...prev, { name: name + (item.type === 'folder' ? '/' : ''), type: item.type, path: item.path }]);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!chatInput.trim() || chatBusy) return;
    const userMsg = chatInput.trim();
    const prompt = userMsg;
    setChatInput('');
    setChatBusy(true);
    setAttachedFiles([]);
    pushChat(prev => [...prev, { role: 'user', content: userMsg }, { role: 'assistant', content: '' }]);

    const controller = new AbortController();
    chatAbortRef.current = controller;

    if (workflowMode === 'estimate') {
      pushChat(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: '⟳ Pulling in job data and pricing — this takes a moment...' };
        return next;
      });
    } else if (workflowMode === 'ops') {
      pushChat(prev => {
        const next = [...prev];
        next[next.length - 1] = { role: 'assistant', content: '⟳ Maverick OPS is working on it...' };
        return next;
      });
    }

    let accum = '';
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt, mode: workflowMode, history: chatHistory, attachments: attachedFiles }),
        signal: controller.signal
      });
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') continue;
          try {
            const tok = JSON.parse(raw);
            const delta = tok.choices?.[0]?.delta?.content || '';
            if (delta) {
              accum += delta;
              pushChat(prev => {
                const next = [...prev];
                next[next.length - 1] = { role: 'assistant', content: accum };
                return next;
              });
            }
          } catch {}
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        pushChat(prev => {
          const next = [...prev];
          next[next.length - 1] = { role: 'assistant', content: `[Error: ${err.message}]` };
          return next;
        });
      }
    } finally {
      setChatBusy(false);
      chatAbortRef.current = null;
      setAttachedFiles([]);
    }
  }

  const activeMode = WORKFLOW_MODES.find(m => m.id === workflowMode) || WORKFLOW_MODES[0];

  return (
    <div className="assistantShell">
      {/* ── Header ── */}
      <header className="assistantHeader">
        <MaverickLogo />
        <div className="assistantHeaderBadge">
          <span className="modeBadgeDot" data-accent={activeMode.accent} />
          <span className="modeBadgeLabel">{activeMode.label}</span>
        </div>
      </header>

      {/* ── Messages ── */}
      <div className="assistantMessages" ref={historyRef}>
        {chatHistory.length === 0 ? (
          <div className="assistantEmpty">
            <div className="assistantEmptyIcon">◈</div>
            <div className="assistantEmptyTitle">MAVERICK ASSISTANT READY</div>
            <div className="assistantEmptyHint">Select a mode below and send your first message.</div>
          </div>
        ) : chatHistory.map((msg, i) => {
          const isLastAssistant = msg.role === 'assistant' && i === chatHistory.length - 1;
          return (
            <div key={i} className={`chatMsg ${msg.role}`}>
              <span className="chatRole">{msg.role === 'user' ? 'CMD' : 'MAV'}</span>
              <span className="chatText">
                <MavMarkdown content={msg.content || (chatBusy && isLastAssistant ? '▋' : '')} />
              </span>
              {msg.role === 'assistant' && msg.content && !chatBusy && (
                <button
                  className="copyBtn"
                  title="Copy"
                  onClick={() => navigator.clipboard.writeText(msg.content)}
                >⧉</button>
              )}
            </div>
          );
        })}
      </div>


      {/* ── Controls ── */}
      <div className="assistantControls">
        {/* Mode buttons */}
        <div className="workflowStrip">
          {WORKFLOW_MODES.map(mode => (
            <button
              key={mode.id}
              type="button"
              disabled={chatBusy}
              onClick={() => setWorkflowMode(mode.id)}
              className={`workflowBtn${workflowMode === mode.id ? ` active ${mode.accent}` : ''}`}
              data-tooltip={mode.tooltip}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Attached file chips */}
        {attachedFiles.length > 0 && (
          <div className="attachChips">
            {attachedFiles.map((f, i) => (
              <span key={i} className={`attachChip${f.type === 'folder' ? ' folderChip' : ''}${f.type === 'image' ? ' imageChip' : ''}`}>
                {f.type === 'image' && f.data && (
                  <img src={`data:${f.mimeType};base64,${f.data}`} className="attachChipThumb" alt={f.name} />
                )}
                <span className="attachChipLabel" title={f.path || f.name}>
                  {f.type === 'folder' ? '📁 ' : ''}{f.name.split(/[\\/]/).filter(Boolean).pop() || f.name}{f.type === 'folder' ? '/' : ''}
                </span>
                <button type="button" className="attachChipRemove" onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Input form */}
        <form className="assistantForm" onSubmit={handleSubmit}>
          <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.jpg,.jpeg,.png,.gif,.webp" style={{ display: 'none' }} onChange={handleFilePick} />
          <textarea
            className="assistantInput"
            value={chatInput}
            onChange={e => setChatInput(e.target.value)}
            placeholder={chatBusy ? 'Maverick is responding...' : 'Enter command or ask Maverick... (Shift+Enter for new line)'}
            disabled={chatBusy}
            rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); } }}
          />
          <div className="assistantActions">
            <button type="button" className="attachBtn" onClick={() => fileInputRef.current?.click()} title="Attach files or images">⊕ FILES</button>
            <button type="button" className="attachBtn" onClick={() => setShowFolderPicker(true)} title="Attach folder by path">⊕ FOLDER</button>
            <button
              type="button"
              className={`micBtn${isListening ? ' active' : ''}`}
              onClick={toggleVoice}
              title={isListening ? 'Stop recording' : 'Voice input'}
              disabled={chatBusy}
            >{isListening ? '⏹' : '🎤'}</button>
            <div className="assistantActionsSpacer" />
            {chatBusy
              ? <button type="button" className="stopBtn" onClick={() => chatAbortRef.current?.abort()}>[ STOP ]</button>
              : <button type="submit" className="sendBtn" disabled={!chatInput.trim()}>SEND</button>
            }
            {chatHistory.length > 0 && !chatBusy && (
              <button type="button" className="clearChatBtn" onClick={() => {
                const label = prompt('Save this job as:', '') ?? '';
                if (label !== null) saveJob(Date.now().toString(), label, chatHistory);
                pushChat([]);
                setAttachedFiles([]);
              }}>CLR</button>
            )}
            <button type="button" className="jobHistoryBtn" onClick={() => setShowJobHistory(v => !v)} title="Job history">📋</button>
          </div>
        </form>
      </div>

      {showFolderPicker && (
        <FolderPickerModal onSelect={handleFolderSelect} onClose={() => setShowFolderPicker(false)} />
      )}
      {showJobHistory && (
        <JobHistoryPanel
          onLoad={id => { pushChat(loadJob(id)); setAttachedFiles([]); }}
          onClose={() => setShowJobHistory(false)}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
