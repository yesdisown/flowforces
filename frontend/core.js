const $ = (id) => document.getElementById(id);
const API = "https://codeforces.com/api/";

// problem names come from the API and are written into innerHTML
const esc = (s) =>
  String(s).replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
  );

const fmt = (s) => {
  s = Math.max(0, Math.round(s));
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
};

const key = (p) => p.contestId + p.index;

const LABELS = [
  "terrible",
  "awful",
  "bad",
  "poor",
  "meh",
  "okay",
  "decent",
  "good",
  "great",
  "amazing",
];

// localStorage throws when it is disabled or full, so every access falls back
// to the default instead of taking the whole app down
const store = {
  get(k, d) {
    try {
      return JSON.parse(localStorage.getItem(k)) ?? d;
    } catch (e) {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
    } catch (e) {}
  },
};

let D = {
  problems: [],
  solved: new Set(),
  tried: {},
  tagW: {},
  rating: 1200,
  handle: "",
};
let Z = null; // the session that is running right now
let LC = null; // an unfinished problem carried over into the next session
let timer = null, poll = null;
let introRaf = 0, celeRaf = 0;
let lastSec = -1, toastT = 0, pauseAt = 0;
let sio = null;
let TR = {}; // per-tag ratings, they decide how hard the next problem should be
let LASTR = null; // result of the last session, drawn on the share card

const anim = (el, c) => {
  el.classList.remove(c);
  void el.offsetWidth; // reflow in between, otherwise the animation does not restart
  el.classList.add(c);
};

const mean = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;

const hk = () => (D.handle || "").toLowerCase();
// progress is stored per handle so two accounts on one machine stay separate
const ls = (k, d) => store.get(k + "_" + hk(), d);
const lsSet = (k, v) => store.set(k + "_" + hk(), v);

function initTR() {
  TR = ls("ff_tr", {});
  let ch = 0;
  for (const t in D.tagW) {
    if (TR[t] == null) {
      // a tag the user keeps failing at starts below their own rating, i.e. easier
      TR[t] = Math.round(D.rating + 300 * (.5 - D.tagW[t]));
      ch = 1;
    }
  }
  if (ch) lsSet("ff_tr", TR);
}

function blAdd(p, from) {
  const B = ls("ff_bl", {}), k = key(p);
  if (!B[k]) {
    B[k] = {
      cid: p.contestId,
      idx: p.index,
      name: p.name,
      rating: p.rating,
      tags: p.tags,
      at: Date.now(),
      from,
    };
    lsSet("ff_bl", B);
  }
}

function blDel(k) {
  const B = ls("ff_bl", {});
  if (B[k]) {
    delete B[k];
    lsSet("ff_bl", B);
  }
}

function detectUp() {
  const B = ls("ff_bl", {}), done = [];
  for (const k in B) {
    if (D.solved.has(k)) {
      done.push(B[k]);
      delete B[k];
    }
  }
  if (done.length) lsSet("ff_bl", B);
  return done;
}

let SCR = "home", BLN = 0;

function blVis() {
  const w = $("blwrap"), on = SCR === "home" && BLN > 0;
  if (on && w.style.display === "none") anim(w, "pop");
  w.style.display = on ? "" : "none";
}

function updateBl() {
  const n = Object.keys(ls("ff_bl", {})).length, b = $("blbtn");
  BLN = n;
  b.textContent = "to upsolve " + n;
  b.classList.toggle("nudge", n >= 5 && n < 15);
  b.classList.toggle("nudge2", n >= 15);
  blVis();
}

const ago = (ts) => {
  const d = Math.floor((Date.now() - ts) / 864e5);
  return d < 1 ? "today" : d + "d";
};

function renderBl() {
  const B = Object.values(ls("ff_bl", {})).sort((a, b) => b.at - a.at);
  $("bllist").innerHTML = B.length
    ? `<div class="bl">${
      B.map((x, i) =>
        `<a class="li" style="--i:${i}" href="https://codeforces.com/problemset/problem/${x.cid}/${x.idx}" target="_blank" rel="noopener">${
          esc(x.name)
        }</a><span class="li" style="--i:${i}">${x.rating}</span><span class="li" style="--i:${i}">${
          ago(x.at)
        }</span>`
      ).join("")
    }</div>`
    : '<div class="sub pop">Nothing left.</div>';
  $("blc").textContent = B.length || "";
}

let pendingUp = null;

function congrats(up) {
  // a celebration during a session or in a hidden tab would be missed, so it
  // waits until the home screen is visible again
  if (document.visibilityState !== "visible" || (Z && !Z.done)) {
    pendingUp = (pendingUp || []).concat(up);
    return Promise.resolve();
  }
  const names = up.slice(0, 2).map((x) => x.name).join(", ") +
    (up.length > 2 ? " and " + (up.length - 2) + " more" : "");
  return celebrate({
    w: ["Upsolved", "Finally", "Nice"][Math.floor(Math.random() * 3)],
    t: up.length,
    f: (n) => String(Math.round(n)),
    d: "solved on your own: " + names,
  });
}

