/**
 * Provider transport. Apps Script has no npm runtime, so this talks to the
 * three wire formats directly instead of going through an SDK:
 * OpenAI-compatible (OpenAI, OpenRouter, DeepSeek, Groq, local),
 * Anthropic Messages, and Gemini generateContent.
 */

const PROVIDERS_ = {
  openrouter: { shape: 'openai', base: 'https://openrouter.ai/api/v1', label: 'OpenRouter' },
  openai: { shape: 'openai', base: 'https://api.openai.com/v1', label: 'OpenAI' },
  anthropic: { shape: 'anthropic', base: 'https://api.anthropic.com/v1', label: 'Anthropic' },
  google: { shape: 'google', base: 'https://generativelanguage.googleapis.com/v1beta', label: 'Google AI' },
  custom: { shape: 'openai', base: '', label: 'Custom (OpenAI-compatible)' },
};

function providerIds_() {
  return Object.keys(PROVIDERS_);
}

// Every provider spells reasoning effort differently, and the values happen to
// line up, so one setting drives all four:
//   OpenRouter  reasoning.effort            (normalized across its own backends)
//   OpenAI      reasoning_effort
//   Anthropic   effort
//   Gemini      generationConfig.thinking_level
const THINKING_LEVELS_ = ['low', 'medium', 'high'];

/**
 * Model ids are usually copied out of OpenRouter's catalog, where every id is
 * `vendor/model`. The native APIs reject that prefix, and Gemini also rejects
 * its own `models/` prefix here because the URL already carries one. Left alone
 * for OpenRouter and for custom endpoints, where a slash can be part of the id
 * (`meta-llama/Llama-3-8B` on a self-hosted server).
 */
