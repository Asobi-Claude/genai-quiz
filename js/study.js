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

  /* ---------- 読む画面 ---------- */
  var SIZES = [["s", "小"], ["m", "標準"], ["l", "大"], ["xl", "特大"]];
  var FONTS = [["gothic", "ゴシック"], ["mincho", "明朝"]];
  var THEMES = [["white", "白"], ["paper", "紙"], ["dark", "黒"]];

  // レポートを「概要 → 弱点ごとの章」の通し番号の列にする
  function buildChapters(report) {
    var list = [{ kind: "overview", label: "この回のまとめ" }];
    report.topics.forEach(function (t) {
      t.chapters.forEach(function (c, i) {
        list.push({ kind: "topic", topic: t, chapter: c, first: i === 0, last: i === t.chapters.length - 1, label: c.heading });
      });
    });
    return list;
  }

  function safeSvg(svg) {
    return typeof svg === "string" && !/<script|\son\w+\s*=|javascript:/i.test(svg) ? svg : null;
  }

  function renderBlock(b) {
    var h = UI().h;
    switch (b.type) {
      case "p": return h("p", { text: b.text });
      case "callout": return h("div", { class: "callout " + (b.tone === "warn" ? "warn" : "info") }, [h("b", { text: b.title }), h("p", { text: b.text })]);
      case "list": return h(b.ordered ? "ol" : "ul", { class: "r-list" }, (b.items || []).map(function (t) { return h("li", { text: String(t) }); }));
      case "table":
        return h("div", { class: "tbl-wrap" }, h("table", { class: "r-tbl" }, [
          h("thead", null, h("tr", null, (b.head || []).map(function (t) { return h("th", { text: String(t) }); }))),
          h("tbody", null, (b.rows || []).map(function (row) { return h("tr", null, row.map(function (t) { return h("td", { text: String(t) }); })); })),
        ]));
      case "figure": {
        var svg = safeSvg(b.svg), box = h("figure", { class: "r-fig" });
        if (svg) { var w = document.createElement("div"); w.innerHTML = svg; var el = w.firstChild; if (el && el.setAttribute) { el.setAttribute("role", "img"); el.setAttribute("aria-label", b.alt || ""); box.appendChild(el); } }
        else box.appendChild(h("p", { class: "hint", text: "図：" + (b.alt || "") }));
        box.appendChild(h("figcaption", { class: "sr", text: b.alt || "" }));
        return box;
      }
      case "example": return h("div", { class: "callout example" }, [h("b", { text: b.title }), h("p", { text: b.text })]);
      default: return null;
    }
  }

  function renderChapter(report, ch) {
    var h = UI().h, catById = UI().catById, short = UI().short;
    if (ch.kind === "overview") {
      var s = report.summary, kids = [
        h("h1", { text: report.title }),
        h("p", { class: "r-lead", text: "直近" + s.n + "問（" + s.from + " 〜 " + s.to + "）・正答率 " + Math.round(s.rate * 100) + "%" + (s.previous ? "（前回 " + Math.round(s.previous.rate * 100) + "%）" : "") }),
        h("h2", { text: "この回の弱点" }),
        h("ul", { class: "r-list" }, report.topics.map(function (t) { return h("li", { text: t.title + "（誤答 " + t.stats.wrong + " / " + t.stats.n + "）" }); })),
        h("div", { class: "callout info" }, [h("b", { text: "読み方" }), h("p", { text: "弱点ごとに、つまずきの指摘、解説、確認問題の順に進みます。右下の「次の章へ」で進み、左下の「目次」で好きな章に移れます。「Aa」で文字の大きさや背景を変えられます。" })]),
      ];
      return kids;
    }
    var t = ch.topic, kids2 = [];
    if (ch.first) {
      var cat = catById[t.category_id];
      kids2.push(h("div", null, cat ? h("span", { class: "chip blue", text: short(cat) }) : null));
      kids2.push(h("h1", { text: t.title }));
      kids2.push(h("div", { class: "callout warn" }, [h("b", { text: "あなたのつまずき" }), h("p", { text: t.finding })]));
    }
    kids2.push(h("h2", { text: ch.chapter.heading }));
    ch.chapter.blocks.forEach(function (b) { var n = renderBlock(b); if (n) kids2.push(n); });
    if (ch.last && t.check && t.check.length && typeof window.Study.startCheck === "function") {
      kids2.push(h("div", { class: "r-check" }, [
        h("b", { text: "確認問題" }), h("p", { text: "読んだ内容を、" + t.check.length + "問で確かめます。点数やレベルには入りません。" }),
        h("button", { class: "btn primary", type: "button", text: "確認問題を解く", onclick: function () { window.Study.startCheck(ch.report, t); } }),
      ]));
    }
    return kids2;
  }

  function openSheet(titleText, content) {
    var h = UI().h, prev = document.activeElement;
    var dim = h("div", { class: "r-dim" });
    var sheet = h("div", { class: "r-sheet", role: "dialog", "aria-modal": "true", "aria-label": titleText }, [h("div", { class: "grab" }), h("b", { class: "r-sheet-title", text: titleText }), content]);
    function close() { dim.remove(); sheet.remove(); document.removeEventListener("keydown", onKey); if (prev && prev.focus) prev.focus(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    dim.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    var host = document.querySelector(".reader");
    host.appendChild(dim); host.appendChild(sheet);
    var f = sheet.querySelector('[aria-checked="true"], .now, button'); if (f) f.focus();
    return close;
  }

  function settingsSheet(applyAll) {
    var h = UI().h, rd = Store.state.settings.reader;
    function group(label, key, opts) {
      var btns = opts.map(function (o) {
        var b = h("button", { class: "seg-btn", type: "button", role: "radio", "aria-checked": rd[key] === o[0] ? "true" : "false", text: o[1] });
        b.addEventListener("click", function () {
          rd[key] = o[0]; Store.saveSettings(); applyAll();
          btns.forEach(function (x, i) { x.setAttribute("aria-checked", opts[i][0] === rd[key] ? "true" : "false"); });
        });
        return b;
      });
      return h("div", null, [h("div", { class: "r-sheet-sub", text: label }), h("div", { class: "seg-row", role: "radiogroup", "aria-label": label }, btns)]);
    }
    var close;
    var done = h("button", { class: "btn primary", type: "button", text: "完了", style: "margin-top:14px", onclick: function () { close(); } });
    var content = h("div", null, [group("文字の大きさ", "size", SIZES), group("書体", "font", FONTS), group("背景", "theme", THEMES), done]);
    close = openSheet("表示設定", content);
  }

  function viewReader(id) {
    var h = UI().h, L = window.Logic;
    var root = document.getElementById("app");
    loadIndex().then(function (idx) {
      var entry = idx && idx.reports.filter(function (r) { return r.id === id; })[0];
      if (!entry) { UI().toast("このレポートは見つかりませんでした"); location.hash = "#/study"; return; }
      return loadReport(entry).then(function (report) {
        report.__entry = entry;
        var chapters = buildChapters(report);
        chapters.forEach(function (c) { c.report = report; });
        var saved = Store.state.study[id] || {};
        var cur = saved.done ? 0 : L.clampChapter(saved.chapter, chapters.length);
        var rd = Store.state.settings.reader;

        var reader = h("div", { class: "reader" });
        var body = h("div", { class: "r-body", tabindex: "-1" });
        var prog = h("div", { class: "r-prog", role: "progressbar", "aria-valuemin": "1", "aria-valuemax": String(chapters.length), "aria-label": "読み進み" }, h("i"));
        var count = h("span", { class: "r-count" });
        var next = h("button", { class: "r-next", type: "button" });
        var tocBtn = h("button", { class: "r-toc", type: "button", text: "目次", onclick: function () { tocSheet(); } });

        function applyAll() {
          reader.className = "reader theme-" + rd.theme + " size-" + rd.size + " font-" + rd.font;
          document.body.style.background = rd.theme === "dark" ? "#14161F" : rd.theme === "paper" ? "#F6EFE0" : "#fff";
        }
        function show(i, scroll) {
          cur = L.clampChapter(i, chapters.length);
          var ch = chapters[cur];
          body.replaceChildren(h("article", { class: "r-art" }, renderChapter(report, ch)));
          prog.setAttribute("aria-valuenow", String(cur + 1));
          prog.firstChild.style.width = ((cur + 1) / chapters.length * 100) + "%";
          count.textContent = (cur + 1) + " / " + chapters.length;
          var lastCh = cur === chapters.length - 1;
          next.textContent = lastCh ? "読み終える" : "次の章へ";
          Store.setStudy(id, { chapter: cur, total: chapters.length, updated: Date.now() }); // done は読み終えたときだけ true にし、ここでは触らない
          if (scroll !== false) body.scrollTop = 0;
        }
        function tocSheet() {
          var close;
          var list = h("ul", { class: "r-tocl" }, chapters.map(function (c, i) {
            var t = c.kind === "topic" && c.first ? c.topic.title + "：" : "";
            return h("li", null, h("button", { type: "button", class: i === cur ? "now" : "", "aria-current": i === cur ? "true" : null, onclick: function () { close(); show(i); } }, [
              h("span", { text: (i + 1) + ". " + t + c.label }), h("span", { class: "sm", text: i < cur ? "済" : i === cur ? "いまここ" : "" }),
            ]));
          }));
          close = openSheet("目次", list);
        }
        next.addEventListener("click", function () {
          if (cur === chapters.length - 1) { Store.setStudy(id, { done: true, chapter: cur, total: chapters.length, updated: Date.now() }); location.hash = "#/study"; }
          else show(cur + 1);
        });

        var top = h("div", { class: "r-top" }, [
          h("a", { class: "r-x", href: "#/study", "aria-label": "閉じる", text: "✕" }), prog,
          h("button", { class: "r-aa", type: "button", "aria-label": "表示設定", text: "Aa", onclick: function () { settingsSheet(applyAll); } }),
        ]);
        reader.appendChild(top); reader.appendChild(body);
        reader.appendChild(h("div", { class: "r-bar" }, [tocBtn, count, next]));
        applyAll();
        UI().mount(reader, {});
        show(cur, false);
      });
    }).catch(function () {
      UI().toast("レポートを読み込めませんでした");
      location.hash = "#/study";
    });
  }

  // 弱点ごとの確認問題を出題する（回答は checks にだけ保存され、点数・復習には入らない）
  function startCheck(report, topic) {
    var items = topic.check.map(function (q) { return { q: q, review: false }; });
    UI().begin(items, { mode: "check", reportId: report.id, topicId: topic.id, returnHash: "#/study/" + report.id });
  }

  window.Study = {
    startCheck: startCheck,
    preload: loadIndex, hasNew: hasNew, viewList: viewList, viewReader: viewReader,
    _loadReport: loadReport,
    _entry: function (id) { return index && index.reports.filter(function (r) { return r.id === id; })[0]; },
  };
})();
