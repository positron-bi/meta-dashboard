const RIALS_PER_BILLION_TOMAN = 10_000_000_000;
const number = new Intl.NumberFormat('fa-IR', { maximumFractionDigits: 1 });
const yearNumber = new Intl.NumberFormat('fa-IR', { useGrouping: false, maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat('fa-IR', { style: 'percent', maximumFractionDigits: 1 });
const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const get = (row, key) => row?.[key] ?? row?.[`[${key}]`] ?? null;
const val = (row, key) => Number(get(row, key) ?? 0);
const sum = (rows, key) => rows.reduce((total, row) => total + val(row, key), 0);
const tomanBillion = value => value / RIALS_PER_BILLION_TOMAN;
const fmt = value => number.format(tomanBillion(value));
const ratio = (a, b) => b ? a / b : null;
const byMonth = (year, month) => `${year}/${String(month).padStart(2, '0')}`;
const monthTitle = month => monthNames[Number(month) - 1] || '—';
const el = id => document.getElementById(id);
let data;
let selectedYear;
let selectedMonth = 'all';

function yearRows(year) {
  return data.financialKpi.filter(row => val(row, 'year') === Number(year)).sort((a, b) => val(a, 'monthNumber') - val(b, 'monthNumber'));
}

function rowsThrough(year, month) {
  const cutoff = Number(year) * 100 + Number(month);
  return data.financialKpi.filter(row => val(row, 'monthSort') <= cutoff);
}

function periodRows(year) {
  const rows = yearRows(year);
  return selectedMonth === 'all' ? rows : rows.filter(row => val(row, 'monthNumber') === Number(selectedMonth));
}

function totals(rows) {
  const revenue = sum(rows, 'netSales');
  const cogs = sum(rows, 'costOfGoodsSold');
  const operating = sum(rows, 'operatingExpense');
  const finance = sum(rows, 'financeCost');
  const other = sum(rows, 'otherIncome');
  const operationalProfit = revenue - cogs - operating;
  const profitBeforeTax = operationalProfit - finance + other;
  return { revenue, cogs, operating, finance, other, operationalProfit, profitBeforeTax, totalExpenses: cogs + operating + finance };
}

function balanceAt(year, month) {
  const rows = rowsThrough(year, month);
  const currentAssets = sum(rows, 'currentAssetsActivity');
  const nonCurrentAssets = sum(rows, 'nonCurrentAssetsActivity');
  const currentLiabilities = sum(rows, 'currentLiabilitiesActivity');
  const nonCurrentLiabilities = sum(rows, 'nonCurrentLiabilitiesActivity');
  const equity = sum(rows, 'equityActivity') + sum(rows, 'unclosedProfitLossActivity');
  return {
    currentAssets, nonCurrentAssets, currentLiabilities, nonCurrentLiabilities, equity,
    assets: currentAssets + nonCurrentAssets,
    liabilities: currentLiabilities + nonCurrentLiabilities,
    workingCapital: currentAssets - currentLiabilities
  };
}

function tooltip(container) {
  const tip = container.querySelector('.tooltip');
  container.querySelectorAll('[data-tip]').forEach(mark => {
    mark.addEventListener('mouseenter', event => {
      tip.textContent = event.currentTarget.dataset.tip;
      tip.style.left = `${event.offsetX}px`;
      tip.style.top = `${event.offsetY}px`;
      tip.style.opacity = 1;
    });
  });
  container.addEventListener('mouseleave', () => { tip.style.opacity = 0; });
}

function groupedBarChart(container, items, firstLabel, secondLabel, colors = ['#94a7bd', '#2878d4']) {
  if (!items.length) { container.textContent = 'داده‌ای برای نمایش وجود ندارد.'; return; }
  const values = items.flatMap(item => [item.first, item.second]).filter(Number.isFinite);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const w = 760, h = 290, p = { l: 42, r: 12, t: 18, b: 43 };
  const plotH = h - p.t - p.b;
  const group = (w - p.l - p.r) / items.length;
  const bw = Math.min(22, group * .29);
  const y = value => p.t + (max - value) / span * plotH;
  const zero = y(0);
  const labels = items.map((item, i) => {
    const cx = p.l + group * (i + .5);
    return `<text class="bar-label" x="${cx}" y="${h - 17}" text-anchor="middle">${item.label}</text>`;
  }).join('');
  const bars = items.map((item, i) => {
    const cx = p.l + group * (i + .5);
    return [item.first, item.second].map((value, j) => {
      if (!Number.isFinite(value)) return '';
      const x = cx + (j === 0 ? -bw - 2 : 2);
      const top = Math.min(y(value), zero);
      const height = Math.max(1, Math.abs(zero - y(value)));
      const label = j === 0 ? firstLabel : secondLabel;
      const v = value;
      const tip = `${item.fullLabel}: ${label} ${number.format(tomanBillion(v))} میلیارد تومان`;
      return `<rect data-tip="${tip}" x="${x}" y="${top}" width="${bw}" height="${height}" rx="3" fill="${colors[j]}"/>`;
    }).join('');
  }).join('');
  const ticks = [0, .5, 1].map(t => {
    const value = min + span * t;
    const yy = y(value);
    return `<line class="grid-line" x1="${p.l}" x2="${w - p.r}" y1="${yy}" y2="${yy}"/><text class="axis-label" x="${p.l - 7}" y="${yy + 4}" text-anchor="end">${number.format(tomanBillion(value))}</text>`;
  }).join('');
  container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" role="img">${ticks}<line class="zero-line" x1="${p.l}" x2="${w-p.r}" y1="${zero}" y2="${zero}"/>${bars}${labels}</svg><div class="tooltip"></div>`;
  tooltip(container);
}

function renderTrend(rows) {
  const items = rows.map(row => {
    const t = totals([row]);
    return { label: number.format(val(row, 'monthNumber')), fullLabel: `${monthTitle(get(row, 'monthNumber'))} ${yearNumber.format(val(row, 'year'))}`, first: t.revenue, second: t.operationalProfit };
  });
  groupedBarChart(el('trend-chart'), items, 'درآمد', 'سود عملیاتی', ['#2878d4', '#12a594']);
}

function renderBalance(balance) {
  const items = [['دارایی کل', balance.assets, '#2878d4'], ['بدهی کل', balance.liabilities, '#e9a23b'], ['حقوق صاحبان سهام', balance.equity, '#12a594']];
  const max = Math.max(1, ...items.map(item => Math.abs(item[1])));
  el('balance-chart').innerHTML = `<div class="balance-bars">${items.map(([label, value, color]) => `<div class="balance-bar-row"><span>${label}</span><div class="balance-track"><i style="width:${Math.max(1, Math.abs(value) / max * 100)}%;background:${color}"></i></div></div>`).join('')}</div>`;
  el('balance-list').innerHTML = items.map(([label, value]) => `<div class="balance-row"><span>${label}</span><b>${fmt(value)}</b></div>`).join('');
}

function renderPnl(rows) {
  const t = totals(rows);
  text('pnl-revenue', fmt(t.revenue));
  text('pnl-expenses', fmt(t.totalExpenses));
  text('pnl-net', fmt(t.profitBeforeTax));
  const lines = [
    ['درآمد خالص', t.revenue], ['بهای تمام‌شده', -t.cogs], ['سود ناخالص', t.revenue - t.cogs],
    ['هزینه عملیاتی', -t.operating], ['سود عملیاتی', t.operationalProfit], ['سایر درآمدها', t.other],
    ['هزینه مالی', -t.finance], ['سود قبل از مالیات', t.profitBeforeTax]
  ];
  el('pnl-table').innerHTML = lines.map(([label, amount]) => {
    const total = ['سود ناخالص', 'سود عملیاتی', 'سود قبل از مالیات'].includes(label);
    return `<tr class="${total ? 'total-row' : ''}"><td>${label}</td><td class="amount">${fmt(amount)}</td><td class="amount">${t.revenue ? percent.format(amount / t.revenue) : '—'}</td></tr>`;
  }).join('');
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  el('pnl-monthly-table').innerHTML = months.map(month => {
    const row = yearRows(selectedYear).find(item => val(item, 'monthNumber') === month);
    if (!row) return `<tr><td>${monthTitle(month)}</td>${'<td class="amount">—</td>'.repeat(6)}</tr>`;
    const mt = totals([row]);
    return `<tr><td>${monthTitle(month)}</td><td class="amount">${fmt(mt.revenue)}</td><td class="amount">${fmt(-mt.cogs)}</td><td class="amount">${fmt(-mt.operating)}</td><td class="amount">${fmt(-mt.finance)}</td><td class="amount">${fmt(mt.other)}</td><td class="amount">${fmt(mt.profitBeforeTax)}</td></tr>`;
  }).join('');
}

function budgetRows(year) {
  return data.budget.filter(row => String(get(row, 'period')).startsWith(`${year}/`)).sort((a, b) => String(get(a, 'period')).localeCompare(String(get(b, 'period'))));
}

function renderBudget(actualRows, ytdRows) {
  const budgets = budgetRows(selectedYear);
  const latestActualMonth = Math.max(0, ...yearRows(selectedYear).map(row => val(row, 'monthNumber')));
  const cutoff = selectedMonth === 'all' ? latestActualMonth : Number(selectedMonth);
  const relevantBudgets = budgets.filter(row => Number(String(get(row, 'period')).slice(-2)) <= cutoff);
  const actualYtd = totals(ytdRows);
  const revenueBudget = sum(relevantBudgets, 'revenue');
  const expenseBudget = sum(relevantBudgets, 'expenses');
  const budgetProfit = revenueBudget - expenseBudget;
  const actualProfit = actualYtd.revenue - actualYtd.totalExpenses;
  text('revenue-achievement', revenueBudget ? percent.format(actualYtd.revenue / revenueBudget) : '—');
  text('expense-achievement', expenseBudget ? percent.format(actualYtd.totalExpenses / expenseBudget) : '—');
  text('profit-variance', fmt(actualProfit - budgetProfit));
  text('actual-margin', actualYtd.revenue ? percent.format(actualProfit / actualYtd.revenue) : '—');

  const chartItems = metric => budgets.map(budget => {
    const month = Number(String(get(budget, 'period')).slice(-2));
    const actual = yearRows(selectedYear).find(row => val(row, 'monthNumber') === month);
    const t = actual ? totals([actual]) : null;
    let first = val(budget, metric === 'revenue' ? 'revenue' : 'expenses');
    let second = null;
    if (metric === 'revenue') second = t?.revenue ?? null;
    if (metric === 'expenses') second = t?.totalExpenses ?? null;
    if (metric === 'profit') { first = val(budget, 'revenue') - val(budget, 'expenses'); second = t ? t.revenue - t.totalExpenses : null; }
    return { label: number.format(month), fullLabel: monthTitle(month), first, second };
  });
  groupedBarChart(el('revenue-chart'), chartItems('revenue'), 'بودجه', 'عملکرد', ['#95a7bd', '#2878d4']);
  groupedBarChart(el('expense-chart'), chartItems('expenses'), 'بودجه', 'عملکرد', ['#95a7bd', '#e9a23b']);
  groupedBarChart(el('profit-chart'), chartItems('profit'), 'بودجه', 'عملکرد', ['#95a7bd', '#12a594']);

  const period = byMonth(selectedYear, selectedMonth === 'all' ? cutoff : selectedMonth);
  el('budget-table').innerHTML = budgets.map(budget => {
    const month = Number(String(get(budget, 'period')).slice(-2));
    const actual = yearRows(selectedYear).find(row => val(row, 'monthNumber') === month);
    const t = actual ? totals([actual]) : null;
    const revBudget = val(budget, 'revenue');
    const expBudget = val(budget, 'expenses');
    const profBudget = revBudget - expBudget;
    const revActual = t?.revenue ?? null;
    const expActual = t?.totalExpenses ?? null;
    const profActual = t ? t.revenue - t.totalExpenses : null;
    const cells = (budgetValue, actualValue, groupStart = false) => `<td class="amount ${groupStart ? 'group-start' : ''}">${fmt(budgetValue)}</td><td class="amount">${actualValue === null ? '—' : fmt(actualValue)}</td><td class="amount">${actualValue === null || !budgetValue ? '—' : percent.format(actualValue / budgetValue)}</td><td class="amount">${actualValue === null ? '—' : fmt(actualValue - budgetValue)}</td>`;
    return `<tr class="${get(budget, 'period') === period ? 'selected-row' : ''}"><td>${monthTitle(month)}</td>${cells(revBudget, revActual, true)}${cells(expBudget, expActual, true)}${cells(profBudget, profActual, true)}</tr>`;
  }).join('');
}

function text(id, value) { el(id).textContent = value; }

function render() {
  const actuals = yearRows(selectedYear);
  const latestMonth = Math.max(1, ...actuals.map(row => val(row, 'monthNumber')));
  const cutoff = selectedMonth === 'all' ? latestMonth : Number(selectedMonth);
  const ytdRows = actuals.filter(row => val(row, 'monthNumber') <= cutoff);
  const displayedRows = periodRows(selectedYear);
  const ytd = totals(ytdRows);
  const balance = balanceAt(selectedYear, cutoff);
  text('overview-revenue', fmt(ytd.revenue));
  text('overview-profit', fmt(ytd.profitBeforeTax));
  text('overview-assets', fmt(balance.assets));
  text('overview-working-capital', fmt(balance.workingCapital));
  text('current-ratio', ratio(balance.currentAssets, balance.currentLiabilities) === null ? '—' : number.format(ratio(balance.currentAssets, balance.currentLiabilities)));
  text('debt-equity-ratio', ratio(balance.liabilities, balance.equity) === null ? '—' : number.format(ratio(balance.liabilities, balance.equity)));
  text('voucher-count', number.format(sum(ytdRows, 'voucherCount')));
  const updated = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Tehran' }).format(new Date(data.extractedAt));
  text('freshness', `آخرین به‌روزرسانی داده‌ها: ${updated}`);
  text('header-period', selectedMonth === 'all'
    ? `سال مالی ${yearNumber.format(selectedYear)} · تا ${monthTitle(latestMonth)}`
    : `سال مالی ${yearNumber.format(selectedYear)} · ${monthTitle(selectedMonth)}`);
  renderTrend(actuals);
  renderBalance(balance);
  renderPnl(displayedRows);
  renderBudget(displayedRows, ytdRows);
}

function setup() {
  const years = [...new Set([...data.financialKpi.map(row => val(row, 'year')), ...data.budget.map(row => Number(String(get(row, 'period')).slice(0, 4)))])].sort((a, b) => b - a);
  const yearSelect = el('year-select');
  years.forEach(year => yearSelect.add(new Option(yearNumber.format(year), String(year))));
  selectedYear = years.includes(1405) ? 1405 : years[0];
  yearSelect.value = String(selectedYear);
  const monthSelect = el('month-select');
  monthSelect.add(new Option('همه ماه‌ها', 'all'));
  monthNames.forEach((month, index) => monthSelect.add(new Option(month, String(index + 1))));
  monthSelect.value = 'all';
  yearSelect.addEventListener('change', () => { selectedYear = Number(yearSelect.value); render(); });
  monthSelect.addEventListener('change', () => { selectedMonth = monthSelect.value; render(); });
  document.querySelectorAll('.nav-item').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('.nav-item, .view').forEach(node => node.classList.remove('active'));
    button.classList.add('active');
    el(button.dataset.view).classList.add('active');
    text('page-title', button.dataset.title);
    text('section-path', button.dataset.title);
  }));
  render();
}

fetch('data/dashboard-data.json').then(response => {
  if (!response.ok) throw new Error('data not found');
  return response.json();
}).then(json => { data = json; setup(); }).catch(() => {
  document.body.innerHTML = '<p style="padding:40px">داده‌ها بارگذاری نشدند. داشبورد را از طریق یک وب‌سرور اجرا کنید.</p>';
});
