/* ==========================================================================
   js/insights.js — SpendSmart deterministic insight engine
   Pure functions, no DOM, no network.
   Depends on: store.js
   ========================================================================== */
(function () {
  "use strict";

  /**
   * Generate up to 5 insights based on current data.
   * Each insight: { id, severity: 'warn'|'good'|'info', icon, title, desc }
   * Sorted by severity (warn first, then good, then info).
   * Never shows an insight if its required inputs are missing.
   */
  function generate() {
    const profile = Store.getProfile();
    if (!profile) return [];

    const today = Store.todayStr();
    const [yStr, mStr] = today.split("-");
    const y = Number(yStr), m = Number(mStr);
    const daysInM   = Store.daysInMonth(y, m);
    const monthStart = `${yStr}-${mStr}-01`;
    const monthEnd   = `${yStr}-${mStr}-${String(daysInM).padStart(2, "0")}`;

    // Day of month (1-based)
    const dayOfMonth = Number(today.split("-")[2]);

    const usage    = Store.budgetUsage();
    const catTotals = Store.byCategory(monthStart, monthEnd);
    const catBudgets = profile.categoryBudgets || {};
    const results  = [];

    // ── Rule 1: Category ≥ 80% / ≥ 100% of budget with projected overshoot ───
    if (dayOfMonth >= 3) { // need at least a few days of data
      for (const cat of Store.CATEGORIES) {
        const budget  = catBudgets[cat.id] || 0;
        if (!budget) continue;
        const spent   = catTotals[cat.id] || 0;
        if (!spent) continue;
        const pct     = Math.round(spent / budget * 100);
        if (pct < 80) continue;

        // Projected month-end spend: spent ÷ daysElapsed × daysInMonth
        const projected = Math.round(spent / dayOfMonth * daysInM);
        const overshoot = projected - budget;

        if (pct >= 100) {
          results.push({
            id: `cat_over_${cat.id}`,
            severity: "warn",
            icon: "🚨",
            title: `${cat.label} budget exceeded`,
            desc: `You've spent ${Store.fmt(spent)} of your ${Store.fmt(budget)} ${cat.label} budget (${pct}%). Consider cutting back.`,
          });
        } else if (overshoot > 0) {
          results.push({
            id: `cat_warn_${cat.id}`,
            severity: "warn",
            icon: "⚠️",
            title: `${cat.label} spending at ${pct}% of budget`,
            desc: `At this rate you'll spend ${Store.fmt(projected)} — over by ${Store.fmt(overshoot)}. ${pct >= 90 ? "Take action now." : "Watch your spending."}`,
          });
        } else {
          results.push({
            id: `cat_near_${cat.id}`,
            severity: "info",
            icon: "📊",
            title: `${cat.label} at ${pct}% of budget`,
            desc: `You've used ${pct}% of your ${cat.label} budget with ${daysInM - dayOfMonth} days left this month.`,
          });
        }
      }
    }

    // ── Rule 2: Total budget projection ──────────────────────────────────────
    if (usage.total > 0 && dayOfMonth >= 3) {
      const pct  = usage.pct;
      const proj = Math.round(usage.spent / dayOfMonth * daysInM);
      const over = proj - usage.total;
      if (pct >= 85 && over > 0) {
        results.push({
          id: "total_budget_warn",
          severity: "warn",
          icon: "📉",
          title: `You've used ${pct}% of your monthly budget`,
          desc: `Projected spend for the month: ${Store.fmt(proj)} — ${Store.fmt(over)} over budget. Try to reduce daily spending.`,
        });
      }
    }

    // ── Rule 3: Savings vs last month ─────────────────────────────────────────
    const prevM = m === 1 ? 12 : m - 1;
    const prevY = m === 1 ? y - 1 : y;
    const currTotals = Store.monthTotals(y, m);
    const prevTotals = Store.monthTotals(prevY, prevM);

    if (prevTotals.income > 0 || prevTotals.expenses > 0) {
      const currSaved = currTotals.income - currTotals.expenses;
      const prevSaved = prevTotals.income - prevTotals.expenses;
      if (prevSaved > 0 && currSaved > prevSaved) {
        const pct = Math.round((currSaved - prevSaved) / prevSaved * 100);
        results.push({
          id: "savings_up",
          severity: "good",
          icon: "🎉",
          title: `${pct}% more saved than last month`,
          desc: `You saved ${Store.fmt(currSaved)} this month vs ${Store.fmt(prevSaved)} last month. Keep it up!`,
        });
      } else if (prevSaved > 0 && currSaved < prevSaved * 0.75) {
        const drop = Math.round((prevSaved - currSaved) / prevSaved * 100);
        results.push({
          id: "savings_down",
          severity: "warn",
          icon: "📉",
          title: `Savings down ${drop}% vs last month`,
          desc: `Last month you saved ${Store.fmt(prevSaved)}. You're on track for ${Store.fmt(Math.max(0, currSaved))} this month.`,
        });
      }
    }

    // ── Rule 4: Biggest spend weekday (needs ≥ 14 days of data) ──────────────
    if (dayOfMonth >= 14 || (() => {
      const txns = Store.list({ type: "expense" });
      const span = txns.length >= 10;
      return span;
    })()) {
      const weekdayTotals = new Array(7).fill(0);
      const weekdayCounts = new Array(7).fill(0);
      const fourtyFiveAgo = Store.addDays(today, -45);
      const txns = Store.list({ type: "expense", startDate: fourtyFiveAgo, endDate: today });
      for (const t of txns) {
        const d = Store.parseDate(t.date);
        if (!d) continue;
        weekdayTotals[d.getDay()] += t.amount;
        weekdayCounts[d.getDay()]++;
      }
      const avgDay = weekdayTotals.map((total, i) => weekdayCounts[i] > 0 ? total / weekdayCounts[i] : 0);
      const maxAvg = Math.max(...avgDay);
      const peakDay = avgDay.indexOf(maxAvg);
      const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      if (maxAvg > 0 && weekdayCounts[peakDay] >= 2) {
        results.push({
          id: "peak_weekday",
          severity: "info",
          icon: "📅",
          title: `${DAYS[peakDay]} is your highest spend day`,
          desc: `${DAYS[peakDay]}s average ${Store.fmt(Math.round(maxAvg))} in spending. Plan ahead to keep weekends in budget.`,
        });
      }
    }

    // ── Rule 5: Recurring subscriptions (same title in ≥ 2 distinct months) ──
    const allTxns = Store.list({ type: "expense" });
    const titleMonths = {};
    for (const t of allTxns) {
      const mo = t.date.slice(0, 7); // 'YYYY-MM'
      const key = t.title.toLowerCase().trim();
      if (!titleMonths[key]) titleMonths[key] = new Set();
      titleMonths[key].add(mo);
    }
    const recurring = Object.entries(titleMonths)
      .filter(([, mos]) => mos.size >= 2)
      .map(([title]) => {
        const txnsForTitle = allTxns.filter(t => t.title.toLowerCase().trim() === title);
        const latestAmt = txnsForTitle[0] ? txnsForTitle[0].amount : 0;
        return { title: txnsForTitle[0]?.title || title, amount: latestAmt };
      });
    if (recurring.length >= 2) {
      const totalRecurring = recurring.reduce((s, r) => s + r.amount, 0);
      results.push({
        id: "subscriptions",
        severity: "info",
        icon: "🔄",
        title: `Subscriptions cost ${Store.fmt(totalRecurring)}/month`,
        desc: `${recurring.map(r => r.title).slice(0, 3).join(", ")} appear every month. Review for unused ones.`,
      });
    } else if (recurring.length === 1) {
      results.push({
        id: "subscriptions",
        severity: "info",
        icon: "🔄",
        title: `Recurring: ${recurring[0].title}`,
        desc: `${Store.fmt(recurring[0].amount)}/month detected. Make sure it's still being used.`,
      });
    }

    // ── Rule 6: No-spend streak ───────────────────────────────────────────────
    const currentStreak = Store.streak();
    if (currentStreak >= 3) {
      results.push({
        id: "no_spend_streak",
        severity: "good",
        icon: "🔥",
        title: `${currentStreak}-day streak!`,
        desc: `You've stayed within your daily budget for ${currentStreak} consecutive days. Great discipline!`,
      });
    }

    // ── Rule 7: Goal ≥ 90% done ───────────────────────────────────────────────
    const goals = Store.getGoals().filter(g => !g.completedAt);
    for (const g of goals) {
      if (!g.target) continue;
      const pct = Math.round(g.saved / g.target * 100);
      if (pct >= 90 && pct < 100) {
        const remaining = g.target - g.saved;
        results.push({
          id: `goal_near_${g.id}`,
          severity: "good",
          icon: "🚀",
          title: `Almost there on "${g.name}"!`,
          desc: `Only ${Store.fmt(remaining)} left to complete your goal. You're at ${pct}%!`,
        });
      }
    }

    // ── Rule 8: Goal behind schedule ─────────────────────────────────────────
    for (const g of goals) {
      if (!g.target || !g.deadline) continue;
      const deadlineDate = Store.parseDate(g.deadline);
      if (!deadlineDate) continue;
      const nowDate = Store.parseDate(today);
      if (deadlineDate <= nowDate) continue; // overdue handled separately

      const monthsLeft = Math.max(1,
        (deadlineDate.getFullYear() - nowDate.getFullYear()) * 12 +
        (deadlineDate.getMonth() - nowDate.getMonth())
      );
      const needed = Math.ceil((g.target - g.saved) / monthsLeft);
      const createdDate = g.createdAt ? new Date(g.createdAt) : nowDate;
      const totalMonths = Math.max(1,
        (deadlineDate.getFullYear() - createdDate.getFullYear()) * 12 +
        (deadlineDate.getMonth() - createdDate.getMonth())
      );
      const elapsed = totalMonths - monthsLeft;
      const expectedSaved = Math.round(g.target * (elapsed / totalMonths));
      if (g.saved < expectedSaved * 0.8 && elapsed >= 1) {
        results.push({
          id: `goal_behind_${g.id}`,
          severity: "warn",
          icon: "⏰",
          title: `"${g.name}" needs attention`,
          desc: `Save ${Store.fmt(needed)}/month to reach ${Store.fmt(g.target)} by ${deadlineDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}.`,
        });
      }
    }

    // ── Sort: warn → good → info; deduplicate by id ────────────────────────
    const seen = new Set();
    const ORDER = { warn: 0, good: 1, info: 2 };
    return results
      .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
      .sort((a, b) => (ORDER[a.severity] || 2) - (ORDER[b.severity] || 2))
      .slice(0, 6);
  }

  window.Insights = { generate };
})();
