const STORAGE_KEYS = {
  HISTORY: 'postman_clone_history_v1',
  ENVS: 'postman_clone_envs_v1',
  ACTIVE_ENV: 'postman_clone_active_env_v1',
  COLLECTIONS: 'postman_clone_collections_v1'
};

// DOM Elements
const methodEl = document.getElementById('method');
const urlEl = document.getElementById('url');
const timeoutInputEl = document.getElementById('timeoutInput');
const sendBtn = document.getElementById('sendBtn');
const cancelBtn = document.getElementById('cancelBtn');

const paramsList = document.getElementById('paramsList');
const headersList = document.getElementById('headersList');
const formDataList = document.getElementById('formDataList');
const urlencodedList = document.getElementById('urlencodedList');

const addParamBtn = document.getElementById('addParamBtn');
const addHeaderBtn = document.getElementById('addHeaderBtn');
const addFormDataBtn = document.getElementById('addFormDataBtn');
const addUrlencodedBtn = document.getElementById('addUrlencodedBtn');

const authTypeEl = document.getElementById('authType');
const bodyInputEl = document.getElementById('bodyInput');
const autoContentTypeHint = document.getElementById('autoContentTypeHint');

const statusBadge = document.getElementById('statusBadge');
const timeBadge = document.getElementById('timeBadge');
const sizeBadge = document.getElementById('sizeBadge');
const responseBodyEl = document.getElementById('responseBody');
const responseHeadersEl = document.getElementById('responseHeaders');
const respHeaderCountEl = document.getElementById('respHeaderCount');
const prettyBtn = document.getElementById('prettyBtn');
const rawBtn = document.getElementById('rawBtn');
const bodyFormatToggleGroup = document.getElementById('bodyFormatToggleGroup');

const historyListEl = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

const envSelectEl = document.getElementById('envSelect');
const manageEnvBtn = document.getElementById('manageEnvBtn');
const envEditorPanel = document.getElementById('envEditorPanel');
const activeEnvNameLabel = document.getElementById('activeEnvNameLabel');
const addEnvBtn = document.getElementById('addEnvBtn');
const addEnvVarBtn = document.getElementById('addEnvVarBtn');
const closeEnvEditorBtn = document.getElementById('closeEnvEditorBtn');
const envVarsListEl = document.getElementById('envVarsList');

const collectionsListEl = document.getElementById('collectionsList');
const newFolderBtn = document.getElementById('newFolderBtn');
const saveToCollectionBtn = document.getElementById('saveToCollectionBtn');
const exportCollectionsBtn = document.getElementById('exportCollectionsBtn');

const toggleCodeGenBtn = document.getElementById('toggleCodeGenBtn');
const codeGenPanel = document.getElementById('codeGenPanel');
const codeModeCurlBtn = document.getElementById('codeModeCurlBtn');
const codeModeFetchBtn = document.getElementById('codeModeFetchBtn');
const copyCodeGenBtn = document.getElementById('copyCodeGenBtn');
const closeCodeGenBtn = document.getElementById('closeCodeGenBtn');
const codeGenOutputEl = document.getElementById('codeGenOutput');

// App State
let activeController = null;
let codeGenMode = 'curl';
let bodyViewMode = 'pretty';
let lastResponseData = null;

function loadJsonStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJsonStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

let environments = loadJsonStorage(STORAGE_KEYS.ENVS, {
  Default: [{ key: 'baseUrl', value: 'https://jsonplaceholder.typicode.com' }]
});
let activeEnvName = localStorage.getItem(STORAGE_KEYS.ACTIVE_ENV) || Object.keys(environments)[0] || 'Default';
if (!environments[activeEnvName]) {
  activeEnvName = Object.keys(environments)[0] || 'Default';
}

let historyItems = loadJsonStorage(STORAGE_KEYS.HISTORY, []);
let collections = loadJsonStorage(STORAGE_KEYS.COLLECTIONS, {
  'General Requests': []
});

// Request Tabs
document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn[data-tab]').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Response Tabs (Body vs Headers)
document.querySelectorAll('.resp-tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.resp-tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.resp-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`resp-tab-${btn.dataset.respTab}`).classList.add('active');
    bodyFormatToggleGroup.classList.toggle('hidden', btn.dataset.respTab !== 'body');
  });
});

