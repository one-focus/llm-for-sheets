/**
 * LLM for Sheets — the =LLM() custom function plus its settings sidebar.
 *
 * Settings live in UserProperties, so they follow the Google account across
 * every spreadsheet the add-on is installed in. Answers are cached in the
 * document cache so a recalculation does not re-bill the same prompt.
 */

const SETTINGS_KEY_ = 'llm_for_sheets_settings';
const CACHE_PREFIX_ = 'llm_';
const CACHE_TTL_SECONDS_ = 21600; // 6h, the CacheService maximum.
const BYPASS_KEY_ = 'llm_for_sheets_bypass';
const BYPASS_MS_ = 2 * 60 * 1000;

// What a cell reads while the custom function it depends on is still running.
// ponytail: the English UI string. A translated Sheets shows its own — add it
// here when someone hits it.
const LOADING_MARKER_ = 'Loading...';

function isLoading_(text) {
  return String(text).indexOf(LOADING_MARKER_) >= 0;
}

/**
 * Sent with every request, ahead of whatever the user wrote. It only states the
 * house rules a spreadsheet cell needs; the last line hands the user the final
 * word, so their own instructions can override any of it.
 */
const BASELINE_ =
  'Output → spreadsheet cell.\n' +
  'Plain text. NO markdown: no **, no *, no #, no ```.\n' +
  'JSON asked → raw JSON.\n' +
  'Value only. No preamble. No explanation. No repeating question.\n' +
  'USER RULES BELOW WIN ON CONFLICT.';

// Earlier builds shipped the house rules as the *default* value of the user's
// system prompt field, so autosave persisted them. They now live in BASELINE_,
// and a stored copy would be sent twice — drop it on read, once.
const LEGACY_DEFAULT_SYSTEMS_ = [
  'Return plain text only. No markdown: no **bold**, no *italics*, no # headings, no ``` fences. ' +
    'If asked for JSON, return raw JSON only. Answer with the value itself, no preamble.',
  'Plain text only. No markdown: no **bold**, no *italics*, no # headings, no ``` fences. ' +
    'If asked for JSON, return raw JSON only. Answer with the value, nothing else.',
];

const DEFAULTS_ = {
  provider: 'openrouter',
  model: '',
  thinking: 'low',
  system: '',
  modelOpen: true,
  baseUrl: '',
  keys: {},
};

// ---------------------------------------------------------------- add-on menu

function onOpen() {
  SpreadsheetApp.getUi().createAddonMenu().addItem('Settings', 'showSidebar').addToUi();
}

function onInstall(e) {
  onOpen(e);
}

function showSidebar() {
  SpreadsheetApp.getUi().showSidebar(HtmlService.createHtmlOutputFromFile('Sidebar').setTitle('LLM for Sheets'));
}

/**
 * Run once from the Apps Script editor to trigger the consent screen.
 *
 * `showSidebar` cannot do that job: `getUi()` needs an open container, so it
 * throws in a standalone project and in a bound one whose spreadsheet is closed.
 * This touches the same two scopes without needing any document.
 */
function authorize() {
  PropertiesService.getUserProperties().getProperty(SETTINGS_KEY_);
  UrlFetchApp.fetch('https://openrouter.ai/api/v1/models', { muteHttpExceptions: true });
  return 'Authorized. Open a spreadsheet and use Extensions → LLM for Sheets → Settings.';
}

// ------------------------------------------------------------------ settings

let settingsMemo_ = null;

function settings_() {
  if (settingsMemo_) return settingsMemo_;
  const raw = PropertiesService.getUserProperties().getProperty(SETTINGS_KEY_);
  let stored = {};
  try {
    stored = raw ? JSON.parse(raw) : {};
  } catch (e) {
    stored = {};
  }
  settingsMemo_ = Object.assign({}, DEFAULTS_, stored);
  settingsMemo_.keys = Object.assign({}, stored.keys);
  if (LEGACY_DEFAULT_SYSTEMS_.indexOf(String(settingsMemo_.system).trim()) >= 0) settingsMemo_.system = '';
  return settingsMemo_;
}

function maskKey_(key) {
  if (!key) return '';
  return key.length <= 8 ? '••••' : key.slice(0, 4) + '••••' + key.slice(-4);
}

/** Sidebar entry point. Never returns raw API keys. */
function getSettings() {
  const s = settings_();
  const masked = {};
  Object.keys(s.keys).forEach(function (provider) {
    masked[provider] = maskKey_(s.keys[provider]);
  });
  return {
    provider: s.provider,
    model: s.model,
    thinking: s.thinking,
    thinkingLevels: THINKING_LEVELS_,
    system: s.system,
    baseUrl: s.baseUrl,
    modelOpen: s.modelOpen !== false,
    maskedKeys: masked,
    providers: providerIds_().map(function (id) {
      return { id: id, label: PROVIDERS_[id].label };
    }),
  };
}

