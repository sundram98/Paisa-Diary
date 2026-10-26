/* Emergency wipe password: entering it on the lock screen silently erases everything on this phone. */
var wipeCfg = null;
var wipeLoaded = (async function () {
  try { var raw = await window.__TAURI__.core.invoke("read_wipe"); wipeCfg = raw ? JSON.parse(raw) : null; } catch (e) { wipeCfg = null; }
})();
async function wipeHash(pw, saltB64) {
  var base = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), "PBKDF2", false, ["deriveBits"]);
  var bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: new Uint8Array(b64ToBuf(saltB64)), iterations: 100000, hash: "SHA-256" }, base, 256);
  return bufToB64(bits);
}
async function matchesWipe(pw) {
  await wipeLoaded;
  if (!wipeCfg || !pw) return false;
  return (await wipeHash(pw, wipeCfg.salt)) === wipeCfg.hash;
}
async function verifyLoginPassword(pw) {
  try {
    var k = await deriveKey(pw, new Uint8Array(b64ToBuf(currentPasswordSalt)));
    await decryptBytes(k, currentWrappedDEKPassword.iv, currentWrappedDEKPassword.data);
    return true;
  } catch (e) { return false; }
}
async function doWipe() {
  try { await window.__TAURI__.core.invoke("clear_all"); } catch (e) {}
  wipeCfg = null;
  try { if (typeof bioClear === 'function') await bioClear(true); } catch (e) {}
  location.reload(); // boots into first-time setup, exactly like a fresh install
}
async function saveWipeCfg(pw) {
  var salt = bufToB64(crypto.getRandomValues(new Uint8Array(16)));
  var cfg = { salt: salt, hash: await wipeHash(pw, salt) };
  await window.__TAURI__.core.invoke("write_wipe", { content: JSON.stringify(cfg) });
  wipeCfg = cfg;
}
async function clearWipeCfg() { try { await window.__TAURI__.core.invoke("write_wipe", { content: null }); } catch (e) {} wipeCfg = null; }

function wipeSettingsHtml() {
  var on = !!wipeCfg;
  return '<div class="settings-section"><div class="section-label">Emergency wipe password</div>' +
    '<div class="note-small">' + (on ? '<b style="color:var(--forest)">On.</b> ' : '') + 'A second password. If anyone types it on the lock screen, all data on this phone is erased at once and the app starts fresh, as if newly installed. It can’t be undone, and your saved backup files stay untouched. It must differ from your login password.</div>' +
    '<button class="btn outline" style="margin-bottom:10px;" onclick="wipeSetup()">' + (on ? "Change wipe password" : "Set wipe password") + '</button>' +
    (on ? '<button class="btn outline" onclick="wipeTurnOff()">Turn off</button>' : "") + '</div>';
}
function wipeSetup() {
  state.settingsOpen = false; render();
  showPromptDialog("Enter your login password to continue.", "", async function (login) {
    if (!login || !(await verifyLoginPassword(login))) { showNotice("That login password is incorrect.", function () { openSettings(); }); return; }
    showPromptDialog("Choose the emergency wipe password (at least 4 characters, different from your login password).", "", async function (w) {
      if (!w || w.length < 4) { showNotice("Use at least 4 characters.", function () { openSettings(); }); return; }
      if (await verifyLoginPassword(w)) { showNotice("That is your login password. Pick a different one.", function () { openSettings(); }); return; }
      showPromptDialog("Type the wipe password again to confirm.", "", async function (w2) {
        if (w2 !== w) { showNotice("They didn't match. Nothing was changed.", function () { openSettings(); }); return; }
        await saveWipeCfg(w);
        showNotice("Emergency wipe password is on. Typing it on the lock screen erases everything on this phone.", function () { openSettings(); });
      }, "Turn on", "password");
    }, "Next", "password");
  }, "Continue", "password");
}
function wipeTurnOff() {
  state.settingsOpen = false; render();
  showConfirmDialog("Turn off the emergency wipe password?", async function () { await clearWipeCfg(); showNotice("Emergency wipe is off.", function () { openSettings(); }); }, "Turn off");
}

/* hook the lock screen: the wipe password is checked before the normal password */
var _origSubmitUnlock = submitUnlock;
submitUnlock = async function () {
  var el = document.getElementById("lock-password");
  var pw = el ? el.value : "";
  if (pw && await matchesWipe(pw)) { await doWipe(); return; }
  return _origSubmitUnlock();
};
/* a new login password must never equal the wipe password (it would wipe you at login) */
var _origChangePw = submitChangePassword;
submitChangePassword = async function () {
  var el = document.getElementById("f-new-pw");
  if (el && await matchesWipe(el.value)) { settingsMsg = "That's your emergency wipe password. Choose a different login password."; settingsMsgIsError = true; render(); return; }
  return _origChangePw();
};
var _origForgotNew = submitForgotNewPassword;
submitForgotNewPassword = async function () {
  var el = document.getElementById("forgot-new-password");
  if (el && await matchesWipe(el.value)) { lockError = "That's your emergency wipe password. Choose a different login password."; render(); return; }
  return _origForgotNew();
};
var _origCommitRestore = commitRestore;
commitRestore = async function (parsed) { var r = await _origCommitRestore(parsed); if (currentWrappedDEKPassword === parsed.wrappedDEKPassword) await clearWipeCfg(); return r; };