// Pretty / Raw Toggle for Response Body
function renderResponseBody() {
  if (!lastResponseData) return;

  if (lastResponseData.isError) {
    responseBodyEl.textContent =
      bodyViewMode === 'pretty'
        ? JSON.stringify(lastResponseData.errorObj, null, 2)
        : lastResponseData.rawErrorText;
    return;
  }

  if (bodyViewMode === 'pretty') {
    if (typeof lastResponseData.body === 'object' && lastResponseData.body !== null) {
      responseBodyEl.textContent = JSON.stringify(lastResponseData.body, null, 2);
    } else {
      try {
        responseBodyEl.textContent = JSON.stringify(JSON.parse(lastResponseData.rawBody), null, 2);
      } catch {
        responseBodyEl.textContent = lastResponseData.rawBody ?? '';
      }
    }
  } else {
    responseBodyEl.textContent =
      lastResponseData.rawBody ??
      (typeof lastResponseData.body === 'string'
        ? lastResponseData.body
        : JSON.stringify(lastResponseData.body));
  }
}

prettyBtn.addEventListener('click', () => {
  bodyViewMode = 'pretty';
  prettyBtn.classList.add('active');
  rawBtn.classList.remove('active');
  renderResponseBody();
});

rawBtn.addEventListener('click', () => {
  bodyViewMode = 'raw';
  rawBtn.classList.add('active');
  prettyBtn.classList.remove('active');
  renderResponseBody();
});

// Auth toggle
function updateAuthFields() {
  document.querySelectorAll('.auth-fields').forEach((el) => el.classList.add('hidden'));
  const selected = authTypeEl.value;
  if (selected !== 'none') {
    document.getElementById(`auth-${selected}`).classList.remove('hidden');
  }
}
authTypeEl.addEventListener('change', updateAuthFields);

// Body Type & Method Rules (GET and HEAD drop body)
function getSelectedBodyType() {
  const checked = document.querySelector('input[name="bodyType"]:checked');
  return checked ? checked.value : 'none';
}

function setSelectedBodyType(type) {
  const radio = document.querySelector(`input[name="bodyType"][value="${type}"]`);
  if (radio) radio.checked = true;
  syncBodyStateWithMethodAndType();
}

function syncBodyStateWithMethodAndType() {
  const method = methodEl.value;
  const bodyForbidden = method === 'GET' || method === 'HEAD';
  const bodyType = getSelectedBodyType();

  document.querySelectorAll('input[name="bodyType"]').forEach((r) => {
    r.disabled = bodyForbidden;
  });

  document.getElementById('body-none-note').classList.toggle('hidden', !bodyForbidden && bodyType !== 'none');
  document.getElementById('body-raw-box').classList.toggle('hidden', bodyForbidden || bodyType !== 'raw');
  document.getElementById('body-formdata-box').classList.toggle('hidden', bodyForbidden || bodyType !== 'form-data');
  document.getElementById('body-urlencoded-box').classList.toggle('hidden', bodyForbidden || bodyType !== 'x-www-form-urlencoded');

  if (bodyForbidden) {
    document.getElementById('body-none-note').textContent =
      `${method} requests do not send a body. Switch to POST, PUT, PATCH, DELETE, or OPTIONS to configure a body.`;
    autoContentTypeHint.textContent = `Auto Content-Type: none (${method} requests omit request bodies).`;
  } else {
    document.getElementById('body-none-note').textContent = 'No request body will be sent.';
    const contentTypeMap = {
      none: 'none',
      raw: 'application/json',
      'form-data': 'multipart/form-data (boundary set automatically)',
      'x-www-form-urlencoded': 'application/x-www-form-urlencoded'
    };
    autoContentTypeHint.textContent = `Auto Content-Type: ${contentTypeMap[bodyType]} (unless overridden in Headers).`;
  }

  refreshCodeGenIfOpen();
}

methodEl.addEventListener('change', syncBodyStateWithMethodAndType);
document.querySelectorAll('input[name="bodyType"]').forEach((radio) => {
  radio.addEventListener('change', syncBodyStateWithMethodAndType);
});

