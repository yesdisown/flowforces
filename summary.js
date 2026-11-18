function countUp(el, to, ms) {
  const t0 = performance.now();
  const f = (n) => {
    const p = Math.min(1, (n - t0) / ms);
    el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1) requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

function observeSlides() {
  if (sio) sio.disconnect();
  sio = new IntersectionObserver((es) =>
    es.forEach((e) => {
      e.target.classList.toggle("go", e.isIntersecting);
      if (e.isIntersecting && e.target.dataset.count != null) {
        countUp($("vnum"), +e.target.dataset.count, 1300);
      }
    }), { threshold: .3 });
  $("endcard").querySelectorAll(".slide").forEach((s) => sio.observe(s));
}

function finish() {
  if (!Z || Z.done) return;
  Z.done = 1;
  clearInterval(timer);
  clearInterval(poll);
  document.title = "FlowForces";
  $("toast").classList.remove("show");
  cancelAnimationFrame(celeRaf);
  {
    const e = $("cele");
    e.style.display = "none";
    e.className = "";
  }
  // a problem that was still open is carried over instead of being lost
  LC = Z.cur
    ? {
      p: Z.cur.p,
      since: Z.cur.since,
      sub: Z.cur.sub,
      delta: Z.delta,
      rep: Z.cur.rep,
    }
    : null;
  if (Z.cur) record("OPEN");
  const L = Z.log,
    ac = L.filter((l) => l.result === "AC"),
    sk = L.filter((l) => l.result === "SKIP"),
    op = L.filter((l) => l.result === "OPEN"),
    wrong = L.reduce((a, l) => a + l.wrong, 0);
  // score = expected work of the solved problems per session time (soft-saturating)
  // minus 3 per skip and 2 per wrong submission
  const used = Math.min(Z.dur, (Date.now() - Z.start) / 1000);
  const W = ac.reduce((a, l) => a + expected(l.rating), 0);
  const out = Math.round(
    100 * (1 - Math.exp(-1.2 * W / Math.max(used, Z.dur * .5))),
  );
  const skP = Math.min(15, 3 * sk.length);
  const wrP = Math.min(20, 2 * wrong);
  const score = Math.max(0, out - skP - wrP);
  const label = LABELS[Math.min(9, Math.floor(score / 10))], good = score >= 50;
  const tot = L.reduce((a, l) => a + l.time, 0) || 1;
  const post = Math.round(
    100 * L.reduce((a, l) => a + (l.first != null ? l.time - l.first : 0), 0) /
      tot,
  );
  const idle = Math.round(
    100 * L.filter((l) => l.first == null).reduce((a, l) => a + l.time, 0) /
      tot,
  );
  const ctx = {
    score,
    label,
    good,
    solved: ac.length,
    attempts: L.length,
    wrong,
    post,
    idle,
  };
  const q = pickQuote(ctx);
  const SS = ls("ff_sess", []), PB = ls("ff_pb", null);
  const hard = ac.length ? Math.max(...ac.map((l) => l.rating)) : 0;
  const usual = SS.slice(-5).map((x) => x.s);
  const delta = usual.length ? Math.round(score - mean(usual)) : null;
  const pbScore = !!PB && score > PB.score,
    pbSolved = !!PB && ac.length > PB.solved,
    pbHard = !!PB && hard > PB.hard && hard > 0;
  if (L.length) {
    SS.push({ d: Date.now(), s: score, n: ac.length, h: hard });
    lsSet("ff_sess", SS.slice(-30));
    lsSet("ff_pb", {
      score: Math.max(score, PB ? PB.score : 0),
      solved: Math.max(ac.length, PB ? PB.solved : 0),
      hard: Math.max(hard, PB ? PB.hard : 0),
    });
  }
  const hl = !PB
    ? "First session logged. Baseline set."
    : pbScore
    ? "Your best session yet."
    : pbSolved
    ? `${ac.length} solved \u2013 your most in one session.`
    : pbHard
    ? `${hard} solved. Your hardest here.`
    : !ac.length
    ? "Nothing solved. The next one will be."
    : delta != null && delta >= 10
    ? "Clearly above your usual."
    : delta != null && delta <= -10
    ? "Below your usual. It happens."
    : sk.length >= 3
    ? "A lot of skips. Pick your fights."
    : "Steady.";
  LASTR = {
    score,
    label,
    good,
    q: q ? { t: q.t, a: q.a, why: q.why(ctx) } : null,
    solved: ac.length,
    skips: sk.length,
    attempts: L.length,
    date: new Date().toISOString().slice(0, 10),
  };
  const sp = L.filter((l) => l.result !== "OPEN"), PA = ls("ff_pred", []);
  const pr = (v) => Math.round(v * 100) + "%";
  const sessP = sp.length
    ? {
      p: mean(sp.map((l) => l.pred)),
      y: sp.filter((l) => l.result === "AC").length / sp.length,
    }
    : null;
  const allP = PA.length > sp.length
    ? { p: mean(PA.map((x) => x.p)), y: mean(PA.map((x) => x.y)), n: PA.length }
    : null;
  const lv = [...new Set(sp.flatMap((l) => l.tags))]
    .map((t) => ({
      t,
      r: Math.round(TR[t] ?? D.rating),
      d: Math.round((TR[t] ?? D.rating) - (Z.tr0[t] ?? D.rating)),
    }))
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 5);
  const firstTry = ac.filter((l) => l.wrong === 0).length;
  const link = (l) =>
    `https://codeforces.com/problemset/problem/${l.cid}/${l.idx}`;
  const bar = L.map((l) =>
    `<a class="pb2${l.result === "AC" ? " ac" : ""}" href="${
      link(l)
    }" target="_blank" rel="noopener" title="${
      esc(l.name)
    } ${l.rating} \u00b7 ${fmt(l.time)}" style="flex:${
      Math.max(l.time, 1)
    } 1 0">${segS(l)}${
      l.marks.map((m) =>
        `<i style="left:${100 * m / Math.max(l.time, 1)}%"></i>`
      ).join("")
    }</a>`
  ).join("");
  // the skyline encodes the session at a glance: one column per problem, height
  // follows the rating, solid = solved, outlined = skipped, dashed = unfinished
  const rs = L.map((l) => l.rating), mn = Math.min(...rs), mx = Math.max(...rs);
  const sky = L.map((l, i) => {
    const h = Math.round(
      28 + 150 * (mx > mn ? (l.rating - mn) / (mx - mn) : .5),
    );
    const c = l.result === "AC" ? "" : l.result === "SKIP" ? " sk" : " op";
    return `<a class="c2 a" style="--i:${i + 2}" href="${
      link(l)
    }" target="_blank" rel="noopener" title="${
      esc(l.name)
    }"><span class="ar"><span class="rt">${l.rating}</span><i class="bar gr${c}" style="height:${h}px;--i:${
      i + 2
    }"></i></span><span class="tm">${fmt(l.time)}</span></a>`;
  }).join("");
  const rows = lv.map((x, i) => {
    const w = Math.min(50, Math.max(x.d ? 3 : 0, Math.abs(x.d) / 30 * 50));
    return `<span class="a" style="--i:${i + 1}">${
      esc(x.t)
    }</span><span class="ax a" style="--i:${i + 1}">${
      x.d
        ? `<i class="dbar gx ${
          x.d > 0 ? "pos" : "neg"
        }" style="width:${w}%;--i:${i + 1}"></i>`
        : ""
    }</span><span class="a" style="--i:${i + 1}">${x.r}<b>${
      x.d > 0 ? "+" + x.d : x.d
    }</b></span>`;
  }).join("");
  const pbar = (lab, v, cl, i) =>
    `<div class="pr a" style="--i:${i}"><span>${lab}</span><div class="trk"><i class="fl gx ${cl}" style="width:${
      Math.round(v * 100)
    }%;--i:${i}"></i></div><b>${pr(v)}</b></div>`;
  const tag = (isNew, best) =>
    isNew
      ? '<span class="newt">new best</span>'
      : (best != null ? `<span class="bst">best ${best}</span>` : "");
  const spark = SS.slice(-12).map((x, i, a) =>
    `<div><i class="gr${i === a.length - 1 ? " cur" : ""}" style="height:${
      Math.max(4, Math.round(x.s * 1.4))
    }px;--i:${i}"></i><span>${x.s}</span></div>`
  ).join("");
  const parts = [];
  if (delta != null) {
    parts.push(`${delta > 0 ? "+" : ""}${delta} vs your usual`);
  }
  parts.push(`work ${out}`);
  if (skP) parts.push(`skips \u2212${skP}`);
  if (wrP) parts.push(`wrong \u2212${wrP}`);
  const S = [];
  S.push(
    `<section class="slide" data-count="${score}"><div class="lab a" style="--i:0">Score</div>
    <div class="verdict"><b class="a" id="vnum" style="--i:1">0</b><span class="vw ${
      good ? "g" : "b"
    } a" style="--i:8">${label}</span>${
      pbScore
        ? '<span class="a" style="--i:12"><span class="vw g flash">best yet</span></span>'
        : ""
    }</div>
    <div class="small a" style="--i:9">${
      parts.map((p) => `<span>${p}</span>`).join("")
    }</div>
    ${
      q
        ? `<div class="quote a" style="--i:11">\u201c${esc(q.t)}\u201d<span>${
          esc(q.a)
        }</span><em>${esc(q.why(ctx))}</em></div>`
        : ""
    }<div class="scrollhint">scroll</div></section>`,
  );
  S.push(
    `<section class="slide"><div class="lab a" style="--i:0">Solved</div><b class="huge a" style="--i:1">${ac.length}</b>
    ${
      sk.length || op.length
        ? `<div class="small a" style="--i:2">${
          sk.length ? `<span>${sk.length} skipped</span>` : ""
        }${op.length ? `<span>${op.length} unfinished</span>` : ""}</div>`
        : ""
    }
    ${
      L.length
        ? `<div class="sky">${sky}</div><div class="small a" style="--i:${
          L.length + 3
        }"><span><i class="sw sd"></i>solved</span>${
          sk.length ? '<span><i class="sw"></i>skipped</span>' : ""
        }${
          op.length
            ? '<span><i class="sw" style="border-style:dashed"></i>unfinished</span>'
            : ""
        }</div>`
        : ""
    }</section>`,
  );
  S.push(
    `<section class="slide"><div class="lab a" style="--i:0">Timeline</div><div class="a" style="--i:1"><div class="sbar wp">${bar}</div>
    <div class="small" style="display:flex;justify-content:space-between"><span>0:00</span><span>${
      fmt(tot)
    }</span></div>
    <div class="small" style="margin-top:28px"><span><i class="sw"></i>before first submission</span><span><i class="sw db"></i>after</span><span><i class="tk"></i>wrong submission</span><span><i class="cap"></i>solved</span></div></div>
    <div class="big3 s"><div class="a" style="--i:3"><b>${
      ac.length ? fmt(mean(ac.map((l) => l.time))) : "-"
    }</b><span>avg solve</span></div><div class="a" style="--i:4"><b>${wrong}</b><span>wrong submissions</span></div><div class="a" style="--i:5"><b>${
      ac.length ? firstTry + "/" + ac.length : "-"
    }</b><span>solved first try</span></div></div></section>`,
  );
  if (sp.length) {
    S.push(
      `<section class="slide"><div class="lab a" style="--i:0">Topics</div><div class="dv">${rows}</div>
    <div class="lab a" style="--i:${
        lv.length + 2
      };margin-top:7vh">Prediction</div>${
        pbar("predicted", sessP.p, "db", lv.length + 3)
      }${pbar("actual", sessP.y, "sd2", lv.length + 4)}
    <div class="sub a" style="--i:${
        lv.length + 5
      };font-size:18px;margin-top:20px">${
        sessP.y - sessP.p >= .15
          ? "You beat the odds."
          : sessP.y - sessP.p <= -.15
          ? "Tougher than the model expected."
          : "Right on the model."
      }${
        allP
          ? ` All time: ${pr(allP.p)} predicted, ${
            pr(allP.y)
          } actual (${allP.n} problems).`
          : ""
      }</div></section>`,
    );
  }
  S.push(
    `<section class="slide"><div class="lab a" style="--i:0">Personal</div><div class="hl a" style="--i:1">${hl}</div>
    <div class="big3 s"><div class="a" style="--i:3"><b>${score}</b><span>score${
      tag(pbScore, PB ? PB.score : null)
    }</span></div><div class="a" style="--i:4"><b>${ac.length}</b><span>solved${
      tag(pbSolved, PB ? PB.solved : null)
    }</span></div><div class="a" style="--i:5"><b>${
      hard || "-"
    }</b><span>hardest${
      tag(pbHard, PB && PB.hard ? PB.hard : null)
    }</span></div></div>
    <div class="lab a" style="--i:6;margin-top:7vh">Last sessions</div><div class="spark">${spark}</div></section>`,
  );
  S.push(`<section class="slide"><div class="lab a" style="--i:0">Next</div>
    <div class="acts a" style="--i:1"><button class="solid" id="cont">Continue</button><button id="again">New</button><button id="card">Save card</button></div></section>`);
  $("endcard").innerHTML = S.join("");
  $("cont").style.display = LC ? "" : "none";
  $("again").className = LC ? "" : "solid";
  $("cont").onclick = () => {
    if (LC) {
      const k = LC;
      LC = null;
      startZen(k);
    }
  };
  $("again").onclick = () => {
    LC = null;
    show("home");
    updateBl();
    refreshHome();
  };
  $("card").onclick = card;
  show("end");
  observeSlides();
}

