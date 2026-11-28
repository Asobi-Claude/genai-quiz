(function () {
  "use strict";
  var L = window.Logic, Store = window.Store, D = window.QUIZ_DATA;
  var root = document.getElementById("app");

  var cats = D.categories;
  var catById = {}; cats.forEach(function (c) { catById[c.id] = c; });
  var subById = {}; D.subtopics.forEach(function (s) { subById[s.id] = s; });
  var qById = {}; D.questions.forEach(function (q) { qById[q.id] = q; });
  var DIFF = { 1: "用語", 2: "原理", 3: "判断" };
  var KEYS = ["A", "B", "C", "D"];

  var S = { session: null, result: null, base: "prev", range: "30", series: { all: true }, comp: "prev" };

  /* ---------- 小道具 ---------- */
  function h(tag, attrs, kids) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids || []).forEach(function (c) {
      if (c == null || c === false) return;
      el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return el;
  }
  function svgEl(html, cls, viewBox, label) {
    var d = document.createElement("div");
    d.innerHTML = '<svg class="' + cls + '" viewBox="' + viewBox + '" role="img" aria-label="' + label + '" xmlns="http://www.w3.org/2000/svg">' + html + "</svg>";
    return d.firstChild;
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function today() { return L.dateStr(new Date()); }
  function lvLabel(lv) { return lv ? "Lv" + lv : "判定中"; }
  function short(c) { return c.short_name || c.name; }
  function mount(nodes, opts) {
    opts = opts || {};
    document.body.style.background = ""; // 読む画面の背景テーマを戻す
    root.className = "app" + (opts.nav ? "" : " no-nav");
    root.replaceChildren.apply(root, [].concat(nodes, opts.nav ? [navBar(opts.nav)] : []).filter(Boolean));
    window.scrollTo(0, 0);
  }
  function toast(msg) {
    var t = h("div", { class: "toast", role: "status", text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2600);
  }
  function ask(msg, okLabel, cancelLabel, danger) {
    return new Promise(function (resolve) {
      var prev = document.activeElement;
      var ok = h("button", { class: "btn primary" + (danger ? " danger" : ""), text: okLabel });
      var no = h("button", { class: "btn ghost", text: cancelLabel || "キャンセル" });
      var m = h("div", { class: "modal", role: "dialog", "aria-modal": "true" }, h("div", { class: "box" }, [h("p", { text: msg }), h("div", { class: "acts" }, [ok, no])]));
      function close(v) { m.remove(); if (prev && prev.focus) prev.focus(); resolve(v); }
      ok.addEventListener("click", function () { close(true); });
      no.addEventListener("click", function () { close(false); });
      m.addEventListener("keydown", function (e) { if (e.key === "Escape") close(false); });
      document.body.appendChild(m);
      no.focus();
    });
  }

  /* ---------- データ ---------- */
  function pool() {
    var inc = Store.state.settings.includeDraft;
    return D.questions.filter(function (q) { return q.status === "reviewed" || (inc && q.status === "draft"); });
  }
  // 問題の版が変わった回答はスコアから除く
  function validAnswers() {
    return Store.state.answers.filter(function (a) {
      var q = qById[a.qid];
      return q && q.version === a.version;
    });
  }
  function catAnswers(cid, answers) {
    return answers.filter(function (a) { return a.category_id === cid; });
  }
  function liveStats() {
    var all = validAnswers();
    var out = {};
    cats.forEach(function (c) { out[c.id] = L.computeScore(catAnswers(c.id, all)); });
    return out;
  }
  function lastSnap() { var s = Store.state.scores; return s.length ? s[s.length - 1] : null; }
  function snapBefore(ts) {
    var s = Store.state.scores, r = null;
    for (var i = 0; i < s.length; i++) if (s[i].ts <= ts) r = s[i];
    return r;
  }
  function baselineSnap(kind, curSnap) {
    var s = Store.state.scores;
    if (!curSnap) return null;
    if (kind === "prev") {
      var i = s.indexOf(curSnap);
      return i > 0 ? s[i - 1] : null;
    }
    var days = kind === "week" ? 7 : 30;
    return snapBefore(curSnap.ts - days * 86400000) === curSnap ? null : snapBefore(curSnap.ts - days * 86400000);
  }
  function snapLevel(snap, cid) { return snap && snap.cats[cid] ? snap.cats[cid].level : 0; }
  function snapScore(snap, cid) { return snap && snap.cats[cid] ? snap.cats[cid].score : 0; }

  /* ---------- レーダー ---------- */
  function radar(cur, base, label) {
    var cx = 150, cy = 150, R = 110, n = cats.length;
    function pt(i, v) {
      var a = (-90 + i * 360 / n) * Math.PI / 180;
      return [cx + R * v / 100 * Math.cos(a), cy + R * v / 100 * Math.sin(a)];
    }
    function poly(vals) { return vals.map(function (v, i) { return pt(i, v).map(function (x) { return x.toFixed(1); }).join(","); }).join(" "); }
    var s = "";
    [25, 50, 75, 100].forEach(function (r) {
      s += '<polygon points="' + poly(cats.map(function () { return r; })) + '" fill="none" stroke="#E3E6EE" stroke-width="1"/>';
    });
    cats.forEach(function (c, i) {
      var p = pt(i, 100);
      s += '<line x1="150" y1="150" x2="' + p[0].toFixed(1) + '" y2="' + p[1].toFixed(1) + '" stroke="#E3E6EE"/>';
    });
    if (base) s += '<polygon points="' + poly(cats.map(function (c) { return snapScore(base, c.id); })) + '" fill="none" stroke="#8A90A2" stroke-width="1.6" stroke-dasharray="4 3"/>';
    if (cur) s += '<polygon points="' + poly(cats.map(function (c) { return snapScore(cur, c.id); })) + '" fill="#2E54D6" fill-opacity=".22" stroke="#2E54D6" stroke-width="2" stroke-linejoin="round"/>';
    cats.forEach(function (c, i) {
      var a = (-90 + i * 360 / n) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
      var x = cx + (R + 14) * ca, y = cy + (R + 14) * sa;
      var anchor = ca > 0.3 ? "start" : ca < -0.3 ? "end" : "middle";
      var ty = sa > 0.3 ? y + 8 : sa < -0.3 ? y - 14 : y - 6;
      var lv = snapLevel(cur, c.id), bl = snapLevel(base, c.id), d = "", cls = "#5A6072";
      if (cur && base && lv && bl && lv !== bl) { d = lv > bl ? " ▲" + (lv - bl) : " ▼" + (bl - lv); cls = lv > bl ? "#2E54D6" : "#C2571A"; }
      s += '<text x="' + x.toFixed(1) + '" y="' + ty.toFixed(1) + '" text-anchor="' + anchor + '" font-size="11.5" fill="#1B1E2B" font-weight="500">' + esc(short(c)) + "</text>";
      s += '<text x="' + x.toFixed(1) + '" y="' + (ty + 14).toFixed(1) + '" text-anchor="' + anchor + '" font-size="11" fill="' + cls + '" font-weight="700">' + (cur ? lvLabel(lv) : "—") + d + "</text>";
    });
    return svgEl(s, "radar", "-70 0 440 300", label);
  }

  /* ---------- ナビ ---------- */
  var ICONS = {
    home: '<path d="M4 11l8-7 8 7v8a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    chart: '<path d="M5 20V10M12 20V4M19 20v-7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    review: '<path d="M20 12a8 8 0 1 1-2.5-5.8M20 4v5h-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
    study: '<path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v15H5.5A1.5 1.5 0 0 0 4 20.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v15h5.5a1.5 1.5 0 0 1 1.5 1.5z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>',
    gear: '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  };
  function icon(name) { var d = document.createElement("div"); d.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + ICONS[name] + "</svg>"; return d.firstChild; }
  function navBar(cur) {
    var due = L.dueReviews(Store.state.reviews, today()).length;
    function item(id, label, ic) {
      var a = h("a", { href: "#/" + id, "aria-current": cur === id ? "page" : null }, [icon(ic), label]);
      if (id === "review" && due) a.appendChild(h("span", { class: "dot", text: String(due), "aria-label": "復習 " + due + "問" }));
      if (id === "study" && window.Study && window.Study.hasNew()) a.appendChild(h("span", { class: "dot new", "aria-label": "新しいレポートがあります" }));
      return h("li", null, a);
    }
    return h("nav", { class: "nav", "aria-label": "メイン" }, h("ul", null, [item("home", "ホーム", "home"), item("analysis", "分析", "chart"), item("review", "復習", "review"), item("study", "学習", "study")]));
  }

  /* ---------- ホーム ---------- */
  function viewHome() {
    var snap = lastSnap();
    var dates = Store.state.sessions.map(function (s) { return s.date; });
    var streak = L.streakDays(dates, today());
    var hr = new Date().getHours();
    var greet = hr < 11 ? "おはようございます" : hr < 18 ? "こんにちは" : "こんばんは";
    var base = baselineSnap(S.comp, snap);
    var due = L.dueReviews(Store.state.reviews, today());
    var weak = L.weakSubtopics(validAnswers(), qById, 3).map(function (w) { return subById[w.id] ? subById[w.id].name : ""; }).filter(Boolean);

    var kinds = [["prev", "前回"], ["week", "1週間前"], ["month", "1か月前"]];
    var seg = h("div", { class: "seg", role: "group", "aria-label": "比較する時点" }, kinds.map(function (k) {
      return h("button", { class: "chip", type: "button", "aria-pressed": S.comp === k[0] ? "true" : "false", text: k[1], onclick: function () { S.comp = k[0]; viewHome(); } });
    }));
    var judging = !snap;
    var cardKids = [
      h("div", { class: "head" }, [h("h2", { text: "分類別レベル" }), seg]),
      radar(snap, base, "分類別の得点レーダー"),
      h("div", { class: "legend" }, [h("span", null, [h("i"), base ? kinds.filter(function (k) { return k[0] === S.comp; })[0][1] : "比較なし"]), h("span", null, [h("i", { class: "now" }), "今回"])]),
    ];
    if (judging) cardKids.push(h("p", { class: "hint", text: "1セッション終えると、分類ごとのレベルが表示されます。" }));
    else if (!base) cardKids.push(h("p", { class: "hint", text: "比べられる記録がまだありません。" }));

    var reviewCard = h("div", { class: "card review-card" }, [
      h("div", { class: "txt" }, [
        h("h2", { text: "今日の復習" }),
        h("div", { class: "big", text: due.length + "問" }),
        h("div", { class: "weak", text: due.length ? (weak.length ? "苦手：" + weak.join("、") : "忘れかけた頃の問題です") : "期限の来た問題はありません" }),
      ]),
      h("button", { class: "btn primary small", type: "button", text: "復習する", disabled: due.length ? null : true, onclick: startReview }),
    ]);

    var nPool = pool().length;
    mount([
      h("header", { class: "top" }, [
        h("div", { class: "brand" }, [svgEl(LOGO_SVG, "logo", "0 0 96 96", "生成AIクイズのロゴ"), h("div", null, [h("p", { class: "sub", text: greet }), h("h1", { text: "生成AIクイズ" })])]),
        h("div", { style: "display:flex;align-items:center;gap:6px" }, [
          h("span", { class: "chip blue", text: "連続 " + streak + "日" }),
          h("a", { class: "icon-btn", href: "#/settings", "aria-label": "設定" }, icon("gear")),
        ]),
      ]),
      h("section", { class: "card", "aria-label": "分類別レベル" }, cardKids),
      reviewCard,
      h("div", { class: "stack" }, [
        h("button", { class: "btn primary", type: "button", onclick: function () { startNormal(12); } }, ["12問に挑戦する", h("span", { class: "sub", text: "約8分" })]),
        h("button", { class: "btn", type: "button", onclick: function () { startNormal(6); } }, ["6問だけ", h("span", { class: "sub", text: "約4分" })]),
        h("button", { class: "btn ghost", type: "button", onclick: viewPick }, "分類を選ぶ"),
      ]),
      nPool < 12 ? h("p", { class: "hint", text: "出題できる問題が少ないため、設定を確認してください。" }) : null,
    ], { nav: "home" });
  }

  function viewPick() {
    var st = liveStats();
    var snap = lastSnap();
    var pl = pool();
    mount([
      h("header", { class: "top" }, [h("h1", { text: "分類を選ぶ", style: "font-size:20px" }), h("a", { class: "btn small ghost", href: "#/home", text: "戻る" })]),
      h("p", { class: "hint", text: "選んだ分類から12問を出題します。" }),
      h("div", { class: "card" }, h("ul", { class: "list" }, cats.map(function (c) {
        var n = pl.filter(function (q) { return q.category_id === c.id; }).length;
        return h("li", null, h("button", { class: "row", type: "button", onclick: function () { startSession({ categoryIds: [c.id], total: 12, label: short(c) }); } }, [
          h("span", null, [h("span", { text: c.name }), h("br"), h("span", { class: "hint", text: n + "問から出題" })]),
          h("span", { class: "lv" + (snapLevel(snap, c.id) ? "" : " judge"), text: lvLabel(snapLevel(snap, c.id)) + (st[c.id].count ? "" : "") }),
        ]));
      }))),
    ], { nav: "home" });
  }

  /* ---------- セッション ---------- */
  function lastSeenMap() {
    var m = {};
    Store.state.answers.forEach(function (a) { m[a.qid] = Math.max(m[a.qid] || 0, a.ts); });
    return m;
  }
  function levelsMap() {
    var snap = lastSnap(), m = {};
    cats.forEach(function (c) { m[c.id] = snapLevel(snap, c.id); });
    return m;
  }
  function startNormal(total) { startSession({ categoryIds: cats.map(function (c) { return c.id; }), total: total, withReview: true }); }
  function startSession(o) {
    var due = o.withReview ? L.dueReviews(Store.state.reviews, today()).map(function (r) { return r.qid; }) : [];
    var items = L.buildSession({ pool: pool(), total: o.total, categoryIds: o.categoryIds, levels: levelsMap(), dueIds: due, lastSeen: lastSeenMap(), subtopicIds: o.subtopicIds });
    begin(items, o);
  }
  function startReview() {
    var due = L.dueReviews(Store.state.reviews, today());
    var p = {}; pool().forEach(function (q) { p[q.id] = q; });
    var items = L.shuffle(due.map(function (r) { return p[r.qid]; }).filter(Boolean).slice(0, 12)).map(function (q) { return { q: q, review: true }; });
    begin(items, { mode: "review" });
  }
  function begin(items, o) {
    if (!items.length) { toast("出題できる問題がありません"); return; }
    items.forEach(function (it) { it.perm = L.shuffle([0, 1, 2, 3]); });
    S.session = { items: items, idx: 0, startedAt: Date.now(), results: [], mode: o.mode || "normal", sel: null, unsure: false, answered: false,
      reportId: o.reportId, topicId: o.topicId, returnHash: o.returnHash };
    history.pushState({ quiz: true }, "", "#/quiz");
    viewQuestion();
  }
  function endSession() { S.session = null; }

  function qHeader(sess) {
    var n = sess.items.length, shown = sess.idx + (sess.answered ? 1 : 0);
    return h("div", { class: "qtop" }, [
      h("button", { class: "icon-btn", type: "button", "aria-label": "中断する", onclick: interrupt }, svgEl('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/>', "", "0 0 24 24", "")),
      h("div", { class: "bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(n), "aria-valuenow": String(shown), "aria-label": "進み具合" }, h("i", { style: "width:" + (shown / n * 100) + "%" })),
      h("div", { class: "count", text: (sess.idx + 1) + " / " + n }),
    ]);
  }
  function qChips(it) {
    var q = it.q;
    var kids = [h("span", { class: "chip blue", text: short(catById[q.category_id]) }), h("span", { class: "chip", text: DIFF[q.difficulty] })];
    if (it.review) kids.push(h("span", { class: "chip orange", text: "復習" }));
    (q.tags || []).slice(0, 2).forEach(function (t) { kids.push(h("span", { class: "chip", text: t })); });
    return h("div", { class: "chips" }, kids);
  }

  function viewQuestion() {
    var sess = S.session; if (!sess) return viewHome();
    var it = sess.items[sess.idx], q = it.q;
    sess.sel = null; sess.unsure = false; sess.answered = false;
    var submit = h("button", { class: "btn primary", type: "button", text: "回答する", disabled: true, onclick: submitAnswer });
    var btns = it.perm.map(function (orig, pos) {
      var b = h("button", { class: "choice", type: "button", role: "radio", "aria-checked": "false" }, [h("span", { class: "k", text: KEYS[pos] }), h("span", { class: "t", text: q.choices[orig] })]);
      b.addEventListener("click", function () {
        sess.sel = pos;
        btns.forEach(function (x, i) { x.setAttribute("aria-checked", i === pos ? "true" : "false"); });
        submit.disabled = false;
      });
      return b;
    });
    var cb = h("input", { type: "checkbox", id: "unsure", onchange: function (e) { sess.unsure = e.target.checked; } });
    mount([
      qHeader(sess), qChips(it),
      h("h1", { class: "q", text: q.question }),
      h("div", { class: "choices", role: "radiogroup", "aria-label": "選択肢" }, btns.map(function (b) { return h("div", null, b); })),
      sess.mode === "check" ? null : h("label", { class: "unsure", for: "unsure" }, [cb, "自信がない（正解でも復習に加える）"]),
      h("div", { class: "footer" }, submit),
    ]);
  }

  function submitAnswer() {
    var sess = S.session; if (!sess || sess.sel == null || sess.answered) return;
    var it = sess.items[sess.idx], q = it.q;
    var chosenOrig = it.perm[sess.sel];
    var correct = chosenOrig === q.answer;
    var t = Date.now(), td = today();
    sess.answered = true;
    if (sess.mode === "check") {
      Store.addCheck({ reportId: sess.reportId, topicId: sess.topicId, qid: q.id, correct: correct, chosen: chosenOrig, ts: t, date: td });
      sess.results.push({ qid: q.id, correct: correct, category_id: q.category_id });
      viewFeedback(chosenOrig, correct, null);
      return;
    }
    Store.addAnswer({ qid: q.id, category_id: q.category_id, subtopic_id: q.subtopic_id, difficulty: q.difficulty, correct: correct, unsure: sess.unsure, chosen: chosenOrig, version: q.version, ts: t, date: td });
    var prev = Store.state.reviews[q.id];
    var nr = L.updateReview(prev, correct, sess.unsure, q.id, td);
    if (nr !== undefined) Store.setReview(q.id, nr);
    var note = null;
    if (nr === null) note = "3回続けて正解したので、復習から外れました";
    else if (nr && (!correct || (!prev))) note = "1日後の復習に追加しました";
    else if (nr && prev) note = L.REVIEW_DAYS[nr.step] + "日後にもう一度出題します";
    sess.results.push({ qid: q.id, correct: correct, category_id: q.category_id });
    viewFeedback(chosenOrig, correct, note);
  }

  var LOGO_SVG = '<rect width="96" height="96" rx="22" fill="#2E54D6"/><g fill="none" stroke="#fff" stroke-width="4"><rect x="18" y="18" width="27" height="27" rx="7"/><rect x="18" y="51" width="27" height="27" rx="7"/><rect x="51" y="51" width="27" height="27" rx="7"/></g><rect x="51" y="18" width="27" height="27" rx="7" fill="#fff"/><path d="M57 32l6 6 10-12" stroke="#2E54D6" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  var OK_SVG ='<circle cx="12" cy="12" r="10" fill="#2E54D6"/><path d="M7 12.5l3.2 3.2L17 9" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
  var NG_SVG = '<circle cx="12" cy="12" r="10" fill="#C2571A"/><path d="M8 8l8 8M16 8l-8 8" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>';

  function viewFeedback(chosenOrig, correct, note) {
    var sess = S.session, it = sess.items[sess.idx], q = it.q;
    var last = sess.idx === sess.items.length - 1;
    var rows = it.perm.map(function (orig, pos) {
      var cls = "choice", tag = null;
      if (orig === q.answer) { cls += " correct"; tag = "正解"; }
      else if (orig === chosenOrig) { cls += " wrong"; tag = "あなたの回答"; }
      return h("div", null, h("div", { class: cls }, [h("span", { class: "k", text: KEYS[pos] }), h("span", { class: "t", text: q.choices[orig] }), tag ? h("span", { class: "tag", text: tag }) : null]));
    });
    var expl = [h("p", { text: q.explanation })];
    if (q.source) expl.push(h("p", { class: "src", text: "出典：" + q.source }));
    mount([
      qHeader(sess), qChips(it),
      h("p", { class: "q small", text: q.question }),
      h("div", { class: "choices" }, rows),
      h("section", { class: "sheet " + (correct ? "ok" : "ng"), "aria-label": "解説" }, [
        h("div", { class: "verdict " + (correct ? "ok" : "ng"), role: "status" }, [svgEl(correct ? OK_SVG : NG_SVG, "", "0 0 24 24", ""), correct ? "正解" : "不正解"]),
        h("div", { class: "expl sheet-body" }, expl.concat(note ? [h("div", { class: "note", text: note })] : [])),
        h("button", { class: "btn primary", type: "button", text: last ? "結果を見る" : "次の問題へ", onclick: function () { if (last) finish(); else { sess.idx++; viewQuestion(); } } }),
      ]),
    ]);
    root.classList.add("has-sheet");
    var f = root.querySelector(".sheet .btn"); if (f) f.focus({ preventScroll: true });
  }

  function interrupt() {
    var back = (S.session && S.session.returnHash) || "#/home";
    var msg = S.session && S.session.mode === "check" ? "確認問題を中断して、レポートに戻りますか？" : "ここまでの回答は記録されます。クイズを中断しますか？";
    ask(msg, "中断する", "続ける", true).then(function (ok) {
      if (!ok) return;
      endSession();
      location.hash = back;
      if (location.hash === back) route();
    });
  }

  // 確認問題の結果。scores・sessions には書かない。
  function finishCheck() {
    var sess = S.session;
    var okN = sess.results.filter(function (r) { return r.correct; }).length, total = sess.results.length, back = sess.returnHash || "#/home";
    endSession();
    mount([
      h("header", { class: "top" }, h("h1", { text: "確認問題の結果" })),
      h("section", { class: "score", "aria-label": "正解数" }, [h("div", { class: "disc" }, [h("div", { class: "num", html: okN + "<small>/ " + total + "</small>" }), h("div", { class: "hint", text: "正解" })])]),
      h("p", { class: "hint", style: "text-align:center", text: "確認問題は、レベルの点数には入りません。" }),
      h("div", { class: "stack" }, h("a", { class: "btn primary", href: back, text: "レポートに戻る" })),
    ]);
  }

  function finish() {
    if (S.session && S.session.mode === "check") return finishCheck();
    var sess = S.session;
    var ts = Date.now(), td = today();
    var all = validAnswers();
    var prevSnap = lastSnap();
    var snap = { ts: ts, date: td, cats: {} };
    var totalScore = 0;
    cats.forEach(function (c) {
      var r = L.computeScore(catAnswers(c.id, all));
      var lv = L.nextLevel(snapLevel(prevSnap, c.id), r.score, r.count);
      snap.cats[c.id] = { score: r.score, level: lv, count: r.count };
      totalScore += r.score;
    });
    snap.overall = Math.round(totalScore / cats.length * 10) / 10;
    Store.addScore(snap);
    var correctN = sess.results.filter(function (r) { return r.correct; }).length;
    var rec = { id: "s" + ts, ts: ts, date: td, total: sess.results.length, correct: correctN, seconds: Math.round((ts - sess.startedAt) / 1000), mode: sess.mode, results: sess.results.map(function (r) { return { qid: r.qid, correct: r.correct }; }) };
    Store.addSession(rec);
    S.result = { rec: rec, snap: snap, prev: prevSnap, items: sess.items };
    endSession();
    history.replaceState({}, "", "#/result");
    viewResult();
  }

  /* ---------- 結果 ---------- */
  function fmtTime(sec) { return Math.floor(sec / 60) + "分" + (sec % 60 < 10 ? "0" : "") + (sec % 60) + "秒"; }
  function viewResult() {
    var R = S.result; if (!R) return viewHome();
    var rec = R.rec, snap = R.snap, prev = R.prev;
    var ups = [], downs = [];
    cats.forEach(function (c) {
      var a = snapLevel(prev, c.id), b = snapLevel(snap, c.id);
      if (a && b > a) ups.push(c); else if (a && b && b < a) downs.push(c);
    });
    var catRows = cats.map(function (c) {
      var rs = rec.results.map(function (r) { return { r: r, q: qById[r.qid] }; }).filter(function (x) { return x.q && x.q.category_id === c.id; });
      if (!rs.length) return null;
      var a = snapLevel(prev, c.id), b = snapLevel(snap, c.id), d = "";
      if (a && b && a !== b) d = b > a ? h("span", { class: "up", text: " ▲" + (b - a) }) : h("span", { class: "down", text: " ▼" + (a - b) });
      return h("tr", null, [
        h("td", { text: short(c) }),
        h("td", null, h("span", { class: "mark" }, rs.map(function (x) { return h("span", { class: "mark " + (x.r.correct ? "o" : "x"), text: x.r.correct ? "○" : "×", "aria-label": x.r.correct ? "正解" : "不正解" }); }))),
        h("td", { class: "n" }, [lvLabel(b), d]),
      ]);
    });
    var kids = [
      h("header", { class: "top" }, h("h1", { text: "おつかれさまでした" })),
      h("p", { class: "hint", style: "margin-top:-4px", text: rec.total + "問・" + fmtTime(rec.seconds) }),
      h("section", { class: "score", "aria-label": "正解数" }, [h("div", { class: "disc" }, [h("div", { class: "num", html: rec.correct + "<small>/ " + rec.total + "</small>" }), h("div", { class: "hint", text: "正解" })])]),
    ];
    ups.forEach(function (c) {
      kids.push(h("section", { class: "card levelup", role: "status" }, h("div", { class: "row" }, [h("span", { text: "▲" }), short(c) + " が " + lvLabel(snapLevel(prev, c.id)) + " から " + lvLabel(snapLevel(snap, c.id)) + " に上がりました"])));
    });
    downs.forEach(function (c) {
      kids.push(h("section", { class: "card levelup down", role: "status" }, h("div", { class: "row" }, [h("span", { text: "▼" }), short(c) + " が " + lvLabel(snapLevel(prev, c.id)) + " から " + lvLabel(snapLevel(snap, c.id)) + " に下がりました"])));
    });
    kids.push(h("section", { class: "card", "aria-label": "前回との比較" }, [
      h("h2", { text: "前回との比較" }), radar(snap, prev, "前回と今回のレーダー"),
      h("div", { class: "legend" }, [h("span", null, [h("i"), prev ? "前回" : "比較なし"]), h("span", null, [h("i", { class: "now" }), "今回"])]),
    ]));
    kids.push(h("section", { class: "card", "aria-label": "分類別の結果" }, [
      h("h2", { text: "分類別" }),
      h("table", { class: "t" }, [h("thead", null, h("tr", null, [h("th", { text: "分類" }), h("th", { text: "結果" }), h("th", { class: "n", text: "レベル" })])), h("tbody", null, catRows)]),
    ]));
    var wrongs = rec.results.filter(function (r) { return !r.correct; });
    var stack = [];
    if (wrongs.length) {
      stack.push(h("button", { class: "btn", type: "button", text: "間違えた" + wrongs.length + "問の解説を見る", onclick: function () { viewWrongs(wrongs); } }));
    }
    stack.push(h("button", { class: "btn primary", type: "button", text: "もう一度", onclick: function () { startNormal(rec.total >= 12 ? 12 : 6); } }));
    stack.push(h("a", { class: "btn ghost", href: "#/home", text: "ホームへ" }));
    kids.push(h("div", { class: "stack" }, stack));
    mount(kids);
  }
  function viewWrongs(wrongs) {
    var det = wrongs.map(function (w) {
      var q = qById[w.qid];
      return h("details", { class: "wrong" }, [
        h("summary", { text: q.question }),
        h("div", { class: "body" }, [h("p", { class: "a", text: "正解：" + q.choices[q.answer] }), h("p", { text: q.explanation, style: "margin-top:6px" })]),
      ]);
    });
    mount([
      h("header", { class: "top" }, [h("h1", { text: "間違えた問題", style: "font-size:20px" }), h("button", { class: "btn small ghost", type: "button", text: "結果に戻る", onclick: viewResult })]),
      h("section", { class: "card" }, det),
    ]);
  }

  /* ---------- 分析 ---------- */
  var PALETTE = ["#2E54D6", "#C2571A", "#1E8E6B", "#8A4FD0", "#B8860B", "#D1457D", "#5A6072"];
  function viewAnalysis() {
    var all = validAnswers();
    var nAns = all.length, ok = all.filter(function (a) { return a.correct; }).length;
    var touched = {}; all.forEach(function (a) { touched[a.qid] = 1; });
    var nPool = pool().length;
    var tcount = Object.keys(touched).length;
    var stats = h("div", { class: "stats" }, [
      stat(nAns, "累計解答"), stat(nAns ? Math.round(ok / nAns * 100) + "%" : "—", "正答率"), stat(nPool ? Math.round(tcount / nPool * 100) + "%" : "—", "触れた問題"),
    ]);

    // 推移
    var series = [{ id: "all", name: "総合", get: function (s) { return s.overall; } }].concat(cats.map(function (c) { return { id: c.id, name: short(c), get: function (s) { return s.cats[c.id] ? s.cats[c.id].score : null; } }; }));
    var ranges = [["7", "7日"], ["30", "30日"], ["all", "全期間"]];
    var chips = h("div", { class: "seg", style: "margin-top:8px", role: "group", "aria-label": "表示する系列" }, series.map(function (s, i) {
      return h("button", { class: "chip", type: "button", "aria-pressed": S.series[s.id] ? "true" : "false", text: s.name, onclick: function () { if (S.series[s.id]) delete S.series[s.id]; else S.series[s.id] = true; viewAnalysis(); } });
    }));
    var rangeSeg = h("div", { class: "seg", role: "group", "aria-label": "期間" }, ranges.map(function (r) {
      return h("button", { class: "chip", type: "button", "aria-pressed": S.range === r[0] ? "true" : "false", text: r[1], onclick: function () { S.range = r[0]; viewAnalysis(); } });
    }));
    var snaps = Store.state.scores;
    if (S.range !== "all") { var cut = Date.now() - +S.range * 86400000; snaps = snaps.filter(function (s) { return s.ts >= cut; }); }
    var chart;
    if (snaps.length < 1) chart = h("p", { class: "empty", text: "セッションを終えると、ここに推移が表示されます。" });
    else chart = trendChart(snaps, series);
    var trend = h("section", { class: "card", "aria-label": "スコア推移" }, [h("div", { class: "head" }, [h("h2", { text: "スコア推移" }), rangeSeg]), chips, chart]);

    // 苦手
    var weak = L.weakSubtopics(all, qById, 5);
    var weakCard = h("section", { class: "card", "aria-label": "苦手な小項目" }, [h("h2", { text: "苦手な小項目", style: "margin-bottom:4px" })]);
    if (!weak.length) weakCard.appendChild(h("p", { class: "empty", text: "回答が増えると、苦手な小項目が表示されます。" }));
    else {
      weak.forEach(function (w) {
        var st = subById[w.id];
        weakCard.appendChild(h("div", { class: "weak-row" }, [
          h("div", { class: "l" }, [h("span", { text: st.name }), h("span", { text: Math.round(w.rate * 100) + "%（" + w.ok + "/" + w.n + "）" })]),
          h("div", { class: "b" }, h("i", { style: "width:" + Math.max(3, Math.round(w.rate * 100)) + "%" })),
          h("div", { class: "c", text: short(catById[st.category_id]) }),
        ]));
      });
      weakCard.appendChild(h("div", { class: "stack" }, h("button", { class: "btn", type: "button", text: "苦手な小項目だけで出題", onclick: function () {
        startSession({ categoryIds: cats.map(function (c) { return c.id; }), total: 12, subtopicIds: weak.map(function (w) { return w.id; }) });
      } })));
    }
    var streak = L.streakDays(Store.state.sessions.map(function (s) { return s.date; }), today());
    mount([
      h("header", { class: "top" }, h("h1", { text: "分析", style: "font-size:24px" })),
      stats,
      h("p", { class: "hint", style: "margin-top:8px", text: "連続 " + streak + "日・セッション " + Store.state.sessions.length + "回" }),
      trend, weakCard,
    ], { nav: "analysis" });
  }
  function stat(v, l) { return h("div", { class: "stat" }, [h("b", { text: String(v) }), h("span", { text: l })]); }

  function trendChart(snaps, series) {
    var W = 340, H = 190, pl = 30, pr = 10, pt = 10, pb = 24;
    var t0 = snaps[0].ts, t1 = snaps[snaps.length - 1].ts;
    function X(i, ts) { return snaps.length === 1 ? pl + (W - pl - pr) / 2 : pl + (W - pl - pr) * (ts - t0) / Math.max(1, t1 - t0); }
    function Y(v) { return pt + (H - pt - pb) * (1 - v / 100); }
    var s = "";
    [0, 25, 50, 75, 100].forEach(function (v) {
      s += '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + Y(v) + '" y2="' + Y(v) + '" stroke="#E3E6EE"/><text x="' + (pl - 6) + '" y="' + (Y(v) + 4) + '" font-size="10" fill="#5A6072" text-anchor="end">' + v + "</text>";
    });
    function dl(ts) { var d = new Date(ts); return (d.getMonth() + 1) + "/" + d.getDate(); }
    s += '<text x="' + pl + '" y="' + (H - 6) + '" font-size="10" fill="#5A6072">' + dl(t0) + '</text><text x="' + (W - pr) + '" y="' + (H - 6) + '" font-size="10" fill="#5A6072" text-anchor="end">' + dl(t1) + "</text>";
    var active = series.filter(function (x) { return S.series[x.id]; });
    active.forEach(function (sr, k) {
      var color = PALETTE[series.indexOf(sr) % PALETTE.length];
      var pts = snaps.map(function (sn, i) { var v = sr.get(sn); return v == null ? null : [X(i, sn.ts), Y(v), v]; }).filter(Boolean);
      if (pts.length > 1) s += '<polyline points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"' + (sr.id === "all" ? "" : "") + "/>";
      pts.forEach(function (p) { s += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3" fill="' + color + '"/>'; });
    });
    var label = "スコア推移。" + active.map(function (sr) { var last = sr.get(snaps[snaps.length - 1]); return sr.name + "は最新" + (last == null ? "なし" : Math.round(last) + "点"); }).join("、");
    var el = svgEl(s, "chart", "0 0 " + W + " " + H, label);
    if (!active.length) return h("p", { class: "empty", text: "表示する系列を選んでください。" });
    return el;
  }

  /* ---------- 復習 ---------- */
  function viewReview() {
    var reviews = Object.keys(Store.state.reviews).map(function (k) { return Store.state.reviews[k]; });
    var td = today();
    var due = L.dueReviews(Store.state.reviews, td);
    var future = reviews.filter(function (r) { return r.due > td; });
    var groups = {};
    future.forEach(function (r) { var d = L.daysBetween(td, r.due); var k = d === 1 ? "明日" : d <= 7 ? d + "日後" : "8日以降"; groups[k] = (groups[k] || 0) + 1; });
    var order = ["明日", "2日後", "3日後", "4日後", "5日後", "6日後", "7日後", "8日以降"].filter(function (k) { return groups[k]; });
    var kids = [
      h("header", { class: "top" }, h("h1", { text: "復習", style: "font-size:24px" })),
      h("section", { class: "card review-card" }, [
        h("div", { class: "txt" }, [h("h2", { text: "今日の復習" }), h("div", { class: "big", text: due.length + "問" }), h("div", { class: "weak", text: "復習中は全部で " + reviews.length + "問" })]),
        h("button", { class: "btn primary small", type: "button", text: "復習する", disabled: due.length ? null : true, onclick: startReview }),
      ]),
    ];
    var card = h("section", { class: "card", "aria-label": "復習の予定" }, [h("h2", { text: "これからの予定" })]);
    if (!order.length) card.appendChild(h("p", { class: "empty", text: reviews.length ? "今日の分で全部です。" : "間違えた問題や、自信がないと印を付けた問題がここに並びます。" }));
    else card.appendChild(h("ul", { class: "list" }, order.map(function (k) { return h("li", null, [h("span", { text: k }), h("span", { class: "lv", text: groups[k] + "問" })]); })));
    kids.push(card);
    kids.push(h("p", { class: "hint", style: "margin-top:12px", text: "復習は1日後、3日後、7日後の順に出ます。間違えると1日後に戻り、3回続けて正解すると卒業します。" }));
    mount(kids, { nav: "review" });
  }

  /* ---------- 設定 ---------- */
  function viewSettings() {
    var cb = h("input", { type: "checkbox", id: "inc", onchange: function (e) {
      Store.state.settings.includeDraft = e.target.checked; Store.saveSettings();
      toast(e.target.checked ? "確認前の問題も出題します" : "確認済みの問題だけ出題します");
    } });
    cb.checked = !!Store.state.settings.includeDraft;
    var file = h("input", { type: "file", accept: "application/json,.json", class: "sr", id: "imp", onchange: function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        ask("いまの記録は上書きされます。読み込みますか？", "読み込む", "キャンセル", true).then(function (ok) {
          if (!ok) return;
          Store.importJson(rd.result).then(function () { toast("読み込みました"); viewSettings(); }, function (err) { toast(err.message); });
        });
      };
      rd.readAsText(f);
    } });
    var nRev = D.questions.filter(function (q) { return q.status === "reviewed"; }).length;
    mount([
      h("header", { class: "top" }, [h("h1", { text: "設定", style: "font-size:24px" }), h("a", { class: "btn small ghost", href: "#/home", text: "戻る" })]),
      h("section", { class: "card" }, [
        h("label", { class: "switch", for: "inc" }, [h("span", { text: "確認前の問題も出題する" }), cb]),
        h("p", { class: "hint", text: "確認済み " + nRev + "問のほか、確認前の " + (D.questions.length - nRev) + "問を含めます。" }),
      ]),
      analysisCard(),
      h("section", { class: "card" }, [
        h("h2", { text: "記録のバックアップ" }),
        h("p", { class: "hint", text: "記録はこの端末のブラウザに保存されます。機種変更の前に書き出してください。" }),
        h("div", { class: "stack" }, [
          h("button", { class: "btn", type: "button", text: "記録を書き出す", onclick: exportData }),
          h("label", { class: "btn", for: "imp", tabindex: "0", role: "button", text: "記録を読み込む", onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); file.click(); } } }),
          file,
          h("button", { class: "btn danger", type: "button", text: "記録をすべて消す", onclick: function () {
            ask("回答履歴と復習予定をすべて消します。元に戻せません。", "消す", "キャンセル", true).then(function (ok) { if (ok) Store.reset().then(function () { toast("消しました"); viewSettings(); }); });
          } }),
        ]),
        Store.persistent ? null : h("p", { class: "hint", text: "このブラウザでは保存領域が使えないため、簡易保存になっています。" }),
      ]),
      h("p", { class: "hint", style: "margin-top:12px", text: "問題データ：" + D.questions.length + "問・" + D.built_at + " 作成" }),
    ], { nav: "home" });
  }
  function download(text, filename) {
    var blob = new Blob([text], { type: "application/json" });
    var a = h("a", { href: URL.createObjectURL(blob), download: filename });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function exportData() {
    download(Store.exportJson(), "genai-quiz-" + today() + ".json");
    toast("書き出しました");
  }

  // 学習レポートを作るための、分析用の書き出し（直近100問）
  function analysisExport() {
    return L.buildAnalysisExport(Store.state.answers, qById, Object.keys(Store.state.reviews).map(function (k) { return Store.state.reviews[k]; }), { n: 100 });
  }
  // 共有メニューに渡す。ファイル名に日時（時分）を入れ、同じ日に何度送っても重ならないようにする。
  function analysisFileName() {
    var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; };
    return "genai-quiz-analysis-" + today() + "-" + p(d.getHours()) + p(d.getMinutes()) + ".json";
  }
  function canShareFiles() {
    try {
      return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [new File(["{}"], "x.json", { type: "application/json" })] }));
    } catch (e) { return false; }
  }
  function shareAnalysis() {
    var file = new File([JSON.stringify(analysisExport(), null, 1)], analysisFileName(), { type: "application/json" });
    navigator.share({ files: [file], title: "生成AIクイズ 分析用データ" }).catch(function (e) {
      if (e && e.name === "AbortError") return; // 利用者が共有をやめた
      toast("共有できませんでした。「分析用データを書き出す」を使ってください");
    });
  }
  function analysisCard() {
    var ex = analysisExport(), n = ex.answers.length;
    var send = canShareFiles() ? h("button", { class: "btn primary", type: "button", text: "分析用データを送る", disabled: n ? null : true, onclick: shareAnalysis }) : null;
    var btn = h("button", { class: "btn", type: "button", text: "分析用データを書き出す", disabled: n ? null : true, onclick: function () {
      download(JSON.stringify(analysisExport(), null, 1), "genai-quiz-analysis-" + today() + ".json");
      toast("書き出しました");
    } });
    return h("section", { class: "card" }, [
      h("h2", { text: "学習レポートの材料" }),
      h("p", { class: "hint", text: "直近の回答（選んだ選択肢つき）を、パソコンに渡します。「送る」で共有メニューが開くので、Google Drive を選んで保存してください。" }),
      h("div", { class: "stack" }, [send, btn]),
      h("p", { class: "hint", text: n ? "直近" + n + "問を書き出します。" : "まだ回答がありません。クイズを解くと書き出せます。" }),
    ]);
  }

  /* ---------- ルーティング ---------- */
  function route() {
    var hash = location.hash || "#/home";
    if (S.session && hash !== "#/quiz") {
      // 戻る操作などで出題画面を離れようとした
      history.pushState({ quiz: true }, "", "#/quiz");
      interrupt();
      return;
    }
    if (hash === "#/quiz") { if (S.session) return; hash = "#/home"; history.replaceState({}, "", hash); }
    if (hash === "#/result") return S.result ? viewResult() : (history.replaceState({}, "", "#/home"), viewHome());
    if (hash === "#/analysis") return viewAnalysis();
    if (hash === "#/review") return viewReview();
    if (hash === "#/settings") return viewSettings();
    if (hash === "#/study") return window.Study.viewList();
    if (hash.indexOf("#/study/") === 0) return window.Study.viewReader(decodeURIComponent(hash.slice(8)));
    return viewHome();
  }
  window.addEventListener("hashchange", route);
  window.addEventListener("popstate", function () { if (S.session) route(); });

  // 開いているタブを保ったまま、ナビだけを作り直す（新着の印を後から出すため）
  function refreshNav() {
    var old = root.querySelector(".nav");
    if (!old) return;
    var cur = (location.hash.match(/^#\/(home|analysis|review|study)/) || [null, "home"])[1];
    old.replaceWith(navBar(cur));
  }
  window.UI = { h: h, svgEl: svgEl, esc: esc, mount: mount, toast: toast, ask: ask, icon: icon, short: short, catById: catById, begin: begin, refreshNav: refreshNav };

  Store.init().then(function () {
    route();
    window.Study.preload().then(refreshNav);
    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) navigator.serviceWorker.register("sw.js").catch(function () {});
  });
  window.__quiz = { S: S, Store: Store };
})();