// Reusable Key-Value Row Helper
function createKvRow(container, keyPlaceholder = 'Key', valuePlaceholder = 'Value', initial = {}) {
  const row = document.createElement('div');
  row.className = 'kv-row';

  const enabledCheckbox = document.createElement('input');
  enabledCheckbox.type = 'checkbox';
  enabledCheckbox.checked = initial.enabled !== false;

  const keyInput = document.createElement('input');
  keyInput.type = 'text';
  keyInput.placeholder = keyPlaceholder;
  keyInput.value = initial.key || '';

  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.placeholder = valuePlaceholder;
  valueInput.value = initial.value || '';

  const removeBtn = document.createElement('button');
  removeBtn.type = 'button';
  removeBtn.textContent = '✕';
  removeBtn.addEventListener('click', () => {
    row.remove();
    refreshCodeGenIfOpen();
  });

  row.append(enabledCheckbox, keyInput, valueInput, removeBtn);
  container.appendChild(row);
}

function collectKvRows(container) {
  return Array.from(container.querySelectorAll('.kv-row')).map((row) => {
    const [enabledCheckbox, keyInput, valueInput] = row.querySelectorAll('input');
    return {
      enabled: enabledCheckbox.checked,
      key: keyInput.value,
      value: valueInput.value
    };
  });
}

function setKvRows(container, rows, keyPlaceholder, valuePlaceholder) {
  container.innerHTML = '';
  const list = rows && rows.length ? rows : [{}];
  list.forEach((r) => createKvRow(container, keyPlaceholder, valuePlaceholder, r));
}

addParamBtn.addEventListener('click', () => createKvRow(paramsList, 'Param key', 'Param value'));
addHeaderBtn.addEventListener('click', () => createKvRow(headersList, 'Header name', 'Header value'));
addFormDataBtn.addEventListener('click', () => createKvRow(formDataList, 'Field name', 'Field value'));
addUrlencodedBtn.addEventListener('click', () => createKvRow(urlencodedList, 'Field name', 'Field value'));

// Environment Variables ({{varName}})
function getActiveEnvVarsMap() {
  const map = {};
  const list = environments[activeEnvName] || [];
  for (const item of list) {
    if (item && item.key && item.key.trim()) {
      map[item.key.trim()] = item.value ?? '';
    }
  }
  return map;
}

function interpolateVars(text) {
  if (typeof text !== 'string') return text;
  const vars = getActiveEnvVarsMap();
  return text.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (match, varName) => {
    return Object.prototype.hasOwnProperty.call(vars, varName) ? vars[varName] : match;
  });
}

function renderEnvSelect() {
  envSelectEl.innerHTML = '';
  Object.keys(environments).forEach((name) => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === activeEnvName) opt.selected = true;
    envSelectEl.appendChild(opt);
  });
}

function renderEnvVarsEditor() {
  activeEnvNameLabel.textContent = activeEnvName;
  envVarsListEl.innerHTML = '';
  const list = environments[activeEnvName] || [];
  list.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'kv-row';

    const kInput = document.createElement('input');
    kInput.type = 'text';
    kInput.placeholder = 'Variable name (e.g. baseUrl)';
    kInput.value = item.key || '';
    kInput.addEventListener('input', () => {
      environments[activeEnvName][index].key = kInput.value;
      saveJsonStorage(STORAGE_KEYS.ENVS, environments);
      refreshCodeGenIfOpen();
    });

    const vInput = document.createElement('input');
    vInput.type = 'text';
    vInput.placeholder = 'Variable value';
    vInput.value = item.value || '';
    vInput.addEventListener('input', () => {
      environments[activeEnvName][index].value = vInput.value;
      saveJsonStorage(STORAGE_KEYS.ENVS, environments);
      refreshCodeGenIfOpen();
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.textContent = '✕';
    delBtn.addEventListener('click', () => {
      environments[activeEnvName].splice(index, 1);
      saveJsonStorage(STORAGE_KEYS.ENVS, environments);
      renderEnvVarsEditor();
      refreshCodeGenIfOpen();
    });

    row.append(kInput, vInput, delBtn);
    envVarsListEl.appendChild(row);
  });
}

envSelectEl.addEventListener('change', () => {
  activeEnvName = envSelectEl.value;
  localStorage.setItem(STORAGE_KEYS.ACTIVE_ENV, activeEnvName);
  renderEnvVarsEditor();
  refreshCodeGenIfOpen();
});

manageEnvBtn.addEventListener('click', () => {
  envEditorPanel.classList.toggle('hidden');
  renderEnvVarsEditor();
});

closeEnvEditorBtn.addEventListener('click', () => {
  envEditorPanel.classList.add('hidden');
});