async function refreshHome() {
  const h = D.handle;
  if (!h || busy) return;
  let up = [];
  if (pendingUp) {
    up = pendingUp;
    pendingUp = null;
  }
  try {
    await ensure(h);
    if (D.handle === h) up = up.concat(detectUp());
  } catch (e) {}
  updateBl();
  if (!$("bl").classList.contains("hide")) renderBl();
  if (up.length) await congrats(up);
}

const opt = { dur: 60, st: 0, warm: 1 };

[["dur", "g-dur"], ["st", "g-st"], ["warm", "g-warm"]].forEach(([k, id]) => {
  $(id).onclick = (e) => {
    const o = e.target.closest(".opt");
    if (!o) return;
    opt[k] = +o.dataset.v;
    [...$(id).children].forEach((c) => c.classList.toggle("on", c === o));
  };
});

const TOPICS = [
  "implementation",
  "math",
  "greedy",
  "dp",
  "brute force",
  "constructive algorithms",
  "sortings",
  "binary search",
  "data structures",
  "graphs",
  "trees",
  "dfs and similar",
  "strings",
  "number theory",
  "combinatorics",
  "two pointers",
  "bitmasks",
  "dsu",
  "shortest paths",
  "geometry",
  "divide and conquer",
  "hashing",
  "games",
  "probabilities",
  "flows",
  "matrices",
];
const sel = new Set();

$("g-topics").innerHTML = TOPICS.map((t, i) =>
  `<span class="opt cin" style="--i:${i}" data-v="${t}">${t}</span>`
).join("");

$("g-topics").onclick = (e) => {
  const o = e.target.closest(".opt");
  if (!o) return;
  const t = o.dataset.v;
  sel.has(t) ? sel.delete(t) : sel.add(t);
  o.classList.toggle("on", sel.has(t));
  $("tcount").textContent = sel.size || "auto";
};

const QUOTES = [
  {
    t: "Don\u2019t Panic.",
    a: "Douglas Adams, The Hitchhiker\u2019s Guide to the Galaxy",
    when: (c) => c.score < 20,
    why: (c) => `your score was only ${c.score}`,
  },
  {
    t: "The answer to the Ultimate Question of Life, the Universe, and Everything is 42.",
    a: "Douglas Adams, The Hitchhiker\u2019s Guide to the Galaxy",
    when: (c) => c.score === 42,
    why: () => "your score was exactly 42",
  },
  {
    t: "Time is an illusion. Lunchtime doubly so.",
    a: "Douglas Adams, The Hitchhiker\u2019s Guide to the Galaxy",
    when: (c) => c.idle >= 40,
    why: (c) => `${c.idle}% of your time went to problems with no submission`,
  },
  {
    t: "Debugging is twice as hard as writing the code in the first place.",
    a: "Brian Kernighan",
    when: (c) => c.wrong >= 3,
    why: (c) => `you had ${c.wrong} wrong submissions`,
  },
  {
    t: "An idiot admires complexity, a genius admires simplicity.",
    a: "Terry A. Davis",
    when: (c) => c.post >= 35,
    why: (c) => `you spent ${c.post}% of your time after your first submission`,
  },
  {
    t: "Simplicity is prerequisite for reliability.",
    a: "Edsger W. Dijkstra",
    when: (c) => c.good && c.wrong === 0,
    why: (c) => `${c.label} score, zero wrong submissions`,
  },
  {
    t: "I\u2019d far rather be happy than right any day.",
    a: "Douglas Adams, The Hitchhiker\u2019s Guide to the Galaxy",
    when: (c) => !c.good && c.solved >= 1,
    why: (c) => `${c.label} score, but you still solved ${c.solved}`,
  },
  {
    t: "So long, and thanks for all the fish.",
    a: "Douglas Adams",
    when: (c) => c.score >= 90,
    why: (c) => `your score was ${c.label}`,
  },
  {
    t: "I have not failed. I\u2019ve just found 10,000 ways that won\u2019t work.",
    a: "Thomas Edison",
    when: (c) => c.solved === 0 && c.attempts >= 3,
    why: (c) => `${c.attempts} attempts, 0 solved`,
  },
];

const pickQuote = (c) => {
  const m = QUOTES.filter((q) => q.when(c));
  return m.length ? m[Math.floor(Math.random() * m.length)] : null;
};

// the API reports failures in the JSON body, not in the HTTP status
async function api(m, q) {
  const r = await fetch(API + m + "?" + new URLSearchParams(q));
  const j = await r.json();
  if (j.status !== "OK") throw new Error(j.comment || "API error");
  return j.result;
}