/** Sidebar entry point. `apiKey` is only written when non-empty. */
function saveSettings(input) {
  const s = settings_();
  const provider = providerIds_().indexOf(input.provider) >= 0 ? input.provider : DEFAULTS_.provider;
  const next = {
    provider: provider,
    model: String(input.model || '').trim(),
    thinking: THINKING_LEVELS_.indexOf(input.thinking) >= 0 ? input.thinking : DEFAULTS_.thinking,
    system: String(input.system || '').trim(),
    baseUrl: String(input.baseUrl || '').trim(),
    modelOpen: input.modelOpen !== false,
    keys: Object.assign({}, s.keys),
  };
  // The sidebar shows a mask of the stored key. Should one ever be echoed back,
  // storing it would overwrite the real key with dots and lock the user out.
  const typedKey = String(input.apiKey || '').trim();
  if (input.clearKey) delete next.keys[provider];
  else if (typedKey && typedKey.indexOf('•') < 0) next.keys[provider] = typedKey;

  PropertiesService.getUserProperties().setProperty(SETTINGS_KEY_, JSON.stringify(next));
  settingsMemo_ = next;
  return getSettings();
}

/**
 * Sidebar entry point: the provider's live model list. Nothing is hardcoded, so
 * a new model shows up as soon as the provider ships it. Cached for 6h per
 * provider because the sidebar refetches on every provider switch.
 *
 * Reads the typed-but-unsaved key and base URL when present, so the list can be
 * loaded before pressing Save.
 */
function listModels(input) {
  const s = settings_();
  const provider = providerIds_().indexOf(input.provider) >= 0 ? input.provider : s.provider;
  const apiKey = String(input.apiKey || '').trim() || s.keys[provider] || '';
  const baseUrl = String(input.baseUrl || '').trim() || s.baseUrl;

  const cache = CacheService.getUserCache();
  const cacheKey = 'models_' + provider + '_' + (baseUrl ? baseUrl.replace(/[^a-zA-Z0-9]/g, '') : '');
  if (!input.refresh) {
    const hit = cache.get(cacheKey);
    if (hit) return JSON.parse(hit);
  }

  const models = fetchModels_(provider, apiKey, baseUrl);
  try {
    cache.put(cacheKey, JSON.stringify(models), CACHE_TTL_SECONDS_);
  } catch (e) {
    // Over the 100KB cache limit; the list is still returned, just not cached.
  }
  return models;
}

// --------------------------------------------------------------- sheet tools

// Matches the function anywhere in a formula, so `=IF(A1,LLM(B1),"")` counts too,
// while a longer name that merely starts the same way does not. GPT is included
// so the sidebar counters and actions see migrated sheets as well.
const LLM_FORMULA_ = /\b(LLM|GPT)\s*\(/i;

function isErrorValue_(value) {
  return typeof value === 'string' && value.charAt(0) === '#';
}

function llmCells_(range) {
  if (!range) return [];
  const formulas = range.getFormulas();
  const values = range.getValues();
  const firstRow = range.getRow();
  const firstColumn = range.getColumn();
  const cells = [];
  for (let r = 0; r < formulas.length; r++) {
    for (let c = 0; c < formulas[r].length; c++) {
      if (!formulas[r][c] || !LLM_FORMULA_.test(formulas[r][c])) continue;
      cells.push({ row: firstRow + r, column: firstColumn + c, formula: formulas[r][c], value: values[r][c] });
    }
  }
  return cells;
}

/** Sidebar entry point: the counters above the formula actions. */
function scanFormulas() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const cells = llmCells_(sheet.getDataRange());
  return {
    total: cells.length,
    errors: cells.filter(function (cell) {
      return isErrorValue_(cell.value);
    }).length,
    selected: llmCells_(SpreadsheetApp.getActiveRange()).length,
  };
}

/**
 * Sidebar entry point: freeze answers as plain text. Only LLM cells are written,
 * one at a time, so neighbouring formulas and array spills are left alone.
 * Cells still holding an error keep their formula — freezing `#ERROR!` as text
 * would destroy the only thing that can still produce an answer.
 */
function replaceFormulas(scope) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = scope === 'sheet' ? sheet.getDataRange() : SpreadsheetApp.getActiveRange();
  const cells = llmCells_(range).filter(function (cell) {
    return !isErrorValue_(cell.value);
  });
  // ponytail: one setValue per cell. Group into contiguous blocks if anyone
  // freezes tens of thousands of rows and the 6 minute budget starts to bite.
  cells.forEach(function (cell) {
    sheet.getRange(cell.row, cell.column).setValue(cell.value);
  });
  return { count: cells.length };
}

