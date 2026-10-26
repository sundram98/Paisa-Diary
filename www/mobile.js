/* Phone-only additions: starter accounts + import of the "Expenses Sheet" Excel layout */
var STARTER_ACCOUNTS = [
  { name: "Union Bank", owner: "Dadi",  type: "family" },
  { name: "Axis Bank",  owner: "Daddy", type: "family" },
  { name: "Hdfc Bank",  owner: "Mummy", type: "family" },
  { name: "Yes Bank",   owner: "Neetu", type: "family" },
  { name: "Cash",       owner: "",      type: "cash" }
];
function starterAccounts() {
  return STARTER_ACCOUNTS.map(function (a) {
    return { id: uid(), name: a.name, type: a.type, owner: a.owner, balance: 0, valueHistory: [], creditLimit: 0 };
  });
}
function xlDate(v, fallbackYear, monthIdx) {
  if (v instanceof Date && !isNaN(v)) return localDateStr(v);
  if (typeof v === "number" && v > 20000) { var d = new Date(Math.round((v - 25569) * 86400000)); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
  var t = String(v == null ? "" : v).trim();
  var m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + m[2].padStart(2, "0") + "-" + m[3].padStart(2, "0");
  m = t.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) { var y = m[3].length === 2 ? "20" + m[3] : m[3]; return y + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0"); }
  var p = new Date(t); if (t && !isNaN(p)) return localDateStr(p);
  return fallbackYear ? (fallbackYear + "-" + String(monthIdx + 1).padStart(2, "0") + "-01") : "";
}
function matchAccountByLabel(label) {
  var l = String(label || "").toLowerCase().replace(/\s+/g, "");
  if (!l) return null;
  var best = null;
  state.accounts.forEach(function (a) {
    var full = ((a.name || "") + "-" + (a.owner || "")).toLowerCase().replace(/\s+/g, "");
    var rev = ((a.owner || "") + "-" + (a.name || "")).toLowerCase().replace(/\s+/g, "");
    if (l === full || l === rev || l === (a.name || "").toLowerCase().replace(/\s+/g, "")) best = best || a;
  });
  return best;
}
function openExcelImport() { document.getElementById("xl-import-input").click(); }
function handleExcelImport(input) {
  var f = input.files && input.files[0]; if (!f) return;
  var r = new FileReader();
  r.onload = function (ev) {
    try {
      var wb = XLSX.read(ev.target.result, { type: "array" });
      var MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
      var found = [], skippedAcc = 0;
      var cash = state.accounts.find(function (a) { return a.type === "cash"; }) || state.accounts[0];
      if (!cash) { showNotice("Add an account first, then import."); return; }
      MONTHS.forEach(function (mn, mi) {
        var ws = wb.Sheets[mn]; if (!ws) return;
        var head = ws["K2"] ? String(ws["K2"].v) : ""; var ym = head.match(/(\d{4})/); var year = ym ? ym[1] : String(new Date().getFullYear());
        var range = XLSX.utils.decode_range(ws["!ref"] || "A1:A1");
        for (var row = 10; row <= Math.min(range.e.r, 400); row++) {
          [["C","D","E","F","income"],["I","J","K","L","expense"]].forEach(function (c) {
            var amt = ws[c[3] + (row + 1)]; if (!amt || !(Number(amt.v) > 0)) return;
            var d = ws[c[0] + (row + 1)], src = ws[c[1] + (row + 1)], ac = ws[c[2] + (row + 1)];
            var acc = ac ? matchAccountByLabel(ac.v) : null;
            if (!acc) { acc = cash; skippedAcc++; }
            var note = src ? String(src.v).trim() : "";
            found.push({ id: uid(), type: c[4], accountId: acc.id, amount: Number(amt.v), note: note,
              category: suggestCategoryForNote(note, c[4]) || (c[4] === "income" ? incomeCats()[0] : "Other"),
              date: xlDate(d ? d.v : "", year, mi) });
          });
        }
      });
      if (!found.length) { showNotice("No income or expense rows with an amount were found in that file."); return; }
      showConfirmDialog("Found " + found.length + " entries in your Excel sheet." + (skippedAcc ? "\n" + skippedAcc + " had an unrecognised account and will go to " + accountDisplayName(cash) + "." : "") + "\n\nImport them?", function () {
        found.forEach(function (tx) { state.transactions.push(tx); applyEffect(tx); });
        saveData(); render(); showNotice("Imported " + found.length + " entries.");
      }, "Import");
    } catch (e) { showNotice("Couldn't read that Excel file: " + (e && e.message ? e.message : "unknown error")); }
  };
  r.readAsArrayBuffer(f); input.value = "";
}
