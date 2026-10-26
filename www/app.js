/* ============================== constants ============================== */
var INK = "var(--ink)", TEXT = "var(--text)", PARCHMENT = "var(--on-ink)", GOLD = "var(--gold)", FOREST = "var(--forest)", RUST = "var(--rust)", LINE = "var(--line)", SUBTEXT = "var(--subtext)", ACCENT_FAMILY = "var(--accent-family)";

var ACCOUNT_TYPES = {
  cash:        { label: "Cash",          color: GOLD,   icon: "\uD83D\uDCB5" },
  bank:        { label: "Bank",          color: INK,    icon: "\uD83C\uDFE6" },
  family:      { label: "Family Bank",   color: ACCENT_FAMILY, icon: "\uD83D\uDC6A" },
  credit_card: { label: "Credit Card",   color: RUST,   icon: "\uD83D\uDCB3" },
  mutual_fund: { label: "Mutual Fund",   color: FOREST, icon: "\uD83D\uDCC8" },
  stock:       { label: "Stocks",        color: RUST,   icon: "\uD83D\uDCCA" },
  other:       { label: "Other",         color: SUBTEXT, icon: "\u25CF" }
};
var DEFAULT_EXPENSE_CATEGORIES = ["Food","Transport","Bills","Shopping","Health","Entertainment","Family","Investment","Other"];
var DEFAULT_INCOME_CATEGORIES = ["Salary","Business","Interest/Dividend","Gift","Other"];
var FREQUENCIES = [{key:"weekly",label:"Weekly"},{key:"monthly",label:"Monthly"},{key:"yearly",label:"Yearly"}];
var PERIODS = [
  {key:"all",label:"All time"},{key:"today",label:"Today"},{key:"week",label:"This week"},
  {key:"month",label:"This month"},{key:"year",label:"This year"},{key:"custom",label:"Custom"}
];
var AUTO_LOCK_OPTIONS = [1, 5, 10, 15, 30, 60];
function expenseCats() { return (state.expenseCategories && state.expenseCategories.length) ? state.expenseCategories : DEFAULT_EXPENSE_CATEGORIES; }
function incomeCats() { return (state.incomeCategories && state.incomeCategories.length) ? state.incomeCategories : DEFAULT_INCOME_CATEGORIES; }

