/* ==========================================================================
   js/onboarding.js — SpendSmart Multi-step Onboarding Wizard & Edit Mode
   ========================================================================== */
(function () {
  "use strict";

  // Auth requirement check
  Auth.requireAuth();

  const session = Auth.getSession() || {};
  const isGuest = Boolean(session.guest);
  const isEditMode = new URLSearchParams(window.location.search).get("edit") === "1";
  const existingProfile = Store.getProfile();

  // If not in edit mode and user is already onboarded, redirect to dashboard
  if (!isEditMode && existingProfile && existingProfile.onboarded) {
    window.location.replace("index.html");
    return;
  }

  const DRAFT_KEY = `spendsmart.onboarding.draft.${session.userId || "guest"}`;
  const totalSteps = isEditMode ? 3 : 4;
  let currentStep = 1;

  // DOM Elements
  const stepCounter = document.getElementById("stepCounter");
  const progressBar = document.getElementById("progressBar");
  const skipGuestBtn = document.getElementById("skipGuestBtn");
  const btnBack = document.getElementById("btnBack");
  const btnNext = document.getElementById("btnNext");
  const btnNextLabel = document.getElementById("btnNextLabel");
  const wizardCard = document.getElementById("wizardCard");
  const successScreen = document.getElementById("successScreen");

  // Step 1 inputs
  const inputDisplayName = document.getElementById("displayName");
  const inputCollege = document.getElementById("college");
  const inputCourse = document.getElementById("course");
  const livingCards = document.querySelectorAll(".choice-card");
  const errDisplayName = document.getElementById("displayNameErr");
  const errLiving = document.getElementById("livingErr");

  // Step 2 inputs
  const selectCurrency = document.getElementById("currencySelect");
  const inputIncome = document.getElementById("monthlyIncome");
  const inputBudget = document.getElementById("monthlyBudget");
  const incomeSourceChips = document.querySelectorAll("#incomeSourcesChips .select-chip");
  const errBudget = document.getElementById("monthlyBudgetErr");

  // Step 3 inputs
  const catBudgetGrid = document.getElementById("catBudgetGrid");
  const allocSpentText = document.getElementById("allocSpentText");
  const allocTotalText = document.getElementById("allocTotalText");
  const allocStatusTag = document.getElementById("allocStatusTag");
  const allocProgressFill = document.getElementById("allocProgressFill");
  const allocErrorMsg = document.getElementById("allocErrorMsg");
  const btnAutoSplit = document.getElementById("btnAutoSplit");

  // Step 4 inputs
  const inputGoalName = document.getElementById("goalName");
  const inputGoalTarget = document.getElementById("goalTarget");
  const inputGoalDeadline = document.getElementById("goalDeadline");
  const emojiButtons = document.querySelectorAll(".emoji-btn");
  const chkSampleData = document.getElementById("chkSampleData");
  const errGoalName = document.getElementById("goalNameErr");
  const errGoalTarget = document.getElementById("goalTargetErr");
  const errGoalDate = document.getElementById("goalDateErr");

  let selectedLiving = "hostel";
  let selectedEmoji = "💻";
  let catBudgetInputs = {};

  // Build Step 3 inputs dynamically from Store.CATEGORIES
  function renderCategoryBudgetInputs() {
    catBudgetGrid.innerHTML = "";
    catBudgetInputs = {};

    Store.CATEGORIES.forEach(cat => {
      const item = document.createElement("div");
      item.className = "cat-budget-item";

      const header = document.createElement("div");
      header.className = "cat-budget-header";

      const dot = document.createElement("span");
      dot.className = "cat-dot";
      dot.style.background = cat.hex;

      const label = document.createElement("span");
      label.textContent = cat.label;

      header.appendChild(dot);
      header.appendChild(label);

      const field = document.createElement("div");
      field.className = "input-field";
      field.style.padding = "0 10px";

      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.step = "1";
      inp.placeholder = "0";
      inp.dataset.catId = cat.id;
      inp.style.padding = "8px 4px";
      inp.style.fontSize = "13.5px";

      inp.addEventListener("input", () => {
        updateAllocationSummary();
        saveDraft();
      });

      field.appendChild(inp);
      item.appendChild(header);
      item.appendChild(field);
      catBudgetGrid.appendChild(item);

      catBudgetInputs[cat.id] = inp;
    });
  }

  // Load draft or prefill data
  function initData() {
    let data = null;

    if (isEditMode && existingProfile) {
      data = {
        displayName: existingProfile.name || "",
        college: existingProfile.college || "",
        course: existingProfile.course || "",
        living: existingProfile.living || "hostel",
        currency: existingProfile.currency || "INR",
        monthlyIncome: existingProfile.monthlyIncome ? Store.fromMinor(existingProfile.monthlyIncome) : "",
        incomeSources: existingProfile.incomeSources || [],
        monthlyBudget: existingProfile.monthlyBudget ? Store.fromMinor(existingProfile.monthlyBudget) : "",
        categoryBudgets: {}
      };
      if (existingProfile.categoryBudgets) {
        Object.keys(existingProfile.categoryBudgets).forEach(cid => {
          data.categoryBudgets[cid] = Store.fromMinor(existingProfile.categoryBudgets[cid]);
        });
      }
    } else {
      try {
        const saved = sessionStorage.getItem(DRAFT_KEY);
        if (saved) data = JSON.parse(saved);
      } catch (e) { /* ignore */ }

      if (!data) {
        data = {
          displayName: session.name || (isGuest ? "Guest" : ""),
          college: "",
          course: "",
          living: "hostel",
          currency: "INR",
          monthlyIncome: "",
          incomeSources: [],
          monthlyBudget: "",
          categoryBudgets: {}
        };
      }
    }

    // Populate Step 1
    inputDisplayName.value = data.displayName || "";
    inputCollege.value = data.college || "";
    inputCourse.value = data.course || "";
    setLiving(data.living || "hostel");

    // Populate Step 2
    selectCurrency.value = data.currency || "INR";
    inputIncome.value = data.monthlyIncome != null ? data.monthlyIncome : "";
    inputBudget.value = data.monthlyBudget != null ? data.monthlyBudget : "";

    const activeSources = new Set(data.incomeSources || []);
    incomeSourceChips.forEach(chip => {
      const src = chip.dataset.source;
      if (activeSources.has(src)) chip.classList.add("selected");
      else chip.classList.remove("selected");
    });

    // Populate Step 3
    renderCategoryBudgetInputs();
    if (data.categoryBudgets && Object.keys(data.categoryBudgets).length > 0) {
      Object.keys(data.categoryBudgets).forEach(cid => {
        if (catBudgetInputs[cid]) {
          catBudgetInputs[cid].value = data.categoryBudgets[cid] || 0;
        }
      });
    } else if (inputBudget.value) {
      applyDefaultSplit();
    }

    updateAllocationSummary();
    UI.refreshCurrencySymbols();

    // Guest skip link
    if (isGuest && !isEditMode) {
      skipGuestBtn.hidden = false;
    }
  }

  function setLiving(val) {
    selectedLiving = val;
    livingCards.forEach(c => {
      const isSel = c.dataset.value === val;
      c.classList.toggle("selected", isSel);
      c.setAttribute("aria-checked", String(isSel));
    });
  }

  function saveDraft() {
    if (isEditMode) return; // In edit mode, don't overwrite draft

    const categoryBudgets = {};
    Object.keys(catBudgetInputs).forEach(cid => {
      categoryBudgets[cid] = parseFloat(catBudgetInputs[cid].value) || 0;
    });

    const activeSources = [];
    incomeSourceChips.forEach(chip => {
      if (chip.classList.contains("selected")) activeSources.push(chip.dataset.source);
    });

    const draft = {
      displayName: inputDisplayName.value.trim(),
      college: inputCollege.value.trim(),
      course: inputCourse.value.trim(),
      living: selectedLiving,
      currency: selectCurrency.value,
      monthlyIncome: inputIncome.value ? parseFloat(inputIncome.value) : "",
      incomeSources: activeSources,
      monthlyBudget: inputBudget.value ? parseFloat(inputBudget.value) : "",
      categoryBudgets
    };

    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch (e) { /* ignore */ }
  }

  function getCurrencySymbol() {
    const cur = selectCurrency.value || "INR";
    return cur === "INR" ? "₹" : cur === "USD" ? "$" : cur === "EUR" ? "€" : "£";
  }

  // Auto-split category budget calculation
  function applyDefaultSplit() {
    const total = parseFloat((inputBudget.value || "").replace(/,/g, "")) || 0;
    const split = Store.DEFAULT_SPLITS[selectedLiving] || Store.DEFAULT_SPLITS.hostel;

    Store.CATEGORIES.forEach(cat => {
      const pct = split[cat.id] || 0;
      const amt = Math.round(total * (pct / 100));
      if (catBudgetInputs[cat.id]) {
        catBudgetInputs[cat.id].value = amt;
      }
    });
    updateAllocationSummary();
    saveDraft();
  }

  // Update allocation bar and validate allocated <= total
  function updateAllocationSummary() {
    const sym = getCurrencySymbol();
    const total = parseFloat((inputBudget.value || "").replace(/,/g, "")) || 0;
    let allocated = 0;

    Object.values(catBudgetInputs).forEach(inp => {
      const v = parseFloat(inp.value) || 0;
      allocated += v;
    });

    allocSpentText.textContent = `${sym}${allocated.toLocaleString()}`;
    allocTotalText.textContent = `${sym}${total.toLocaleString()}`;

    const pct = total > 0 ? Math.round((allocated / total) * 100) : 0;
    allocProgressFill.style.width = `${Math.min(pct, 100)}%`;

    if (allocated > total) {
      const over = allocated - total;
      allocProgressFill.classList.add("over");
      allocStatusTag.textContent = `Over-allocated by ${sym}${over.toLocaleString()}`;
      allocStatusTag.style.color = "var(--red)";
      allocErrorMsg.hidden = false;
      allocErrorMsg.textContent = `Allocated amount exceeds budget by ${sym}${over.toLocaleString()}. Reduce some categories.`;
      return false;
    } else {
      allocProgressFill.classList.remove("over");
      allocErrorMsg.hidden = true;
      allocErrorMsg.textContent = "";

      if (allocated === total && total > 0) {
        allocStatusTag.textContent = "100% Fully allocated";
        allocStatusTag.style.color = "var(--emerald-light)";
      } else {
        const remaining = total - allocated;
        allocStatusTag.textContent = `${pct}% allocated (${sym}${remaining.toLocaleString()} left)`;
        allocStatusTag.style.color = "var(--text-secondary)";
      }
      return true;
    }
  }

  // Step Validation
  function validateStep(step) {
    if (step === 1) {
      let valid = true;
      const name = inputDisplayName.value.trim();
      if (!name || name.length < 2 || name.length > 50) {
        UI.setFieldError(inputDisplayName, errDisplayName, "Please enter a name between 2 and 50 characters.");
        document.getElementById("grpDisplayName").classList.add("error");
        inputDisplayName.focus();
        valid = false;
      } else {
        UI.clearFieldError(inputDisplayName, errDisplayName);
        document.getElementById("grpDisplayName").classList.remove("error");
      }
      if (!selectedLiving) {
        errLiving.textContent = "Please select your living situation.";
        errLiving.style.display = "block";
        valid = false;
      } else {
        errLiving.textContent = "";
        errLiving.style.display = "none";
      }
      return valid;
    }

    if (step === 2) {
      let valid = true;
      const budget = parseFloat((inputBudget.value || "").replace(/,/g, ""));
      if (isNaN(budget) || budget <= 0) {
        UI.setFieldError(inputBudget, errBudget, "Please enter a valid monthly spending budget greater than 0.");
        document.getElementById("grpBudget").classList.add("error");
        inputBudget.focus();
        valid = false;
      } else if (budget > 10000000) {
        UI.setFieldError(inputBudget, errBudget, "Budget amount is too large (max 10,000,000).");
        document.getElementById("grpBudget").classList.add("error");
        inputBudget.focus();
        valid = false;
      } else {
        UI.clearFieldError(inputBudget, errBudget);
        document.getElementById("grpBudget").classList.remove("error");
      }
      return valid;
    }

    if (step === 3) {
      const isOk = updateAllocationSummary();
      if (!isOk) {
        // Find first input with non-zero or shake
        allocErrorMsg.scrollIntoView({ behavior: "smooth", block: "nearest" });
        return false;
      }
      return true;
    }

    if (step === 4 && !isEditMode) {
      const gName = inputGoalName.value.trim();
      const gTargetStr = inputGoalTarget.value.trim();
      const gDeadline = inputGoalDeadline.value;

      // If any goal field is filled, validate all
      if (gName || gTargetStr || gDeadline) {
        let valid = true;
        if (!gName || gName.length < 2 || gName.length > 60) {
          UI.setFieldError(inputGoalName, errGoalName, "Goal description must be between 2 and 60 characters.");
          document.getElementById("grpGoalName").classList.add("error");
          inputGoalName.focus();
          valid = false;
        } else {
          UI.clearFieldError(inputGoalName, errGoalName);
          document.getElementById("grpGoalName").classList.remove("error");
        }

        const gTarget = parseFloat(gTargetStr);
        if (isNaN(gTarget) || gTarget <= 0) {
          UI.setFieldError(inputGoalTarget, errGoalTarget, "Please enter a target amount greater than 0.");
          document.getElementById("grpGoalTarget").classList.add("error");
          if (valid) inputGoalTarget.focus();
          valid = false;
        } else {
          UI.clearFieldError(inputGoalTarget, errGoalTarget);
          document.getElementById("grpGoalTarget").classList.remove("error");
        }

        if (gDeadline) {
          const today = Store.todayStr();
          if (gDeadline < today) {
            UI.setFieldError(inputGoalDeadline, errGoalDate, "Target date cannot be in the past.");
            document.getElementById("grpGoalDate").classList.add("error");
            if (valid) inputGoalDeadline.focus();
            valid = false;
          } else {
            UI.clearFieldError(inputGoalDeadline, errGoalDate);
            document.getElementById("grpGoalDate").classList.remove("error");
          }
        }
        return valid;
      }
      return true;
    }

    return true;
  }

  // Show a specific step
  function showStep(step) {
    currentStep = step;
    document.querySelectorAll(".step-pane").forEach(p => {
      const pStep = Number(p.dataset.step);
      p.classList.toggle("active", pStep === step);
    });

    stepCounter.textContent = `Step ${step} of ${totalSteps}`;
    progressBar.style.width = `${(step / totalSteps) * 100}%`;

    btnBack.style.visibility = step > 1 ? "visible" : "hidden";

    if (isEditMode) {
      btnNextLabel.textContent = step === totalSteps ? "Save Changes" : "Continue";
    } else {
      btnNextLabel.textContent = step === totalSteps ? "Finish & Start" : "Continue";
    }

    // Auto-focus first field of step
    setTimeout(() => {
      if (step === 1) inputDisplayName.focus();
      else if (step === 2) inputBudget.focus();
      else if (step === 3) {
        const first = catBudgetGrid.querySelector("input");
        if (first) first.focus();
      } else if (step === 4) inputGoalName.focus();
    }, 50);
  }

  // Save profile and finish
  function finishOnboarding() {
    UI.showSpinner(btnNext);

    const displayName = inputDisplayName.value.trim() || session.name || "Student";
    const college = inputCollege.value.trim();
    const course = inputCourse.value.trim();
    const currency = selectCurrency.value || "INR";
    const monthlyIncome = inputIncome.value ? Store.toMinor(inputIncome.value) : 0;
    const monthlyBudget = Store.toMinor(inputBudget.value);

    const activeSources = [];
    incomeSourceChips.forEach(chip => {
      if (chip.classList.contains("selected")) activeSources.push(chip.dataset.source);
    });

    const categoryBudgets = {};
    Store.CATEGORIES.forEach(cat => {
      const inp = catBudgetInputs[cat.id];
      const val = inp ? parseFloat(inp.value) || 0 : 0;
      categoryBudgets[cat.id] = Store.toMinor(val);
    });

    const profile = {
      name: displayName,
      college,
      course,
      living: selectedLiving,
      currency,
      monthlyIncome,
      incomeSources: activeSources,
      monthlyBudget,
      categoryBudgets,
      onboarded: true,
      createdAt: (existingProfile && existingProfile.createdAt) || new Date().toISOString()
    };

    const saveResult = Store.saveProfile(profile);
    if (!saveResult.ok) {
      UI.hideSpinner(btnNext);
      UI.toast(saveResult.message || "Your profile could not be saved. Please try again.", { type: "error" });
      return;
    }

    // If in edit mode, don't touch goals or sample data
    if (isEditMode) {
      setTimeout(() => {
        sessionStorage.setItem("ss_welcome_toast", "Profile and budgets updated successfully!");
        window.location.replace("index.html");
      }, 300);
      return;
    }

    // Step 4 Goal creation (if filled)
    const gName = inputGoalName.value.trim();
    const gTarget = parseFloat((inputGoalTarget.value || "").replace(/,/g, ""));
    const gDeadline = inputGoalDeadline.value || null;

    if (gName && !isNaN(gTarget) && gTarget > 0) {
      Store.addGoal({
        name: gName,
        target: Store.toMinor(gTarget),
        saved: 0,
        deadline: gDeadline,
        emoji: selectedEmoji,
        colorKey: "green"
      });
    }

    // Seed sample transactions if checkbox is checked
    if (chkSampleData && chkSampleData.checked) {
      Store.seedSampleData();
    }

    // Clear draft
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }

    // Success animation screen
    document.querySelectorAll(".step-pane").forEach(p => p.style.display = "none");
    document.querySelector(".onboard-header").style.display = "none";
    document.querySelector(".onboard-actions").style.display = "none";
    successScreen.style.display = "flex";

    setTimeout(() => {
      sessionStorage.setItem("ss_welcome_toast", `Welcome to SpendSmart, ${displayName}!`);
      window.location.replace("index.html");
    }, 900);
  }

  // Next / Back handlers
  btnNext.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;

    if (currentStep < totalSteps) {
      // If advancing from Step 2 to Step 3, populate category budgets if empty
      if (currentStep === 2) {
        let hasAlloc = false;
        Object.values(catBudgetInputs).forEach(inp => {
          if (parseFloat(inp.value) > 0) hasAlloc = true;
        });
        if (!hasAlloc) {
          applyDefaultSplit();
        }
      }
      showStep(currentStep + 1);
      saveDraft();
    } else {
      finishOnboarding();
    }
  });

  btnBack.addEventListener("click", () => {
    if (currentStep > 1) {
      showStep(currentStep - 1);
    }
  });

  // Enter advances on inputs
  wizardCard.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.tagName === "INPUT" && e.target.type !== "checkbox") {
      e.preventDefault();
      btnNext.click();
    }
  });

  // Living choice card clicks
  livingCards.forEach(card => {
    card.addEventListener("click", () => {
      setLiving(card.dataset.value);
      saveDraft();
    });
    card.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        setLiving(card.dataset.value);
        saveDraft();
      }
    });
  });

  // Income chips click
  incomeSourceChips.forEach(chip => {
    chip.addEventListener("click", () => {
      chip.classList.toggle("selected");
      saveDraft();
    });
  });

  // Auto-fill budget suggestion when monthly income is entered
  inputIncome.addEventListener("blur", () => {
    const inc = parseFloat(inputIncome.value);
    if (!isNaN(inc) && inc > 0 && !inputBudget.value) {
      // 80% rounded to nearest 100
      const suggested = Math.round((inc * 0.8) / 100) * 100;
      inputBudget.value = suggested;
      saveDraft();
    }
  });

  // Currency select update
  selectCurrency.addEventListener("change", () => {
    updateAllocationSummary();
    UI.refreshCurrencySymbols();
    saveDraft();
  });

  // Auto-split button
  btnAutoSplit.addEventListener("click", () => {
    applyDefaultSplit();
  });

  // Emoji picker
  emojiButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      emojiButtons.forEach(b => b.classList.remove("selected"));
      btn.classList.add("selected");
      selectedEmoji = btn.dataset.emoji || "🎯";
    });
  });

  // Skip for guest
  skipGuestBtn.addEventListener("click", () => {
    const defaultSplit = Store.DEFAULT_SPLITS.hostel;
    const total = 10000;
    const catBudgets = {};
    Store.CATEGORIES.forEach(cat => {
      const pct = defaultSplit[cat.id] || 0;
      catBudgets[cat.id] = Store.toMinor(Math.round(total * (pct / 100)));
    });

    const guestProfile = {
      name: "Guest",
      college: "",
      course: "",
      living: "hostel",
      currency: "INR",
      monthlyIncome: 0,
      incomeSources: ["Other"],
      monthlyBudget: Store.toMinor(total),
      categoryBudgets: catBudgets,
      onboarded: true,
      createdAt: new Date().toISOString()
    };

    Store.saveProfile(guestProfile);
    try { sessionStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
    sessionStorage.setItem("ss_welcome_toast", "Welcome, Guest! Feel free to explore SpendSmart.");
    window.location.replace("index.html");
  });

  // Save draft on general input changes
  [inputDisplayName, inputCollege, inputCourse, inputIncome, inputBudget].forEach(el => {
    el.addEventListener("input", saveDraft);
  });

  // Initialize data
  initData();

  // Jump to #budget if requested in URL
  if (window.location.hash === "#budget" || (isEditMode && window.location.hash.includes("budget"))) {
    showStep(3);
  } else {
    showStep(1);
  }
})();
