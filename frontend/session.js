// warm-up deliberately aims below the steady target so the session starts easy
const etarget = (p) => {
  const ts = p.tags.map((t) => TR[t]).filter((v) => v != null);
  return (ts.length ? mean(ts) : D.rating) + opt.st + Z.delta -
    (Z.warm ? 150 : 0);
};

const predict = (p) =>
  mean(
    p.tags.length
      ? p.tags.map((t) =>
        1 / (1 + Math.pow(10, (p.rating - (TR[t] ?? D.rating)) / 400))
      )
      : [1 / (1 + Math.pow(10, (p.rating - D.rating) / 400))],
  );

function recommend(exclude) {
  const ok = (p) =>
    !D.solved.has(key(p)) && !exclude.has(key(p)) &&
    (!sel.size || p.tags.some((t) => sel.has(t)));
  let c = [];
  // widen the rating window until there is a real choice left to rank
  for (const w of [100, 300, 600, 1000]) {
    c = D.problems.filter((p) => ok(p) && Math.abs(p.rating - etarget(p)) <= w);
    if (c.length >= 10) break;
  }
  const sc = c.map((p) => {
    const w = p.tags.length ? mean(p.tags.map((t) => D.tagW[t] ?? .5)) : .3;
    // the random term keeps the same problem from winning on every run
    const s = -Math.abs(p.rating - etarget(p)) / 100 + 1.6 * w +
      .35 * Math.log10(p.sc + 10) +
      (D.tried[key(p)] ? .6 : 0) +
      Math.random() * .8;
    return { p, s };
  }).sort((a, b) => b.s - a.s);
  return sc.length ? sc[0].p : null;
}

// 10 minutes at rating 800, four minutes more per 100 rating
const base = (r) => (10 + Math.max(0, r - 800) / 100 * 4) * 60;

let PACE = 1;
const expected = (r) => base(r) * PACE;

function paceF() {
  const a = ls("ff_pace", []);
  if (a.length < 4) return 1;
  const rs = a.map((x) => x.t / base(x.r)).sort((x, y) => x - y);
  const m = rs[Math.floor(rs.length / 2)];
  // median of the actual over expected times, so expectations follow real speed
  return Math.max(.5, Math.min(2, 1 + (m - 1) * Math.min(1, a.length / 12)));
}

function startZen(carry) {
  const dur = opt.dur * 60;
  PACE = paceF();
  Z = {
    end: Date.now() + dur * 1000,
    dur,
    start: Date.now(),
    delta: carry ? carry.delta : 0,
    warm: !carry && !!opt.warm,
    log: [],
    seen: new Set(),
    cur: null,
    done: 0,
    rem: new Set(),
    paused: 0,
    celeq: null,
    celeRun: 0,
    tr0: { ...TR },
    cum: 0,
    tk: "",
  };
  show("zen");
  liveBase();
  carry ? open(carry.p, carry, carry.rep) : next();
  timer = setInterval(tick, 250);
  poll = setInterval(check, 6000);
  lastSec = -1;
  tick();
}

const dueReps = () =>
  Object.values(ls("ff_rep", {}))
    .filter((x) => x.due <= Date.now() && !Z.seen.has(x.cid + x.idx))
    .sort((a, b) => a.due - b.due);

function next() {
  if (!Z || Z.done) return;
  let p = null, rep = false;
  // every third slot is a spaced repetition, so reviews interleave with new problems
  if (Z.log.length % 3 === 2) {
    const d = dueReps();
    if (d.length) {
      const x = d[0];
      rep = true;
      p = D.problems.find((q) => key(q) === x.cid + x.idx) ||
        {
          contestId: x.cid,
          index: x.idx,
          name: x.name,
          rating: x.rating,
          tags: x.tags,
          sc: 0,
        };
    }
  }
  if (!p) p = recommend(Z.seen);
  if (!p) {
    finish();
    return;
  }
  open(p, null, rep);
}