function show(id) {
  ["home", "zen", "end", "bl"].forEach((s) =>
    $(s).classList.toggle("hide", s !== id)
  );
  if (id !== "end") anim($(id), "enter");
  SCR = id;
  blVis();
  if (id === "home" && !$("rest").classList.contains("hide")) {
    $("rest").classList.add("seen");
  }
  document.documentElement.classList.toggle("snap", id === "end");
  $("sprog").style.display = id === "end" ? "block" : "none";
  $("wipe").style.display = id === "home" ? "" : "none";
  window.scrollTo(0, 0);
}

window.addEventListener("scroll", () => {
  const h = document.documentElement, m = h.scrollHeight - h.clientHeight;
  $("sprog").style.height = (m > 0 ? 100 * h.scrollTop / m : 0) + "%";
}, { passive: true });

function wrapT(g, t, x, y, w, lh) {
  let l = "";
  for (const word of t.split(" ")) {
    const n = l ? l + " " + word : word;
    if (g.measureText(n).width > w && l) {
      g.fillText(l, x, y);
      y += lh;
      l = word;
    } else l = n;
  }
  g.fillText(l, x, y);
  return y + lh;
}

function card() {
  const R = LASTR;
  if (!R) return;
  const W = 1080, H = 1350, cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const g = cv.getContext("2d"),
    F = "Helvetica Neue,Helvetica,Arial,sans-serif";
  // letterSpacing is not implemented in every engine
  const ls2 = "letterSpacing" in g;
  g.fillStyle = "#fff";
  g.fillRect(0, 0, W, H);
  g.fillStyle = "#000";
  g.textBaseline = "alphabetic";
  g.font = "700 40px " + F;
  g.fillText("FlowForces", 80, 120);
  g.font = "700 460px " + F;
  if (ls2) g.letterSpacing = "-24px";
  g.fillText(String(R.score), 64, 690);
  if (ls2) g.letterSpacing = "0px";
  g.font = "700 56px " + F;
  const lw = g.measureText(R.label).width + 80;
  if (R.good) {
    g.fillRect(80, 760, lw, 96);
    g.fillStyle = "#fff";
    g.fillText(R.label, 120, 828);
    g.fillStyle = "#000";
  } else {
    g.lineWidth = 6;
    g.strokeRect(83, 763, lw - 6, 90);
    g.fillText(R.label, 120, 828);
  }
  let y = 960;
  if (R.q) {
    g.font = "400 44px " + F;
    y = wrapT(g, "\u201c" + R.q.t + "\u201d", 80, y, 920, 58);
    g.font = "700 28px " + F;
    g.fillText(R.q.a.split(",")[0], 80, y + 10);
    g.font = "400 26px " + F;
    g.fillText(R.q.why, 80, y + 50);
  }
  g.font = "400 30px " + F;
  g.fillText(
    R.solved + " solved" + (R.skips ? "   " + R.skips + " skipped" : "") +
      "   " + R.date,
    80,
    H - 90,
  );
  cv.toBlob((b) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = "flowforces.png";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  });
}

