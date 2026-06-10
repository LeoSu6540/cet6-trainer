console.log('[CET6 app.js loaded]', 'home-card-click-fix-v1');
'use strict';

const appEl = document.getElementById('app');
const statsEl = document.getElementById('stats');

let words = [];
let wordsById = new Map();
let state = null;
let dataPath = '';
let currentView = 'home';
let activeSession = null;
let autoTimer = null;
let selectedVeryUnfamiliarListBatch = 'all';
let selectedUnfamiliarListBatch = 'all';
let pendingUnfamiliarPageFocus = '';
let articles = [];
let currentArticleIndex = 0;
let articleVocabPanelOpen = false;
let articleVocabSortByForget = false;

const LETTERS = ['A', 'B', 'C', 'D'];
const BATCH_SIZE = 100;

function chunkArray(array, size) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}

function getTrainingSourceItems(source) {
  if (source === 'wrong') return getWrongItemsSorted();
  if (source === 'unfamiliar') return getUnfamiliarItemsSorted();
  if (source === 'veryUnfamiliar') return getVeryUnfamiliarItemsSorted();
  return [];
}

function getTrainingSourceTitle(source) {
  if (source === 'wrong') return '错题本';
  if (source === 'unfamiliar') return '陌生词汇';
  if (source === 'veryUnfamiliar') return '更陌生词汇';
  return '训练';
}

function getUnfamiliarBaseBatches() {
  const items = getUnfamiliarItemsSorted();
  return chunkArray(items, BATCH_SIZE);
}

function getVeryUnfamiliarBatchesByUnfamiliarBatch() {
  const unfamiliarBatches = getUnfamiliarBaseBatches();
  const veryIdSet = new Set(getVeryUnfamiliarIds().map(Number));
  return unfamiliarBatches.map((batchItems, index) => {
    const veryItemsInBatch = batchItems.filter(item => veryIdSet.has(Number(item.id)));
    return { batchIndex: index, sourceBatchSize: batchItems.length, items: veryItemsInBatch };
  });
}

function findNextNonEmptyVeryUnfamiliarBatchIndex(currentIndex, direction) {
  const batches = getVeryUnfamiliarBatchesByUnfamiliarBatch();
  const total = batches.length;
  if (!total) return -1;
  for (let step = 1; step <= total; step++) {
    const nextIndex = direction === 'prev'
      ? (currentIndex - step + total) % total
      : (currentIndex + step) % total;
    if (batches[nextIndex] && batches[nextIndex].items.length > 0) return nextIndex;
  }
  return -1;
}

function getUnfamiliarBatchIndexForWord(wordId) {
  const batches = getUnfamiliarBaseBatches();
  for (let i = 0; i < batches.length; i++) {
    if (batches[i].some(item => Number(item.id) === Number(wordId))) return i;
  }
  return -1;
}

function getNonEmptyVeryUnfamiliarBatchGroups() {
  return getVeryUnfamiliarBatchesByUnfamiliarBatch().filter(group => group.items.length > 0);
}

function normalizeSelectedVeryUnfamiliarListBatch() {
  if (selectedVeryUnfamiliarListBatch === 'all') return 'all';
  const groups = getNonEmptyVeryUnfamiliarBatchGroups();
  const selectedIndex = Number(selectedVeryUnfamiliarListBatch);
  const exists = groups.some(group => Number(group.batchIndex) === selectedIndex);
  if (!exists) { selectedVeryUnfamiliarListBatch = 'all'; return 'all'; }
  return selectedIndex;
}

function getSelectedVeryUnfamiliarItemsForList() {
  const selected = normalizeSelectedVeryUnfamiliarListBatch();
  if (selected === 'all') return getVeryUnfamiliarItemsSorted();
  const groups = getNonEmptyVeryUnfamiliarBatchGroups();
  const group = groups.find(item => Number(item.batchIndex) === Number(selected));
  return group ? group.items : [];
}

function getSelectedVeryUnfamiliarBatchLabel() {
  const selected = normalizeSelectedVeryUnfamiliarListBatch();
  if (selected === 'all') return '全部批次';
  return `第 ${Number(selected) + 1} 批`;
}

function getUnfamiliarListBatchGroups() {
  const items = getUnfamiliarItemsSorted();
  return chunkArray(items, BATCH_SIZE).map((batchItems, index) => ({ batchIndex: index, items: batchItems }));
}

function normalizeSelectedUnfamiliarListBatch() {
  const groups = getUnfamiliarListBatchGroups();
  if (selectedUnfamiliarListBatch === 'all') return 'all';
  const idx = Number(selectedUnfamiliarListBatch);
  if (!groups.some(g => Number(g.batchIndex) === idx)) { selectedUnfamiliarListBatch = 'all'; return 'all'; }
  return idx;
}

function getSelectedUnfamiliarItemsForList() {
  const sel = normalizeSelectedUnfamiliarListBatch();
  if (sel === 'all') return getUnfamiliarItemsSorted();
  const g = getUnfamiliarListBatchGroups().find(x => Number(x.batchIndex) === Number(sel));
  return g ? g.items : [];
}

function getSelectedUnfamiliarBatchLabel() {
  const sel = normalizeSelectedUnfamiliarListBatch();
  if (sel === 'all') return '全部批次';
  return `第 ${Number(sel) + 1} 批`;
}

function getUnfamiliarListBatchIndexForWord(wordId) {
  const groups = getUnfamiliarListBatchGroups();
  for (const g of groups) {
    if (g.items.some(item => Number(item.id) === Number(wordId))) return g.batchIndex;
  }
  return -1;
}

function renderUnfamiliarBatchSelector() {
  const groups = getUnfamiliarListBatchGroups();
  const totalCount = getUnfamiliarItemsSorted().length;
  const selected = normalizeSelectedUnfamiliarListBatch();
  if (!totalCount) return `<div class="empty">目前还没有陌生词。进入单词挑战后，点击"不熟悉"即可记录到这里。</div>`;
  const buttons = [
    `<button type="button" class="batch-filter-btn${selected === 'all' ? ' active' : ''}" data-action="select-unfamiliar-list-batch" data-batch="all">全部批次 <span>${totalCount}</span></button>`
  ];
  for (const group of groups) {
    const isActive = Number(selected) === Number(group.batchIndex) ? ' active' : '';
    buttons.push(`<button type="button" class="batch-filter-btn${isActive}" data-action="select-unfamiliar-list-batch" data-batch="${group.batchIndex}">第 ${group.batchIndex + 1} 批 <span>${group.items.length}</span></button>`);
  }
  return `
    <div class="batch-filter-panel">
      <div class="batch-filter-title">选择要查看 / 导出的陌生词批次</div>
      <div class="batch-filter-buttons">${buttons.join('')}</div>
      <div class="batch-filter-note">陌生词批次按照"陌生词汇训练"的 100 词批次计算；不足 100 个也作为一个批次。</div>
    </div>
  `;
}

