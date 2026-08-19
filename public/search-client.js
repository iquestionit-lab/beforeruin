/**
 * ScriptSearch — Frontend Search Client
 * Original Frequency Holdings
 *
 * Handles all search interaction for the native beforeruin.app integration.
 * Call ScriptSearch.init() once the DOM is ready.
 * For the embeddable widget, see embed.js (built separately).
 *
 * Configuration:
 *   Set SCRIPTSEARCH_ENDPOINT before loading this file, or pass it to init().
 *   e.g. window.SCRIPTSEARCH_ENDPOINT = "https://us-central1-YOUR_PROJECT.cloudfunctions.net/search"
 */

const ScriptSearch = (() => {

  // ─── Config ──────────────────────────────────────────────────────────────
  // Replace YOUR_PROJECT_ID with your Firebase project ID.
  // This is the only value that changes between environments.
  const DEFAULT_ENDPOINT =
    window.SCRIPTSEARCH_ENDPOINT ||
    "https://us-central1-before-ruin-b3744.cloudfunctions.net/search";

  // ─── DOM Selectors ────────────────────────────────────────────────────────
  // These match the element IDs expected in index.html.
  // If the Before Ruin UI uses different IDs, update these to match.
  const SELECTORS = {
    form:        "#scriptsearch-form",
    input:       "#scriptsearch-input",
    modeSelect:  "#scriptsearch-mode",
    results:     "#scriptsearch-results",
    answer:      "#scriptsearch-answer",
    sources:     "#scriptsearch-sources",
    loading:     "#scriptsearch-loading",
    error:       "#scriptsearch-error",
  };

  // ─── State ────────────────────────────────────────────────────────────────
  let isLoading = false;

  // ─── Query ────────────────────────────────────────────────────────────────
  async function query(q, mode = "word_origin", endpoint = DEFAULT_ENDPOINT) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, mode }),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Search failed (${response.status})`);
    }

    return response.json();
    // Returns: { query, mode, answer, entries_matched, sources[] }
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  function renderAnswer(data) {
    const resultsEl  = document.querySelector(SELECTORS.results);
    const answerEl   = document.querySelector(SELECTORS.answer);
    const sourcesEl  = document.querySelector(SELECTORS.sources);

    if (!resultsEl || !answerEl) return;

    // Convert newlines in the answer to paragraph breaks for readability
    const formatted = data.answer
      .split(/\n\n+/)
      .map(para => `<p>${para.replace(/\n/g, "<br>")}</p>`)
      .join("");

    answerEl.innerHTML = formatted;

    // Render source chips if available
    if (sourcesEl && data.sources && data.sources.length > 0) {
      const chips = data.sources
        .map(src => `<span class="ss-source-chip">${src}</span>`)
        .join("");
      sourcesEl.innerHTML = `<div class="ss-sources-label">Primary Sources</div>${chips}`;
      sourcesEl.style.display = "block";
    } else if (sourcesEl) {
      sourcesEl.style.display = "none";
    }

    resultsEl.style.display = "block";
    resultsEl.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function setLoading(on) {
    isLoading = on;
    const loadingEl = document.querySelector(SELECTORS.loading);
    const inputEl   = document.querySelector(SELECTORS.input);
    const formBtn   = document.querySelector(`${SELECTORS.form} button[type="submit"]`);

    if (loadingEl) loadingEl.style.display = on ? "block" : "none";
    if (inputEl)   inputEl.disabled = on;
    if (formBtn)   formBtn.disabled = on;
  }

  function showError(message) {
    const errorEl = document.querySelector(SELECTORS.error);
    if (!errorEl) return;
    errorEl.textContent = message;
    errorEl.style.display = "block";
    setTimeout(() => { errorEl.style.display = "none"; }, 6000);
  }

  function clearResults() {
    const resultsEl = document.querySelector(SELECTORS.results);
    const errorEl   = document.querySelector(SELECTORS.error);
    if (resultsEl) resultsEl.style.display = "none";
    if (errorEl)   errorEl.style.display = "none";
  }

  // ─── Form Handler ─────────────────────────────────────────────────────────
  function handleSubmit(e, endpoint) {
    e.preventDefault();
    if (isLoading) return;

    const inputEl    = document.querySelector(SELECTORS.input);
    const modeEl     = document.querySelector(SELECTORS.modeSelect);
    const q          = inputEl ? inputEl.value.trim() : "";
    const mode       = modeEl  ? modeEl.value         : "word_origin";

    if (!q) return;

    clearResults();
    setLoading(true);

    query(q, mode, endpoint)
      .then(data => {
        renderAnswer(data);
      })
      .catch(err => {
        console.error("ScriptSearch error:", err);
        showError(err.message || "Something went wrong. Try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  function init(options = {}) {
    const endpoint = options.endpoint || DEFAULT_ENDPOINT;
    const formEl   = document.querySelector(SELECTORS.form);

    if (!formEl) {
      console.warn("ScriptSearch: form element not found. Check selector:", SELECTORS.form);
      return;
    }

    formEl.addEventListener("submit", (e) => handleSubmit(e, endpoint));

    // Allow programmatic search via ScriptSearch.search("faith")
    // Useful for deeplinks: ?q=faith&mode=word_origin
    const params = new URLSearchParams(window.location.search);
    const deepQ    = params.get("q");
    const deepMode = params.get("mode") || "word_origin";

    if (deepQ) {
      const inputEl = document.querySelector(SELECTORS.input);
      const modeEl  = document.querySelector(SELECTORS.modeSelect);
      if (inputEl) inputEl.value = deepQ;
      if (modeEl)  modeEl.value  = deepMode;
      clearResults();
      setLoading(true);
      query(deepQ, deepMode, endpoint)
        .then(renderAnswer)
        .catch(err => showError(err.message))
        .finally(() => setLoading(false));
    }
  }

  // Expose a direct search method for external callers (embed, API demos, etc.)
  function search(q, mode = "word_origin", endpoint = DEFAULT_ENDPOINT) {
    return query(q, mode, endpoint);
  }

  return { init, search };

})();

// Auto-init when the DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => ScriptSearch.init());
} else {
  ScriptSearch.init();
}