function introIn() {
  const el = $("intro"), w = $("iword"), n = $("inum");
  w.innerHTML = "";
  n.textContent = "0";
  n.classList.remove("wait");
  "FlowForces".split("").forEach((c, i) => {
    const s = document.createElement("span");
    s.textContent = c;
    s.style.animationDelay = (700 + i * 70) + "ms";
    w.appendChild(s);
  });
  el.className = "";
  el.style.display = "flex";
  void el.offsetWidth;
  el.classList.add("in");
  const T = 1900, t0 = performance.now() + 700;
  return new Promise((res) => {
    const f = (now) => {
      const p = Math.max(0, Math.min(1, (now - t0) / T));
      n.textContent = Math.floor(100 * (1 - Math.pow(1 - p, 3)));
      // the counter holds at 100 until the data is ready instead of finishing early
      if (p < 1) introRaf = requestAnimationFrame(f);
      else {
        n.textContent = "100";
        setTimeout(res, 200);
      }
    };
    introRaf = requestAnimationFrame(f);
  });
}

function introOut(up) {
  cancelAnimationFrame(introRaf);
  const el = $("intro");
  if (up) {
    $("inum").textContent = "100";
    el.classList.add("out");
  } else el.classList.remove("in");
  setTimeout(() => {
    if (up ? el.classList.contains("out") : !el.classList.contains("in")) {
      el.style.display = "none";
      el.className = "";
    }
  }, 900);
}
