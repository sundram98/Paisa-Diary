/* Automatic weekly backup: saves an encrypted copy into Documents/PaisaDiary on the phone and keeps the latest 4. */
var AB_DIR = "PaisaDiary", AB_PREFIX = "PaisaDiary-backup_", AB_KEEP = 4;
var abCfg = { on: true, last: 0, lastName: "" }, abTried = false, abWarned = false, abBusy = false;
function abFS() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Filesystem; }
var abLoaded = (async function () {
  try { var raw = await window.__TAURI__.core.invoke("read_kv", { key: "autobackup" }); if (raw) abCfg = Object.assign(abCfg, JSON.parse(raw)); } catch (e) {}
})();
async function abSave() { try { await window.__TAURI__.core.invoke("write_kv", { key: "autobackup", content: JSON.stringify(abCfg) }); } catch (e) {} }
async function abRun(force) {
  if (abBusy) return false;
  var FS = abFS(); if (!FS || isLocked || !cryptoKey) return false;
  await abLoaded;
  if (!force && (!abCfg.on || Date.now() - abCfg.last < 7 * 86400000)) return false;
  abBusy = true;
  try {
    try { await FS.requestPermissions(); } catch (e) {}
    var obj = await buildBackupObject();
    var name = AB_PREFIX + todayStr() + ".json";
    await FS.writeFile({ path: AB_DIR + "/" + name, data: JSON.stringify(obj, null, 2), directory: "DOCUMENTS", encoding: "utf8", recursive: true });
    try {
      var list = await FS.readdir({ path: AB_DIR, directory: "DOCUMENTS" });
      var files = (list.files || []).map(function (f) { return typeof f === "string" ? f : f.name; }).filter(function (n) { return n.indexOf(AB_PREFIX) === 0; }).sort().reverse();
      for (var i = AB_KEEP; i < files.length; i++) await FS.deleteFile({ path: AB_DIR + "/" + files[i], directory: "DOCUMENTS" });
    } catch (e) {}
    abCfg.last = Date.now(); abCfg.lastName = name; await abSave();
    state.lastBackupAt = Date.now(); saveData();
    abBusy = false; render();
    if (force) showNotice("Backup saved.\n\nFiles app → Documents → " + AB_DIR + " → " + name);
    return true;
  } catch (e) {
    abBusy = false;
    if (force || !abWarned) { abWarned = true; showNotice("Couldn't save an automatic backup into Documents on this phone.\n\nUse ☰ menu → Backup instead, and save the file to Files or Drive."); }
    return false;
  }
}
function abSettingsHtml() {
  if (!abFS()) return '<div class="settings-section"><div class="section-label">Automatic backup</div><div class="note-small">Available in the installed phone app. It saves a backup file into the Documents folder every week.</div></div>';
  var last = abCfg.last ? new Date(abCfg.last).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "none yet";
  return '<div class="settings-section"><div class="section-label">Automatic backup</div>' +
    '<div class="toggle-switch" style="margin-bottom:10px;"><span>Back up every week</span><label class="switch"><input type="checkbox" ' + (abCfg.on ? "checked" : "") + ' onchange="abToggle()"><span class="slider"></span></label></div>' +
    '<div class="note-small">Saves an encrypted file to <b>Documents / PaisaDiary</b> (visible in your Files app) and keeps the latest 4. Last backup: <b>' + last + '</b>. Keep one copy off this phone too.</div>' +
    '<button class="btn outline" style="margin-bottom:10px;" onclick="abNow()">Back up now</button>' +
    '<button class="btn outline" onclick="drawerDo(function(){exportBackup()})">Share a copy (Drive, WhatsApp…)</button></div>';
}
async function abToggle() { abCfg.on = !abCfg.on; await abSave(); render(); }
function abNow() { state.settingsOpen = false; render(); abRun(true); }
/* check once per unlock, a few seconds after the app opens */
var _renderBeforeAB = render;
render = function () {
  _renderBeforeAB.apply(this, arguments);
  if (!isLocked && cryptoKey && !abTried) { abTried = true; setTimeout(function () { abRun(false); }, 4000); }
};
var _lockBeforeAB = lockVault;
lockVault = function () { abTried = false; return _lockBeforeAB.apply(this, arguments); };