addEnvBtn.addEventListener('click', () => {
  const name = prompt('Enter new environment name (e.g. Staging, Prod):');
  if (!name || !name.trim()) return;
  const cleanName = name.trim();
  if (!environments[cleanName]) {
    environments[cleanName] = [{ key: 'baseUrl', value: '' }];
  }
  activeEnvName = cleanName;
  saveJsonStorage(STORAGE_KEYS.ENVS, environments);
  localStorage.setItem(STORAGE_KEYS.ACTIVE_ENV, activeEnvName);
  renderEnvSelect();
  renderEnvVarsEditor();
});

addEnvVarBtn.addEventListener('click', () => {
  if (!environments[activeEnvName]) environments[activeEnvName] = [];
  environments[activeEnvName].push({ key: '', value: '' });
  saveJsonStorage(STORAGE_KEYS.ENVS, environments);
  renderEnvVarsEditor();
});

// Snapshot & Interpolation Builders
function getRawRequestSnapshot() {
  const bodyType = getSelectedBodyType();
  return {
    method: methodEl.value,
    url: urlEl.value,
    timeoutMs: Number(timeoutInputEl.value) || 15000,
    queryParams: collectKvRows(paramsList),
    headers: collectKvRows(headersList),
    auth: {
      type: authTypeEl.value,
      token: document.getElementById('bearerToken').value,
      username: document.getElementById('basicUser').value,
      password: document.getElementById('basicPass').value,
      key: document.getElementById('apiKeyName').value,
      value: document.getElementById('apiKeyValue').value,
      addTo: document.getElementById('apiKeyLocation').value
    },
    body: {
      type: bodyType,
      raw: bodyInputEl.value,
      formData: collectKvRows(formDataList),
      urlencoded: collectKvRows(urlencodedList)
    }
  };
}

function applyRequestSnapshot(reqData) {
  if (!reqData) return;
  methodEl.value = reqData.method || 'GET';
  urlEl.value = reqData.url || '';
  timeoutInputEl.value = reqData.timeoutMs || 15000;

  setKvRows(paramsList, reqData.queryParams, 'Param key', 'Param value');
  setKvRows(headersList, reqData.headers, 'Header name', 'Header value');

  const auth = reqData.auth || { type: 'none' };
  authTypeEl.value = auth.type || 'none';
  document.getElementById('bearerToken').value = auth.token || '';
  document.getElementById('basicUser').value = auth.username || '';
  document.getElementById('basicPass').value = auth.password || '';
  document.getElementById('apiKeyName').value = auth.key || '';
  document.getElementById('apiKeyValue').value = auth.value || '';
  document.getElementById('apiKeyLocation').value = auth.addTo || 'header';
  updateAuthFields();

  const body = reqData.body || { type: 'none' };
  bodyInputEl.value = body.raw || '';
  setKvRows(formDataList, body.formData, 'Field name', 'Field value');
  setKvRows(urlencodedList, body.urlencoded, 'Field name', 'Field value');
  setSelectedBodyType(body.type || 'none');
  syncBodyStateWithMethodAndType();
  refreshCodeGenIfOpen();
}

function buildResolvedPayload(rawSnap) {
  return {
    method: rawSnap.method,
    url: interpolateVars(rawSnap.url),
    timeoutMs: rawSnap.timeoutMs,
    queryParams: rawSnap.queryParams.map((p) => ({
      ...p,
      key: interpolateVars(p.key),
      value: interpolateVars(p.value)
    })),
    headers: rawSnap.headers.map((h) => ({
      ...h,
      key: interpolateVars(h.key),
      value: interpolateVars(h.value)
    })),
    auth: {
      ...rawSnap.auth,
      token: interpolateVars(rawSnap.auth.token),
      username: interpolateVars(rawSnap.auth.username),
      password: interpolateVars(rawSnap.auth.password),
      key: interpolateVars(rawSnap.auth.key),
      value: interpolateVars(rawSnap.auth.value)
    },
    body: {
      type: rawSnap.body.type,
      raw: interpolateVars(rawSnap.body.raw),
      formData: rawSnap.body.formData.map((f) => ({
        ...f,
        key: interpolateVars(f.key),
        value: interpolateVars(f.value)
      })),
      urlencoded: rawSnap.body.urlencoded.map((u) => ({
        ...u,
        key: interpolateVars(u.key),
        value: interpolateVars(u.value)
      }))
    }
  };
}

