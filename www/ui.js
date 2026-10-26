/* Phone UI: left drawer menu, new Home / Transactions / Accounts screens. Overrides the old desktop layout. */
var drawerOpen = false, uiSheet = null;
var TAB_META = { overview: ["Home", "⌂"], transactions: ["Transactions", "⇅"], accounts: ["Accounts", "🏦"],
  recurring: ["Recurring", "🔁"], loans: ["Loans & Goals", "🎯"], reminders: ["Reminders", "⏰"] };
var CAT_GLYPH = { Food: "🍽", Transport: "🚌", Bills: "🧾", Shopping: "🛍", Health: "💊", Entertainment: "🎬",
  Family: "👪", Investment: "📈", Salary: "💼", Business: "🏪", Gift: "🎁", Other: "•" };
var AV_COLORS = ["#3346F0", "#0E9F6E", "#E0415E", "#7A4CE0", "#E08A1E", "#0EA5C6"];
function avColor(name) { var h = 0; String(name).split("").forEach(function (c) { h = (h * 31 + c.charCodeAt(0)) >>> 0; }); return AV_COLORS[h % AV_COLORS.length]; }
function openDrawer() { drawerOpen = true; render(); }
function closeDrawer() { drawerOpen = false; render(); }
function goTab(t) { drawerOpen = false; state.tab = t; render(); window.scrollTo(0, 0); }
function drawerDo(fn) { drawerOpen = false; render(); setTimeout(fn, 60); }
function closeSheet() { uiSheet = null; render(); }
function openTxSheet(id) { uiSheet = { kind: "tx", id: id }; render(); }
function openAccSheet(id) { uiSheet = { kind: "acc", id: id }; render(); }
function sheetDo(fn) { uiSheet = null; render(); setTimeout(fn, 60); }
function dayLabel(ds) {
  if (ds === todayStr()) return "Today";
  var y = new Date(); y.setDate(y.getDate() - 1); if (ds === localDateStr(y)) return "Yesterday";
  var p = ds.split("-"); var d = new Date(+p[0], +p[1] - 1, +p[2]);
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
function txGlyph(t) { return t.type === "transfer" ? "⇄" : (CAT_GLYPH[t.category] || (t.category ? t.category.charAt(0).toUpperCase() : "•")); }
function txItem(t) {
  var accs = accountsById(), title, sub;
  if (t.type === "transfer") { title = "Transfer"; sub = accountDisplayName(accs[t.fromAccountId]) + " → " + accountDisplayName(accs[t.toAccountId]); }
  else { title = t.note || t.category; sub = (t.note ? t.category + " · " : "") + accountDisplayName(accs[t.accountId]); }
  var cls = t.type === "income" ? "in" : t.type === "transfer" ? "tr" : "out";
  var sign = t.type === "income" ? "+" : t.type === "transfer" ? "" : "−";
  return '<button class="tx" onclick="openTxSheet(\'' + t.id + '\')"><div class="g">' + esc(txGlyph(t)) + '</div><div class="m"><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div><div class="a ' + cls + '">' + sign + fmt(t.amount) + '</div></button>';
}
function groupedTxHtml(list) {
  var order = [], by = {};
  list.forEach(function (t) { if (!by[t.date]) { by[t.date] = []; order.push(t.date); } by[t.date].push(t); });
  return order.map(function (d) {
    var net = by[d].reduce(function (s, t) { return s + (t.type === "income" ? t.amount : t.type === "expense" ? -t.amount : 0); }, 0);
    return '<div class="group"><div class="gday"><span>' + esc(dayLabel(d)) + '</span><span>' + (net === 0 ? "" : (net > 0 ? "+" : "−") + fmt(Math.abs(net))) + '</span></div>' + by[d].map(txItem).join("") + '</div>';
  }).join("");
}
function ownerGroups() {
  var g = {}, order = [];
  state.accounts.forEach(function (a) {
    var k = a.owner || (a.type === "cash" ? "Cash" : "Mine");
    if (!g[k]) { g[k] = []; order.push(k); } g[k].push(a);
  });
  return order.map(function (k) { return { name: k, accs: g[k], total: g[k].reduce(function (s, a) { return s + a.balance; }, 0) }; });
}

function renderOverview() {
  if (state.accounts.length === 0) return '<div class="empty">Add your first account to start your ledger.<br><button class="btn" style="width:auto;display:inline-flex;padding:13px 24px;" onclick="openAccountModal(null)">Add account</button></div>';
  var ms = monthStats(), tot = ms.income + ms.expense;
  var inW = tot ? Math.max(4, Math.round(ms.income / tot * 100)) : 50;
  var hero = '<div class="hero"><div class="lbl">Net worth</div><div class="big">' + fmt(netWorth()) + '</div>' +
    '<div class="split"><i class="in" style="width:' + inW + '%"></i><i class="out" style="width:' + (100 - inW) + '%"></i></div>' +
    '<div class="split-key"><div>' + fmt(ms.income) + '<small>Earned this month</small></div><div>' + fmt(ms.expense) + '<small>Spent this month</small></div></div></div>';
  var qaDefault = (lastUsedAccountId && accountsById()[lastUsedAccountId]) ? lastUsedAccountId : state.accounts[0].id;
  var opts = state.accounts.map(function (a) { return '<option value="' + a.id + '"' + (a.id === qaDefault ? " selected" : "") + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");
  var freq = frequentTransactionSignatures(4), chips = "";
  if (freq.length) chips = '<div class="filter-chips" style="margin:10px 0 0;">' + freq.map(function (f, i) { var t = f.sample; return '<button class="filter-chip" onclick="repeatTransaction(' + i + ')">' + esc((t.note || t.category) + " " + fmt(t.amount)) + '</button>'; }).join("") + '</div>';
  var pull = '<div class="pull"><div class="t">Log an expense in 5 seconds</div><select id="quick-add-account">' + opts + '</select>' +
    '<div class="qa-row"><input id="quick-add-input" placeholder="500 food lunch" inputmode="text" onkeydown="if(event.key===\'Enter\') submitQuickAdd()"><button class="qa-go" onclick="submitQuickAdd()">Add</button></div>' + chips + '</div>';
  var people = '<div class="sec"><h2>Family &amp; accounts<a onclick="goTab(\'accounts\')">See all</a></h2><div class="people">' +
    ownerGroups().map(function (o) { return '<button class="person" onclick="goTab(\'accounts\')"><div class="av" style="background:' + avColor(o.name) + '">' + esc(o.name.charAt(0).toUpperCase()) + '</div><div class="n">' + esc(o.name) + '</div><div class="v">' + fmt(o.total) + '</div></button>'; }).join("") + '</div></div>';
  var extra = "", mom = momComparison();
  if (mom.change !== null) { var up = mom.change > 0; extra += '<div class="mom">' + (up ? "▲" : "▼") + ' Spent <b style="color:' + (up ? RUST : FOREST) + ';">' + Math.abs(mom.change).toFixed(0) + '% ' + (up ? "more" : "less") + '</b> than last month</div>'; }
  var proj = monthProjection(); if (proj) extra += '<div class="mom">📈 On track to spend <b>' + fmt(proj.projected) + '</b> this month</div>';
  var bl = budgetStatusList();
  if (bl.length) extra += '<div class="section-label">Budgets this month</div>' + bl.map(function (b) {
    var pct = Math.min(100, b.spent / b.budget * 100), c = b.spent > b.budget ? RUST : (pct >= 80 ? GOLD : FOREST);
    return '<div class="bar-wrap"><div class="bar-label"><span>' + esc(b.category) + '</span><span>' + fmt(b.spent) + ' / ' + fmt(b.budget) + '</span></div><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + c + ';"></div></div></div>'; }).join("");
  var recent = recentTransactions(8);
  var act = '<div class="sec"><h2>Recent<a onclick="goTab(\'transactions\')">See all</a></h2>' + (recent.length ? groupedTxHtml(recent) : '<div class="empty">Nothing logged yet.<br>Tap <b>Add</b> below to record your first entry.</div>') + '</div>';
  return hero + pull + people + '<div class="sec">' + extra + netWorthChartHtml() + '</div>' + act;
}

function renderTransactions() {
  if (state.transactions.length === 0) return '<div class="page"><div class="empty">No transactions yet.<br>Tap <b>Add</b> to log one, or import your Excel sheet from the menu.</div></div>';
  var h = '<div class="page"><div class="search-wrap"><span class="icon">🔍</span><input id="f-search" value="' + esc(state.search) + '" oninput="setSearch(this.value)" placeholder="Search note, category or account"></div>' +
    '<div class="filter-chips">' + PERIODS.map(function (p) { return '<button class="filter-chip' + (state.filterPeriod === p.key ? " active" : "") + '" onclick="setFilterPeriod(\'' + p.key + '\')">' + p.label + '</button>'; }).join("") + '</div>';
  if (state.filterPeriod === "custom") h += '<div style="display:flex;gap:8px;margin-bottom:10px;"><input type="date" value="' + state.customStart + '" onchange="setCustomStart(this.value)"><input type="date" value="' + state.customEnd + '" onchange="setCustomEnd(this.value)"></div>';
  var ao = '<option value="all">All accounts</option>' + state.accounts.map(function (a) { return '<option value="' + a.id + '"' + (state.filterAccountId === a.id ? " selected" : "") + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");
  h += '<div style="display:flex;gap:8px;margin-bottom:12px;"><select onchange="setFilterAccount(this.value)">' + ao + '</select><select onchange="setFilterType(this.value)">' +
    ["all:All types", "income:Income", "expense:Expense", "transfer:Transfer"].map(function (o) { var p = o.split(":"); return '<option value="' + p[0] + '"' + (state.filterType === p[0] ? " selected" : "") + '>' + p[1] + '</option>'; }).join("") + '</select></div>';
  var fs = filteredStats();
  h += '<div class="summary"><div><small>Earned</small><b style="color:' + FOREST + '">' + fmt(fs.income) + '</b></div><div><small>Spent</small><b style="color:' + RUST + '">' + fmt(fs.expense) + '</b></div><div><small>Net</small><b>' + fmt(fs.net) + '</b></div></div>';
  h += '<div class="btn-row"><button class="btn outline" ' + (state.accounts.length < 2 ? "disabled" : "") + ' onclick="openTransactionModal(\'transfer\')">⇄ Transfer money</button><button class="btn outline" ' + (fs.count === 0 ? "disabled" : "") + ' onclick="exportCSV()">⬇ Download CSV</button></div>';
  var list = filteredTransactions();
  return h + (list.length ? groupedTxHtml(list) : '<div class="empty">Nothing matches these filters.<br>Try All time or clear the search.</div>') + '</div>';
}

function renderAccounts() {
  var h = '<div class="page"><div class="btn-row"><button class="btn" onclick="openAccountModal(null)">+ Add account</button></div>';
  if (!state.accounts.length) return h + '<div class="empty">No accounts yet.<br>Add cash, banks, family accounts, credit cards, mutual funds or stocks.</div></div>';
  ownerGroups().forEach(function (o) {
    h += '<div class="owner-h"><div class="av" style="background:' + avColor(o.name) + '">' + esc(o.name.charAt(0).toUpperCase()) + '</div><div class="nm">' + esc(o.name) + '</div><div class="tot">' + fmt(o.total) + '</div></div>';
    o.accs.forEach(function (a) {
      var credit = a.type === "credit_card", sub = ACCOUNT_TYPES[a.type].label;
      if (credit && a.creditLimit) sub += " · " + fmt(a.creditLimit + a.balance) + " available of " + fmt(a.creditLimit);
      h += '<div class="row" style="cursor:pointer" onclick="openAccSheet(\'' + a.id + '\')"><div class="icon" style="background:' + ACCOUNT_TYPES[a.type].color + '22;">' + ACCOUNT_TYPES[a.type].icon + '</div><div class="main"><div class="title">' + esc(a.name) + '</div><div class="sub">' + esc(sub) + '</div></div><div class="amt" style="color:' + (credit ? RUST : TEXT) + '">' + (credit ? "−" : "") + fmt(Math.abs(a.balance)) + '</div></div>';
    });
  });
  return h + '</div>';
}

function drawerHtml() {
  if (!drawerOpen) return "";
  var n = notificationCount();
  var item = function (t) { var m = TAB_META[t]; return '<button class="d-item' + (state.tab === t ? " on" : "") + '" onclick="goTab(\'' + t + '\')"><span class="gl">' + m[1] + '</span>' + m[0] + (t === "reminders" && n ? '<span class="pill">' + n + '</span>' : "") + '</button>'; };
  var act = function (gl, label, js) { return '<button class="d-item" onclick="drawerDo(function(){' + js + '})"><span class="gl">' + gl + '</span>' + label + '</button>'; };
  return '<div class="scrim" onclick="closeDrawer()"></div><nav class="drawer"><div class="d-head"><div class="d-logo">₹</div><div class="d-name">Paisa Diary</div><div class="d-sub">Net worth ' + fmt(netWorth()) + '</div></div><div class="d-list">' +
    ["overview", "transactions", "accounts", "recurring", "loans", "reminders"].map(item).join("") + '<div class="d-sep"></div>' +
    act("⬇", "Backup", "exportBackup()") + act("⬆", "Restore backup", "document.getElementById(\'restore-file-input\').click()") +
    act("📗", "Import my Excel", "openExcelImport()") + act("📄", "Import bank CSV", "openImportModal()") +
    act("📑", "Export Excel", "openExcelExportModal()") + act("🖨", "Print statement", "openPrintModal()") + '<div class="d-sep"></div>' +
    act("⚙", "Settings", "openSettings()") + act(currentTheme === "dark" ? "☀" : "🌙", currentTheme === "dark" ? "Light mode" : "Dark mode", "toggleTheme()") +
    act("🔒", "Lock now", "lockVault()") + '</div><div class="d-foot">Sundram Corp. · v1.0.0 · Offline, on this phone</div></nav>';
}
function sheetHtml() {
  if (!uiSheet) return "";
  var body, head;
  if (uiSheet.kind === "tx") {
    var t = state.transactions.find(function (x) { return x.id === uiSheet.id; }); if (!t) return "";
    head = (t.type === "transfer" ? "Transfer" : (t.note || t.category)) + " · " + fmt(t.amount);
    body = '<div class="sheet-meta">' + esc(dayLabel(t.date)) + '</div><button class="sheet-btn" onclick="sheetDo(function(){openTransactionModal(\'edit\',\'' + t.id + '\')})">✎ Edit</button>' +
      '<button class="sheet-btn red" onclick="sheetDo(function(){deleteTransaction(\'' + t.id + '\')})">🗑 Delete</button>';
  } else {
    var a = state.accounts.find(function (x) { return x.id === uiSheet.id; }); if (!a) return "";
    head = accountDisplayName(a);
    body = '<button class="sheet-btn" onclick="sheetDo(function(){openAccountModal(\'' + a.id + '\')})">✎ Edit account</button>' +
      ((a.type === "mutual_fund" || a.type === "stock") ? '<button class="sheet-btn" onclick="sheetDo(function(){openInvestmentHistory(\'' + a.id + '\')})">📈 Growth history</button>' : "") +
      '<button class="sheet-btn red" onclick="sheetDo(function(){deleteAccount(\'' + a.id + '\')})">🗑 Delete account</button>';
  }
  return '<div class="modal-overlay" onclick="if(event.target===this)closeSheet()"><div class="modal"><div class="modal-head"><h3>' + esc(head) + '</h3><button class="icon-btn" onclick="closeSheet()" aria-label="Close">✕</button></div><div class="modal-body" style="padding-top:4px;">' + body + '</div></div></div>';
}
function buildAppHtml() {
  var meta = TAB_META[state.tab] || TAB_META.overview, home = state.tab === "overview";
  var n = notificationCount(), badge = n ? '<span class="badge">' + n + '</span>' : "";
  var content = state.tab === "overview" ? renderOverview() : state.tab === "accounts" ? renderAccounts() : state.tab === "transactions" ? renderTransactions()
    : '<div class="page">' + (state.tab === "recurring" ? renderRecurring() : state.tab === "loans" ? renderLoansGoals() : renderReminders()) + '</div>';
  var anyModal = state.txModal || state.accountModal || dialogState || uiSheet;
  return '<div class="app"><header class="topbar' + (home ? " home" : "") + '"><button class="tb-btn" onclick="openDrawer()" aria-label="Open menu"><span class="burger"><i></i><i></i><i></i></span></button>' +
    '<div class="ttl">' + (home ? "Paisa Diary" : meta[0]) + '</div><button class="tb-btn" onclick="openNotifications()" aria-label="Notifications">🔔' + badge + '</button></header>' +
    content + '</div>' + '<input id="restore-file-input" class="file-input" type="file" accept="application/json,.json" onchange="handleRestoreFile(this)">' +
    '<input id="xl-import-input" class="file-input" type="file" accept=".xlsx,.xlsm,.xls" onchange="handleExcelImport(this)">' +
    (anyModal || drawerOpen ? "" : '<button class="fab" onclick="openTransactionModal(\'expense\')"><b>+</b>Add</button>') + drawerHtml() + sheetHtml() + modalHtml();
}