function focusUnfamiliarPageSection(sectionId) {
  if (!sectionId) return;
  requestAnimationFrame(() => {
    const section = document.getElementById(`section-${sectionId}`);
    if (section) section.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

async function exportUnfamiliarDocx() {
  const selItems = getSelectedUnfamiliarItemsForList();
  const selLabel = getSelectedUnfamiliarBatchLabel();
  const items = selItems.map(item => {
    const bi = getUnfamiliarListBatchIndexForWord(item.id);
    return {
      id: item.id, word: item.word, phonetic: item.phonetic || '',
      definition: item.definition, star: !!item.star,
      markedAt: state.unfamiliar?.markedAt?.[String(item.id)] || '',
      batchLabel: bi >= 0 ? `第 ${bi + 1} 批` : '未知', exportScope: selLabel
    };
  });
  await downloadDocx('unfamiliar', items);
}

function getBatchesForSource(source) {
  if (source === 'veryUnfamiliar') {
    return getVeryUnfamiliarBatchesByUnfamiliarBatch().map(batch => batch.items);
  }
  const items = getTrainingSourceItems(source);
  return chunkArray(items, BATCH_SIZE);
}

function ensureBatchTrainingState() {
  if (!state.batchTraining) state.batchTraining = {};
  for (const source of ['wrong', 'unfamiliar', 'veryUnfamiliar']) {
    if (!state.batchTraining[source]) state.batchTraining[source] = {};
    for (const mode of ['sequential', 'random']) {
      if (!state.batchTraining[source][mode]) {
        state.batchTraining[source][mode] = {
          batchIndex: 0, queue: [], position: 0, history: []
        };
      }
      const bucket = state.batchTraining[source][mode];
      if (!Number.isInteger(bucket.batchIndex) || bucket.batchIndex < 0) bucket.batchIndex = 0;
      if (!Array.isArray(bucket.queue)) bucket.queue = [];
      if (!Number.isInteger(bucket.position) || bucket.position < 0) bucket.position = 0;
      if (!Array.isArray(bucket.history)) bucket.history = [];
    }
  }
}

function getBatchInfo(source, mode) {
  ensureBatchTrainingState();
  const batches = getBatchesForSource(source);
  const bucket = state.batchTraining[source][mode];
  if (!batches.length) {
    bucket.batchIndex = 0;
    bucket.queue = [];
    bucket.position = 0;
    bucket.history = [];
    return { batches, batchIndex: 0, batchItems: [], bucket };
  }
  if (!Number.isInteger(bucket.batchIndex) || bucket.batchIndex < 0) bucket.batchIndex = 0;
  if (bucket.batchIndex >= batches.length) bucket.batchIndex = 0;
  if (source === 'veryUnfamiliar' && (!batches[bucket.batchIndex] || !batches[bucket.batchIndex].length)) {
    const nextNonEmpty = findNextNonEmptyVeryUnfamiliarBatchIndex(bucket.batchIndex, 'next');
    if (nextNonEmpty >= 0) bucket.batchIndex = nextNonEmpty;
  }
  const batchItems = batches[bucket.batchIndex] || [];
  return { batches, batchIndex: bucket.batchIndex, batchItems, bucket };
}

function isBatchSession(session = activeSession) {
  return !!(session && session.mode && session.mode.startsWith('batch-'));
}

function renderBatchTopControls() {
  if (!isBatchSession(activeSession)) return '';
  const source = activeSession.source;
  const mode = activeSession.trainMode;
  const info = getBatchInfo(source, mode);
  const totalBatches = info.batches.length;
  if (!totalBatches || totalBatches <= 1) return '';
  return `
    <div class="batch-top-controls">
      <button type="button" class="btn batch-switch-btn" data-action="prev-batch">上一批次</button>
      <button type="button" class="btn batch-switch-btn primary-lite" data-action="next-batch">下一批次</button>
    </div>
  `;
}

function getCurrentBatchQuestionBadge() {
  if (!isBatchSession(activeSession)) return '';
  const source = activeSession.source;
  const mode = activeSession.trainMode;
  if (!source || !mode) return '';
  ensureBatchTrainingState();
  const info = getBatchInfo(source, mode);
  const bucket = state.batchTraining?.[source]?.[mode];
  if (!bucket || !Array.isArray(bucket.queue) || !bucket.queue.length) return '';
  const currentItem = activeSession.items?.[activeSession.cursor];
  const currentWordId = Number(currentItem?.wordId);
  const total = info.batchItems.length || bucket.queue.length || 0;
  if (!total) return '';
  let indexInBatch = -1;
  if (Number.isFinite(currentWordId)) {
    indexInBatch = bucket.queue.findIndex(id => Number(id) === currentWordId);
  }
  let displayIndex = indexInBatch >= 0 ? indexInBatch + 1 : activeSession.cursor + 1;
  if (!Number.isFinite(displayIndex) || displayIndex < 1) displayIndex = 1;
  if (displayIndex > total) displayIndex = total;
  return `${displayIndex} / ${total}`;
}

function renderVeryUnfamiliarBatchSelector() {
  const groups = getNonEmptyVeryUnfamiliarBatchGroups();
  const totalCount = getVeryUnfamiliarItemsSorted().length;
  const selected = normalizeSelectedVeryUnfamiliarListBatch();
  if (!totalCount) return `<div class="empty">目前还没有更陌生词。进入陌生词训练后，点击"更陌生"即可记录到这里。</div>`;
  const buttons = [
    `<button type="button" class="batch-filter-btn${selected === 'all' ? ' active' : ''}" data-action="select-very-list-batch" data-batch="all">全部批次 <span>${totalCount}</span></button>`
  ];
  for (const group of groups) {
    const isActive = Number(selected) === Number(group.batchIndex) ? ' active' : '';
    buttons.push(`<button type="button" class="batch-filter-btn${isActive}" data-action="select-very-list-batch" data-batch="${group.batchIndex}">第 ${group.batchIndex + 1} 批 <span>${group.items.length}</span></button>`);
  }
  return `
    <div class="batch-filter-panel">
      <div class="batch-filter-title">选择要查看 / 导出的更陌生词批次</div>
      <div class="batch-filter-buttons">${buttons.join('')}</div>
      <div class="batch-filter-note">更陌生词的批次按照"陌生词汇训练"的 100 词批次归属计算。某批没有更陌生词时不会显示在这里。</div>
    </div>
  `;
}

function renderCurrentBatchQuestionBadge() {
  const badgeText = getCurrentBatchQuestionBadge();
  if (!badgeText) return '';
  return `
    <div class="word-card-batch-badge">
      ${escapeHtml(badgeText)}
    </div>
  `;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderPhonetic(word) {
  const phonetic = word && word.phonetic ? String(word.phonetic).trim() : '';
  if (!phonetic) return '';
  return `<span class="phonetic-text">${escapeHtml(phonetic)}</span>`;
}

function renderWordNameWithPhonetic(word) {
  if (!word) return '';
  return `
    <span class="word-with-phonetic">
      <span class="word-name">${escapeHtml(word.word)}</span>
      ${renderPhonetic(word)}
    </span>
  `;
}

function renderInlineWordWithPhonetic(word) {
  if (!word) return '';
  return `
    <span class="inline-word-with-phonetic">
      <span class="inline-word-name">${escapeHtml(word.word)}</span>
      ${renderPhonetic(word)}
    </span>
  `;
}

function nowISO() {
  return new Date().toISOString();
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function ensureSessionHistoryState() {
  if (!state.sessionHistory) {
    state.sessionHistory = { sessions: {} };
  }
  if (!state.sessionHistory.sessions || typeof state.sessionHistory.sessions !== 'object') {
    state.sessionHistory.sessions = {};
  }
}

function getSessionCacheKey(session = activeSession) {
  if (!session || !session.mode) return '';
  if (session.mode === 'main') return 'main';
  if (session.mode && session.mode.startsWith('batch-')) return session.mode;
  return session.mode;
}

function syncActiveSessionToState() {
  if (!activeSession) return;
  const key = getSessionCacheKey(activeSession);
  if (!key) return;
  ensureSessionHistoryState();
  state.sessionHistory.sessions[key] = {
    mode: activeSession.mode,
    source: activeSession.source || null,
    trainMode: activeSession.trainMode || null,
    title: activeSession.title || '',
    returnLabel: activeSession.returnLabel || '',
    items: Array.isArray(activeSession.items) ? activeSession.items : [],
    cursor: Number.isInteger(activeSession.cursor) ? activeSession.cursor : -1,
    updatedAt: nowISO()
  };
}

async function saveStateWithSession() {
  syncActiveSessionToState();
  await saveState();
}

function restoreSessionFromState(baseSession) {
  ensureSessionHistoryState();
  const key = getSessionCacheKey(baseSession);
  if (!key) return false;
  const cached = state.sessionHistory.sessions[key];
  if (!cached || !Array.isArray(cached.items) || !cached.items.length) return false;
  const validItems = cached.items.filter(item => {
    return item &&
      Number.isFinite(Number(item.wordId)) &&
      wordsById.has(Number(item.wordId)) &&
      Array.isArray(item.options);
  });
  if (!validItems.length) return false;
  let cursor = Number.isInteger(cached.cursor) ? cached.cursor : validItems.length - 1;
  if (cursor < 0) cursor = 0;
  if (cursor >= validItems.length) cursor = validItems.length - 1;
  activeSession = { ...baseSession, items: validItems, cursor };
  currentView = 'trainer';
  renderCurrentQuestion();
  return true;
}

function clearSessionCacheByKey(key) {
  ensureSessionHistoryState();
  if (state.sessionHistory.sessions[key]) {
    delete state.sessionHistory.sessions[key];
  }
}

async function apiGet(url) {
  const res = await fetch(url, { cache: 'no-store' });
  const payload = await res.json();
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `请求失败：${url}`);
  }
  return payload;
}

async function apiPost(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const payload = await res.json();
  if (!res.ok || payload.ok === false) {
    throw new Error(payload.error || `保存失败：${url}`);
  }
  return payload;
}

async function loadArticles() {
  const data = await fetchJsonFromCandidates(['./articles.json', '/articles.json']);
  if (Array.isArray(data)) { articles = data; return; }
  if (Array.isArray(window.CET6_ARTICLES)) articles = window.CET6_ARTICLES;
  else articles = [];
}


function createDefaultClientState() {
  return {
    version: 1,
    updatedAt: nowISO(),
    mainChallenge: { nextIndex: 0, round: 1, history: [] },
    wrongBook: { wrongCounts: {}, firstWrongAt: {} },
    wrongTraining: { sequential: { queue: [], position: 0, history: [] }, random: { queue: [], position: 0, history: [] } },
    unfamiliar: { ids: {}, markedAt: {} },
    unfamiliarTraining: { sequential: { queue: [], position: 0, history: [] }, random: { queue: [], position: 0, history: [] } },
    veryUnfamiliar: { ids: {}, markedAt: {} },
    veryUnfamiliarTraining: { sequential: { queue: [], position: 0, history: [] }, random: { queue: [], position: 0, history: [] } },
    batchTraining: {
      wrong: { sequential: { batchIndex: 0, queue: [], position: 0, history: [] }, random: { batchIndex: 0, queue: [], position: 0, history: [] } },
      unfamiliar: { sequential: { batchIndex: 0, queue: [], position: 0, history: [] }, random: { batchIndex: 0, queue: [], position: 0, history: [] } },
      veryUnfamiliar: { sequential: { batchIndex: 0, queue: [], position: 0, history: [] }, random: { batchIndex: 0, queue: [], position: 0, history: [] } }
    },
    sessionHistory: { sessions: {} },
    articleVocabForgetCounts: {}
  };
}

function normalizeClientState(src) {
  const base = createDefaultClientState();
  const input = src && typeof src === 'object' ? src : {};
  return Object.assign(base, input, {
    wrongBook: Object.assign(base.wrongBook, input.wrongBook || {}),
    unfamiliar: Object.assign(base.unfamiliar, input.unfamiliar || {}),
    veryUnfamiliar: Object.assign(base.veryUnfamiliar, input.veryUnfamiliar || {})
  });
}


// ---- IndexedDB 离线存储 ----
function openMobileDB() {
  return new Promise((resolve, reject) => {
    if (!window.indexedDB) return reject(new Error('IndexedDB not available'));
    const req = window.indexedDB.open('CET6TrainerPWA', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('kv', { keyPath: 'k' }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await openMobileDB();
    return new Promise((resolve) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result ? req.result.v : null);
      req.onerror = () => resolve(null);
    });
  } catch (_) { return null; }
}

async function idbSet(key, value) {
  try {
    const db = await openMobileDB();
    return new Promise((resolve) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put({ k: key, v: value });
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (_) {}
}

async function loadStateFromIndexedDB() {
  const saved = await idbGet('state');
  if (saved) return normalizeClientState(saved);
  const ls = localStorage.getItem('CET6_TRAINER_STATE_BACKUP');
  if (ls) { try { return normalizeClientState(JSON.parse(ls)); } catch (_) {} }
  return createDefaultClientState();
}

async function saveStateToIndexedDB(nextState) {
  const clean = normalizeClientState(nextState);
  clean.updatedAt = nowISO();
  await idbSet('state', clean);
  try { localStorage.setItem('CET6_TRAINER_STATE_BACKUP', JSON.stringify(clean)); } catch (_) {}
}

async function loadStateCompat() {
  state = await loadStateFromIndexedDB();
  dataPath = '(IndexedDB 离线存储)';
  try {
    const res = await fetch('/api/state?ts=' + Date.now());
    if (res.ok) {
      const payload = await res.json();
      state = payload.state;
      dataPath = payload.dataPath || '';
    }
  } catch (_) {}
}

async function saveStateCompat() {
  state.updatedAt = nowISO();
  try {
    const payload = await apiPost('/api/state', { state });
    state = payload.state;
    dataPath = payload.dataPath || dataPath;
  } catch (_) {
    await saveStateToIndexedDB(state);
  }
  updateStats();
}



async function saveStateLocalOnly() {
  await saveStateCompat();
}

async function saveState() {
  await saveStateLocalOnly();
  scheduleAutoSync();
}

// ---- Gist 云端自动同步 v2 ----
const GIST_STATE_FILE = 'cet6_state.json';
const GIST_API_BASE = 'https://api.github.com/gists';
const GIST_SYNC_DESCRIPTION = 'CET6_WORD_TRAINER_SYNC';
const LEGACY_GIST_SYNC_DESCRIPTIONS = ['CET6_WORD_TRAINER_SYNC','CET6 学习数据同步','CET6学习数据同步'];

let cloudSyncTimer = null;
let cloudSyncInFlight = false;
let cloudSyncQueued = false;

const cloudSyncState = {
  status: 'idle',
  message: '',
  lastSyncTime: localStorage.getItem('gist_last_sync_time') || '',
  lastError: localStorage.getItem('gist_last_error') || '',
  lastErrorCode: localStorage.getItem('gist_last_error_code') || ''
};

function getGistToken() {
  return localStorage.getItem('gist_token') || '';
}

function setGistToken(value) {
  const token = String(value || '').trim();
  if (token) localStorage.setItem('gist_token', token);
}

function clearGistToken() {
  localStorage.removeItem('gist_token');
}

function getGistId() {
  return localStorage.getItem('gist_id') || '';
}

function setGistId(value) {
  const id = String(value || '').trim();
  if (id) localStorage.setItem('gist_id', id);
  else localStorage.removeItem('gist_id');
}

function hasGistToken() {
  return !!getGistToken();
}

function hasGistConfig() {
  return !!getGistToken();
}

function getDeviceId() {
  let id = localStorage.getItem('cet6_device_id');
  if (!id) {
    if (window.crypto && crypto.randomUUID) {
      id = crypto.randomUUID();
    } else {
      id = 'device-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }
    localStorage.setItem('cet6_device_id', id);
  }
  return id;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

function setCloudSyncStatus(status, message) {
  cloudSyncState.status = status || 'idle';
  cloudSyncState.message = message || '';
}

function markCloudSyncSuccess(message) {
  const t = nowISO();
  cloudSyncState.status = 'synced';
  cloudSyncState.message = message || '已同步';
  cloudSyncState.lastSyncTime = t;
  cloudSyncState.lastError = '';
  cloudSyncState.lastErrorCode = '';
  localStorage.setItem('gist_last_sync_time', t);
  localStorage.removeItem('gist_last_error');
  localStorage.removeItem('gist_last_error_code');
}

function markCloudSyncError(error) {
  const msg = error && error.message ? error.message : String(error || '未知错误');
  const code = error && error.code ? String(error.code) : '';
  cloudSyncState.status = 'error';
  cloudSyncState.message = msg;
  cloudSyncState.lastError = msg;
  cloudSyncState.lastErrorCode = code;
  localStorage.setItem('gist_last_error', msg);
  if (code) localStorage.setItem('gist_last_error_code', code);
  else localStorage.removeItem('gist_last_error_code');
}

async function gistApi(method, path, body) {
  const token = getGistToken();
  if (!token) throw new Error('尚未配置 GitHub Token');

  const opts = {
    method,
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };

  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }

  const res = await fetch(GIST_API_BASE + path, opts);
  const text = await res.text();

  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); } catch (_) { payload = { message: text }; }
  }

  if (!res.ok) {
    const msg = payload && payload.message ? payload.message : res.statusText;
    throw new Error('GitHub Gist 请求失败 ' + res.status + '：' + msg);
  }

  return payload;
}

function hasGistStateFile(gist) {
  return !!(gist && gist.files && Object.prototype.hasOwnProperty.call(gist.files, GIST_STATE_FILE));
}

function isCet6SyncGist(gist) {
  if (!gist || !gist.files) return false;
  const hasStateFile = hasGistStateFile(gist);
  const desc = String(gist.description || '').trim();
  if (hasStateFile && desc === GIST_SYNC_DESCRIPTION) return true;
  if (hasStateFile && LEGACY_GIST_SYNC_DESCRIPTIONS.includes(desc)) return true;
  if (hasStateFile) return true;
  return false;
}

function pickBestSyncGist(gists) {
  const matches = (Array.isArray(gists) ? gists : []).filter(isCet6SyncGist);
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const ta = new Date(a.updated_at || a.created_at || 0).getTime();
    const tb = new Date(b.updated_at || b.created_at || 0).getTime();
    return tb - ta;
  });
  return matches[0];
}

async function listUserGists() {
  const all = [];
  for (let page = 1; page <= 5; page += 1) {
    const items = await gistApi('GET', '?per_page=100&page=' + page);
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function findExistingSyncGist() {
  const gists = await listUserGists();
  return pickBestSyncGist(gists);
}

async function createSyncGist() {
  const envelope = makeCloudEnvelope(state);
  const content = JSON.stringify(envelope, null, 2);
  const created = await gistApi('POST', '', {
    public: false,
    description: GIST_SYNC_DESCRIPTION,
    files: { [GIST_STATE_FILE]: { content } }
  });
  if (!created || !created.id) throw new Error('Gist 创建失败：没有返回 Gist ID');
  setGistId(created.id);
  return created;
}

async function ensureSyncGist() {
  const currentId = getGistId();
  if (currentId) {
    try {
      const existing = await gistApi('GET', '/' + encodeURIComponent(currentId));
      if (existing && existing.id && hasGistStateFile(existing)) return existing;
      setGistId('');
    } catch (_) { setGistId(''); }
  }
  const found = await findExistingSyncGist();
  if (found && found.id) { setGistId(found.id); return found; }
  return await createSyncGist();
}

function makeCloudEnvelope(nextState) {
  const cleanState = normalizeClientState(nextState);
  return {
    app: 'cet6-word-trainer',
    schemaVersion: 1,
    updatedAt: cleanState.updatedAt || nowISO(),
    deviceId: getDeviceId(),
    state: cleanState
  };
}

function normalizeCloudEnvelope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  if (raw.state) {
    return {
      app: raw.app || 'cet6-word-trainer',
      schemaVersion: raw.schemaVersion || 1,
      updatedAt: raw.updatedAt || raw.state.updatedAt || '',
      deviceId: raw.deviceId || '',
      state: normalizeClientState(raw.state)
    };
  }
  if (raw.mainChallenge || raw.wrongBook || raw.unfamiliar) {
    const s = normalizeClientState(raw);
    return { app: 'cet6-word-trainer', schemaVersion: 1, updatedAt: s.updatedAt || '', deviceId: '', state: s };
  }
  return null;
}

function isCloudJsonCorruptError() {
  const code = cloudSyncState.lastErrorCode || '';
  const msg = cloudSyncState.lastError || '';
  return code === 'REMOTE_JSON_CORRUPT' || msg.includes('不是合法 JSON') || msg.includes('Expected double-quoted property name') || msg.includes('Unexpected token') || msg.includes('JSON.parse');
}

async function repairCloudFromLocalState() {
  if (!hasGistToken()) { markCloudSyncError(new Error('请先填写并保存 GitHub Token。')); return false; }
  if (cloudSyncInFlight) { cloudSyncQueued = true; return false; }
  cloudSyncInFlight = true; cloudSyncQueued = false;
  setCloudSyncStatus('syncing', '正在用本地数据修复云端...');
  try {
    await ensureSyncGist();
    state = normalizeClientState(state);
    state.updatedAt = nowISO();
    await saveStateLocalOnly();
    const envelope = makeCloudEnvelope(state);
    await uploadCloudEnvelope(envelope);
    markCloudSyncSuccess('已用本地数据修复云端');
    return true;
  } catch (err) { markCloudSyncError(err); throw err; }
  finally { cloudSyncInFlight = false; if (cloudSyncQueued) { cloudSyncQueued = false; scheduleAutoSync(1200); } }
}

async function fetchRemoteEnvelope() {
  const gistId = getGistId();
  if (!gistId) return null;
  const gist = await gistApi('GET', '/' + encodeURIComponent(gistId));
  if (!gist || !gist.files || !gist.files[GIST_STATE_FILE]) return null;
  const file = gist.files[GIST_STATE_FILE];
  let content = file.content;
  if (!content && file.raw_url) {
    const res = await fetch(file.raw_url + '?ts=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('无法读取 Gist 原始文件内容');
    content = await res.text();
  }
  if (!content) return null;
  let parsed;
  try { parsed = JSON.parse(content); } catch (err) { const e = new Error('云端 cet6_state.json 不是合法 JSON：' + err.message); e.code = 'REMOTE_JSON_CORRUPT'; throw e; }
  return normalizeCloudEnvelope(parsed);
}

async function uploadCloudEnvelope(envelope) {
  const content = JSON.stringify(envelope, null, 2);
  const gistId = getGistId();
  if (gistId) {
    const updated = await gistApi('PATCH', '/' + encodeURIComponent(gistId), { files: { [GIST_STATE_FILE]: { content } } });
    if (!updated || !updated.id) throw new Error('Gist 更新失败：没有返回 Gist ID');
    return updated;
  }
  const created = await gistApi('POST', '', { public: false, description: GIST_SYNC_DESCRIPTION, files: { [GIST_STATE_FILE]: { content } } });
  if (!created || !created.id) throw new Error('Gist 创建失败：没有返回 Gist ID');
  setGistId(created.id);
  return created;
}

function mergeNumberMapMax(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(a||{}), ...Object.keys(b||{})])) {
    const n = Math.max(Number(a[key]||0), Number(b[key]||0));
    if (n > 0) out[key] = n;
  }
  return out;
}

function mergeFlagMapUnion(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(a||{}), ...Object.keys(b||{})])) {
    if (a[key] || b[key]) out[key] = true;
  }
  return out;
}

