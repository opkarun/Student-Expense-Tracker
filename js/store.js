/* ==========================================================================
   store.js — SpendSmart data layer
   All localStorage I/O, calculations, and constants. Zero DOM access.
   ========================================================================== */
(function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const EVENT_CHANGE = "ss:datachanged";

  // ── Category definitions (single source of truth) ─────────────────────────
  const CATEGORIES = [
    {
      id: "food", label: "Food & Drinks", hex: "#F87171",
      icon: '<path d="M18 8h1a4 4 0 010 8h-1"/><path d="M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
    },
    {
      id: "education", label: "Education", hex: "#818CF8",
      icon: '<path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/>',
    },
    {
      id: "transport", label: "Transport", hex: "#38BDF8",
      icon: '<path d="M14 16H9m10 0h3v-3.15a1 1 0 00-.84-.99L16 11l-2.7-3.6a1 1 0 00-.8-.4H5.24a2 2 0 00-1.8 1.1l-.8 1.63A6 6 0 002 12.42V16h2"/><circle cx="6.5" cy="16.5" r="2.5"/><circle cx="16.5" cy="16.5" r="2.5"/>',
    },
    {
      id: "entertainment", label: "Entertainment", hex: "#FCD34D",
      icon: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>',
    },
    {
      id: "shopping", label: "Shopping", hex: "#F472B6",
      icon: '<path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>',
    },
    {
      id: "health", label: "Health", hex: "#34D399",
      icon: '<path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/>',
    },
    {
      id: "utilities", label: "Utilities", hex: "#FB923C",
      icon: '<path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.81a19.79 19.79 0 01-3.07-8.7A2 2 0 012.18 1h3a2 2 0 012 1.72 12.84 12.84 0 00.7 2.81 2 2 0 01-.45 2.11L6.91 9.1a16 16 0 006 6l1.46-1.46a2 2 0 012.11-.45 12.84 12.84 0 002.81.7A2 2 0 0122 16.92z"/>',
    },
    {
      id: "other", label: "Other", hex: "#A78BFA",
      icon: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>',
    },
  ];

  // Income category options (not budgeted; shown in transaction list as category)
  const INCOME_CATEGORIES = [
    { id: "allowance",    label: "Allowance" },
    { id: "stipend",      label: "Stipend / Salary" },
    { id: "scholarship",  label: "Scholarship" },
    { id: "gift",         label: "Gift" },
    { id: "other_income", label: "Other" },
  ];

  // Key-index categories for direct dictionary lookup (e.g. Store.CATEGORIES['food'])
  CATEGORIES.forEach(c => { CATEGORIES[c.id] = c; });
  INCOME_CATEGORIES.forEach(c => { INCOME_CATEGORIES[c.id] = c; });

  // Multi-select income source chips used in onboarding
  const INCOME_SOURCES = ["Parents", "Part-time job", "Scholarship", "Other"];

  // Default category budget splits (% of monthly budget) by living situation
  const DEFAULT_SPLITS = {
    hostel: { food: 35, education: 15, transport: 8,  entertainment: 10, shopping: 8,  health: 5, utilities: 7,  other: 12 },
    pg:     { food: 30, education: 12, transport: 12, entertainment: 8,  shopping: 6,  health: 5, utilities: 17, other: 10 },
    home:   { food: 20, education: 20, transport: 20, entertainment: 12, shopping: 10, health: 5, utilities: 5,  other:  8 },
  };

  const GOAL_COLORS = ["green", "indigo", "amber", "purple", "red"];

  // ── Low-level storage ─────────────────────────────────────────────────────

  function readRaw(key) {
    try {
      return { ok: true, value: localStorage.getItem(key) };
    } catch (e) {
      return { ok: false, value: null };
    }
  }

  function writeRaw(key, value) {
    try {
      localStorage.setItem(key, value);
      return { ok: true };
    } catch (e) {
      if (e && (e.name === "QuotaExceededError" || e.code === 22 || e.code === 1014)) {
        return { ok: false, quota: true, message: "Storage full. Delete old data and try again." };
      }
      return { ok: false, message: String(e.message || "Storage error.") };
    }
  }

  function removeRaw(key) {
    try { localStorage.removeItem(key); } catch (e) { /* silent */ }
  }

  function parseJSON(str, fallback) {
    if (str === null || str === undefined) return fallback;
    try { return JSON.parse(str); } catch (e) { return fallback; }
  }

  // ── ID generation ─────────────────────────────────────────────────────────

  function uid() {
    try {
      if (window.crypto && window.crypto.getRandomValues) {
        const b = new Uint8Array(8);
        window.crypto.getRandomValues(b);
        return Array.from(b, x => x.toString(16).padStart(2, "0")).join("");
      }
    } catch (e) { /* fall through */ }
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ── Date helpers (local date only — never toISOString for "today") ─────────

  function todayStr() {
    const d = new Date();
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  function parseDate(str) {
    if (!str || typeof str !== "string") return null;
    const [y, m, d] = str.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function dateStr(d) {
    const y  = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const da = String(d.getDate()).padStart(2, "0");
    return `${y}-${mo}-${da}`;
  }

  function addDays(str, n) {
    const d = parseDate(str);
    if (!d) return str;
    d.setDate(d.getDate() + n);
    return dateStr(d);
  }

  function daysInMonth(year, month) {
    // month is 1-based; day=0 of next month = last day of current
    return new Date(year, month, 0).getDate();
  }

  // ── Money helpers ─────────────────────────────────────────────────────────
  // All amounts are stored as INTEGER MINOR UNITS (paise / cents).
  // Convert ONLY at form boundaries: toMinor() on input, fromMinor() on output.

  function toMinor(x) {
    if (typeof x === "string") {
      x = x.replace(/,/g, "").trim();
    }
    // Multiply by 100 and round to avoid floating-point drift (0.1+0.2 issue)
    return Math.round(parseFloat(x) * 100) || 0;
  }

  function fromMinor(x) {
    return (x || 0) / 100;
  }

  function _profileCurrency() {
    const p = getProfile();
    return (p && p.currency) || "INR";
  }

  function fmt(minor) {
    const cur    = _profileCurrency();
    const amount = (minor || 0) / 100;
    const locale = cur === "INR" ? "en-IN" : "en-US";
    const whole  = (minor || 0) % 100 === 0; // no decimal when whole rupees
    try {
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency: cur,
        minimumFractionDigits: whole ? 0 : 2,
        maximumFractionDigits: whole ? 0 : 2,
      }).format(amount);
    } catch (e) {
      return `${currencySymbol()}${amount.toFixed(whole ? 0 : 2)}`;
    }
  }

  function fmtCompact(minor) {
    const sym    = currencySymbol();
    const amount = (minor || 0) / 100;
    if (amount >= 100000) return `${sym}${(amount / 100000).toFixed(1)}L`;
    if (amount >= 1000)   return `${sym}${(amount / 1000).toFixed(1)}K`;
    return `${sym}${Math.round(amount)}`;
  }

  function currencySymbol() {
    const cur = _profileCurrency();
    return cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : "£";
  }

  // ── Auth guard ────────────────────────────────────────────────────────────

  function requireOnboarded() {
    if (!Auth.isLoggedIn()) return; // requireAuth() already handles this
    const p = getProfile();
    if (!p || !p.onboarded) {
      window.location.replace("onboarding.html");
    }
  }

  // ── Profile ───────────────────────────────────────────────────────────────

  function getProfile() {
    const r = readRaw(Auth.userKey("profile"));
    if (!r.ok || r.value === null) return null;
    const p = parseJSON(r.value, null);
    if (!p || typeof p !== "object") return null;
    return p;
  }

  function saveProfile(profile) {
    const data = { ...profile, schemaVersion: SCHEMA_VERSION };
    return writeRaw(Auth.userKey("profile"), JSON.stringify(data));
  }

  // ── Transaction helpers ───────────────────────────────────────────────────

  function _loadTransactions() {
    const r = readRaw(Auth.userKey("transactions"));
    if (!r.ok || r.value === null) return [];
    const arr = parseJSON(r.value, []);
    if (!Array.isArray(arr)) return [];
    // Drop malformed entries; never crash
    return arr.filter(t =>
      t && typeof t === "object" &&
      typeof t.id === "string" &&
      (t.type === "expense" || t.type === "income") &&
      typeof t.amount === "number" &&
      typeof t.date === "string"
    );
  }

  function _saveTransactions(arr) {
    return writeRaw(Auth.userKey("transactions"), JSON.stringify(arr));
  }

  // ── Transaction CRUD ──────────────────────────────────────────────────────

  function addTransaction(t) {
    const txns = _loadTransactions();
    const newT = {
      id:        uid(),
      type:      t.type === "income" ? "income" : "expense",
      title:     String(t.title || "").trim(),
      amount:    Math.round(Number(t.amount) || 0), // store in minor units
      category:  t.category || "other",
      date:      t.date || todayStr(),
      createdAt: new Date().toISOString(),
      ...(t.sample ? { sample: true } : {}),
    };
    txns.push(newT);
    const result = _saveTransactions(txns);
    return { ...result, transaction: newT };
  }

  function updateTransaction(id, updates) {
    const txns = _loadTransactions();
    const idx  = txns.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, message: "Transaction not found." };
    const updated = { ...txns[idx], ...updates, id, updatedAt: new Date().toISOString() };
    if (updates.amount !== undefined) updated.amount = Math.round(Number(updates.amount));
    txns[idx] = updated;
    return _saveTransactions(txns);
  }

  let _lastRemovedTxn = null;

  function removeTransaction(id) {
    const txns = _loadTransactions();
    const idx  = txns.findIndex(t => t.id === id);
    if (idx === -1) return { ok: false, removed: null };
    const removed = txns[idx];
    txns.splice(idx, 1);
    _lastRemovedTxn = removed;
    const result = _saveTransactions(txns);
    return { ...result, removed };
  }

  function undoRemove(transaction) {
    const target = transaction || _lastRemovedTxn;
    if (!target || !target.id) return { ok: false };
    const txns = _loadTransactions();
    if (txns.some(t => t.id === target.id)) return { ok: true }; // already present
    txns.push(target);
    // Re-sort newest first
    txns.sort((a, b) => (b.date > a.date ? 1 : b.date < a.date ? -1 : 0));
    _lastRemovedTxn = null;
    return _saveTransactions(txns);
  }

  // ── Transaction queries ───────────────────────────────────────────────────

  function list(filters = {}) {
    let txns = _loadTransactions();
    if (filters.type)      txns = txns.filter(t => t.type === filters.type);
    if (filters.category)  txns = txns.filter(t => t.category === filters.category);
    if (filters.startDate) txns = txns.filter(t => t.date >= filters.startDate);
    if (filters.endDate)   txns = txns.filter(t => t.date <= filters.endDate);
    if (filters.month)     txns = txns.filter(t => t.date.startsWith(filters.month));
    if (filters.search) {
      const q = String(filters.search).toLowerCase();
      txns = txns.filter(t => t.title.toLowerCase().includes(q));
    }
    // Newest first; ties broken by createdAt desc
    txns.sort((a, b) =>
      b.date > a.date ? 1 : b.date < a.date ? -1 :
      (b.createdAt || "") > (a.createdAt || "") ? 1 : -1
    );
    if (Number.isInteger(filters.limit) && filters.limit >= 0) {
      txns = txns.slice(0, filters.limit);
    }
    return txns;
  }

  function totalsForRange(startDate, endDate) {
    const txns = list({ startDate, endDate });
    let income = 0, expenses = 0;
    for (const t of txns) {
      if (t.type === "income") income += t.amount;
      else expenses += t.amount;
    }
    return { income, expenses, net: income - expenses, count: txns.length };
  }

  function byCategory(startDate, endDate) {
    // Returns { catId: minor_amount } for expense transactions only
    const txns = list({ startDate, endDate, type: "expense" });
    const map  = {};
    for (const t of txns) {
      map[t.category] = (map[t.category] || 0) + t.amount;
    }
    return map;
  }

  function dailyTotals(startDate, endDate) {
    // Returns { 'YYYY-MM-DD': minor_amount } for expense transactions only
    const txns = list({ startDate, endDate, type: "expense" });
    const map  = {};
    for (const t of txns) {
      map[t.date] = (map[t.date] || 0) + t.amount;
    }
    return map;
  }

  function monthTotals(year, month) {
    const mo  = String(month).padStart(2, "0");
    const y   = String(year);
    const end = `${y}-${mo}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
    return totalsForRange(`${y}-${mo}-01`, end);
  }

  function budgetUsage() {
    const profile = getProfile();
    if (!profile) return { total: 0, spent: 0, pct: 0, categoryUsage: {}, catSpent: {} };

    const today = todayStr();
    const [yStr, mStr] = today.split("-");
    const y  = Number(yStr), m = Number(mStr);
    const mo = mStr;
    const start = `${yStr}-${mo}-01`;
    const end   = `${yStr}-${mo}-${String(daysInMonth(y, m)).padStart(2, "0")}`;

    const txns = list({ type: "expense", startDate: start, endDate: end });
    let spent = 0;
    const catSpent = {};
    for (const t of txns) {
      spent += t.amount;
      catSpent[t.category] = (catSpent[t.category] || 0) + t.amount;
    }

    const total = profile.monthlyBudget || 0; // stored in minor units
    const pct   = total > 0 ? Math.round(spent / total * 100) : 0;

    const catBudgets   = profile.categoryBudgets || {};
    const categoryUsage = {};
    for (const cat of CATEGORIES) {
      const budget = catBudgets[cat.id] || 0; // stored in minor units
      const s      = catSpent[cat.id] || 0;
      const cp     = budget > 0 ? Math.round(s / budget * 100) : null;
      categoryUsage[cat.id] = { spent: s, budget, pct: cp };
    }

    return { total, spent, pct, categoryUsage, catSpent };
  }

  function streak() {
    // Count only recorded expense days; untracked days are not proof of staying under budget.
    const profile = getProfile();
    if (!profile || !profile.monthlyBudget) return 0;

    const today = todayStr();
    const [yStr, mStr] = today.split("-");
    const y = Number(yStr), m = Number(mStr);
    const dailyBudget = Math.round(profile.monthlyBudget / daysInMonth(y, m));

    let count = 0, day = today;
    for (let i = 0; i < 366; i++) {
      const map   = dailyTotals(day, day);
      if (map[day] === undefined || map[day] > dailyBudget) break;
      count++;
      day = addDays(day, -1);
    }
    return count;
  }

  // ── Goal helpers ──────────────────────────────────────────────────────────

  function _loadGoals() {
    const r = readRaw(Auth.userKey("goals"));
    if (!r.ok || r.value === null) return [];
    const arr = parseJSON(r.value, []);
    if (!Array.isArray(arr)) return [];
    return arr.filter(g =>
      g && typeof g === "object" &&
      typeof g.id === "string" &&
      typeof g.name === "string" &&
      typeof g.target === "number"
    );
  }

  function _saveGoals(arr) {
    return writeRaw(Auth.userKey("goals"), JSON.stringify(arr));
  }

  // ── Goal CRUD ─────────────────────────────────────────────────────────────

  function getGoals() { return _loadGoals(); }

  function getGoalById(id) {
    return _loadGoals().find(g => g.id === id) || null;
  }

  function addGoal(g) {
    const goals = _loadGoals();
    const savedMinor = Math.round(Number(g.saved) || 0);
    const newG = {
      id:          uid(),
      name:        String(g.name || "").trim(),
      emoji:       String(g.emoji || "🎯"),
      target:      Math.round(Number(g.target) || 0),
      saved:       savedMinor,
      deadline:    g.deadline || null,
      colorKey:    g.colorKey || "green",
      createdAt:   new Date().toISOString(),
      completedAt: null,
      contributions: savedMinor > 0
        ? [{ id: uid(), amount: savedMinor, date: todayStr(), note: "Initial savings" }]
        : [],
    };
    if (newG.saved >= newG.target && newG.target > 0) {
      newG.completedAt = new Date().toISOString();
    }
    goals.push(newG);
    const result = _saveGoals(goals);
    return { ...result, goal: newG };
  }

  function updateGoal(id, updates) {
    const goals = _loadGoals();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false, message: "Goal not found." };
    const merged = { ...goals[idx], ...updates, id };
    if (updates.target !== undefined) merged.target = Math.round(Number(updates.target));
    if (updates.saved  !== undefined) merged.saved  = Math.round(Number(updates.saved));
    goals[idx] = merged;
    return _saveGoals(goals);
  }

  function removeGoal(id) {
    const goals = _loadGoals();
    const idx   = goals.findIndex(g => g.id === id);
    if (idx === -1) return { ok: false };
    goals.splice(idx, 1);
    return _saveGoals(goals);
  }

  function addContribution(goalId, amount) {
    // NOTE: goal contributions are tracked separately from expense/income transactions
    // and do NOT affect monthly budget totals or category spending calculations.
    const goals = _loadGoals();
    const idx   = goals.findIndex(g => g.id === goalId);
    if (idx === -1) return { ok: false, message: "Goal not found." };

    const g = goals[idx];
    const contrib = { id: uid(), amount: Math.round(Number(amount) || 0), date: todayStr() };
    g.contributions = Array.isArray(g.contributions) ? g.contributions : [];
    g.contributions.push(contrib);
    g.saved = (g.saved || 0) + contrib.amount;

    let completed = false;
    if (g.saved >= g.target && g.target > 0 && !g.completedAt) {
      g.completedAt = new Date().toISOString();
      completed = true;
    }
    goals[idx] = g;
    const result = _saveGoals(goals);
    return { ...result, goal: g, completed };
  }

  // ── Sample data seeding ───────────────────────────────────────────────────

  function seedSampleData() {
    const txns = _loadTransactions();
    if (txns.some(t => t.sample === true)) return { ok: true, skipped: true };

    const today = todayStr();
    const samples = [
      // income
      { type: "income",  title: "Monthly Allowance",     amount: toMinor(8000), category: "allowance",   date: addDays(today, -30) },
      { type: "income",  title: "Scholarship",           amount: toMinor(3000), category: "scholarship",  date: addDays(today, -10) },
      { type: "income",  title: "Part-time Work",        amount: toMinor(5000), category: "stipend",      date: addDays(today, -22) },
      // expenses
      { type: "expense", title: "Canteen Lunch",         amount: toMinor(120),  category: "food",         date: addDays(today, -1)  },
      { type: "expense", title: "Groceries",             amount: toMinor(480),  category: "food",         date: addDays(today, -2)  },
      { type: "expense", title: "Uber Ride",             amount: toMinor(180),  category: "transport",    date: addDays(today, -3)  },
      { type: "expense", title: "Netflix",               amount: toMinor(499),  category: "entertainment",date: addDays(today, -4)  },
      { type: "expense", title: "Textbooks",             amount: toMinor(740),  category: "education",    date: addDays(today, -5)  },
      { type: "expense", title: "Swiggy Order",          amount: toMinor(320),  category: "food",         date: addDays(today, -6)  },
      { type: "expense", title: "Bus Pass",              amount: toMinor(350),  category: "transport",    date: addDays(today, -7)  },
      { type: "expense", title: "Spotify Premium",       amount: toMinor(119),  category: "entertainment",date: addDays(today, -8)  },
      { type: "expense", title: "Mobile Recharge",       amount: toMinor(299),  category: "utilities",    date: addDays(today, -9)  },
      { type: "expense", title: "Canteen Dinner",        amount: toMinor(95),   category: "food",         date: addDays(today, -11) },
      { type: "expense", title: "Online Course",         amount: toMinor(499),  category: "education",    date: addDays(today, -12) },
      { type: "expense", title: "Protein Powder",        amount: toMinor(850),  category: "health",       date: addDays(today, -13) },
      { type: "expense", title: "T-shirt",               amount: toMinor(399),  category: "shopping",     date: addDays(today, -15) },
      { type: "expense", title: "Snacks",                amount: toMinor(85),   category: "food",         date: addDays(today, -16) },
      { type: "expense", title: "Auto Ride",             amount: toMinor(60),   category: "transport",    date: addDays(today, -17) },
      { type: "expense", title: "Movie Tickets",         amount: toMinor(400),  category: "entertainment",date: addDays(today, -18) },
      { type: "expense", title: "Electricity Bill",      amount: toMinor(650),  category: "utilities",    date: addDays(today, -20) },
      { type: "expense", title: "Chai & Breakfast",      amount: toMinor(75),   category: "food",         date: addDays(today, -23) },
      { type: "expense", title: "Study Materials",       amount: toMinor(260),  category: "education",    date: addDays(today, -25) },
      { type: "expense", title: "Pharmacy",              amount: toMinor(180),  category: "health",       date: addDays(today, -28) },
      { type: "expense", title: "Swiggy Order",          amount: toMinor(280),  category: "food",         date: addDays(today, -35) },
      { type: "expense", title: "Notebook & Pens",       amount: toMinor(150),  category: "education",    date: addDays(today, -40) },
    ];

    const seedId = uid();
    for (const s of samples) {
      txns.push({ id: uid(), ...s, createdAt: new Date().toISOString(), sample: true });
    }
    return _saveTransactions(txns);
  }

  function resetAll() {
    removeRaw(Auth.userKey("profile"));
    removeRaw(Auth.userKey("transactions"));
    removeRaw(Auth.userKey("goals"));
    return { ok: true };
  }

  // ── Public API ────────────────────────────────────────────────────────────

  window.Store = {
    // Constants
    CATEGORIES, INCOME_CATEGORIES, INCOME_SOURCES, DEFAULT_SPLITS, GOAL_COLORS, EVENT_CHANGE,
    // Date helpers
    todayStr, parseDate, dateStr, addDays, daysInMonth,
    // Money helpers
    toMinor, fromMinor, fmt, fmtCompact, currencySymbol,
    // Auth guard
    requireOnboarded,
    // Profile
    getProfile, saveProfile,
    // Transactions
    addTransaction, updateTransaction, removeTransaction, undoRemove,
    list, totalsForRange, byCategory, dailyTotals, monthTotals, budgetUsage, streak,
    // Goals
    getGoals, getGoalById, addGoal, updateGoal, removeGoal, addContribution,
    addGoalContribution: addContribution,
    // Utility
    seedSampleData, resetAll,
  };

  // Re-render when another tab changes data for the same user
  if (typeof window !== "undefined" && window.addEventListener) {
    window.addEventListener("storage", function (e) {
      const session = Auth.getSession();
      if (!session) return;
      const prefix = `spendsmart.data.${session.userId || "guest"}.`;
      if (e.key && e.key.startsWith(prefix)) {
        window.dispatchEvent(new CustomEvent(EVENT_CHANGE, { detail: { key: e.key } }));
      }
    });
  }
})();