let loadP = null, loadFor = "", loadAt = 0;

async function load(handle) {
  const [pp, subs, info] = await Promise.all([
    api("problemset.problems", {}),
    api("user.status", { handle, from: 1, count: 5000 }),
    api("user.info", { handles: handle }),
  ]);
  const sc = {};
  pp.problemStatistics.forEach((s) =>
    sc[s.contestId + s.index] = s.solvedCount
  );
  const nd = {
    problems: pp.problems.filter((p) => p.rating && p.contestId).map((p) => ({
      ...p,
      sc: sc[key(p)] || 0,
    })),
    solved: new Set(),
    tried: {},
    tagW: {},
    handle,
  };
  const tagTried = {}, tagSolved = {}, seen = {};
  subs.forEach((s) => {
    const k = key(s.problem);
    if (s.verdict === "OK") nd.solved.add(k);
    nd.tried[k] = (nd.tried[k] || 0) + 1;
    if (!seen[k]) {
      seen[k] = s.problem;
      (s.problem.tags || []).forEach((t) =>
        tagTried[t] = (tagTried[t] || 0) + 1
      );
    }
  });
  Object.keys(seen).forEach((k) => {
    if (nd.solved.has(k)) {
      (seen[k].tags || []).forEach((t) =>
        tagSolved[t] = (tagSolved[t] || 0) + 1
      );
    }
  });
  const tags = new Set();
  nd.problems.forEach((p) => p.tags.forEach((t) => tags.add(t)));
  tags.forEach((t) => {
    nd.tagW[t] = 1 - ((tagSolved[t] || 0) + 1) / ((tagTried[t] || 0) + 2);
  });
  nd.rating = info[0].rating || info[0].maxRating || 1200;
  if (handle === loadFor) D = nd;
}

function ensure(h) {
  // one shared request per handle, reused for two minutes so repeated refreshes
  // do not hammer the Codeforces API
  if (loadP && loadFor === h && Date.now() - loadAt < 120000) return loadP;
  loadFor = h;
  loadAt = Date.now();
  const p = load(h);
  p.catch(() => {
    if (loadFor === h) loadFor = "";
  });
  return loadP = p;
}

function autoSelect() {
  sel.clear();
  [...$("g-topics").children].forEach((o) => o.classList.remove("on"));
  const top = [...TOPICS].sort((a, b) => (D.tagW[b] ?? .5) - (D.tagW[a] ?? .5))
    .slice(0, 4);
  top.forEach((t, i) => {
    sel.add(t);
    // the delay makes the topics light up one by one while the intro plays
    setTimeout(() => {
      const o = $("g-topics").querySelector(`[data-v="${t}"]`);
      if (o && sel.has(t)) o.classList.add("on");
      $("tcount").textContent = sel.size || "auto";
    }, 1400 + i * 180);
  });
  $("tcount").textContent = sel.size;
}

let busy = 0;

async function connect() {
  const h = $("handle").value.trim();
  if (!h || busy) return;
  busy = 1;
  $("msg").textContent = "";
  $("rest").classList.add("hide");
  $("handle").readOnly = true;
  $("conn").classList.add("on");
  try {
    // 800ms floor, otherwise the connection bar would only flash for a cached handle
    await Promise.all([ensure(h), new Promise((r) => setTimeout(r, 800))]);
    if (D.handle !== h) throw new Error("Try again");
    store.set("cfzen_handle", h);
    initTR();
    const up = detectUp();
    updateBl();
    if (up.length) await congrats(up);
    autoSelect();
    $("rest").classList.remove("seen", "hide");
  } catch (e) {
    $("msg").textContent = e.message;
    anim($("msg"), "pop");
  }
  $("conn").classList.remove("on");
  $("handle").readOnly = false;
  busy = 0;
}

$("handle").onkeydown = (e) => {
  if (e.key === "Enter") connect();
};

$("handle").oninput = () => {
  $("msg").textContent = "";
  // editing the handle invalidates the settings that were already loaded for it
  if (
    !$("rest").classList.contains("hide") &&
    $("handle").value.trim() !== D.handle
  ) {
    $("rest").classList.add("hide");
  }
};

function nbtn() {
  const b = $("notify");
  if (!("Notification" in window)) {
    b.style.display = "none";
    return;
  }
  const p = Notification.permission;
  b.textContent = p === "granted"
    ? "notifications on"
    : p === "denied"
    ? "notifications blocked"
    : "notify me";
  b.disabled = p !== "default";
}

$("notify").onclick = () => {
  try {
    Notification.requestPermission().then(nbtn);
  } catch (e) {}
};

function notify(body) {
  try {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification("FlowForces", { body });
    }
  } catch (e) {}
}

function remind(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove("show"), 7000);
  notify(msg);
}