function open(p, k, rep) {
  Z.seen.add(key(p));
  const now = Date.now();
  Z.cur = {
    p,
    since: k ? k.since : now,
    t0: now,
    sub: k ? k.sub : {},
    warned: 0,
    rep: !!rep,
    carried: !!k,
    pred: predict(p),
  };
  $("plink").innerHTML = esc(p.name) + "<small>" + p.rating +
    (rep ? " review" : "") + "</small>";
  $("plink").href =
    `https://codeforces.com/problemset/problem/${p.contestId}/${p.index}`;
  anim($("plink"), "pop");
  anim($("ptime"), "pop");
  const lc = $("livecur");
  // the bar jumps back to zero without sliding there
  lc.style.transition = "none";
  lc.style.width = "0";
  void lc.offsetWidth;
  lc.style.transition = "";
  $("zs").textContent = Z.log.filter((l) => l.result === "AC").length;
  pw();
  ticksCur();
  lastSec = -1;
}

const wrongN = (c) => Object.values(c.sub).filter((x) => !x.ok).length;

function pw() {
  const c = Z.cur, n = c ? wrongN(c) : 0;
  $("pw").textContent = n ? n + " wrong" : "";
}

// a segment of one problem on the live bar: solid until the first submission,
// hatched afterwards; pieces thinner than 0.3% would be invisible anyway
function segS(l) {
  const f = l.first, t = Math.max(l.time, 1);
  if (f == null) return '<span class="sg" style="flex:1 1 0"></span>';
  let h = "";
  if (f >= .3) h += `<span class="sg" style="flex:${f} 1 0"></span>`;
  if (t - f >= .3) h += `<span class="sg db" style="flex:${t - f} 1 0"></span>`;
  return h || '<span class="sg" style="flex:1 1 0"></span>';
}

function liveBase() {
  let cum = 0, tk = "";
  $("livedone").innerHTML = Z.log.map((l) => {
    l.marks.forEach((m) =>
      tk += `<i style="left:${100 * (cum + m) / Z.dur}%"></i>`
    );
    cum += l.time;
    return `<span class="pw" style="width:${100 * l.time / Z.dur}%">${
      segS(l)
    }</span>`;
  }).join("");
  Z.cum = cum;
  Z.tk = tk;
  ticksCur();
}

function ticksCur() {
  const c = Z.cur;
  let h = Z.tk || "";
  if (c) {
    Object.values(c.sub).filter((x) => !x.ok).forEach((x) => {
      h += `<i style="left:${
        100 * ((Z.cum || 0) + Math.max(0, (x.at - c.t0) / 1000)) / Z.dur
      }%"></i>`;
    });
  }
  $("liveticks").innerHTML = h;
}

function liveCur(now) {
  const c = Z.cur, el = $("livecur");
  if (!c) {
    el.style.width = "0";
    el.innerHTML = "";
    return;
  }
  const e = (now - c.t0) / 1000;
  const ats = Object.values(c.sub).map((x) => x.at);
  const f = ats.length
    ? Math.min(e, Math.max(0, (Math.min(...ats) - c.t0) / 1000))
    : null;
  el.style.width = (100 * e / Z.dur) + "%";
  el.innerHTML = segS({ first: f, time: e });
}

