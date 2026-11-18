function twoStep(id, label, sure, fn) {
  const b = $(id);
  let t = 0;
  b.onclick = () => {
    // the second click has to come within four seconds, so a stray click cannot
    // delete the data or end the session by accident
    if (!b.dataset.arm) {
      b.dataset.arm = "1";
      b.textContent = sure;
      t = setTimeout(() => {
        delete b.dataset.arm;
        b.textContent = label;
      }, 4000);
      return;
    }
    clearTimeout(t);
    delete b.dataset.arm;
    b.textContent = label;
    fn();
  };
}

function wipeData() {
  try {
    Object.keys(localStorage).filter((k) =>
      k.startsWith("ff_") || k.startsWith("cfzen_")
    ).forEach((k) => localStorage.removeItem(k));
  } catch (e) {}
  TR = {};
  LASTR = null;
  D.handle = "";
  loadP = null;
  loadFor = "";
  sel.clear();
  [...$("g-topics").children].forEach((o) => o.classList.remove("on"));
  $("tcount").textContent = "auto";
  $("rest").classList.add("hide");
  $("handle").value = "";
  $("msg").textContent = "";
  updateBl();
}

twoStep("wipe", "delete my data", "sure? this deletes everything", wipeData);
twoStep("stop", "End session", "sure? end session", () => {
  if (Z && Z.paused) resume();
  finish();
});
twoStep("msolve", "Mark solved", "sure? mark solved", () => {
  const c = Z && Z.cur;
  if (!c) return;
  resume();
  onAC(c, Date.now());
});

let starting = 0;

$("go").onclick = async () => {
  const hd = $("handle").value.trim();
  if (!hd || starting) return;
  starting = 1;
  $("go").disabled = true;
  $("msg").textContent = "";
  const a = introIn();
  let ready = 0;
  const e = ensure(hd);
  e.then(() => {
    ready = 1;
  }, () => {});
  a.then(() => {
    if (!ready) $("inum").classList.add("wait");
  });
  try {
    await Promise.all([e, a]);
    if (D.handle !== hd) throw new Error("Try again");
    startZen();
    introOut(true);
  } catch (err) {
    introOut(false);
    $("msg").textContent = err.message;
  }
  starting = 0;
  $("go").disabled = false;
};

$("skip").onclick = () => resolve("SKIP");
$("pause").onclick = pause;
$("resume").onclick = resume;

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (b) b.blur();
});

document.addEventListener("keydown", (e) => {
  // the shortcuts must not fire while the handle is being typed
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.tagName === "INPUT") {
    return;
  }
  if (!Z || Z.done || $("zen").classList.contains("hide")) return;
  const k = e.key.toLowerCase();
  if (Z.paused) {
    if (k === "p" || k === "escape") resume();
    return;
  }
  if (k === "s") resolve("SKIP");
  else if (k === "p") pause();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // solves and celebrations that happened in a hidden tab are picked up here
  if (Z && !Z.done) {
    runCele();
    check();
    return;
  }
  if (
    !$("home").classList.contains("hide") || !$("bl").classList.contains("hide")
  ) refreshHome();
});

$("blbtn").onclick = () => {
  renderBl();
  show("bl");
};
$("blback").onclick = () => show("home");

$("handle").value = store.get("cfzen_handle", "");
nbtn();
show("home");
$("handle").focus();
if ($("handle").value) connect();
