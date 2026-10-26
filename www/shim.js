/* Phone shim: replaces the laptop (Tauri) backend with on-phone storage.
   Vault = encrypted JSON in IndexedDB (localStorage fallback). Nothing leaves the phone. */
(function () {
  var DB = "yourledger", STORE = "kv", KEY = "vault";
  function openDB() {
    return new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error("no idb"));
      var r = indexedDB.open(DB, 1);
      r.onupgradeneeded = function () { r.result.createObjectStore(STORE); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }
  async function idbGet() {
    var db = await openDB();
    return new Promise(function (res, rej) {
      var q = db.transaction(STORE).objectStore(STORE).get(KEY);
      q.onsuccess = function () { res(q.result === undefined ? null : q.result); };
      q.onerror = function () { rej(q.error); };
    });
  }
  async function idbSet(v) {
    var db = await openDB();
    return new Promise(function (res, rej) {
      var tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(v, KEY);
      tx.oncomplete = function () { res(); };
      tx.onerror = function () { rej(tx.error); };
    });
  }
  async function idbGetKey(k) { try { var db = await openDB(); return await new Promise(function (res, rej) { var q = db.transaction(STORE).objectStore(STORE).get(k); q.onsuccess = function () { res(q.result === undefined ? null : q.result); }; q.onerror = function () { rej(q.error); }; }); } catch (e) { return null; } }
  async function idbSetKey(k, v) { var db = await openDB(); return new Promise(function (res, rej) { var tx = db.transaction(STORE, "readwrite"); if (v === null) tx.objectStore(STORE).delete(k); else tx.objectStore(STORE).put(v, k); tx.oncomplete = function () { res(); }; tx.onerror = function () { rej(tx.error); }; }); }
  async function clearAll() {
    try { var db = await openDB(); await new Promise(function (res) { var tx = db.transaction(STORE, "readwrite"); tx.objectStore(STORE).clear(); tx.oncomplete = res; tx.onerror = res; }); } catch (e) {}
    try { localStorage.removeItem("yourledger_vault"); } catch (e) {}
  }
  async function readVault() {
    try { var v = await idbGet(); if (v) return v; } catch (e) {}
    try { return localStorage.getItem("yourledger_vault"); } catch (e) { return null; }
  }
  async function writeVault(content) {
    try { await idbSet(content); try { localStorage.setItem("yourledger_vault", content); } catch (e) {} return; }
    catch (e) { localStorage.setItem("yourledger_vault", content); }
  }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}

  function cap(name) { return window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins[name]; }
  async function saveFile(args) {
    var name = args.defaultName, content = args.content;
    var FS = cap("Filesystem"), Share = cap("Share");
    if (FS && Share) {
      var w = await FS.writeFile({ path: name, data: content, directory: "CACHE", encoding: "utf8" });
      await Share.share({ title: name, text: name, url: w.uri, dialogTitle: "Save / send " + name });
      return "Shared via the share sheet — choose Files / Drive / WhatsApp";
    }
    var type = /\.csv$/i.test(name) ? "text/csv" : "application/json";
    var blob = new Blob([content], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    return "Downloads folder";
  }
  async function notify(args) {
    try {
      var LN = cap("LocalNotifications");
      if (LN) {
        await LN.requestPermissions();
        await LN.schedule({ notifications: [{ id: Math.floor(Date.now() % 2147483000), title: args.title, body: args.body }] });
      } else if (window.Notification && Notification.permission === "granted") new Notification(args.title, { body: args.body });
    } catch (e) {}
  }
  var cmds = {
    read_vault: readVault,
    write_vault: function (a) { return writeVault(a.content); },
    vault_file_path: function () { return "Stored privately inside this app on your phone"; },
    set_autostart: function () { return true; },
    get_autostart: function () { return false; },
    show_notification: notify,
    save_file_dialog: saveFile,
    read_wipe: function () { return idbGetKey("wipe"); },
    write_wipe: function (a) { return idbSetKey("wipe", a.content); },
    read_kv: function (a) { return idbGetKey(a.key); },
    write_kv: function (a) { return idbSetKey(a.key, a.content); },
    clear_all: clearAll
  };
  window.__TAURI__ = {
    core: { invoke: function (c, a) { return Promise.resolve().then(function () { return cmds[c](a || {}); }); } },
    event: { listen: function () {} }
  };
  window.LEDGER_MOBILE = true;
  // Lock when the app has been in the background for over 60 seconds
  var hiddenAt = 0;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt > 60000 && typeof isLocked !== "undefined" && !isLocked) { try { lockVault(); } catch (e) {} }
    hiddenAt = 0;
  });
  // Daily 9 PM "log today's expenses" reminder (needs the Android build)
  async function scheduleDaily() {
    var LN = cap("LocalNotifications"); if (!LN) return;
    try {
      var p = await LN.requestPermissions(); if (p.display !== "granted") return;
      await LN.cancel({ notifications: [{ id: 9001 }] });
      await LN.schedule({ notifications: [{ id: 9001, title: "Paisa Diary", body: "Did you log today's income & expenses?", schedule: { on: { hour: 21, minute: 0 }, allowWhileIdle: true } }] });
    } catch (e) {}
  }
  window.addEventListener("load", function () { setTimeout(scheduleDaily, 1500); });
})();
