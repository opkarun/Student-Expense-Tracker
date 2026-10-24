(function () {
  "use strict";

  /**
   * Main Dashboard Controller (SpendSmart)
   */

  let sliderPendingContrib = 0;

  function renderDashboard() {
    const profile = Store.getProfile() || {};
    const today = Store.todayStr();
    const todayDate = new Date();
    const [yStr, mStr] = today.split("-");
    const y = Number(yStr), m = Number(mStr);
    const daysInM = Store.daysInMonth(y, m);
    const monthStart = `${yStr}-${mStr}-01`;
    const monthEnd = `${yStr}-${mStr}-${String(daysInM).padStart(2, "0")}`;

    // ── Profile setup summary ────────────────────────────────────────────────
    const profileFields = {
      profileCollege: profile.college || "Not added",
      profileCourse: profile.course || "Not added",
      profileLiving: ({ hostel: "Hostel", pg: "PG / Rent", home: "With family" })[profile.living] || "Not set",
      profileIncome: profile.monthlyIncome > 0 ? Store.fmt(profile.monthlyIncome) : "Not added",
      profileIncomeSources: Array.isArray(profile.incomeSources) && profile.incomeSources.length
        ? profile.incomeSources.join(", ")
        : "Not added",
      profileMonthlyBudget: profile.monthlyBudget > 0 ? Store.fmt(profile.monthlyBudget) : "Not set"
    };
    Object.keys(profileFields).forEach(id => {
      const element = document.getElementById(id);
      if (element) element.textContent = profileFields[id];
    });

    const categoryBudgets = document.getElementById("profileCategoryBudgets");
    if (categoryBudgets) {
      categoryBudgets.innerHTML = "";
      const configuredCategories = Store.CATEGORIES.filter(cat =>
        profile.categoryBudgets && profile.categoryBudgets[cat.id] > 0
      );
      if (configuredCategories.length) {
        configuredCategories.forEach(cat => {
          const row = document.createElement("li");
          const label = document.createElement("span");
          const amount = document.createElement("strong");
          label.textContent = cat.label;
          amount.textContent = Store.fmt(profile.categoryBudgets[cat.id]);
          row.append(label, amount);
          categoryBudgets.appendChild(row);
        });
      } else {
        const row = document.createElement("li");
        row.textContent = "No category budgets configured";
        categoryBudgets.appendChild(row);
      }
    }

    // ── 1. Greeting & Hero ───────────────────────────────────────────────────
    const greetingEl = document.querySelector("[data-time-greeting]");
    if (greetingEl) {
      const hour = todayDate.getHours();
      const period = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
      greetingEl.textContent = `Good ${period},`;
    }

    const nameEl = document.querySelector("[data-user-firstname]");
    if (nameEl) {
      const firstName = profile.name ? profile.name.trim().split(" ")[0] : "there";
      nameEl.textContent = firstName;
    }

    const eyebrowEl = document.getElementById("heroEyebrow");
    if (eyebrowEl) {
      const monthName = todayDate.toLocaleDateString("en-US", { month: "long" });
      const weekNum = Math.min(5, Math.ceil(todayDate.getDate() / 7));
      eyebrowEl.textContent = `${monthName} ${y} · Week ${weekNum}`;
    }

    // ── 2. Budget Dial ───────────────────────────────────────────────────────
    const usage = Store.budgetUsage();
    const dialArc = document.getElementById("dialArc");
    const dialPct = document.getElementById("dialPct");
    const dialCaption = document.getElementById("dialCaption");
    const dialWarn = document.getElementById("dialWarn");
    const dialTotal = document.getElementById("dialTotal");
    const dialSpent = document.getElementById("dialSpent");
    const dialLeft = document.getElementById("dialLeft");
    const heroDesc = document.getElementById("heroDesc");

    const pct = usage.pct || 0;
    const arcCircumference = 515.22;
    const clampedPct = Math.min(100, Math.max(0, pct));
    const targetOffset = arcCircumference - (clampedPct / 100) * arcCircumference;

    if (dialArc) {
      dialArc.style.strokeDashoffset = targetOffset.toFixed(2);
      if (pct > 100) {
        dialArc.setAttribute("stroke", "#F87171");
      } else if (pct >= 85) {
        dialArc.setAttribute("stroke", "url(#dialWarnGrad)");
      } else {
        dialArc.setAttribute("stroke", "url(#dialGrad)");
      }
    }

    if (dialPct) {
      dialPct.innerHTML = `${pct}<small>%</small>`;
      dialPct.style.color = pct > 100 ? "#F87171" : pct >= 85 ? "#FBBF24" : "";
    }

    if (dialCaption) {
      dialCaption.textContent = pct > 100 ? "over budget" : "budget used";
    }

    if (dialWarn) {
      if (pct > 100) {
        dialWarn.style.display = "block";
        dialWarn.textContent = `⚠️ Over budget by ${Store.fmt(usage.spent - usage.total)}`;
      } else if (pct >= 85) {
        dialWarn.style.display = "block";
        dialWarn.textContent = `⚠️ Approaching limit (${100 - pct}% left)`;
      } else {
        dialWarn.style.display = "none";
      }
    }

    if (dialTotal) dialTotal.textContent = Store.fmt(usage.total);
    if (dialSpent) dialSpent.textContent = Store.fmt(usage.spent);
    if (dialLeft) {
      if (pct > 100) {
        dialLeft.textContent = `−${Store.fmt(usage.spent - usage.total)}`;
        dialLeft.className = "df-val text-red";
      } else {
        dialLeft.textContent = Store.fmt(usage.total - usage.spent);
        dialLeft.className = "df-val text-green";
      }
    }

    if (heroDesc) {
      if (pct > 100) {
        heroDesc.textContent = `You've exceeded your monthly budget by ${Store.fmt(usage.spent - usage.total)}. Review recent expenses to balance back out.`;
      } else if (pct >= 85) {
        heroDesc.textContent = `You've used ${pct}% of your budget with ${daysInM - todayDate.getDate()} days remaining this month. Pace your spending carefully.`;
      } else if (pct > 0) {
        heroDesc.textContent = `You're on track this month! ${Store.fmt(usage.total - usage.spent)} remaining across your allocated categories.`;
      } else {
        heroDesc.textContent = "Welcome to your dashboard. Start logging expenses to track your spending against your monthly limit.";
      }
    }

    // ── 3. KPI Cards ─────────────────────────────────────────────────────────
    // A. Streak
    const streakVal = document.getElementById("kpiStreakVal");
    if (streakVal) {
      streakVal.textContent = Store.streak();
    }

    // B. Saved this month
    const curTotals = Store.monthTotals(y, m);
    const curSaved = curTotals.income - curTotals.expenses;
    const savedVal = document.getElementById("kpiSavedVal");
    const savedTrend = document.getElementById("kpiSavedTrend");
    if (savedVal) {
      savedVal.textContent = (curSaved < 0 ? "−" : "") + Store.fmt(Math.abs(curSaved));
    }
    if (savedTrend) {
      const prevY = m === 1 ? y - 1 : y;
      const prevM = m === 1 ? 12 : m - 1;
      const prevTotals = Store.monthTotals(prevY, prevM);
      const prevSaved = prevTotals.income - prevTotals.expenses;
      if (prevSaved > 0) {
        const diff = Math.round(((curSaved - prevSaved) / prevSaved) * 100);
        if (diff >= 0) {
          savedTrend.className = "kpi-trend text-green";
          savedTrend.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg> +${diff}% vs last mo`;
          savedTrend.style.display = "inline-flex";
        } else {
          savedTrend.className = "kpi-trend text-red";
          savedTrend.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg> ${diff}% vs last mo`;
          savedTrend.style.display = "inline-flex";
        }
      } else {
        savedTrend.style.display = "none";
      }
    }

    // C. Transactions this week + mini bars
    const weekStartDate = Store.addDays(today, -6);
    const weekTxns = Store.list({ startDate: weekStartDate, endDate: today });
    const txnVal = document.getElementById("kpiTxnVal");
    if (txnVal) txnVal.textContent = weekTxns.length;

    const miniBars = document.getElementById("kpiMiniBars");
    if (miniBars) {
      const weekDaily = Store.dailyTotals(weekStartDate, today);
      const days7 = [];
      let cur = weekStartDate;
      for (let i = 0; i < 7; i++) {
        days7.push(cur);
        cur = Store.addDays(cur, 1);
      }
      const maxSpend = Math.max(1, ...days7.map(d => weekDaily[d] || 0));
      miniBars.innerHTML = days7
        .map(d => {
          const val = weekDaily[d] || 0;
          const h = Math.max(4, Math.round((val / maxSpend) * 28));
          return `<span style="height:${h}px" title="${d}: ${Store.fmt(val)}"></span>`;
        })
        .join("");
    }

    // D. Nearest Goal
    const goals = Store.getGoals();
    const activeGoal = goals.find(g => !g.completedAt && g.saved < g.target);
    const kpiGoalPct = document.getElementById("kpiGoalPct");
    const kpiGoalLabel = document.getElementById("kpiGoalLabel");
    const kpiGoalFill = document.getElementById("kpiGoalFill");

    if (activeGoal) {
      const gPct = Math.min(100, Math.max(0, Math.round((activeGoal.saved / (activeGoal.target || 1)) * 100)));
      if (kpiGoalPct) kpiGoalPct.textContent = `${gPct}%`;
      if (kpiGoalLabel) kpiGoalLabel.textContent = activeGoal.name;
      if (kpiGoalFill) kpiGoalFill.style.setProperty("--kpi-goal-fill-w", `${gPct}%`);
    } else {
      if (kpiGoalPct) kpiGoalPct.textContent = "0%";
      if (kpiGoalLabel) kpiGoalLabel.textContent = "No active goal";
      if (kpiGoalFill) kpiGoalFill.style.setProperty("--kpi-goal-fill-w", "0%");
    }

    // ── 4. 7-Day Trend Chart ─────────────────────────────────────────────────
    const trendTotal = document.getElementById("trendTotal");
    const trendBars = document.getElementById("trendBars");
    const trendGuidelines = document.getElementById("trendGuidelines");
    const trendInsight = document.getElementById("trendInsight");

    const days7 = [];
    let curDay = weekStartDate;
    for (let i = 0; i < 7; i++) {
      days7.push(curDay);
      curDay = Store.addDays(curDay, 1);
    }
    const dailyExpenses = Store.dailyTotals(weekStartDate, today);
    const weekTotalSpent = days7.reduce((s, d) => s + (dailyExpenses[d] || 0), 0);

    if (trendTotal) {
      trendTotal.innerHTML = `${Store.fmt(weekTotalSpent)} <span class="trend-total-lbl">past 7 days</span>`;
    }

    const maxDaySpend = Math.max(0, ...days7.map(d => dailyExpenses[d] || 0));
    let peakDay = null;
    if (maxDaySpend > 0) {
      peakDay = days7.find(d => dailyExpenses[d] === maxDaySpend);
    }

    if (trendBars) {
      trendBars.innerHTML = days7
        .map(d => {
          const spent = dailyExpenses[d] || 0;
          const dateObj = Store.parseDate(d);
          const dayName = dateObj ? dateObj.toLocaleDateString("en-US", { weekday: "short" }) : d;
          const isPeak = peakDay === d;
          const isToday = d === today;
          const hPct = maxDaySpend > 0 ? Math.max(4, Math.round((spent / maxDaySpend) * 100)) : 4;
          return `
            <div class="bar-col ${isPeak ? "bar-col-peak" : ""} ${isToday ? "bar-col-today" : ""}">
              <span class="bar-value">${spent > 0 ? Store.fmtCompact(spent) : "0"}</span>
              <div class="bar-wrap">
                <div class="bar-fill ${isPeak ? "bar-fill-peak" : ""}" style="height:${hPct}%"></div>
              </div>
              <span class="bar-day">${dayName}</span>
            </div>
          `;
        })
        .join("");
    }

    if (trendGuidelines) {
      const topGuide = maxDaySpend > 0 ? maxDaySpend : 100000;
      trendGuidelines.innerHTML = `
        <div class="guide-line"><span>${Store.fmtCompact(topGuide)}</span></div>
        <div class="guide-line"><span>${Store.fmtCompact(Math.round(topGuide * 0.66))}</span></div>
        <div class="guide-line"><span>${Store.fmtCompact(Math.round(topGuide * 0.33))}</span></div>
        <div class="guide-line"><span>0</span></div>
      `;
    }

    if (trendInsight) {
      if (weekTotalSpent === 0) {
        trendInsight.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          No spending recorded in the past 7 days. Tap <strong>Log Expense</strong> to begin.
        `;
      } else {
        const peakDate = peakDay ? Store.parseDate(peakDay) : null;
        const peakDayName = peakDate ? peakDate.toLocaleDateString("en-US", { weekday: "long" }) : "";
        const dailyAvg = Math.round(weekTotalSpent / 7);
        trendInsight.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Peak spend was on <strong>${peakDayName}</strong> (${Store.fmt(maxDaySpend)}). Daily average is <strong>${Store.fmt(dailyAvg)}</strong>.
        `;
      }
    }

    // ── 5. Recent Transactions ───────────────────────────────────────────────
    const recentTxns = Store.list({ limit: 6 });
    const recentSub = document.getElementById("recentTxnSub");
    const recentList = document.getElementById("recentTxnList");

    if (recentSub) {
      recentSub.textContent = recentTxns.length ? `${recentTxns.length} most recent` : "No activity yet";
    }

    if (recentList) {
      if (!recentTxns.length) {
        recentList.innerHTML = "";
        recentList.appendChild(
          UI.emptyState({
            icon: "💳",
            title: "No transactions yet",
            desc: "Expenses and income you log will show up here.",
            actionText: "Add your first expense",
            actionFn: () => { location.href = "expenses.html#add"; },
          })
        );
      } else {
        recentList.innerHTML = recentTxns
          .map((t, idx) => {
            const isInc = t.type === "income";
            const cat = isInc
              ? (Store.INCOME_CATEGORIES[t.category] || { label: t.category || "Income", hex: "#10B981", icon: "💰" })
              : (Store.CATEGORIES[t.category] || { label: t.category || "Other", hex: "#A78BFA", icon: "🏷️" });

            const iconHtml = isInc
              ? `<span>${UI.escapeHTML(cat.icon)}</span>`
              : `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${cat.icon}</svg>`;

            const divider = idx < recentTxns.length - 1 ? '<div class="txn-divider"></div>' : "";

            return `
              <div class="txn-row ${isInc ? "income-row" : ""}" onclick="location.href='expenses.html'" title="View in Expenses">
                <div class="txn-icon" style="background:${cat.hex}22; color:${cat.hex};">
                  ${iconHtml}
                </div>
                <div class="txn-meta">
                  <span class="txn-name">${UI.escapeHTML(t.title)}</span>
                  <span class="txn-chip" style="background:${cat.hex}18; color:${cat.hex}; border:1px solid ${cat.hex}33;">
                    ${UI.escapeHTML(cat.label)}
                  </span>
                </div>
                <div class="txn-right">
                  <span class="txn-amt ${isInc ? "txn-credit" : "txn-debit"}">
                    ${isInc ? "+" : "−"} ${Store.fmt(t.amount)}
                  </span>
                  ${isInc ? '<span class="txn-badge-income">Income</span>' : `<span class="txn-date" style="font-size:11px;color:var(--text-muted);">${UI.relativeDate ? UI.relativeDate(t.date) : t.date}</span>`}
                </div>
              </div>
              ${divider}
            `;
          })
          .join("");
      }
    }

    // ── 6. Category Breakdown ────────────────────────────────────────────────
    const catMap = Store.byCategory(monthStart, monthEnd);
    const catSub = document.getElementById("catBreakdownSub");
    const donutRing = document.getElementById("donutRing");
    const donutLabel = document.getElementById("donutLabel");
    const donutCatList = document.getElementById("donutCatList");

    const catItems = Object.keys(catMap)
      .map(id => {
        const meta = Store.CATEGORIES[id] || { id, label: id, hex: "#A78BFA" };
        return {
          id,
          label: meta.label,
          hex: meta.hex,
          amount: catMap[id] || 0,
        };
      })
      .filter(c => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const totalCatSpend = catItems.reduce((s, c) => s + c.amount, 0);

    if (catSub) {
      const monthShort = todayDate.toLocaleDateString("en-US", { month: "short" });
      catSub.textContent = `${monthShort} ${y} · ${Store.fmt(totalCatSpend)} total`;
    }

    if (donutLabel) {
      donutLabel.textContent = Store.fmt(totalCatSpend);
    }

    if (donutRing && donutCatList) {
      if (totalCatSpend === 0 || !catItems.length) {
        donutRing.style.background = "rgba(255, 255, 255, 0.05)";
        donutRing.style.boxShadow = "none";
        donutCatList.innerHTML = '<li class="cat-row text-muted" style="justify-content:center;padding:16px 0;">No spending this month yet</li>';
      } else {
        donutRing.style.boxShadow = "";
        let displayCats = catItems;
        if (catItems.length > 5) {
          const top4 = catItems.slice(0, 4);
          const others = catItems.slice(4);
          const otherAmt = others.reduce((s, c) => s + c.amount, 0);
          displayCats = [
            ...top4,
            { id: "other", label: "Other Categories", hex: "#A78BFA", amount: otherAmt },
          ];
        }

        // Build conic gradient
        let curPct = 0;
        const stops = displayCats.map(c => {
          const start = curPct;
          curPct += (c.amount / totalCatSpend) * 100;
          return `${c.hex} ${start.toFixed(1)}% ${curPct.toFixed(1)}%`;
        });
        donutRing.style.background = `conic-gradient(${stops.join(", ")})`;

        // Build list rows
        donutCatList.innerHTML = displayCats
          .map(c => {
            const exactPct = (c.amount / totalCatSpend) * 100;
            const p = Math.round(exactPct);
            const pctLabel = exactPct > 0 && exactPct < 1 ? "<1%" : `${p}%`;
            return `
              <li class="cat-row">
                <span class="cat-color" style="background:${c.hex}"></span>
                <span class="cat-name">${UI.escapeHTML(c.label)}</span>
                <div class="cat-bar-wrap">
                  <div class="cat-bar" style="width:${Math.max(1, p)}%;background:${c.hex};opacity:0.85"></div>
                </div>
                <span class="cat-pct">${pctLabel}</span>
                <span class="cat-amt">${Store.fmt(c.amount)}</span>
              </li>
            `;
          })
          .join("");
      }
    }

    // ── 7. Goal Spotlight ────────────────────────────────────────────────────
    const spotlightIcon = document.getElementById("spotlightIcon");
    const spotlightTitle = document.getElementById("spotlightTitle");
    const spotlightTimeline = document.getElementById("spotlightTimeline");
    const spotlightBadge = document.getElementById("spotlightBadge");
    const spotlightSaved = document.getElementById("spotlightSaved");
    const spotlightRemaining = document.getElementById("spotlightRemaining");
    const spotlightTarget = document.getElementById("spotlightTarget");
    const spotlightAmountsRow = document.getElementById("spotlightAmountsRow");
    const spotlightTrack = document.getElementById("spotlightTrack");
    const spotlightFill = document.getElementById("spotlightFill");
    const spotlightMarker = document.getElementById("spotlightMarker");
    const spotlightTip = document.getElementById("spotlightTip");
    const spotlightBtnText = document.getElementById("spotlightBtnText");

    if (activeGoal) {
      const gPct = Math.min(100, Math.max(0, Math.round((activeGoal.saved / (activeGoal.target || 1)) * 100)));
      if (spotlightIcon) spotlightIcon.textContent = activeGoal.emoji || "🎯";
      if (spotlightTitle) spotlightTitle.textContent = activeGoal.name;

      if (spotlightTimeline) {
        if (activeGoal.deadline) {
          const dObj = Store.parseDate(activeGoal.deadline);
          const daysLeft = Math.ceil((dObj - todayDate) / (1000 * 60 * 60 * 24));
          if (daysLeft < 0) {
            spotlightTimeline.textContent = `⚠️ Target passed (${activeGoal.deadline})`;
          } else if (daysLeft === 0) {
            spotlightTimeline.textContent = "🗓 Due today!";
          } else {
            spotlightTimeline.textContent = `🗓 ${daysLeft} days left (${activeGoal.deadline})`;
          }
        } else {
          spotlightTimeline.textContent = "🗓 Ongoing target";
        }
      }

      if (spotlightBadge) spotlightBadge.textContent = `${gPct}%`;
      if (spotlightSaved) spotlightSaved.textContent = Store.fmt(activeGoal.saved);
      if (spotlightRemaining) spotlightRemaining.textContent = Store.fmt(Math.max(0, activeGoal.target - activeGoal.saved));
      if (spotlightTarget) spotlightTarget.textContent = Store.fmt(activeGoal.target);
      if (spotlightFill) {
        spotlightFill.style.width = `${gPct}%`;
        spotlightFill.style.setProperty("--goal-fill-w", `${gPct}%`);
      }
      if (spotlightMarker) {
        spotlightMarker.style.left = `${gPct}%`;
        spotlightMarker.style.display = gPct > 0 ? "block" : "none";
      }
      if (spotlightTip) spotlightTip.textContent = Store.fmt(activeGoal.saved);
      if (spotlightBtnText) spotlightBtnText.textContent = "Add to Savings";
      if (spotlightAmountsRow) spotlightAmountsRow.hidden = false;
      if (spotlightTrack) spotlightTrack.hidden = false;
      sliderPendingContrib = 0;

      // ── Interactive Savings Slider ──────────────────────────────────────────
      if (spotlightTrack) {
        let isSliding = false;

        const handleSliderMove = (e) => {
          if (!activeGoal || activeGoal.target <= 0) return;
          const rect = spotlightTrack.getBoundingClientRect();
          const clientX = e.clientX != null ? e.clientX : (e.touches && e.touches[0] ? e.touches[0].clientX : 0);
          const rawPct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
          const potentialSaved = Math.round(activeGoal.target * (rawPct / 100));

          if (potentialSaved > activeGoal.saved) {
            sliderPendingContrib = potentialSaved - activeGoal.saved;
            if (spotlightBtnText) spotlightBtnText.textContent = `Save +${Store.fmt(sliderPendingContrib)}`;
            if (spotlightTip) spotlightTip.textContent = `+${Store.fmt(sliderPendingContrib)}`;
          } else {
            sliderPendingContrib = 0;
            if (spotlightBtnText) spotlightBtnText.textContent = "Add to Savings";
            if (spotlightTip) spotlightTip.textContent = Store.fmt(potentialSaved);
          }

          const dispSaved = Math.max(activeGoal.saved, potentialSaved);
          const dispPct = Math.min(100, Math.round((dispSaved / activeGoal.target) * 100));

          if (spotlightFill) {
            spotlightFill.style.width = `${dispPct}%`;
            spotlightFill.style.setProperty("--goal-fill-w", `${dispPct}%`);
          }
          if (spotlightMarker) {
            spotlightMarker.style.left = `${rawPct}%`;
            spotlightMarker.style.display = "block";
          }
          if (spotlightBadge) spotlightBadge.textContent = `${dispPct}%`;
          if (spotlightSaved) spotlightSaved.textContent = Store.fmt(dispSaved);
          if (spotlightRemaining) spotlightRemaining.textContent = Store.fmt(Math.max(0, activeGoal.target - dispSaved));
        };

        spotlightTrack.onpointerdown = (e) => {
          isSliding = true;
          spotlightTrack.classList.add("is-sliding");
          if (spotlightMarker) spotlightMarker.classList.add("is-dragging");
          try { spotlightTrack.setPointerCapture(e.pointerId); } catch (_) {}
          handleSliderMove(e);
        };

        spotlightTrack.onpointermove = (e) => {
          if (!isSliding) return;
          handleSliderMove(e);
        };

        const stopSliding = (e) => {
          if (!isSliding) return;
          isSliding = false;
          spotlightTrack.classList.remove("is-sliding");
          if (spotlightMarker) spotlightMarker.classList.remove("is-dragging");
          try { if (e && e.pointerId) spotlightTrack.releasePointerCapture(e.pointerId); } catch (_) {}
        };

        spotlightTrack.onpointerup = stopSliding;
        spotlightTrack.onpointercancel = stopSliding;
      }
    } else {
      if (spotlightIcon) spotlightIcon.textContent = "🎯";
      if (spotlightTitle) spotlightTitle.textContent = "No active goal yet";
      if (spotlightTimeline) spotlightTimeline.textContent = "Create a goal to start tracking savings";
      if (spotlightBadge) spotlightBadge.textContent = "—";
      if (spotlightSaved) spotlightSaved.textContent = Store.fmt(0);
      if (spotlightRemaining) spotlightRemaining.textContent = "—";
      if (spotlightTarget) spotlightTarget.textContent = "—";
      if (spotlightFill) spotlightFill.style.setProperty("--goal-fill-w", "0%");
      if (spotlightMarker) spotlightMarker.style.display = "none";
      if (spotlightTip) spotlightTip.textContent = Store.fmt(0);
      if (spotlightBtnText) spotlightBtnText.textContent = "Create a Goal";
      if (spotlightAmountsRow) spotlightAmountsRow.hidden = true;
      if (spotlightTrack) spotlightTrack.hidden = true;
    }

    // ── 8. Smart Tip Strip ───────────────────────────────────────────────────
    const tipStrip = document.getElementById("dashTipStrip");
    const tipIcon = document.getElementById("dashTipIcon");
    const tipLabel = document.getElementById("dashTipLabel");
    const tipMsg = document.getElementById("dashTipMsg");

    if (tipStrip) {
      const isDismissed = sessionStorage.getItem("ss_dash_tip_dismissed") === "1";
      if (isDismissed) {
        tipStrip.style.display = "none";
      } else {
        const insightsList = typeof Insights !== "undefined" && Insights.generate ? Insights.generate() : [];
        if (insightsList.length > 0) {
          const top = insightsList[0];
          if (tipIcon) tipIcon.textContent = top.icon || "💡";
          if (tipLabel) tipLabel.textContent = top.title || "Smart Tip";
          if (tipMsg) tipMsg.innerHTML = top.desc;
          tipStrip.style.display = "flex";
        } else {
          if (tipIcon) tipIcon.textContent = "💡";
          if (tipLabel) tipLabel.textContent = "Smart Tip";
          if (tipMsg) tipMsg.textContent = "Track every expense as soon as it happens to keep your budget dial accurate!";
          tipStrip.style.display = "flex";
        }
      }
    }
  }

  function bindEvents() {
    // Logout
    const logoutBtn = document.getElementById("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", () => Auth.logout());

    // Export CSV
    const exportBtn = document.getElementById("actionExportBtn");
    if (exportBtn) {
      exportBtn.addEventListener("click", () => {
        const txns = Store.list({ limit: 10000 });
        if (!txns.length) {
          UI.toast("No transactions to export", { type: "info" });
          return;
        }
        const header = ["ID", "Date", "Type", "Category", "Title", "Amount"];
        const rows = txns.map(t => [
          t.id,
          t.date ? `="${t.date}"` : '""',
          t.type,
          `"${(t.category || "").replace(/"/g, '""')}"`,
          `"${(t.title || "").replace(/"/g, '""')}"`,
          Store.fromMinor(t.amount).toFixed(2),
        ]);
        const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\r\n");
        // Prepend UTF-8 BOM so Excel opens with proper character and date handling
        const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `spendsmart-transactions-${Store.todayStr()}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        UI.toast(`Exported ${txns.length} transactions as CSV`, { type: "success" });
      });
    }

    // Goal Spotlight Button
    const spotlightAddBtn = document.getElementById("spotlightAddBtn");
    if (spotlightAddBtn) {
      spotlightAddBtn.addEventListener("click", async () => {
        const goals = Store.getGoals();
        const goal = goals.find(g => !g.completedAt && g.saved < g.target);
        if (!goal) {
          location.href = "goals.html#add";
          return;
        }

        // If user interacted with the slider to choose an amount
        if (sliderPendingContrib > 0) {
          const contrib = sliderPendingContrib;
          sliderPendingContrib = 0;
          const result = Store.addGoalContribution(goal.id, contrib);
          if (!result.ok) {
            UI.toast(result.message || "Could not update this goal. Please try again.", { type: "error" });
            return;
          }
          UI.toast(`Added ${Store.fmt(contrib)} to ${goal.name}! 🎯`, { type: "success" });
          renderDashboard();
          return;
        }

        const minor = await UI.promptAmount({
          title: `Add to ${goal.name}`,
          label: "Contribution amount",
          hint: `Current target: ${Store.fmt(goal.target)} · Saved: ${Store.fmt(goal.saved)}`,
          btnLabel: "Contribute",
        });
        if (minor && minor > 0) {
          const result = Store.addGoalContribution(goal.id, minor);
          if (!result.ok) {
            UI.toast(result.message || "Could not update this goal. Please try again.", { type: "error" });
            return;
          }
          UI.toast(`Added ${Store.fmt(minor)} to ${goal.name}! 🎯`, { type: "success" });
          renderDashboard();
        }
      });
    }

    // Dismiss Tip
    const tipDismiss = document.getElementById("dashTipDismiss");
    if (tipDismiss) {
      tipDismiss.addEventListener("click", () => {
        sessionStorage.setItem("ss_dash_tip_dismissed", "1");
        const tipStrip = document.getElementById("dashTipStrip");
        if (tipStrip) tipStrip.style.display = "none";
      });
    }

    // React to store changes (cross-tab or modal additions)
    window.addEventListener(Store.EVENT_CHANGE, renderDashboard);

    // Welcome toast check
    const welcome = sessionStorage.getItem("ss_welcome_toast");
    if (welcome && typeof UI !== "undefined" && UI.toast) {
      UI.toast(welcome, { type: "success" });
      sessionStorage.removeItem("ss_welcome_toast");
    }
  }

  function init() {
    renderDashboard();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
