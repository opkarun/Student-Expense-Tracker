(function () {
  "use strict";

  /**
   * Analytics Controller (SpendSmart)
   */

  let currentPeriodDays = 30;

  function renderAnalytics() {
    const today = Store.todayStr();
    const todayDate = new Date();
    const [yStr, mStr] = today.split("-");
    const y = Number(yStr), m = Number(mStr);
    const daysInM = Store.daysInMonth(y, m);

    const startDate = Store.addDays(today, -(currentPeriodDays - 1));
    const rangeTotals = Store.totalsForRange(startDate, today);

    // ── 1. Stat Strip ────────────────────────────────────────────────────────
    const statTotalSpent = document.getElementById("statTotalSpent");
    const statTotalSpentTrend = document.getElementById("statTotalSpentTrend");
    const statNetSaved = document.getElementById("statNetSaved");
    const statNetSavedTrend = document.getElementById("statNetSavedTrend");
    const statDailyAvg = document.getElementById("statDailyAvg");
    const statDailyAvgTrend = document.getElementById("statDailyAvgTrend");
    const statNoSpendDays = document.getElementById("statNoSpendDays");
    const statNoSpendDaysTrend = document.getElementById("statNoSpendDaysTrend");

    if (statTotalSpent) statTotalSpent.textContent = Store.fmt(rangeTotals.expenses);
    if (statNetSaved) {
      const net = rangeTotals.income - rangeTotals.expenses;
      statNetSaved.textContent = (net < 0 ? "−" : "") + Store.fmt(Math.abs(net));
    }
    const dailyAvg = Math.round(rangeTotals.expenses / currentPeriodDays);
    if (statDailyAvg) statDailyAvg.textContent = Store.fmt(dailyAvg);

    // No-spend days count in this period
    const dailyExpenses = Store.dailyTotals(startDate, today);
    let noSpendCount = 0;
    let curD = startDate;
    for (let i = 0; i < currentPeriodDays; i++) {
      if ((dailyExpenses[curD] || 0) === 0) {
        noSpendCount++;
      }
      curD = Store.addDays(curD, 1);
    }
    if (statNoSpendDays) statNoSpendDays.textContent = noSpendCount;
    if (statNoSpendDaysTrend) {
      statNoSpendDaysTrend.textContent = `${noSpendCount} of ${currentPeriodDays} days`;
    }

    // Previous period trend comparison
    const prevStart = Store.addDays(startDate, -currentPeriodDays);
    const prevEnd = Store.addDays(startDate, -1);
    const prevTotals = Store.totalsForRange(prevStart, prevEnd);

    if (statTotalSpentTrend) {
      if (prevTotals.expenses > 0) {
        const diff = Math.round(((rangeTotals.expenses - prevTotals.expenses) / prevTotals.expenses) * 100);
        if (diff > 0) {
          statTotalSpentTrend.className = "stat-trend trend-down";
          statTotalSpentTrend.textContent = `↑ ${diff}% vs prev ${currentPeriodDays}d`;
        } else {
          statTotalSpentTrend.className = "stat-trend trend-up";
          statTotalSpentTrend.textContent = `↓ ${Math.abs(diff)}% vs prev ${currentPeriodDays}d`;
        }
        statTotalSpentTrend.style.display = "";
      } else {
        statTotalSpentTrend.style.display = "none";
      }
    }

    if (statNetSavedTrend) {
      const prevNet = prevTotals.income - prevTotals.expenses;
      const curNet = rangeTotals.income - rangeTotals.expenses;
      if (prevNet > 0) {
        const diff = Math.round(((curNet - prevNet) / prevNet) * 100);
        if (diff >= 0) {
          statNetSavedTrend.className = "stat-trend trend-up";
          statNetSavedTrend.textContent = `↑ ${diff}% vs prev ${currentPeriodDays}d`;
        } else {
          statNetSavedTrend.className = "stat-trend trend-down";
          statNetSavedTrend.textContent = `↓ ${Math.abs(diff)}% vs prev ${currentPeriodDays}d`;
        }
        statNetSavedTrend.style.display = "";
      } else {
        statNetSavedTrend.style.display = "none";
      }
    }

    // ── 2. Daily Spending Bar Chart ──────────────────────────────────────────
    const dailyChartSub = document.getElementById("dailyChartSub");
    const dailyChartTotal = document.getElementById("dailyChartTotal");
    const dailyChartBars = document.getElementById("dailyChartBars");
    const dailyChartGuidelines = document.getElementById("dailyChartGuidelines");
    const dailyChartInsight = document.getElementById("dailyChartInsight");

    // We display 7 days in the bar chart (the past 7 days of the selected period)
    const weekStartDate = Store.addDays(today, -6);
    const days7 = [];
    let curDay = weekStartDate;
    for (let i = 0; i < 7; i++) {
      days7.push(curDay);
      curDay = Store.addDays(curDay, 1);
    }
    const recentDaily = Store.dailyTotals(weekStartDate, today);
    const weekSpendTotal = days7.reduce((s, d) => s + (recentDaily[d] || 0), 0);

    if (dailyChartSub) {
      dailyChartSub.textContent = currentPeriodDays === 7
        ? `Last 7 days · ${Store.fmt(weekSpendTotal)} this week`
        : `Showing last 7 days of ${currentPeriodDays}D period`;
    }
    if (dailyChartTotal) {
      dailyChartTotal.textContent = Store.fmt(weekSpendTotal);
    }

    const maxDaySpend = Math.max(0, ...days7.map(d => recentDaily[d] || 0));
    let peakDay = null;
    if (maxDaySpend > 0) {
      peakDay = days7.find(d => recentDaily[d] === maxDaySpend);
    }

    if (dailyChartBars) {
      dailyChartBars.innerHTML = days7
        .map(d => {
          const spent = recentDaily[d] || 0;
          const dateObj = Store.parseDate(d);
          const dayName = d === today ? "Today" : (dateObj ? dateObj.toLocaleDateString("en-US", { weekday: "short" }) : d);
          const isPeak = peakDay === d;
          const isToday = d === today;
          const hPct = maxDaySpend > 0 ? Math.max(4, Math.round((spent / maxDaySpend) * 100)) : 4;

          return `
            <div class="bar-col ${isPeak ? "bar-col-peak" : ""} ${isToday ? "bar-col-today" : ""}">
              <div class="bar-value">${spent > 0 ? Store.fmtCompact(spent) : "0"}</div>
              <div class="bar-wrap">
                <div class="bar-fill ${isPeak ? "bar-fill-peak" : ""}" style="height:${hPct}%"></div>
              </div>
              <div class="bar-day">${dayName}</div>
            </div>
          `;
        })
        .join("");
    }

    if (dailyChartGuidelines) {
      const topGuide = maxDaySpend > 0 ? maxDaySpend : 100000;
      dailyChartGuidelines.innerHTML = `
        <div class="guide-line"><span>${Store.fmtCompact(topGuide)}</span></div>
        <div class="guide-line"><span>${Store.fmtCompact(Math.round(topGuide * 0.66))}</span></div>
        <div class="guide-line"><span>${Store.fmtCompact(Math.round(topGuide * 0.33))}</span></div>
        <div class="guide-line"><span>0</span></div>
      `;
    }

    if (dailyChartInsight) {
      if (weekSpendTotal === 0) {
        dailyChartInsight.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--indigo-light)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style="font-size:12px;color:var(--text-secondary);">No spending recorded in this period yet.</span>
        `;
      } else {
        const peakDate = peakDay ? Store.parseDate(peakDay) : null;
        const peakDayName = peakDate ? peakDate.toLocaleDateString("en-US", { weekday: "long" }) : "";
        dailyChartInsight.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--indigo-light)" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span style="font-size:12px;color:var(--text-secondary);">${peakDayName} was your highest spend day — ${Store.fmt(maxDaySpend)}</span>
        `;
      }
    }

    // ── 3. Month Comparison ──────────────────────────────────────────────────
    const monthCompareBars = document.getElementById("monthCompareBars");
    if (monthCompareBars) {
      const months = [];
      let curY = y;
      let curM = m;
      for (let i = 0; i < 5; i++) {
        months.push({ year: curY, month: curM, isCurrent: i === 0 });
        curM--;
        if (curM === 0) {
          curM = 12;
          curY--;
        }
      }

      const monthData = months.map(entry => {
        const totals = Store.monthTotals(entry.year, entry.month);
        const dateObj = new Date(entry.year, entry.month - 1, 1);
        const name = dateObj.toLocaleDateString("en-US", { month: "long", year: "numeric" });
        return {
          name,
          spent: totals.expenses,
          isCurrent: entry.isCurrent,
        };
      });

      const maxMonthSpend = Math.max(1, ...monthData.map(d => d.spent));

      monthCompareBars.innerHTML = monthData
        .map(d => {
          const wPct = d.spent > 0 ? Math.max(4, Math.round((d.spent / maxMonthSpend) * 100)) : 2;
          const currentBadge = d.isCurrent
            ? '<span class="chip chip-red" style="font-size:10px;padding:1px 6px;margin-left:4px;">Current</span>'
            : "";
          const fillClass = d.isCurrent ? "compare-fill" : "compare-fill compare-fill-prev";

          return `
            <div class="compare-row">
              <div class="compare-row-top">
                <span class="compare-month">${UI.escapeHTML(d.name)} ${currentBadge}</span>
                <span class="compare-amt">${Store.fmt(d.spent)}</span>
              </div>
              <div class="compare-track">
                <div class="${fillClass}" style="width:${wPct}%"></div>
              </div>
            </div>
          `;
        })
        .join("");
    }

    // ── 4. Spending Heatmap ──────────────────────────────────────────────────
    const heatmapSub = document.getElementById("heatmapSub");
    const heatmapGrid = document.getElementById("heatmapGrid");

    if (heatmapSub) {
      const mName = todayDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      heatmapSub.textContent = `${mName} — daily intensity`;
    }

    if (heatmapGrid) {
      const mStartStr = `${yStr}-${mStr}-01`;
      const mEndStr = `${yStr}-${mStr}-${String(daysInM).padStart(2, "0")}`;
      const monthExpenses = Store.dailyTotals(mStartStr, mEndStr);
      const maxDaily = Math.max(1, ...Object.values(monthExpenses));

      // 1st day of month: 0=Sun .. 6=Sat
      const firstWeekday = new Date(y, m - 1, 1).getDay();

      const cells = [];
      // Leading empty cells
      for (let i = 0; i < firstWeekday; i++) {
        cells.push('<div class="heatmap-cell h0" style="opacity:0.2;" aria-hidden="true"></div>');
      }

      // Day cells
      for (let d = 1; d <= daysInM; d++) {
        const dStr = `${yStr}-${mStr}-${String(d).padStart(2, "0")}`;
        const spent = monthExpenses[dStr] || 0;
        let hClass = "h0";
        if (spent > 0) {
          const ratio = spent / maxDaily;
          if (ratio <= 0.25) hClass = "h1";
          else if (ratio <= 0.50) hClass = "h2";
          else if (ratio <= 0.75) hClass = "h3";
          else hClass = "h4";
        }
        cells.push(`
          <div class="heatmap-cell ${hClass}" title="${dStr}: ${Store.fmt(spent)}">${d}</div>
        `);
      }

      // Trailing empty cells to complete the 7-col row
      const totalCells = cells.length;
      const remainder = totalCells % 7;
      if (remainder !== 0) {
        for (let i = 0; i < 7 - remainder; i++) {
          cells.push('<div class="heatmap-cell h0" style="opacity:0.2;" aria-hidden="true"></div>');
        }
      }

      heatmapGrid.innerHTML = cells.join("");
    }

    // ── 5. Category SVG Donut Breakdown & Legend ─────────────────────────────
    const donutCardSub = document.getElementById("donutCardSub");
    const donutSvg = document.getElementById("donutSvg");
    const analyticsDonutTotal = document.getElementById("analyticsDonutTotal");
    const analyticsLegendList = document.getElementById("analyticsLegendList");

    const catMap = Store.byCategory(startDate, today);
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

    if (donutCardSub) {
      donutCardSub.textContent = `Past ${currentPeriodDays} days · ${Store.fmt(totalCatSpend)} total`;
    }
    if (analyticsDonutTotal) {
      analyticsDonutTotal.textContent = Store.fmt(totalCatSpend);
    }

    if (donutSvg && analyticsLegendList) {
      const circ = 376.99; // 2 * pi * 60
      if (totalCatSpend === 0 || !catItems.length) {
        donutSvg.innerHTML = `<circle class="donut-track" cx="80" cy="80" r="60" stroke-width="20"/>`;
        analyticsLegendList.innerHTML = `
          <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">
            No expenses recorded in this period.
          </div>
        `;
      } else {
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

        let curOffset = 0;
        const svgCircles = [`<circle class="donut-track" cx="80" cy="80" r="60" stroke-width="20"/>`];

        displayCats.forEach(c => {
          const dash = (c.amount / totalCatSpend) * circ;
          const rem = circ - dash;
          svgCircles.push(`
            <circle cx="80" cy="80" r="60" fill="none" stroke="${c.hex}" stroke-width="20"
              stroke-dasharray="${dash.toFixed(2)} ${rem.toFixed(2)}"
              stroke-dashoffset="${(-curOffset).toFixed(2)}"/>
          `);
          curOffset += dash;
        });

        donutSvg.innerHTML = svgCircles.join("");

        analyticsLegendList.innerHTML = displayCats
          .map(c => {
            const pct = Math.round((c.amount / totalCatSpend) * 100);
            return `
              <div class="legend-row">
                <span class="legend-dot" style="background:${c.hex}"></span>
                <span class="legend-name">${UI.escapeHTML(c.label)}</span>
                <div class="legend-bar-wrap">
                  <div class="legend-bar-fill" style="width:${pct}%;background:${c.hex}"></div>
                </div>
                <span class="legend-pct">${pct}%</span>
                <span class="legend-amt">${Store.fmt(c.amount)}</span>
              </div>
            `;
          })
          .join("");
      }
    }

    // ── 6. Smart Insights (AI) ───────────────────────────────────────────────
    const analyticsInsightList = document.getElementById("analyticsInsightList");
    if (analyticsInsightList) {
      const insights = typeof Insights !== "undefined" && Insights.generate ? Insights.generate() : [];
      if (!insights.length) {
        analyticsInsightList.innerHTML = `
          <div style="text-align:center;padding:16px;color:var(--text-muted);font-size:12px;">
            Log more transactions to reveal tailored AI spending patterns and recommendations! ✦
          </div>
        `;
      } else {
        analyticsInsightList.innerHTML = insights
          .map(item => {
            const iconBg = item.severity === "warn"
              ? "rgba(248,113,113,0.15)"
              : item.severity === "good"
              ? "rgba(16,185,129,0.15)"
              : "rgba(99,102,241,0.15)";

            return `
              <div class="insight-item">
                <div class="insight-icon" style="background:${iconBg};">${item.icon || "💡"}</div>
                <div class="insight-body">
                  <div class="insight-title">${UI.escapeHTML(item.title)}</div>
                  <div class="insight-desc">${item.desc}</div>
                </div>
              </div>
            `;
          })
          .join("");
      }
    }

    // ── 7. Income vs Expense ─────────────────────────────────────────────────
    const incExpCardSub = document.getElementById("incExpCardSub");
    const incVal = document.getElementById("incVal");
    const incBar = document.getElementById("incBar");
    const expVal = document.getElementById("expVal");
    const expBar = document.getElementById("expBar");
    const netSavingsVal = document.getElementById("netSavingsVal");
    const netSavingsFooter = document.getElementById("netSavingsFooter");

    if (incExpCardSub) {
      incExpCardSub.textContent = `Past ${currentPeriodDays} Days`;
    }

    const inc = rangeTotals.income;
    const exp = rangeTotals.expenses;
    const net = inc - exp;

    if (incVal) incVal.textContent = Store.fmt(inc);
    if (expVal) expVal.textContent = Store.fmt(exp);
    if (netSavingsVal) {
      netSavingsVal.textContent = (net < 0 ? "−" : "") + Store.fmt(Math.abs(net));
    }

    const maxIncExp = Math.max(inc, exp, 1);
    if (incBar) incBar.style.width = `${Math.min(100, Math.round((inc / maxIncExp) * 100))}%`;
    if (expBar) expBar.style.width = `${Math.min(100, Math.round((exp / maxIncExp) * 100))}%`;

    if (netSavingsFooter) {
      if (inc > 0) {
        const savedPct = Math.round((net / inc) * 100);
        if (savedPct >= 0) {
          netSavingsFooter.innerHTML = `💰 You saved <strong style="color:var(--emerald-light);">${savedPct}%</strong> of your total income this period`;
        } else {
          netSavingsFooter.innerHTML = `⚠️ Spending exceeded income by <strong style="color:var(--red);">${Store.fmt(Math.abs(net))}</strong> this period`;
        }
      } else {
        netSavingsFooter.innerHTML = `Total expenses logged: <strong>${Store.fmt(exp)}</strong>`;
      }
    }
  }

  function bindEvents() {
    const p7 = document.getElementById("period7");
    const p30 = document.getElementById("period30");
    const p90 = document.getElementById("period90");

    if (p7) {
      p7.addEventListener("click", () => {
        currentPeriodDays = 7;
        renderAnalytics();
      });
    }
    if (p30) {
      p30.addEventListener("click", () => {
        currentPeriodDays = 30;
        renderAnalytics();
      });
    }
    if (p90) {
      p90.addEventListener("click", () => {
        currentPeriodDays = 90;
        renderAnalytics();
      });
    }

    // Cross-tab sync
    window.addEventListener(Store.EVENT_CHANGE, renderAnalytics);
  }

  function init() {
    renderAnalytics();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