function record(result, endTs) {
  const c = Z.cur, now = Date.now(), p = c.p;
  const end = result === "AC" && endTs
    ? Math.max(c.t0 + 1000, Math.min(now, endTs))
    : now;
  const t = (end - c.t0) / 1000;
  const exp = expected(p.rating);
  const subs = Object.values(c.sub);
  const wrong = subs.filter((x) => !x.ok).length;
  const first = subs.length
    ? Math.min(
      t,
      Math.max(0, (Math.min(...subs.map((x) => x.at)) - c.t0) / 1000),
    )
    : null;
  const marks = subs.filter((x) => !x.ok).map((x) =>
    Math.min(t, Math.max(0, (x.at - c.t0) / 1000))
  );
  if (result === "AC") {
    D.solved.add(key(p));
    Z.delta += t < exp * .6 ? 100 : t < exp * 1.2 ? 50 : 0;
  } else if (result === "SKIP") Z.delta -= 100;
  if (result !== "OPEN") {
    // the delta steers the next target difficulty; rounding and clamping keep one
    // lucky solve from swinging the whole session
    Z.delta = Math.max(-400, Math.min(600, Math.round(Z.delta / 50) * 50));
    Z.warm = false;
    const out = result === "AC" ? (wrong ? .8 : 1) : 0;
    // Elo-style update per tag, a solve with wrong answers counts as a partial success
    p.tags.forEach((g) => {
      const r0 = TR[g] ?? D.rating;
      const pe = 1 / (1 + Math.pow(10, (p.rating - r0) / 400));
      TR[g] = r0 + 24 * (out - pe);
    });
    lsSet("ff_tr", TR);
    {
      const PR = ls("ff_pred", []);
      PR.push({ p: +c.pred.toFixed(3), y: result === "AC" ? 1 : 0 });
      lsSet("ff_pred", PR.slice(-300));
    }
    const R = ls("ff_rep", {}),
      k = key(p),
      bad = result === "SKIP" || wrong > 0;
    const IV = [2, 5, 12]; // spaced repetition stages, in days
    if (bad) {
      R[k] = {
        cid: p.contestId,
        idx: p.index,
        name: p.name,
        rating: p.rating,
        tags: p.tags,
        stage: 0,
        due: Date.now() + IV[0] * 864e5,
      };
    } else if (R[k]) {
      R[k].stage++;
      if (R[k].stage >= IV.length) delete R[k];
      else R[k].due = Date.now() + IV[R[k].stage] * 864e5;
    }
    lsSet("ff_rep", R);
    // only a clean, self-driven solve over a minute feeds the pace model, so
    // skips and carried-over reviews do not distort it
    if (result === "AC" && !wrong && !c.carried && t >= 60) {
      const a = ls("ff_pace", []);
      a.push({ r: p.rating, t });
      lsSet("ff_pace", a.slice(-60));
    }
  }
  if (result === "AC") blDel(key(p));
  else blAdd(p, result);
  Z.log.push({
    name: p.name,
    cid: p.contestId,
    idx: p.index,
    rating: p.rating,
    tags: p.tags,
    time: t,
    result,
    wrong,
    first,
    marks,
    rep: c.rep,
    pred: c.pred,
  });
  Z.cur = null;
}

function resolve(r) {
  if (!Z || !Z.cur || Z.done || Z.paused) return;
  record(r);
  liveBase();
  liveCur(Date.now());
  next();
}

// the solve is recorded right away, the celebration waits for a visible tab and
// the next problem only opens once the animation is over
function onAC(c, at) {
  if (!Z || Z.cur !== c || Z.done) return;
  record("AC", at);
  liveBase();
  liveCur(Date.now());
  const l = Z.log[Z.log.length - 1];
  $("zs").textContent = Z.log.filter((x) => x.result === "AC").length;
  Z.celeq = { t: l.time, wrong: l.wrong };
  if (document.visibilityState === "visible") runCele();
  else notify("Solved " + l.name);
}

function runCele() {
  if (!Z || Z.done || !Z.celeq || Z.celeRun) return;
  const i = Z.celeq;
  Z.celeq = null;
  Z.celeRun = 1;
  celebrate(i).then(() => {
    if (!Z) return;
    Z.celeRun = 0;
    next();
  });
}

