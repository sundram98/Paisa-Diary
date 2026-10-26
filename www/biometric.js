/* Fingerprint / face unlock. The vault's data key is kept in Android's secure storage and only released after a biometric check. */
var BIO_SERVER = "com.sundramcorp.paisadiary";
var bioEnabled = false, bioAvail = false, bioTried = false, bioBusy = false;
function bioPlugin() { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeBiometric; }
var bioLoaded = (async function () {
  try {
    var P = bioPlugin();
    if (P) { var r = await P.isAvailable({ useFallback: false }); bioAvail = !!(r && r.isAvailable); }
    var raw = await window.__TAURI__.core.invoke("read_kv", { key: "bio" });
    bioEnabled = raw === "1" && bioAvail;
  } catch (e) { bioEnabled = false; }
  try { if (isLocked && vaultExists && lockScreenMode === "unlock") render(); } catch (e) {}
})();
async function bioClear(alsoFlag) {
  try { var P = bioPlugin(); if (P) await P.deleteCredentials({ server: BIO_SERVER }); } catch (e) {}
  try { await window.__TAURI__.core.invoke("write_kv", { key: "bio", content: null }); } catch (e) {}
  bioEnabled = false;
}
function bioSettingsHtml() {
  if (!bioAvail) return '<div class="settings-section"><div class="section-label">Fingerprint / face unlock</div><div class="note-small">Available in the installed phone app on a phone with a fingerprint or face lock set up.</div></div>';
  return '<div class="settings-section"><div class="section-label">Fingerprint / face unlock</div>' +
    '<div class="note-small">' + (bioEnabled ? '<b style="color:var(--forest)">On.</b> ' : '') + 'Open the app with your fingerprint or face instead of typing the long password. Your password still works, and is needed if you ever restore a backup.</div>' +
    (bioEnabled ? '<button class="btn outline" onclick="bioTurnOff()">Turn off</button>' : '<button class="btn outline" onclick="bioTurnOn()">Turn on</button>') + '</div>';
}
function bioButtonHtml() {
  if (!bioEnabled) return "";
  return '<div style="height:10px;"></div><button class="btn outline" onclick="bioUnlock()">👆 Use fingerprint / face</button>';
}
function bioTurnOn() {
  state.settingsOpen = false; render();
  showPromptDialog("Enter your login password once to turn this on.", "", async function (pw) {
    try {
      var salt = new Uint8Array(b64ToBuf(currentPasswordSalt));
      var k = await deriveKey(pw || "", salt);
      var dek = await decryptBytes(k, currentWrappedDEKPassword.iv, currentWrappedDEKPassword.data);
    } catch (e) { showNotice("That login password is incorrect.", function () { openSettings(); }); return; }
    try {
      var P = bioPlugin();
      await P.verifyIdentity({ reason: "Confirm it's you to turn on fingerprint unlock", title: "Paisa Diary" });
      await P.setCredentials({ username: "dek", password: bufToB64(dek), server: BIO_SERVER });
      await window.__TAURI__.core.invoke("write_kv", { key: "bio", content: "1" });
      bioEnabled = true;
      showNotice("Fingerprint / face unlock is on.", function () { openSettings(); });
    } catch (e) { showNotice("Couldn't turn it on. Make sure a fingerprint or face is set up on this phone, then try again.", function () { openSettings(); }); }
  }, "Continue", "password");
}
function bioTurnOff() {
  state.settingsOpen = false; render();
  showConfirmDialog("Turn off fingerprint / face unlock?", async function () { await bioClear(); showNotice("Fingerprint unlock is off.", function () { openSettings(); }); }, "Turn off");
}
async function bioUnlock() {
  if (bioBusy || !bioEnabled || !isLocked || lockScreenMode !== "unlock") return;
  var P = bioPlugin(); if (!P) return;
  bioBusy = true;
  var stage = "scan";
  try {
    await P.verifyIdentity({ reason: "Unlock Paisa Diary", title: "Paisa Diary", subtitle: "Use your fingerprint or face" });
    stage = "open";
    var c = await P.getCredentials({ server: BIO_SERVER });
    var dataKey = await importDEK(new Uint8Array(b64ToBuf(c.password)), ["encrypt", "decrypt"]);
    var fileObj = JSON.parse(await tauriReadVault());
    stage = "decrypt";
    var payload = await decryptJSON(dataKey, fileObj.vault.iv, fileObj.vault.data);
    loadStateFromPayload(payload);
    cryptoKey = dataKey; isLocked = false; lockBusy = false; lockError = "";
    bioBusy = false; render(); resetInactivityTimer(); saveData(); maybeSendNativeReminder();
    return;
  } catch (e) {
    if (stage === "decrypt") { await bioClear(); lockError = "Fingerprint unlock was reset. Enter your password, then turn it on again in Settings."; }
    else if (stage === "open") { lockError = "Couldn't use fingerprint unlock just now. Enter your password, or turn it off and on again in Settings."; }
  }
  bioBusy = false; render();
}
/* ask for the fingerprint as soon as the lock screen appears */
var _renderBeforeBio = render;
render = function () {
  _renderBeforeBio.apply(this, arguments);
  if (isLocked && bioEnabled && !bioTried && !bioBusy && lockScreenMode === "unlock" && !dialogState) { bioTried = true; setTimeout(bioUnlock, 250); }
};
var _lockBeforeBio = lockVault;
lockVault = function () { bioTried = false; return _lockBeforeBio.apply(this, arguments); };
/* restoring a backup replaces the data key, so the stored one would no longer fit */
var _restoreBeforeBio = commitRestore;
commitRestore = async function (parsed) { var r = await _restoreBeforeBio(parsed); if (currentWrappedDEKPassword === parsed.wrappedDEKPassword) await bioClear(); return r; };