function mergeDateMapEarliest(a, b) {
  const out = {};
  for (const key of new Set([...Object.keys(a||{}), ...Object.keys(b||{})])) {
    const v1 = a[key], v2 = b[key];
    if (v1 && v2) out[key] = String(v1) <= String(v2) ? v1 : v2;
    else if (v1) out[key] = v1;
    else if (v2) out[key] = v2;
  }
  return out;
}

function mainProgressScore(main) {
  const total = words && words.length ? words.length : 1602;
  const round = Math.max(1, Number(main && main.round) || 1);
  const nextIndex = Math.max(0, Math.min(total, Number(main && main.nextIndex) || 0));
  return (round - 1) * total + nextIndex;
}

function chooseMoreAdvancedMain(localMain, remoteMain) {
  return deepClone(mainProgressScore(remoteMain) > mainProgressScore(localMain) ? remoteMain : localMain);
}

function mergeHistoryArray(a, b, limit) {
  const out = [];
  const seen = new Set();
  for (const item of [...(a||[]), ...(b||[])]) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key); out.push(item);
  }
  return out.slice(Math.max(0, out.length - (Number(limit)||300)));
}

function mergeClientStates(localState, remoteState) {
  const local = normalizeClientState(localState);
  const remote = normalizeClientState(remoteState);
  const localTime = String(local.updatedAt || '');
  const remoteTime = String(remote.updatedAt || '');
  const newer = localTime >= remoteTime ? local : remote;
  const older = localTime >= remoteTime ? remote : local;
  const merged = normalizeClientState(deepClone(newer));

  merged.mainChallenge = chooseMoreAdvancedMain(local.mainChallenge, remote.mainChallenge);
  merged.mainChallenge.history = mergeHistoryArray(
    local.mainChallenge && local.mainChallenge.history,
    remote.mainChallenge && remote.mainChallenge.history, 300
  );

  merged.wrongBook = {
    wrongCounts: mergeNumberMapMax(local.wrongBook&&local.wrongBook.wrongCounts, remote.wrongBook&&remote.wrongBook.wrongCounts),
    firstWrongAt: mergeDateMapEarliest(local.wrongBook&&local.wrongBook.firstWrongAt, remote.wrongBook&&remote.wrongBook.firstWrongAt)
  };
  merged.unfamiliar = {
    ids: mergeFlagMapUnion(local.unfamiliar&&local.unfamiliar.ids, remote.unfamiliar&&remote.unfamiliar.ids),
    markedAt: mergeDateMapEarliest(local.unfamiliar&&local.unfamiliar.markedAt, remote.unfamiliar&&remote.unfamiliar.markedAt)
  };
  merged.veryUnfamiliar = {
    ids: mergeFlagMapUnion(local.veryUnfamiliar&&local.veryUnfamiliar.ids, remote.veryUnfamiliar&&remote.veryUnfamiliar.ids),
    markedAt: mergeDateMapEarliest(local.veryUnfamiliar&&local.veryUnfamiliar.markedAt, remote.veryUnfamiliar&&remote.veryUnfamiliar.markedAt)
  };
  merged.articleVocabForgetCounts = mergeNumberMapMax(local.articleVocabForgetCounts, remote.articleVocabForgetCounts);
  merged.sessionHistory = { sessions: Object.assign({}, (older.sessionHistory&&older.sessionHistory.sessions)||{}, (newer.sessionHistory&&newer.sessionHistory.sessions)||{}) };
  merged.wrongTraining = deepClone(newer.wrongTraining || merged.wrongTraining);
  merged.unfamiliarTraining = deepClone(newer.unfamiliarTraining || merged.unfamiliarTraining);
  merged.veryUnfamiliarTraining = deepClone(newer.veryUnfamiliarTraining || merged.veryUnfamiliarTraining);
  merged.batchTraining = deepClone(newer.batchTraining || merged.batchTraining);
  merged.updatedAt = nowISO();
  return normalizeClientState(merged);
}

function scheduleAutoSync(delayMs = 3500) {
  if (!hasGistConfig()) return;
  clearTimeout(cloudSyncTimer);
  cloudSyncTimer = setTimeout(() => { syncNow({ manual: false }).catch(() => {}); }, delayMs);
}

async function syncNow(options = {}) {
  const manual = !!options.manual;
  if (!hasGistToken()) {
    if (manual) alert('请先填写并保存 GitHub Token。');
    return false;
  }
  if (cloudSyncInFlight) { cloudSyncQueued = true; return false; }
  cloudSyncInFlight = true;
  cloudSyncQueued = false;
  setCloudSyncStatus('syncing', '同步中...');
  try {
    await ensureSyncGist();
    const remoteEnvelope = await fetchRemoteEnvelope();
    let mergedState = normalizeClientState(state);
    if (remoteEnvelope && remoteEnvelope.state) {
      mergedState = mergeClientStates(state, remoteEnvelope.state);
    }
    state = normalizeClientState(mergedState);
    await saveStateLocalOnly();
    const envelope = makeCloudEnvelope(state);
    await uploadCloudEnvelope(envelope);
    markCloudSyncSuccess(remoteEnvelope ? '已合并并同步' : '已上传并同步');
    if (manual) alert('云同步完成。');
    return true;
  } catch (err) {
    markCloudSyncError(err);

    throw err;
  } finally {
    cloudSyncInFlight = false;
    if (cloudSyncQueued) { cloudSyncQueued = false; scheduleAutoSync(1200); }
  }
}

async function pullFromGist() {
  return syncNow({ manual: true });
}

function renderCloudSyncPanel() {
  const tokenReady = hasGistToken();
  const gistId = getGistId();
  const last = cloudSyncState.lastSyncTime ? new Date(cloudSyncState.lastSyncTime).toLocaleString() : '尚未同步';
  const statusText = cloudSyncState.status === 'syncing' ? '同步中' : cloudSyncState.status === 'error' ? '同步失败' : tokenReady ? '云同步已开启' : '未开启云同步';
  const statusClass = cloudSyncState.status === 'error' ? 'error' : cloudSyncState.status === 'syncing' ? 'syncing' : tokenReady ? 'ok' : 'idle';
  const canRepairCloud = tokenReady && isCloudJsonCorruptError();
  const errorBlock = cloudSyncState.lastError ? '<details class=\"sync-error-details\"><summary>查看错误详情</summary><pre>' + escapeHtml(cloudSyncState.lastError) + '</pre></details>' + (canRepairCloud ? '<div class=\"sync-repair-box\"><p class=\"small-note\">云端同步文件已损坏。确认当前本地学习数据是正确版本后，可以用本地数据覆盖修复云端。</p><button class=\"btn warn\" data-action=\"repair-cloud-from-local\">用本地数据修复云端</button></div>' : '') : '';
  const setupBlock = tokenReady
    ? '<details class=\"sync-settings\"><summary>同步设置</summary><div class=\"sync-settings-body\"><p class=\"small-note\">GitHub Token 已保存。留空表示不修改，重新输入可替换当前 Token。</p><p><input type=\"password\" id=\"gist-token-input\" placeholder=\"重新粘贴 GitHub Token\" class=\"sync-token-input\"></p><div class=\"actions compact-actions\"><button class=\"btn\" data-action=\"save-gist-config\">重新连接并同步</button><button class=\"btn warn\" data-action=\"clear-gist-config\">清除云同步配置</button></div><details class=\"sync-advanced\"><summary>高级信息</summary><p class=\"small-note\">Gist ID：' + escapeHtml(gistId || '尚未绑定，首次同步时自动查找或创建') + '</p><button class=\"btn\" data-action=\"copy-gist-id\">复制 Gist ID</button></details></div></details>'
    : '<div class=\"sync-setup\"><p class=\"small-note\">填写 GitHub Token 后，系统会自动查找已有同步 Gist；如果没有找到，会自动创建 private Gist。</p><div class=\"sync-setup-row\"><input type=\"password\" id=\"gist-token-input\" placeholder=\"粘贴 GitHub Token\" class=\"sync-token-input\"><button class=\"btn primary\" data-action=\"save-gist-config\">连接并同步 GitHub</button></div></div>';
  return '<section class=\"sync-card ' + statusClass + '\"><div class=\"sync-main-row\"><div class=\"sync-title\"><span class=\"sync-dot\"></span><div><h2>云端自动同步</h2><p>' + escapeHtml(statusText) + ' · 上次同步：' + escapeHtml(last) + '</p></div></div><div class=\"sync-actions\"><button class=\"btn\" data-action=\"sync-now\">立即同步</button></div></div>' + errorBlock + setupBlock + '</section>';
}

function renderSyncStatus() {
  return renderCloudSyncPanel();
}
// ---- 同步结束 ----


function getWrongIds() {
  return Object.entries(state.wrongBook.wrongCounts || {})
    .filter(([, count]) => Number(count) > 0)
    .map(([id]) => Number(id))
    .filter(id => wordsById.has(id));
}