const CELL_TIMEOUT_MS_ = 45 * 1000; // A custom function is killed at 30s anyway.
const RUN_BUDGET_MS_ = 5 * 60 * 1000; // Apps Script kills the script at 6 minutes.

/**
 * Sheets keeps a custom function's last result until its inputs change, so the
 * only way to re-run one is to remove the formula and put it back. Done cell by
 * cell: an interrupted run then loses at most the one cell in flight.
 *
 * Cells are processed top to bottom, left to right, and each one is waited out
 * before the next starts. Chains depend on it: with `=LLM("2+3+" & C7)` in D7,
 * starting D7 while C7 is still blank would send the model a truncated prompt.
 */
function refreshCells_(sheet, cells, bypassCache) {
  const ordered = cells.slice().sort(function (a, b) {
    return a.row - b.row || a.column - b.column;
  });
  const started = Date.now();
  let done = 0;

  for (let i = 0; i < ordered.length; i++) {
    if (Date.now() - started > RUN_BUDGET_MS_) break;
    // Re-stamped every iteration: a long run would otherwise outlive the window
    // and the remaining cells would quietly answer from cache.
    if (bypassCache) openCacheBypass_();

    const range = sheet.getRange(ordered[i].row, ordered[i].column);
    // The formula has to go for Sheets to consider the cell dirty, but blanking
    // it would hand dependents a truncated prompt — `=LLM("2+4+" & D7)` would
    // ask about "2+4+" and pay for the answer. Parking the loading marker there
    // instead makes them fold on `isLoading_` until the real answer lands.
    range.setValue(LOADING_MARKER_);
    SpreadsheetApp.flush();
    range.setFormula(ordered[i].formula);
    SpreadsheetApp.flush();
    done++;
    waitForCell_(range);
  }

  return { count: done, left: ordered.length - done };
}

/** Blocks until the cell holds something — an answer or an error — or gives up. */
function waitForCell_(range) {
  const deadline = Date.now() + CELL_TIMEOUT_MS_;
  while (Date.now() < deadline) {
    Utilities.sleep(400);
    SpreadsheetApp.flush();
    const value = range.getValue();
    if (value !== '' && !isLoading_(value)) return true;
  }
  return false;
}

/** Sidebar entry point: re-run cells against the model, ignoring stored answers. */
function regenerate(scope) {
  const sheet = SpreadsheetApp.getActiveSheet();
  const range = scope === 'sheet' ? sheet.getDataRange() : SpreadsheetApp.getActiveRange();
  const cells = llmCells_(range);
  if (!cells.length) return { count: 0 };
  return refreshCells_(sheet, cells, true);
}

/** Sidebar entry point: re-run only the cells that failed. Errors are never cached. */
function retryErrors() {
  const sheet = SpreadsheetApp.getActiveSheet();
  return refreshCells_(
    sheet,
    llmCells_(sheet.getDataRange()).filter(function (cell) {
      return isErrorValue_(cell.value);
    }),
    false,
  );
}

// ------------------------------------------------------------------ answer cache

/**
 * Two tiers, because `CacheService` caps every entry at 6 hours:
 *   1. CacheService     — fast, large values, expires.
 *   2. DocumentProperties — permanent, travels with the file, but capped at
 *      9KB per value and 500KB per document.
 *
 * A generated answer therefore stays free forever, and an answer too big for
 * the property store still gets the 6h tier. Both writes are best-effort: a
 * full store must never turn a paid-for answer into an error.
 */
function cachedAnswer_(key) {
  const memory = CacheService.getDocumentCache();
  const quick = memory.get(key);
  if (quick !== null) return quick;

  const stored = PropertiesService.getDocumentProperties().getProperty(key);
  if (stored !== null) {
    try {
      memory.put(key, stored, CACHE_TTL_SECONDS_);
    } catch (e) {
      // Too big for the fast tier; served from properties every time instead.
    }
  }
  return stored;
}

function storeAnswer_(key, answer) {
  try {
    CacheService.getDocumentCache().put(key, answer, CACHE_TTL_SECONDS_);
  } catch (e) {
    // Over the 100KB per-entry limit.
  }
  try {
    PropertiesService.getDocumentProperties().setProperty(key, answer);
  } catch (e) {
    // ponytail: over 9KB, or the 500KB document store is full. Permanence is
    // dropped silently — add eviction here if anyone hits the ceiling.
  }
}

