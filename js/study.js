/* 学習タブ: レポートの一覧と読む画面。UI の小道具は app.js が window.UI で公開する。 */
(function () {
  "use strict";
  var Store = window.Store;
  var index = null; // content/index.json の中身（取れなければ null）
  var reports = {}; // id -> Promise<report>

  function UI() { return window.UI; }

  function loadIndex() {
    return fetch("content/index.json", { cache: "no-cache" })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (j) { index = j && Array.isArray(j.reports) ? j : null; return index; })
      .catch(function () { index = null; return null; });
  }
  function loadReport(entry) {
    if (!reports[entry.id]) {
      reports[entry.id] = fetch("content/" + (entry.file || entry.id + ".json"))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .catch(function (e) { delete reports[entry.id]; throw e; });
    }
    return reports[entry.id];
  }
  function hasNew() {
    return !!(index && index.reports.some(function (r) { return !Store.state.study[r.id]; }));
  }
  function statusOf(entry) {
    var s = Store.state.study[entry.id];
    if (!s) return { key: "new", label: "新着" };
    if (s.done) return { key: "done", label: "読了" };
    var pct = s.total ? Math.round(Math.min(s.chapter, s.total) / s.total * 100) : 0;
    return { key: "reading", label: "読みかけ " + pct + "%" };
  }

  function reportCard(entry) {
    var h = UI().h, st = statusOf(entry);
    return h("a", { class: "card study-card" + (st.key === "new" ? " study-new" : ""), href: "#/study/" + entry.id }, [
      h("div", { class: "study-head" }, [
        h("span", { class: "chip " + (st.key === "new" ? "blue" : st.key === "reading" ? "orange" : ""), text: st.label }),
        h("span", { class: "sm", text: entry.created }),
      ]),
      h("h2", { class: "study-title", text: entry.title }),
      h("div", { class: "study-meta" }, [
        h("span", { text: "直近" + entry.n + "問" }), h("span", { text: "正答率 " + Math.round(entry.rate * 100) + "%" }),
        h("span", { text: "弱点 " + entry.topics }), h("span", { text: "約" + entry.minutes + "分" }),
      ]),
    ]);
  }

  function weakMini(entry, host) {
    var h = UI().h, catById = UI().catById, short = UI().short;
    loadReport(entry).then(function (r) {
      host.replaceChildren.apply(host, r.topics.map(function (t) {
        var rate = t.stats.n ? Math.round(t.stats.wrong / t.stats.n * 100) : 0;
        var c = catById[t.category_id];
        return h("div", { class: "card weak-mini" }, [
          h("div", { class: "l" }, [h("span", { text: t.title }), h("span", { class: "sm", text: "×" + t.stats.wrong + "/" + t.stats.n })]),
          h("div", { class: "b" }, h("i", { style: "width:" + Math.max(4, rate) + "%" })),
          c ? h("span", { class: "chip", text: short(c) }) : null,
        ]);
      }));
    }, function () {
      host.replaceChildren(h("p", { class: "hint", text: "弱点の一覧を読み込めませんでした。" }));
    });
  }

  function viewList() {
    var h = UI().h;
    var head = h("header", { class: "top" }, h("h1", { text: "学習", style: "font-size:24px" }));
    var body = h("div", { class: "study-list" }, h("p", { class: "empty", text: "読み込み中…" }));
    UI().mount([head, body], { nav: "study" });
    loadIndex().then(function (idx) {
      if (!document.body.contains(body)) return; // 画面が切り替わっていた
      if (!idx) {
        body.replaceChildren(h("p", { class: "empty", text: "ネットワークに接続して開き直してください。" }));
        return;
      }
      if (!idx.reports.length) {
        body.replaceChildren(h("p", { class: "empty", text: "まだレポートはありません。回答がたまったら、分析用データを書き出して作ります。" }));
        return;
      }
      var kids = idx.reports.map(reportCard);
      var weakHost = h("div", { class: "weak-host" });
      kids.splice(1, 0, h("h2", { class: "study-sub", text: "最新のレポートの弱点" }), weakHost);
      body.replaceChildren.apply(body, kids);
      weakMini(idx.reports[0], weakHost);
      UI().refreshNav();
    });
  }

  function viewReader(id) {
    // Task 5 で実装する。いまは一覧に戻す。
    location.hash = "#/study";
  }

  window.Study = {
    preload: loadIndex, hasNew: hasNew, viewList: viewList, viewReader: viewReader,
    _loadReport: loadReport,
    _entry: function (id) { return index && index.reports.filter(function (r) { return r.id === id; })[0]; },
  };
})();
