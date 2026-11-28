/* 採点・レベル判定・出題・復習の純粋関数（DOM・保存に依存しない） */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var WEIGHTS = { 1: 20, 2: 35, 3: 45 };
  var WINDOW = 20; // 難易度ごとに直近20回答
  var MIN_DENOM = 5; // 正答率の分母の下限
  var JUDGE_MIN = 10; // 分類の回答がこの数に満たなければ「判定中」
  var LEVEL_MIN = [0, 0, 25, 45, 65, 85]; // index = レベル。Lv1 は 0 点から
  var DEMOTE_MARGIN = 5;
  var REVIEW_DAYS = [1, 3, 7];
  var GRADUATE_STREAK = 3;
  var REVIEW_MAX_PER_SESSION = 4;
  // レベル別の難易度比率（用語:原理:判断）。index 0 は判定中
  var RATIOS = [
    [4, 4, 2],
    [5, 4, 1],
    [3, 5, 2],
    [2, 4, 4],
    [1, 3, 6],
    [1, 2, 7],
  ];

  function pad(n) {
    return n < 10 ? "0" + n : "" + n;
  }
  function dateStr(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function addDays(ds, n) {
    var p = ds.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2] + n);
    return dateStr(d);
  }
  function daysBetween(a, b) {
    var pa = a.split("-"), pb = b.split("-");
    var da = Date.UTC(+pa[0], +pa[1] - 1, +pa[2]);
    var db = Date.UTC(+pb[0], +pb[1] - 1, +pb[2]);
    return Math.round((db - da) / 86400000);
  }

  /* answers: [{qid, difficulty, correct, ts}]（古い→新しい順）。
     戻り値: {score, rates:{1,2,3}, count} */
  function computeScore(answers) {
    var by = { 1: [], 2: [], 3: [] };
    answers.forEach(function (a) {
      if (by[a.difficulty]) by[a.difficulty].push(a);
    });
    var score = 0;
    var rates = {};
    [1, 2, 3].forEach(function (d) {
      var list = by[d].slice(-WINDOW);
      var ok = list.filter(function (a) { return a.correct; }).length;
      var rate = ok / Math.max(list.length, MIN_DENOM);
      rates[d] = rate;
      score += WEIGHTS[d] * rate;
    });
    return { score: Math.round(score * 10) / 10, rates: rates, count: answers.length };
  }

  function levelFromScore(score) {
    var lv = 1;
    for (var i = 2; i <= 5; i++) if (score >= LEVEL_MIN[i]) lv = i;
    return lv;
  }

  /* 昇格は即時、降格は現レベルの下限 − 5 点以下になったときだけ。
     回答数が10未満なら 0（判定中）。 */
  function nextLevel(prevLevel, score, count) {
    if (count < JUDGE_MIN) return 0;
    var target = levelFromScore(score);
    if (!prevLevel) return target;
    if (target >= prevLevel) return target;
    if (score <= LEVEL_MIN[prevLevel] - DEMOTE_MARGIN) return target;
    return prevLevel;
  }

  /* 復習スケジュール更新。review: {qid, step, streak, due} または undefined。
     戻り値: 新しい review、卒業なら null。 */
  function updateReview(review, correct, unsure, qid, today) {
    if (!correct) {
      return { qid: qid, step: 0, streak: 0, due: addDays(today, REVIEW_DAYS[0]) };
    }
    if (!review) {
      if (unsure) return { qid: qid, step: 0, streak: 0, due: addDays(today, REVIEW_DAYS[0]) };
      return undefined;
    }
    var streak = review.streak + 1;
    if (streak >= GRADUATE_STREAK) return null;
    var step = Math.min(review.step + 1, REVIEW_DAYS.length - 1);
    return { qid: qid, step: step, streak: streak, due: addDays(today, REVIEW_DAYS[step]) };
  }

  function dueReviews(reviews, today) {
    return Object.keys(reviews)
      .map(function (k) { return reviews[k]; })
      .filter(function (r) { return r.due <= today; })
      .sort(function (a, b) { return a.due < b.due ? -1 : a.due > b.due ? 1 : 0; });
  }

  function shuffle(arr, rnd) {
    rnd = rnd || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* 重み付きで難易度を1つ選ぶ（ratio=[w1,w2,w3]、available=選べる難易度の集合） */
  function pickDifficulty(ratio, available, rnd) {
    var total = 0;
    [1, 2, 3].forEach(function (d) { if (available[d]) total += ratio[d - 1]; });
    if (total <= 0) return null;
    var r = rnd() * total;
    for (var d = 1; d <= 3; d++) {
      if (!available[d]) continue;
      r -= ratio[d - 1];
      if (r < 0) return d;
    }
    for (d = 3; d >= 1; d--) if (available[d]) return d;
    return null;
  }

  /* セッションの出題を作る。
     opts: {
       pool: 出題可能な問題の配列,
       total: 問数, categoryIds: 対象分類（均等割り）, levels: {cid: level},
       dueIds: 復習期限の問題ID（古い順）, lastSeen: {qid: ts},
       subtopicIds: 指定すると、その小項目だけから出題,
       rnd: 乱数
     }
     戻り値: [{q, review:boolean}] */
  function buildSession(opts) {
    var rnd = opts.rnd || Math.random;
    var total = opts.total;
    var cats = opts.categoryIds;
    var lastSeen = opts.lastSeen || {};
    var byId = {};
    opts.pool.forEach(function (q) { byId[q.id] = q; });
    var chosen = [];
    var used = {};
    var perCat = {};
    cats.forEach(function (c) { perCat[c] = 0; });
    var usedSub = {};

    // 1) 復習（期限の来たもの、最大4問、小項目指定のときは対象小項目のみ）
    var subSet = null;
    if (opts.subtopicIds) {
      subSet = {};
      opts.subtopicIds.forEach(function (s) { subSet[s] = true; });
    }
    var reviewCap = Math.min(REVIEW_MAX_PER_SESSION, Math.floor(total / 2));
    (opts.dueIds || []).forEach(function (id) {
      if (chosen.length >= reviewCap) return;
      var q = byId[id];
      if (!q || used[id]) return;
      if (cats.indexOf(q.category_id) < 0) return;
      if (subSet && !subSet[q.subtopic_id]) return;
      chosen.push({ q: q, review: true });
      used[id] = true;
      perCat[q.category_id]++;
      usedSub[q.subtopic_id] = (usedSub[q.subtopic_id] || 0) + 1;
    });

    // 2) 分類ごとの不足分を、レベル別の難易度比率で補う
    var quota = Math.ceil(total / cats.length);
    function candidates(cid) {
      return opts.pool.filter(function (q) {
        if (used[q.id] || q.category_id !== cid) return false;
        if (subSet && !subSet[q.subtopic_id]) return false;
        return true;
      });
    }
    function pickOne(cid) {
      var cand = candidates(cid);
      if (!cand.length) return null;
      var level = (opts.levels && opts.levels[cid]) || 0;
      var ratio = RATIOS[level] || RATIOS[0];
      var byDiff = { 1: [], 2: [], 3: [] };
      cand.forEach(function (q) { byDiff[q.difficulty].push(q); });
      var avail = {};
      [1, 2, 3].forEach(function (d) { if (byDiff[d].length) avail[d] = true; });
      var d = pickDifficulty(ratio, avail, rnd);
      if (!d) return null;
      var list = shuffle(byDiff[d], rnd);
      // 未出題を優先、次に最後に出した時刻が古いもの。同じ小項目は後回し。
      list.sort(function (a, b) {
        var sa = usedSub[a.subtopic_id] || 0, sb = usedSub[b.subtopic_id] || 0;
        if (sa !== sb) return sa - sb;
        return (lastSeen[a.id] || 0) - (lastSeen[b.id] || 0);
      });
      return list[0];
    }
    var guard = 0;
    while (chosen.length < total && guard++ < total * 20) {
      // 不足の大きい分類から順に1問ずつ
      var order = shuffle(cats, rnd).sort(function (a, b) { return perCat[a] - perCat[b]; });
      var picked = false;
      for (var i = 0; i < order.length; i++) {
        var cid = order[i];
        if (perCat[cid] >= quota && order.some(function (c) { return perCat[c] < quota && candidates(c).length; })) continue;
        var q = pickOne(cid);
        if (!q) continue;
        chosen.push({ q: q, review: false });
        used[q.id] = true;
        perCat[cid]++;
        usedSub[q.subtopic_id] = (usedSub[q.subtopic_id] || 0) + 1;
        picked = true;
        break;
      }
      if (!picked) break;
    }
    return shuffle(chosen, rnd);
  }

  /* 苦手な小項目: 回答2件以上で、正答率の低い順。 */
  function weakSubtopics(answers, questionsById, limit) {
    var stat = {};
    answers.forEach(function (a) {
      var q = questionsById[a.qid];
      if (!q) return;
      var s = stat[q.subtopic_id] || (stat[q.subtopic_id] = { id: q.subtopic_id, n: 0, ok: 0 });
      s.n++;
      if (a.correct) s.ok++;
    });
    return Object.keys(stat)
      .map(function (k) { return stat[k]; })
      .filter(function (s) { return s.n >= 2; })
      .map(function (s) { s.rate = s.ok / s.n; return s; })
      .sort(function (a, b) { return a.rate - b.rate || b.n - a.n; })
      .slice(0, limit || 5);
  }

  /* 日付の配列（YYYY-MM-DD）から、今日（または昨日）までの連続日数 */
  function streakDays(dates, today) {
    var set = {};
    dates.forEach(function (d) { set[d] = true; });
    var cur = set[today] ? today : addDays(today, -1);
    var n = 0;
    while (set[cur]) { n++; cur = addDays(cur, -1); }
    return n;
  }

  /* 分析用の書き出し。直近 n 件（版が現行と違う回答は除く）。個人を特定する情報は入れない。 */
  function buildAnalysisExport(answers, questionsById, reviews, opts) {
    opts = opts || {};
    var n = opts.n || 100;
    var now = opts.now || Date.now();
    var valid = answers.filter(function (a) {
      var q = questionsById[a.qid];
      return q && q.version === a.version;
    }).sort(function (a, b) { return a.ts - b.ts; }).slice(-n);
    var out = valid.map(function (a) {
      return {
        qid: a.qid, category_id: a.category_id, subtopic_id: a.subtopic_id, difficulty: a.difficulty,
        correct: !!a.correct, unsure: !!a.unsure, chosen: typeof a.chosen === "number" ? a.chosen : null,
        version: a.version, ts: a.ts, date: a.date,
      };
    });
    return {
      app: "genai-quiz-analysis", format: 1, exported_at: new Date(now).toISOString(),
      window: { n: n, from: out.length ? out[0].date : null, to: out.length ? out[out.length - 1].date : null },
      answers: out, reviews: reviews || [],
    };
  }

  /* 読みかけの章番号を、現在の章数に収める */
  function clampChapter(index, count) {
    var i = Math.floor(Number(index) || 0);
    return Math.max(0, Math.min(i, Math.max(count - 1, 0)));
  }

  return {
    buildAnalysisExport: buildAnalysisExport, clampChapter: clampChapter,
    WEIGHTS: WEIGHTS, WINDOW: WINDOW, LEVEL_MIN: LEVEL_MIN, RATIOS: RATIOS,
    REVIEW_DAYS: REVIEW_DAYS, JUDGE_MIN: JUDGE_MIN,
    dateStr: dateStr, addDays: addDays, daysBetween: daysBetween,
    computeScore: computeScore, levelFromScore: levelFromScore, nextLevel: nextLevel,
    updateReview: updateReview, dueReviews: dueReviews,
    shuffle: shuffle, buildSession: buildSession,
    weakSubtopics: weakSubtopics, streakDays: streakDays,
  };
});
