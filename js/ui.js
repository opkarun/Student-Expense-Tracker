/* ==========================================================================
   ui.js — SpendSmart shared UI helpers
   Toast, modals, empty states, field errors, XSS-safe text.
   Depends on: store.js (for currencySymbol).
   ========================================================================== */
(function () {
  "use strict";

  // ── XSS-safe helpers ──────────────────────────────────────────────────────
  // ALWAYS use these when inserting user-controlled data into the DOM.

  /** Escape a string for safe innerHTML insertion. */
  function escapeHTML(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Set an element's text content safely (preferred over innerHTML). */
  function setText(el, str) {
    if (el) el.textContent = String(str == null ? "" : str);
  }

  // ── Toast notification ────────────────────────────────────────────────────

  let _toastContainer = null;

  function _getToastContainer() {
    if (!_toastContainer || !_toastContainer.isConnected) {
      _toastContainer = document.createElement("div");
      _toastContainer.id = "ss-toast-container";
      _toastContainer.setAttribute("aria-live", "polite");
      _toastContainer.setAttribute("aria-atomic", "false");
      document.body.appendChild(_toastContainer);
    }
    return _toastContainer;
  }

  /**
   * Show a toast notification.
   * @param {string} message
   * @param {{ type?: 'info'|'success'|'error'|'warn', undoFn?: Function, duration?: number }} opts
   */
  function toast(message, opts) {
    const { type = "info", undoFn = null, duration = 5000 } = opts || {};
    const container = _getToastContainer();

    const t = document.createElement("div");
    t.className = `ss-toast ss-toast-${type}`;
    t.setAttribute("role", "status");

    const msg = document.createElement("span");
    msg.className = "ss-toast-msg";
    msg.textContent = String(message || ""); // textContent = safe
    t.appendChild(msg);

    if (undoFn) {
      const undoBtn = document.createElement("button");
      undoBtn.className = "ss-toast-undo";
      undoBtn.textContent = "Undo";
      undoBtn.addEventListener("click", () => { undoFn(); _removeToast(t); });
      t.appendChild(undoBtn);
    }

    const closeBtn = document.createElement("button");
    closeBtn.className = "ss-toast-close";
    closeBtn.setAttribute("aria-label", "Dismiss notification");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => _removeToast(t));
    t.appendChild(closeBtn);

    container.appendChild(t);
    requestAnimationFrame(() => t.classList.add("ss-toast-in"));

    t._dismissTimer = setTimeout(() => _removeToast(t), duration);
    return t;
  }

  function _removeToast(t) {
    if (!t || !t.parentNode) return;
    clearTimeout(t._dismissTimer);
    t.classList.remove("ss-toast-in");
    t.classList.add("ss-toast-out");
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 350);
  }

  // ── Modal ─────────────────────────────────────────────────────────────────

  let _activeModal  = null;
  let _prevFocusEl  = null;
  const FOCUSABLE_SEL = [
    "a[href]", "button:not([disabled])", "input:not([disabled])",
    "select:not([disabled])", "textarea:not([disabled])", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function _trapFocus(container) {
    const nodes = Array.from(container.querySelectorAll(FOCUSABLE_SEL));
    if (!nodes.length) return;
    nodes[0].focus();
    container.addEventListener("keydown", function _trap(e) {
      if (e.key !== "Tab") return;
      const active = container.querySelectorAll(FOCUSABLE_SEL);
      const first = active[0], last = active[active.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last)  { e.preventDefault(); first.focus(); }
      }
    });
  }

  function _escKeyHandler(e) {
    if (e.key === "Escape" && _activeModal) closeModal();
  }

  /**
   * Open a modal with given content element.
   * @param {HTMLElement} contentEl
   * @param {{ onClose?: Function, label?: string }} opts
   * @returns {HTMLElement} The overlay element.
   */
  function openModal(contentEl, opts) {
    const { onClose, label = "Dialog" } = opts || {};
    closeModal(); // dismiss any existing modal first
    _prevFocusEl = document.activeElement;

    const overlay = document.createElement("div");
    overlay.className = "ss-modal-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", label);

    const box = document.createElement("div");
    box.className = "ss-modal-box";
    box.appendChild(contentEl);
    overlay.appendChild(box);

    // Close on backdrop click
    overlay.addEventListener("click", e => { if (e.target === overlay) closeModal(); });
    document.addEventListener("keydown", _escKeyHandler);

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("ss-modal-in"));
    _trapFocus(overlay);
    _activeModal = { overlay, onClose };
    return overlay;
  }

  function closeModal() {
    if (!_activeModal) return;
    const { overlay, onClose } = _activeModal;
    _activeModal = null;
    document.removeEventListener("keydown", _escKeyHandler);
    overlay.classList.remove("ss-modal-in");
    overlay.classList.add("ss-modal-out");
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 300);
    if (_prevFocusEl && _prevFocusEl.focus) { try { _prevFocusEl.focus(); } catch(e){} }
    if (typeof onClose === "function") onClose();
  }

  // ── Amount-prompt modal ───────────────────────────────────────────────────

  /**
   * Show a modal asking for a numeric amount.
   * @returns {Promise<number|null>} Resolves with minor-unit integer, or null if cancelled.
   */
  function promptAmount(opts) {
    const {
      title    = "Add Savings",
      label    = "Amount",
      hint     = "",
      btnLabel = "Add",
    } = opts || {};

    return new Promise(function (resolve) {
      const sym  = typeof Store !== "undefined" ? Store.currencySymbol() : "₹";
      const wrap = document.createElement("div");
      wrap.innerHTML =
        `<h2 class="ss-modal-title">${escapeHTML(title)}</h2>` +
        `<div class="ss-modal-body">` +
          `<div class="input-group">` +
            `<label class="input-label" for="amtPromptIn">${escapeHTML(label)} (${escapeHTML(sym)})</label>` +
            (hint ? `<div class="input-hint">${escapeHTML(hint)}</div>` : "") +
            `<input class="input-field" id="amtPromptIn" type="text" inputmode="decimal" placeholder="0.00" autocomplete="off">` +
            `<div class="field-error" id="amtPromptErr" hidden aria-live="polite"></div>` +
          `</div>` +
        `</div>` +
        `<div class="ss-modal-actions">` +
          `<button class="btn btn-ghost"    id="amtPromptCancel">Cancel</button>` +
          `<button class="btn btn-primary"  id="amtPromptOk">${escapeHTML(btnLabel)}</button>` +
        `</div>`;

      const inp    = wrap.querySelector("#amtPromptIn");
      const err    = wrap.querySelector("#amtPromptErr");
      const okBtn  = wrap.querySelector("#amtPromptOk");
      const canBtn = wrap.querySelector("#amtPromptCancel");
      let resolved = false;

      function resolveOnce(value) {
        if (resolved) return;
        resolved = true;
        resolve(value);
      }

      function validate() {
        const raw = inp.value.replace(/,/g, "").trim();
        const val = parseFloat(raw);
        if (!raw || isNaN(val) || val <= 0) {
          err.textContent = "Please enter a positive amount.";
          err.hidden = false; inp.setAttribute("aria-invalid", "true"); return false;
        }
        if (val > 10000000) {
          err.textContent = "Amount too large (max 1,00,00,000).";
          err.hidden = false; return false;
        }
        const dec = (raw.split(".")[1] || "").length;
        if (dec > 2) {
          err.textContent = "Maximum 2 decimal places.";
          err.hidden = false; return false;
        }
        err.hidden = true; inp.removeAttribute("aria-invalid"); return true;
      }

      okBtn.addEventListener("click", () => {
        if (!validate()) return;
        const minor = Store.toMinor(inp.value);
        resolveOnce(minor);
        closeModal();
      });
      canBtn.addEventListener("click", () => { closeModal(); resolveOnce(null); });
      inp.addEventListener("keydown", e => { if (e.key === "Enter") okBtn.click(); });
      inp.addEventListener("input",   () => { if (!err.hidden) validate(); });

      openModal(wrap, { label: title, onClose: () => resolveOnce(null) });
    });
  }

  // ── Confirm modal ─────────────────────────────────────────────────────────

  /**
   * Show a confirmation dialog.
   * @returns {Promise<boolean>}
   */
  function confirmDialog(opts) {
    const {
      title       = "Are you sure?",
      message     = "",
      confirmText = "Confirm",
      danger      = false,
    } = opts || {};

    return new Promise(function (resolve) {
      const wrap = document.createElement("div");
      wrap.innerHTML =
        `<h2 class="ss-modal-title">${escapeHTML(title)}</h2>` +
        `<div class="ss-modal-body"><p class="ss-modal-text">${escapeHTML(message)}</p></div>` +
        `<div class="ss-modal-actions">` +
          `<button class="btn btn-ghost" id="confCancel">Cancel</button>` +
          `<button class="btn ${danger ? "btn-danger" : "btn-primary"}" id="confOk">${escapeHTML(confirmText)}</button>` +
        `</div>`;

      wrap.querySelector("#confOk").addEventListener("click",     () => { closeModal(); resolve(true); });
      wrap.querySelector("#confCancel").addEventListener("click",  () => { closeModal(); resolve(false); });
      openModal(wrap, { label: title, onClose: () => resolve(false) });
    });
  }

  // ── Empty state block ─────────────────────────────────────────────────────

  /**
   * Build and return an empty-state element.
   * @param {{ icon?, title?, desc?, actionText?, actionFn? }} opts
   */
  function emptyState(opts) {
    const {
      icon       = "📭",
      title      = "Nothing here yet",
      desc       = "",
      actionText = "",
      actionFn   = null,
    } = opts || {};

    const el = document.createElement("div");
    el.className = "ss-empty-state";
    el.innerHTML =
      `<div class="ss-empty-icon">${escapeHTML(icon)}</div>` +
      `<div class="ss-empty-title">${escapeHTML(title)}</div>` +
      (desc ? `<div class="ss-empty-desc">${escapeHTML(desc)}</div>` : "") +
      (actionText ? `<button class="btn btn-primary ss-empty-action">${escapeHTML(actionText)}</button>` : "");

    if (actionText && actionFn) {
      el.querySelector(".ss-empty-action").addEventListener("click", actionFn);
    }
    return el;
  }

  // ── Field validation helpers ──────────────────────────────────────────────

  /**
   * Display or clear an inline field error.
   * @param {HTMLElement} inputEl
   * @param {HTMLElement} errorEl
   * @param {string}      message  – empty string clears the error
   */
  function setFieldError(inputEl, errorEl, message) {
    if (!inputEl || !errorEl) return;
    if (message) {
      inputEl.setAttribute("aria-invalid", "true");
      inputEl.setAttribute("aria-describedby", errorEl.id || "");
      errorEl.textContent = message;
      errorEl.hidden = false;
    } else {
      inputEl.removeAttribute("aria-invalid");
      errorEl.textContent = "";
      errorEl.hidden = true;
    }
  }

  function clearFieldError(inputEl, errorEl) {
    setFieldError(inputEl, errorEl, "");
  }

  // ── Currency symbol refresh ───────────────────────────────────────────────

  /** Update every [data-currency-symbol] element with the current symbol. */
  function refreshCurrencySymbols() {
    if (typeof Store === "undefined") return;
    const sym = Store.currencySymbol();
    document.querySelectorAll("[data-currency-symbol]").forEach(el => {
      el.textContent = sym;
    });
  }

  // ── Spinner ───────────────────────────────────────────────────────────────

  function showSpinner(btn) {
    if (!btn) return;
    btn._origText = btn.textContent;
    btn.disabled  = true;
    btn.classList.add("btn-loading");
    btn.textContent = "…";
  }

  function hideSpinner(btn) {
    if (!btn) return;
    btn.disabled = false;
    btn.classList.remove("btn-loading");
    if (btn._origText != null) btn.textContent = btn._origText;
  }

  // ── Relative date label ───────────────────────────────────────────────────

  /** 'Today', 'Yesterday', or a formatted date string. */
  function relativeDate(dateStr) {
    if (!dateStr || typeof Store === "undefined") return dateStr || "";
    const today = Store.todayStr();
    const yest  = Store.addDays(today, -1);
    if (dateStr === today) return "Today";
    if (dateStr === yest)  return "Yesterday";
    const d = Store.parseDate(dateStr);
    if (!d) return dateStr;
    return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  }

  /** Heading like 'Today · Oct 23', 'Yesterday · Oct 22', 'Oct 20'. */
  function dateSectionLabel(dateStr) {
    if (!dateStr || typeof Store === "undefined") return dateStr || "";
    const today = Store.todayStr();
    const yest  = Store.addDays(today, -1);
    const d = Store.parseDate(dateStr);
    const short = d ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : dateStr;
    if (dateStr === today) return `Today · ${short}`;
    if (dateStr === yest)  return `Yesterday · ${short}`;
    return short;
  }

  // ── Notification bell badge & modal ───────────────────────────────────────

  function refreshNotifications() {
    const notifBtn = document.getElementById("notificationBtn");
    if (!notifBtn) return;
    const badge = notifBtn.querySelector(".notif-badge");

    const insights = (typeof Insights !== "undefined" && Insights.generate) ? Insights.generate() : [];
    const warns = insights.filter(i => i.severity === "warn");
    const count = warns.length > 0 ? warns.length : insights.length;

    if (badge) {
      if (count > 0) {
        badge.textContent = count;
        if (badge.style) badge.style.display = "flex";
      } else {
        badge.textContent = "";
        if (badge.style) badge.style.display = "none";
      }
    }

    if (!notifBtn._bound) {
      notifBtn._bound = true;
      notifBtn.addEventListener("click", () => {
        const wrap = document.createElement("div");
        wrap.className = "ss-notif-dialog";
        wrap.innerHTML =
          `<h2 class="ss-modal-title" style="display:flex;align-items:center;gap:8px;">` +
            `<span>🔔</span> Notifications &amp; Alerts` +
          `</h2>` +
          `<div class="ss-modal-body" style="max-height:360px;overflow-y:auto;display:flex;flex-direction:column;gap:10px;margin-top:12px;">` +
            (insights.length === 0
              ? '<div style="text-align:center;padding:24px 0;color:var(--text-muted);font-size:13px;">All clear! You have no budget alerts right now. 🎉</div>'
              : insights.map(item => `
                  <div style="display:flex;gap:12px;padding:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.07);border-radius:12px;">
                    <span style="font-size:20px;flex-shrink:0;">${item.icon || "💡"}</span>
                    <div>
                      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:2px;">${escapeHTML(item.title)}</div>
                      <div style="font-size:12px;color:var(--text-secondary);line-height:1.4;">${item.desc}</div>
                    </div>
                  </div>
                `).join("")) +
          `</div>` +
          `<div class="ss-modal-actions" style="margin-top:16px;">` +
            `<button class="btn btn-primary" id="closeNotifBtn" style="width:100%;">Got it</button>` +
          `</div>`;
        const modal = openModal(wrap);
        const closeBtn = wrap.querySelector("#closeNotifBtn");
        if (closeBtn) closeBtn.addEventListener("click", () => closeModal(modal));
      });
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.UI = {
    escapeHTML,
    setText,
    toast,
    openModal,
    closeModal,
    promptAmount,
    confirm: confirmDialog,
    emptyState,
    setFieldError,
    clearFieldError,
    refreshCurrencySymbols,
    refreshNotifications,
    showSpinner,
    hideSpinner,
    relativeDate,
    dateSectionLabel,
  };

  // Auto-run on page load & data changes
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        refreshCurrencySymbols();
        refreshNotifications();
      }, { once: true });
    } else {
      refreshCurrencySymbols();
      refreshNotifications();
    }
    if (typeof window !== "undefined" && typeof Store !== "undefined") {
      window.addEventListener(Store.EVENT_CHANGE, () => {
        refreshCurrencySymbols();
        refreshNotifications();
      });
    }
  }
})();
