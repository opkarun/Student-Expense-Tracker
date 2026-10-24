(function () {
  "use strict";

  /**
   * Goals Page Controller (SpendSmart)
   */

  let selectedGoalId = null;

  function renderGoals() {
    const goals = Store.getGoals();
    const activeGoals = goals.filter(g => !g.completedAt && g.saved < g.target);
    const completedGoals = goals.filter(g => g.completedAt || g.saved >= g.target);

    // If selectedGoalId is no longer valid, default to first active goal
    if (!selectedGoalId || !goals.some(g => g.id === selectedGoalId)) {
      selectedGoalId = activeGoals.length ? activeGoals[0].id : (completedGoals.length ? completedGoals[0].id : null);
    }

    const totalSavedMinor = goals.reduce((s, g) => s + (g.saved || 0), 0);
    const totalTargetMinor = goals.reduce((s, g) => s + (g.target || 0), 0);
    const overallPct = totalTargetMinor > 0 ? Math.min(100, Math.round((totalSavedMinor / totalTargetMinor) * 100)) : 0;

    // ── 1. Page Subtitle ───────────────────────────────────────────────────
    const pageSub = document.getElementById("goalsPageSub");
    if (pageSub) {
      pageSub.textContent = `${activeGoals.length} active goal${activeGoals.length === 1 ? "" : "s"} · ${Store.fmt(totalSavedMinor)} total saved across all`;
    }

    // ── 2. Summary Cards ───────────────────────────────────────────────────
    const statActiveGoals = document.getElementById("statActiveGoals");
    const statActiveGoalsTrend = document.getElementById("statActiveGoalsTrend");
    if (statActiveGoals) statActiveGoals.textContent = activeGoals.length;
    if (statActiveGoalsTrend) {
      const onTrackCount = activeGoals.filter(g => {
        if (!g.deadline) return true;
        const dObj = Store.parseDate(g.deadline);
        return dObj && (dObj - new Date()) >= 0;
      }).length;
      statActiveGoalsTrend.textContent = `${onTrackCount} on track 🎯`;
    }

    const statTotalSaved = document.getElementById("statTotalSaved");
    const statTotalSavedTrend = document.getElementById("statTotalSavedTrend");
    if (statTotalSaved) statTotalSaved.textContent = Store.fmtCompact(totalSavedMinor);
    if (statTotalSavedTrend) {
      // Find contributions this month
      const today = Store.todayStr();
      const [y, m] = today.split("-");
      const monthPrefix = `${y}-${m}`;
      let thisMonthSaved = 0;
      for (const g of goals) {
        if (Array.isArray(g.contributions)) {
          for (const c of g.contributions) {
            if (c.date && c.date.startsWith(monthPrefix)) {
              thisMonthSaved += (c.amount || 0);
            }
          }
        }
      }
      statTotalSavedTrend.textContent = thisMonthSaved > 0
        ? `↑ ${Store.fmt(thisMonthSaved)} this month`
        : `All time total`;
    }

    const statNextDeadline = document.getElementById("statNextDeadline");
    const statNextDeadlineGoal = document.getElementById("statNextDeadlineGoal");
    const goalsWithDeadline = activeGoals
      .filter(g => g.deadline)
      .sort((a, b) => a.deadline.localeCompare(b.deadline));

    if (goalsWithDeadline.length > 0) {
      const nextG = goalsWithDeadline[0];
      const d = Store.parseDate(nextG.deadline);
      const shortDate = d ? d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : nextG.deadline;
      if (statNextDeadline) statNextDeadline.textContent = shortDate;
      if (statNextDeadlineGoal) statNextDeadlineGoal.textContent = nextG.name;
    } else {
      if (statNextDeadline) statNextDeadline.textContent = "—";
      if (statNextDeadlineGoal) statNextDeadlineGoal.textContent = "No deadlines set";
    }

    const statMonthlySaving = document.getElementById("statMonthlySaving");
    const statMonthlySavingSub = document.getElementById("statMonthlySavingSub");
    let totalMonthlyNeeded = 0;
    const now = new Date();
    for (const g of activeGoals) {
      const rem = Math.max(0, g.target - g.saved);
      if (rem > 0 && g.deadline) {
        const d = Store.parseDate(g.deadline);
        if (d && d > now) {
          const monthsLeft = Math.max(1, ((d.getFullYear() - now.getFullYear()) * 12) + (d.getMonth() - now.getMonth()));
          totalMonthlyNeeded += Math.round(rem / monthsLeft);
        } else {
          totalMonthlyNeeded += rem;
        }
      }
    }
    if (statMonthlySaving) statMonthlySaving.textContent = Store.fmt(totalMonthlyNeeded);
    if (statMonthlySavingSub) {
      statMonthlySavingSub.textContent = totalMonthlyNeeded > 0 ? "monthly saving to hit deadlines" : "all goals funded or ongoing";
    }

    // ── 3. Overall Progress Hero ───────────────────────────────────────────
    const heroTitle = document.getElementById("goalsHeroTitle");
    const heroSub = document.getElementById("goalsHeroSub");
    const heroVal = document.getElementById("goalsHeroOverallVal");
    const heroFill = document.getElementById("goalsHeroOverallFill");
    const heroEmoji = document.getElementById("goalsHeroEmoji");

    if (heroTitle) {
      heroTitle.textContent = goals.length === 0
        ? "Set your first savings goal!"
        : `You're ${overallPct}% to all your goals!`;
    }
    if (heroSub) {
      heroSub.textContent = goals.length === 0
        ? "Create targets for a laptop, trip, emergency fund, or gadgets."
        : `${Store.fmt(totalSavedMinor)} saved out of ${Store.fmt(totalTargetMinor)} target across ${goals.length} goal${goals.length === 1 ? "" : "s"}.`;
    }
    if (heroVal) heroVal.textContent = `${overallPct}%`;
    if (heroFill) heroFill.style.width = `${overallPct}%`;
    if (heroEmoji) {
      heroEmoji.textContent = overallPct >= 100 ? "🎉" : overallPct >= 75 ? "🚀" : overallPct >= 50 ? "🏆" : "🎯";
    }

    // ── 4. Goal Grid (Active Goals) ────────────────────────────────────────
    const goalsGrid = document.getElementById("goalsGrid");
    const addGoalCard = document.getElementById("addGoalCard");

    // Remove existing goal items (leaving addGoalCard)
    if (goalsGrid) {
      const items = goalsGrid.querySelectorAll(".goal-item");
      items.forEach(el => el.remove());

      if (activeGoals.length === 0) {
        const empty = document.createElement("div");
        empty.className = "goal-item";
        empty.style.gridColumn = "1 / -1";
        empty.innerHTML = `
          <div style="text-align:center;padding:24px 16px;">
            <div style="font-size:36px;margin-bottom:8px;">🎯</div>
            <div style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:4px;">No active goals</div>
            <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">Click below to set your first target!</p>
          </div>
        `;
        goalsGrid.insertBefore(empty, addGoalCard);
      } else {
        const colorPalette = [
          { glow: "rgba(16,185,129,0.2)", iconClass: "goal-icon-green", fillGrad: "linear-gradient(90deg,var(--emerald),var(--indigo-light))", badgeColor: "var(--emerald-light)" },
          { glow: "rgba(99,102,241,0.2)", iconClass: "goal-icon-indigo", fillGrad: "linear-gradient(90deg,var(--indigo),var(--purple))", badgeColor: "var(--indigo-light)" },
          { glow: "rgba(245,158,11,0.18)", iconClass: "goal-icon-amber", fillGrad: "linear-gradient(90deg,#F59E0B,#FCD34D)", badgeColor: "#FCD34D" },
          { glow: "rgba(167,139,250,0.18)", iconClass: "goal-icon-purple", fillGrad: "linear-gradient(90deg,var(--purple),var(--indigo-light))", badgeColor: "var(--purple)" },
        ];

        activeGoals.forEach((goal, idx) => {
          const p = colorPalette[idx % colorPalette.length];
          const pct = Math.min(100, Math.max(0, Math.round((goal.saved / (goal.target || 1)) * 100)));
          const remMinor = Math.max(0, goal.target - goal.saved);

          let timelineText = "🗓 Ongoing target";
          if (goal.deadline) {
            const d = Store.parseDate(goal.deadline);
            const daysLeft = Math.ceil((d - now) / (1000 * 60 * 60 * 24));
            if (daysLeft < 0) {
              timelineText = `⚠️ Target passed (${goal.deadline})`;
            } else if (daysLeft === 0) {
              timelineText = "🗓 Due today!";
            } else {
              timelineText = `🗓 ${daysLeft} days left (${goal.deadline})`;
            }
          }

          const contributeLabel = remMinor > 0 && pct >= 85
            ? `+ Add ${Store.fmt(remMinor)} to complete!`
            : "+ Add Savings";

          const card = document.createElement("div");
          card.className = "goal-item";
          if (goal.id === selectedGoalId) {
            card.style.borderColor = "rgba(99,102,241,0.5)";
          }
          card.innerHTML = `
            <div class="goal-glow" style="background:radial-gradient(circle, ${p.glow}, transparent 70%)"></div>
            <div class="goal-item-header">
              <div class="goal-icon ${p.iconClass}">${UI.escapeHTML(goal.emoji || "🎯")}</div>
              <div class="goal-info">
                <div class="goal-name">${UI.escapeHTML(goal.name)}</div>
                <div class="goal-timeline">${timelineText}</div>
              </div>
              <span class="goal-pct-badge" style="color:${p.badgeColor};">${pct}%</span>
            </div>
            <div class="goal-amounts">
              <div class="goal-amt-item">
                <span class="goal-amt-val">${Store.fmt(goal.saved)}</span>
                <span class="goal-amt-lbl">Saved</span>
              </div>
              <div class="goal-amt-item">
                <span class="goal-amt-val" style="color:var(--text-muted);">${Store.fmt(remMinor)}</span>
                <span class="goal-amt-lbl">Remaining</span>
              </div>
              <div class="goal-amt-item">
                <span class="goal-amt-val">${Store.fmt(goal.target)}</span>
                <span class="goal-amt-lbl">Target</span>
              </div>
            </div>
            <div class="goal-track">
              <div class="goal-fill" style="width:${pct}%;background:${p.fillGrad}"></div>
            </div>
            <div class="goal-actions">
              <button class="btn-goal-contribute" data-goal-id="${goal.id}">${contributeLabel}</button>
              <button class="btn-goal-edit" data-edit-goal-id="${goal.id}">Edit</button>
            </div>
          `;

          // Card click selects for milestone view
          card.addEventListener("click", (e) => {
            if (e.target.closest("button")) return;
            selectedGoalId = goal.id;
            renderGoals();
          });

          // Contribute button
          const contBtn = card.querySelector(".btn-goal-contribute");
          contBtn.addEventListener("click", async (e) => {
            e.stopPropagation();
            const minor = await UI.promptAmount({
              title: `Add to ${goal.name}`,
              label: "Contribution amount",
              hint: `Target: ${Store.fmt(goal.target)} · Saved: ${Store.fmt(goal.saved)}`,
              btnLabel: "Contribute",
            });
            if (minor && minor > 0) {
              const res = Store.addContribution(goal.id, minor);
              if (!res.ok) {
                UI.toast(res.message || "Could not update this goal. Please try again.", { type: "error" });
                return;
              }
              if (res.completed) {
                UI.toast(`🎉 Goal "${goal.name}" completed! Fantastic job!`, { type: "success" });
              } else {
                UI.toast(`Added ${Store.fmt(minor)} to ${goal.name}! 🎯`, { type: "success" });
              }
              renderGoals();
            }
          });

          // Edit button
          const editBtn = card.querySelector(".btn-goal-edit");
          editBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            openEditGoalForm(goal);
          });

          goalsGrid.insertBefore(card, addGoalCard);
        });
      }
    }

    // ── 5. Milestones for Selected Goal ─────────────────────────────────────
    renderMilestones(goals);

    // ── 6. Smart Saving Tips ────────────────────────────────────────────────
    renderTips(activeGoals);

    // ── 7. Completed Goals ──────────────────────────────────────────────────
    renderCompletedGoals(completedGoals);
  }

  function renderMilestones(goals) {
    const milestoneCardTitle = document.getElementById("milestoneCardTitle");
    const milestoneCardSub = document.getElementById("milestoneCardSub");
    const milestoneList = document.getElementById("milestoneList");

    if (!milestoneList) return;

    const goal = goals.find(g => g.id === selectedGoalId) || goals[0];
    if (!goal) {
      if (milestoneCardTitle) milestoneCardTitle.textContent = "🎯 Goal Milestones";
      if (milestoneCardSub) milestoneCardSub.textContent = "No goals created yet";
      milestoneList.innerHTML = `
        <div style="text-align:center;padding:20px;color:var(--text-muted);font-size:12px;">
          Create a goal to view savings milestones.
        </div>
      `;
      return;
    }

    if (milestoneCardTitle) milestoneCardTitle.textContent = `${goal.emoji || "🎯"} ${goal.name} Milestones`;
    if (milestoneCardSub) milestoneCardSub.textContent = `${Store.fmt(goal.saved)} saved · ${Store.fmt(goal.target)} target`;

    const m25 = Math.round(goal.target * 0.25);
    const m50 = Math.round(goal.target * 0.50);
    const m75 = Math.round(goal.target * 0.75);
    const m100 = goal.target;

    const milestones = [
      { label: `25% milestone — ${Store.fmt(m25)}`, target: m25 },
      { label: `50% milestone — ${Store.fmt(m50)}`, target: m50 },
      { label: `75% milestone — ${Store.fmt(m75)}`, target: m75 },
      { label: `Goal complete! — ${Store.fmt(m100)} 🎉`, target: m100 },
    ];

    let firstFutureFound = false;

    milestoneList.innerHTML = milestones
      .map(m => {
        let dotClass = "milestone-dot-future";
        let symbol = "○";
        let dateText = "Pending target";

        if (goal.saved >= m.target) {
          dotClass = "milestone-dot-done";
          symbol = "✓";
          dateText = "Achieved!";
        } else if (!firstFutureFound) {
          firstFutureFound = true;
          dotClass = "milestone-dot-active";
          symbol = "→";
          dateText = `Needs ${Store.fmt(m.target - goal.saved)} more`;
        }

        return `
          <div class="milestone-item">
            <div class="milestone-dot ${dotClass}">${symbol}</div>
            <div class="milestone-content">
              <div class="milestone-title">${UI.escapeHTML(m.label)}</div>
              <div class="milestone-date">${dateText}</div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  function renderTips(activeGoals) {
    const container = document.getElementById("goalTipsContainer");
    if (!container) return;

    const tips = [];

    // Find goal close to completion
    const closeGoal = activeGoals.find(g => {
      const p = (g.saved / (g.target || 1)) * 100;
      return p >= 75 && p < 100;
    });

    if (closeGoal) {
      const rem = Store.fmt(closeGoal.target - closeGoal.saved);
      tips.push({
        icon: "🚀",
        title: `Almost there on ${closeGoal.name}!`,
        msg: `Only <strong>${rem}</strong> left to hit your goal. Skip one takeout or movie this week to finish it!`,
        bg: "",
      });
    }

    // Find goal needing monthly plan
    const deadlineGoal = activeGoals.find(g => g.deadline);
    if (deadlineGoal) {
      const now = new Date();
      const d = Store.parseDate(deadlineGoal.deadline);
      if (d && d > now) {
        const months = Math.max(1, ((d.getFullYear() - now.getFullYear()) * 12) + (d.getMonth() - now.getMonth()));
        const rem = Math.max(0, deadlineGoal.target - deadlineGoal.saved);
        const monthly = Store.fmt(Math.round(rem / months));
        tips.push({
          icon: "📅",
          title: "Automate your savings",
          msg: `Set aside <strong>${monthly}/month</strong> to hit your ${deadlineGoal.name} deadline by ${deadlineGoal.deadline}.`,
          bg: "background:rgba(99,102,241,0.08);border-color:rgba(99,102,241,0.2);",
        });
      }
    }

    // Default rule tip
    tips.push({
      icon: "⚡",
      title: "Pay yourself first",
      msg: "Transfer your monthly goal savings as soon as you receive your monthly allowance/income before spending.",
      bg: "background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.2);",
    });

    container.innerHTML = tips
      .slice(0, 3)
      .map(t => `
        <div class="tip-banner" style="${t.bg || ""}">
          <div class="tip-banner-icon">${t.icon}</div>
          <div class="tip-banner-body">
            <div class="tip-banner-title">${UI.escapeHTML(t.title)}</div>
            <p class="tip-banner-msg">${t.msg}</p>
          </div>
        </div>
      `)
      .join("");
  }

  function renderCompletedGoals(completedGoals) {
    const sub = document.getElementById("completedGoalsSub");
    const container = document.getElementById("completedGoalsList");
    if (!container) return;

    if (sub) {
      sub.textContent = `${completedGoals.length} goal${completedGoals.length === 1 ? "" : "s"} achieved`;
    }

    if (completedGoals.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">
          Completed goals will appear here as badges of honor! 🏅
        </div>
      `;
      return;
    }

    container.innerHTML = completedGoals
      .map(g => `
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:rgba(16,185,129,0.05);border:1px solid rgba(16,185,129,0.15);border-radius:12px;">
          <span style="font-size:22px;">${UI.escapeHTML(g.emoji || "🎯")}</span>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${UI.escapeHTML(g.name)}
            </div>
            <div style="font-size:11px;color:var(--text-muted);">
              Completed ${g.completedAt || "recently"} · ${Store.fmt(g.target)}
            </div>
          </div>
          <span class="chip chip-green" style="font-size:11px;flex-shrink:0;">Done ✓</span>
        </div>
      `)
      .join("");
  }

  function openEditGoalForm(goal) {
    const addGoalFormCard = document.getElementById("addGoalFormCard");
    const heading = document.getElementById("goalFormHeading");
    const editingIdInput = document.getElementById("editingGoalId");
    const nameInput = document.getElementById("goalName");
    const targetInput = document.getElementById("goalTarget");
    const savedInput = document.getElementById("goalSaved");
    const deadlineInput = document.getElementById("goalDeadline");
    const iconInput = document.getElementById("goalIcon");
    const saveBtn = document.getElementById("saveGoalBtn");
    const deleteBtn = document.getElementById("deleteGoalBtn");

    if (!addGoalFormCard) return;

    editingIdInput.value = goal.id;
    nameInput.value = goal.name || "";
    targetInput.value = (Store.fromMinor(goal.target)).toFixed(2);
    savedInput.value = (Store.fromMinor(goal.saved)).toFixed(2);
    deadlineInput.value = goal.deadline || "";
    iconInput.value = goal.emoji || "🎯";

    if (heading) heading.textContent = `Edit Goal: ${goal.name}`;
    if (saveBtn) saveBtn.textContent = "Save Changes";
    if (deleteBtn) deleteBtn.style.display = "block";

    addGoalFormCard.style.display = "block";
    addGoalFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
    nameInput.focus();
  }

  function resetGoalForm() {
    const addGoalFormCard = document.getElementById("addGoalFormCard");
    const heading = document.getElementById("goalFormHeading");
    const editingIdInput = document.getElementById("editingGoalId");
    const nameInput = document.getElementById("goalName");
    const targetInput = document.getElementById("goalTarget");
    const savedInput = document.getElementById("goalSaved");
    const deadlineInput = document.getElementById("goalDeadline");
    const iconInput = document.getElementById("goalIcon");
    const saveBtn = document.getElementById("saveGoalBtn");
    const deleteBtn = document.getElementById("deleteGoalBtn");

    if (editingIdInput) editingIdInput.value = "";
    if (nameInput) nameInput.value = "";
    if (targetInput) targetInput.value = "";
    if (savedInput) savedInput.value = "";
    if (deadlineInput) deadlineInput.value = "";
    if (iconInput) iconInput.value = "🎯";

    if (heading) heading.textContent = "New Savings Goal";
    if (saveBtn) saveBtn.textContent = "Create Goal";
    if (deleteBtn) deleteBtn.style.display = "none";

    UI.clearFieldError(nameInput);
    UI.clearFieldError(targetInput);
  }

  function bindEvents() {
    const addGoalFormCard = document.getElementById("addGoalFormCard");
    const addGoalBtn = document.getElementById("addGoalBtn");
    const addGoalCard = document.getElementById("addGoalCard");
    const cancelGoalBtn = document.getElementById("cancelGoalBtn");
    const saveGoalBtn = document.getElementById("saveGoalBtn");
    const deleteGoalBtn = document.getElementById("deleteGoalBtn");

    const editingIdInput = document.getElementById("editingGoalId");
    const nameInput = document.getElementById("goalName");
    const targetInput = document.getElementById("goalTarget");
    const savedInput = document.getElementById("goalSaved");
    const deadlineInput = document.getElementById("goalDeadline");
    const iconInput = document.getElementById("goalIcon");

    function openNew() {
      resetGoalForm();
      if (addGoalFormCard) {
        addGoalFormCard.style.display = "block";
        addGoalFormCard.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      if (nameInput) nameInput.focus();
    }

    if (addGoalBtn) addGoalBtn.addEventListener("click", openNew);
    if (addGoalCard) addGoalCard.addEventListener("click", openNew);

    if (cancelGoalBtn) {
      cancelGoalBtn.addEventListener("click", () => {
        resetGoalForm();
        if (addGoalFormCard) addGoalFormCard.style.display = "none";
      });
    }

    if (saveGoalBtn) {
      saveGoalBtn.addEventListener("click", () => {
        let hasError = false;

        const name = (nameInput.value || "").trim();
        if (!name) {
          UI.setFieldError(nameInput, "Please enter a goal name");
          hasError = true;
        } else {
          UI.clearFieldError(nameInput);
        }

        const targetClean = (targetInput.value || "").replace(/,/g, "").trim();
        const targetMajor = parseFloat(targetClean);
        if (isNaN(targetMajor) || targetMajor <= 0) {
          UI.setFieldError(targetInput, "Please enter a valid target amount greater than 0");
          hasError = true;
        } else {
          UI.clearFieldError(targetInput);
        }

        if (hasError) return;

        const targetMinor = Store.toMinor(targetClean);
        const savedClean = (savedInput.value || "").replace(/,/g, "").trim();
        const savedMajor = parseFloat(savedClean) || 0;
        const savedMinor = Store.toMinor(Math.max(0, savedMajor));
        const deadline = deadlineInput.value || null;
        const emoji = (iconInput.value || "").trim() || "🎯";

        const editId = editingIdInput ? editingIdInput.value : "";

        if (editId) {
          // Update
          const res = Store.updateGoal(editId, {
            name,
            target: targetMinor,
            saved: savedMinor,
            deadline,
            emoji,
          });
          if (res.ok) {
            UI.toast(`Updated "${name}"!`, { type: "success" });
            resetGoalForm();
            if (addGoalFormCard) addGoalFormCard.style.display = "none";
            renderGoals();
          } else {
            UI.toast(res.message || "Failed to update goal", { type: "error" });
          }
        } else {
          // Create
          const res = Store.addGoal({
            name,
            target: targetMinor,
            saved: savedMinor,
            deadline,
            emoji,
          });
          if (res.ok) {
            UI.toast(`Goal "${name}" created! 🎯`, { type: "success" });
            selectedGoalId = res.goal.id;
            resetGoalForm();
            if (addGoalFormCard) addGoalFormCard.style.display = "none";
            renderGoals();
          } else {
            UI.toast(res.message || "Failed to create goal", { type: "error" });
          }
        }
      });
    }

    if (deleteGoalBtn) {
      deleteGoalBtn.addEventListener("click", async () => {
        const editId = editingIdInput ? editingIdInput.value : "";
        if (!editId) return;

        const goal = Store.getGoalById(editId);
        const name = goal ? goal.name : "this goal";

        const confirmed = await UI.confirm({
          title: "Delete Goal?",
          message: `Are you sure you want to delete "${name}"? This action cannot be undone.`,
          confirmText: "Delete",
          danger: true,
        });

        if (confirmed) {
          Store.removeGoal(editId);
          UI.toast(`Goal "${name}" deleted`, { type: "info" });
          resetGoalForm();
          if (addGoalFormCard) addGoalFormCard.style.display = "none";
          renderGoals();
        }
      });
    }

    // Cross-tab sync
    window.addEventListener(Store.EVENT_CHANGE, renderGoals);

    // Deep link #add
    if (location.hash === "#add") {
      openNew();
    }
  }

  function init() {
    renderGoals();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
