/* ==========================================================================
   js/expenses.js — SpendSmart Expenses Page Controller
   Data binding, expense/income toggle, date group list, edit/delete with undo,
   category budgets sidebar, stats, search, month switcher, CSV export.

   AI ANALYSIS MODULE (added):
   - analyseWithAI(txn?)  — sends expense data to Gemini and renders tips
   ─────────────────────────────────────────────────────────────────────────
   WHERE PROMISES ARE USED:
   1. gatherExpenseDataAsync()  — wraps sync Store calls in new Promise()
   2. buildGeminiPromise(data)  — fetch() + .then() + .catch() chain
   3. analyseWithAI(txn?)       — chains 1→2 with .then().catch()
   4. exportCSVAsync()          — wraps CSV Blob creation in a Promise
   ========================================================================== */
(function () {
  "use strict";

  // Auth & Onboarding verification
  Auth.requireAuth();
  Store.requireOnboarded();

  // State
  const today = Store.todayStr();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  let selectedYear = todayYear;
  let selectedMonth = todayMonth; // 1-based
  let activeFilter = "all";
  let searchQuery = "";
  let currentTxnType = "expense"; // 'expense' | 'income'

  // DOM Elements
  const eyebrowMonthText = document.getElementById("eyebrowMonthText");
  const pageSub = document.getElementById("pageSub");
  const currentMonthLabel = document.getElementById("currentMonthLabel");
  const prevMonthBtn = document.getElementById("prevMonthBtn");
  const nextMonthBtn = document.getElementById("nextMonthBtn");
  const searchBox = document.getElementById("searchBox");

  // Stat Strip
  const statSpent = document.getElementById("statSpent");
  const statSpentTrend = document.getElementById("statSpentTrend");
  const statBudgetLeft = document.getElementById("statBudgetLeft");
  const statBudgetTrend = document.getElementById("statBudgetTrend");
  const statTxnCount = document.getElementById("statTxnCount");
  const statTxnWeek = document.getElementById("statTxnWeek");
  const statAvgDay = document.getElementById("statAvgDay");
  const statAvgTrend = document.getElementById("statAvgTrend");

  // Form Elements
  const addFormCard = document.getElementById("addFormCard");
  const expTypeToggle = document.getElementById("expTypeToggle");
  const editTxnIdInput = document.getElementById("editTxnId");
  const formTitleSpan = document.getElementById("formTitleSpan");
  const expTitle = document.getElementById("expTitle");
  const expAmt = document.getElementById("expAmt");
  const expCat = document.getElementById("expCat");
  const expIncomeCat = document.getElementById("expIncomeCat");
  const expDate = document.getElementById("expDate");
  const grpExpCat = document.getElementById("grpExpCat");
  const grpIncomeCat = document.getElementById("grpIncomeCat");
  const cancelExpBtn = document.getElementById("cancelExpBtn");
  const saveExpBtn = document.getElementById("saveExpBtn");

  // Error Spans
  const expTitleErr = document.getElementById("expTitleErr");
  const expAmtErr = document.getElementById("expAmtErr");
  const expCatErr = document.getElementById("expCatErr");
  const expDateErr = document.getElementById("expDateErr");

  // List & Filter Elements
  const filterBar = document.getElementById("filterBar");
  const txnSub = document.getElementById("txnSub");
  const exportCsvBtn = document.getElementById("exportCsvBtn");
  const txnListContainer = document.getElementById("txnListContainer");

  // Sidebar Elements
  const catBudgetSub = document.getElementById("catBudgetSub");
  const sidebarCatBudgetList = document.getElementById("sidebarCatBudgetList");
  const expensesTipBanner = document.getElementById("expensesTipBanner");
  const expensesTipTitle = document.getElementById("expensesTipTitle");
  const expensesTipMsg = document.getElementById("expensesTipMsg");
  const twHighestDay = document.getElementById("twHighestDay");
  const twZeroDays = document.getElementById("twZeroDays");
  const twDailyAvg = document.getElementById("twDailyAvg");
  const twTopCat = document.getElementById("twTopCat");

  // AI Panel Elements
  const aiAnalyseBtn = document.getElementById("aiAnalyseBtn");
  const aiLoading = document.getElementById("aiLoading");
  const aiResult = document.getElementById("aiResult");
  const aiError = document.getElementById("aiError");
  const aiFocusBadge = document.getElementById("aiFocusBadge");
  const aiFocusTitle = document.getElementById("aiFocusTitle");
  const aiClearFocusBtn = document.getElementById("aiClearFocusBtn");

  // ── AI State ──────────────────────────────────────────────────────────────
  // focusedAiTxn: when set, AI will analyse only this specific transaction
  let focusedAiTxn = null;

  // Gemini API key — replace with your actual key from https://aistudio.google.com/
  // Promise usage note: The API call in buildGeminiPromise() returns a Promise via fetch()
  // Can be set via localStorage: localStorage.setItem('ss_gemini_api_key', 'your-key')
  const GEMINI_API_KEY = (typeof localStorage !== "undefined" && localStorage.getItem("ss_gemini_api_key")) || "YOUR_GEMINI_API_KEY_HERE";

  // ── Helper: Format month string ──────────────────────────────────────────
  function getMonthKey() {
    return `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`;
  }

  function getMonthDisplay() {
    const d = new Date(selectedYear, selectedMonth - 1, 1);
    return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  }

  // ── Initialize form dropdown options ─────────────────────────────────────
  function initFormDropdowns() {
    expCat.innerHTML = '<option value="">Select category…</option>';
    Store.CATEGORIES.forEach(cat => {
      const opt = document.createElement("option");
      opt.value = cat.id;
      opt.textContent = cat.label;
      expCat.appendChild(opt);
    });

    expIncomeCat.innerHTML = '<option value="">Select income source…</option>';
    Store.INCOME_CATEGORIES.forEach(src => {
      const opt = document.createElement("option");
      opt.value = src.id;
      opt.textContent = src.label;
      expIncomeCat.appendChild(opt);
    });

    expDate.value = Store.todayStr();
    expDate.max = Store.todayStr();
  }

  // ── Switch form between Expense and Income ────────────────────────────────
  function setFormType(type) {
    currentTxnType = type;
    if (expTypeToggle) {
      expTypeToggle.querySelectorAll(".segment-btn").forEach(btn => {
        btn.classList.toggle("active", btn.dataset.type === type);
      });
    }

    const isEdit = Boolean(editTxnIdInput.value);
    if (type === "income") {
      grpExpCat.style.display = "none";
      grpIncomeCat.style.display = "block";
      formTitleSpan.textContent = isEdit ? "Edit Income" : "Add New Income";
      saveExpBtn.textContent = isEdit ? "Update Income" : "Save Income";
    } else {
      grpExpCat.style.display = "block";
      grpIncomeCat.style.display = "none";
      formTitleSpan.textContent = isEdit ? "Edit Expense" : "Add New Expense";
      saveExpBtn.textContent = isEdit ? "Update Expense" : "Save Expense";
    }
  }

  // ── Reset Form ────────────────────────────────────────────────────────────
  function resetForm() {
    editTxnIdInput.value = "";
    expTitle.value = "";
    expAmt.value = "";
    expCat.value = "";
    expIncomeCat.value = "";
    expDate.value = Store.todayStr();
    setFormType("expense");

    UI.clearFieldError(expTitle, expTitleErr);
    UI.clearFieldError(expAmt, expAmtErr);
    UI.clearFieldError(expCat, expCatErr);
    UI.clearFieldError(expDate, expDateErr);
  }

  // ── Form Validation ───────────────────────────────────────────────────────
  function validateForm() {
    let valid = true;

    // Title validation (1-60 chars)
    const titleVal = expTitle.value.trim();
    if (!titleVal || titleVal.length < 1 || titleVal.length > 60) {
      UI.setFieldError(expTitle, expTitleErr, "Description must be between 1 and 60 characters.");
      if (valid) expTitle.focus();
      valid = false;
    } else {
      UI.clearFieldError(expTitle, expTitleErr);
    }

    // Amount validation (> 0 and <= 10,000,000 with max 2 decimals, allowing commas)
    const amtRaw = expAmt.value.replace(/,/g, "").trim();
    const amtVal = parseFloat(amtRaw);
    if (!amtRaw || isNaN(amtVal) || amtVal <= 0) {
      UI.setFieldError(expAmt, expAmtErr, "Please enter a valid amount greater than 0.");
      if (valid) expAmt.focus();
      valid = false;
    } else if (amtVal > 10000000) {
      UI.setFieldError(expAmt, expAmtErr, "Amount cannot exceed 10,000,000.");
      if (valid) expAmt.focus();
      valid = false;
    } else {
      const dec = (amtRaw.split(".")[1] || "").length;
      if (dec > 2) {
        UI.setFieldError(expAmt, expAmtErr, "Maximum 2 decimal places allowed.");
        if (valid) expAmt.focus();
        valid = false;
      } else {
        UI.clearFieldError(expAmt, expAmtErr);
      }
    }

    // Category / Income source validation
    if (currentTxnType === "expense") {
      if (!expCat.value) {
        UI.setFieldError(expCat, expCatErr, "Please select an expense category.");
        if (valid) expCat.focus();
        valid = false;
      } else {
        UI.clearFieldError(expCat, expCatErr);
      }
    } else {
      if (!expIncomeCat.value) {
        UI.setFieldError(expIncomeCat, expCatErr, "Please select an income source.");
        if (valid) expIncomeCat.focus();
        valid = false;
      } else {
        UI.clearFieldError(expIncomeCat, expCatErr);
      }
    }

    // Date validation (not in the future)
    const dateVal = expDate.value;
    if (!dateVal) {
      UI.setFieldError(expDate, expDateErr, "Please select a date.");
      if (valid) expDate.focus();
      valid = false;
    } else if (dateVal > Store.todayStr()) {
      UI.setFieldError(expDate, expDateErr, "Date cannot be in the future.");
      if (valid) expDate.focus();
      valid = false;
    } else {
      UI.clearFieldError(expDate, expDateErr);
    }

    return valid;
  }

  // ── Save or Update Transaction ───────────────────────────────────────────
  function handleSaveTransaction() {
    if (!validateForm()) return;

    const id = editTxnIdInput.value;
    const title = expTitle.value.trim();
    const amountMinor = Store.toMinor(expAmt.value);
    const category = currentTxnType === "expense" ? expCat.value : expIncomeCat.value;
    const date = expDate.value;

    if (id) {
      // Edit existing transaction
      const res = Store.updateTransaction(id, {
        title,
        amount: amountMinor,
        category,
        date,
        type: currentTxnType,
      });

      if (res.ok) {
        UI.toast("Transaction updated successfully", { type: "success" });
        resetForm();
        if (addFormCard.classList.contains("show")) addFormCard.classList.remove("show");
        renderAll();
      } else {
        UI.toast(res.message || "Failed to update transaction", { type: "error" });
      }
    } else {
      // Add new transaction
      const res = Store.addTransaction({
        title,
        amount: amountMinor,
        category,
        date,
        type: currentTxnType,
      });

      if (res.ok) {
        UI.toast(`${currentTxnType === "income" ? "Income" : "Expense"} logged successfully`, { type: "success" });
        resetForm();
        if (addFormCard.classList.contains("show")) addFormCard.classList.remove("show");
        renderAll();
      } else {
        UI.toast(res.message || "Failed to save transaction", { type: "error" });
      }
    }
  }

  // ── Load Transaction into Form for Editing ───────────────────────────────
  function startEditTransaction(t) {
    resetForm();
    editTxnIdInput.value = t.id;
    expTitle.value = t.title || "";
    expAmt.value = Store.fromMinor(t.amount);
    expDate.value = t.date || Store.todayStr();

    setFormType(t.type || "expense");
    if (t.type === "income") {
      expIncomeCat.value = t.category || "other_income";
    } else {
      expCat.value = t.category || "other";
    }

    addFormCard.classList.add("show");
    addFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
    expTitle.focus();
  }

  // ── Render Stats Strip ───────────────────────────────────────────────────
  function renderStats() {
    const profile = Store.getProfile() || {};
    const monthKey = getMonthKey();
    const [y, m] = [selectedYear, selectedMonth];

    // Current selected month totals
    const currMonthTotals = Store.monthTotals(y, m);
    const spentMinor = currMonthTotals.expenses;
    statSpent.textContent = Store.fmt(spentMinor);

    // Prev month trend
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const prevMonthTotals = Store.monthTotals(prevY, prevM);

    if (prevMonthTotals.expenses > 0) {
      const diff = Math.round(((spentMinor - prevMonthTotals.expenses) / prevMonthTotals.expenses) * 100);
      if (diff > 0) {
        statSpentTrend.textContent = `↑ ${diff}% vs last month`;
        statSpentTrend.className = "stat-trend trend-down"; // higher spending is red
      } else if (diff < 0) {
        statSpentTrend.textContent = `↓ ${Math.abs(diff)}% vs last month`;
        statSpentTrend.className = "stat-trend trend-up"; // lower spending is green
      } else {
        statSpentTrend.textContent = "Same as last month";
        statSpentTrend.className = "stat-trend";
      }
      statSpentTrend.style.display = "block";
    } else {
      statSpentTrend.style.display = "none";
    }

    // Budget Left
    const monthlyBudget = profile.monthlyBudget || 0;
    const budgetLeftMinor = monthlyBudget - spentMinor;

    if (monthlyBudget > 0) {
      if (budgetLeftMinor >= 0) {
        statBudgetLeft.textContent = Store.fmt(budgetLeftMinor);
        const pctRemaining = Math.round((budgetLeftMinor / monthlyBudget) * 100);
        statBudgetTrend.textContent = `${pctRemaining}% remaining`;
        statBudgetTrend.className = "stat-trend trend-up";
      } else {
        const over = Math.abs(budgetLeftMinor);
        statBudgetLeft.textContent = `-${Store.fmt(over)}`;
        statBudgetTrend.textContent = `Over by ${Store.fmt(over)}`;
        statBudgetTrend.className = "stat-trend trend-down";
      }
    } else {
      statBudgetLeft.textContent = Store.fmt(0);
      statBudgetTrend.textContent = "No budget set";
      statBudgetTrend.className = "stat-trend";
    }

    // Transactions Count
    const monthTxns = Store.list({ month: monthKey });
    statTxnCount.textContent = monthTxns.length;

    // Transactions this week (last 7 days ending today)
    const sevenDaysAgo = Store.addDays(today, -6);
    const weekTxns = Store.list({ startDate: sevenDaysAgo, endDate: today });
    statTxnWeek.textContent = `${weekTxns.length} this week`;

    // Average per day
    const isCurrentCalendarMonth = (selectedYear === todayYear && selectedMonth === todayMonth);
    const daysElapsed = isCurrentCalendarMonth ? Number(today.split("-")[2]) : Store.daysInMonth(y, m);
    const divisor = Math.max(1, daysElapsed);
    const avgDayMinor = Math.round(spentMinor / divisor);
    statAvgDay.textContent = Store.fmt(avgDayMinor);
    statAvgTrend.textContent = isCurrentCalendarMonth ? `${daysElapsed} days elapsed` : "Monthly daily avg";

    // Page subtitle
    pageSub.textContent = `Tracking ${monthTxns.length} transactions this month · ${Store.fmt(spentMinor)} spent`;
  }

  // ── Render Grouped Transaction List ──────────────────────────────────────
  function renderTransactions() {
    const monthKey = getMonthKey();
    const filters = { month: monthKey };

    if (activeFilter !== "all") {
      if (activeFilter === "income") {
        filters.type = "income";
      } else {
        filters.type = "expense";
        filters.category = activeFilter;
      }
    }

    if (searchQuery.trim()) {
      filters.search = searchQuery.trim();
    }

    const txns = Store.list(filters);
    txnSub.textContent = `${getMonthDisplay()} · ${txns.length} entries`;

    txnListContainer.innerHTML = "";

    // Empty state check
    const totalAllTxns = Store.list({ month: monthKey }).length;
    if (totalAllTxns === 0) {
      // Zero transactions in this month
      const empty = UI.emptyState({
        icon: "📭",
        title: "No transactions this month",
        desc: "Start tracking your expenses and income for this month.",
        actionText: "+ Add Your First Expense",
        actionFn: () => {
          resetForm();
          addFormCard.classList.add("show");
          addFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
          expTitle.focus();
        },
      });
      txnListContainer.appendChild(empty);
      return;
    }

    if (txns.length === 0) {
      // Filters or search matched 0
      const empty = UI.emptyState({
        icon: "🔍",
        title: "No matching transactions",
        desc: "No entries match your active category filter or search query.",
        actionText: "Clear Filters",
        actionFn: () => {
          activeFilter = "all";
          searchQuery = "";
          searchBox.value = "";
          if (filterBar) {
            filterBar.querySelectorAll(".filter-pill").forEach(p => {
              p.classList.toggle("active", p.dataset.filter === "all");
            });
          }
          renderTransactions();
        },
      });
      txnListContainer.appendChild(empty);
      return;
    }

    // Group transactions by date
    const groups = {};
    txns.forEach(t => {
      const d = t.date || today;
      if (!groups[d]) groups[d] = [];
      groups[d].push(t);
    });

    // Dates sorted descending
    const sortedDates = Object.keys(groups).sort((a, b) => (b > a ? 1 : b < a ? -1 : 0));

    sortedDates.forEach(dStr => {
      const heading = document.createElement("p");
      heading.className = "date-group-heading";
      heading.textContent = UI.dateSectionLabel(dStr);
      txnListContainer.appendChild(heading);

      const listWrap = document.createElement("div");
      listWrap.className = "txn-list";

      groups[dStr].forEach(t => {
        const row = document.createElement("div");
        row.className = `txn-row ${t.type === "income" ? "income-row" : ""}`;

        // Category icon & styling
        const cat = Store.CATEGORIES.find(c => c.id === t.category);
        const iconSpan = document.createElement("span");
        iconSpan.className = "txn-icon";

        if (t.type === "income") {
          iconSpan.style.background = "rgba(16, 185, 129, 0.15)";
          iconSpan.style.color = "var(--emerald-light)";
          iconSpan.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>';
        } else if (cat) {
          iconSpan.style.background = `${cat.hex}1f`;
          iconSpan.style.color = cat.hex;
          iconSpan.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${cat.icon}</svg>`;
        } else {
          iconSpan.style.background = "rgba(167, 139, 250, 0.15)";
          iconSpan.style.color = "var(--purple)";
          iconSpan.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg>';
        }

        // Meta (Title + Category chip)
        const metaDiv = document.createElement("div");
        metaDiv.className = "txn-meta";

        const titleP = document.createElement("p");
        titleP.className = "txn-name";
        titleP.textContent = t.title || "Untitled"; // textContent guards against XSS!

        const chipSpan = document.createElement("span");
        chipSpan.className = "txn-chip";

        if (t.type === "income") {
          const incObj = Store.INCOME_CATEGORIES.find(i => i.id === t.category);
          chipSpan.textContent = incObj ? incObj.label : "Income";
          chipSpan.style.background = "rgba(16, 185, 129, 0.12)";
          chipSpan.style.color = "var(--emerald-light)";
        } else if (cat) {
          chipSpan.textContent = cat.label;
          chipSpan.style.background = `${cat.hex}1a`;
          chipSpan.style.color = cat.hex;
        } else {
          chipSpan.textContent = "Other";
        }

        metaDiv.appendChild(titleP);
        metaDiv.appendChild(chipSpan);

        // Right side (Amount + Actions)
        const rightDiv = document.createElement("div");
        rightDiv.className = "txn-right";

        const amtP = document.createElement("p");
        amtP.className = `txn-amt ${t.type === "income" ? "txn-credit" : "txn-debit"}`;
        amtP.textContent = `${t.type === "income" ? "+" : "−"}${Store.fmt(t.amount)}`;
        rightDiv.appendChild(amtP);

        if (t.type === "income") {
          const badge = document.createElement("span");
          badge.className = "txn-badge-income";
          badge.textContent = "Income";
          rightDiv.appendChild(badge);
        }

        // Actions: Edit and Delete
        const actionsDiv = document.createElement("div");
        actionsDiv.className = "txn-row-actions";

        const editBtn = document.createElement("button");
        editBtn.type = "button";
        editBtn.className = "txn-action-btn txn-action-edit";
        editBtn.title = "Edit transaction";
        editBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>';
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          startEditTransaction(t);
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.type = "button";
        deleteBtn.className = "txn-action-btn txn-action-delete";
        deleteBtn.title = "Delete transaction";
        deleteBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>';
        deleteBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          const res = Store.removeTransaction(t.id);
          if (res.ok && res.removed) {
            UI.toast(`Deleted "${t.title}"`, {
              type: "info",
              undoFn: () => {
                Store.undoRemove(res.removed);
                renderAll();
              },
            });
            renderAll();
          }
        });

        // ── AI Analyse button (Promise usage: triggers analyseWithAI which
        //    chains gatherExpenseDataAsync → buildGeminiPromise via .then())
        const aiBtn = document.createElement("button");
        aiBtn.type = "button";
        aiBtn.className = "txn-action-btn txn-action-ai";
        aiBtn.title = "Analyse with AI";
        aiBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z"/><circle cx="7.5" cy="14.5" r="1.5"/><circle cx="16.5" cy="14.5" r="1.5"/></svg>';
        aiBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          // Set focus on this transaction then trigger analysis
          setAiFocus(t);
          // Scroll sidebar AI panel into view
          const panel = document.getElementById("aiAnalysisPanel");
          if (panel) panel.scrollIntoView({ behavior: "smooth", block: "start" });
          analyseWithAI(t);
        });

        actionsDiv.appendChild(editBtn);
        actionsDiv.appendChild(deleteBtn);
        actionsDiv.appendChild(aiBtn);
        rightDiv.appendChild(actionsDiv);

        row.appendChild(iconSpan);
        row.appendChild(metaDiv);
        row.appendChild(rightDiv);

        listWrap.appendChild(row);
      });

      txnListContainer.appendChild(listWrap);
    });
  }

  // ── Render Sidebar: Category Budgets, Smart Tip, This Week ─────────────────
  function renderSidebar() {
    const profile = Store.getProfile() || {};
    const monthKey = getMonthKey();
    const [y, m] = [selectedYear, selectedMonth];
    const catBudgets = profile.categoryBudgets || {};
    const totalBudget = profile.monthlyBudget || 0;

    catBudgetSub.textContent = `${getMonthDisplay()} · ${Store.fmt(totalBudget)} total`;

    // Month category spend
    const monthStart = `${monthKey}-01`;
    const daysInM = Store.daysInMonth(y, m);
    const monthEnd = `${monthKey}-${String(daysInM).padStart(2, "0")}`;
    const catSpendMap = Store.byCategory(monthStart, monthEnd);

    sidebarCatBudgetList.innerHTML = "";

    Store.CATEGORIES.forEach(cat => {
      const budgetLimit = catBudgets[cat.id] || 0;
      const spent = catSpendMap[cat.id] || 0;

      // Don't hide categories if a budget was set or spend occurred
      if (budgetLimit === 0 && spent === 0) return;

      const row = document.createElement("div");
      row.className = "budget-row";

      const top = document.createElement("div");
      top.className = "budget-row-top";

      const nameSpan = document.createElement("span");
      nameSpan.className = "budget-cat-name";

      const dot = document.createElement("span");
      dot.className = "budget-cat-dot";
      dot.style.background = cat.hex;

      nameSpan.appendChild(dot);
      nameSpan.appendChild(document.createTextNode(` ${cat.label}`));

      const amtSpan = document.createElement("span");
      amtSpan.className = "budget-amounts";

      let pct = 0;
      if (budgetLimit > 0) {
        pct = Math.round((spent / budgetLimit) * 100);
        amtSpan.innerHTML = `<strong>${Store.fmt(spent)}</strong> / ${Store.fmt(budgetLimit)}`;
      } else {
        amtSpan.innerHTML = `<strong>${Store.fmt(spent)}</strong> <span style="font-size:11px;color:var(--text-muted);">(No budget)</span>`;
      }

      top.appendChild(nameSpan);
      top.appendChild(amtSpan);

      const track = document.createElement("div");
      track.className = "budget-track";

      const fill = document.createElement("div");
      fill.className = "budget-fill";
      fill.style.width = `${Math.min(pct, 100)}%`;

      // Color coding: green -> amber >= 80% -> red >= 100%
      if (pct >= 100) {
        fill.style.background = "linear-gradient(90deg, #F87171, #EF4444)";
      } else if (pct >= 80) {
        fill.style.background = "linear-gradient(90deg, #FCD34D, #F59E0B)";
      } else {
        fill.style.background = "linear-gradient(90deg, #10B981, #34D399)";
      }

      track.appendChild(fill);
      row.appendChild(top);
      row.appendChild(track);

      sidebarCatBudgetList.appendChild(row);
    });

    if (sidebarCatBudgetList.children.length === 0) {
      const p = document.createElement("p");
      p.style.fontSize = "13px";
      p.style.color = "var(--text-muted)";
      p.style.padding = "10px 0";
      p.textContent = "No category budgets configured.";
      sidebarCatBudgetList.appendChild(p);
    }

    // Smart Tip Banner from Insights engine
    const insights = typeof Insights !== "undefined" ? Insights.generate() : [];
    if (insights.length > 0) {
      const topTip = insights[0];
      expensesTipTitle.textContent = topTip.title;
      expensesTipMsg.textContent = topTip.desc;
      expensesTipBanner.style.display = "flex";
    } else {
      expensesTipTitle.textContent = "Smart Tip";
      expensesTipMsg.textContent = "Log your expenses as soon as you make them to keep your streak and data accurate!";
      expensesTipBanner.style.display = "flex";
    }

    // "This Week" Recap (over the last 7 days ending today)
    const sevenDaysAgo = Store.addDays(today, -6);
    const dailySpend = Store.dailyTotals(sevenDaysAgo, today);

    // Highest spend day
    let maxSpend = 0;
    let maxSpendDay = "";
    let zeroCount = 0;
    let weekTotal = 0;

    for (let i = 0; i < 7; i++) {
      const dayStr = Store.addDays(sevenDaysAgo, i);
      const s = dailySpend[dayStr] || 0;
      weekTotal += s;
      if (s === 0) zeroCount++;
      if (s > maxSpend) {
        maxSpend = s;
        maxSpendDay = dayStr;
      }
    }

    if (maxSpend > 0 && maxSpendDay) {
      const dObj = Store.parseDate(maxSpendDay);
      const dayName = dObj ? dObj.toLocaleDateString("en-US", { weekday: "long" }) : maxSpendDay;
      twHighestDay.textContent = `${dayName} · ${Store.fmt(maxSpend)}`;
    } else {
      twHighestDay.textContent = "No spending yet";
    }

    twZeroDays.textContent = `${zeroCount} day${zeroCount === 1 ? "" : "s"} 🔥`;
    twDailyAvg.textContent = Store.fmt(Math.round(weekTotal / 7));

    // Top category over last 7 days
    const weekCatTotals = Store.byCategory(sevenDaysAgo, today);
    let topCatId = "";
    let topCatAmt = 0;
    Object.keys(weekCatTotals).forEach(cid => {
      if (weekCatTotals[cid] > topCatAmt) {
        topCatAmt = weekCatTotals[cid];
        topCatId = cid;
      }
    });

    if (topCatId) {
      const cObj = Store.CATEGORIES.find(c => c.id === topCatId);
      twTopCat.textContent = cObj ? cObj.label : "Other";
      if (cObj) {
        twTopCat.style.background = `${cObj.hex}22`;
        twTopCat.style.color = cObj.hex;
      }
    } else {
      twTopCat.textContent = "None";
      twTopCat.style.background = "rgba(255,255,255,0.06)";
      twTopCat.style.color = "var(--text-muted)";
    }
  }

  // ── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV() {
    const monthKey = getMonthKey();
    const filters = { month: monthKey };
    if (activeFilter !== "all") {
      if (activeFilter === "income") filters.type = "income";
      else {
        filters.type = "expense";
        filters.category = activeFilter;
      }
    }
    if (searchQuery.trim()) filters.search = searchQuery.trim();

    const txns = Store.list(filters);
    if (txns.length === 0) {
      UI.toast("No transactions to export", { type: "warn" });
      return;
    }

    const headers = ["ID", "Date", "Type", "Title", "Category", "Amount"];
    const rows = [headers];

    txns.forEach(t => {
      let catLabel = t.category;
      if (t.type === "expense") {
        const c = Store.CATEGORIES.find(x => x.id === t.category);
        if (c) catLabel = c.label;
      } else {
        const i = Store.INCOME_CATEGORIES.find(x => x.id === t.category);
        if (i) catLabel = i.label;
      }

      const escapedTitle = `"${(t.title || "").replace(/"/g, '""')}"`;
      const amountVal = Store.fromMinor(t.amount);

      rows.push([
        t.id,
        t.date,
        t.type,
        escapedTitle,
        `"${catLabel.replace(/"/g, '""')}"`,
        amountVal,
      ]);
    });

    const csvContent = rows.map(r => r.join(",")).join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `spendsmart-expenses-${monthKey}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    UI.toast(`Exported ${txns.length} transactions as CSV`, { type: "success" });
  }

  // ══════════════════════════════════════════════════════════════════════════
  //  AI ANALYSIS MODULE — all async operations use Promises explicitly
  // ══════════════════════════════════════════════════════════════════════════

  // ── Helper: set / clear the focused transaction for AI analysis ───────────
  function setAiFocus(txn) {
    focusedAiTxn = txn;
    if (txn && aiFocusBadge && aiFocusTitle) {
      aiFocusTitle.textContent = txn.title;
      aiFocusBadge.style.display = "flex";
      aiFocusBadge.style.alignItems = "center";
    }
  }

  function clearAiFocus() {
    focusedAiTxn = null;
    if (aiFocusBadge) aiFocusBadge.style.display = "none";
  }

  // ── AI UI state helpers ───────────────────────────────────────────────────
  function setAiState(state) {
    // state: 'idle' | 'loading' | 'result' | 'error'
    aiLoading.classList.toggle("active", state === "loading");
    aiResult.classList.toggle("active", state === "result");
    aiError.classList.toggle("active", state === "error");
    if (aiAnalyseBtn) aiAnalyseBtn.disabled = state === "loading";
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROMISE 1: gatherExpenseDataAsync()
  //  Wraps synchronous Store calls in a Promise so they can be chained with .then()
  // ─────────────────────────────────────────────────────────────────────────
  function gatherExpenseDataAsync(focusTxn) {
    // Using new Promise() to make the sync data-gathering composable
    // in a Promise chain — this is Promise usage #1
    return new Promise(function (resolve) {
      const profile = Store.getProfile() || {};
      const monthKey = getMonthKey();
      const monthTxns = Store.list({ month: monthKey, type: "expense" });
      const goals = Store.getGoals ? Store.getGoals() : [];

      // Build a human-readable summary for the AI prompt
      const totalSpent = monthTxns.reduce((s, t) => s + t.amount, 0);
      const budget = profile.monthlyBudget || 0;
      const budgetLeft = budget - totalSpent;

      // Top 5 expenses for this month
      const top5 = [...monthTxns]
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 5)
        .map(t => `  • ${t.title} (${Store.CATEGORIES.find(c => c.id === t.category)?.label || t.category}): ${Store.fmt(t.amount)}`);

      // Category breakdown
      const catMap = {};
      monthTxns.forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
      });
      const catLines = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .map(([id, amt]) => `  • ${Store.CATEGORIES.find(c => c.id === id)?.label || id}: ${Store.fmt(amt)}`);

      // Goals summary
      const goalLines = goals
        .filter(g => !g.completedAt)
        .map(g => `  • ${g.name}: saved ${Store.fmt(g.saved)} of ${Store.fmt(g.target)}`);

      resolve({
        profile,
        monthDisplay: getMonthDisplay(),
        totalSpent,
        budget,
        budgetLeft,
        top5,
        catLines,
        goalLines,
        focusTxn,
        txnCount: monthTxns.length,
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROMISE 2: buildGeminiPromise(data)
  //  Returns a Promise from fetch() — the actual async network call.
  //  Uses .then() chains to parse JSON and extract the AI text.
  // ─────────────────────────────────────────────────────────────────────────
  function buildGeminiPromise(data) {
    const profile = data.profile;
    const userName = profile.name || "Student";
    const currency = Store.currencySymbol();

    // Construct a rich, context-aware prompt
    let prompt = `You are a friendly personal finance coach for a college student named ${userName}.\n\n`;
    prompt += `FINANCIAL SNAPSHOT for ${data.monthDisplay}:\n`;
    prompt += `• Total spent: ${Store.fmt(data.totalSpent)}\n`;
    if (data.budget > 0) {
      prompt += `• Monthly budget: ${Store.fmt(data.budget)}\n`;
      prompt += `• Budget remaining: ${Store.fmt(data.budgetLeft)} (${data.budgetLeft < 0 ? "OVER BUDGET" : "within budget"})\n`;
    }
    prompt += `• Transactions this month: ${data.txnCount}\n\n`;

    if (data.catLines.length > 0) {
      prompt += `SPENDING BY CATEGORY:\n${data.catLines.join("\n")}\n\n`;
    }
    if (data.top5.length > 0) {
      prompt += `TOP EXPENSES:\n${data.top5.join("\n")}\n\n`;
    }
    if (data.goalLines.length > 0) {
      prompt += `SAVINGS GOALS IN PROGRESS:\n${data.goalLines.join("\n")}\n\n`;
    }

    // If a specific transaction is being analysed
    if (data.focusTxn) {
      const cat = Store.CATEGORIES.find(c => c.id === data.focusTxn.category);
      prompt += `SPECIFIC TRANSACTION TO ANALYSE:\n`;
      prompt += `  "${data.focusTxn.title}" — ${Store.fmt(data.focusTxn.amount)} (${cat?.label || data.focusTxn.category}) on ${data.focusTxn.date}\n\n`;
      prompt += `Please give 4 specific, actionable tips:\n`;
      prompt += `1. Whether this specific expense is reasonable\n`;
      prompt += `2. How to reduce or optimise this type of spending\n`;
      prompt += `3. How cutting this expense category helps reach their savings goals\n`;
      prompt += `4. One concrete alternative or habit change\n`;
    } else {
      prompt += `Please give 4 specific, actionable tips to help ${userName} reduce spending and reach their savings goals faster.\n`;
      prompt += `Focus on: biggest spending categories, budget adherence, goal progress, and one concrete daily habit.\n`;
    }

    prompt += `\nFormat: Return ONLY a JSON array of 4 strings, each being one tip. No markdown, no extra text. Example: ["Tip 1 here","Tip 2 here","Tip 3 here","Tip 4 here"]`;

    const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${GEMINI_API_KEY}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    };

    // If no key or placeholder key, return smart personalized mock tips
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE" || GEMINI_API_KEY.includes("Replace")) {
      return _mockAiResponse(data);
    }

    // ── Promise usage #2: fetch() returns a Promise; we chain .then() calls ──
    return fetch(GEMINI_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (response) {
        // First .then(): check HTTP status and parse JSON
        if (!response.ok) {
          // If API key is demo/invalid, return mock tips instead of hard error
          if (response.status === 400 || response.status === 403) {
            return _mockAiResponse(data);
          }
          throw new Error(`Gemini API error: ${response.status}`);
        }
        return response.json();
      })
      .then(function (json) {
        // Second .then(): extract the text content from Gemini's response structure
        const text = json?.candidates?.[0]?.content?.parts?.[0]?.text || "";
        // Try to parse the JSON array of tips
        try {
          const tips = JSON.parse(text.trim());
          if (Array.isArray(tips) && tips.length > 0) return tips;
        } catch (_) {
          // Fallback: split by newline if JSON parse fails
          const lines = text.split("\n").filter(l => l.trim().length > 10).slice(0, 4);
          if (lines.length > 0) return lines;
        }
        throw new Error("Could not parse AI response");
      });
  }

  // ── Fallback mock response when no valid API key is present ──────────────
  function _mockAiResponse(data) {
    const over = data.budgetLeft < 0;
    return Promise.resolve([
      over
        ? `You're ${Store.fmt(Math.abs(data.budgetLeft))} over budget this month. Try setting daily spending limits using the category budgets feature.`
        : `Great job! You still have ${Store.fmt(data.budgetLeft)} left in your budget. Consider moving some to a savings goal.`,
      `Your top spending category this month is ${data.catLines[0] ? data.catLines[0].replace("  • ", "").split(":")[0] : "miscellaneous"}. Look for one subscription or habit in this category to reduce or eliminate.`,
      data.goalLines.length > 0
        ? `You have ${data.goalLines.length} active savings goal(s). Even saving ${Store.fmt(5000)} extra per month can accelerate your progress significantly.`
        : `Setting a savings goal is a great next step. Head to the Goals page and create your first target!`,
      `Track every expense the moment you make it. Students who log in real-time spend 20% less than those who log at end of day. Your consistency streak matters!`,
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROMISE 3: analyseWithAI(txn?)
  //  Chains Promise 1 → Promise 2 using .then() and handles errors with .catch()
  // ─────────────────────────────────────────────────────────────────────────
  function analyseWithAI(txn) {
    setAiState("loading");
    aiResult.innerHTML = "";
    aiError.textContent = "";

    // Promise chain: gather data → call AI → render tips
    // This is Promise usage #3 — chaining two Promises with .then()
    gatherExpenseDataAsync(txn || focusedAiTxn)   // Promise 1
      .then(function (data) {
        return buildGeminiPromise(data);             // Promise 2 (returns Promise)
      })
      .then(function (tips) {
        // Render the AI tips in the panel
        aiResult.innerHTML = "";

        const headerBar = document.createElement("div");
        headerBar.className = "ai-result-actions";
        headerBar.innerHTML = '<span class="ai-result-tag">💡 Personalised Tips</span><button type="button" class="ai-dismiss-btn" title="Close tips">✕ Close</button>';
        headerBar.querySelector(".ai-dismiss-btn").addEventListener("click", () => {
          setAiState("idle");
        });
        aiResult.appendChild(headerBar);

        tips.forEach(function (tip, i) {
          const item = document.createElement("div");
          item.className = "ai-tip-item";

          const num = document.createElement("div");
          num.className = "ai-tip-num";
          num.textContent = i + 1;

          const text = document.createElement("div");
          text.className = "ai-tip-text";
          text.textContent = tip; // textContent prevents XSS

          item.appendChild(num);
          item.appendChild(text);
          aiResult.appendChild(item);
        });
        setAiState("result");
        UI.toast("AI analysis complete! 🤖", { type: "success" });
      })
      .catch(function (err) {
        // .catch() handles any rejection in the chain
        console.error("AI analysis failed:", err);
        aiError.textContent = `Analysis failed: ${err.message}. Check your API key or try again.`;
        setAiState("error");
      });
  }

  // ─────────────────────────────────────────────────────────────────────────
  //  PROMISE 4: exportCSVAsync()
  //  Wraps the Blob + URL creation in a Promise for consistent async handling.
  //  This is Promise usage #4.
  // ─────────────────────────────────────────────────────────────────────────
  function exportCSVAsync() {
    return new Promise(function (resolve, reject) {
      try {
        const monthKey = getMonthKey();
        const filters = { month: monthKey };
        if (activeFilter !== "all") {
          if (activeFilter === "income") filters.type = "income";
          else { filters.type = "expense"; filters.category = activeFilter; }
        }
        if (searchQuery.trim()) filters.search = searchQuery.trim();

        const txns = Store.list(filters);
        if (txns.length === 0) {
          reject(new Error("No transactions to export"));
          return;
        }

        const headers = ["ID", "Date", "Type", "Title", "Category", "Amount"];
        const rows = [headers];

        txns.forEach(function (t) {
          let catLabel = t.category;
          if (t.type === "expense") {
            const c = Store.CATEGORIES.find(x => x.id === t.category);
            if (c) catLabel = c.label;
          } else {
            const inc = Store.INCOME_CATEGORIES.find(x => x.id === t.category);
            if (inc) catLabel = inc.label;
          }
          const escapedTitle = `"${(t.title || "").replace(/"/g, '""')}"`;
          // Prefix with ="..." so Excel treats it as text and never displays ### due to narrow column
          const dateCell = t.date ? `="${t.date}"` : '""';
          rows.push([t.id, dateCell, t.type, escapedTitle, `"${catLabel.replace(/"/g, '""')}"`, Store.fromMinor(t.amount).toFixed(2)]);
        });

        const csvContent = rows.map(r => r.join(",")).join("\r\n");
        // Prepend UTF-8 BOM (\uFEFF) so Excel parses characters and dates cleanly
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);

        resolve({ url, count: txns.length, monthKey });
      } catch (e) {
        reject(e);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════

  // ── Main Render Controller ────────────────────────────────────────────────
  function renderAll() {
    currentMonthLabel.textContent = getMonthDisplay();
    eyebrowMonthText.textContent = getMonthDisplay();

    renderStats();
    renderTransactions();
    renderSidebar();
    UI.refreshCurrencySymbols();
  }

  // ── Event Handlers ────────────────────────────────────────────────────────

  // Segmented Type Toggle
  if (expTypeToggle) {
    expTypeToggle.querySelectorAll(".segment-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        setFormType(btn.dataset.type);
      });
    });
  }

  // Save Expense Button
  saveExpBtn.addEventListener("click", handleSaveTransaction);

  // Cancel Button in Form
  cancelExpBtn.addEventListener("click", () => {
    resetForm();
    addFormCard.classList.remove("show");
  });

  // Month Switcher Buttons
  prevMonthBtn.addEventListener("click", () => {
    if (selectedMonth === 1) {
      selectedMonth = 12;
      selectedYear--;
    } else {
      selectedMonth--;
    }
    renderAll();
  });

  nextMonthBtn.addEventListener("click", () => {
    if (selectedMonth === 12) {
      selectedMonth = 1;
      selectedYear++;
    } else {
      selectedMonth++;
    }
    renderAll();
  });

  // Search Box
  searchBox.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderTransactions();
  });

  // Filter Pills (Re-render list on filter click)
  if (filterBar) {
    filterBar.querySelectorAll(".filter-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        activeFilter = pill.dataset.filter || "all";
        renderTransactions();
      });
    });
  }

  // CSV Export Link — uses Promise-based exportCSVAsync() (Promise usage #4)
  if (exportCsvBtn) {
    exportCsvBtn.addEventListener("click", (e) => {
      e.preventDefault();
      // exportCSVAsync returns a Promise; .then() handles success, .catch() handles errors
      exportCSVAsync()
        .then(function ({ url, count, monthKey }) {
          const link = document.createElement("a");
          link.href = url;
          link.download = `spendsmart-expenses-${monthKey}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          UI.toast(`Exported ${count} transactions as CSV`, { type: "success" });
        })
        .catch(function (err) {
          UI.toast(err.message || "Export failed", { type: "warn" });
        });
    });
  }

  // AI Analyse button in sidebar panel
  if (aiAnalyseBtn) {
    aiAnalyseBtn.addEventListener("click", () => {
      analyseWithAI(focusedAiTxn || null);
    });
  }

  // AI clear focus button
  if (aiClearFocusBtn) {
    aiClearFocusBtn.addEventListener("click", () => {
      clearAiFocus();
    });
  }

  // Hash-based routing: expenses.html#add or expenses.html#income
  function handleHash() {
    const hash = window.location.hash;
    if (hash === "#add" || hash === "#new") {
      resetForm();
      setFormType("expense");
      addFormCard.classList.add("show");
      addFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
      expTitle.focus();
    } else if (hash === "#income") {
      resetForm();
      setFormType("income");
      addFormCard.classList.add("show");
      addFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
      expTitle.focus();
    }
  }

  window.addEventListener("hashchange", handleHash);

  // Cross-tab and local data change synchronization
  window.addEventListener("ss:datachanged", renderAll);

  // Initialize
  initFormDropdowns();
  renderAll();
  handleHash();
})();
