/* 保存: IndexedDB（使えないときは localStorage）。読み込み後はメモリ上の state を正とし、変更を非同期に書き戻す。 */
(function () {
  "use strict";
  var DB_NAME = "genai-quiz", DB_VER = 2;
  var STORES = { answers: { autoIncrement: true }, sessions: { keyPath: "id" }, scores: { keyPath: "ts" }, reviews: { keyPath: "qid" }, meta: { keyPath: "key" }, checks: { autoIncrement: true }, study: { keyPath: "key" } };
  var db = null;
  var LS_KEY = "genai-quiz-fallback";

  var state = { answers: [], sessions: [], scores: [], reviews: {}, checks: [], study: {}, settings: { includeDraft: false } };
  var READER_DEFAULT = { size: "m", font: "gothic", theme: "white" };
  function normalize() {
    state.settings.reader = Object.assign({}, READER_DEFAULT, state.settings.reader);
    if (!Array.isArray(state.checks)) state.checks = [];
    if (!state.study || typeof state.study !== "object") state.study = {};
  }

  function open() {
    return new Promise(function (resolve0) {
      var done = false;
      function resolve(v) { if (!done) { done = true; resolve0(v); } }
      setTimeout(function () { resolve(null); }, 3000); // 開けないまま固まったら localStorage に切り替える
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open(DB_NAME, DB_VER); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        var d = req.result;
        Object.keys(STORES).forEach(function (n) {
          if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, STORES[n]);
        });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }
  function getAll(name) {
    return new Promise(function (resolve) {
      try {
        var r = db.transaction(name).objectStore(name).getAll();
        r.onsuccess = function () { resolve(r.result); };
        r.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); } // ストアが無いなどの例外でも、起動を止めない
    });
  }
  function put(name, value) {
    if (!db) return lsSave();
    try { db.transaction(name, "readwrite").objectStore(name).put(value); } catch (e) { lsSave(); }
  }
  function del(name, key) {
    if (!db) return lsSave();
    try { db.transaction(name, "readwrite").objectStore(name).delete(key); } catch (e) { lsSave(); }
  }
  function clearAll() {
    if (!db) return Promise.resolve();
    return new Promise(function (resolve) {
      var names = Object.keys(STORES);
      var tx = db.transaction(names, "readwrite");
      names.forEach(function (n) { tx.objectStore(n).clear(); });
      tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
    });
  }
  function lsSave() {
    try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch (e) { /* 容量超過など */ }
  }

  var Store = {
    state: state,
    persistent: false,
    init: function () {
      return open().then(function (d) {
        db = d;
        if (!db) {
          try {
            var raw = localStorage.getItem(LS_KEY);
            if (raw) Object.assign(state, JSON.parse(raw));
          } catch (e) { /* 空で始める */ }
          normalize();
          return;
        }
        Store.persistent = true;
        return Promise.all([getAll("answers"), getAll("sessions"), getAll("scores"), getAll("reviews"), getAll("meta"), getAll("checks"), getAll("study")]).then(function (r) {
          state.answers = r[0];
          state.sessions = r[1].sort(function (a, b) { return a.ts - b.ts; });
          state.scores = r[2].sort(function (a, b) { return a.ts - b.ts; });
          state.reviews = {};
          r[3].forEach(function (x) { state.reviews[x.qid] = x; });
          r[4].forEach(function (m) { if (m.key === "settings") Object.assign(state.settings, m.value); });
          state.checks = r[5];
          state.study = {};
          r[6].forEach(function (x) { state.study[x.key] = x.value; });
          normalize();
        });
      });
    },
    addAnswer: function (a) {
      state.answers.push(a);
      if (db) { try { db.transaction("answers", "readwrite").objectStore("answers").add(a); } catch (e) { lsSave(); } } else lsSave();
    },
    addSession: function (s) { state.sessions.push(s); put("sessions", s); },
    addScore: function (s) { state.scores.push(s); put("scores", s); },
    setReview: function (qid, r) {
      if (r === null) { delete state.reviews[qid]; del("reviews", qid); }
      else if (r) { state.reviews[qid] = r; put("reviews", r); }
    },
    addCheck: function (c) {
      state.checks.push(c);
      if (db) { try { db.transaction("checks", "readwrite").objectStore("checks").add(c); } catch (e) { lsSave(); } } else lsSave();
    },
    setStudy: function (reportId, patch) {
      state.study[reportId] = Object.assign({}, state.study[reportId], patch);
      put("study", { key: reportId, value: state.study[reportId] });
    },
    saveSettings: function () { put("meta", { key: "settings", value: state.settings }); },
    exportJson: function () {
      return JSON.stringify({ app: "genai-quiz", format: 1, exported_at: new Date().toISOString(),
        answers: state.answers, sessions: state.sessions, scores: state.scores,
        reviews: Object.keys(state.reviews).map(function (k) { return state.reviews[k]; }),
        checks: state.checks, study: state.study,
        settings: state.settings }, null, 1);
    },
    importJson: function (text) {
      var d = JSON.parse(text);
      if (d.app !== "genai-quiz" || !Array.isArray(d.answers)) throw new Error("このアプリの書き出しファイルではありません");
      return clearAll().then(function () {
        state.answers = []; state.sessions = []; state.scores = []; state.reviews = {}; state.checks = []; state.study = {};
        d.answers.forEach(function (a) { Store.addAnswer(a); });
        (d.sessions || []).forEach(function (s) { Store.addSession(s); });
        (d.scores || []).forEach(function (s) { Store.addScore(s); });
        (d.reviews || []).forEach(function (r) { Store.setReview(r.qid, r); });
        (d.checks || []).forEach(function (c) { Store.addCheck(c); });
        Object.keys(d.study || {}).forEach(function (k) { Store.setStudy(k, d.study[k]); });
        Object.assign(state.settings, d.settings || {});
        normalize();
        Store.saveSettings();
      });
    },
    reset: function () {
      return clearAll().then(function () {
        state.answers = []; state.sessions = []; state.scores = []; state.reviews = {}; state.checks = []; state.study = {};
        try { localStorage.removeItem(LS_KEY); } catch (e) { /* 何もしない */ }
      });
    },
  };
  window.Store = Store;
})();