function getWrongItemsSorted() {
  const ids = getWrongIds();
  return ids
    .map(id => wordsById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function getTotalWrongTimes() {
  return Object.values(state?.wrongBook?.wrongCounts || {})
    .reduce((sum, count) => sum + (Number(count) || 0), 0);
}

function getUnfamiliarIds() {
  return Object.keys(state.unfamiliar?.ids || {})
    .map(Number)
    .filter(id => wordsById.has(id));
}

function getUnfamiliarItemsSorted() {
  return getUnfamiliarIds()
    .map(id => wordsById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function isUnfamiliar(wordId) {
  return !!(state.unfamiliar && state.unfamiliar.ids && state.unfamiliar.ids[String(wordId)]);
}

async function markUnfamiliar(wordId) {
  if (!state.unfamiliar) {
    state.unfamiliar = { ids: {}, markedAt: {} };
  }
  if (!state.unfamiliar.ids) state.unfamiliar.ids = {};
  if (!state.unfamiliar.markedAt) state.unfamiliar.markedAt = {};

  const key = String(wordId);

  if (!state.unfamiliar.ids[key]) {
    state.unfamiliar.ids[key] = true;
    state.unfamiliar.markedAt[key] = nowISO();
    await saveState();
  }

  if (activeSession) {
    renderCurrentQuestion();
  } else {
    renderHome();
  }
}

function getVeryUnfamiliarIds() {
  return Object.keys(state.veryUnfamiliar?.ids || {})
    .map(Number)
    .filter(id => wordsById.has(id));
}

function getVeryUnfamiliarItemsSorted() {
  return getVeryUnfamiliarIds()
    .map(id => wordsById.get(id))
    .filter(Boolean)
    .sort((a, b) => a.id - b.id);
}

function isVeryUnfamiliar(wordId) {
  return !!(state.veryUnfamiliar && state.veryUnfamiliar.ids && state.veryUnfamiliar.ids[String(wordId)]);
}

async function markVeryUnfamiliar(wordId) {
  if (!state.veryUnfamiliar) {
    state.veryUnfamiliar = { ids: {}, markedAt: {} };
  }
  if (!state.veryUnfamiliar.ids) state.veryUnfamiliar.ids = {};
  if (!state.veryUnfamiliar.markedAt) state.veryUnfamiliar.markedAt = {};

  const key = String(wordId);

  if (!state.veryUnfamiliar.ids[key]) {
    state.veryUnfamiliar.ids[key] = true;
    state.veryUnfamiliar.markedAt[key] = nowISO();
    await saveState();
  }

  if (activeSession) {
    renderCurrentQuestion();
  } else {
    renderUnfamiliarPage();
  }
}

function updateStats() {
  if (!words.length || !state) {
    statsEl.textContent = '加载中...';
    return;
  }
  const wrongCount = getWrongIds().length;
  const wrongTimes = getTotalWrongTimes();
  const unfamiliarCount = getUnfamiliarIds().length;
  const veryUnfamiliarCount = getVeryUnfamiliarIds().length;
  const nextIndex = clampNumber(state.mainChallenge.nextIndex, 0, words.length, 0);
  const current = nextIndex >= words.length ? words.length : nextIndex;
  statsEl.textContent = `词条 ${words.length} · 错题 ${wrongCount} · 陌生 ${unfamiliarCount} · 更陌生 ${veryUnfamiliarCount} · 错误次数 ${wrongTimes} · 进度 ${current} / ${words.length}`;
}

function setApp(html) {
  appEl.innerHTML = html;
}

function renderHome() {
  currentView = 'home';
  activeSession = null;
  clearTimeout(autoTimer);
  updateStats();
  const nextIndex = clampNumber(state.mainChallenge.nextIndex, 0, words.length, 0);
  const progress = nextIndex >= words.length ? words.length : nextIndex;
  const total = words.length || 1602;
  const wrongCount = getWrongIds().length;
  const wrongTimes = getTotalWrongTimes();
  const unfamiliarCount = getUnfamiliarIds().length;
  const articleBatchCount = Array.isArray(articles) ? articles.length : 0;

  function bindHomeCardClickFallback() {
    const cards = document.querySelectorAll('.home-card[data-action]');
    console.log('[CET6 bind home cards]', cards.length);
    cards.forEach(card => {
      card.addEventListener('click', event => {
        const action = card.dataset.action;
        console.log('[CET6 direct card click]', action);
        if (handleHomeEntryAction(action)) {
          event.preventDefault();
          event.stopPropagation();
        }
      });
    });
  }

  setApp(`
    <section class="home-stats">
      <div class="stat-chip"><span>词条</span><strong>${total}</strong></div>
      <div class="stat-chip danger"><span>错题</span><strong>${wrongCount}</strong></div>
      <div class="stat-chip success"><span>陌生词</span><strong>${unfamiliarCount}</strong></div>
      <div class="stat-chip muted"><span>错误次数</span><strong>${wrongTimes}</strong></div>
    </section>

    <main class="home-panel">
      <section class="home-grid two-col">
        <button type="button" class="home-card primary-card" data-action="start-main">
          <div class="card-icon">START</div>
          <h2>进入单词挑战</h2>
          <p>按原始词表顺序训练，每个词在一轮内只出现一次。</p>
          <div class="mini-progress"><span>当前进度</span><strong>${progress} / ${total}</strong></div>
        </button>

        <button type="button" class="home-card" data-action="wrong-book">
          <div class="card-icon">ERR</div>
          <h2>错题本训练</h2>
          <p>集中复习答错的词，按错误次数掌握薄弱点。</p>
          <div class="mini-progress danger"><span>错题</span><strong>${wrongCount} 个</strong></div>
        </button>

        <button type="button" class="home-card" data-action="unfamiliar-page">
          <div class="card-icon">NEW</div>
          <h2>陌生词训练</h2>
          <p>复习你主动标记"不熟悉"的单词。</p>
          <div class="mini-progress success"><span>陌生</span><strong>${unfamiliarCount} 个</strong></div>
        </button>

        <button type="button" class="home-card" data-action="article-reading">
          <div class="card-icon">ART</div>
          <h2>文章阅读</h2>
          <p>在文章语境中复习词义，点击加粗词查看中文意思。</p>
          <div class="mini-progress success"><span>文章</span><strong>${articleBatchCount} 批</strong></div>
        </button>
      </section>

      ${renderSyncStatus()}

      <details class="data-manage">
        <summary>数据管理</summary>
        <div class="data-manage-body">
          <p class="small-note">本地数据文件：${escapeHtml(dataPath || '尚未读取')}</p>
          <p class="small-note">学习数据会自动保存到本地；云同步开启后会自动同步到 GitHub Gist。</p>
          <div class="actions compact-actions">
            <button class="btn warn" data-action="reset-main">重置挑战进度</button>
          </div>
        </div>
      </details>
    </main>
  `);
}
function startMainChallenge() {
  if (!words.length) return;
  const baseSession = {
    mode: 'main',
    title: '单词挑战',
    returnLabel: '返回首页',
    items: [],
    cursor: -1
  };
  if (restoreSessionFromState(baseSession)) return;
  currentView = 'trainer';
  activeSession = baseSession;
  showNextQuestion();
}

function prepareWrongQueue(mode) {
  const wrongIdsSorted = getWrongItemsSorted().map(item => item.id);
  const bucket = state.wrongTraining[mode];
  const existingSorted = (bucket.queue || []).slice().sort((a, b) => a - b);
  const sameSet = existingSorted.length === wrongIdsSorted.length && existingSorted.every((id, i) => id === wrongIdsSorted[i]);

  if (!wrongIdsSorted.length) {
    bucket.queue = [];
    bucket.position = 0;
    bucket.history = [];
    return;
  }

  if (!sameSet || !Array.isArray(bucket.queue) || bucket.position >= bucket.queue.length) {
    bucket.queue = mode === 'random' ? shuffle(wrongIdsSorted) : wrongIdsSorted.slice();
    bucket.position = 0;
    bucket.history = [];
  }
}

function startWrongTraining(mode) {
  startBatchTraining('wrong', mode);
}

function ensureUnfamiliarTrainingState() {
  if (!state.unfamiliarTraining) {
    state.unfamiliarTraining = {
      sequential: { queue: [], position: 0, history: [] },
      random: { queue: [], position: 0, history: [] }
    };
  }
  for (const mode of ['sequential', 'random']) {
    if (!state.unfamiliarTraining[mode]) {
      state.unfamiliarTraining[mode] = { queue: [], position: 0, history: [] };
    }
    if (!Array.isArray(state.unfamiliarTraining[mode].queue)) state.unfamiliarTraining[mode].queue = [];
    if (!Number.isInteger(state.unfamiliarTraining[mode].position)) state.unfamiliarTraining[mode].position = 0;
    if (!Array.isArray(state.unfamiliarTraining[mode].history)) state.unfamiliarTraining[mode].history = [];
  }
}

function ensureVeryUnfamiliarTrainingState() {
  if (!state.veryUnfamiliarTraining) {
    state.veryUnfamiliarTraining = {
      sequential: { queue: [], position: 0, history: [] },
      random: { queue: [], position: 0, history: [] }
    };
  }
  for (const mode of ['sequential', 'random']) {
    if (!state.veryUnfamiliarTraining[mode]) {
      state.veryUnfamiliarTraining[mode] = { queue: [], position: 0, history: [] };
    }
    if (!Array.isArray(state.veryUnfamiliarTraining[mode].queue)) state.veryUnfamiliarTraining[mode].queue = [];
    if (!Number.isInteger(state.veryUnfamiliarTraining[mode].position)) state.veryUnfamiliarTraining[mode].position = 0;
    if (!Array.isArray(state.veryUnfamiliarTraining[mode].history)) state.veryUnfamiliarTraining[mode].history = [];
  }
}

function prepareUnfamiliarQueue(mode) {
  ensureUnfamiliarTrainingState();
  const unfamiliarIdsSorted = getUnfamiliarItemsSorted().map(item => item.id);
  const bucket = state.unfamiliarTraining[mode];

  const existingSorted = Array.isArray(bucket.queue)
    ? bucket.queue.slice().sort((a, b) => a - b)
    : [];

  const sameSet =
    existingSorted.length === unfamiliarIdsSorted.length &&
    existingSorted.every((id, i) => id === unfamiliarIdsSorted[i]);

  if (!unfamiliarIdsSorted.length) {
    bucket.queue = [];
    bucket.position = 0;
    bucket.history = [];
    return;
  }

  if (!sameSet || !Array.isArray(bucket.queue) || bucket.position >= bucket.queue.length) {
    bucket.queue = mode === 'random' ? shuffle(unfamiliarIdsSorted) : unfamiliarIdsSorted.slice();
    bucket.position = 0;
    bucket.history = [];
  }
}

function startUnfamiliarTraining(mode) {
  startBatchTraining('unfamiliar', mode);
}

function prepareVeryUnfamiliarQueue(mode) {
  ensureVeryUnfamiliarTrainingState();
  const idsSorted = getVeryUnfamiliarItemsSorted().map(item => item.id);
  const bucket = state.veryUnfamiliarTraining[mode];

  const existingSorted = Array.isArray(bucket.queue)
    ? bucket.queue.slice().sort((a, b) => a - b)
    : [];

  const sameSet =
    existingSorted.length === idsSorted.length &&
    existingSorted.every((id, i) => id === idsSorted[i]);

  if (!idsSorted.length) {
    bucket.queue = [];
    bucket.position = 0;
    bucket.history = [];
    return;
  }

  if (!sameSet || !Array.isArray(bucket.queue) || bucket.position >= bucket.queue.length) {
    bucket.queue = mode === 'random' ? shuffle(idsSorted) : idsSorted.slice();
    bucket.position = 0;
    bucket.history = [];
  }
}

function startVeryUnfamiliarTraining(mode) {
  startBatchTraining('veryUnfamiliar', mode);
}

function prepareBatchQueue(source, mode, options = {}) {
  ensureBatchTrainingState();
  const { forceRebuild = false } = options;
  const info = getBatchInfo(source, mode);
  const bucket = info.bucket;
  const batchIds = info.batchItems.map(item => item.id);
  if (!batchIds.length) {
    bucket.queue = [];
    bucket.position = 0;
    bucket.history = [];
    return;
  }
  const existingSorted = Array.isArray(bucket.queue) ? bucket.queue.slice().sort((a, b) => a - b) : [];
  const batchIdsSorted = batchIds.slice().sort((a, b) => a - b);
  const sameSet = existingSorted.length === batchIdsSorted.length && existingSorted.every((id, i) => id === batchIdsSorted[i]);
  const queueInvalid = !Array.isArray(bucket.queue) || bucket.queue.length === 0;

  if (forceRebuild || queueInvalid || !sameSet) {
    bucket.queue = mode === 'random' ? shuffle(batchIds) : batchIds.slice();
    bucket.position = 0;
    bucket.history = [];
    return;
  }

  // 位置校验：夹到合法范围，但不自动重建
  if (!Number.isInteger(bucket.position) || bucket.position < 0) {
    bucket.position = 0;
  }
  if (bucket.position > bucket.queue.length) {
    bucket.position = bucket.queue.length;
  }
  if (!Array.isArray(bucket.history)) {
    bucket.history = [];
  }
}

function startBatchTraining(source, mode) {
  ensureBatchTrainingState();
  const info = getBatchInfo(source, mode);
  if (!info.batches.length) {
    if (source === 'wrong') renderWrongBook();
    else renderUnfamiliarPage();
    return;
  }
  prepareBatchQueue(source, mode);
  const bucket = state.batchTraining[source][mode];
  if (!bucket.queue.length) {
    if (source === 'wrong') renderWrongBook();
    else renderUnfamiliarPage();
    return;
  }
  const sourceTitle = getTrainingSourceTitle(source);
  const modeTitle = mode === 'random' ? '乱序训练' : '正序训练';
  const baseSession = {
    mode: `batch-${source}-${mode}`,
    source,
    trainMode: mode,
    title: `${sourceTitle} · ${modeTitle}`,
    returnLabel: source === 'wrong' ? '返回错题本' : '返回陌生词汇',
    items: [],
    cursor: -1
  };
  if (restoreSessionFromState(baseSession)) return;
  currentView = 'trainer';
  activeSession = baseSession;
  showNextQuestion();
}

function getNextWordForSession() {
  if (!activeSession) return null;

  if (activeSession.mode && activeSession.mode.startsWith('batch-')) {
    const source = activeSession.source;
    const mode = activeSession.trainMode;
    prepareBatchQueue(source, mode);
    const bucket = state.batchTraining[source][mode];
    if (!bucket.queue.length || bucket.position >= bucket.queue.length) {
      return null;
    }
    const id = bucket.queue[bucket.position];
    return wordsById.get(Number(id)) || null;
  }

  if (activeSession.mode === 'main') {
    if (state.mainChallenge.nextIndex >= words.length) {
      state.mainChallenge.nextIndex = 0;
      state.mainChallenge.round = (state.mainChallenge.round || 1) + 1;
      state.mainChallenge.history = [];
    }
    return words[state.mainChallenge.nextIndex] || null;
  }

  if (activeSession.mode === 'wrong-sequential' || activeSession.mode === 'wrong-random') {
    const wMode = activeSession.mode === 'wrong-random' ? 'random' : 'sequential';
    prepareWrongQueue(wMode);
    const bucket = state.wrongTraining[wMode];
    const id = bucket.queue[bucket.position];
    return wordsById.get(Number(id)) || null;
  }

  if (activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random') {
    const uMode = activeSession.mode === 'unfamiliar-random' ? 'random' : 'sequential';
    prepareUnfamiliarQueue(uMode);
    const bucket = state.unfamiliarTraining[uMode];
    const id = bucket.queue[bucket.position];
    return wordsById.get(Number(id)) || null;
  }

  if (activeSession.mode === 'very-unfamiliar-sequential' || activeSession.mode === 'very-unfamiliar-random') {
    const vMode = activeSession.mode === 'very-unfamiliar-random' ? 'random' : 'sequential';
    prepareVeryUnfamiliarQueue(vMode);
    const bucket = state.veryUnfamiliarTraining[vMode];
    const id = bucket.queue[bucket.position];
    return wordsById.get(Number(id)) || null;
  }

  return null;
}

function advancePersistentProgress(wordId) {
  if (!activeSession) return;

  if (activeSession.mode === 'main') {
    const currentIndex = words.findIndex(w => w.id === wordId);
    const expected = state.mainChallenge.nextIndex;
    if (currentIndex === expected) {
      state.mainChallenge.history.push(wordId);
      if (state.mainChallenge.history.length > 300) state.mainChallenge.history.shift();
      state.mainChallenge.nextIndex += 1;
      if (state.mainChallenge.nextIndex >= words.length) {
        state.mainChallenge.nextIndex = words.length;
      }
    }
    return;
  }

  if (activeSession.mode && activeSession.mode.startsWith('batch-')) {
    const source = activeSession.source;
    const mode = activeSession.trainMode;
    const bucket = state.batchTraining[source][mode];
    bucket.history.push(wordId);
    if (bucket.history.length > 300) bucket.history.shift();
    bucket.position += 1;
    if (bucket.position >= bucket.queue.length) {
      bucket.position = bucket.queue.length;
    }
    return;
  }

  if (activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random') {
    const uMode = activeSession.mode === 'unfamiliar-random' ? 'random' : 'sequential';
    const bucket = state.unfamiliarTraining[uMode];
    bucket.history.push(wordId);
    if (bucket.history.length > 300) bucket.history.shift();
    bucket.position += 1;
    if (bucket.position >= bucket.queue.length) {
      bucket.position = bucket.queue.length;
    }
    return;
  }

  if (activeSession.mode === 'wrong-sequential' || activeSession.mode === 'wrong-random') {
    const wMode = activeSession.mode === 'wrong-random' ? 'random' : 'sequential';
    const bucket = state.wrongTraining[wMode];
    bucket.history.push(wordId);
    if (bucket.history.length > 300) bucket.history.shift();
    bucket.position += 1;
    if (bucket.position >= bucket.queue.length) {
      bucket.position = bucket.queue.length;
    }
    return;
  }

  if (activeSession.mode === 'very-unfamiliar-sequential' || activeSession.mode === 'very-unfamiliar-random') {
    const vMode = activeSession.mode === 'very-unfamiliar-random' ? 'random' : 'sequential';
    const bucket = state.veryUnfamiliarTraining[vMode];
    bucket.history.push(wordId);
    if (bucket.history.length > 300) bucket.history.shift();
    bucket.position += 1;
    if (bucket.position >= bucket.queue.length) {
      bucket.position = bucket.queue.length;
    }
    return;
  }
}

function createQuestion(word) {
  const options = buildOptions(word);
  return {
    wordId: word.id,
    options,
    answered: false,
    selected: null,
    correctLetter: options.find(item => item.correct).letter,
    progressed: false,
    wrongCounted: false,
    feedback: ''
  };
}

function buildOptions(word) {
  const used = new Set([word.definition]);
  const distractors = [];
  const candidates = shuffle(words.filter(item => item.id !== word.id));

  for (const item of candidates) {
    if (!used.has(item.definition)) {
      used.add(item.definition);
      distractors.push(item.definition);
    }
    if (distractors.length >= 3) break;
  }

  const raw = shuffle([
    { definition: word.definition, correct: true },
    ...distractors.map(definition => ({ definition, correct: false }))
  ]);

  return raw.map((item, index) => ({
    letter: LETTERS[index],
    definition: item.definition,
    correct: item.correct
  }));
}

function renderCurrentQuestion() {
  if (!activeSession || activeSession.cursor < 0) return;

  const item = activeSession.items[activeSession.cursor];
  const word = wordsById.get(item.wordId);
  if (!word) return;

  const isWrong = item.answered && item.selected !== item.correctLetter;
  const isCorrect = item.answered && item.selected === item.correctLetter;
  const modeText = getModeText();
  const canPrev = activeSession.cursor > 0;
  const hasNextHistory = activeSession.cursor < activeSession.items.length - 1;

  setApp(`
    ${renderTopHomeButton()}
    <div class="trainer-head">
      <h2 class="section-title">${escapeHtml(activeSession.title)}</h2>
      <div class="trainer-right-tools">
        ${renderBatchTopControls()}
        <span class="mode-tag">${escapeHtml(modeText)}</span>
      </div>
    </div>

    <section class="word-card">
      ${renderCurrentBatchQuestionBadge()}
      <div class="word-index">#${word.id}${word.star ? ' · ★重点' : ''}</div>
      <div class="word-text ${isWrong ? 'wrong' : ''}">${renderWordNameWithPhonetic(word)}</div>
      <div class="feedback ${isCorrect ? 'ok' : ''} ${isWrong ? 'bad' : ''}">${escapeHtml(item.feedback || '')}</div>
    </section>

    <section class="options">
      ${item.options.map(option => {
        let cls = '';
        if (item.answered) {
          if (option.correct) cls = 'correct';
          if (option.letter === item.selected && !option.correct) cls = 'wrong';
        }
        return `
          <button class="option-btn ${cls}" data-action="answer" data-letter="${option.letter}" ${item.answered ? 'disabled' : ''}>
            <span class="option-letter">${option.letter}</span>${escapeHtml(option.definition)}
          </button>
        `;
      }).join('')}
    </section>

    <div class="actions">
      <button class="btn" data-action="back">${escapeHtml(activeSession.returnLabel)}</button>
      <button class="btn" data-action="prev-question" ${canPrev ? '' : 'disabled'}>上一个单词</button>
      <button class="btn primary" data-action="next-question">${hasNextHistory ? '下一个单词' : '下一词'}</button>
      ${activeSession.mode === 'main' ? `
        <button class="btn unfamiliar-btn" data-action="mark-unfamiliar" data-word-id="${word.id}" ${isUnfamiliar(word.id) ? 'disabled' : ''}>
          ${isUnfamiliar(word.id) ? '已加入陌生词汇' : '不熟悉'}
        </button>
      ` : ''}
      ${(activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random' || (activeSession.mode && activeSession.mode.startsWith('batch-') && activeSession.source === 'unfamiliar')) ? `
        <button class="btn very-unfamiliar-btn" data-action="mark-very-unfamiliar" data-word-id="${word.id}" ${isVeryUnfamiliar(word.id) ? 'disabled' : ''}>
          ${isVeryUnfamiliar(word.id) ? '已加入更陌生' : '更陌生'}
        </button>
      ` : ''}
      ${(isBatchSession(activeSession) && activeSession.source === 'veryUnfamiliar') ? `
        <button class="btn remove-very-btn" data-action="remove-very-unfamiliar" data-word-id="${word.id}" ${item.removedFromVeryUnfamiliar || !isVeryUnfamiliar(word.id) ? 'disabled' : ''}>
          ${item.removedFromVeryUnfamiliar || !isVeryUnfamiliar(word.id) ? '已剔除更陌生' : '剔除更陌生词汇'}
        </button>
      ` : ''}
    </div>

    <p class="small-note">可直接按键盘 A / B / C / D 作答。答错后本题会锁定，避免同一题重复计错。</p>
  `);
}

function getModeText() {
  if (!activeSession) return '';
  if (activeSession.mode && activeSession.mode.startsWith('batch-')) {
    const source = activeSession.source;
    const mode = activeSession.trainMode;
    const info = getBatchInfo(source, mode);
    const bucket = state.batchTraining[source][mode];
    const totalBatches = info.batches.length;
    const batchIndex = info.batchIndex;
    const currentBatchSize = info.batchItems.length;
    const rawDisplayIndex = activeSession.cursor >= 0 ? activeSession.cursor + 1 : Math.min((bucket.position || 0) + 1, Math.max(currentBatchSize, 1));
    const displayIndex = Math.min(rawDisplayIndex, Math.max(currentBatchSize, 1));
    const title = getTrainingSourceTitle(source);
    return `${title} 第 ${batchIndex + 1} / ${totalBatches} 批 · ${displayIndex} / ${currentBatchSize}`;
  }
  if (activeSession.mode === 'main') {
    return `第 ${state.mainChallenge.round || 1} 轮 · 当前进度 ${Math.min(state.mainChallenge.nextIndex + 1, words.length)} / ${words.length}`;
  }
  if (activeSession.mode === 'wrong-sequential' || activeSession.mode === 'wrong-random') {
    const mode = activeSession.mode === 'wrong-random' ? 'random' : 'sequential';
    const bucket = state.wrongTraining[mode];
    return `错题 ${Math.min((bucket.position || 0) + 1, Math.max(bucket.queue.length, 1))} / ${bucket.queue.length}`;
  }
  if (activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random') {
    const mode = activeSession.mode === 'unfamiliar-random' ? 'random' : 'sequential';
    const bucket = state.unfamiliarTraining[mode];
    const displayIndex = activeSession.cursor >= 0 ? activeSession.cursor + 1 : Math.min((bucket.position || 0) + 1, Math.max(bucket.queue.length, 1));
    return `陌生词 ${displayIndex} / ${bucket.queue.length}`;
  }
  if (activeSession.mode === 'very-unfamiliar-sequential' || activeSession.mode === 'very-unfamiliar-random') {
    const mode = activeSession.mode === 'very-unfamiliar-random' ? 'random' : 'sequential';
    const bucket = state.veryUnfamiliarTraining[mode];
    const displayIndex = activeSession.cursor >= 0 ? activeSession.cursor + 1 : Math.min((bucket.position || 0) + 1, Math.max(bucket.queue.length, 1));
    return `更陌生词 ${displayIndex} / ${bucket.queue.length}`;
  }
  return '';
}

function showNextQuestion() {
  clearTimeout(autoTimer);
  if (!activeSession) return;

  if (activeSession.cursor < activeSession.items.length - 1) {
    activeSession.cursor += 1;
    renderCurrentQuestion();
    saveStateWithSession().catch(showFatalError);
    return;
  }

  const word = getNextWordForSession();
  if (!word) {
    if (activeSession.mode && activeSession.mode.startsWith('batch-')) {
      renderBatchCompletePage(activeSession.source, activeSession.trainMode);
      return;
    }
    if (activeSession.mode === 'main') {
      state.mainChallenge.nextIndex = 0;
      state.mainChallenge.round = (state.mainChallenge.round || 1) + 1;
      saveStateWithSession().then(() => showNextQuestion()).catch(showFatalError);
      return;
    }
    if (activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random' || activeSession.mode === 'very-unfamiliar-sequential' || activeSession.mode === 'very-unfamiliar-random') {
      renderUnfamiliarPage();
      return;
    }
    if (activeSession.mode === 'wrong-sequential' || activeSession.mode === 'wrong-random') {
      renderWrongBook();
      return;
    }
    renderHome();
    return;
  }

  const question = createQuestion(word);
  activeSession.items.push(question);
  activeSession.cursor = activeSession.items.length - 1;
  renderCurrentQuestion();
  saveStateWithSession().catch(showFatalError);
}

function showPreviousQuestion() {
  clearTimeout(autoTimer);
  if (!activeSession || activeSession.cursor <= 0) return;
  activeSession.cursor -= 1;
  renderCurrentQuestion();
  saveStateWithSession().catch(showFatalError);
}

async function skipOrNextQuestion() {
  if (!activeSession || activeSession.cursor < 0) return;

  if (activeSession.cursor < activeSession.items.length - 1) {
    activeSession.cursor += 1;
    renderCurrentQuestion();
    await saveStateWithSession();
    return;
  }

  const item = activeSession.items[activeSession.cursor];
  if (!item.progressed) {
    item.progressed = true;
    advancePersistentProgress(item.wordId);
    await saveStateWithSession();
  }
  showNextQuestion();
}

async function answer(letter) {
  if (!activeSession || activeSession.cursor < 0) return;
  const item = activeSession.items[activeSession.cursor];
  if (item.answered) return;

  const selectedOption = item.options.find(option => option.letter === letter);
  if (!selectedOption) return;

  item.answered = true;
  item.selected = letter;

  if (selectedOption.correct) {
    if (!item.progressed) {
      item.progressed = true;
      advancePersistentProgress(item.wordId);
    }
    item.feedback = '正确，正在进入下一词...';
    renderCurrentQuestion();
    await saveStateWithSession();
    autoTimer = setTimeout(() => showNextQuestion(), 650);
    return;
  }

  const key = String(item.wordId);
  if (!item.wrongCounted) {
    const oldCount = Number(state.wrongBook.wrongCounts[key] || 0);
    state.wrongBook.wrongCounts[key] = oldCount + 1;
    if (!state.wrongBook.firstWrongAt[key]) {
      state.wrongBook.firstWrongAt[key] = nowISO();
    }
    item.wrongCounted = true;
  }

  item.feedback = `答错了。正确答案是 ${item.correctLetter}，请手动点击"下一词"。`;
  renderCurrentQuestion();
  await saveStateWithSession();
}

function renderWrongBook() {
  currentView = 'wrong-book';
  activeSession = null;
  clearTimeout(autoTimer);
  updateStats();

  const items = getWrongItemsSorted();
  const wrongTimes = getTotalWrongTimes();

  if (!items.length) {
    setApp(`
      ${renderTopHomeButton()}
      <h2 class="section-title">错题本界面</h2>
      <div class="empty">目前还没有错题。进入单词挑战后，答错的单词会自动记录到这里。</div>
      <div class="actions">
        <button class="btn primary" data-action="start-main">进入单词挑战</button>
      </div>
    `);
    return;
  }

  setApp(`
    ${renderTopHomeButton()}
    <h2 class="section-title">错题本界面</h2>
    <div class="grid-2">
      <section class="panel-card">
        <h2>错题统计</h2>
        <p>错题总数：<strong>${items.length}</strong></p>
        <p>累计错误次数：<strong class="wrong-count">${wrongTimes}</strong></p>
      </section>
      <section class="panel-card">
        <h2>错题训练</h2>
        <p>正序按原单词表顺序；乱序会在每轮开始时重新洗牌。每 100 个词为一个批次，当前批次完成后不会自动进入下一批。</p>
        ${(() => {
          const seqInfo = getBatchInfo('wrong', 'sequential');
          const randInfo = getBatchInfo('wrong', 'random');
          return `
            <p class="batch-note">正序当前批次：第 ${seqInfo.batches.length ? seqInfo.batchIndex + 1 : 0} / ${seqInfo.batches.length} 批</p>
            <p class="batch-note">乱序当前批次：第 ${randInfo.batches.length ? randInfo.batchIndex + 1 : 0} / ${randInfo.batches.length} 批</p>
          `;
        })()}
        <div class="actions">
          <button class="btn primary" data-action="wrong-sequential">正序训练错题</button>
          <button class="btn soft" data-action="wrong-random">乱序训练错题</button>
        </div>
      </section>
    </div>

    <div class="actions">
      <button class="btn soft" data-action="export-wrong-docx">导出错题本 Word</button>
    </div>

    ${renderCollapsibleListSection({
      id: 'wrong-list',
      title: '错题列表',
      description: '这里显示你实际答错过的词，并记录每个词累计答错次数。',
      count: items.length,
      defaultOpen: false,
      innerHtml: `
        <div class="word-list">
          ${items.map(item => {
            const count = state.wrongBook.wrongCounts[String(item.id)] || 0;
            return `
              <div class="wrong-item">
                <strong>#${item.id} ${item.star ? '★ ' : ''}${renderInlineWordWithPhonetic(item)}</strong>
                <div>${escapeHtml(item.definition)}</div>
                <div class="wrong-count">错误次数：${count}</div>
              </div>
            `;
          }).join('')}
        </div>
      `
    })}
  `);
}

function renderBatchCompletePage(source, mode) {
  currentView = 'batch-complete';
  clearTimeout(autoTimer);

  const info = getBatchInfo(source, mode);
  const sourceTitle = getTrainingSourceTitle(source);
  const totalBatches = info.batches.length;
  const batchIndex = info.batchIndex;
  const currentBatchSize = info.batchItems.length;

  setApp(`
    ${renderTopHomeButton()}
    <h2 class="section-title">${sourceTitle} · 当前批次完成</h2>

    <div class="panel-card">
      <h2>第 ${batchIndex + 1} / ${totalBatches} 批已完成</h2>
      <p>本批次共 <strong>${currentBatchSize}</strong> 个词。</p>
      <p class="batch-note">当前不会自动进入下一批。你可以选择再练本批次，或确认后进入下一批。</p>
    </div>

    <div class="actions">
      <button class="btn primary" data-action="repeat-current-batch">再练本批次</button>
      <button class="btn soft" data-action="go-next-batch">进入下一批</button>
      <button class="btn" data-action="${source === 'wrong' ? 'wrong-book' : 'unfamiliar-page'}">
        ${source === 'wrong' ? '返回错题本' : '返回陌生词汇'}
      </button>
    </div>
  `);
}

async function switchBatch(direction) {
  if (!isBatchSession(activeSession)) return;
  const source = activeSession.source;
  const mode = activeSession.trainMode;
  const currentKey = getSessionCacheKey(activeSession);
  ensureBatchTrainingState();
  const info = getBatchInfo(source, mode);
  const bucket = state.batchTraining[source][mode];
  if (!info.batches.length) {
    if (source === 'wrong') renderWrongBook();
    else renderUnfamiliarPage();
    return;
  }
  const total = info.batches.length;
  if (source === 'veryUnfamiliar') {
    const nextIndex = findNextNonEmptyVeryUnfamiliarBatchIndex(bucket.batchIndex, direction);
    if (nextIndex < 0) { renderUnfamiliarPage(); return; }
    bucket.batchIndex = nextIndex;
  } else {
    if (direction === 'prev') {
      bucket.batchIndex -= 1;
      if (bucket.batchIndex < 0) bucket.batchIndex = total - 1;
    } else {
      bucket.batchIndex += 1;
      if (bucket.batchIndex >= total) bucket.batchIndex = 0;
    }
  }
  bucket.queue = [];
  bucket.position = 0;
  bucket.history = [];
  clearSessionCacheByKey(currentKey);
  prepareBatchQueue(source, mode, { forceRebuild: true });
  await saveStateWithSession();
  startBatchTraining(source, mode);
}

async function removeVeryUnfamiliar(wordId) {
  if (!state.veryUnfamiliar) state.veryUnfamiliar = { ids: {}, markedAt: {} };
  if (!state.veryUnfamiliar.ids) state.veryUnfamiliar.ids = {};
  if (!state.veryUnfamiliar.markedAt) state.veryUnfamiliar.markedAt = {};
  const key = String(wordId);
  if (state.veryUnfamiliar.ids[key]) delete state.veryUnfamiliar.ids[key];
  if (state.veryUnfamiliar.markedAt[key]) delete state.veryUnfamiliar.markedAt[key];
  const item = activeSession && activeSession.items ? activeSession.items[activeSession.cursor] : null;
  if (item && Number(item.wordId) === Number(wordId)) {
    item.removedFromVeryUnfamiliar = true;
    item.feedback = '已从更陌生词汇中剔除。';
  }
  await saveStateWithSession();
  if (activeSession) renderCurrentQuestion(); else renderUnfamiliarPage();
}

async function repeatCurrentBatch() {
  if (!activeSession || !activeSession.mode.startsWith('batch-')) return;
  const key = getSessionCacheKey(activeSession);
  clearSessionCacheByKey(key);
  const source = activeSession.source;
  const mode = activeSession.trainMode;
  prepareBatchQueue(source, mode, { forceRebuild: true });
  await saveState();
  startBatchTraining(source, mode);
}

async function goNextBatch() {
  await switchBatch('next');
}

function renderUnfamiliarPage() {
  currentView = 'unfamiliar';
  activeSession = null;
  clearTimeout(autoTimer);
  updateStats();

  const items = getUnfamiliarItemsSorted();
  const veryItems = getVeryUnfamiliarItemsSorted();

  const shouldOpenUnfamiliarList = pendingUnfamiliarPageFocus === 'unfamiliar-list';
  const shouldOpenVeryUnfamiliarList = pendingUnfamiliarPageFocus === 'very-unfamiliar-list';

  // 两个集合都为空才显示完全空页面
  if (!items.length && !veryItems.length) {
    setApp(`
      ${renderTopHomeButton()}
      <h2 class="section-title">陌生词汇</h2>
      <div class="empty">目前还没有陌生词汇。进入单词挑战后，点击"不熟悉"即可记录到这里。</div>
      <div class="actions">
        <button class="btn primary" data-action="start-main">进入单词挑战</button>
      </div>
    `);
    return;
  }

  setApp(`
    ${renderTopHomeButton()}
    <h2 class="section-title">陌生词汇</h2>
    <div class="grid-2">
      <section class="panel-card">
        <h2>陌生词统计</h2>
        <p>陌生词汇总数：<strong>${items.length}</strong></p>
      </section>
      ${items.length ? `
      <section class="panel-card">
        <h2>陌生词训练</h2>
        <p>正序按原单词表顺序；乱序会在每轮开始时重新洗牌。每 100 个词为一个批次，当前批次完成后不会自动进入下一批。</p>
        ${(() => {
          const seqInfo = getBatchInfo('unfamiliar', 'sequential');
          const randInfo = getBatchInfo('unfamiliar', 'random');
          return `
            <p class="batch-note">正序当前批次：第 ${seqInfo.batches.length ? seqInfo.batchIndex + 1 : 0} / ${seqInfo.batches.length} 批</p>
            <p class="batch-note">乱序当前批次：第 ${randInfo.batches.length ? randInfo.batchIndex + 1 : 0} / ${randInfo.batches.length} 批</p>
          `;
        })()}
        <div class="actions">
          <button class="btn primary" data-action="unfamiliar-sequential">正序训练陌生词</button>
          <button class="btn soft" data-action="unfamiliar-random">乱序训练陌生词</button>
        </div>
      </section>
      ` : ''}
    </div>

    <h2 class="section-title" style="margin-top:32px;">更陌生词汇</h2>
    ${!veryItems.length ? `
      <div class="empty">目前还没有更陌生词。进入陌生词汇训练后，点击"更陌生"即可记录到这里。</div>
    ` : `
      <div class="grid-2">
        <section class="panel-card">
          <h2>更陌生词统计</h2>
          <p>更陌生词汇总数：<strong>${veryItems.length}</strong></p>
        </section>
        <section class="panel-card">
          <h2>更陌生词训练</h2>
          <p>更陌生词汇按照陌生词汇的批次划分，自动归属到对应陌生词批次中。</p>
          ${(() => {
            const seqInfo = getBatchInfo('veryUnfamiliar', 'sequential');
            const randInfo = getBatchInfo('veryUnfamiliar', 'random');
            return `
              <p class="batch-note">正序当前批次：第 ${seqInfo.batches.length ? seqInfo.batchIndex + 1 : 0} / ${seqInfo.batches.length} 批</p>
              <p class="batch-note">乱序当前批次：第 ${randInfo.batches.length ? randInfo.batchIndex + 1 : 0} / ${randInfo.batches.length} 批</p>
            `;
          })()}
          <div class="actions">
            <button class="btn primary" data-action="very-unfamiliar-sequential">正序训练更陌生词</button>
            <button class="btn soft" data-action="very-unfamiliar-random">乱序训练更陌生词</button>
          </div>
        </section>
      </div>

      ${(() => {
        const selItems = getSelectedVeryUnfamiliarItemsForList();
        const selLabel = getSelectedVeryUnfamiliarBatchLabel();
        return renderCollapsibleListSection({
          id: 'very-unfamiliar-list',
          title: '更陌生词汇列表',
          description: '这里显示你在陌生词训练中点击"更陌生"记录下来的重点薄弱词。它们按照所属陌生词批次分类显示，并且不会因为答对一次自动删除。',
          count: veryItems.length,
          defaultOpen: shouldOpenVeryUnfamiliarList,
          innerHtml: `
            ${renderVeryUnfamiliarBatchSelector()}
            <div class="selected-batch-summary">当前显示：<strong>${escapeHtml(selLabel)}</strong> · <strong>${selItems.length}</strong> 个更陌生词</div>
            <div class="actions list-export-actions">
              <button class="btn soft" data-action="export-very-unfamiliar-docx">导出更陌生词 Word</button>
            </div>
            ${selItems.length ? `
              <div class="word-list">
                ${selItems.map(item => {
                  const markedTime = state.veryUnfamiliar?.markedAt?.[String(item.id)] || '';
                  const batchIdx = getUnfamiliarBatchIndexForWord(item.id);
                  return `
                    <div class="wrong-item">
                      <strong>#${item.id} ${item.star ? '★ ' : ''}${renderInlineWordWithPhonetic(item)}</strong>
                      <div>${escapeHtml(item.definition)}</div>
                      <div class="batch-origin-note">所属陌生词批次：${batchIdx >= 0 ? '第 ' + (batchIdx + 1) + ' 批' : '未知'}</div>
                      <div class="small-note" style="margin-top:0;color:var(--muted);">${markedTime ? '标记时间：' + escapeHtml(markedTime) : '标记时间：未知'}</div>
                    </div>
                  `;
                }).join('')}
              </div>
            ` : `<div class="empty">当前选择的批次没有更陌生词。</div>`}
          `
        });
      })()}
    `}

    ${(() => {
      const selItems = getSelectedUnfamiliarItemsForList();
      const selLabel = getSelectedUnfamiliarBatchLabel();
      return renderCollapsibleListSection({
        id: 'unfamiliar-list',
        title: '陌生词汇列表',
        description: '这里显示你在单词挑战中点击"不熟悉"记录下来的词。它们按照陌生词训练批次分类显示，并且不会因为答对一次自动删除。',
        count: items.length,
        defaultOpen: shouldOpenUnfamiliarList,
        innerHtml: `
          ${renderUnfamiliarBatchSelector()}
          <div class="selected-batch-summary">当前显示：<strong>${escapeHtml(selLabel)}</strong> · <strong>${selItems.length}</strong> 个陌生词</div>
          <div class="actions list-export-actions">
            <button class="btn soft" data-action="export-unfamiliar-docx">导出陌生词 Word</button>
          </div>
          ${selItems.length ? `
            <div class="word-list">
              ${selItems.map(item => {
                const markedTime = state.unfamiliar?.markedAt?.[String(item.id)] || '';
                const bi = getUnfamiliarListBatchIndexForWord(item.id);
                return `
                  <div class="wrong-item">
                    <strong>#${item.id} ${item.star ? '★ ' : ''}${renderInlineWordWithPhonetic(item)}</strong>
                    <div>${escapeHtml(item.definition)}</div>
                    <div class="batch-origin-note">所属陌生词批次：${bi >= 0 ? '第 ' + (bi + 1) + ' 批' : '未知'}</div>
                    <div class="small-note" style="margin-top:0;color:var(--muted);">${markedTime ? '标记时间：' + escapeHtml(markedTime) : '标记时间：未知'}</div>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `<div class="empty">当前选择的批次没有陌生词。</div>`}
        `
      });
    })()}
  `);

  const focusTarget = pendingUnfamiliarPageFocus;
  pendingUnfamiliarPageFocus = '';
  focusUnfamiliarPageSection(focusTarget);
}

// ---- 折叠列表 ----

function renderCollapsibleListSection(config) {
  const { id, title, description, count, defaultOpen = false, innerHtml } = config;
  const safeId = escapeHtml(String(id));
  const openAttr = defaultOpen ? ' open' : '';
  return `
    <details class="collapsible-section" id="section-${safeId}"${openAttr}>
      <summary class="collapse-toggle">
        <span class="collapse-title">
          ${escapeHtml(title)}
          <strong class="collapse-count">${count}</strong>
        </span>
        <span class="collapse-icon" aria-hidden="true"></span>
      </summary>
      <p class="collapse-description">${escapeHtml(description)}</p>
      <div class="collapse-body">
        ${innerHtml}
      </div>
    </details>
  `;
}

// ---- 文章阅读模式 ----

function renderArticleListPage() {
  currentView = 'article-list';

  if (!articles.length) {
    setApp(`
      ${renderTopHomeButton()}
      <h2 class="section-title">文章阅读模式</h2>
      <div class="empty">
        还没有导入文章数据。请先运行 <code>python import_articles.py</code>，
        生成 <code>public/articles.json</code>。
      </div>
      <div class="actions">
        <button class="btn" data-action="home">返回首页</button>
      </div>
    `);
    return;
  }

  setApp(`
    ${renderTopHomeButton()}
    <h2 class="section-title">文章阅读模式</h2>
    <p class="page-note">
      文章按 Word 文档里的 1、2、3、4 编号分批。阅读时，标注词会加粗并显示音标；点击标注词可以显示或隐藏中文意思。
    </p>

    <div class="article-batch-list">
      ${articles.map((article, index) => `
        <div class="article-batch-card">
          <div>
            <div class="article-batch-title">
              第 ${article.id} 批：${escapeHtml(article.title)}
            </div>
            <div class="article-batch-meta">
              段落 ${article.paragraphs.length} · 标注词 ${article.vocabCount}
            </div>
          </div>
          <button class="btn primary" data-action="open-article" data-index="${index}">
            开始阅读
          </button>
        </div>
      `).join('')}
    </div>
  `);
}

function renderArticleToken(token, tokenId) {
  if (!token) return '';
  if (token.type === 'vocab') {
    return `
      <button type="button" class="article-vocab-token" data-action="toggle-article-meaning" data-token-id="${escapeHtml(tokenId)}">
        <strong>${escapeHtml(token.word)}</strong>
        <span class="article-phonetic">${escapeHtml(token.phonetic)}</span>
        <span class="article-meaning hidden">（${escapeHtml(token.meaning)}）</span>
      </button>
    `;
  }
  return escapeHtml(token.text || '');
}

function renderArticleParagraph(paragraph, pIdx) {
  let counter = 0;
  const html = (paragraph.tokens || []).map(token => {
    counter += 1;
    return renderArticleToken(token, `${pIdx}-${counter}`);
  }).join('');
  return `<p class="article-paragraph">${html}</p>`;
}

function renderArticleReader(index) {
  if (!articles.length) { renderArticleListPage(); return; }
  let idx = Number(index);
  if (!Number.isInteger(idx)) idx = 0;
  if (idx < 0) idx = 0;
  if (idx >= articles.length) idx = articles.length - 1;
  const previousIndex = currentArticleIndex;
  currentArticleIndex = idx;
  if (previousIndex !== currentArticleIndex) articleVocabSortByForget = false;
  const article = articles[currentArticleIndex];
  currentView = 'article-reader';

  setApp(`
    ${renderTopHomeButton()}
    <div class="article-reader-head">
      <div>
        <h2 class="section-title">文章阅读模式</h2>
        <div class="article-reader-title">第 ${article.id} 批：${escapeHtml(article.title)}</div>
      </div>
      <div class="article-reader-side-tools">
        <button type="button" class="btn soft article-vocab-panel-btn" data-action="toggle-article-vocab-panel">标注单词列表</button>
        <div class="article-reader-tag">第 ${currentArticleIndex + 1} / ${articles.length} 批</div>
      </div>
    </div>

    <div class="article-toolbar">
      <button class="btn" data-action="article-list">返回文章列表</button>
      <button class="btn" data-action="prev-article" ${currentArticleIndex <= 0 ? 'disabled' : ''}>上一篇</button>
      <button class="btn" data-action="next-article" ${currentArticleIndex >= articles.length - 1 ? 'disabled' : ''}>下一篇</button>
      <button class="btn soft" data-action="show-all-article-meanings">显示本篇全部释义</button>
      <button class="btn soft" data-action="hide-all-article-meanings">隐藏本篇全部释义</button>
    </div>

    <article class="article-reading-card">
      ${(article.paragraphs || []).map((p, idx) => renderArticleParagraph(p, idx)).join('')}
    </article>

    ${renderArticleVocabPanel(article)}
  `);
}

function toggleArticleMeaning(target) {
  const token = target.closest('.article-vocab-token');
  if (!token) return;
  const meaning = token.querySelector('.article-meaning');
  if (!meaning) return;
  meaning.classList.toggle('hidden');
  token.classList.toggle('meaning-open', !meaning.classList.contains('hidden'));
}

function showAllArticleMeanings() {
  document.querySelectorAll('.article-meaning').forEach(n => n.classList.remove('hidden'));
  document.querySelectorAll('.article-vocab-token').forEach(n => n.classList.add('meaning-open'));
}

function hideAllArticleMeanings() {
  document.querySelectorAll('.article-meaning').forEach(n => n.classList.add('hidden'));
  document.querySelectorAll('.article-vocab-token').forEach(n => n.classList.remove('meaning-open'));
}

function getCurrentArticle() {
  if (!Array.isArray(articles) || !articles.length) return null;
  return articles[currentArticleIndex] || null;
}

function ensureArticleVocabForgetState() {
  if (!state.articleVocabForgetCounts || typeof state.articleVocabForgetCounts !== 'object') {
    state.articleVocabForgetCounts = {};
  }
}

function getArticleVocabForgetKey(article, item) {
  const articleId = article && article.id != null ? String(article.id) : 'unknown';
  const word = String(item?.word || '').trim();
  const phonetic = String(item?.phonetic || '').trim();
  const meaning = String(item?.meaning || '').trim();
  return `${articleId}::${word}::${phonetic}::${meaning}`;
}

function getArticleVocabForgetCount(article, item) {
  ensureArticleVocabForgetState();
  const key = getArticleVocabForgetKey(article, item);
  const count = Number(state.articleVocabForgetCounts[key] || 0);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

async function incrementArticleVocabForget(articleId, word, phonetic, meaning, sourceButton = null) {
  ensureArticleVocabForgetState();
  const article = articles.find(item => Number(item.id) === Number(articleId));
  if (!article) return;
  const item = { word: String(word || ''), phonetic: String(phonetic || ''), meaning: String(meaning || '') };
  const key = getArticleVocabForgetKey(article, item);
  const oldCount = Number(state.articleVocabForgetCounts[key] || 0);
  const newCount = Number.isFinite(oldCount) ? Math.floor(oldCount) + 1 : 1;
  state.articleVocabForgetCounts[key] = newCount;
  await saveState();
  if (sourceButton) {
    sourceButton.innerHTML = `${renderZhengTally(newCount)}<span class="article-forget-count">忘记 ${newCount} 次</span>`;
    sourceButton.dataset.forgetCount = String(newCount);
  }
}

function renderZhengTally(count) {
  const safeCount = Math.max(0, Math.floor(Number(count) || 0));
  const full = Math.floor(safeCount / 5);
  const rest = safeCount % 5;
  const fullMarks = full > 0 ? `<span class="zheng-full">${'正'.repeat(full)}</span>` : '';
  const partial = rest > 0 ? `<svg class="zheng-partial" viewBox="0 0 40 40" aria-hidden="true">
    ${rest >= 1 ? '<line x1="8" y1="8" x2="32" y2="8"></line>' : ''}
    ${rest >= 2 ? '<line x1="20" y1="8" x2="20" y2="34"></line>' : ''}
    ${rest >= 3 ? '<line x1="11" y1="20" x2="29" y2="20"></line>' : ''}
    ${rest >= 4 ? '<line x1="11" y1="34" x2="29" y2="34"></line>' : ''}
    ${rest >= 5 ? '<line x1="8" y1="34" x2="34" y2="34"></line>' : ''}
  </svg>` : '';
  return `<span class="zheng-tally" aria-label="忘记 ${safeCount} 次">${fullMarks}${partial}</span>`;
}

function getArticleVocabList(article) {
  if (!article || !Array.isArray(article.paragraphs)) return [];
  ensureArticleVocabForgetState();
  const result = [];
  const seen = new Set();
  let originalIndex = 0;
  for (const paragraph of article.paragraphs) {
    for (const token of (paragraph.tokens || [])) {
      if (!token || token.type !== 'vocab') continue;
      const word = String(token.word || '').trim();
      const phonetic = String(token.phonetic || '').trim();
      const meaning = String(token.meaning || '').trim();
      if (!word) continue;
      const key = `${word}__${phonetic}__${meaning}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const item = { word, phonetic, meaning, originalIndex };
      item.forgetCount = getArticleVocabForgetCount(article, item);
      result.push(item);
      originalIndex += 1;
    }
  }
  if (articleVocabSortByForget) {
    result.sort((a, b) => {
      const diff = Number(b.forgetCount || 0) - Number(a.forgetCount || 0);
      if (diff !== 0) return diff;
      return Number(a.originalIndex || 0) - Number(b.originalIndex || 0);
    });
  } else {
    result.sort((a, b) => Number(a.originalIndex || 0) - Number(b.originalIndex || 0));
  }
  return result;
}

function renderArticleVocabPanel(article) {
  if (!articleVocabPanelOpen) return '';
  const vocabList = getArticleVocabList(article);
  return `
    <aside class="article-vocab-panel open">
      <div class="article-vocab-panel-head">
        <div>
          <div class="article-vocab-panel-title">本批标注单词</div>
          <div class="article-vocab-panel-subtitle">第 ${article.id} 批：${escapeHtml(article.title)}</div>
        </div>
        <button type="button" class="article-vocab-close" data-action="close-article-vocab-panel">×</button>
      </div>
      <div class="article-vocab-panel-meta-row">
        <div class="article-vocab-panel-count">共 ${vocabList.length} 个标注词</div>
        ${renderArticleVocabSortButton()}
      </div>
      ${vocabList.length ? `
        <div class="article-vocab-list">
          ${vocabList.map((item, index) => `
            <div class="article-vocab-list-item">
              <div class="article-vocab-list-row">
                <button type="button" class="article-vocab-list-word" data-action="toggle-article-list-meaning">
                  <span class="article-vocab-list-index">${index + 1}</span>
                  <span class="article-vocab-list-main">
                    <strong>${escapeHtml(item.word)}</strong>
                    ${item.phonetic ? `<span class="article-vocab-list-phonetic">${escapeHtml(item.phonetic)}</span>` : ''}
                  </span>
                </button>
                <button type="button" class="article-forget-btn" data-action="increment-article-vocab-forget" data-article-id="${article.id}" data-word="${escapeHtml(item.word)}" data-phonetic="${escapeHtml(item.phonetic)}" data-meaning="${escapeHtml(item.meaning)}" title="记录忘记一次">
                  ${renderZhengTally(item.forgetCount)}
                  <span class="article-forget-count">忘记 ${item.forgetCount} 次</span>
                </button>
              </div>
              <div class="article-vocab-list-meaning hidden">${escapeHtml(item.meaning || '暂无释义')}</div>
            </div>
          `).join('')}
        </div>
      ` : `<div class="empty">本批文章没有识别到标注词。</div>`}
    </aside>
    <div class="article-vocab-panel-mask" data-action="close-article-vocab-panel"></div>
  `;
}

function toggleArticleVocabPanel() {
  articleVocabPanelOpen = !articleVocabPanelOpen;
  renderArticleReader(currentArticleIndex);
}

function closeArticleVocabPanel() {
  articleVocabPanelOpen = false;
  renderArticleReader(currentArticleIndex);
}

function toggleArticleListMeaning(target) {
  const item = target.closest('.article-vocab-list-item');
  if (!item) return;
  const meaning = item.querySelector('.article-vocab-list-meaning');
  if (!meaning) return;
  meaning.classList.toggle('hidden');
  item.classList.toggle('meaning-open', !meaning.classList.contains('hidden'));
}

function toggleArticleVocabSortMode() {
  articleVocabSortByForget = !articleVocabSortByForget;
  renderArticleReader(currentArticleIndex);
}

function renderArticleVocabSortButton() {
  return `
    <button type="button" class="article-vocab-sort-btn ${articleVocabSortByForget ? 'active' : ''}" data-action="toggle-article-vocab-sort" title="${articleVocabSortByForget ? '恢复文章顺序' : '按忘记次数排序'}">
      ${articleVocabSortByForget ? '恢复文章顺序' : '按忘记次数排序'}
    </button>
  `;
}

// ---- Word 导出 ----

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getDocxFallbackFilename(type) {
  const today = todayDateString();
  if (type === 'wrong') return `CET6_错题本_${today}.docx`;
  if (type === 'unfamiliar') return `CET6_陌生词汇_${today}.docx`;
  if (type === 'veryUnfamiliar') return `CET6_更陌生词汇_${today}.docx`;
  return `CET6_导出_${today}.docx`;
}


function downloadWordLikeHtml(type, items) {
  const today = todayDateString();
  let title='', headers=[], rows=[];
  if(type==='wrong'){
    title='CET-6 错题本';
    headers=['序号','单词编号','单词','音标','词性与释义','错误次数'];
    rows=items.map((item,i)=>[String(i+1),String(item.id||''),(item.star?'★':'')+(item.word||''),String(item.phonetic||''),String(item.definition||''),String(item.wrongCount||0)]);
  } else if(type==='unfamiliar'){
    title='CET-6 陌生词汇';
    headers=['序号','单词编号','单词','音标','词性与释义','所属陌生词批次','标记时间'];
    rows=items.map((item,i)=>[String(i+1),String(item.id||''),(item.star?'★':'')+(item.word||''),String(item.phonetic||''),String(item.definition||''),String(item.batchLabel||''),String(item.markedAt||'')]);
  } else {
    title='CET-6 更陌生词汇';
    headers=['序号','单词编号','单词','音标','词性与释义','所属陌生词批次','标记时间'];
    rows=items.map((item,i)=>[String(i+1),String(item.id||''),(item.star?'★':'')+(item.word||''),String(item.phonetic||''),String(item.definition||''),String(item.batchLabel||''),String(item.markedAt||'')]);
  }
  let table='<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse">';
  table+='<tr>'+headers.map(h=>'<th>'+h+'</th>').join('')+'</tr>';
  table+=rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('');
  table+='</table>';
  const html='<html><head><meta charset="utf-8"><title>'+title+'</title></head><body><h2>'+title+'</h2><p>导出时间：'+new Date().toLocaleString()+' | 总词数：'+items.length+'</p>'+table+'</body></html>';
  const blob=new Blob(['﻿'+html],{type:'application/msword;charset=utf-8'});
  const a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=type==='wrong'?('CET6_错题本_'+today+'.doc'):(type==='unfamiliar'?('CET6_陌生词汇_'+today+'.doc'):('CET6_更陌生词汇_'+today+'.doc'));
  document.body.appendChild(a);a.click();a.remove();
}

async function downloadDocx(type, items) {
  if (!items.length) {
    alert('没有可导出的词条。');
    return;
  }
  try {
    const res = await fetch('/api/export-docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, items })
    });
    if (res.ok) {
      const blob = await res.blob();
      let filename = getDocxFallbackFilename(type);
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
      if (match) { try { filename = decodeURIComponent(match[1]); } catch (_) {} }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      return;
    }
  } catch (_) {}
  downloadWordLikeHtml(type, items);
}

async function exportWrongDocx() {
  const items = getWrongItemsSorted().map(item => ({
    id: item.id, word: item.word, phonetic: item.phonetic || '',
    definition: item.definition, star: !!item.star,
    wrongCount: state.wrongBook?.wrongCounts?.[String(item.id)] || 0
  }));
  await downloadDocx('wrong', items);
}

async function exportVeryUnfamiliarDocx() {
  const selectedItems = getSelectedVeryUnfamiliarItemsForList();
  const selectedLabel = getSelectedVeryUnfamiliarBatchLabel();
  const items = selectedItems.map(item => {
    const batchIdx = getUnfamiliarBatchIndexForWord(item.id);
    const batchText = batchIdx >= 0 ? `第 ${batchIdx + 1} 批` : '未知';
    return {
      id: item.id, word: item.word, phonetic: item.phonetic || '',
      definition: item.definition, star: !!item.star,
      markedAt: state.veryUnfamiliar?.markedAt?.[String(item.id)] || '',
      batchLabel: batchText, exportScope: selectedLabel
    };
  });
  await downloadDocx('veryUnfamiliar', items);
}



async function resetMainProgress() {
  if (!confirm('只重置"单词挑战"进度，不会删除错题本和错误次数。确定继续吗？')) return;
  try {
    const payload = await apiPost('/api/reset-main-progress', {});
    state = payload.state;
    dataPath = payload.dataPath || dataPath;
    renderHome();
    return;
  } catch (_) {}
  state.mainChallenge = { nextIndex: 0, round: 1, history: [] };
  if (state.sessionHistory?.sessions) delete state.sessionHistory.sessions.main;
  await saveState();
  renderHome();
}

function handleHomeEntryAction(action) {
  if (action === 'start-main') {
    console.log('[CET6 enter]', 'start-main');
    startMainChallenge();
    return true;
  }
  if (action === 'wrong-book') {
    console.log('[CET6 enter]', 'wrong-book');
    renderWrongBook();
    return true;
  }
  if (action === 'unfamiliar-page') {
    console.log('[CET6 enter]', 'unfamiliar-page');
    renderUnfamiliarPage();
    return true;
  }
  if (action === 'article-reading') {
    console.log('[CET6 enter]', 'article-reading');
    renderArticleListPage();
    return true;
  }
  return false;
}

function handleClick(event) {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  try {
    if (action === 'home') renderHome();
    if (action === 'start-main') { startMainChallenge(); return; }
    if (action === 'wrong-book') { renderWrongBook(); return; }
    if (action === 'unfamiliar-page') { renderUnfamiliarPage(); return; }
    if (action === 'wrong-sequential') startWrongTraining('sequential');
    if (action === 'wrong-random') startWrongTraining('random');
    if (action === 'unfamiliar-sequential') startUnfamiliarTraining('sequential');
    if (action === 'unfamiliar-random') startUnfamiliarTraining('random');
    if (action === 'very-unfamiliar-sequential') startVeryUnfamiliarTraining('sequential');
    if (action === 'very-unfamiliar-random') startVeryUnfamiliarTraining('random');
    if (action === 'back') {
      if (activeSession && activeSession.mode && activeSession.mode.startsWith('batch-')) {
        if (activeSession.source === 'wrong') renderWrongBook();
        else renderUnfamiliarPage();
      } else if (activeSession && (activeSession.mode === 'wrong-sequential' || activeSession.mode === 'wrong-random')) {
        renderWrongBook();
      } else if (activeSession && (activeSession.mode === 'unfamiliar-sequential' || activeSession.mode === 'unfamiliar-random' || activeSession.mode === 'very-unfamiliar-sequential' || activeSession.mode === 'very-unfamiliar-random')) {
        renderUnfamiliarPage();
      } else {
        renderHome();
      }
    }
    if (action === 'prev-question') showPreviousQuestion();
    if (action === 'next-question') skipOrNextQuestion().catch(showFatalError);
    if (action === 'answer') answer(target.dataset.letter).catch(showFatalError);
    if (action === 'mark-unfamiliar') {
      const wordId = Number(target.dataset.wordId);
      markUnfamiliar(wordId).catch(showFatalError);
    }
    if (action === 'mark-very-unfamiliar') {
      const wordId = Number(target.dataset.wordId);
      markVeryUnfamiliar(wordId).catch(showFatalError);
    }
    if (action === 'repeat-current-batch') repeatCurrentBatch().catch(showFatalError);
    if (action === 'go-next-batch') goNextBatch().catch(showFatalError);
    if (action === 'prev-batch') switchBatch('prev').catch(showFatalError);
    if (action === 'next-batch') switchBatch('next').catch(showFatalError);
    if (action === 'remove-very-unfamiliar') {
      const wordId = Number(target.dataset.wordId);
      removeVeryUnfamiliar(wordId).catch(showFatalError);
    }
    if (action === 'select-very-list-batch') {
      const batch = target.dataset.batch;
      selectedVeryUnfamiliarListBatch = batch === 'all' ? 'all' : Number(batch);
      pendingUnfamiliarPageFocus = 'very-unfamiliar-list';
      renderUnfamiliarPage();
      return;
    }
    if (action === 'select-unfamiliar-list-batch') {
      const batch = target.dataset.batch;
      selectedUnfamiliarListBatch = batch === 'all' ? 'all' : Number(batch);
      pendingUnfamiliarPageFocus = 'unfamiliar-list';
      renderUnfamiliarPage();
      return;
    }
    if (action === 'export-unfamiliar-docx') { exportUnfamiliarDocx().catch(showFatalError); return; }
    if (action === 'article-reading') { renderArticleListPage(); return; }
    if (action === 'article-list') { renderArticleListPage(); return; }
    if (action === 'open-article') { const idx = Number(target.dataset.index); renderArticleReader(idx); return; }
    if (action === 'prev-article') { renderArticleReader(currentArticleIndex - 1); return; }
    if (action === 'next-article') { renderArticleReader(currentArticleIndex + 1); return; }
    if (action === 'toggle-article-meaning') { toggleArticleMeaning(target); return; }
    if (action === 'show-all-article-meanings') { showAllArticleMeanings(); return; }
    if (action === 'hide-all-article-meanings') { hideAllArticleMeanings(); return; }
    if (action === 'toggle-article-vocab-panel') { toggleArticleVocabPanel(); return; }
    if (action === 'close-article-vocab-panel') { closeArticleVocabPanel(); return; }
    if (action === 'toggle-article-list-meaning') { toggleArticleListMeaning(target); return; }
    if (action === 'increment-article-vocab-forget') {
      event.preventDefault();
      event.stopPropagation();
      const button = target.closest('[data-action="increment-article-vocab-forget"]') || target;
      const aId = button.dataset.articleId;
      const w = button.dataset.word || '';
      const p = button.dataset.phonetic || '';
      const m = button.dataset.meaning || '';
      incrementArticleVocabForget(aId, w, p, m, button).catch(showFatalError);
      return;
    }
    if (action === 'toggle-article-vocab-sort') {
      event.preventDefault();
      event.stopPropagation();
      toggleArticleVocabSortMode();
      return;
    }
    if (action === 'export-wrong-docx') exportWrongDocx().catch(showFatalError);
    if (action === 'export-very-unfamiliar-docx') exportVeryUnfamiliarDocx().catch(showFatalError);
    if (action === 'save-gist-config') {
      const tokenInput = document.getElementById('gist-token-input');
      if (tokenInput && tokenInput.value.trim()) setGistToken(tokenInput.value);
      renderHome();
      syncNow({ manual: true }).then(() => renderHome()).catch(() => renderHome());
      return;
    }
    if (action === 'repair-cloud-from-local') {
      if (!confirm('确定用当前本地学习数据覆盖修复云端 Gist 吗？\n\n请先确认当前页面中的进度、错题、陌生词数据是你想保留的版本。')) return;
      repairCloudFromLocalState().then(() => renderHome()).catch(() => renderHome());
      return;
    }
    if (action === 'sync-now') {
      syncNow({ manual: true }).then(() => renderHome()).catch(() => renderHome());
      return;
    }
    if (action === 'copy-gist-id') {
      const id = getGistId();
      if (!id) { alert('还没有 Gist ID。请先保存配置并同步一次。'); return; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(id).then(() => alert('已复制 Gist ID：' + id)).catch(() => alert('Gist ID：' + id));
      } else { alert('Gist ID：' + id); }
      return;
    }
    if (action === 'clear-gist-config') {
      if (!confirm('确定清除本机保存的 GitHub Token 和 Gist ID 吗？云端 Gist 不会被删除。')) return;
      clearGistToken();
      setGistId('');
      localStorage.removeItem('gist_last_sync_time');
      localStorage.removeItem('gist_last_error');
      cloudSyncState.lastSyncTime = '';
      cloudSyncState.lastError = '';
      setCloudSyncStatus('idle', '');
      renderHome();
      return;
    }
    if (action === 'reset-main') resetMainProgress().catch(showFatalError);
  } catch (err) {
    showFatalError(err);
  }
}

function handleKeydown(event) {
  if (currentView !== 'trainer') return;
  const key = event.key.toUpperCase();
  if (!LETTERS.includes(key)) return;
  event.preventDefault();
  answer(key).catch(showFatalError);
}

function showFatalError(err) {
  console.error(err);
  setApp(`
    ${renderTopHomeButton()}
    <div class="error-box">
      <strong>程序出现错误：</strong><br>
      ${escapeHtml(err.message || String(err))}
      <br><br>
      请确认本地服务没有关闭，并检查 server.js 窗口中显示的数据文件路径。
    </div>
    <div class="actions">
      <button class="btn primary" onclick="location.reload()">重新加载</button>
    </div>
  `);
}

async function fetchJsonFromCandidates(paths) {
  for (const p of paths) {
    try {
      const sep = p.includes('?') ? '&' : '?';
      const res = await fetch(p + sep + 'ts=' + Date.now(), { cache: 'no-store' });
      if (res.ok) return await res.json();
    } catch (_) {}
  }
  return null;
}

async function loadWordsCompat() {
  const data = await fetchJsonFromCandidates(['./words.json', '/api/words', '/words.json']);
  if (Array.isArray(data)) { words = data; }
  else if (Array.isArray(window.CET6_WORDS)) { words = window.CET6_WORDS; }
  else { words = []; }
  wordsById = new Map(words.map(w => [Number(w.id), w]));
}

async function init() {
  try {
    await loadWordsCompat();
    wordsById = new Map(words.map(item => [item.id, item]));

    await loadStateCompat();
    state.mainChallenge.nextIndex = clampNumber(state.mainChallenge.nextIndex, 0, words.length, 0);
    if (!Number.isInteger(state.mainChallenge.round) || state.mainChallenge.round < 1) {
      state.mainChallenge.round = 1;
    }

    await loadArticles();

    let lastFocusSyncAt = 0;

function maybeSyncOnFocus() {
  if (!getGistToken()) return;
  const now = Date.now();
  if (now - lastFocusSyncAt < 30000) return;
  lastFocusSyncAt = now;
  syncNow({ manual: false })
    .then(() => { if (currentView === 'home') renderHome(); })
    .catch(() => { if (currentView === 'home') renderHome(); });
}

function rerenderCurrentViewAfterSync() {
  if (currentView === 'home') renderHome();
}

    if (getGistToken()) {
      try { await syncNow({ manual: false }); } catch (_) {}
    }

    window.addEventListener('focus', maybeSyncOnFocus);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybeSyncOnFocus();
    });

    document.removeEventListener('click', handleClick);
    document.addEventListener('click', handleClick);
    console.log('[CET6 init] click listener registered');
    document.addEventListener('keydown', handleKeydown);
    renderHome();
  } catch (err) {
    showFatalError(err);
  }
}

init();
