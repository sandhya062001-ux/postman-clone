const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);
const BODY_FORBIDDEN_METHODS = new Set(['GET', 'HEAD']);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function buildTargetUrl(rawUrl, queryParams = []) {
  const url = new URL(rawUrl);

  for (const param of queryParams) {
    if (!param || param.enabled === false) continue;
    const key = (param.key || '').trim();
    if (!key) continue;
    url.searchParams.append(key, param.value ?? '');
  }

  return url.toString();
}

function buildHeaders(customHeaders = [], auth = {}) {
  const headers = {};

  for (const item of customHeaders) {
    if (!item || item.enabled === false) continue;
    const key = (item.key || '').trim();
    if (!key) continue;
    headers[key] = item.value ?? '';
  }

  if (auth && auth.type === 'bearer' && auth.token?.trim()) {
    headers['Authorization'] = `Bearer ${auth.token.trim()}`;
  } else if (auth && auth.type === 'basic' && (auth.username || auth.password)) {
    const encoded = Buffer.from(`${auth.username ?? ''}:${auth.password ?? ''}`).toString('base64');
    headers['Authorization'] = `Basic ${encoded}`;
  } else if (auth && auth.type === 'apikey' && auth.key?.trim()) {
    if (auth.addTo !== 'query') {
      headers[auth.key.trim()] = auth.value ?? '';
    }
  }

  return headers;
}

function hasHeader(headers, targetKey) {
  const lower = targetKey.toLowerCase();
  return Object.keys(headers).some((k) => k.toLowerCase() === lower);
}

function removeHeaderCaseInsensitive(headers, targetKey) {
  const lower = targetKey.toLowerCase();
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === lower) {
      delete headers[key];
    }
  }
}

function buildBodyAndHeaders(method, bodyConfig, outgoingHeaders) {
  if (BODY_FORBIDDEN_METHODS.has(method)) {
    return { body: undefined, headers: outgoingHeaders };
  }

  // Backward-compatible support if a string body is passed directly
  if (typeof bodyConfig === 'string') {
    if (!bodyConfig.trim()) return { body: undefined, headers: outgoingHeaders };
    if (!hasHeader(outgoingHeaders, 'content-type')) {
      outgoingHeaders['Content-Type'] = 'application/json';
    }
    return { body: bodyConfig, headers: outgoingHeaders };
  }

  const config = bodyConfig && typeof bodyConfig === 'object' ? bodyConfig : { type: 'none' };
  const bodyType = config.type || 'none';

  if (bodyType === 'none') {
    return { body: undefined, headers: outgoingHeaders };
  }

  if (bodyType === 'raw') {
    const raw = config.raw ?? '';
    if (String(raw).trim() === '') {
      return { body: undefined, headers: outgoingHeaders };
    }
    if (!hasHeader(outgoingHeaders, 'content-type')) {
      outgoingHeaders['Content-Type'] = 'application/json';
    }
    return { body: String(raw), headers: outgoingHeaders };
  }

  if (bodyType === 'x-www-form-urlencoded') {
    const params = new URLSearchParams();
    for (const row of config.urlencoded || []) {
      if (!row || row.enabled === false) continue;
      const key = (row.key || '').trim();
      if (!key) continue;
      params.append(key, row.value ?? '');
    }
    if (!hasHeader(outgoingHeaders, 'content-type')) {
      outgoingHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    return { body: params.toString(), headers: outgoingHeaders };
  }

  if (bodyType === 'form-data') {
    const formData = new FormData();
    for (const row of config.formData || []) {
      if (!row || row.enabled === false) continue;
      const key = (row.key || '').trim();
      if (!key) continue;
      formData.append(key, row.value ?? '');
    }
    // Let fetch generate the proper multipart/form-data boundary header
    removeHeaderCaseInsensitive(outgoingHeaders, 'content-type');
    return { body: formData, headers: outgoingHeaders };
  }

  return { body: undefined, headers: outgoingHeaders };
}

app.post('/api/send', async (req, res) => {
  const {
    method,
    url,
    queryParams = [],
    headers = [],
    auth = {},
    body,
    timeoutMs = 15000
  } = req.body || {};

  const normalizedMethod = (method || '').toUpperCase();
  if (!ALLOWED_METHODS.has(normalizedMethod)) {
    return res.status(400).json({
      error: `Unsupported HTTP method "${method}". Allowed methods: GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS.`
    });
  }

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'A valid target URL is required.' });
  }

  let finalUrl;
  try {
    finalUrl = buildTargetUrl(url.trim(), queryParams);
    if (auth?.type === 'apikey' && auth.addTo === 'query' && auth.key?.trim()) {
      const parsed = new URL(finalUrl);
      parsed.searchParams.append(auth.key.trim(), auth.value ?? '');
      finalUrl = parsed.toString();
    }
  } catch {
    return res.status(400).json({ error: 'Invalid URL format. Include http:// or https://.' });
  }

  const parsedTimeout = Math.max(100, Math.min(Number(timeoutMs) || 15000, 300000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error(`Request timed out after ${parsedTimeout}ms`)), parsedTimeout);

  // If the client disconnects / cancels, abort upstream fetch too
 

  const baseHeaders = buildHeaders(headers, auth);
  const { body: outgoingBody, headers: finalHeaders } = buildBodyAndHeaders(
    normalizedMethod,
    body,
    baseHeaders
  );

  const fetchOptions = {
    method: normalizedMethod,
    headers: finalHeaders,
    signal: controller.signal
  };

  if (outgoingBody !== undefined) {
    fetchOptions.body = outgoingBody;
  }

  const startTime = performance.now();

  try {
    const upstreamResponse = await fetch(finalUrl, fetchOptions);
    const elapsedMs = Math.round(performance.now() - startTime);
    const rawText = normalizedMethod === 'HEAD' ? '' : await upstreamResponse.text();

    let parsedBody = rawText;
    if (rawText) {
      try {
        parsedBody = JSON.parse(rawText);
      } catch {
        parsedBody = rawText;
      }
    }

    const responseHeaders = {};
    upstreamResponse.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    return res.json({
      ok: upstreamResponse.ok,
      status: upstreamResponse.status,
      statusText: upstreamResponse.statusText,
      timeMs: elapsedMs,
      sizeBytes: Buffer.byteLength(rawText, 'utf8'),
      finalUrl,
      headers: responseHeaders,
      body: parsedBody,
      rawBody: rawText
    });
  } catch (err) {
    const elapsedMs = Math.round(performance.now() - startTime);
    const isAbort = err?.name === 'AbortError' || controller.signal.aborted;
    return res.status(isAbort ? 408 : 502).json({
      error: `Failed to reach target URL: ${err.message}`,
      causeCode: err.cause?.code ?? (isAbort ? 'ABORTED' : null),
      causeMessage: err.cause?.message ?? (controller.signal.reason?.message || null),
      timeMs: elapsedMs
    });
  } finally {
    clearTimeout(timer);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Postman clone running on port ${PORT}`);
});