/**
 * Regeneration cannot delete the right entries: answers are keyed by prompt and
 * the sidebar has no way to know what a formula evaluates to. Instead a short
 * window is opened during which reads skip the cache while writes still land,
 * so refreshed cells overwrite their own entries with fresh answers.
 *
 * The window has to outlive the script: `refreshCells_` only asks Sheets to
 * recalculate, and the custom functions run afterwards, on their own schedule.
 */
function openCacheBypass_() {
  PropertiesService.getDocumentProperties().setProperty(BYPASS_KEY_, String(Date.now() + BYPASS_MS_));
}

function cacheBypassed_() {
  // ponytail: window is document-wide, so an unrelated cell recalculating in
  // the same two minutes also pays. Per-cell keys would be needed to fix it.
  const until = Number(PropertiesService.getDocumentProperties().getProperty(BYPASS_KEY_) || 0);
  return Date.now() < until;
}

// -------------------------------------------------------------- =LLM() itself

/**
 * Asks an AI model and returns its answer.
 *
 * @param {string} prompt The question, or a cell holding it.
 * @param {string} value Optional extra context appended to the prompt.
 * @param {string} model Optional model id, overriding the configured one.
 * @return {string} The model's answer.
 * @customfunction
 */
function LLM(prompt, value, model) {
  if (Array.isArray(prompt) || Array.isArray(value)) {
    // ponytail: one cell per call. Range input needs UrlFetchApp.fetchAll to
    // stay inside the 30s custom-function budget — add it when users ask.
    throw new Error('LLM for Sheets: pass single cells, then fill the formula down.');
  }
  const text = [prompt, value]
    .map(function (part) {
      return part == null ? '' : String(part).trim();
    })
    .filter(Boolean)
    .join('\n\n');
  if (!text) return '';

  // A dependency is still computing. Answering now would bill a request built on
  // a half-finished prompt — `=LLM("2+4+" & D7)` would ask about "2+4+Loading...".
  //
  // The marker is returned rather than a blank so it propagates: a cell reading
  // *this* one sees it too and folds just as cheaply. Blanking would break the
  // chain at the second link, handing it the truncated prompt "2+4+" to pay for.
  // Sheets re-runs each cell the moment its dependency settles, so the chain
  // resolves upstream first on its own.
  if (isLoading_(text)) return LOADING_MARKER_;

  const s = settings_();
  const cfg = {
    provider: s.provider,
    model: String(model || s.model || '').trim(),
    thinking: s.thinking,
    // The baseline is constant, so it stays out of the cache key below — only
    // what the user can change is allowed to invalidate stored answers.
    system: s.system ? BASELINE_ + '\n\n' + s.system : BASELINE_,
    userSystem: s.system,
    baseUrl: s.baseUrl,
    apiKey: apiKey_(s),
    text: text,
  };
  if (!cfg.model) throw new Error('LLM for Sheets: pick a model in Extensions → LLM for Sheets → Settings.');

  // Always cached: a recalculation must never re-bill an answer that exists.
  // A fresh answer comes from the sidebar's regenerate buttons, which open a
  // short bypass window instead of turning caching off.
  const cacheKey = cacheKey_(cfg);
  if (!cacheBypassed_()) {
    const hit = cachedAnswer_(cacheKey);
    if (hit !== null) return hit;
  }

  const answer = cleanText_(callModel_(cfg));
  storeAnswer_(cacheKey, answer);
  return answer;
}

/**
 * Compatibility shim for sheets arriving from another add-on, whose signature is
 * `(prompt, value, temperature, max_tokens, model)`. Temperature and max_tokens
 * are accepted and dropped — this add-on exposes a thinking level instead.
 *
 * Deliberately carries no `@customfunction` tag: it stays out of autocomplete
 * and out of the docs, and exists only so pasted formulas keep working.
 */
function GPT(prompt, value, temperature, maxTokens, model) {
  return LLM(prompt, value, model);
}

function apiKey_(s) {
  const key = s.keys[s.provider];
  if (!key) throw new Error('LLM for Sheets: add an API key for ' + s.provider + ' in the settings sidebar.');
  return key;
}

function cacheKey_(cfg) {
  const seed = [cfg.provider, cfg.model, cfg.thinking, cfg.userSystem || '', cfg.text].join(' ');
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, seed, Utilities.Charset.UTF_8);
  return CACHE_PREFIX_ + Utilities.base64Encode(digest).replace(/[^a-zA-Z0-9]/g, '');
}

function cleanText_(text) {
  let out = String(text).trim();
  out = out
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
  if (!isJson_(out)) out = out.replace(/\*\*/g, '');
  return out.trim();
}

function isJson_(text) {
  try {
    JSON.parse(text);
    return true;
  } catch (e) {
    return false;
  }
}