// Request History (localStorage)
function addToHistory(rawSnap, statusSummary) {
  const entry = {
    id: Date.now(),
    timestamp: new Date().toLocaleTimeString(),
    statusSummary,
    request: rawSnap
  };
  historyItems = [entry, ...historyItems].slice(0, 30);
  saveJsonStorage(STORAGE_KEYS.HISTORY, historyItems);
  renderHistory();
}

function renderHistory() {
  historyListEl.innerHTML = '';
  if (!historyItems.length) {
    historyListEl.innerHTML = '<div class="muted">No requests yet.</div>';
    return;
  }

  historyItems.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'history-item';
    div.innerHTML = `
      <div class="history-top">
        <span class="method-tag">${item.request.method}</span>
        <span class="muted">${item.statusSummary || item.timestamp}</span>
      </div>
      <div class="url-truncate" title="${item.request.url}">${item.request.url || '(no url)'}</div>
    `;
    div.addEventListener('click', () => applyRequestSnapshot(item.request));
    historyListEl.appendChild(div);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  historyItems = [];
  saveJsonStorage(STORAGE_KEYS.HISTORY, historyItems);
  renderHistory();
});

// Collections (Folders + Save + Export JSON)
function renderCollections() {
  collectionsListEl.innerHTML = '';
  const folders = Object.keys(collections);
  if (!folders.length) {
    collectionsListEl.innerHTML = '<div class="muted">No folders yet.</div>';
    return;
  }

  folders.forEach((folderName) => {
    const box = document.createElement('div');
    box.className = 'folder-box';

    const title = document.createElement('div');
    title.className = 'folder-title';
    title.innerHTML = `<span>📁 ${folderName}</span><span class="muted">${collections[folderName].length}</span>`;
    box.appendChild(title);

    (collections[folderName] || []).forEach((savedReq, idx) => {
      const reqDiv = document.createElement('div');
      reqDiv.className = 'collection-req-item';
      reqDiv.innerHTML = `
        <div class="history-top">
          <span class="method-tag">${savedReq.request.method}</span>
          <span class="muted">${savedReq.name}</span>
        </div>
        <div class="url-truncate">${savedReq.request.url || ''}</div>
      `;
      reqDiv.addEventListener('click', () => applyRequestSnapshot(savedReq.request));
      reqDiv.title = `Click to load "${savedReq.name}" (item #${idx + 1})`;
      box.appendChild(reqDiv);
    });

    collectionsListEl.appendChild(box);
  });
}

newFolderBtn.addEventListener('click', () => {
  const name = prompt('Enter folder name:');
  if (!name || !name.trim()) return;
  const clean = name.trim();
  if (!collections[clean]) collections[clean] = [];
  saveJsonStorage(STORAGE_KEYS.COLLECTIONS, collections);
  renderCollections();
});

saveToCollectionBtn.addEventListener('click', () => {
  const folders = Object.keys(collections);
  if (!folders.length) {
    collections['General Requests'] = [];
  }
  const folderList = Object.keys(collections);
  const chosenFolder = prompt(
    `Save to which folder?\nAvailable: ${folderList.join(', ')}`,
    folderList[0]
  );
  if (!chosenFolder || !chosenFolder.trim()) return;
  const folder = chosenFolder.trim();
  if (!collections[folder]) collections[folder] = [];

  const reqName = prompt('Enter a name for this request:', `${methodEl.value} ${urlEl.value || 'Request'}`);
  if (!reqName || !reqName.trim()) return;

  collections[folder].push({
    name: reqName.trim(),
    savedAt: new Date().toISOString(),
    request: getRawRequestSnapshot()
  });

  saveJsonStorage(STORAGE_KEYS.COLLECTIONS, collections);
  renderCollections();
});

exportCollectionsBtn.addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(collections, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'postman-clone-collections.json';
  link.click();
  URL.revokeObjectURL(link.href);
});

// Code Generation (cURL & JS fetch)
function buildEffectiveUrlForPreview(payload) {
  try {
    const u = new URL(payload.url);
    for (const p of payload.queryParams || []) {
      if (p.enabled !== false && p.key?.trim()) {
        u.searchParams.append(p.key.trim(), p.value ?? '');
      }
    }
    if (payload.auth?.type === 'apikey' && payload.auth.addTo === 'query' && payload.auth.key?.trim()) {
      u.searchParams.append(payload.auth.key.trim(), payload.auth.value ?? '');
    }
    return u.toString();
  } catch {
    return payload.url || '';
  }
}