function celebrate(info) {
  return new Promise((res) => {
    const el = $("cele"), w = $("cw"), n = $("cn");
    w.innerHTML = "";
    (info.w || "Solved").split("").forEach((c, i) => {
      const s = document.createElement("span");
      s.textContent = c;
      s.style.animationDelay = (600 + i * 70) + "ms";
      w.appendChild(s);
    });
    const ff = info.f || fmt;
    n.textContent = ff(0);
    $("cd").textContent = info.d != null
      ? info.d
      : (info.wrong
        ? info.wrong + " wrong submission" + (info.wrong > 1 ? "s" : "")
        : "first try");
    el.className = "";
    el.style.display = "flex";
    void el.offsetWidth;
    el.classList.add("in");
    const T = 1000, t0 = performance.now() + 800;
    const f = (now) => {
      const p = Math.max(0, Math.min(1, (now - t0) / T));
      n.textContent = ff(info.t * (1 - Math.pow(1 - p, 3)));
      if (p < 1) {
        celeRaf = requestAnimationFrame(f);
      } else {
        setTimeout(() => {
          el.classList.add("out");
          res();
          setTimeout(() => {
            if (el.classList.contains("out")) {
              el.style.display = "none";
              el.className = "";
            }
          }, 800);
        }, 700);
      }
    };
    celeRaf = requestAnimationFrame(f);
  });
}

async function check() {
  if (!Z || !Z.cur || Z.done || Z.paused) return;
  const c = Z.cur;
  try {
    const r = await api("user.status", {
      handle: D.handle,
      from: 1,
      count: 15,
    });
    if (Z.cur !== c || Z.paused) return;
    // five seconds of grace, so a submission created just before this poll is still seen
    const since = Math.floor(c.since / 1000) - 5;
    let nw = 0, ok = null;
    r.filter((s) =>
      key(s.problem) === key(c.p) && s.creationTimeSeconds >= since &&
      s.verdict && s.verdict !== "TESTING"
    ).forEach((s) => {
      const at = s.creationTimeSeconds * 1000, isOk = s.verdict === "OK";
      if (!c.sub[s.id]) {
        c.sub[s.id] = { at, ok: isOk };
        if (!isOk) nw++;
      }
      if (isOk && (ok === null || at < ok)) ok = at;
    });
    if (ok !== null) {
      onAC(c, ok);
      return;
    }
    if (nw) {
      pw();
      anim($("pw"), "pop");
      ticksCur();
    }
  } catch (e) {}
}

function tick() {
  if (!Z || Z.done || Z.paused) return;
  const now = Date.now(), left = (Z.end - now) / 1000;
  if (left <= 0) {
    finish();
    return;
  }
  const sec = Math.floor(left);
  if (sec === lastSec) return; // the DOM is only touched once per second
  lastSec = sec;
  $("clock").textContent = fmt(left);
  document.title = fmt(left) + " \u00b7 FlowForces";
  [600, 300, 60].forEach((th) => {
    if (th < Z.dur && left <= th && !Z.rem.has(th)) {
      Z.rem.add(th);
      remind(th / 60 + " min left");
    }
  });
  liveCur(now);
  const c = Z.cur;
  if (c) {
    $("pel").textContent = fmt((now - c.t0) / 1000);
    if (
      !c.warned && !Object.keys(c.sub).length &&
      (now - c.t0) / 1000 > Math.max(480, expected(c.p.rating) * .45)
    ) {
      c.warned = 1;
      remind("Long on this one. Skip?");
    }
  }
}

function pause() {
  if (!Z || Z.done || Z.paused || !Z.cur) return;
  Z.paused = 1;
  pauseAt = Date.now();
  document.title = "Paused \u00b7 FlowForces";
  $("pausev").style.display = "flex";
  anim($("pausev"), "fade");
}

function resume() {
  if (!Z || !Z.paused) return;
  const d = Date.now() - pauseAt;
  // every timestamp shifts, otherwise the pause would count as solving time
  Z.end += d;
  Z.start += d;
  if (Z.cur) Z.cur.t0 += d;
  Z.paused = 0;
  $("pausev").style.display = "none";
  lastSec = -1;
  [["stop", "End session"], ["msolve", "Mark solved"]].forEach(([i, t]) => {
    const b = $(i);
    delete b.dataset.arm;
    b.textContent = t;
  });
}