function normalizeModel_(providerId, model) {
  if (providerId === 'openrouter' || providerId === 'custom') return model;
  return model.replace(/^[a-zA-Z0-9._-]+\//, '');
}

function buildRequest_(cfg, noThinking) {
  const provider = PROVIDERS_[cfg.provider];
  if (!provider) throw new Error('Unknown provider: ' + cfg.provider);
  const model = normalizeModel_(cfg.provider, cfg.model);
  const base = (cfg.provider === 'custom' ? cfg.baseUrl : provider.base).replace(/\/+$/, '');
  if (!base) throw new Error('Set the base URL for the custom provider.');
  if (base.indexOf('https://') !== 0) throw new Error('The base URL must use https.');

  const thinking = noThinking || THINKING_LEVELS_.indexOf(cfg.thinking) < 0 ? null : cfg.thinking;
  let url;
  let headers;
  let payload;

  if (provider.shape === 'anthropic') {
    url = base + '/messages';
    headers = { 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' };
    payload = {
      model: model,
      max_tokens: 4096,
      system: cfg.system,
      messages: [{ role: 'user', content: cfg.text }],
    };
    if (thinking !== null) payload.effort = thinking;
  } else if (provider.shape === 'google') {
    url = base + '/models/' + encodeURIComponent(model) + ':generateContent';
    headers = { 'x-goog-api-key': cfg.apiKey };
    payload = {
      systemInstruction: { parts: [{ text: cfg.system }] },
      contents: [{ role: 'user', parts: [{ text: cfg.text }] }],
    };
    if (thinking !== null) payload.generationConfig = { thinking_level: thinking };
  } else {
    url = base + '/chat/completions';
    headers = { Authorization: 'Bearer ' + cfg.apiKey };
    if (base.indexOf('openrouter.ai') >= 0) {
      headers['HTTP-Referer'] = 'https://github.com/one-focus/llm-for-sheets';
      headers['X-OpenRouter-Title'] = 'LLM for Sheets';
    }
    payload = {
      model: model,
      messages: [
        { role: 'system', content: cfg.system },
        { role: 'user', content: cfg.text },
      ],
    };
    if (thinking !== null) {
      // OpenRouter normalizes `reasoning` across the backends it fronts; the
      // native OpenAI field is flat. A custom endpoint gets the OpenAI spelling
      // and, if it refuses, the retry below drops the field entirely.
      if (cfg.provider === 'openrouter') payload.reasoning = { effort: thinking };
      else payload.reasoning_effort = thinking;
    }
  }

  return {
    shape: provider.shape,
    url: url,
    options: {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    },
  };
}

function callModel_(cfg) {
  let noThinking = false;
  for (let attempt = 0; ; attempt++) {
    const request = buildRequest_(cfg, noThinking);
    const response = UrlFetchApp.fetch(request.url, request.options);
    const status = response.getResponseCode();
    const body = response.getContentText();
    if (status === 200) return parseAnswer_(request.shape, body);

    const message = errorMessage_(body) || 'HTTP ' + status;
    // Models without reasoning reject the effort field; retry once without it.
    if (status === 400 && !noThinking && /reasoning|thinking|effort/i.test(message)) {
      noThinking = true;
      continue;
    }
    if ((status === 429 || status >= 500) && attempt < 2) {
      Utilities.sleep(1000 * (attempt + 1));
      continue;
    }
    throw new Error('LLM for Sheets: ' + message);
  }
}

function parseAnswer_(shape, body) {
  const json = JSON.parse(body);
  let text = '';
  if (shape === 'anthropic') {
    text = (json.content || [])
      .filter(function (block) {
        return block.type === 'text';
      })
      .map(function (block) {
        return block.text || '';
      })
      .join('');
  } else if (shape === 'google') {
    const candidate = (json.candidates || [])[0] || {};
    text = ((candidate.content || {}).parts || [])
      .map(function (part) {
        return part.text || '';
      })
      .join('');
  } else {
    const choice = (json.choices || [])[0] || {};
    text = (choice.message || {}).content || '';
  }
  if (!text.trim()) throw new Error('LLM for Sheets: ' + (errorMessage_(body) || 'the model returned no text.'));
  return text;
}

/** All three APIs report failures as `{ error: { message } }`. */
function errorMessage_(body) {
  try {
    const error = JSON.parse(body).error;
    if (!error) return '';
    return String(error.message || error).slice(0, 300);
  } catch (e) {
    return '';
  }
}

// ------------------------------------------------------------- model listings

// Filters ported from the extension's `packages/storage/lib/models/providerModels.ts`.
// Every provider mixes non-chat models into its `/models` response.
const OPENAI_ACCEPT_ = /^(gpt-|o\d|chatgpt-)/i;
const OPENAI_REJECT_PREFIX_ =
  /^(text-embedding|whisper|tts|dall-e|gpt-image|omni-moderation|text-moderation|babbage|davinci|computer-use)/i;
const OPENAI_REJECT_SUBSTR_ = /(audio|realtime|transcribe|-tts\b|-search-preview|-image-preview|-image\b)/i;
const GEMINI_REJECT_ = /(embedding|^aqa|tts|live|native-audio|image-preview|image-generation)/i;
const COMPAT_REJECT_ = /(whisper|tts|embed|guard|image|audio|moderation|transcribe|rerank)/i;

function modelsRequest_(providerId, apiKey, baseUrl) {
  const provider = PROVIDERS_[providerId];
  if (!provider) throw new Error('Unknown provider: ' + providerId);
  // OpenRouter's catalog is public; every other endpoint needs the key.
  if (!apiKey && providerId !== 'openrouter') throw new Error('LLM for Sheets: add the API key first.');
  const base = (providerId === 'custom' ? baseUrl : provider.base).replace(/\/+$/, '');
  if (!base) throw new Error('LLM for Sheets: set the base URL for the custom provider.');

  if (providerId === 'anthropic') {
    return { url: base + '/models?limit=1000', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' } };
  }
  if (providerId === 'google') {
    // pageSize covers the whole catalog, so nextPageToken is never followed.
    return { url: base + '/models?pageSize=1000', headers: { 'x-goog-api-key': apiKey } };
  }
  return { url: base + '/models', headers: apiKey ? { Authorization: 'Bearer ' + apiKey } : {} };
}

function parseModels_(providerId, body) {
  const json = JSON.parse(body);
  const rows = json.data || json.models || [];
  const out = [];

  if (providerId === 'google') {
    rows.forEach(function (raw) {
      const name = raw.name || '';
      if (name.indexOf('models/') !== 0) return;
      const slug = name.replace(/^models\//, '');
      if ((raw.supportedGenerationMethods || []).indexOf('generateContent') < 0) return;
      if (GEMINI_REJECT_.test(slug)) return;
      out.push(slug);
    });
    return out.sort();
  }

  if (providerId === 'anthropic') {
    rows.forEach(function (raw) {
      if (raw.id) out.push(raw.id);
    });
    return out; // The API returns newest first — keep that order.
  }

  if (providerId === 'openrouter') {
    rows.forEach(function (raw) {
      const id = raw.id || '';
      const architecture = raw.architecture || {};
      const inputs = architecture.input_modalities || ['text'];
      const outputs = architecture.output_modalities || ['text'];
      if (!id || inputs.indexOf('text') < 0 || outputs.indexOf('text') < 0) return;
      out.push(id);
    });
    return out.sort();
  }

  if (providerId === 'openai') {
    const created = {};
    rows.forEach(function (raw) {
      const id = raw.id || '';
      if (!id || OPENAI_REJECT_PREFIX_.test(id) || OPENAI_REJECT_SUBSTR_.test(id)) return;
      if (id.indexOf(':ft-') >= 0 || !OPENAI_ACCEPT_.test(id)) return;
      created[id] = raw.created || 0;
      out.push(id);
    });
    return out.sort(function (a, b) {
      return created[b] - created[a] || (a < b ? -1 : 1);
    });
  }

  rows.forEach(function (raw) {
    const id = raw.id || '';
    if (id && !COMPAT_REJECT_.test(id)) out.push(id);
  });
  return out.sort();
}

function fetchModels_(providerId, apiKey, baseUrl) {
  const request = modelsRequest_(providerId, apiKey, baseUrl);
  const response = UrlFetchApp.fetch(request.url, { headers: request.headers, muteHttpExceptions: true });
  const body = response.getContentText();
  if (response.getResponseCode() !== 200) {
    throw new Error('LLM for Sheets: ' + (errorMessage_(body) || 'model list failed, HTTP ' + response.getResponseCode()));
  }
  return parseModels_(providerId, body);
}

// ------------------------------------------------------------------ selfcheck

/** Run from the Apps Script editor. Pure logic, no network calls. */
function llmSelfCheck() {
  const assert = function (ok, label) {
    if (!ok) throw new Error('FAILED: ' + label);
  };
  const cfg = { model: 'm', thinking: 'medium', system: 'sys', text: 'hi', apiKey: 'k', baseUrl: '' };

  const openai = buildRequest_(Object.assign({ provider: 'openai' }, cfg), false);
  assert(openai.url === 'https://api.openai.com/v1/chat/completions', 'openai url');
  assert(JSON.parse(openai.options.payload).reasoning_effort === 'medium', 'openai reasoning effort');
  assert(openai.options.headers.Authorization === 'Bearer k', 'openai auth');

  const noThink = buildRequest_(Object.assign({ provider: 'openai' }, cfg), true);
  assert(JSON.parse(noThink.options.payload).reasoning_effort === undefined, 'effort dropped on retry');

  const routed = buildRequest_(Object.assign({ provider: 'openrouter' }, cfg), false);
  assert(JSON.parse(routed.options.payload).reasoning.effort === 'medium', 'openrouter reasoning object');
  const claudeThink = buildRequest_(Object.assign({ provider: 'anthropic' }, cfg), false);
  assert(JSON.parse(claudeThink.options.payload).effort === 'medium', 'anthropic effort');
  const geminiThink = buildRequest_(Object.assign({ provider: 'google' }, cfg), false);
  assert(JSON.parse(geminiThink.options.payload).generationConfig.thinking_level === 'medium', 'gemini thinking level');

  const claude = buildRequest_(Object.assign({ provider: 'anthropic' }, cfg), false);
  assert(claude.options.headers['x-api-key'] === 'k', 'anthropic auth');
  assert(JSON.parse(claude.options.payload).system === 'sys', 'anthropic system');

  const gemini = buildRequest_(Object.assign({ provider: 'google' }, cfg), false);
  assert(gemini.url.indexOf(':generateContent') > 0, 'gemini url');
  assert(gemini.options.headers['x-goog-api-key'] === 'k', 'gemini auth');

  // Fixtures use invented ids on purpose: a real model name in here would rot.
  const prefixed = Object.assign({}, cfg, { model: 'vendor/model-x' });
  assert(
    buildRequest_(Object.assign({ provider: 'google' }, prefixed), false).url.indexOf('/models/model-x:generateContent') >
      0,
    'vendor prefix stripped for gemini',
  );
  assert(
    JSON.parse(buildRequest_(Object.assign({ provider: 'openrouter' }, prefixed), false).options.payload).model ===
      'vendor/model-x',
    'openrouter prefix kept',
  );
  const local = Object.assign({}, prefixed, { baseUrl: 'https://host/v1' });
  assert(
    JSON.parse(buildRequest_(Object.assign({ provider: 'custom' }, local), false).options.payload).model ===
      'vendor/model-x',
    'custom prefix kept',
  );

  assert(parseAnswer_('openai', '{"choices":[{"message":{"content":"a"}}]}') === 'a', 'openai parse');
  assert(parseAnswer_('anthropic', '{"content":[{"type":"text","text":"b"}]}') === 'b', 'anthropic parse');
  assert(parseAnswer_('google', '{"candidates":[{"content":{"parts":[{"text":"c"}]}}]}') === 'c', 'gemini parse');
  assert(errorMessage_('{"error":{"message":"nope"}}') === 'nope', 'error message');

  assert(cleanText_('```json\n{"a":1}\n```') === '{"a":1}', 'fence stripped');
  assert(cleanText_('**bold** text') === 'bold text', 'asterisks stripped');
  assert(cleanText_('{"a":"**keep**"}') === '{"a":"**keep**"}', 'json left alone');
  assert(
    cacheKey_(Object.assign({ provider: 'openai' }, cfg)) !== cacheKey_(Object.assign({ provider: 'openrouter' }, cfg)),
    'cache key per provider',
  );

  const orModels = parseModels_(
    'openrouter',
    '{"data":[{"id":"z/text","architecture":{"input_modalities":["text"],"output_modalities":["text"]}},' +
      '{"id":"a/text"},{"id":"b/paint","architecture":{"input_modalities":["text"],"output_modalities":["image"]}}]}',
  );
  assert(orModels.join(',') === 'a/text,z/text', 'openrouter models filtered and sorted');

  const openaiModels = parseModels_(
    'openai',
    '{"data":[{"id":"gpt-old","created":1},{"id":"text-embedding-x","created":9},' +
      '{"id":"gpt-x-audio","created":9},{"id":"whisper-x","created":9},{"id":"gpt-new","created":5}]}',
  );
  assert(openaiModels.join(',') === 'gpt-new,gpt-old', 'openai models filtered, newest first');

  const geminiModels = parseModels_(
    'google',
    '{"models":[{"name":"models/chat-x","supportedGenerationMethods":["generateContent"]},' +
      '{"name":"models/embedding-x","supportedGenerationMethods":["embedContent"]},' +
      '{"name":"models/chat-x-tts","supportedGenerationMethods":["generateContent"]}]}',
  );
  assert(geminiModels.join(',') === 'chat-x', 'gemini models filtered and unprefixed');

  assert(parseModels_('anthropic', '{"data":[{"id":"model-x"}]}').join(',') === 'model-x', 'anthropic models');
  assert(
    parseModels_('custom', '{"data":[{"id":"chat-x"},{"id":"whisper-x"}]}').join(',') === 'chat-x',
    'compat models filtered',
  );
  assert(modelsRequest_('openrouter', '').url.indexOf('/models') > 0, 'openrouter list needs no key');
  assert(modelsRequest_('google', 'k').headers['x-goog-api-key'] === 'k', 'gemini list auth');

  assert(isLoading_('2+4+Loading...'), 'in-flight dependency detected inside a concatenation');
  assert(isLoading_('Loading...'), 'bare marker detected');
  assert(!isLoading_('Translate: loading screen'), 'ordinary prose is not the marker');
  assert(!isLoading_('Loading the truck'), 'the word without the dots is not the marker');

  assert(LLM_FORMULA_.test('=LLM("hi")'), 'plain formula detected');
  assert(LLM_FORMULA_.test('=IF(A1,LLM(B1),"")'), 'nested formula detected');
  assert(LLM_FORMULA_.test('=llm (A1)'), 'lowercase and spacing detected');
  assert(!LLM_FORMULA_.test('=LLMX(A1)'), 'lookalike function ignored');
  assert(LLM_FORMULA_.test('=GPT("hi")'), 'migrated formula still counted');
  assert(!LLM_FORMULA_.test('=GPTX(A1)'), 'migrated lookalike ignored');
  assert(!LLM_FORMULA_.test('=SUM(A1:A2)'), 'unrelated formula ignored');
  assert(isErrorValue_('#ERROR!') && !isErrorValue_('answer') && !isErrorValue_(42), 'error cells detected');

  Logger.log('selfcheck OK');
  return 'selfcheck OK';
}