/* ============================== generic helpers ============================== */
function fmt(n) { n = Math.round(n || 0); return (n < 0 ? "\u2212" : "") + "\u20B9" + Math.abs(n).toLocaleString("en-IN"); }
function localDateStr(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, "0");
  var day = String(d.getDate()).padStart(2, "0");
  return y + "-" + m + "-" + day;
}
function todayStr() { return localDateStr(new Date()); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function(c){ return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
function jsAttr(s) {
  // Safe to embed as a single-quoted JS string literal inside an onclick="" HTML attribute.
  return esc(String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'"));
}
function accountDisplayName(a) {
  if (!a) return "Deleted account";
  return a.owner ? (a.owner + " \u2014 " + a.name) : a.name;
}

function addInterval(dateStr, frequency) {
  var d = new Date(dateStr + "T00:00:00");
  if (frequency === "weekly") d.setDate(d.getDate() + 7);
  else if (frequency === "yearly") d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return localDateStr(d);
}
function inPeriod(dateStr, period, customStart, customEnd) {
  if (!dateStr) return false;
  if (period === "all") return true;
  if (period === "today") return dateStr === todayStr();
  if (period === "week") {
    var d = new Date(dateStr + "T00:00:00");
    var now = new Date();
    var start = new Date(now);
    start.setDate(now.getDate() - now.getDay());
    start.setHours(0,0,0,0);
    return d >= start;
  }
  if (period === "month") return dateStr.slice(0,7) === todayStr().slice(0,7);
  if (period === "year") return dateStr.slice(0,4) === todayStr().slice(0,4);
  if (period === "custom") {
    if (customStart && dateStr < customStart) return false;
    if (customEnd && dateStr > customEnd) return false;
    return true;
  }
  return true;
}
function processRecurring(accounts, transactions, rules) {
  var accs = accounts.map(function(a){ return Object.assign({}, a); });
  var txs = transactions.slice();
  var newRules = rules.map(function(r){ return Object.assign({}, r); });
  var accMap = {};
  accs.forEach(function(a){ accMap[a.id] = a; });
  var today = todayStr();
  newRules.forEach(function(rule){
    if (!rule.active) return;
    var guard = 0;
    while (rule.nextDue <= today && guard < 365) {
      guard++;
      var acc = accMap[rule.accountId];
      if (!acc) break;
      txs.push({
        id: uid(), type: rule.type, accountId: rule.accountId, amount: rule.amount,
        category: rule.category, note: rule.note ? (rule.note + " (auto)") : "Recurring",
        date: rule.nextDue, recurringId: rule.id
      });
      acc.balance += rule.type === "income" ? rule.amount : -rule.amount;
      rule.nextDue = addInterval(rule.nextDue, rule.frequency);
    }
  });
  return { accounts: accs, transactions: txs, recurringRules: newRules };
}
async function downloadBlob(content, filename, mime) {
  try {
    if (window.__TAURI__ && window.__TAURI__.core) {
      var savedPath = await window.__TAURI__.core.invoke("save_file_dialog", { defaultName: filename, content: content });
      if (savedPath) showNotice("Saved:\n" + savedPath);
      return; // user cancelling the dialog (savedPath null) is a normal outcome, not an error
    }
  } catch (e) {
    console.error("native save failed, falling back to browser download", e);
  }
  try {
    var blob = new Blob([content], { type: mime });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (e2) {
    showNotice("Couldn't save the file.");
  }
}
function downloadCSV(rows, filename) {
  var csv = rows.map(function(row){
    return row.map(function(cell){ return '"' + String(cell == null ? "" : cell).replace(/"/g,'""') + '"'; }).join(",");
  }).join("\n");
  downloadBlob("\uFEFF" + csv, filename, "text/csv;charset=utf-8;");
}

/* ============================== crypto helpers (Web Crypto, fully offline) ============================== */
function bufToB64(buf) {
  var bytes = new Uint8Array(buf);
  var binary = "";
  for (var i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function b64ToBuf(b64) {
  var binary = atob(b64);
  var bytes = new Uint8Array(binary.length);
  for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function sha256Hex(str) {
  var buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(function(b){ return b.toString(16).padStart(2,"0"); }).join("");
}
async function deriveKey(secret, saltBytes) {
  var baseKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: saltBytes, iterations: 100000, hash: "SHA-256" },
    baseKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]
  );
}
async function encryptBytes(key, bytes) {
  var iv = crypto.getRandomValues(new Uint8Array(12));
  var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes);
  return { iv: bufToB64(iv), data: bufToB64(cipher) };
}
async function decryptBytes(key, ivB64, dataB64) {
  var iv = new Uint8Array(b64ToBuf(ivB64));
  var plainBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv }, key, b64ToBuf(dataB64));
  return new Uint8Array(plainBuf);
}
async function encryptJSON(key, obj) {
  return encryptBytes(key, new TextEncoder().encode(JSON.stringify(obj)));
}
async function decryptJSON(key, ivB64, dataB64) {
  var bytes = await decryptBytes(key, ivB64, dataB64);
  return JSON.parse(new TextDecoder().decode(bytes));
}
async function importDEK(dekBytes, usages) {
  return crypto.subtle.importKey("raw", dekBytes, "AES-GCM", false, usages);
}
function generateRecoveryKey() {
  var alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1 ambiguity
  var bytes = crypto.getRandomValues(new Uint8Array(20));
  var chars = [];
  for (var i = 0; i < 20; i++) chars.push(alphabet[bytes[i] % alphabet.length]);
  var groups = [];
  for (var j = 0; j < 20; j += 4) groups.push(chars.slice(j, j + 4).join(""));
  return groups.join("-");
}

/* ============================== storage / vault ============================== */
/* ============================== native file storage (Tauri, replaces localStorage) ============================== */
async function tauriReadVault() {
  return await window.__TAURI__.core.invoke("read_vault");
}
async function tauriWriteVault(obj) {
  await window.__TAURI__.core.invoke("write_vault", { content: JSON.stringify(obj) });
}
async function tauriVaultFilePath() {
  return await window.__TAURI__.core.invoke("vault_file_path");
}
async function tauriSetAutostart(enabled) {
  return await window.__TAURI__.core.invoke("set_autostart", { enabled: enabled });
}
async function tauriGetAutostart() {
  return await window.__TAURI__.core.invoke("get_autostart");
}
async function tauriShowNotification(title, body) {
  try { await window.__TAURI__.core.invoke("show_notification", { title: title, body: body }); }
  catch (e) { console.error("native notification failed", e); }
}
var autostartEnabledCache = false;
function maybeSendNativeReminder() {
  var today = todayStr();
  if (state.lastNativeReminderDate === today) return;
  var notifs = computeNotifications();
  if (notifs.length === 0) return;
  state.lastNativeReminderDate = today;
  saveData();
  var picked = notifs.find(function(x){ return x.id === "reminders"; })
    || notifs.find(function(x){ return x.id === "bills"; })
    || notifs.find(function(x){ return x.id === "backup"; })
    || notifs[0];
  tauriShowNotification("Paisa Diary", picked.text);
}
var currentEmail = "";              // optional, shown to confirm identity on restore
var currentPasswordSalt = null;     // base64
var currentWrappedDEKPassword = null; // {iv, data} -- DEK encrypted with password-derived key
var currentRecoverySalt = null;     // base64
var currentWrappedDEKRecovery = null; // {iv, data} -- DEK encrypted with recovery-key-derived key

var cryptoKey = null;
var isLocked = true;
var vaultExists = false;
var lockError = "";
var lockBusy = false;
var lockScreenMode = "unlock"; // "setup" | "recoveryDisplay" | "unlock" | "forgotEnterRecovery" | "forgotSetNewPassword"
var settingsMsg = "";
var settingsMsgIsError = false;
var lastDeleted = null;       // single-level undo buffer
var dialogState = null;       // custom confirm/notice dialogs (replaces window.confirm/alert)

var state = {
  accounts: [], transactions: [], recurringRules: [], email: "", lastBackupAt: null,
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES.slice(), incomeCategories: DEFAULT_INCOME_CATEGORIES.slice(),
  autoLockEnabled: false, autoLockMinutes: 10, budgets: {}, ownerBudgets: {}, loans: [], goals: [], reminders: [], lastNativeReminderDate: null,
  tab: "overview",
  accountModal: null, txModal: null, recurringModalOpen: false, settingsOpen: false, notifModalOpen: false, importModalOpen: false, printModalOpen: false,
  loanModalOpen: false, goalModalOpen: false, investmentModalOpen: null, bulkRecatModalOpen: false, excelModalOpen: false, reminderModalOpen: false,
  filterPeriod: "all", filterAccountId: "all", filterType: "all",
  customStart: todayStr(), customEnd: todayStr(), search: "",
  storageOk: true
};
var txForm = null, accForm = null, recForm = null, loanForm = null, goalForm = null;
var excelExportState = null;
var importState = null;       // bank CSV import wizard state
var printState = null;        // print-statement date range wizard state
var inactivityTimer = null;
var lastUsedAccountId = null; // for quick-add / quick-repeat defaults (session only)
var bulkMode = false;
var bulkSelected = {};        // transaction id -> true, session only
var dismissedRecurSuggestions = {}; // session-only dismiss tracking for "looks recurring" hints
var currentTheme = (function(){ try { return window.localStorage.getItem("ledgerTheme_v1") || "light"; } catch (e) { return "light"; } })();

function vaultPayload() {
  return {
    accounts: state.accounts, transactions: state.transactions, recurringRules: state.recurringRules,
    email: state.email, lastBackupAt: state.lastBackupAt,
    expenseCategories: state.expenseCategories, incomeCategories: state.incomeCategories,
    autoLockEnabled: state.autoLockEnabled, autoLockMinutes: state.autoLockMinutes,
    budgets: state.budgets, ownerBudgets: state.ownerBudgets, loans: state.loans, goals: state.goals,
    reminders: state.reminders, lastNativeReminderDate: state.lastNativeReminderDate
  };
}
var dataVersion = 0; // bumped on every save; used to cache expensive derived computations
function memoByVersion(fn) {
  var cacheKey = null, cacheValue = null;
  return function() {
    var key = dataVersion + "|" + Array.prototype.join.call(arguments, ",");
    if (key === cacheKey) return cacheValue;
    cacheValue = fn.apply(null, arguments);
    cacheKey = key;
    return cacheValue;
  };
}
async function saveData() {
  dataVersion++;
  if (!cryptoKey) return;
  currentEmail = state.email || "";
  try {
    var vault = await encryptJSON(cryptoKey, vaultPayload());
    await tauriWriteVault({
      email: currentEmail,
      passwordSalt: currentPasswordSalt, wrappedDEKPassword: currentWrappedDEKPassword,
      recoverySalt: currentRecoverySalt, wrappedDEKRecovery: currentWrappedDEKRecovery,
      vault: vault
    });
    state.storageOk = true;
  } catch (e) {
    state.storageOk = false;
    console.error("save failed", e);
  }
}

function loadStateFromPayload(payload) {
  var caught = processRecurring(payload.accounts || [], payload.transactions || [], payload.recurringRules || []);
  state.accounts = caught.accounts;
  state.transactions = caught.transactions;
  state.recurringRules = caught.recurringRules;
  state.email = payload.email || "";
  state.lastBackupAt = payload.lastBackupAt || null;
  state.expenseCategories = (payload.expenseCategories && payload.expenseCategories.length) ? payload.expenseCategories : DEFAULT_EXPENSE_CATEGORIES.slice();
  state.incomeCategories = (payload.incomeCategories && payload.incomeCategories.length) ? payload.incomeCategories : DEFAULT_INCOME_CATEGORIES.slice();
  state.autoLockEnabled = !!payload.autoLockEnabled;
  state.autoLockMinutes = payload.autoLockMinutes || 10;
  state.budgets = payload.budgets || {};
  state.ownerBudgets = payload.ownerBudgets || {};
  state.loans = payload.loans || [];
  state.goals = payload.goals || [];
  state.reminders = payload.reminders || [];
  state.lastNativeReminderDate = payload.lastNativeReminderDate || null;
}

/* ---- first-time setup ---- */
var setupForm = { email: "", password: "", confirm: "" };
var pendingDEK = null;          // raw bytes, generated during setup, held until recovery key is confirmed saved
var pendingRecoveryKey = "";
var recoverySavedChecked = false;

function submitSetup() {
  var email = document.getElementById("setup-email").value.trim();
  var password = document.getElementById("setup-password").value;
  var confirm = document.getElementById("setup-confirm").value;
  lockError = "";
  if (!password || password.length < 6) { lockError = "Choose a password with at least 6 characters."; render(); return; }
  if (password !== confirm) { lockError = "Passwords don't match."; render(); return; }
  setupForm = { email: email, password: password, confirm: confirm };
  lockScreenMode = "recoveryDisplay";
  pendingRecoveryKey = generateRecoveryKey();
  render();
}
function downloadRecoveryKey() {
  downloadBlob(
    "Paisa Diary \u2014 Recovery Key\n\nKeep this somewhere safe (a password manager, a printed copy). " +
    "If you ever forget your password, this key is the only way back into your data.\n\n" + pendingRecoveryKey + "\n",
    "your-ledger-recovery-key.txt", "text/plain"
  );
}
async function copyRecoveryKey() {
  var btn = document.getElementById("copy-recovery-btn");
  try {
    await navigator.clipboard.writeText(pendingRecoveryKey);
    if (btn) {
      btn.textContent = "\u2713 Copied";
      setTimeout(function(){ if (btn) btn.textContent = "\uD83D\uDCCB Copy"; }, 2000);
    }
  } catch (e) {
    showNotice("Couldn't copy automatically \u2014 select the key above and copy it manually instead.");
  }
}
function toggleRecoverySaved() {
  recoverySavedChecked = !recoverySavedChecked;
  render();
}
async function confirmRecoverySavedAndContinue() {
  if (!recoverySavedChecked) return;
  lockBusy = true; render();
  try {
    var dek = crypto.getRandomValues(new Uint8Array(32));

    var passwordSalt = crypto.getRandomValues(new Uint8Array(16));
    var passKey = await deriveKey(setupForm.password, passwordSalt);
    var wrappedDEKPassword = await encryptBytes(passKey, dek);

    var recoverySalt = crypto.getRandomValues(new Uint8Array(16));
    var recKey = await deriveKey(pendingRecoveryKey, recoverySalt);
    var wrappedDEKRecovery = await encryptBytes(recKey, dek);

    currentEmail = setupForm.email;
    currentPasswordSalt = bufToB64(passwordSalt);
    currentWrappedDEKPassword = wrappedDEKPassword;
    currentRecoverySalt = bufToB64(recoverySalt);
    currentWrappedDEKRecovery = wrappedDEKRecovery;

    cryptoKey = await importDEK(dek, ["encrypt", "decrypt"]);

    state.accounts = starterAccounts(); state.transactions = []; state.recurringRules = []; state.email = setupForm.email; state.lastBackupAt = null;
    state.expenseCategories = DEFAULT_EXPENSE_CATEGORIES.slice(); state.incomeCategories = DEFAULT_INCOME_CATEGORIES.slice();
    state.autoLockEnabled = false; state.autoLockMinutes = 10; state.budgets = {}; state.ownerBudgets = {}; state.loans = []; state.goals = [];
    state.reminders = []; state.lastNativeReminderDate = null;

    await saveData();

    vaultExists = true; isLocked = false; lockBusy = false;
    pendingDEK = null; setupForm = { email: "", password: "", confirm: "" };
    lockScreenMode = "unlock";
    render(); resetInactivityTimer();
  } catch (e) {
    lockBusy = false;
    lockError = "Something went wrong setting up your ledger. Please try again.";
    console.error(e);
    render();
  }
}

/* ---- normal unlock ---- */
async function submitUnlock() {
  var pwEl = document.getElementById("lock-password");
  var password = pwEl ? pwEl.value : "";
  lockError = "";
  if (!password) { lockError = "Enter your password."; render(); return; }
  lockBusy = true; render();
  try {
    var saltBytes = new Uint8Array(b64ToBuf(currentPasswordSalt));
    var passKey = await deriveKey(password, saltBytes);
    var dekBytes = await decryptBytes(passKey, currentWrappedDEKPassword.iv, currentWrappedDEKPassword.data);
    var dataKey = await importDEK(dekBytes, ["encrypt", "decrypt"]);

    var fileRaw = await tauriReadVault();
    var fileObj = JSON.parse(fileRaw);
    var payload = await decryptJSON(dataKey, fileObj.vault.iv, fileObj.vault.data);
    loadStateFromPayload(payload);

    cryptoKey = dataKey; isLocked = false; lockBusy = false; render();
    resetInactivityTimer();
    saveData();
    maybeSendNativeReminder();
  } catch (e) {
    lockBusy = false;
    lockError = "Incorrect password.";
    render();
  }
}

/* ---- forgot password via recovery key ---- */
var forgotRecoveryInput = "";
var forgotVerifiedDEK = null; // raw bytes, held only during the reset step

function showForgotPassword() {
  lockError = "";
  lockScreenMode = "forgotEnterRecovery";
  render();
}
function backToPasswordScreen() {
  lockError = ""; forgotVerifiedDEK = null;
  lockScreenMode = "unlock";
  render();
}
async function submitRecoveryVerify() {
  var el = document.getElementById("recovery-key-input");
  var input = el ? el.value.trim().toUpperCase() : "";
  lockError = "";
  if (!input) { lockError = "Enter your recovery key."; render(); return; }
  lockBusy = true; render();
  try {
    var saltBytes = new Uint8Array(b64ToBuf(currentRecoverySalt));
    var recKey = await deriveKey(input, saltBytes);
    var dekBytes = await decryptBytes(recKey, currentWrappedDEKRecovery.iv, currentWrappedDEKRecovery.data);
    forgotVerifiedDEK = dekBytes;
    lockBusy = false;
    lockScreenMode = "forgotSetNewPassword";
    render();
  } catch (e) {
    lockBusy = false;
    lockError = "That recovery key doesn't match.";
    render();
  }
}
async function submitForgotNewPassword() {
  var newPw = document.getElementById("forgot-new-password").value;
  var confirmPw = document.getElementById("forgot-confirm-password").value;
  lockError = "";
  if (!newPw || newPw.length < 6) { lockError = "Choose a password with at least 6 characters."; render(); return; }
  if (newPw !== confirmPw) { lockError = "Passwords don't match."; render(); return; }
  lockBusy = true; render();
  try {
    var dataKey = await importDEK(forgotVerifiedDEK, ["decrypt"]);
    var fileRaw = await tauriReadVault();
    var fileObj = JSON.parse(fileRaw);
    var payload = await decryptJSON(dataKey, fileObj.vault.iv, fileObj.vault.data);
    loadStateFromPayload(payload);

    var newPasswordSalt = crypto.getRandomValues(new Uint8Array(16));
    var newPassKey = await deriveKey(newPw, newPasswordSalt);
    var newWrappedDEKPassword = await encryptBytes(newPassKey, forgotVerifiedDEK);
    currentPasswordSalt = bufToB64(newPasswordSalt);
    currentWrappedDEKPassword = newWrappedDEKPassword;

    cryptoKey = await importDEK(forgotVerifiedDEK, ["encrypt", "decrypt"]);
    forgotVerifiedDEK = null;

    await saveData();
    isLocked = false; lockBusy = false; lockScreenMode = "unlock";
    render(); resetInactivityTimer();
    maybeSendNativeReminder();
  } catch (e) {
    lockBusy = false;
    lockError = "Something went wrong resetting your password. Please try again.";
    console.error(e);
    render();
  }
}

function lockVault() {
  cryptoKey = null; isLocked = true;
  state.accounts = []; state.transactions = []; state.recurringRules = [];
  state.tab = "overview";
  state.accountModal = null; state.txModal = null; state.recurringModalOpen = false; state.settingsOpen = false; state.notifModalOpen = false; state.importModalOpen = false;
  lockError = ""; settingsMsg = ""; lastDeleted = null; dialogState = null;
  lockScreenMode = "unlock"; forgotVerifiedDEK = null;
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
  render();
}

/* ============================== custom dialogs (replace window.confirm/alert) ============================== */
function showConfirmDialog(message, onConfirmFn, confirmLabel) {
  dialogState = { mode: "confirm", message: message, onConfirmFn: onConfirmFn, confirmLabel: confirmLabel || "Delete" };
  render();
}
function showPromptDialog(message, defaultValue, onConfirmFn, confirmLabel, inputType) {
  dialogState = { mode: "prompt", message: message, defaultValue: defaultValue, onConfirmFn: onConfirmFn, confirmLabel: confirmLabel || "Save", inputType: inputType || "text" };
  render();
}
function showNotice(message, onCloseFn) {
  dialogState = { mode: "notice", message: message, onCloseFn: onCloseFn || null };
  render();
}
function dialogCancel() { dialogState = null; render(); }
function dialogPrimary() {
  var d = dialogState;
  var promptValue = null;
  if (d && d.mode === "prompt") {
    var el = document.getElementById("dialog-prompt-input");
    promptValue = el ? el.value : "";
  }
  dialogState = null;
  render();
  var result;
  if (d && d.onConfirmFn) result = d.onConfirmFn(promptValue);
  if (d && d.onCloseFn) d.onCloseFn();
  return result;
}

/* ============================== theme ============================== */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", currentTheme);
}
function toggleTheme() {
  currentTheme = currentTheme === "dark" ? "light" : "dark";
  try { window.localStorage.setItem("ledgerTheme_v1", currentTheme); } catch (e) {}
  applyTheme();
  render();
}

/* ============================== auto-lock on inactivity ============================== */
function resetInactivityTimer() {
  if (inactivityTimer) { clearTimeout(inactivityTimer); inactivityTimer = null; }
  if (isLocked || !state.autoLockEnabled) return;
  inactivityTimer = setTimeout(function(){ lockVault(); }, state.autoLockMinutes * 60000);
}
function setupActivityListeners() {
  ["mousemove", "keydown", "mousedown", "touchstart", "scroll"].forEach(function(evt){
    document.addEventListener(evt, resetInactivityTimer, { passive: true });
  });
  document.addEventListener("keydown", function(e){
    if (e.key !== "Escape") return;
    if (dialogState) { dialogCancel(); return; }
    if (state.bulkRecatModalOpen) { closeBulkRecatModal(); return; }
    if (state.excelModalOpen) { closeExcelExportModal(); return; }
    if (state.importModalOpen) { closeImportModal(); return; }
    if (state.printModalOpen) { closePrintModal(); return; }
    if (state.investmentModalOpen) { closeInvestmentModal(); return; }
    if (state.loanModalOpen) { closeLoanModal(); return; }
    if (state.goalModalOpen) { closeGoalModal(); return; }
    if (state.recurringModalOpen) { closeRecurringModal(); return; }
    if (state.accountModal) { closeAccountModal(); return; }
    if (state.txModal) { closeTransactionModal(); return; }
    if (state.notifModalOpen) { closeNotifications(); return; }
    if (state.settingsOpen) { closeSettings(); return; }
    if (isLocked && lockScreenMode === "forgotEnterRecovery") { backToPasswordScreen(); return; }
  });
}
function submitAutoLockSettings() {
  var enabled = document.getElementById("f-autolock-enabled").checked;
  var minutes = Number(document.getElementById("f-autolock-minutes").value);
  state.autoLockEnabled = enabled;
  state.autoLockMinutes = minutes || 10;
  saveData();
  resetInactivityTimer();
  settingsMsg = enabled ? ("Auto-lock on \u2014 locks after " + state.autoLockMinutes + " minutes idle.") : "Auto-lock off.";
  settingsMsgIsError = false;
  render();
}

/* ============================== derived data ============================== */
function accountsById() {
  var m = {};
  state.accounts.forEach(function(a){ m[a.id] = a; });
  return m;
}
function netWorth() { return state.accounts.reduce(function(s,a){ return s + a.balance; }, 0); }
function byType() {
  var m = {};
  state.accounts.forEach(function(a){ m[a.type] = (m[a.type]||0) + a.balance; });
  return m;
}
function monthStats() {
  var ym = todayStr().slice(0,7);
  var income = 0, expense = 0;
  state.transactions.forEach(function(t){
    if (!t.date || t.date.slice(0,7) !== ym) return;
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expense += t.amount;
  });
  return { income: income, expense: expense, net: income - expense };
}
function momComparison() {
  var now = new Date();
  var thisYm = todayStr().slice(0,7);
  var lastYm = localDateStr(new Date(now.getFullYear(), now.getMonth()-1, 1)).slice(0,7);
  var thisExpense = 0, lastExpense = 0;
  state.transactions.forEach(function(t){
    if (t.type !== "expense") return;
    if (t.date && t.date.slice(0,7) === thisYm) thisExpense += t.amount;
    if (t.date && t.date.slice(0,7) === lastYm) lastExpense += t.amount;
  });
  var change = lastExpense > 0 ? ((thisExpense - lastExpense) / lastExpense) * 100 : null;
  return { thisExpense: thisExpense, lastExpense: lastExpense, change: change };
}
function categoryBreakdown() {
  var ym = todayStr().slice(0,7);
  var map = {};
  state.transactions.forEach(function(t){
    if (t.type !== "expense" || !t.date || t.date.slice(0,7) !== ym) return;
    map[t.category] = (map[t.category]||0) + t.amount;
  });
  var arr = Object.keys(map).map(function(k){ return { category: k, value: map[k] }; });
  arr.sort(function(a,b){ return b.value - a.value; });
  return arr;
}
function recentTransactions(n) {
  return state.transactions.slice().sort(function(a,b){ return a.date < b.date ? 1 : -1; }).slice(0, n);
}
function monthlyTrend(monthsBack) {
  var months = [];
  var now = new Date();
  for (var i = monthsBack - 1; i >= 0; i--) {
    var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    var ym = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
    var label = d.toLocaleDateString("en-IN", { month: "short" });
    months.push({ ym: ym, label: label, income: 0, expense: 0 });
  }
  var byYm = {};
  months.forEach(function(m){ byYm[m.ym] = m; });
  state.transactions.forEach(function(t){
    if (t.type !== "income" && t.type !== "expense") return;
    var ym = t.date ? t.date.slice(0,7) : "";
    var bucket = byYm[ym];
    if (!bucket) return;
    bucket[t.type] += t.amount;
  });
  return months;
}
function ownerBreakdown() {
  var ym = todayStr().slice(0,7);
  var accs = accountsById();
  var owners = {};
  var distinctOwners = 0;
  state.accounts.forEach(function(a){ if (a.owner) distinctOwners++; });
  if (distinctOwners < 1) return [];
  state.transactions.forEach(function(t){
    if (t.type !== "expense" || !t.date || t.date.slice(0,7) !== ym) return;
    var acc = accs[t.accountId];
    var owner = (acc && acc.owner) ? acc.owner : "Unassigned";
    owners[owner] = (owners[owner] || 0) + t.amount;
  });
  var arr = Object.keys(owners).map(function(k){ return { owner: k, value: owners[k] }; });
  if (arr.length < 2) return [];
  arr.sort(function(a,b){ return b.value - a.value; });
  return arr;
}
function upcomingBills(daysAhead) {
  var today = todayStr();
  var until = new Date();
  until.setDate(until.getDate() + daysAhead);
  var untilStr = localDateStr(until);
  return state.recurringRules
    .filter(function(r){ return r.active && r.nextDue >= today && r.nextDue <= untilStr; })
    .sort(function(a,b){ return a.nextDue < b.nextDue ? -1 : 1; });
}

/* ============================== smart: duplicate + anomaly detection ============================== */
function findPossibleDuplicate(newTx) {
  return state.transactions.find(function(t){
    if (t.type !== newTx.type || t.date !== newTx.date || t.amount !== newTx.amount) return false;
    if (newTx.type === "transfer") return t.fromAccountId === newTx.fromAccountId && t.toAccountId === newTx.toAccountId;
    return t.accountId === newTx.accountId;
  });
}
function categoryAverage(category, type) {
  var amounts = state.transactions.filter(function(t){ return t.type === type && t.category === category; }).map(function(t){ return t.amount; });
  if (amounts.length < 3) return null;
  var sum = amounts.reduce(function(a,b){ return a + b; }, 0);
  return { avg: sum / amounts.length, count: amounts.length };
}
function isAnomalous(newTx) {
  if (newTx.type !== "expense") return null;
  var stats = categoryAverage(newTx.category, newTx.type);
  if (!stats) return null;
  if (newTx.amount >= stats.avg * 2 && (newTx.amount - stats.avg) >= 200) return stats;
  return null;
}
function proceedWithNewTransaction(tx, onDone) {
  var dup = findPossibleDuplicate(tx);
  if (dup) {
    var accs = accountsById();
    showConfirmDialog(
      "You already logged " + fmt(tx.amount) + " on " + tx.date + (tx.type !== "transfer" ? (" for " + accountDisplayName(accs[tx.accountId])) : "") + ".\n\nAdd this one too?",
      function(){ addTransaction(tx); if (onDone) onDone(); },
      "Add anyway"
    );
    return;
  }
  var anomaly = isAnomalous(tx);
  if (anomaly) {
    showConfirmDialog(
      "This " + tx.category + " expense of " + fmt(tx.amount) + " is well above your usual average of " + fmt(Math.round(anomaly.avg)) + " for that category.\n\nSave it anyway?",
      function(){ addTransaction(tx); if (onDone) onDone(); },
      "Save anyway"
    );
    return;
  }
  addTransaction(tx);
  if (onDone) onDone();
}

/* ============================== smart: "looks recurring" detector ============================== */
function daysBetween(d1, d2) {
  var a = new Date(d1 + "T00:00:00"), b = new Date(d2 + "T00:00:00");
  return Math.round((b - a) / 86400000);
}
function detectRecurringCandidates() {
  var groups = {};
  state.transactions.forEach(function(t){
    if (t.type === "transfer") return;
    var key = t.accountId + "|" + t.type + "|" + t.amount;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  var candidates = [];
  Object.keys(groups).forEach(function(key){
    var list = groups[key].slice().sort(function(a,b){ return a.date < b.date ? -1 : 1; });
    if (list.length < 3) return;
    var last3 = list.slice(-3);
    var gap1 = daysBetween(last3[0].date, last3[1].date);
    var gap2 = daysBetween(last3[1].date, last3[2].date);
    if (gap1 >= 25 && gap1 <= 35 && gap2 >= 25 && gap2 <= 35) {
      var already = state.recurringRules.some(function(r){
        return r.active && r.accountId === last3[0].accountId && r.type === last3[0].type && r.amount === last3[0].amount;
      });
      if (!already) {
        candidates.push({
          key: key, accountId: last3[0].accountId, type: last3[0].type, amount: last3[0].amount,
          category: last3[2].category, note: last3[2].note, lastDate: last3[2].date, count: list.length
        });
      }
    }
  });
  return candidates.filter(function(c){ return !dismissedRecurSuggestions[c.key]; });
}
function dismissRecurSuggestion(key) { dismissedRecurSuggestions[key] = true; dataVersion++; render(); }
function openRecurringFromSuggestion() {
  var candidates = detectRecurringCandidates();
  if (candidates.length === 0) return;
  var c = candidates[0];
  recForm = {
    type: c.type, accountId: c.accountId, amount: String(c.amount),
    category: c.category || (c.type === "income" ? incomeCats()[0] : expenseCats()[0]),
    frequency: "monthly", startDate: addInterval(c.lastDate, "monthly"), note: c.note || ""
  };
  state.recurringModalOpen = true;
  state.notifModalOpen = false;
  render();
}

/* ============================== charts: shared line chart + net worth history ============================== */
function svgLineChart(points, color, height) {
  height = height || 110;
  if (!points || points.length < 2) return '<div class="note-small">Not enough history yet.</div>';
  var values = points.map(function(p){ return p.value; });
  var min = Math.min.apply(null, values), max = Math.max.apply(null, values);
  var range = max - min || 1;
  var w = 600, pad = 8;
  var stepX = (w - pad * 2) / (points.length - 1);
  var coords = points.map(function(p, i){
    var x = pad + i * stepX;
    var y = pad + (height - pad * 2) * (1 - (p.value - min) / range);
    return x.toFixed(1) + "," + y.toFixed(1);
  }).join(" ");
  return '<svg viewBox="0 0 ' + w + ' ' + height + '" style="width:100%;height:' + height + 'px;display:block;"><polyline points="' + coords + '" fill="none" style="stroke:' + color + ';stroke-width:2;"/></svg>' +
    '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--subtext);margin-top:4px;"><span>' + esc(points[0].date) + '</span><span style="font-weight:700;color:var(--text);">' + fmt(values[values.length - 1]) + '</span><span>' + esc(points[points.length - 1].date) + '</span></div>';
}
function netWorthHistory(days) {
  var sorted = state.transactions.slice().sort(function(a,b){ return a.date < b.date ? 1 : -1; }); // descending
  var points = [];
  var runningNet = netWorth();
  var idx = 0;
  var todayD = new Date();
  for (var i = 0; i < days; i++) {
    var d = new Date(todayD); d.setDate(todayD.getDate() - i);
    var ds = localDateStr(d);
    while (idx < sorted.length && sorted[idx].date > ds) {
      var t = sorted[idx];
      if (t.type === "income") runningNet -= t.amount;
      else if (t.type === "expense") runningNet += t.amount;
      idx++;
    }
    points.unshift({ date: ds, value: runningNet });
  }
  return points;
}
function netWorthChartHtml() {
  var points = netWorthHistory(90);
  if (points.length < 2 || points[0].value === points[points.length-1].value && state.transactions.length === 0) return "";
  return '<div class="section-label">Net worth over time <span style="text-transform:none;font-weight:400;">(estimated from transaction history)</span></div>' +
    '<div style="background:var(--parchment);border:1px solid var(--line);border-radius:10px;padding:12px;margin-bottom:18px;">' + svgLineChart(points, GOLD, 110) + '</div>';
}
function openInvestmentHistory(accId) {
  var acc = accountsById()[accId];
  if (!acc || !acc.valueHistory || acc.valueHistory.length < 2) {
    showNotice("Not enough history yet \u2014 update this account\u2019s value a few times (on different days) to see a growth chart.");
    return;
  }
  state.investmentModalOpen = accId;
  render();
}
function closeInvestmentModal() { state.investmentModalOpen = null; render(); }

/* ============================== loans & EMI ============================== */
function calcEMI(principal, annualRate, tenureMonths) {
  var r = annualRate / 12 / 100;
  if (!tenureMonths || tenureMonths <= 0) return 0;
  if (r === 0) return principal / tenureMonths;
  return principal * r * Math.pow(1 + r, tenureMonths) / (Math.pow(1 + r, tenureMonths) - 1);
}
function monthsBetweenDates(d1, d2) {
  var a = new Date(d1 + "T00:00:00"), b = new Date(d2 + "T00:00:00");
  var months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) months--;
  return Math.max(0, months);
}
function loanStatus(loan) {
  var r = loan.annualRate / 12 / 100;
  var elapsed = Math.min(loan.tenureMonths, monthsBetweenDates(loan.startDate, todayStr()));
  var balance = loan.principal;
  var totalInterest = 0, totalPrincipal = 0;
  for (var i = 0; i < elapsed; i++) {
    var interest = balance * r;
    var principalPaid = loan.emiAmount - interest;
    if (principalPaid > balance) principalPaid = balance;
    if (principalPaid < 0) principalPaid = 0;
    balance -= principalPaid;
    totalInterest += interest;
    totalPrincipal += principalPaid;
    if (balance <= 0.5) { balance = 0; break; }
  }
  return {
    remainingBalance: balance, monthsElapsed: elapsed, monthsRemaining: Math.max(0, loan.tenureMonths - elapsed),
    totalInterestPaid: totalInterest, totalPrincipalPaid: totalPrincipal,
    percentPaid: loan.principal > 0 ? ((loan.principal - balance) / loan.principal) * 100 : 0
  };
}
function openLoanModal(id) {
  var existing = id ? state.loans.find(function(l){ return l.id === id; }) : null;
  loanForm = existing
    ? { id: existing.id, name: existing.name, principal: String(existing.principal), annualRate: String(existing.annualRate), tenureMonths: String(existing.tenureMonths), startDate: existing.startDate, emiAmount: String(existing.emiAmount) }
    : { id: null, name: "", principal: "", annualRate: "", tenureMonths: "", startDate: todayStr(), emiAmount: "" };
  state.loanModalOpen = true;
  render();
}
function closeLoanModal() { state.loanModalOpen = false; loanForm = null; render(); }
function recalcLoanEMI() {
  var p = Number(document.getElementById("f-loan-principal").value);
  var r = Number(document.getElementById("f-loan-rate").value);
  var n = Number(document.getElementById("f-loan-tenure").value);
  if (p > 0 && n > 0) {
    var emi = calcEMI(p, r, n);
    var emiEl = document.getElementById("f-loan-emi");
    if (emiEl) emiEl.value = Math.round(emi);
  }
}
function submitLoanModal() {
  var name = document.getElementById("f-loan-name").value.trim();
  var principal = Number(document.getElementById("f-loan-principal").value);
  var annualRate = Number(document.getElementById("f-loan-rate").value);
  var tenureMonths = Number(document.getElementById("f-loan-tenure").value);
  var startDate = document.getElementById("f-loan-start").value || todayStr();
  var emiAmount = Number(document.getElementById("f-loan-emi").value) || calcEMI(principal, annualRate, tenureMonths);
  if (!name || !principal || !tenureMonths) return;
  var loan = { id: loanForm.id || uid(), name: name, principal: principal, annualRate: annualRate, tenureMonths: tenureMonths, startDate: startDate, emiAmount: emiAmount };
  var idx = state.loans.findIndex(function(l){ return l.id === loan.id; });
  if (idx >= 0) state.loans[idx] = loan; else state.loans.push(loan);
  saveData(); render();
  closeLoanModal();
}
function deleteLoan(id) {
  showConfirmDialog("Delete this loan? This only removes the tracker \u2014 it doesn't affect any accounts or transactions.", function(){
    state.loans = state.loans.filter(function(l){ return l.id !== id; });
    saveData(); render();
  }, "Delete loan");
}

/* ============================== savings goals ============================== */
function goalProgress(goal) {
  var acc = accountsById()[goal.accountId];
  var current = acc ? acc.balance : 0;
  var saved = Math.max(0, current - goal.baselineBalance);
  var pct = goal.targetAmount > 0 ? Math.min(100, (saved / goal.targetAmount) * 100) : 0;
  var daysLeft = goal.targetDate ? daysBetween(todayStr(), goal.targetDate) : null;
  return { saved: saved, pct: pct, daysLeft: daysLeft };
}
function openGoalModal(id) {
  var existing = id ? state.goals.find(function(g){ return g.id === id; }) : null;
  goalForm = existing
    ? { id: existing.id, name: existing.name, targetAmount: String(existing.targetAmount), targetDate: existing.targetDate || "", accountId: existing.accountId, baselineBalance: existing.baselineBalance }
    : { id: null, name: "", targetAmount: "", targetDate: "", accountId: state.accounts[0] ? state.accounts[0].id : "", baselineBalance: null };
  state.goalModalOpen = true;
  render();
}
function closeGoalModal() { state.goalModalOpen = false; goalForm = null; render(); }
function submitGoalModal() {
  var name = document.getElementById("f-goal-name").value.trim();
  var targetAmount = Number(document.getElementById("f-goal-amount").value);
  var targetDate = document.getElementById("f-goal-date").value || "";
  var accountId = document.getElementById("f-goal-account").value;
  if (!name || !targetAmount || !accountId) return;
  var baseline = goalForm.id ? goalForm.baselineBalance : (accountsById()[accountId] ? accountsById()[accountId].balance : 0);
  var goal = { id: goalForm.id || uid(), name: name, targetAmount: targetAmount, targetDate: targetDate, accountId: accountId, baselineBalance: baseline };
  var idx = state.goals.findIndex(function(g){ return g.id === goal.id; });
  if (idx >= 0) state.goals[idx] = goal; else state.goals.push(goal);
  saveData(); render();
  closeGoalModal();
}
function deleteGoal(id) {
  showConfirmDialog("Delete this savings goal? The money stays in its account \u2014 this only removes the tracker.", function(){
    state.goals = state.goals.filter(function(g){ return g.id !== id; });
    saveData(); render();
  }, "Delete goal");
}

/* ============================== payment reminders ============================== */
function upcomingReminders(daysAhead) {
  var until = new Date();
  until.setDate(until.getDate() + daysAhead);
  var untilStr = localDateStr(until);
  return (state.reminders || [])
    .filter(function(r){ return r.dueDate <= untilStr; }) // includes overdue (no lower bound) and due within the window
    .sort(function(a,b){ return a.dueDate < b.dueDate ? -1 : 1; });
}
var reminderForm = null;
function openReminderModal(id) {
  var existing = id ? state.reminders.find(function(r){ return r.id === id; }) : null;
  reminderForm = existing
    ? { id: existing.id, name: existing.name, category: existing.category, dueDate: existing.dueDate, repeat: existing.repeat }
    : { id: null, name: "", category: expenseCats()[0], dueDate: todayStr(), repeat: "monthly" };
  state.reminderModalOpen = true;
  render();
}
function closeReminderModal() { state.reminderModalOpen = false; reminderForm = null; render(); }
function submitReminderModal() {
  var name = document.getElementById("f-reminder-name").value.trim();
  var category = document.getElementById("f-reminder-category").value;
  var dueDate = document.getElementById("f-reminder-date").value || todayStr();
  var repeat = document.getElementById("f-reminder-repeat").value;
  if (!name) return;
  var reminder = { id: reminderForm.id || uid(), name: name, category: category, dueDate: dueDate, repeat: repeat };
  var idx = state.reminders.findIndex(function(r){ return r.id === reminder.id; });
  if (idx >= 0) state.reminders[idx] = reminder; else state.reminders.push(reminder);
  saveData(); render();
  closeReminderModal();
}
function deleteReminder(id) {
  showConfirmDialog("Delete this reminder?", function(){
    state.reminders = state.reminders.filter(function(r){ return r.id !== id; });
    saveData(); render();
  }, "Delete reminder");
}
function markReminderPaid(id) {
  var r = state.reminders.find(function(x){ return x.id === id; });
  if (!r) return;
  if (r.repeat === "none") {
    state.reminders = state.reminders.filter(function(x){ return x.id !== id; });
  } else {
    r.dueDate = addInterval(r.dueDate, r.repeat);
  }
  saveData(); render();
}
function quickLogReminderTransaction(id) {
  var r = state.reminders.find(function(x){ return x.id === id; });
  if (!r || state.accounts.length === 0) return;
  openTransactionModal("expense");
  txForm.category = r.category;
  txForm.note = r.name;
  render();
}

/* ============================== smart: spend projection ============================== */
function monthProjection() {
  var now = new Date();
  var dayOfMonth = now.getDate();
  var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  if (dayOfMonth < 2) return null;
  var ms = monthStats();
  return { projected: (ms.expense / dayOfMonth) * daysInMonth, daysElapsed: dayOfMonth, daysInMonth: daysInMonth };
}

/* ============================== smart: budgets ============================== */
function suggestedBudget(category) {
  var now = new Date();
  var cutoffs = [];
  for (var i = 1; i <= 3; i++) cutoffs.push(localDateStr(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0,7));
  var sums = {};
  cutoffs.forEach(function(c){ sums[c] = 0; });
  state.transactions.forEach(function(t){
    if (t.type !== "expense" || t.category !== category) return;
    var ym = t.date ? t.date.slice(0,7) : "";
    if (sums.hasOwnProperty(ym)) sums[ym] += t.amount;
  });
  var vals = cutoffs.map(function(c){ return sums[c]; }).filter(function(v){ return v > 0; });
  if (vals.length === 0) return 0;
  var avg = vals.reduce(function(a,b){ return a + b; }, 0) / vals.length;
  return Math.round(avg / 50) * 50;
}
function budgetStatusList() {
  var ym = todayStr().slice(0,7);
  var spent = {};
  state.transactions.forEach(function(t){
    if (t.type !== "expense" || !t.date || t.date.slice(0,7) !== ym) return;
    spent[t.category] = (spent[t.category] || 0) + t.amount;
  });
  var list = [];
  Object.keys(state.budgets || {}).forEach(function(cat){
    var budget = state.budgets[cat];
    if (!budget) return;
    list.push({ category: cat, budget: budget, spent: spent[cat] || 0 });
  });
  list.sort(function(a,b){ return (b.spent / b.budget) - (a.spent / a.budget); });
  return list;
}
function submitBudgets() {
  var inputs = document.querySelectorAll(".budget-input");
  var budgets = {};
  for (var i = 0; i < inputs.length; i++) {
    var cat = inputs[i].getAttribute("data-cat");
    var val = Number(inputs[i].value);
    if (val > 0) budgets[cat] = val;
  }
  state.budgets = budgets;
  saveData();
  settingsMsg = "Budgets saved."; settingsMsgIsError = false;
  render();
}
function distinctOwners() {
  var seen = {}, list = [];
  state.accounts.forEach(function(a){ if (a.owner && !seen[a.owner]) { seen[a.owner] = true; list.push(a.owner); } });
  return list;
}
function ownerSuggestedBudget(owner) {
  var now = new Date();
  var cutoffs = [];
  for (var i = 1; i <= 3; i++) cutoffs.push(localDateStr(new Date(now.getFullYear(), now.getMonth() - i, 1)).slice(0,7));
  var sums = {};
  cutoffs.forEach(function(c){ sums[c] = 0; });
  var accs = accountsById();
  state.transactions.forEach(function(t){
    if (t.type !== "expense") return;
    var acc = accs[t.accountId];
    var o = (acc && acc.owner) ? acc.owner : "Unassigned";
    if (o !== owner) return;
    var ym = t.date ? t.date.slice(0,7) : "";
    if (sums.hasOwnProperty(ym)) sums[ym] += t.amount;
  });
  var vals = cutoffs.map(function(c){ return sums[c]; }).filter(function(v){ return v > 0; });
  if (vals.length === 0) return 0;
  var avg = vals.reduce(function(a,b){ return a + b; }, 0) / vals.length;
  return Math.round(avg / 50) * 50;
}
function ownerBudgetStatusList() {
  var ym = todayStr().slice(0,7);
  var accs = accountsById();
  var spent = {};
  state.transactions.forEach(function(t){
    if (t.type !== "expense" || !t.date || t.date.slice(0,7) !== ym) return;
    var acc = accs[t.accountId];
    var owner = (acc && acc.owner) ? acc.owner : "Unassigned";
    spent[owner] = (spent[owner] || 0) + t.amount;
  });
  var list = [];
  Object.keys(state.ownerBudgets || {}).forEach(function(owner){
    var budget = state.ownerBudgets[owner];
    if (!budget) return;
    list.push({ owner: owner, budget: budget, spent: spent[owner] || 0 });
  });
  list.sort(function(a,b){ return (b.spent / b.budget) - (a.spent / a.budget); });
  return list;
}
function submitOwnerBudgets() {
  var inputs = document.querySelectorAll(".owner-budget-input");
  var budgets = {};
  for (var i = 0; i < inputs.length; i++) {
    var owner = inputs[i].getAttribute("data-owner");
    var val = Number(inputs[i].value);
    if (val > 0) budgets[owner] = val;
  }
  state.ownerBudgets = budgets;
  saveData();
  settingsMsg = "Per-person budgets saved."; settingsMsgIsError = false;
  render();
}

/* ============================== smart: category suggestion from note text ============================== */
function tokenizeNote(s) { return (s || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(function(w){ return w.length >= 3; }); }
function suggestCategoryForNote(note, type) {
  var inputTokens = tokenizeNote(note);
  if (inputTokens.length === 0) return null;
  var noteLower = note.trim().toLowerCase();
  var scores = {};
  state.transactions.forEach(function(t){
    if (t.type !== type || !t.note) return;
    var tNoteLower = t.note.toLowerCase();
    var score = 0;
    if (tNoteLower === noteLower) score += 10;
    else if (tNoteLower.indexOf(noteLower) !== -1 || noteLower.indexOf(tNoteLower) !== -1) score += 5;
    var tTokens = tokenizeNote(t.note);
    score += inputTokens.filter(function(w){ return tTokens.indexOf(w) !== -1; }).length * 2;
    if (score <= 0) return;
    if (!scores[t.category]) scores[t.category] = 0;
    scores[t.category] += score;
  });
  var best = null, bestScore = 0;
  Object.keys(scores).forEach(function(cat){ if (scores[cat] > bestScore) { bestScore = scores[cat]; best = cat; } });
  return bestScore >= 2 ? best : null;
}
function updateCategorySuggestion() {
  var noteEl = document.getElementById("f-tx-note");
  var hintEl = document.getElementById("tx-cat-suggestion");
  var catEl = document.getElementById("f-tx-category");
  if (!noteEl || !hintEl || !catEl || !txForm) return;
  var note = noteEl.value.trim();
  if (note.length < 2) { hintEl.innerHTML = ""; return; }
  var suggestion = suggestCategoryForNote(note, txForm.type);
  if (!suggestion || suggestion === catEl.value) { hintEl.innerHTML = ""; return; }
  hintEl.innerHTML = '<span style="font-size:12px;color:var(--subtext);">Suggested: <button type="button" onclick="applySuggestedCategory(\'' + jsAttr(suggestion) + '\')" style="background:none;border:none;color:var(--gold);font-weight:700;cursor:pointer;padding:0;">' + esc(suggestion) + '</button></span>';
}
function applySuggestedCategory(cat) {
  var catEl = document.getElementById("f-tx-category");
  if (catEl) catEl.value = cat;
  var hintEl = document.getElementById("tx-cat-suggestion");
  if (hintEl) hintEl.innerHTML = "";
}

/* ============================== smart: quick add ============================== */
function parseQuickAdd(text) {
  var tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;
  var amount = null, amountIdx = -1;
  for (var i = 0; i < tokens.length; i++) {
    if (/^[\d,]+(\.\d+)?$/.test(tokens[i])) {
      var n = parseFloat(tokens[i].replace(/,/g, ""));
      if (!isNaN(n) && n > 0) { amount = n; amountIdx = i; break; }
    }
  }
  if (amount === null) return null;
  var rest = tokens.filter(function(t, i){ return i !== amountIdx; });
  var lowerRest = rest.map(function(w){ return w.toLowerCase(); });
  var incomeKeywords = ["salary","income","received","credited","refund","bonus","interest","dividend"];
  var type = lowerRest.some(function(w){ return incomeKeywords.indexOf(w) !== -1; }) ? "income" : "expense";
  var cats = type === "income" ? incomeCats() : expenseCats();
  var matchedCat = null;
  for (var j = 0; j < rest.length; j++) {
    var w = rest[j].toLowerCase();
    var found = cats.find(function(c){ return c.toLowerCase() === w; });
    if (found) { matchedCat = found; rest.splice(j, 1); break; }
  }
  if (!matchedCat) matchedCat = cats[cats.length - 1];
  return { amount: amount, type: type, category: matchedCat, note: rest.join(" ").trim() };
}
function submitQuickAdd() {
  var input = document.getElementById("quick-add-input");
  var accSelect = document.getElementById("quick-add-account");
  var text = input ? input.value : "";
  if (state.accounts.length === 0) { showNotice("Add an account first."); return; }
  var parsed = parseQuickAdd(text);
  if (!parsed) { showNotice('Couldn\u2019t find an amount in that. Try something like "500 food swiggy".'); return; }
  var accountId = (accSelect && accSelect.value) ? accSelect.value : state.accounts[0].id;
  var tx = { id: uid(), type: parsed.type, accountId: accountId, amount: parsed.amount, category: parsed.category, note: parsed.note, date: todayStr() };
  lastUsedAccountId = accountId;
  proceedWithNewTransaction(tx, function(){ if (input) input.value = ""; });
}

/* ============================== smart: one-tap repeats ============================== */
function frequentTransactionSignatures(limit) {
  var counts = {};
  state.transactions.forEach(function(t){
    if (t.type === "transfer") return;
    var key = t.accountId + "|" + t.type + "|" + t.category + "|" + t.amount + "|" + (t.note || "");
    if (!counts[key]) counts[key] = { count: 0, sample: t };
    counts[key].count++;
  });
  var arr = Object.keys(counts).map(function(k){ return counts[k]; });
  arr.sort(function(a,b){ return b.count - a.count; });
  return arr.filter(function(x){ return x.count >= 2; }).slice(0, limit);
}
function repeatTransaction(idx) {
  var freq = frequentTransactionSignatures(5);
  var f = freq[idx];
  if (!f) return;
  var t = f.sample;
  var tx = { id: uid(), type: t.type, accountId: t.accountId, amount: t.amount, category: t.category, note: t.note, date: todayStr() };
  lastUsedAccountId = t.accountId;
  proceedWithNewTransaction(tx);
}
function filteredTransactions() {
  var q = state.search.trim().toLowerCase();
  var accs = accountsById();
  return state.transactions.filter(function(t){
    if (!inPeriod(t.date, state.filterPeriod, state.customStart, state.customEnd)) return false;
    if (state.filterType !== "all" && t.type !== state.filterType) return false;
    if (state.filterAccountId !== "all") {
      if (t.accountId !== state.filterAccountId && t.fromAccountId !== state.filterAccountId && t.toAccountId !== state.filterAccountId) return false;
    }
    if (q) {
      var names = [accs[t.accountId] && accountDisplayName(accs[t.accountId]), accs[t.fromAccountId] && accountDisplayName(accs[t.fromAccountId]), accs[t.toAccountId] && accountDisplayName(accs[t.toAccountId])].filter(Boolean).join(" ").toLowerCase();
      var hay = ((t.note||"") + " " + (t.category||"") + " " + names).toLowerCase();
      if (hay.indexOf(q) === -1) return false;
    }
    return true;
  }).sort(function(a,b){ return a.date < b.date ? 1 : -1; });
}
function filteredStats() {
  var income = 0, expense = 0;
  var list = filteredTransactions();
  list.forEach(function(t){
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expense += t.amount;
  });
  return { income: income, expense: expense, net: income - expense, count: list.length };
}
function computeNotifications() {
  var list = [];
  if (state.accounts.length > 0) {
    var todayLogged = state.transactions.some(function(t){ return t.date === todayStr(); });
    if (!todayLogged) list.push({ id: "today-tx", icon: "\uD83D\uDCDD", text: "No transactions logged today yet.", actionLabel: "Add transaction", action: "openTransactionModal('expense')" });
  }
  var bills = upcomingBills(7);
  if (bills.length > 0) {
    list.push({ id: "bills", icon: "\uD83D\uDCC5", text: bills.length + " bill" + (bills.length === 1 ? "" : "s") + " due in the next 7 days.", actionLabel: "View", action: "closeNotifications(); setTab('recurring')" });
  }
  var dueReminders = upcomingReminders(3);
  if (dueReminders.length > 0) {
    var overdueCount = dueReminders.filter(function(r){ return r.dueDate < todayStr(); }).length;
    var r0 = dueReminders[0];
    var remText = dueReminders.length > 1
      ? (dueReminders.length + " reminder" + (dueReminders.length === 1 ? "" : "s") + (overdueCount > 0 ? (", " + overdueCount + " overdue") : " due soon"))
      : (r0.name + (r0.dueDate < todayStr() ? " is overdue." : (r0.dueDate === todayStr() ? " is due today." : " is due soon.")));
    list.push({ id: "reminders", icon: "\uD83D\uDD14", text: remText, actionLabel: "View", action: "closeNotifications(); setTab('reminders')" });
  }
  var recurCandidates = detectRecurringCandidates();
  if (recurCandidates.length > 0) {
    var c = recurCandidates[0];
    list.push({
      id: "recur-" + c.key, icon: "\uD83D\uDD01",
      text: (c.note || c.category || "An expense") + " (" + fmt(c.amount) + ") looks like it repeats monthly.",
      actionLabel: "Automate it", action: "openRecurringFromSuggestion()"
    });
  }
  var daysSince = state.lastBackupAt ? Math.floor((Date.now() - state.lastBackupAt) / 86400000) : null;
  if (daysSince === null && state.accounts.length > 0) {
    list.push({ id: "backup", icon: "\uD83D\uDCBE", text: "You haven't backed up your ledger yet.", actionLabel: "Back up now", action: "exportBackup()" });
  } else if (daysSince !== null && daysSince >= 7) {
    list.push({ id: "backup", icon: "\uD83D\uDCBE", text: "It's been " + daysSince + " day" + (daysSince === 1 ? "" : "s") + " since your last backup.", actionLabel: "Back up now", action: "exportBackup()" });
  }
  return list;
}
function notificationCount() { return computeNotifications().length + (lastDeleted ? 1 : 0); }
function dismissNotif(id) {
  // session-only: just re-render after acting; nothing to persist for these reminder types
  render();
}

/* ============================== mutators: accounts ============================== */
function setTab(t) { state.tab = t; render(); }
function saveAccount(acc) {
  var i = state.accounts.findIndex(function(a){ return a.id === acc.id; });
  if (i >= 0) state.accounts[i] = acc; else state.accounts.push(acc);
  saveData(); render();
}
function deleteAccount(id) {
  var acc = state.accounts.find(function(a){ return a.id === id; });
  if (!acc) return;
  showConfirmDialog(
    'Delete "' + accountDisplayName(acc) + '"? Its transaction history will also be removed.\n\nYou can undo this right after from the bell icon.',
    function(){ performDeleteAccount(id); },
    "Delete account"
  );
}
function performDeleteAccount(id) {
  var acc = state.accounts.find(function(a){ return a.id === id; });
  if (!acc) return;
  var removedTxs = state.transactions.filter(function(t){ return t.accountId === id || t.fromAccountId === id || t.toAccountId === id; });
  state.accounts = state.accounts.filter(function(a){ return a.id !== id; });
  state.transactions = state.transactions.filter(function(t){ return !(t.accountId === id || t.fromAccountId === id || t.toAccountId === id); });
  lastDeleted = { type: "account", account: acc, transactions: removedTxs };
  saveData(); render();
}

/* ============================== mutators: transactions ============================== */
function applyEffect(tx) {
  var accs = accountsById();
  if (tx.type === "transfer") {
    if (accs[tx.fromAccountId]) accs[tx.fromAccountId].balance -= tx.amount;
    if (accs[tx.toAccountId]) accs[tx.toAccountId].balance += tx.amount;
  } else {
    var delta = tx.type === "income" ? tx.amount : -tx.amount;
    if (accs[tx.accountId]) accs[tx.accountId].balance += delta;
  }
}
function reverseEffect(tx) {
  var accs = accountsById();
  if (tx.type === "transfer") {
    if (accs[tx.fromAccountId]) accs[tx.fromAccountId].balance += tx.amount;
    if (accs[tx.toAccountId]) accs[tx.toAccountId].balance -= tx.amount;
  } else {
    var delta = tx.type === "income" ? -tx.amount : tx.amount;
    if (accs[tx.accountId]) accs[tx.accountId].balance += delta;
  }
}
function addTransaction(tx) {
  state.transactions.push(tx);
  applyEffect(tx);
  saveData(); render();
}
function deleteTransaction(id) {
  var tx = state.transactions.find(function(t){ return t.id === id; });
  if (!tx) return;
  state.transactions = state.transactions.filter(function(t){ return t.id !== id; });
  reverseEffect(tx);
  lastDeleted = { type: "transaction", tx: tx };
  saveData(); render();
}

/* ============================== bulk actions ============================== */
function toggleBulkMode() { bulkMode = !bulkMode; bulkSelected = {}; render(); }
function toggleBulkSelect(id) {
  if (bulkSelected[id]) delete bulkSelected[id]; else bulkSelected[id] = true;
  render();
}
function bulkSelectAll() {
  filteredTransactions().forEach(function(t){ bulkSelected[t.id] = true; });
  render();
}
function bulkClearSelection() { bulkSelected = {}; render(); }
function bulkDeleteSelected() {
  var ids = Object.keys(bulkSelected);
  if (ids.length === 0) return;
  showConfirmDialog(
    "Delete " + ids.length + " selected transaction" + (ids.length === 1 ? "" : "s") + "? This can't be undone as a batch \u2014 the bell's Undo only covers the very last delete.",
    function(){
      ids.forEach(function(id){
        var tx = state.transactions.find(function(t){ return t.id === id; });
        if (tx) {
          state.transactions = state.transactions.filter(function(t){ return t.id !== id; });
          reverseEffect(tx);
        }
      });
      bulkSelected = {}; bulkMode = false;
      saveData(); render();
    },
    "Delete " + ids.length
  );
}
function openBulkRecategorize() {
  if (Object.keys(bulkSelected).length === 0) return;
  state.bulkRecatModalOpen = true;
  render();
}
function closeBulkRecatModal() { state.bulkRecatModalOpen = false; render(); }
function submitBulkRecategorize() {
  var newCat = document.getElementById("f-bulk-category").value;
  var count = 0;
  Object.keys(bulkSelected).forEach(function(id){
    var tx = state.transactions.find(function(t){ return t.id === id; });
    if (tx && tx.type !== "transfer") { tx.category = newCat; count++; }
  });
  state.bulkRecatModalOpen = false;
  bulkSelected = {}; bulkMode = false;
  saveData();
  showNotice("Recategorized " + count + " transaction" + (count === 1 ? "" : "s") + " to \"" + newCat + "\".");
}

/* ============================== undo ============================== */
function undoDelete() {
  if (!lastDeleted) return;
  if (lastDeleted.type === "transaction") {
    state.transactions.push(lastDeleted.tx);
    applyEffect(lastDeleted.tx);
  } else if (lastDeleted.type === "account") {
    state.accounts.push(lastDeleted.account);
    state.transactions = state.transactions.concat(lastDeleted.transactions);
  }
  lastDeleted = null;
  saveData(); render();
}
function dismissUndo() { lastDeleted = null; render(); }

/* ============================== mutators: recurring ============================== */
function addRecurring(rule) {
  var result = processRecurring(state.accounts, state.transactions, state.recurringRules.concat([rule]));
  state.accounts = result.accounts;
  state.transactions = result.transactions;
  state.recurringRules = result.recurringRules;
  saveData(); render();
}
function toggleRecurring(id) {
  var r = state.recurringRules.find(function(r){ return r.id === id; });
  if (r) r.active = !r.active;
  saveData(); render();
}
function deleteRecurring(id) {
  showConfirmDialog(
    "Delete this recurring rule? Past transactions it already created will stay in your history.",
    function(){ performDeleteRecurring(id); },
    "Delete rule"
  );
}
function performDeleteRecurring(id) {
  state.recurringRules = state.recurringRules.filter(function(r){ return r.id !== id; });
  saveData(); render();
}

/* ============================== backup / restore / email ============================== */
function exportCSV() {
  var list = filteredTransactions();
  var accs = accountsById();
  var rows = [["Date","Type","Account","Category / Note","Note","Amount (INR)"]];
  list.forEach(function(t){
    if (t.type === "transfer") {
      rows.push([t.date, "Transfer",
        accountDisplayName(accs[t.fromAccountId]) + " -> " + accountDisplayName(accs[t.toAccountId]),
        "Transfer", t.note || "", t.amount]);
    } else {
      rows.push([t.date, t.type === "income" ? "Income" : "Expense",
        accountDisplayName(accs[t.accountId]),
        t.category, t.note || "", t.type === "income" ? t.amount : -t.amount]);
    }
  });
  var accLabel = state.filterAccountId === "all" ? "all-accounts" : accountDisplayName(accs[state.filterAccountId]).replace(/\s+/g,"-").toLowerCase();
  downloadCSV(rows, "transactions_" + accLabel + "_" + state.filterPeriod + "_" + todayStr() + ".csv");
}
async function buildBackupObject() {
  var vault = await encryptJSON(cryptoKey, vaultPayload());
  return {
    isLedgerBackup: true, exportedAt: new Date().toISOString(),
    email: currentEmail,
    passwordSalt: currentPasswordSalt, wrappedDEKPassword: currentWrappedDEKPassword,
    recoverySalt: currentRecoverySalt, wrappedDEKRecovery: currentWrappedDEKRecovery,
    vault: vault
  };
}
async function exportBackup() {
  try {
    var backupObj = await buildBackupObject();
    downloadBlob(JSON.stringify(backupObj, null, 2), "ledger-backup_" + todayStr() + ".json", "application/json");
    state.lastBackupAt = Date.now();
    saveData(); render();
  } catch (e) {
    showNotice("Could not create backup: " + (e && e.message ? e.message : "unknown error"));
  }
}
function handleRestoreFile(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var parsed;
    try {
      parsed = JSON.parse(ev.target.result);
      if (!parsed.wrappedDEKPassword || !parsed.passwordSalt || !parsed.vault || !parsed.wrappedDEKRecovery || !parsed.recoverySalt) throw new Error("bad format");
    } catch (err) {
      showNotice("Couldn't read that file \u2014 make sure it's a ledger backup .json from this app. (Backups from before this version's encryption upgrade aren't compatible \u2014 a one-time break, for real security.)");
      return;
    }
    proceedRestoreWithVerification(parsed);
  };
  reader.readAsText(file);
  input.value = "";
}
function proceedRestoreWithVerification(parsed) {
  var when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleString() : "an unknown date";
  var ownerHint = parsed.email ? (" (for " + parsed.email + ")") : "";
  showPromptDialog(
    "Backup from " + when + ownerHint + ".\n\nEnter the recovery key for THIS backup to verify it's actually yours before restoring \u2014 not your current recovery key, the one from wherever this backup was made.",
    "",
    async function(entered){
      var recoveryInput = (entered || "").trim().toUpperCase();
      if (!recoveryInput) return;
      try {
        var saltBytes = new Uint8Array(b64ToBuf(parsed.recoverySalt));
        var recKey = await deriveKey(recoveryInput, saltBytes);
        await decryptBytes(recKey, parsed.wrappedDEKRecovery.iv, parsed.wrappedDEKRecovery.data); // throws if wrong
      } catch (e) {
        showNotice("That recovery key doesn't match this backup, so restore was cancelled.");
        return;
      }
      showConfirmDialog(
        "Verified. Restore this backup?\n\nThis replaces everything currently in this ledger \u2014 including its password. You'll unlock afterward with the password from THAT backup (or the recovery key you just entered), not your current password.",
        function(){ return commitRestore(parsed); },
        "Restore"
      );
    },
    "Verify",
    "password"
  );
}
async function commitRestore(parsed) {
  try {
    await tauriWriteVault({
      email: parsed.email || "",
      passwordSalt: parsed.passwordSalt, wrappedDEKPassword: parsed.wrappedDEKPassword,
      recoverySalt: parsed.recoverySalt, wrappedDEKRecovery: parsed.wrappedDEKRecovery,
      vault: parsed.vault
    });
    currentEmail = parsed.email || "";
    currentPasswordSalt = parsed.passwordSalt;
    currentWrappedDEKPassword = parsed.wrappedDEKPassword;
    currentRecoverySalt = parsed.recoverySalt;
    currentWrappedDEKRecovery = parsed.wrappedDEKRecovery;
    lastDeleted = null;
    lockVault();
    showNotice("Restored. Unlock with the password (or recovery key) from that backup.");
  } catch (e) {
    showNotice("Restore failed: " + (e && e.message ? e.message : "unknown error"));
  }
}
/* ============================== bank CSV import ============================== */
function parseCSV(text) {
  var rows = []; var row = []; var field = ""; var inQuotes = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i+1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i+1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function pad2(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
function parseFlexibleDate(s) {
  s = (s || "").trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return m[1] + "-" + pad2(m[2]) + "-" + pad2(m[3]);
  m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
  if (m) {
    var d = m[1], mo = m[2], y = m[3];
    if (y.length === 2) y = (Number(y) > 50 ? "19" : "20") + y;
    return y + "-" + pad2(mo) + "-" + pad2(d);
  }
  return null;
}
function parseAmountStr(s) {
  if (s == null) return NaN;
  var cleaned = String(s).replace(/[^0-9.\-]/g, "");
  if (!cleaned || cleaned === "-" || cleaned === ".") return NaN;
  return parseFloat(cleaned);
}
function guessColumn(headers, candidates) {
  for (var i = 0; i < headers.length; i++) {
    var h = headers[i].toLowerCase().trim();
    for (var j = 0; j < candidates.length; j++) if (h.indexOf(candidates[j]) !== -1) return i;
  }
  return -1;
}
function openImportModal() {
  document.getElementById("import-file-input-wrap") || null;
  importState = null;
  state.importModalOpen = true;
  render();
}
function closeImportModal() { state.importModalOpen = false; importState = null; render(); }
function handleImportFile(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(ev) {
    var rows = parseCSV(String(ev.target.result));
    if (rows.length < 2) { showNotice("That file doesn't look like a CSV with data rows."); return; }
    var headers = rows[0];
    var dataRows = rows.slice(1).filter(function(r){ return r.some(function(c){ return c.trim() !== ""; }); });
    var dateCol = guessColumn(headers, ["date"]);
    var noteCol = guessColumn(headers, ["narration","description","particulars","details","remarks","note","memo"]);
    var debitCol = guessColumn(headers, ["debit","withdrawal","dr"]);
    var creditCol = guessColumn(headers, ["credit","deposit","cr"]);
    var amountCol = guessColumn(headers, ["amount"]);
    var mode = (debitCol !== -1 && creditCol !== -1) ? "split" : "single";
    importState = {
      headers: headers, rows: dataRows,
      accountId: state.accounts[0] ? state.accounts[0].id : "",
      dateCol: dateCol, noteCol: noteCol, mode: mode,
      amountCol: amountCol !== -1 ? amountCol : 0,
      debitCol: debitCol !== -1 ? debitCol : 0, creditCol: creditCol !== -1 ? creditCol : 0
    };
    render();
  };
  reader.readAsText(file);
  input.value = "";
}
function updateImportField(field, value) {
  if (!importState) return;
  importState[field] = (field === "accountId" || field === "mode") ? value : Number(value);
  render();
}
function performImport() {
  if (!importState || !importState.accountId) return;
  var imported = 0, skipped = 0;
  importState.rows.forEach(function(row){
    var date = parseFlexibleDate(row[importState.dateCol]);
    var note = importState.noteCol >= 0 ? (row[importState.noteCol] || "").trim() : "";
    var amount, type;
    if (importState.mode === "split") {
      var debit = parseAmountStr(row[importState.debitCol]);
      var credit = parseAmountStr(row[importState.creditCol]);
      if (!isNaN(debit) && debit > 0) { amount = debit; type = "expense"; }
      else if (!isNaN(credit) && credit > 0) { amount = credit; type = "income"; }
      else { skipped++; return; }
    } else {
      var amt = parseAmountStr(row[importState.amountCol]);
      if (isNaN(amt) || amt === 0) { skipped++; return; }
      type = amt < 0 ? "expense" : "income";
      amount = Math.abs(amt);
    }
    if (!date) { skipped++; return; }
    var tx = {
      id: uid(), type: type, accountId: importState.accountId, amount: amount,
      category: type === "income" ? incomeCats()[incomeCats().length - 1] : expenseCats()[expenseCats().length - 1],
      note: note, date: date, imported: true
    };
    state.transactions.push(tx);
    applyEffect(tx);
    imported++;
  });
  saveData();
  closeImportModal();
  showNotice("Imported " + imported + " transaction" + (imported === 1 ? "" : "s") + (skipped ? (". Skipped " + skipped + " row" + (skipped === 1 ? "" : "s") + " that couldn't be read \u2014 check the date/amount columns are mapped right.") : ". All rows read cleanly."));
  render();
}

/* ============================== export to Excel (SpreadsheetML) ============================== */
function xmlEsc(s) { return String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function xlsCell(val) {
  if (typeof val === "number") return '<Cell><Data ss:Type="Number">' + val + '</Data></Cell>';
  return '<Cell><Data ss:Type="String">' + xmlEsc(val) + '</Data></Cell>';
}
function xlsSheet(name, header, rows) {
  var out = '<Row>' + header.map(function(h){ return '<Cell ss:StyleID="Header"><Data ss:Type="String">' + xmlEsc(h) + '</Data></Cell>'; }).join("") + '</Row>';
  rows.forEach(function(r){ out += '<Row>' + r.map(xlsCell).join("") + '</Row>'; });
  return '<Worksheet ss:Name="' + xmlEsc(name) + '"><Table>' + out + '</Table></Worksheet>';
}
function exportExcel(startDate, endDate, label) {
  var balanceDate = endDate || todayStr();
  var isRealAsOf = endDate && endDate !== FAR_FUTURE;
  var displayAsOf = isRealAsOf ? balanceDate : todayStr();
  var accs = accountsById();
  var accHeader = ["Account","Type","Owner","Balance (as of " + displayAsOf + ")"];
  var accRows = state.accounts.map(function(a){ return [a.name, ACCOUNT_TYPES[a.type].label, a.owner || "", accountBalanceAsOf(a.id, balanceDate)]; });

  var txHeader = ["Date","Type","Account","Category","Note","Amount"];
  var txRows = state.transactions.filter(function(t){
    if (!t.date || t.date > balanceDate) return false;
    if (startDate && t.date < startDate) return false;
    return true;
  }).sort(function(a,b){ return a.date < b.date ? -1 : 1; }).map(function(t){
    if (t.type === "transfer") {
      return [t.date, "Transfer", accountDisplayName(accs[t.fromAccountId]) + " -> " + accountDisplayName(accs[t.toAccountId]), "Transfer", t.note || "", t.amount];
    }
    return [t.date, t.type === "income" ? "Income" : "Expense", accountDisplayName(accs[t.accountId]), t.category, t.note || "", t.type === "income" ? t.amount : -t.amount];
  });

  var periodLabel = label || "All time";
  var stats = periodStats(startDate, balanceDate);
  var netWorthTotal = state.accounts.reduce(function(s,a){ return s + accountBalanceAsOf(a.id, balanceDate); }, 0);
  var sumHeader = ["Metric","Value"];
  var sumRows = [
    ["Period", periodLabel],
    ["Net worth (as of " + displayAsOf + ")", netWorthTotal],
    ["Income", stats.income], ["Expense", stats.expense], ["Net", stats.net],
    ["Exported", new Date().toLocaleString()]
  ];

  var xml = '<?xml version="1.0"?>' +
    '<?mso-application progid="Excel.Sheet"?>' +
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
    '<Styles><Style ss:ID="Header"><Font ss:Bold="1"/><Interior ss:Color="#F6F1E4" ss:Pattern="Solid"/></Style></Styles>' +
    xlsSheet("Summary", sumHeader, sumRows) +
    xlsSheet("Accounts", accHeader, accRows) +
    xlsSheet("Transactions", txHeader, txRows) +
    '</Workbook>';

  var fileTag = label ? label.replace(/[^a-zA-Z0-9]+/g, "-").toLowerCase() : "all-time";
  downloadBlob(xml, "ledger_" + fileTag + "_" + todayStr() + ".xls", "application/vnd.ms-excel");
}
function openExcelExportModal() {
  var months = transactionMonthsList();
  excelExportState = { period: "month", ym: months[0] };
  state.excelModalOpen = true;
  render();
}
function closeExcelExportModal() { state.excelModalOpen = false; excelExportState = null; render(); }
function updateExcelField(field, value) { if (!excelExportState) return; excelExportState[field] = value; render(); }
function confirmExportExcel() {
  if (!excelExportState) return;
  if (excelExportState.period === "all") {
    exportExcel(null, "9999-12-31", "All time");
  } else {
    var ym = excelExportState.ym;
    var parts = ym.split("-");
    var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    exportExcel(ym + "-01", lastDayOfMonthStr(ym), label);
  }
  closeExcelExportModal();
}

/* ============================== printable statement ============================== */
function pad2x(n) { n = String(n); return n.length < 2 ? "0" + n : n; }
function lastDayOfMonthStr(ym) {
  var parts = ym.split("-");
  var y = Number(parts[0]), m = Number(parts[1]);
  var last = new Date(y, m, 0).getDate();
  return ym + "-" + pad2x(last);
}
function monthStatsFor(ym) {
  var income = 0, expense = 0;
  state.transactions.forEach(function(t){
    if (!t.date || t.date.slice(0,7) !== ym) return;
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expense += t.amount;
  });
  return { income: income, expense: expense, net: income - expense };
}
function accountBalanceAsOf(accountId, asOfDate) {
  var acc = accountsById()[accountId];
  if (!acc) return 0;
  var balance = acc.balance;
  state.transactions.forEach(function(t){
    if (t.date <= asOfDate) return;
    if (t.type === "transfer") {
      if (t.fromAccountId === accountId) balance += t.amount;
      if (t.toAccountId === accountId) balance -= t.amount;
    } else if (t.accountId === accountId) {
      balance += t.type === "income" ? -t.amount : t.amount;
    }
  });
  return balance;
}
var FAR_FUTURE = "9999-12-31"; // sentinel "no upper bound" date for all-time reports
function periodStats(startDate, endDate) {
  var income = 0, expense = 0;
  state.transactions.forEach(function(t){
    if (!t.date || t.date > endDate) return;
    if (startDate && t.date < startDate) return;
    if (t.type === "income") income += t.amount;
    if (t.type === "expense") expense += t.amount;
  });
  return { income: income, expense: expense, net: income - expense };
}
function transactionMonthsList() {
  var set = {};
  state.transactions.forEach(function(t){ if (t.date) set[t.date.slice(0,7)] = true; });
  var months = Object.keys(set);
  if (months.length === 0) months = [todayStr().slice(0,7)];
  months.sort(function(a,b){ return a < b ? 1 : -1; });
  return months;
}
function openStatementWindow(startDate, endDate, label) {
  var accs = accountsById();
  var periodTx = state.transactions.filter(function(t){ return t.date && t.date <= endDate && (!startDate || t.date >= startDate); }).sort(function(a,b){ return a.date < b.date ? -1 : 1; });
  var stats = periodStats(startDate, endDate);
  var netWorthAsOf = state.accounts.reduce(function(s,a){ return s + accountBalanceAsOf(a.id, endDate); }, 0);
  var displayAsOf = endDate === FAR_FUTURE ? todayStr() : endDate;

  var rowsHtml = periodTx.map(function(t){
    var lbl, amtStr, cls;
    if (t.type === "transfer") {
      lbl = accountDisplayName(accs[t.fromAccountId]) + " \u2192 " + accountDisplayName(accs[t.toAccountId]);
      amtStr = fmt(t.amount); cls = "";
    } else {
      lbl = accountDisplayName(accs[t.accountId]) + (t.note ? " \u2014 " + t.note : "");
      amtStr = (t.type === "income" ? "+" : "-") + fmt(t.amount);
      cls = t.type === "income" ? "pos" : "neg";
    }
    return "<tr><td>" + esc(t.date) + "</td><td>" + esc(t.type) + "</td><td>" + esc(t.category || "Transfer") + "</td><td>" + esc(lbl) + "</td><td class='" + cls + "' style='text-align:right;'>" + esc(amtStr) + "</td></tr>";
  }).join("");

  var balancesHtml = state.accounts.map(function(a){
    return "<tr><td>" + esc(accountDisplayName(a)) + "</td><td>" + esc(ACCOUNT_TYPES[a.type].label) + "</td><td style='text-align:right;'>" + esc(fmt(accountBalanceAsOf(a.id, endDate))) + "</td></tr>";
  }).join("");

  var html = "<!DOCTYPE html><html><head><meta charset='UTF-8'><title>Statement - " + esc(label) + "</title><style>" +
    "body{font-family:Georgia,serif;color:#1B2A41;max-width:800px;margin:30px auto;padding:0 20px;}" +
    "h1{font-size:22px;margin-bottom:2px;}h2{font-size:14px;color:#6B6354;font-weight:normal;margin-top:0;}" +
    "table{width:100%;border-collapse:collapse;margin:14px 0 26px;font-size:13px;}" +
    "th,td{border:1px solid #DCD2B8;padding:6px 9px;text-align:left;}th{background:#F6F1E4;}" +
    ".pos{color:#3F6B4F;}.neg{color:#A8462F;}" +
    ".summary{display:flex;gap:20px;margin:14px 0;flex-wrap:wrap;}.summary div{border:1px solid #DCD2B8;padding:10px 14px;border-radius:6px;}" +
    "@media print{button{display:none;}}" +
    "</style></head><body>" +
    "<h1>Paisa Diary \u2014 Statement</h1><h2>" + esc(label) + " (as of " + esc(displayAsOf) + ")</h2>" +
    "<div class='summary'><div>Income<br><b>" + fmt(stats.income) + "</b></div><div>Expense<br><b>" + fmt(stats.expense) + "</b></div><div>Net<br><b>" + fmt(stats.net) + "</b></div><div>Net worth as of " + esc(displayAsOf) + "<br><b>" + fmt(netWorthAsOf) + "</b></div></div>" +
    "<h3>Account balances (as of " + esc(displayAsOf) + ")</h3><table><tr><th>Account</th><th>Type</th><th style='text-align:right;'>Balance</th></tr>" + balancesHtml + "</table>" +
    "<h3>Transactions in this period</h3><table><tr><th>Date</th><th>Type</th><th>Category</th><th>Details</th><th style='text-align:right;'>Amount</th></tr>" + (rowsHtml || "<tr><td colspan='5'>No transactions in this period.</td></tr>") + "</table>" +
    "<button onclick='window.print()' style='padding:10px 18px;font-size:14px;cursor:pointer;'>Print / Save as PDF</button>" +
    "</body></html>";

  var win = window.open("", "_blank");
  if (!win) { showNotice("Your browser blocked the print window. Allow pop-ups for this page and try again."); return; }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
function printStatementForMonth(ym) {
  var start = ym + "-01";
  var end = lastDayOfMonthStr(ym);
  var parts = ym.split("-");
  var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  openStatementWindow(start, end, label);
}
function printStatementForRange(start, end) {
  openStatementWindow(start, end, start + " to " + end);
}
function printStatementForAll() {
  openStatementWindow(null, "9999-12-31", "All time");
}
function openPrintModal() {
  var months = transactionMonthsList();
  printState = { period: "month", ym: months[0], customStart: todayStr(), customEnd: todayStr() };
  state.printModalOpen = true;
  render();
}
function closePrintModal() { state.printModalOpen = false; printState = null; render(); }
function updatePrintField(field, value) { if (!printState) return; printState[field] = value; render(); }
function generateStatement() {
  if (!printState) return;
  if (printState.period === "month") printStatementForMonth(printState.ym);
  else if (printState.period === "all") printStatementForAll();
  else printStatementForRange(printState.customStart, printState.customEnd);
  closePrintModal();
}

async function emailBackupAndLock() {
  if (!state.email) {
    showNotice("Add a backup email in Settings first, then try this again.");
    return;
  }
  var backupObj = await buildBackupObject();
  downloadBlob(JSON.stringify(backupObj, null, 2), "ledger-backup_" + todayStr() + ".json", "application/json");
  state.lastBackupAt = Date.now();
  saveData(); render();
  var subject = encodeURIComponent("My Ledger Backup \u2014 " + todayStr());
  var body = encodeURIComponent(
    "Hi,\n\nA backup file (ledger-backup_" + todayStr() + ".json) was just saved to your Downloads folder.\n" +
    "Please attach that file to this email before sending.\n\n\u2014 Sent from Paisa Diary (offline)"
  );
  window.location.href = "mailto:" + encodeURIComponent(state.email) + "?subject=" + subject + "&body=" + body;
  showNotice(
    "Backup saved to Downloads, and an email draft to " + state.email + " should now be open in your default mail app.\n\n" +
    "Attach ledger-backup_" + todayStr() + ".json from Downloads, then hit send yourself \u2014 browsers can't attach files or send mail automatically.\n\n" +
    "Nothing opened? Your device doesn't have a default email app set up. You can still attach the same downloaded file manually in Gmail, Outlook, or whatever you use."
  );
}

/* ============================== settings ============================== */
function openSettings() { settingsMsg = ""; settingsMsgIsError = false; state.settingsOpen = true; render(); }
function closeSettings() { state.settingsOpen = false; render(); }
async function submitChangePassword() {
  var oldPw = document.getElementById("f-old-pw").value;
  var newPw = document.getElementById("f-new-pw").value;
  var confirmPw = document.getElementById("f-confirm-pw").value;
  if (!oldPw || !newPw || !confirmPw) { settingsMsg = "Fill in all three password fields."; settingsMsgIsError = true; render(); return; }
  if (newPw !== confirmPw) { settingsMsg = "New passwords don't match."; settingsMsgIsError = true; render(); return; }
  if (newPw.length < 6) { settingsMsg = "New password should be at least 6 characters."; settingsMsgIsError = true; render(); return; }
  var dekBytes;
  try {
    var saltBytes = new Uint8Array(b64ToBuf(currentPasswordSalt));
    var oldKey = await deriveKey(oldPw, saltBytes);
    dekBytes = await decryptBytes(oldKey, currentWrappedDEKPassword.iv, currentWrappedDEKPassword.data);
  } catch (e) {
    settingsMsg = "Old password is incorrect."; settingsMsgIsError = true; render(); return;
  }
  var newSalt = crypto.getRandomValues(new Uint8Array(16));
  var newKey = await deriveKey(newPw, newSalt);
  var newWrapped = await encryptBytes(newKey, dekBytes);
  currentPasswordSalt = bufToB64(newSalt);
  currentWrappedDEKPassword = newWrapped;
  // DEK itself is unchanged, so cryptoKey (already derived from it) and the recovery key both remain valid.
  await saveData();
  settingsMsg = "Password changed. Your recovery key still works, unchanged."; settingsMsgIsError = false;
  document.getElementById("f-old-pw").value = "";
  document.getElementById("f-new-pw").value = "";
  document.getElementById("f-confirm-pw").value = "";
  render();
}
async function toggleAutostart() {
  var newValue = !autostartEnabledCache;
  try {
    await tauriSetAutostart(newValue);
    autostartEnabledCache = newValue;
    settingsMsg = newValue ? "Will launch automatically when Windows starts." : "Won't launch automatically anymore.";
    settingsMsgIsError = false;
  } catch (e) {
    settingsMsg = "Couldn't change that setting."; settingsMsgIsError = true;
  }
  render();
}
async function checkForUpdates() {
  settingsMsg = "Checking for updates\u2026"; settingsMsgIsError = false; render();
  try {
    if (!window.__TAURI__.updater) throw new Error("Updater isn't set up yet.");
    var update = await window.__TAURI__.updater.check();
    if (update && update.available) {
      showConfirmDialog(
        "Version " + update.version + " is available (you're on " + update.currentVersion + ").\n\n" + (update.body || "") + "\n\nDownload and install now? The app will restart.",
        async function(){
          await update.downloadAndInstall();
          await window.__TAURI__.process.relaunch();
        },
        "Update now"
      );
      settingsMsg = ""; render();
    } else {
      settingsMsg = "You're on the latest version."; settingsMsgIsError = false; render();
    }
  } catch (e) {
    settingsMsg = "Couldn't check for updates \u2014 update hosting isn't configured yet."; settingsMsgIsError = true; render();
    console.error(e);
  }
}
function regenerateRecoveryKey() {
  showPromptDialog(
    "Enter your current password to generate a new recovery key. Your old recovery key will stop working immediately.",
    "",
    async function(pw){
      if (!pw) return;
      try {
        var saltBytes = new Uint8Array(b64ToBuf(currentPasswordSalt));
        var key = await deriveKey(pw, saltBytes);
        var dekBytes = await decryptBytes(key, currentWrappedDEKPassword.iv, currentWrappedDEKPassword.data);
        var newRecoveryKey = generateRecoveryKey();
        var newRecoverySalt = crypto.getRandomValues(new Uint8Array(16));
        var recKey = await deriveKey(newRecoveryKey, newRecoverySalt);
        var newWrapped = await encryptBytes(recKey, dekBytes);
        currentRecoverySalt = bufToB64(newRecoverySalt);
        currentWrappedDEKRecovery = newWrapped;
        await saveData();
        showNotice("Your new recovery key:\n\n" + newRecoveryKey + "\n\nSave it now \u2014 it won't be shown again, and your old recovery key no longer works.");
      } catch (e) {
        showNotice("Incorrect password. Your recovery key was not changed.");
      }
    },
    "Continue",
    "password"
  );
}
function submitEmail() {
  var email = document.getElementById("f-settings-email").value.trim();
  state.email = email;
  saveData();
  settingsMsg = "Backup email saved."; settingsMsgIsError = false;
  render();
}
function addCategory(kind) {
  var inputId = kind === "expense" ? "f-new-cat-expense" : "f-new-cat-income";
  var input = document.getElementById(inputId);
  var val = input ? input.value.trim() : "";
  if (!val) return;
  var arr = kind === "expense" ? state.expenseCategories : state.incomeCategories;
  var exists = arr.some(function(c){ return c.toLowerCase() === val.toLowerCase(); });
  if (exists) {
    settingsMsg = '"' + val + '" is already in the list.';
    settingsMsgIsError = true;
    render();
    return;
  }
  arr.push(val);
  settingsMsg = '"' + val + '" added.'; settingsMsgIsError = false;
  saveData(); render();
}
function removeCategory(kind, name) {
  if (kind === "expense") state.expenseCategories = state.expenseCategories.filter(function(c){ return c !== name; });
  else state.incomeCategories = state.incomeCategories.filter(function(c){ return c !== name; });
  saveData(); render();
}
function openCategoryEdit(kind, name) {
  showPromptDialog('Rename category "' + name + '"', name, function(newVal){ renameCategoryConfirmed(kind, name, newVal); }, "Save");
}
function renameCategoryConfirmed(kind, oldName, newValRaw) {
  var newVal = (newValRaw || "").trim();
  if (!newVal || newVal === oldName) { state.settingsOpen = true; render(); return; }
  var arr = kind === "expense" ? state.expenseCategories : state.incomeCategories;
  var dupe = arr.some(function(c){ return c.toLowerCase() === newVal.toLowerCase() && c !== oldName; });
  if (dupe) {
    showNotice('"' + newVal + '" already exists in this list.', function(){ state.settingsOpen = true; render(); });
    return;
  }
  var idx = arr.indexOf(oldName);
  if (idx === -1) { state.settingsOpen = true; render(); return; }
  arr[idx] = newVal;
  state.transactions.forEach(function(t){ if (t.type === kind && t.category === oldName) t.category = newVal; });
  state.recurringRules.forEach(function(r){ if (r.type === kind && r.category === oldName) r.category = newVal; });
  saveData();
  settingsMsg = 'Renamed to "' + newVal + '".'; settingsMsgIsError = false;
  state.settingsOpen = true;
  render();
}

/* ============================== modal openers: account ============================== */
function openAccountModal(id) {
  var existing = id ? state.accounts.find(function(a){ return a.id === id; }) : null;
  var displayBalance = existing ? (existing.type === "credit_card" ? Math.abs(existing.balance) : existing.balance) : "";
  accForm = existing
    ? { id: existing.id, name: existing.name, type: existing.type, owner: existing.owner || "", balance: String(displayBalance), creditLimit: (existing.creditLimit != null ? String(existing.creditLimit) : "") }
    : { id: null, name: "", type: "cash", owner: "", balance: "", creditLimit: "" };
  state.accountModal = true;
  render();
}
function closeAccountModal() { state.accountModal = null; accForm = null; render(); }
function submitAccountModal() {
  var name = document.getElementById("f-acc-name").value.trim();
  var type = document.getElementById("f-acc-type").value;
  var owner = document.getElementById("f-acc-owner").value.trim();
  var balance = document.getElementById("f-acc-balance").value;
  if (!name || balance === "" || isNaN(Number(balance))) return;
  var wasNew = !accForm.id;
  var newBalance = Number(balance);
  var creditLimit = null;
  if (type === "credit_card") {
    newBalance = -Math.abs(newBalance); // stored as debt (negative), so net worth math just works
    var limitEl = document.getElementById("f-acc-credit-limit");
    creditLimit = (limitEl && limitEl.value !== "") ? Number(limitEl.value) : null;
  }
  var existing = accForm.id ? state.accounts.find(function(a){ return a.id === accForm.id; }) : null;
  var history = (existing && existing.valueHistory) ? existing.valueHistory.slice() : [];
  if (type === "mutual_fund" || type === "stock") {
    var todayEntry = history.find(function(h){ return h.date === todayStr(); });
    if (todayEntry) todayEntry.value = newBalance;
    else if (!existing || existing.balance !== newBalance) history.push({ date: todayStr(), value: newBalance });
  }
  saveAccount({ id: accForm.id || uid(), name: name, type: type, owner: owner, balance: newBalance, valueHistory: history, creditLimit: creditLimit });

  if (type === "credit_card" && wasNew) {
    var addReminderEl = document.getElementById("f-acc-add-reminder");
    if (addReminderEl && addReminderEl.checked) {
      var reminderDateEl = document.getElementById("f-acc-reminder-date");
      var dueDate = (reminderDateEl && reminderDateEl.value) ? reminderDateEl.value : todayStr();
      state.reminders.push({ id: uid(), name: name + " payment", category: "Bills", dueDate: dueDate, repeat: "monthly" });
      saveData();
    }
  }
  closeAccountModal();
}
function onAccountTypeChange() {
  accForm.type = document.getElementById("f-acc-type").value;
  accForm.name = document.getElementById("f-acc-name").value;
  accForm.owner = document.getElementById("f-acc-owner").value;
  accForm.balance = document.getElementById("f-acc-balance").value;
  var limitEl = document.getElementById("f-acc-credit-limit");
  accForm.creditLimit = limitEl ? limitEl.value : (accForm.creditLimit || "");
  render();
}

/* ============================== modal openers: transaction (add + edit) ============================== */
function openTransactionModal(mode, editId) {
  if (editId) {
    var tx = state.transactions.find(function(t){ return t.id === editId; });
    if (!tx) return;
    if (tx.type === "transfer") {
      txForm = { mode: "transfer", editId: tx.id, type: "transfer", accountId: tx.fromAccountId, toAccountId: tx.toAccountId, amount: String(tx.amount), category: expenseCats()[0], note: tx.note || "", date: tx.date };
    } else {
      txForm = { mode: tx.type, editId: tx.id, type: tx.type, accountId: tx.accountId, toAccountId: state.accounts[0] ? state.accounts[0].id : "", amount: String(tx.amount), category: tx.category, note: tx.note || "", date: tx.date };
    }
  } else {
    var firstAcc = state.accounts[0] ? state.accounts[0].id : "";
    var secondAcc = state.accounts[1] ? state.accounts[1].id : firstAcc;
    txForm = { mode: mode, editId: null, type: mode === "transfer" ? "transfer" : "expense", accountId: firstAcc, toAccountId: secondAcc, amount: "", category: expenseCats()[0], note: "", date: todayStr() };
  }
  state.txModal = true;
  render();
}
function closeTransactionModal() { state.txModal = null; txForm = null; render(); }
function setTxType(t) {
  txForm.amount = document.getElementById("f-tx-amount") ? document.getElementById("f-tx-amount").value : txForm.amount;
  txForm.note = document.getElementById("f-tx-note") ? document.getElementById("f-tx-note").value : txForm.note;
  txForm.date = document.getElementById("f-tx-date") ? document.getElementById("f-tx-date").value : txForm.date;
  txForm.type = t;
  txForm.category = t === "income" ? incomeCats()[0] : expenseCats()[0];
  render();
}
function submitTransactionModal() {
  var amount = Number(document.getElementById("f-tx-amount").value);
  var date = document.getElementById("f-tx-date").value || todayStr();
  var note = document.getElementById("f-tx-note").value.trim();
  if (!amount || amount <= 0) return;

  var newTx;
  if (txForm.type === "transfer") {
    var fromId = document.getElementById("f-tx-from").value;
    var toId = document.getElementById("f-tx-to").value;
    if (!fromId || !toId || fromId === toId) return;
    newTx = { id: txForm.editId || uid(), type: "transfer", fromAccountId: fromId, toAccountId: toId, amount: amount, note: note, date: date };
  } else {
    var accountId = document.getElementById("f-tx-account").value;
    var category = document.getElementById("f-tx-category").value;
    if (!accountId) return;
    newTx = { id: txForm.editId || uid(), type: txForm.type, accountId: accountId, amount: amount, category: category, note: note, date: date };
  }

  if (txForm.editId) {
    var idx = state.transactions.findIndex(function(t){ return t.id === txForm.editId; });
    if (idx === -1) return;
    reverseEffect(state.transactions[idx]);
    state.transactions[idx] = newTx;
    applyEffect(newTx);
    saveData(); render();
    closeTransactionModal();
  } else {
    lastUsedAccountId = newTx.type === "transfer" ? newTx.fromAccountId : newTx.accountId;
    closeTransactionModal();
    proceedWithNewTransaction(newTx);
  }
}

/* ============================== modal openers: recurring ============================== */
function openRecurringModal() {
  var firstAcc = state.accounts[0] ? state.accounts[0].id : "";
  recForm = { type: "expense", accountId: firstAcc, amount: "", category: expenseCats()[0], frequency: "monthly", startDate: todayStr(), note: "" };
  state.recurringModalOpen = true;
  render();
}
function closeRecurringModal() { state.recurringModalOpen = false; recForm = null; render(); }
function setRecurringType(t) {
  recForm.amount = document.getElementById("f-rec-amount") ? document.getElementById("f-rec-amount").value : recForm.amount;
  recForm.note = document.getElementById("f-rec-note") ? document.getElementById("f-rec-note").value : recForm.note;
  recForm.type = t;
  recForm.category = t === "income" ? incomeCats()[0] : expenseCats()[0];
  render();
}
function submitRecurringModal() {
  var accountId = document.getElementById("f-rec-account").value;
  var amount = Number(document.getElementById("f-rec-amount").value);
  var category = document.getElementById("f-rec-category").value;
  var frequency = document.getElementById("f-rec-frequency").value;
  var startDate = document.getElementById("f-rec-start").value || todayStr();
  var note = document.getElementById("f-rec-note").value.trim();
  if (!amount || amount <= 0 || !accountId) return;
  addRecurring({ id: uid(), type: recForm.type, accountId: accountId, amount: amount, category: category, frequency: frequency, nextDue: startDate, note: note, active: true });
  closeRecurringModal();
}

/* ============================== notifications panel ============================== */
function openNotifications() { state.notifModalOpen = true; render(); }
function closeNotifications() { state.notifModalOpen = false; render(); }

/* ============================== filters ============================== */
function setFilterPeriod(p) { state.filterPeriod = p; render(); }
function setFilterAccount(v) { state.filterAccountId = v; render(); }
function setFilterType(v) { state.filterType = v; render(); }
function setCustomStart(v) { state.customStart = v; render(); }
function setCustomEnd(v) { state.customEnd = v; render(); }
function setSearch(v) { state.search = v; render(); }

/* ============================== row / chart renderers ============================== */
function txRowHtml(tx, bulkModeOn) {
  var accs = accountsById();
  var isTransfer = tx.type === "transfer";
  var isIncome = tx.type === "income";
  var color = isTransfer ? TEXT : isIncome ? FOREST : RUST;
  var sign = isTransfer ? "" : isIncome ? "+" : "\u2212";
  var icon = isTransfer ? "\u21C4" : isIncome ? "\u25B2" : "\u25BC";
  var title, sub;
  if (isTransfer) {
    title = accountDisplayName(accs[tx.fromAccountId]) + " \u2192 " + accountDisplayName(accs[tx.toAccountId]);
    sub = (tx.note || "Transfer");
  } else {
    title = accountDisplayName(accs[tx.accountId]);
    sub = tx.note ? (tx.category + " \u00B7 " + tx.note) : tx.category;
  }
  var checkbox = bulkModeOn ? '<input type="checkbox" style="width:auto;flex-shrink:0;" ' + (bulkSelected[tx.id] ? "checked" : "") + ' onchange="toggleBulkSelect(\'' + tx.id + '\')">' : "";
  return '<div class="row">' + checkbox +
    '<div style="font-size:17px;color:' + color + ';width:20px;text-align:center;flex-shrink:0;">' + icon + '</div>' +
    '<div class="main"><div class="title">' + esc(title) + '</div><div class="sub">' + esc(sub) + ' \u00B7 ' + esc(tx.date) + '</div></div>' +
    '<div class="amt" style="color:' + color + ';">' + sign + ' ' + fmt(tx.amount) + '</div>' +
    '<button class="icon-btn" onclick="openTransactionModal(\'edit\',\'' + tx.id + '\')">\u270E</button>' +
    '<button class="icon-btn" onclick="deleteTransaction(\'' + tx.id + '\')">\u2715</button>' +
  '</div>';
}
function donutHtml() {
  var bt = byType();
  var entries = Object.keys(bt).filter(function(k){ return bt[k] !== 0; }).map(function(k){ return { type: k, value: bt[k] }; });
  var total = entries.reduce(function(s,e){ return s + e.value; }, 0);
  if (total <= 0 || entries.length === 0) return "";
  var gradParts = [];
  var acc = 0;
  entries.forEach(function(e){
    var startPct = (acc / total) * 100;
    acc += e.value;
    var endPct = (acc / total) * 100;
    gradParts.push(ACCOUNT_TYPES[e.type].color + " " + startPct.toFixed(2) + "% " + endPct.toFixed(2) + "%");
  });
  var legendHtml = entries.map(function(e){
    return '<div class="legend-item"><span class="dot" style="background:' + ACCOUNT_TYPES[e.type].color + ';"></span>' +
      esc(ACCOUNT_TYPES[e.type].label) + ': <b>' + fmt(e.value) + '</b></div>';
  }).join("");
  return '<div class="donut-wrap"><div class="donut" style="background: conic-gradient(' + gradParts.join(", ") + ');"></div><div class="legend">' + legendHtml + '</div></div>';
}
function categoryBarsHtml() {
  var data = categoryBreakdown();
  if (data.length === 0) return "";
  var max = data[0].value;
  var bars = data.map(function(d){
    var pct = max > 0 ? Math.max(4, (d.value / max) * 100) : 0;
    return '<div class="bar-wrap"><div class="bar-label"><span>' + esc(d.category) + '</span><span>' + fmt(d.value) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;"></div></div></div>';
  }).join("");
  return '<div class="section-label">Expense by category \u2014 this month</div>' + bars + '<div style="height:14px;"></div>';
}
function trendChartHtml() {
  var months = monthlyTrend(6);
  var max = 0;
  months.forEach(function(m){ max = Math.max(max, m.income, m.expense); });
  if (max <= 0) return "";
  var cols = months.map(function(m){
    var incH = Math.max(2, Math.round((m.income / max) * 105));
    var expH = Math.max(2, Math.round((m.expense / max) * 105));
    return '<div class="trend-col">' +
      '<div class="trend-bars">' +
        '<div class="trend-bar" style="height:' + incH + 'px;background:' + FOREST + ';" title="Income ' + fmt(m.income) + '"></div>' +
        '<div class="trend-bar" style="height:' + expH + 'px;background:' + RUST + ';" title="Expense ' + fmt(m.expense) + '"></div>' +
      '</div>' +
      '<div class="trend-label">' + esc(m.label) + '</div>' +
    '</div>';
  }).join("");
  return '<div class="section-label">Last 6 months</div>' +
    '<div class="trend-legend"><span><span class="dot" style="background:' + FOREST + ';"></span>Income</span><span><span class="dot" style="background:' + RUST + ';"></span>Expense</span></div>' +
    '<div class="trend-chart">' + cols + '</div>';
}
function ownerBreakdownHtml() {
  var data = ownerBreakdown();
  if (data.length === 0) return "";
  var max = data[0].value;
  var bars = data.map(function(d){
    var pct = max > 0 ? Math.max(4, (d.value / max) * 100) : 0;
    return '<div class="bar-wrap"><div class="bar-label"><span>' + esc(d.owner) + '</span><span>' + fmt(d.value) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + GOLD + ';"></div></div></div>';
  }).join("");
  return '<div class="section-label">Who spent what \u2014 this month</div>' + bars + '<div style="height:14px;"></div>';
}
function ownerBudgetsHtml() {
  var list = ownerBudgetStatusList();
  if (list.length === 0) return "";
  var rows = list.map(function(b){
    var pct = Math.min(100, (b.spent / b.budget) * 100);
    var color = b.spent > b.budget ? RUST : (pct >= 80 ? GOLD : FOREST);
    return '<div class="bar-wrap"><div class="bar-label"><span>' + esc(b.owner) + '</span><span>' + fmt(b.spent) + ' / ' + fmt(b.budget) + '</span></div>' +
      '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div></div>';
  }).join("");
  return '<div class="section-label">Per-person budgets this month</div>' + rows + '<div style="height:14px;"></div>';
}

/* ============================== tab renderers ============================== */
function renderOverview() {
  if (state.accounts.length === 0) {
    return '<div class="empty">Add your first account to start your ledger.<br><button class="btn gold" style="width:auto;display:inline-flex;margin-top:14px;padding:9px 18px;" onclick="openAccountModal(null)">Add account</button></div>';
  }
  var ms = monthStats();
  var mom = momComparison();
  var momHtml = "";
  if (mom.change !== null) {
    var up = mom.change > 0;
    momHtml = '<div class="mom">' + (up ? "\u25B2" : "\u25BC") + ' Spent <b style="color:' + (up ? RUST : FOREST) + ';">' +
      Math.abs(mom.change).toFixed(0) + '% ' + (up ? "more" : "less") + '</b> than last month (' + fmt(mom.lastExpense) + ')</div>';
  }
  var recent = recentTransactions(6);
  var recentHtml = recent.length === 0
    ? '<div class="empty" style="padding:18px 0;">No transactions yet.<br><button class="btn gold" style="width:auto;display:inline-flex;margin-top:14px;padding:9px 18px;" onclick="openTransactionModal(\'expense\')">Add transaction</button></div>'
    : recent.map(txRowHtml).join("");

  var projHtml = "";
  var proj = monthProjection();
  if (proj) {
    projHtml = '<div class="mom">\uD83D\uDCC8 On track to spend <b>' + fmt(proj.projected) + '</b> this month (day ' + proj.daysElapsed + ' of ' + proj.daysInMonth + ')</div>';
  }

  var budgetHtml = "";
  var budgetList = budgetStatusList();
  if (budgetList.length > 0) {
    var budgetRows = budgetList.map(function(b){
      var pct = Math.min(100, (b.spent / b.budget) * 100);
      var color = b.spent > b.budget ? RUST : (pct >= 80 ? GOLD : FOREST);
      return '<div class="bar-wrap"><div class="bar-label"><span>' + esc(b.category) + '</span><span>' + fmt(b.spent) + ' / ' + fmt(b.budget) + '</span></div>' +
        '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div></div>';
    }).join("");
    budgetHtml = '<div class="section-label">Budgets this month</div>' + budgetRows + '<div style="height:14px;"></div>';
  }

  return donutHtml() + netWorthChartHtml() +
    '<div class="section-label">This month</div>' +
    '<div class="stat-row">' +
      '<div class="stat-box"><div class="lbl">Income</div><div class="val" style="color:' + FOREST + ';">' + fmt(ms.income) + '</div></div>' +
      '<div class="stat-box"><div class="lbl">Expense</div><div class="val" style="color:' + RUST + ';">' + fmt(ms.expense) + '</div></div>' +
      '<div class="stat-box"><div class="lbl">Net</div><div class="val" style="color:' + (ms.net >= 0 ? FOREST : RUST) + ';">' + fmt(ms.net) + '</div></div>' +
    '</div>' +
    projHtml + momHtml + budgetHtml + trendChartHtml() + ownerBreakdownHtml() + ownerBudgetsHtml() + categoryBarsHtml() +
    '<div style="display:flex;justify-content:space-between;align-items:center;">' +
      '<div class="section-label">Recent activity</div>' +
      (recent.length > 0 ? '<button class="icon-btn" style="color:' + GOLD + ';font-weight:700;font-size:12.5px;" onclick="setTab(\'transactions\')">View all</button>' : '') +
    '</div>' + recentHtml;
}
function renderAccounts() {
  var groups = {};
  Object.keys(ACCOUNT_TYPES).forEach(function(k){ groups[k] = []; });
  state.accounts.forEach(function(a){ if (groups[a.type]) groups[a.type].push(a); });

  var topButtons = '<div class="btn-row">' +
    '<button class="btn" style="flex:1;" onclick="openAccountModal(null)">+ Add account</button>';
  if (state.accounts.length > 0) {
    topButtons += '<button class="btn outline" style="flex:1;" onclick="exportBackup()">\u2B07 Backup</button>';
    topButtons += '<button class="btn outline" style="flex:1;" onclick="openPrintModal()">\uD83D\uDDA8 Print statement</button>';
  }
  topButtons += '<button class="btn outline" style="flex:1;" onclick="document.getElementById(\'restore-file-input\').click()">\u2B06 Restore</button>' +
    '<input id="restore-file-input" class="file-input" type="file" accept="application/json" onchange="handleRestoreFile(this)">' +
    '<button class="btn outline" style="flex:1;" onclick="openImportModal()">\uD83D\uDCC4 Import bank CSV</button>' +
    '<input id="xl-import-input" class="file-input" type="file" accept=".xlsx,.xlsm,.xls" onchange="handleExcelImport(this)">' +
    '<button class="btn outline" style="flex:1;" onclick="openExcelImport()">\uD83D\uDCD7 Import my Excel</button>' +
    (state.accounts.length > 0 ? '<button class="btn outline" style="flex:1;" onclick="openExcelExportModal()">\uD83D\uDCD1 Export Excel</button>' : "") +
  '</div>';

  if (state.accounts.length === 0) return topButtons + '<div class="empty">No accounts yet \u2014 add cash, bank, family bank, credit cards, mutual funds or stocks. Use the "Owner" field to tell apart accounts that share a name, like your HDFC account and your mother\u2019s.</div>';

  var listHtml = "";
  Object.keys(groups).forEach(function(type){
    var list = groups[type];
    if (list.length === 0) return;
    listHtml += '<div class="section-label">' + ACCOUNT_TYPES[type].label + '</div>';
    list.forEach(function(a){
      var isCredit = a.type === "credit_card";
      var amtColor = isCredit ? RUST : TEXT;
      var amtDisplay = (isCredit ? "\u2212" : "") + fmt(Math.abs(a.balance));
      var subLine = "";
      if (isCredit && a.creditLimit) {
        var available = a.creditLimit + a.balance; // balance is negative debt, so limit + balance = what's left
        subLine = '<div class="sub">Available ' + fmt(available) + ' of ' + fmt(a.creditLimit) + ' limit</div>';
      }
      listHtml += '<div class="row">' +
        '<div class="icon" style="background:' + ACCOUNT_TYPES[a.type].color + '1A;">' + ACCOUNT_TYPES[a.type].icon + '</div>' +
        '<div class="main"><div class="title">' + esc(accountDisplayName(a)) + '</div>' + subLine + '</div>' +
        '<div class="amt" style="color:' + amtColor + ';">' + amtDisplay + '</div>' +
        ((a.type === "mutual_fund" || a.type === "stock") ? '<button class="icon-btn" onclick="openInvestmentHistory(\'' + a.id + '\')" title="Growth history">\uD83D\uDCC8</button>' : "") +
        '<button class="icon-btn" onclick="openAccountModal(\'' + a.id + '\')">\u270E</button>' +
        '<button class="icon-btn" onclick="deleteAccount(\'' + a.id + '\')">\u2715</button>' +
      '</div>';
    });
  });
  return topButtons + listHtml;
}
function renderTransactions() {
  var quickAddHtml = "";
  if (state.accounts.length > 0) {
    var qaDefaultAcc = (lastUsedAccountId && accountsById()[lastUsedAccountId]) ? lastUsedAccountId : state.accounts[0].id;
    var qaAccOptions = state.accounts.map(function(a){ return '<option value="' + a.id + '"' + (a.id === qaDefaultAcc ? ' selected' : '') + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");
    quickAddHtml = '<div class="field"><label class="field-label">Quick add</label>' +
      '<select id="quick-add-account" style="margin-bottom:8px;">' + qaAccOptions + '</select>' +
      '<div style="display:flex;gap:8px;">' +
        '<input id="quick-add-input" placeholder="e.g. 500 food swiggy dinner" onkeydown="if(event.key===\'Enter\') submitQuickAdd()">' +
        '<button class="btn" style="width:auto;padding:0 18px;" onclick="submitQuickAdd()">Add</button>' +
      '</div>' +
      '<div class="field-hint">Type an amount and a few words \u2014 we\u2019ll guess the category. Pick the account above first.</div>' +
    '</div>';
    var freq = frequentTransactionSignatures(5);
    if (freq.length > 0) {
      quickAddHtml += '<div class="filter-chips" style="margin-top:2px;">' + freq.map(function(f, idx){
        var t = f.sample;
        var label = (t.note || t.category) + " \u00B7 " + fmt(t.amount);
        return '<button class="filter-chip" onclick="repeatTransaction(' + idx + ')">' + esc(label) + '</button>';
      }).join("") + '</div>';
    }
  }

  var topButtons = '<div class="btn-row">' +
    '<button class="btn" style="flex:1;" ' + (state.accounts.length === 0 ? 'disabled' : '') + ' onclick="openTransactionModal(\'expense\')">+ Transaction</button>' +
    '<button class="btn outline" style="flex:1;" ' + (state.accounts.length < 2 ? 'disabled' : '') + ' onclick="openTransactionModal(\'transfer\')">\u21C4 Transfer</button>' +
  '</div>';
  topButtons = quickAddHtml + topButtons;

  if (state.transactions.length === 0) return topButtons + '<div class="empty">No transactions logged yet.</div>';

  var filterHtml = '<div class="section-label">Filter</div>' +
    '<div class="search-wrap"><span class="icon">\uD83D\uDD0D</span><input id="f-search" value="' + esc(state.search) + '" oninput="setSearch(this.value)" placeholder="Search note, category, or account"></div>' +
    '<div class="filter-chips">' + PERIODS.map(function(p){
      return '<button class="filter-chip' + (state.filterPeriod === p.key ? ' active' : '') + '" onclick="setFilterPeriod(\'' + p.key + '\')">' + p.label + '</button>';
    }).join("") + '</div>';

  if (state.filterPeriod === "custom") {
    filterHtml += '<div style="display:flex;gap:8px;margin-bottom:10px;">' +
      '<input type="date" value="' + state.customStart + '" onchange="setCustomStart(this.value)">' +
      '<input type="date" value="' + state.customEnd + '" onchange="setCustomEnd(this.value)">' +
    '</div>';
  }

  var accOptions = '<option value="all">All accounts</option>' + state.accounts.map(function(a){
    return '<option value="' + a.id + '"' + (state.filterAccountId === a.id ? ' selected' : '') + '>' + esc(accountDisplayName(a)) + '</option>';
  }).join("");

  filterHtml += '<div style="display:flex;gap:8px;margin-bottom:18px;">' +
    '<select onchange="setFilterAccount(this.value)">' + accOptions + '</select>' +
    '<select onchange="setFilterType(this.value)">' +
      '<option value="all"' + (state.filterType === "all" ? ' selected' : '') + '>All types</option>' +
      '<option value="income"' + (state.filterType === "income" ? ' selected' : '') + '>Income</option>' +
      '<option value="expense"' + (state.filterType === "expense" ? ' selected' : '') + '>Expense</option>' +
      '<option value="transfer"' + (state.filterType === "transfer" ? ' selected' : '') + '>Transfer</option>' +
    '</select>' +
  '</div>';

  var fs = filteredStats();
  filterHtml += '<div class="stat-row">' +
    '<div class="stat-box"><div class="lbl">Income</div><div class="val" style="color:' + FOREST + ';">' + fmt(fs.income) + '</div></div>' +
    '<div class="stat-box"><div class="lbl">Expense</div><div class="val" style="color:' + RUST + ';">' + fmt(fs.expense) + '</div></div>' +
    '<div class="stat-box"><div class="lbl">Net</div><div class="val" style="color:' + (fs.net >= 0 ? FOREST : RUST) + ';">' + fmt(fs.net) + '</div></div>' +
  '</div>';

  filterHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">' +
    '<div class="section-label">' + fs.count + ' transaction' + (fs.count === 1 ? '' : 's') + '</div>' +
    '<div style="display:flex;gap:8px;">' +
      '<button class="icon-btn" style="border:1px solid var(--line);border-radius:7px;padding:5px 10px;font-size:12px;font-weight:700;color:var(--subtext);" onclick="toggleBulkMode()">' + (bulkMode ? "Cancel" : "Select") + '</button>' +
      '<button class="btn gold" style="width:auto;padding:7px 13px;font-size:12.5px;" ' + (fs.count === 0 ? 'disabled' : '') + ' onclick="exportCSV()">\u2B07 Download CSV</button>' +
    '</div>' +
  '</div>';

  if (bulkMode) {
    var selCount = Object.keys(bulkSelected).length;
    filterHtml += '<div class="btn-row" style="align-items:center;">' +
      '<button class="icon-btn" style="border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-size:12px;" onclick="bulkSelectAll()">Select all</button>' +
      '<button class="icon-btn" style="border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-size:12px;" onclick="bulkClearSelection()">Clear</button>' +
      '<button class="btn outline" style="width:auto;padding:7px 13px;font-size:12.5px;" ' + (selCount === 0 ? "disabled" : "") + ' onclick="openBulkRecategorize()">Recategorize (' + selCount + ')</button>' +
      '<button class="btn danger" style="width:auto;padding:7px 13px;font-size:12.5px;" ' + (selCount === 0 ? "disabled" : "") + ' onclick="bulkDeleteSelected()">Delete (' + selCount + ')</button>' +
    '</div>';
  }

  var list = filteredTransactions();
  var listHtml = list.length === 0
    ? '<div class="empty" style="padding:26px 0;">No transactions match this filter.</div>'
    : list.map(function(t){ return txRowHtml(t, bulkMode); }).join("");

  return topButtons + filterHtml + listHtml;
}
function renderRecurring() {
  var topButtons = '<button class="btn" ' + (state.accounts.length === 0 ? 'disabled' : '') + ' onclick="openRecurringModal()" style="margin-bottom:18px;">+ Add recurring transaction</button>';
  if (state.recurringRules.length === 0) return topButtons + '<div class="empty">Set up rent, SIPs, EMIs, or salary to log automatically each period.</div>';
  var accs = accountsById();

  var dueSoonHtml = "";
  var bills = upcomingBills(7);
  if (bills.length > 0) {
    dueSoonHtml = '<div class="section-label">Due soon</div>' + bills.map(function(r){
      var isIncome = r.type === "income";
      var color = isIncome ? FOREST : RUST;
      var isToday = r.nextDue === todayStr();
      return '<div class="bill-row">' +
        '<span class="bill-pill ' + (isToday ? "today" : "soon") + '">' + (isToday ? "Today" : r.nextDue) + '</span>' +
        '<div class="main"><div class="title" style="font-size:14px;">' + esc(r.note || r.category) + ' \u00B7 ' + esc(accountDisplayName(accs[r.accountId])) + '</div></div>' +
        '<div class="amt" style="color:' + color + ';font-size:14px;">' + (isIncome ? "+" : "\u2212") + ' ' + fmt(r.amount) + '</div>' +
      '</div>';
    }).join("") + '<div style="height:14px;"></div>';
  }

  var listHtml = state.recurringRules.map(function(r){
    var isIncome = r.type === "income";
    var color = isIncome ? FOREST : RUST;
    var freqLabel = FREQUENCIES.find(function(f){ return f.key === r.frequency; });
    return '<div class="row" style="opacity:' + (r.active ? 1 : 0.45) + ';">' +
      '<div style="font-size:17px;color:' + color + ';width:20px;text-align:center;flex-shrink:0;">\u21BB</div>' +
      '<div class="main"><div class="title">' + esc(r.note || r.category) + ' \u00B7 ' + esc(accountDisplayName(accs[r.accountId])) + '</div>' +
      '<div class="sub">' + (freqLabel ? freqLabel.label : r.frequency) + ' \u00B7 next ' + r.nextDue + (r.active ? '' : ' \u00B7 paused') + '</div></div>' +
      '<div class="amt" style="color:' + color + ';">' + (isIncome ? "+" : "\u2212") + ' ' + fmt(r.amount) + '</div>' +
      '<button class="icon-btn" onclick="toggleRecurring(\'' + r.id + '\')">' + (r.active ? '\u23F8' : '\u25B6') + '</button>' +
      '<button class="icon-btn" onclick="deleteRecurring(\'' + r.id + '\')">\u2715</button>' +
    '</div>';
  }).join("");
  if (bills.length > 0) listHtml = '<div class="section-label">All recurring</div>' + listHtml;
  return topButtons + dueSoonHtml + listHtml;
}

function renderLoansGoals() {
  var loanBtn = '<button class="btn" onclick="openLoanModal(null)" style="margin-bottom:10px;">+ Add loan</button>';
  var loansHtml;
  if (state.loans.length === 0) {
    loansHtml = '<div class="empty" style="padding:20px 0;">No loans tracked. Add your EMI, home loan, or any other loan to see remaining balance and tenure.</div>';
  } else {
    loansHtml = state.loans.map(function(loan){
      var status = loanStatus(loan);
      var color = status.percentPaid >= 90 ? FOREST : (status.percentPaid >= 50 ? GOLD : RUST);
      return '<div class="row" style="flex-wrap:wrap;">' +
        '<div class="icon" style="background:' + RUST + '1A;">\uD83C\uDFE6</div>' +
        '<div class="main"><div class="title">' + esc(loan.name) + '</div>' +
          '<div class="sub">EMI ' + fmt(loan.emiAmount) + ' \u00B7 ' + status.monthsRemaining + ' month' + (status.monthsRemaining === 1 ? '' : 's') + ' left</div></div>' +
        '<button class="icon-btn" onclick="openLoanModal(\'' + loan.id + '\')">\u270E</button>' +
        '<button class="icon-btn" onclick="deleteLoan(\'' + loan.id + '\')">\u2715</button>' +
        '<div style="width:100%;margin-top:8px;">' +
          '<div class="bar-label"><span>Remaining ' + fmt(status.remainingBalance) + '</span><span>' + status.percentPaid.toFixed(0) + '% paid</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + status.percentPaid.toFixed(1) + '%;background:' + color + ';"></div></div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  var goalBtn = '<button class="btn" ' + (state.accounts.length === 0 ? "disabled" : "") + ' onclick="openGoalModal(null)" style="margin-bottom:10px;">+ Add savings goal</button>';
  var goalsHtml;
  if (state.goals.length === 0) {
    goalsHtml = '<div class="empty" style="padding:20px 0;">No savings goals yet. Pick an account to save into and set a target.</div>';
  } else {
    var accs = accountsById();
    goalsHtml = state.goals.map(function(g){
      var p = goalProgress(g);
      var color = p.pct >= 100 ? FOREST : (p.pct >= 60 ? GOLD : RUST);
      var dueText = g.targetDate ? (p.daysLeft >= 0 ? (p.daysLeft + " days left") : "past target date") : "no target date";
      return '<div class="row" style="flex-wrap:wrap;">' +
        '<div class="icon" style="background:' + FOREST + '1A;">\uD83C\uDFAF</div>' +
        '<div class="main"><div class="title">' + esc(g.name) + '</div>' +
          '<div class="sub">' + esc(accountDisplayName(accs[g.accountId])) + ' \u00B7 ' + esc(dueText) + '</div></div>' +
        '<button class="icon-btn" onclick="openGoalModal(\'' + g.id + '\')">\u270E</button>' +
        '<button class="icon-btn" onclick="deleteGoal(\'' + g.id + '\')">\u2715</button>' +
        '<div style="width:100%;margin-top:8px;">' +
          '<div class="bar-label"><span>' + fmt(p.saved) + ' / ' + fmt(g.targetAmount) + '</span><span>' + p.pct.toFixed(0) + '%</span></div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + p.pct.toFixed(1) + '%;background:' + color + ';"></div></div>' +
        '</div>' +
      '</div>';
    }).join("");
  }

  return '<div class="section-label">Loans</div>' + loanBtn + loansHtml +
    '<div style="height:8px;"></div>' +
    '<div class="section-label">Savings goals</div>' + goalBtn + goalsHtml;
}

function renderReminders() {
  var addBtn = '<button class="btn" onclick="openReminderModal(null)" style="margin-bottom:10px;">+ Add reminder</button>';
  if (state.reminders.length === 0) {
    return addBtn + '<div class="empty" style="padding:20px 0;">No payment reminders yet. Add your wifi bill, electricity, credit card due date, or anything else you want a nudge for \u2014 whether or not the amount is fixed.</div>';
  }
  var today = todayStr();
  var sorted = state.reminders.slice().sort(function(a,b){ return a.dueDate < b.dueDate ? -1 : 1; });
  var listHtml = sorted.map(function(r){
    var isOverdue = r.dueDate < today;
    var isToday = r.dueDate === today;
    var pillClass = isOverdue ? "today" : (isToday ? "today" : "soon");
    var pillText = isOverdue ? "Overdue" : (isToday ? "Today" : r.dueDate);
    var repeatLabel = r.repeat === "none" ? "One-time" : (r.repeat.charAt(0).toUpperCase() + r.repeat.slice(1));
    return '<div class="row" style="flex-wrap:wrap;">' +
      '<span class="bill-pill ' + pillClass + '">' + esc(pillText) + '</span>' +
      '<div class="main"><div class="title" style="font-size:14px;">' + esc(r.name) + '</div>' +
        '<div class="sub">' + esc(r.category) + ' \u00B7 ' + esc(repeatLabel) + '</div></div>' +
      '<button class="icon-btn" title="Mark paid" onclick="markReminderPaid(\'' + r.id + '\')">\u2705</button>' +
      '<button class="icon-btn" title="Log transaction" onclick="quickLogReminderTransaction(\'' + r.id + '\')" ' + (state.accounts.length === 0 ? "disabled" : "") + '>\uD83D\uDCB8</button>' +
      '<button class="icon-btn" onclick="openReminderModal(\'' + r.id + '\')">\u270E</button>' +
      '<button class="icon-btn" onclick="deleteReminder(\'' + r.id + '\')">\u2715</button>' +
    '</div>';
  }).join("");
  return addBtn + '<div class="note-small">Overdue and due-today reminders show up in the bell, and you also get a 9 PM daily nudge to log your expenses.</div>' + listHtml;
}

/* ============================== modal renderers ============================== */
function modalHtml() {
  if (dialogState) return dialogModalHtml();
  if (state.accountModal) return accountModalHtml();
  if (state.txModal) return transactionModalHtml();
  if (state.recurringModalOpen) return recurringModalHtml();
  if (state.settingsOpen) return settingsModalHtml();
  if (state.notifModalOpen) return notifModalHtml();
  if (state.importModalOpen) return importModalHtml();
  if (state.printModalOpen) return printModalHtml();
  if (state.investmentModalOpen) return investmentModalHtml();
  if (state.loanModalOpen) return loanModalHtml();
  if (state.goalModalOpen) return goalModalHtml();
  if (state.reminderModalOpen) return reminderModalHtml();
  if (state.bulkRecatModalOpen) return bulkRecatModalHtml();
  if (state.excelModalOpen) return excelExportModalHtml();
  return "";
}
function dialogModalHtml() {
  var d = dialogState;
  var buttons, inputHtml = "";
  if (d.mode === "confirm") {
    buttons = '<div class="dialog-actions">' +
      '<button class="btn outline" style="flex:1;" onclick="dialogCancel()">Cancel</button>' +
      '<button class="btn danger" style="flex:1;" onclick="dialogPrimary()">' + esc(d.confirmLabel) + '</button>' +
    '</div>';
  } else if (d.mode === "prompt") {
    inputHtml = '<input id="dialog-prompt-input" type="' + esc(d.inputType || "text") + '" value="' + esc(d.defaultValue || "") + '" style="margin-bottom:16px;" onkeydown="if(event.key===\'Enter\') dialogPrimary()">';
    buttons = '<div class="dialog-actions">' +
      '<button class="btn outline" style="flex:1;" onclick="dialogCancel()">Cancel</button>' +
      '<button class="btn" style="flex:1;" onclick="dialogPrimary()">' + esc(d.confirmLabel || "Save") + '</button>' +
    '</div>';
  } else {
    buttons = '<button class="btn" onclick="dialogPrimary()">OK</button>';
  }
  return '<div class="modal-overlay"><div class="modal" style="max-width:380px;">' +
    '<div class="modal-body" style="padding-top:24px;">' +
      '<div class="dialog-message">' + esc(d.message) + '</div>' +
      inputHtml +
      buttons +
    '</div></div></div>';
}
function notifModalHtml() {
  var items = "";
  if (lastDeleted) {
    var label = lastDeleted.type === "account"
      ? 'Deleted account "' + esc(accountDisplayName(lastDeleted.account)) + '".'
      : "Deleted a transaction.";
    items += '<div class="notif undo"><span>\u21A9</span><span class="ntext">' + label + '</span>' +
      '<button class="act" onclick="undoDelete()">Undo</button>' +
      '<button class="x" onclick="dismissUndo()">\u2715</button></div>';
  }
  computeNotifications().forEach(function(n){
    var dismissBtn = n.id.indexOf("recur-") === 0
      ? '<button class="x" onclick="dismissRecurSuggestion(\'' + jsAttr(n.id.slice(6)) + '\')">\u2715</button>'
      : "";
    items += '<div class="notif"><span>' + n.icon + '</span><span class="ntext">' + esc(n.text) + '</span>' +
      '<button class="act" onclick="' + n.action + '">' + n.actionLabel + '</button>' + dismissBtn + '</div>';
  });
  if (!items) items = '<div class="notif-empty">You\u2019re all caught up. \uD83C\uDF1F</div>';
  return '<div class="modal-overlay" onclick="if(event.target===this) closeNotifications()"><div class="modal">' +
    '<div class="modal-head"><h3>Notifications</h3><button class="icon-btn" onclick="closeNotifications()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + items + '</div></div></div>';
}
function accountModalHtml() {
  var typeOptions = Object.keys(ACCOUNT_TYPES).map(function(k){
    return '<option value="' + k + '"' + (accForm.type === k ? ' selected' : '') + '>' + ACCOUNT_TYPES[k].label + '</option>';
  }).join("");
  var isCredit = accForm.type === "credit_card";
  var balanceLabel = isCredit ? "Amount currently owed (\u20B9)" : ((accForm.type === "mutual_fund" || accForm.type === "stock") ? "Current value (\u20B9)" : "Current balance (\u20B9)");
  var creditLimitField = isCredit
    ? '<div class="field"><label class="field-label">Credit limit (\u20B9) <span style="text-transform:none;font-weight:400;">(optional)</span></label><input id="f-acc-credit-limit" type="number" value="' + esc(accForm.creditLimit) + '" placeholder="e.g. 50000"></div>'
    : "";
  var reminderField = (isCredit && !accForm.id)
    ? '<div class="field"><label style="display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text);cursor:pointer;"><input id="f-acc-add-reminder" type="checkbox" style="width:auto;" checked>Also set a monthly payment reminder</label>' +
        '<input id="f-acc-reminder-date" type="date" value="' + todayStr() + '" style="margin-top:8px;"></div>'
    : "";
  return '<div class="modal-overlay" onclick="if(event.target===this) closeAccountModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + (accForm.id ? "Edit account" : "Add account") + '</h3><button class="icon-btn" onclick="closeAccountModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' +
      '<div class="field"><label class="field-label">Account name</label><input id="f-acc-name" value="' + esc(accForm.name) + '" placeholder="e.g. HDFC Savings, Cash"></div>' +
      '<div class="field"><label class="field-label">Owner / family member <span style="text-transform:none;font-weight:400;">(optional)</span></label>' +
        '<input id="f-acc-owner" value="' + esc(accForm.owner) + '" placeholder="e.g. Me, Mom, Dad">' +
        '<div class="field-hint">Use this to tell apart accounts that share a name \u2014 like your HDFC account and your mother\u2019s. Shown as "Mom \u2014 HDFC Savings" everywhere.</div>' +
      '</div>' +
      '<div class="field"><label class="field-label">Type</label><select id="f-acc-type" onchange="onAccountTypeChange()">' + typeOptions + '</select></div>' +
      '<div class="field"><label class="field-label">' + balanceLabel + '</label><input id="f-acc-balance" type="number" value="' + esc(accForm.balance) + '" placeholder="0"></div>' +
      creditLimitField + reminderField +
      '<button class="btn" onclick="submitAccountModal()">' + (accForm.id ? "Save changes" : "Add account") + '</button>' +
    '</div></div></div>';
}
function transactionModalHtml() {
  var isTransfer = txForm.type === "transfer";
  var isEdit = !!txForm.editId;
  var typeToggle = txForm.mode !== "transfer" ? (
    '<div class="toggle-row">' +
      '<button class="' + (txForm.type === "expense" ? "active" : "") + '" onclick="setTxType(\'expense\')">Expense</button>' +
      '<button class="' + (txForm.type === "income" ? "active" : "") + '" onclick="setTxType(\'income\')">Income</button>' +
    '</div>'
  ) : "";
  var categories = txForm.type === "income" ? incomeCats() : expenseCats();
  var accOptionsSel = function(selId) {
    return state.accounts.map(function(a){ return '<option value="' + a.id + '"' + (a.id === selId ? ' selected' : '') + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");
  };
  var body;
  if (isTransfer) {
    body = '<div class="field"><label class="field-label">From account</label><select id="f-tx-from">' + accOptionsSel(txForm.accountId) + '</select></div>' +
           '<div class="field"><label class="field-label">To account</label><select id="f-tx-to">' + accOptionsSel(txForm.toAccountId) + '</select></div>';
  } else {
    var catList = categories.slice();
    if (txForm.category && catList.indexOf(txForm.category) === -1) catList = [txForm.category].concat(catList);
    var catOptions = catList.map(function(c){ return '<option value="' + esc(c) + '"' + (txForm.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join("");
    body = '<div class="field"><label class="field-label">Account</label><select id="f-tx-account">' + accOptionsSel(txForm.accountId) + '</select></div>' +
           '<div class="field"><label class="field-label">Category</label><select id="f-tx-category">' + catOptions + '</select></div>';
  }
  var title = isEdit ? "Edit transaction" : (isTransfer ? "Transfer between accounts" : "Add transaction");
  var submitLabel = isEdit ? "Save changes" : (isTransfer ? "Transfer" : "Save transaction");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeTransactionModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + title + '</h3><button class="icon-btn" onclick="closeTransactionModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + typeToggle + body +
      '<div class="field"><label class="field-label">Amount (\u20B9)</label><input id="f-tx-amount" type="number" value="' + esc(txForm.amount) + '" placeholder="0"></div>' +
      '<div class="field"><label class="field-label">Date</label><input id="f-tx-date" type="date" value="' + txForm.date + '"></div>' +
      '<div class="field"><label class="field-label">Note (optional)</label><input id="f-tx-note" value="' + esc(txForm.note) + '" placeholder="What was this for?" oninput="updateCategorySuggestion()"></div>' +
      (isTransfer ? "" : '<div id="tx-cat-suggestion" style="margin:-10px 0 14px;"></div>') +
      '<button class="btn" onclick="submitTransactionModal()">' + submitLabel + '</button>' +
    '</div></div></div>';
}
function recurringModalHtml() {
  var typeToggle = '<div class="toggle-row">' +
      '<button class="' + (recForm.type === "expense" ? "active" : "") + '" onclick="setRecurringType(\'expense\')">Expense</button>' +
      '<button class="' + (recForm.type === "income" ? "active" : "") + '" onclick="setRecurringType(\'income\')">Income</button>' +
    '</div>';
  var categories = recForm.type === "income" ? incomeCats() : expenseCats();
  var accOptions = state.accounts.map(function(a){ return '<option value="' + a.id + '">' + esc(accountDisplayName(a)) + '</option>'; }).join("");
  var catList = categories.slice();
  if (recForm.category && catList.indexOf(recForm.category) === -1) catList = [recForm.category].concat(catList);
  var catOptions = catList.map(function(c){ return '<option value="' + esc(c) + '"' + (recForm.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join("");
  var freqOptions = FREQUENCIES.map(function(f){ return '<option value="' + f.key + '"' + (recForm.frequency === f.key ? ' selected' : '') + '>' + f.label + '</option>'; }).join("");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeRecurringModal()"><div class="modal">' +
    '<div class="modal-head"><h3>Add recurring transaction</h3><button class="icon-btn" onclick="closeRecurringModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + typeToggle +
      '<div class="field"><label class="field-label">Account</label><select id="f-rec-account">' + accOptions + '</select></div>' +
      '<div class="field"><label class="field-label">Category</label><select id="f-rec-category">' + catOptions + '</select></div>' +
      '<div class="field"><label class="field-label">Amount (\u20B9)</label><input id="f-rec-amount" type="number" value="' + esc(recForm.amount) + '" placeholder="0"></div>' +
      '<div class="field"><label class="field-label">Repeats</label><select id="f-rec-frequency">' + freqOptions + '</select></div>' +
      '<div class="field"><label class="field-label">Starting from</label><input id="f-rec-start" type="date" value="' + recForm.startDate + '"></div>' +
      '<div class="field"><label class="field-label">Note (optional)</label><input id="f-rec-note" value="' + esc(recForm.note) + '" placeholder="e.g. Rent, SIP, EMI"></div>' +
      '<div class="note-small">If the start date is in the past, missed occurrences are logged immediately so your balances stay accurate.</div>' +
      '<button class="btn" onclick="submitRecurringModal()">Add recurring transaction</button>' +
    '</div></div></div>';
}
function printModalHtml() {
  var months = transactionMonthsList();
  var monthOpts = months.map(function(ym){
    var parts = ym.split("-");
    var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return '<option value="' + ym + '"' + (printState.ym === ym ? " selected" : "") + '>' + label + '</option>';
  }).join("");
  var body = '<div class="toggle-row">' +
      '<button class="' + (printState.period === "month" ? "active" : "") + '" onclick="updatePrintField(\'period\',\'month\')">By month</button>' +
      '<button class="' + (printState.period === "all" ? "active" : "") + '" onclick="updatePrintField(\'period\',\'all\')">All time</button>' +
      '<button class="' + (printState.period === "custom" ? "active" : "") + '" onclick="updatePrintField(\'period\',\'custom\')">Custom range</button>' +
    '</div>';
  if (printState.period === "month") {
    body += '<div class="field"><label class="field-label">Month</label><select onchange="updatePrintField(\'ym\', this.value)">' + monthOpts + '</select></div>' +
      '<div class="field-hint">Only months with transactions are listed.</div>';
  } else if (printState.period === "custom") {
    body += '<div class="field"><label class="field-label">From</label><input type="date" value="' + printState.customStart + '" onchange="updatePrintField(\'customStart\', this.value)"></div>' +
      '<div class="field"><label class="field-label">To</label><input type="date" value="' + printState.customEnd + '" onchange="updatePrintField(\'customEnd\', this.value)"></div>';
  } else {
    body += '<div class="note-small">Includes every transaction you\u2019ve ever logged, with today\u2019s balances.</div>';
  }
  body += '<div class="note-small">Opens a print-ready page in a new tab with balances and transactions for that period \u2014 you can print it or save as PDF from there.</div>' +
    '<button class="btn" onclick="generateStatement()">Generate statement</button>';
  return '<div class="modal-overlay" onclick="if(event.target===this) closePrintModal()"><div class="modal">' +
    '<div class="modal-head"><h3>Print statement</h3><button class="icon-btn" onclick="closePrintModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + body + '</div></div></div>';
}
function importModalHtml() {
  var body;
  if (!importState) {
    body = '<div class="note-small">Pick a CSV file exported from your bank (or any spreadsheet app). We\u2019ll guess the date, description, and amount columns \u2014 you can fix the guesses before importing anything.</div>' +
      '<input id="import-file-input" type="file" accept=".csv,text/csv" onchange="handleImportFile(this)">';
  } else if (state.accounts.length === 0) {
    body = '<div class="note-small">Add an account first, then come back to import into it.</div>';
  } else {
    var headers = importState.headers;
    var colOptions = function(selected, allowNone) {
      var opts = allowNone ? '<option value="-1"' + (selected === -1 ? ' selected' : '') + '>\u2014 not in file \u2014</option>' : "";
      headers.forEach(function(h, i){ opts += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + esc(h || ("Column " + (i+1))) + '</option>'; });
      return opts;
    };
    var accOptions = state.accounts.map(function(a){ return '<option value="' + a.id + '"' + (a.id === importState.accountId ? ' selected' : '') + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");

    var mappingHtml = '<div class="field"><label class="field-label">Import into account</label><select onchange="updateImportField(\'accountId\', this.value)">' + accOptions + '</select></div>' +
      '<div class="field"><label class="field-label">Date column</label><select onchange="updateImportField(\'dateCol\', this.value)">' + colOptions(importState.dateCol, false) + '</select></div>' +
      '<div class="field"><label class="field-label">Description / note column</label><select onchange="updateImportField(\'noteCol\', this.value)">' + colOptions(importState.noteCol, true) + '</select></div>' +
      '<div class="toggle-row">' +
        '<button class="' + (importState.mode === "single" ? "active" : "") + '" onclick="updateImportField(\'mode\',\'single\')">Single amount column</button>' +
        '<button class="' + (importState.mode === "split" ? "active" : "") + '" onclick="updateImportField(\'mode\',\'split\')">Separate debit/credit</button>' +
      '</div>';

    if (importState.mode === "single") {
      mappingHtml += '<div class="field"><label class="field-label">Amount column <span style="text-transform:none;font-weight:400;">(negative = expense, positive = income)</span></label><select onchange="updateImportField(\'amountCol\', this.value)">' + colOptions(importState.amountCol, false) + '</select></div>';
    } else {
      mappingHtml += '<div class="field"><label class="field-label">Debit / withdrawal column</label><select onchange="updateImportField(\'debitCol\', this.value)">' + colOptions(importState.debitCol, false) + '</select></div>' +
        '<div class="field"><label class="field-label">Credit / deposit column</label><select onchange="updateImportField(\'creditCol\', this.value)">' + colOptions(importState.creditCol, false) + '</select></div>';
    }

    var previewRows = importState.rows.slice(0, 5).map(function(r){
      return "<tr><td>" + esc(r[importState.dateCol] || "") + "</td><td>" + esc(importState.noteCol >= 0 ? (r[importState.noteCol] || "") : "") + "</td><td>" +
        (importState.mode === "single" ? esc(r[importState.amountCol] || "") : ("D: " + esc(r[importState.debitCol] || "-") + " / C: " + esc(r[importState.creditCol] || "-"))) +
        "</td></tr>";
    }).join("");

    body = mappingHtml +
      '<div class="section-label">Preview (first 5 rows)</div>' +
      '<div class="import-scroll"><table class="import-preview"><tr><th>Date</th><th>Note</th><th>Amount</th></tr>' + previewRows + '</table></div>' +
      '<div class="note-small">' + importState.rows.length + ' rows found. Category will be set to "Other" \u2014 you can edit individual transactions afterward.</div>' +
      '<button class="btn" onclick="performImport()">Import ' + importState.rows.length + ' transactions</button>';
  }
  return '<div class="modal-overlay" onclick="if(event.target===this) closeImportModal()"><div class="modal wide">' +
    '<div class="modal-head"><h3>Import bank CSV</h3><button class="icon-btn" onclick="closeImportModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + body + '</div></div></div>';
}
function excelExportModalHtml() {
  var months = transactionMonthsList();
  var monthOpts = months.map(function(ym){
    var parts = ym.split("-");
    var label = new Date(Number(parts[0]), Number(parts[1]) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
    return '<option value="' + ym + '"' + (excelExportState.ym === ym ? " selected" : "") + '>' + label + '</option>';
  }).join("");
  var body = '<div class="toggle-row">' +
      '<button class="' + (excelExportState.period === "month" ? "active" : "") + '" onclick="updateExcelField(\'period\',\'month\')">By month</button>' +
      '<button class="' + (excelExportState.period === "all" ? "active" : "") + '" onclick="updateExcelField(\'period\',\'all\')">All time</button>' +
    '</div>';
  if (excelExportState.period === "month") {
    body += '<div class="field"><label class="field-label">Month</label><select onchange="updateExcelField(\'ym\', this.value)">' + monthOpts + '</select></div>' +
      '<div class="field-hint">Only months with transactions are listed.</div>';
  } else {
    body += '<div class="note-small">Includes every account, transaction, and today\u2019s balances.</div>';
  }
  body += '<button class="btn" onclick="confirmExportExcel()">Download .xls</button>';
  return '<div class="modal-overlay" onclick="if(event.target===this) closeExcelExportModal()"><div class="modal">' +
    '<div class="modal-head"><h3>Export to Excel</h3><button class="icon-btn" onclick="closeExcelExportModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + body + '</div></div></div>';
}
function bulkRecatModalHtml() {
  var count = Object.keys(bulkSelected).length;
  var catOptions = expenseCats().concat(incomeCats().filter(function(c){ return expenseCats().indexOf(c) === -1; }))
    .map(function(c){ return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join("");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeBulkRecatModal()"><div class="modal">' +
    '<div class="modal-head"><h3>Recategorize ' + count + ' transaction' + (count === 1 ? "" : "s") + '</h3><button class="icon-btn" onclick="closeBulkRecatModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' +
      '<div class="note-small">Transfers in the selection are skipped \u2014 they don\u2019t use categories.</div>' +
      '<div class="field"><label class="field-label">New category</label><select id="f-bulk-category">' + catOptions + '</select></div>' +
      '<button class="btn" onclick="submitBulkRecategorize()">Apply to ' + count + '</button>' +
    '</div></div></div>';
}
function loanModalHtml() {
  return '<div class="modal-overlay" onclick="if(event.target===this) closeLoanModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + (loanForm.id ? "Edit loan" : "Add loan") + '</h3><button class="icon-btn" onclick="closeLoanModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' +
      '<div class="field"><label class="field-label">Loan name</label><input id="f-loan-name" value="' + esc(loanForm.name) + '" placeholder="e.g. Home Loan, Car Loan"></div>' +
      '<div class="field"><label class="field-label">Principal amount (\u20B9)</label><input id="f-loan-principal" type="number" value="' + esc(loanForm.principal) + '" placeholder="0" oninput="recalcLoanEMI()"></div>' +
      '<div class="field"><label class="field-label">Annual interest rate (%)</label><input id="f-loan-rate" type="number" step="0.01" value="' + esc(loanForm.annualRate) + '" placeholder="8.5" oninput="recalcLoanEMI()"></div>' +
      '<div class="field"><label class="field-label">Tenure (months)</label><input id="f-loan-tenure" type="number" value="' + esc(loanForm.tenureMonths) + '" placeholder="240" oninput="recalcLoanEMI()"></div>' +
      '<div class="field"><label class="field-label">Start date</label><input id="f-loan-start" type="date" value="' + loanForm.startDate + '"></div>' +
      '<div class="field"><label class="field-label">EMI amount (\u20B9) <span style="text-transform:none;font-weight:400;">(auto-calculated, editable)</span></label><input id="f-loan-emi" type="number" value="' + esc(loanForm.emiAmount) + '" placeholder="0"></div>' +
      '<button class="btn" onclick="submitLoanModal()">' + (loanForm.id ? "Save changes" : "Add loan") + '</button>' +
    '</div></div></div>';
}
function goalModalHtml() {
  var accOptions = state.accounts.map(function(a){ return '<option value="' + a.id + '"' + (a.id === goalForm.accountId ? ' selected' : '') + '>' + esc(accountDisplayName(a)) + '</option>'; }).join("");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeGoalModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + (goalForm.id ? "Edit goal" : "Add savings goal") + '</h3><button class="icon-btn" onclick="closeGoalModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' +
      '<div class="field"><label class="field-label">Goal name</label><input id="f-goal-name" value="' + esc(goalForm.name) + '" placeholder="e.g. Diwali Savings"></div>' +
      '<div class="field"><label class="field-label">Target amount (\u20B9)</label><input id="f-goal-amount" type="number" value="' + esc(goalForm.targetAmount) + '" placeholder="50000"></div>' +
      '<div class="field"><label class="field-label">Target date <span style="text-transform:none;font-weight:400;">(optional)</span></label><input id="f-goal-date" type="date" value="' + esc(goalForm.targetDate) + '"></div>' +
      '<div class="field"><label class="field-label">Save into which account</label><select id="f-goal-account">' + accOptions + '</select></div>' +
      '<div class="note-small">Progress is tracked as growth in that account\u2019s balance from today' + (goalForm.id ? " (or whenever this goal started)" : "") + ' onward \u2014 so use an account you\u2019re not spending from for other things, or expect the progress to dip if you do.</div>' +
      '<button class="btn" onclick="submitGoalModal()">' + (goalForm.id ? "Save changes" : "Add goal") + '</button>' +
    '</div></div></div>';
}
function reminderModalHtml() {
  var catOptions = expenseCats().map(function(c){ return '<option value="' + esc(c) + '"' + (reminderForm.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join("");
  var repeatOptions = [["none","One-time"],["weekly","Weekly"],["monthly","Monthly"],["yearly","Yearly"]].map(function(o){
    return '<option value="' + o[0] + '"' + (reminderForm.repeat === o[0] ? ' selected' : '') + '>' + o[1] + '</option>';
  }).join("");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeReminderModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + (reminderForm.id ? "Edit reminder" : "Add payment reminder") + '</h3><button class="icon-btn" onclick="closeReminderModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' +
      '<div class="field"><label class="field-label">Name</label><input id="f-reminder-name" value="' + esc(reminderForm.name) + '" placeholder="e.g. Wifi bill, Electricity, Credit card" autofocus></div>' +
      '<div class="field"><label class="field-label">Category</label><select id="f-reminder-category">' + catOptions + '</select></div>' +
      '<div class="field"><label class="field-label">Due date</label><input id="f-reminder-date" type="date" value="' + reminderForm.dueDate + '"></div>' +
      '<div class="field"><label class="field-label">Repeats</label><select id="f-reminder-repeat">' + repeatOptions + '</select></div>' +
      '<div class="note-small">This is just a reminder \u2014 it won\u2019t log a transaction on its own. Mark it paid when you\u2019ve handled it (there\u2019s a quick shortcut to log the actual transaction too).</div>' +
      '<button class="btn" onclick="submitReminderModal()">' + (reminderForm.id ? "Save changes" : "Add reminder") + '</button>' +
    '</div></div></div>';
}
function investmentModalHtml() {
  var acc = accountsById()[state.investmentModalOpen];
  if (!acc) return "";
  var hist = acc.valueHistory || [];
  var changeHtml = "";
  if (hist.length >= 2) {
    var first = hist[0].value, last = hist[hist.length - 1].value;
    var pct = first !== 0 ? ((last - first) / first) * 100 : 0;
    changeHtml = '<div class="mom" style="margin-bottom:16px;">' + (pct >= 0 ? "\u25B2" : "\u25BC") + ' <b style="color:' + (pct >= 0 ? FOREST : RUST) + ';">' + Math.abs(pct).toFixed(1) + '%</b> since ' + esc(hist[0].date) + '</div>';
  }
  var listHtml = hist.slice().reverse().map(function(h){
    return '<div class="row"><div class="main"><div class="sub">' + esc(h.date) + '</div></div><div class="amt" style="color:' + TEXT + ';">' + fmt(h.value) + '</div></div>';
  }).join("");
  return '<div class="modal-overlay" onclick="if(event.target===this) closeInvestmentModal()"><div class="modal">' +
    '<div class="modal-head"><h3>' + esc(accountDisplayName(acc)) + '</h3><button class="icon-btn" onclick="closeInvestmentModal()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + svgLineChart(hist, FOREST, 130) + changeHtml +
      '<div class="section-label">Value history</div>' + listHtml +
    '</div></div></div>';
}
function settingsModalHtml() {
  var msgHtml = settingsMsg ? '<div class="settings-msg' + (settingsMsgIsError ? ' error' : '') + '">' + esc(settingsMsg) + '</div>' : '<div class="settings-msg"></div>';

  var expChips = expenseCats().map(function(c){
    return '<span class="cat-chip">' + esc(c) +
      ' <button onclick="openCategoryEdit(\'expense\',\'' + jsAttr(c) + '\')" title="Rename">\u270E</button>' +
      ' <button onclick="removeCategory(\'expense\',\'' + jsAttr(c) + '\')" title="Remove">\u2715</button></span>';
  }).join("");
  var incChips = incomeCats().map(function(c){
    return '<span class="cat-chip">' + esc(c) +
      ' <button onclick="openCategoryEdit(\'income\',\'' + jsAttr(c) + '\')" title="Rename">\u270E</button>' +
      ' <button onclick="removeCategory(\'income\',\'' + jsAttr(c) + '\')" title="Remove">\u2715</button></span>';
  }).join("");

  var budgetFieldsHtml = expenseCats().map(function(c){
    var val = (state.budgets && state.budgets[c]) ? state.budgets[c] : "";
    var suggestion = suggestedBudget(c);
    return '<div class="field"><label class="field-label">' + esc(c) + (suggestion ? ' <span style="text-transform:none;font-weight:400;color:var(--subtext);">(suggested ' + fmt(suggestion) + ')</span>' : '') + '</label>' +
      '<input class="budget-input" data-cat="' + esc(c) + '" type="number" value="' + esc(val) + '" placeholder="' + (suggestion || 0) + '"></div>';
  }).join("");

  var owners = distinctOwners();
  var ownerBudgetSectionHtml = "";
  if (owners.length > 0) {
    var ownerFieldsHtml = owners.map(function(o){
      var val = (state.ownerBudgets && state.ownerBudgets[o]) ? state.ownerBudgets[o] : "";
      var suggestion = ownerSuggestedBudget(o);
      return '<div class="field"><label class="field-label">' + esc(o) + (suggestion ? ' <span style="text-transform:none;font-weight:400;color:var(--subtext);">(suggested ' + fmt(suggestion) + ')</span>' : '') + '</label>' +
        '<input class="owner-budget-input" data-owner="' + esc(o) + '" type="number" value="' + esc(val) + '" placeholder="' + (suggestion || 0) + '"></div>';
    }).join("");
    ownerBudgetSectionHtml = '<div class="settings-section">' +
      '<div class="section-label">Per-person budgets <span style="text-transform:none;font-weight:400;">(monthly, optional)</span></div>' +
      '<div class="note-small">Based on the Owner field on your accounts. Leave blank for anyone you don\u2019t want to track.</div>' +
      ownerFieldsHtml +
      '<button class="btn outline" onclick="submitOwnerBudgets()">Save per-person budgets</button>' +
    '</div>';
  }


  var autoLockOptions = AUTO_LOCK_OPTIONS.map(function(m){
    return '<option value="' + m + '"' + (state.autoLockMinutes === m ? ' selected' : '') + '>' + m + ' minutes</option>';
  }).join("");

  return '<div class="modal-overlay" onclick="if(event.target===this) closeSettings()"><div class="modal">' +
    '<div class="modal-head"><h3>Settings</h3><button class="icon-btn" onclick="closeSettings()" aria-label="Close">\u2715</button></div>' +
    '<div class="modal-body">' + msgHtml +
      '<div class="settings-section">' +
        '<div class="section-label">Change password</div>' +
        '<div class="field"><label class="field-label">Current password</label><input id="f-old-pw" type="password" placeholder="Current password"></div>' +
        '<div class="field"><label class="field-label">New password</label><input id="f-new-pw" type="password" placeholder="New password"></div>' +
        '<div class="field"><label class="field-label">Confirm new password</label><input id="f-confirm-pw" type="password" placeholder="Confirm new password"></div>' +
        '<button class="btn outline" onclick="submitChangePassword()">Update password</button>' +
        '<div style="height:12px;"></div>' +
        '<div class="note-small">Lost your password? That\'s what your recovery key is for \u2014 shown once, at setup. If you need a fresh one (e.g. you suspect the old one leaked), generate a new one below; this replaces the old one.</div>' +
        '<button class="btn outline" onclick="regenerateRecoveryKey()">Generate new recovery key</button>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="section-label">Backup email</div>' +
        '<div class="note-small">Used by the envelope icon, which downloads a backup and opens a pre-filled email draft to this address. You still attach the file and hit send yourself \u2014 browsers can\'t do that automatically, and need a default mail app set up on your device.</div>' +
        '<div class="field"><label class="field-label">Email address</label><input id="f-settings-email" type="email" value="' + esc(state.email) + '" placeholder="you@example.com"></div>' +
        '<button class="btn outline" onclick="submitEmail()">Save email</button>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="section-label">Expense categories</div>' +
        '<div class="cat-chip-row">' + expChips + '</div>' +
        '<div class="cat-add-row"><input id="f-new-cat-expense" placeholder="e.g. EMI, Loan, Insurance, Home Maid" onkeydown="if(event.key===\'Enter\'){addCategory(\'expense\');}"><button class="btn outline" onclick="addCategory(\'expense\')">Add</button></div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="section-label">Income categories</div>' +
        '<div class="cat-chip-row">' + incChips + '</div>' +
        '<div class="cat-add-row"><input id="f-new-cat-income" placeholder="e.g. Rental Income, Freelance" onkeydown="if(event.key===\'Enter\'){addCategory(\'income\');}"><button class="btn outline" onclick="addCategory(\'income\')">Add</button></div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="section-label">Budgets <span style="text-transform:none;font-weight:400;">(monthly, optional)</span></div>' +
        '<div class="note-small">Leave a category blank if you don\u2019t want to track it. Suggested amounts are based on your last 3 months of spending.</div>' +
        budgetFieldsHtml +
        '<button class="btn outline" onclick="submitBudgets()">Save budgets</button>' +
      '</div>' +
      ownerBudgetSectionHtml +
      '<div class="settings-section">' +
        '<div class="section-label">Auto-lock</div>' +
        '<div class="toggle-switch" style="margin-bottom:14px;">' +
          '<span>Lock automatically when idle</span>' +
          '<label class="switch"><input id="f-autolock-enabled" type="checkbox" ' + (state.autoLockEnabled ? "checked" : "") + ' onchange="submitAutoLockSettings()"><span class="slider"></span></label>' +
        '</div>' +
        '<div class="field"><label class="field-label">Lock after</label><select id="f-autolock-minutes" onchange="submitAutoLockSettings()">' + autoLockOptions + '</select></div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<div class="section-label">Appearance</div>' +
        '<div class="toggle-switch">' +
          '<span>Dark mode</span>' +
          '<label class="switch"><input type="checkbox" ' + (currentTheme === "dark" ? "checked" : "") + ' onchange="toggleTheme()"><span class="slider"></span></label>' +
        '</div>' +
      '</div>' +
      (typeof abSettingsHtml === 'function' ? abSettingsHtml() : '') +
      (typeof bioSettingsHtml === 'function' ? bioSettingsHtml() : '') +
      (typeof wipeSettingsHtml === 'function' ? wipeSettingsHtml() : '') +
      '<div class="settings-section">' +
        '<div class="section-label">Data storage</div>' +
        '<div class="note-small">Your ledger is saved privately inside this app on your phone, encrypted with AES-256 \u2014 no server, no cloud, and nobody can read your data without your password or recovery key:<br><code style="word-break:break-all;">' + esc(vaultFilePathCache || "loading\u2026") + '</code><br><br>Backups (Accounts tab \u2192 Backup) are encrypted the same way. Restoring one asks for that backup\'s recovery key first, to verify it\'s genuinely yours, before anything is overwritten.</div>' +
      '</div>' +
      '<div class="settings-section">' +
        '<button class="btn" onclick="lockVault()">\uD83D\uDD12 Lock now</button>' +
      '</div>' +
    '</div></div></div>';
}

/* ============================== lock screen ============================== */
function lockCardWrap(inner) {
  return '<div class="lock-wrap">' +
    '<button class="lock-theme-btn" title="Toggle dark mode" onclick="toggleTheme()">' + (currentTheme === "dark" ? "\u2600" : "\uD83C\uDF19") + '</button>' +
    '<div class="lock-card">' + inner + '</div></div>';
}
function buildLockHtml() {
  if (lockScreenMode === "setup") {
    return lockCardWrap(
      '<div class="lock-icon">\uD83D\uDD12</div>' +
      '<div class="lock-title">Set up your ledger</div>' +
      '<div class="lock-sub">Choose a password. This encrypts everything \u2014 there\'s no way to recover your data without it or your recovery key, so make it memorable.</div>' +
      '<div class="field" style="text-align:left;"><label class="field-label">Email <span style="text-transform:none;font-weight:400;">(optional \u2014 shown on backups to confirm they\'re yours)</span></label><input id="setup-email" type="email" placeholder="you@example.com"></div>' +
      '<div class="field" style="text-align:left;"><label class="field-label">Password</label><input id="setup-password" type="password" placeholder="At least 6 characters" autofocus></div>' +
      '<div class="field" style="text-align:left;"><label class="field-label">Confirm password</label><input id="setup-confirm" type="password" placeholder="Type it again" onkeydown="if(event.key===\'Enter\') submitSetup()"></div>' +
      '<button class="btn" onclick="submitSetup()">Continue</button>' +
      '<div class="lock-error">' + esc(lockError) + '</div>'
    );
  }
  if (lockScreenMode === "recoveryDisplay") {
    return lockCardWrap(
      '<div class="lock-icon">\uD83D\uDD11</div>' +
      '<div class="lock-title">Save your recovery key</div>' +
      '<div class="lock-sub">This is the only way back in if you forget your password. It will not be shown again after this screen.</div>' +
      '<div style="background:var(--parchment);border:1px solid var(--line);border-radius:10px;padding:16px;font-family:\'SF Mono\',Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:1px;color:var(--text);margin-bottom:14px;word-break:break-all;">' + esc(pendingRecoveryKey) + '</div>' +
      '<div class="btn-row" style="margin-bottom:14px;">' +
        '<button id="copy-recovery-btn" class="btn outline" style="flex:1;" onclick="copyRecoveryKey()">\uD83D\uDCCB Copy</button>' +
        '<button class="btn outline" style="flex:1;" onclick="downloadRecoveryKey()">\u2B07 Save as file</button>' +
      '</div>' +
      '<label style="display:flex;align-items:flex-start;gap:8px;text-align:left;font-size:13px;color:var(--text);margin-bottom:16px;cursor:pointer;">' +
        '<input type="checkbox" style="width:auto;margin-top:2px;" ' + (recoverySavedChecked ? "checked" : "") + ' onchange="toggleRecoverySaved()">' +
        '<span>I\'ve saved this somewhere safe, outside this app.</span>' +
      '</label>' +
      '<button class="btn" ' + (!recoverySavedChecked || lockBusy ? "disabled" : "") + ' onclick="confirmRecoverySavedAndContinue()">' + (lockBusy ? "Setting up\u2026" : "Continue to my ledger") + '</button>' +
      '<div class="lock-error">' + esc(lockError) + '</div>'
    );
  }
  if (lockScreenMode === "forgotEnterRecovery") {
    return lockCardWrap(
      '<div class="lock-icon">\uD83D\uDD11</div>' +
      '<div class="lock-title">Enter your recovery key</div>' +
      '<div class="lock-sub">The one you saved when you first set up this ledger.</div>' +
      '<input id="recovery-key-input" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX" autofocus style="text-transform:uppercase;" onkeydown="if(event.key===\'Enter\') submitRecoveryVerify()">' +
      '<div style="height:12px;"></div>' +
      '<button class="btn" onclick="submitRecoveryVerify()" ' + (lockBusy ? "disabled" : "") + '>' + (lockBusy ? "Checking\u2026" : "Verify") + '</button>' +
      '<div class="lock-error">' + esc(lockError) + '</div>' +
      '<div class="lock-hint"><a href="#" onclick="backToPasswordScreen();return false;" style="color:var(--gold);">\u2190 Back to password</a></div>'
    );
  }
  if (lockScreenMode === "forgotSetNewPassword") {
    return lockCardWrap(
      '<div class="lock-icon">\uD83D\uDD13</div>' +
      '<div class="lock-title">Set a new password</div>' +
      '<div class="lock-sub">Your recovery key checked out. Choose a new password to finish.</div>' +
      '<div class="field" style="text-align:left;"><label class="field-label">New password</label><input id="forgot-new-password" type="password" placeholder="At least 6 characters" autofocus></div>' +
      '<div class="field" style="text-align:left;"><label class="field-label">Confirm password</label><input id="forgot-confirm-password" type="password" placeholder="Type it again" onkeydown="if(event.key===\'Enter\') submitForgotNewPassword()"></div>' +
      '<button class="btn" onclick="submitForgotNewPassword()" ' + (lockBusy ? "disabled" : "") + '>' + (lockBusy ? "Saving\u2026" : "Set password & unlock") + '</button>' +
      '<div class="lock-error">' + esc(lockError) + '</div>'
    );
  }
  // "unlock" (default)
  return lockCardWrap(
    '<div class="lock-icon">\uD83D\uDD12</div>' +
    '<div class="lock-title">Paisa Diary is locked</div>' +
    '<div class="lock-sub">Enter your password to continue.</div>' +
    '<input id="lock-password" type="password" placeholder="Password" autofocus onkeydown="if(event.key===\'Enter\') submitUnlock()">' +
    '<div style="height:12px;"></div>' +
    '<button class="btn" onclick="submitUnlock()" ' + (lockBusy ? 'disabled' : '') + '>' + (lockBusy ? "Unlocking\u2026" : "Unlock") + '</button>' +
    (typeof bioButtonHtml === 'function' ? bioButtonHtml() : '') +
    '<div class="lock-error">' + esc(lockError) + '</div>' +
    '<div class="lock-hint"><a href="#" onclick="showForgotPassword();return false;" style="color:var(--gold);">Forgot password?</a></div>'
  );
}

/* ============================== main render ============================== */
function buildAppHtml() {
  var bt = byType();
  var chipsHtml = Object.keys(bt).map(function(type){
    var val = bt[type];
    var isCredit = type === "credit_card";
    var displayVal = isCredit ? ("\u2212" + fmt(Math.abs(val))) : fmt(val);
    return '<div class="chip"><span class="dot" style="background:' + ACCOUNT_TYPES[type].color + ';"></span>' +
      ACCOUNT_TYPES[type].label + ': <b>' + displayVal + '</b></div>';
  }).join("");

  var tabs = [["overview","Overview"],["accounts","Accounts"],["transactions","Transactions"],["recurring","Recurring"],["loans","Loans & Goals"],["reminders","Reminders"]];
  var tabsHtml = tabs.map(function(t){
    return '<button class="tab-btn' + (state.tab === t[0] ? ' active' : '') + '" onclick="setTab(\'' + t[0] + '\')">' + t[1] + '</button>';
  }).join("");

  var contentHtml = "";
  if (state.tab === "overview") contentHtml = renderOverview();
  else if (state.tab === "accounts") contentHtml = renderAccounts();
  else if (state.tab === "transactions") contentHtml = renderTransactions();
  else if (state.tab === "recurring") contentHtml = renderRecurring();
  else if (state.tab === "loans") contentHtml = renderLoansGoals();
  else if (state.tab === "reminders") contentHtml = renderReminders();

  var storageWarning = !state.storageOk
    ? '<div style="background:#A8462F;color:#fff;font-size:12px;padding:9px 16px;text-align:center;">Local storage isn\u2019t available in this browser \u2014 your changes won\u2019t be saved.</div>'
    : "";

  var nCount = notificationCount();
  var bellBadge = nCount > 0 ? '<span class="badge">' + nCount + '</span>' : '';

  return storageWarning + '<div class="shell">' +
    '<div class="hero">' +
      '<div class="hero-top">' +
        '<div>' +
          '<div class="eyebrow">Paisa Diary</div>' +
          '<div class="hero-sub">Net worth</div>' +
        '</div>' +
        '<div class="hero-icons">' +
          '<button class="hero-icon-btn" title="Notifications" aria-label="Notifications" onclick="openNotifications()">\uD83D\uDD14' + bellBadge + '</button>' +
          '<button class="hero-icon-btn" title="Toggle dark mode" aria-label="Toggle dark mode" onclick="toggleTheme()">' + (currentTheme === "dark" ? "\u2600" : "\uD83C\uDF19") + '</button>' +
          '<button class="hero-icon-btn" title="Settings" aria-label="Settings" onclick="openSettings()">\u2699</button>' +
          '<button class="hero-icon-btn" title="Lock now" aria-label="Lock now" onclick="lockVault()">\uD83D\uDD12</button>' +
        '</div>' +
      '</div>' +
      '<div class="net-worth">' + fmt(netWorth()) + '</div>' +
      '<div class="chips">' + chipsHtml + '</div>' +
    '</div>' +
    '<div class="tabs">' + tabsHtml + '</div>' +
    '<div class="content">' + contentHtml + '</div>' +
  '</div>' + (state.txModal || state.accountModal ? '' : '<button class="fab" aria-label="Add transaction" onclick="openTransactionModal(\'expense\')">+</button>') + modalHtml();
}

function render() {
  if (isLocked) {
    var activeLock = document.activeElement;
    var lockId = activeLock && activeLock.id;
    document.getElementById("app").innerHTML = buildLockHtml() + (dialogState ? dialogModalHtml() : "");
    if (lockId) { var le = document.getElementById(lockId); if (le) le.focus(); }
    return;
  }
  var active = document.activeElement;
  var activeId = active && active.id;
  var selStart = active && typeof active.selectionStart === "number" ? active.selectionStart : null;
  var selEnd = active && typeof active.selectionEnd === "number" ? active.selectionEnd : null;

  document.getElementById("app").innerHTML = buildAppHtml();

  if (activeId) {
    var el = document.getElementById(activeId);
    if (el) {
      el.focus();
      if (selStart !== null && el.setSelectionRange) {
        try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
      }
    }
  }
}

/* ============================== performance: memoize expensive derived computations ============================== */
detectRecurringCandidates = memoByVersion(detectRecurringCandidates);
frequentTransactionSignatures = memoByVersion(frequentTransactionSignatures);
netWorthHistory = memoByVersion(netWorthHistory);

/* ============================== boot ============================== */
var vaultFilePathCache = "";
(async function boot() {
  applyTheme();
  setupActivityListeners();
  try {
    window.__TAURI__.event.listen("lock-on-hide", function(){ if (!isLocked) lockVault(); });
  } catch (e) { console.error("could not listen for lock-on-hide", e); }
  try { vaultFilePathCache = await tauriVaultFilePath(); } catch (e) { vaultFilePathCache = ""; }
  try { autostartEnabledCache = await tauriGetAutostart(); } catch (e) { autostartEnabledCache = false; }
  try {
    var fileRaw = await tauriReadVault();
    if (fileRaw) {
      var fileObj = JSON.parse(fileRaw);
      currentEmail = fileObj.email || "";
      currentPasswordSalt = fileObj.passwordSalt;
      currentWrappedDEKPassword = fileObj.wrappedDEKPassword;
      currentRecoverySalt = fileObj.recoverySalt;
      currentWrappedDEKRecovery = fileObj.wrappedDEKRecovery;
      vaultExists = true;
      lockScreenMode = "unlock";
    } else {
      vaultExists = false;
      lockScreenMode = "setup";
    }
  } catch (e) {
    console.error("boot: could not read vault file", e);
    vaultExists = false;
    lockScreenMode = "setup";
  }
  render();
})();