function buildEffectiveHeadersForPreview(payload) {
  const h = {};
  for (const row of payload.headers || []) {
    if (row.enabled !== false && row.key?.trim()) {
      h[row.key.trim()] = row.value ?? '';
    }
  }
  if (payload.auth?.type === 'bearer' && payload.auth.token?.trim()) {
    h['Authorization'] = `Bearer ${payload.auth.token.trim()}`;
  } else if (payload.auth?.type === 'basic' && (payload.auth.username || payload.auth.password)) {
    h['Authorization'] = `Basic ${btoa(`${payload.auth.username ?? ''}:${payload.auth.password ?? ''}`)}`;
  } else if (payload.auth?.type === 'apikey' && payload.auth.addTo !== 'query' && payload.auth.key?.trim()) {
    h[payload.auth.key.trim()] = payload.auth.value ?? '';
  }
  return h;
}

function generateCodeSnippet(mode) {
  const payload = buildResolvedPayload(getRawRequestSnapshot());
  const method = (payload.method || 'GET').toUpperCase();
  const targetUrl = buildEffectiveUrlForPreview(payload);
  const headers = buildEffectiveHeadersForPreview(payload);
  const bodyForbidden = method === 'GET' || method === 'HEAD';

  let bodyArg = null;
  if (!bodyForbidden && payload.body?.type === 'raw' && payload.body.raw?.trim()) {
    bodyArg = payload.body.raw;
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/json';
    }
  } else if (!bodyForbidden && payload.body?.type === 'x-www-form-urlencoded') {
    const sp = new URLSearchParams();
    for (const r of payload.body.urlencoded || []) {
      if (r.enabled !== false && r.key?.trim()) sp.append(r.key.trim(), r.value ?? '');
    }
    bodyArg = sp.toString();
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
    }
  }

  if (mode === 'curl') {
    const esc = (s) => String(s).replace(/'/g, `'\\''`);
    const parts = [`curl -X ${method} '${esc(targetUrl)}'`];
    for (const [k, v] of Object.entries(headers)) {
      parts.push(`  -H '${esc(`${k}: ${v}`)}'`);
    }
    if (!bodyForbidden && payload.body?.type === 'form-data') {
      for (const r of payload.body.formData || []) {
        if (r.enabled !== false && r.key?.trim()) {
          parts.push(`  -F '${esc(`${r.key.trim()}=${r.value ?? ''}`)}'`);
        }
      }
    } else if (bodyArg !== null) {
      parts.push(`  -d '${esc(bodyArg)}'`);
    }
    return parts.join(' \\\n');
  }

  // JavaScript fetch snippet
  const opts = [`  method: ${JSON.stringify(method)}`];
  if (Object.keys(headers).length) {
    opts.push(`  headers: ${JSON.stringify(headers, null, 4).replace(/\n/g, '\n  ')}`);
  }
  if (!bodyForbidden && payload.body?.type === 'form-data') {
    const fdLines = ['  const formData = new FormData();'];
    for (const r of payload.body.formData || []) {
      if (r.enabled !== false && r.key?.trim()) {
        fdLines.push(`  formData.append(${JSON.stringify(r.key.trim())}, ${JSON.stringify(r.value ?? '')});`);
      }
    }
    opts.push(`  body: formData`);
    return `${fdLines.join('\n')}\n\nfetch(${JSON.stringify(targetUrl)}, {\n${opts.join(',\n')}\n});`;
  }
  if (bodyArg !== null) {
    opts.push(`  body: ${JSON.stringify(bodyArg)}`);
  }
  return `fetch(${JSON.stringify(targetUrl)}, {\n${opts.join(',\n')}\n});`;
}

function refreshCodeGenIfOpen() {
  if (!codeGenPanel.classList.contains('hidden')) {
    codeGenOutputEl.textContent = generateCodeSnippet(codeGenMode);
  }
}

toggleCodeGenBtn.addEventListener('click', () => {
  codeGenPanel.classList.toggle('hidden');
  refreshCodeGenIfOpen();
});

closeCodeGenBtn.addEventListener('click', () => {
  codeGenPanel.classList.add('hidden');
});

codeModeCurlBtn.addEventListener('click', () => {
  codeGenMode = 'curl';
  codeModeCurlBtn.classList.add('active');
  codeModeFetchBtn.classList.remove('active');
  refreshCodeGenIfOpen();
});

codeModeFetchBtn.addEventListener('click', () => {
  codeGenMode = 'fetch';
  codeModeFetchBtn.classList.add('active');
  codeModeCurlBtn.classList.remove('active');
  refreshCodeGenIfOpen();
});

copyCodeGenBtn.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(codeGenOutputEl.textContent);
    copyCodeGenBtn.textContent = 'Copied!';
    setTimeout(() => (copyCodeGenBtn.textContent = 'Copy Snippet'), 1200);
  } catch {
    alert('Could not copy automatically; please copy from the box.');
  }
});

// Send & Cancel Request with AbortController
function setSendingState(isSending) {
  sendBtn.disabled = isSending;
  sendBtn.textContent = isSending ? 'Sending...' : 'Send';
  cancelBtn.classList.toggle('hidden', !isSending);
}

cancelBtn.addEventListener('click', () => {
  if (activeController) {
    activeController.abort();
  }
});

sendBtn.addEventListener('click', async () => {
  const rawSnap = getRawRequestSnapshot();
  const payload = buildResolvedPayload(rawSnap);

  activeController = new AbortController();
  setSendingState(true);
  statusBadge.className = '';
  statusBadge.textContent = 'Status: Sending...';
  responseBodyEl.textContent = 'Loading...';
  responseHeadersEl.textContent = '{}';
  respHeaderCountEl.textContent = '0';

  try {
    const res = await fetch('/api/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: activeController.signal
    });

    const data = await res.json();

    if (!res.ok || data.error) {
      const errorObj = {
        error: data.error || 'Request failed',
        causeCode: data.causeCode ?? null,
        causeMessage: data.causeMessage ?? null
      };
      lastResponseData = {
        isError: true,
        errorObj,
        rawErrorText: JSON.stringify(errorObj)
      };
      statusBadge.className = 'status-err';
      statusBadge.textContent = `Status: Error (${res.status})`;
      timeBadge.textContent = `Time: ${data.timeMs ?? '-'} ms`;
      sizeBadge.textContent = 'Size: -';
      renderResponseBody();
      addToHistory(rawSnap, `${res.status} Err`);
      return;
    }

    lastResponseData = {
      isError: false,
      body: data.body,
      rawBody: data.rawBody ?? (typeof data.body === 'string' ? data.body : JSON.stringify(data.body))
    };

    statusBadge.className = data.ok ? 'status-ok' : 'status-err';
    statusBadge.textContent = `Status: ${data.status} ${data.statusText}`;
    timeBadge.textContent = `Time: ${data.timeMs} ms`;
    sizeBadge.textContent = `Size: ${data.sizeBytes} bytes`;
    renderResponseBody();

    const respHeaders = data.headers || {};
    respHeaderCountEl.textContent = String(Object.keys(respHeaders).length);
    responseHeadersEl.textContent = JSON.stringify(respHeaders, null, 2);

    addToHistory(rawSnap, `${data.status}`);
  } catch (err) {
    const isClientCancel = err?.name === 'AbortError';
    const errorObj = {
      error: isClientCancel ? 'Request cancelled by user' : err.message,
      causeCode: isClientCancel ? 'CLIENT_CANCELLED' : null,
      causeMessage: null
    };
    lastResponseData = {
      isError: true,
      errorObj,
      rawErrorText: JSON.stringify(errorObj)
    };
    statusBadge.className = 'status-err';
    statusBadge.textContent = isClientCancel ? 'Status: Cancelled' : 'Status: Network Error';
    renderResponseBody();
    addToHistory(rawSnap, isClientCancel ? 'Cancelled' : 'NetErr');
  } finally {
    activeController = null;
    setSendingState(false);
  }
});

// Initial Setup
setKvRows(paramsList, [], 'Param key', 'Param value');
setKvRows(headersList, [], 'Header name', 'Header value');
setKvRows(formDataList, [], 'Field name', 'Field value');
setKvRows(urlencodedList, [], 'Field name', 'Field value');
syncBodyStateWithMethodAndType();
renderEnvSelect();
renderHistory();
renderCollections();