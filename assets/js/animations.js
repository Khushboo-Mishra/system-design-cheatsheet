/* Interactive concept animations. Each factory takes a host element and returns an object with destroy(). */
window.SD = window.SD || {};
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const ri = (a, b) => Math.floor(rnd(a, b + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return h >>> 0;
  }
  const btn = (a, l, c) => `<button class="btn sm ${c || ""}" data-act="${a}">${l}</button>`;
  const sel = (n, opts, label) => `<label class="ctl">${label ? `<span>${label}</span>` : ""}<select data-sel="${n}">${opts.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label>`;

  /* ------------------------------ Stage ------------------------------ */
  function Stage(host, o) {
    o = o || {};
    this.w = o.w || 640; this.h = o.h || 320;
    host.innerHTML = `<div class="anim">
      ${o.controls ? `<div class="anim-controls">${o.controls}</div>` : ""}
      <div class="anim-canvas"><svg viewBox="0 0 ${this.w} ${this.h}" preserveAspectRatio="xMidYMid meet"></svg></div>
      <div class="anim-stats"></div>
      <div class="anim-log" aria-live="polite"></div>
    </div>`;
    this.host = host;
    this.svg = host.querySelector("svg");
    this.logEl = host.querySelector(".anim-log");
    this.statsEl = host.querySelector(".anim-stats");
    this.alive = true;
    this.timers = new Set();
    this.layerBg = this.add("g");
    this.layer = this.add("g");
    this.layerPk = this.add("g");
  }
  Stage.prototype.add = function (tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { if (attrs[k] == null) continue; if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    (parent || this.svg).appendChild(e);
    return e;
  };
  Stage.prototype.wait = function (ms) {
    return new Promise((res) => { const t = setTimeout(() => { this.timers.delete(t); if (this.alive) res(); }, ms); this.timers.add(t); });
  };
  Stage.prototype.every = function (ms, fn) { const t = setInterval(() => { if (this.alive) fn(); }, ms); this.timers.add(t); return t; };
  Stage.prototype.tween = function (ms, fn) {
    return new Promise((res) => {
      const t0 = performance.now();
      const step = (now) => {
        if (!this.alive) return;
        const p = Math.min(1, (now - t0) / ms);
        fn(ease(p), p);
        if (p < 1) requestAnimationFrame(step); else res();
      };
      requestAnimationFrame(step);
    });
  };
  Stage.prototype.packet = function (x1, y1, x2, y2, o) {
    o = o || {};
    const g = this.add("g", { class: "pk " + (o.cls || "") }, this.layerPk);
    const c = this.add("circle", { cx: x1, cy: y1, r: o.r || 6 }, g);
    const t = o.label ? this.add("text", { x: x1, y: y1 - 10, "text-anchor": "middle", class: "pk-label", text: o.label }, g) : null;
    return this.tween(o.ms || 650, (e) => {
      const x = x1 + (x2 - x1) * e, y = y1 + (y2 - y1) * e;
      c.setAttribute("cx", x); c.setAttribute("cy", y);
      if (t) { t.setAttribute("x", x); t.setAttribute("y", y - 10); }
    }).then(() => { if (!o.keep) g.remove(); return g; });
  };
  Stage.prototype.box = function (x, y, w, h, label, o) {
    o = o || {};
    const g = this.add("g", { class: "abox " + (o.cls || ""), transform: `translate(${x},${y})` }, o.parent || this.layer);
    const r = this.add("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: o.rx != null ? o.rx : 9 }, g);
    const hasSub = o.sub !== undefined;
    const t = this.add("text", { x: 0, y: hasSub ? -3 : 4.5, "text-anchor": "middle", class: "abox-label", text: label }, g);
    const s = hasSub ? this.add("text", { x: 0, y: 13, "text-anchor": "middle", class: "abox-sub", text: o.sub }, g) : null;
    const base = o.cls || "";
    return {
      g, r, t, s, x, y, w, h,
      label(v) { t.textContent = v; },
      sub(v) { if (s) s.textContent = v; },
      state(c) { g.setAttribute("class", "abox " + base + " " + (c || "")); }
    };
  };
  Stage.prototype.send = function (a, b, o) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const clipAt = (bx, sx, sy) => {
      const s = Math.min(dx ? (bx.w / 2 + 2) / Math.abs(sx) : Infinity, dy ? (bx.h / 2 + 2) / Math.abs(sy) : Infinity);
      return isFinite(s) ? s : 0;
    };
    const s1 = clipAt(a, dx, dy), s2 = clipAt(b, dx, dy);
    return this.packet(a.x + dx * s1, a.y + dy * s1, b.x - dx * s2, b.y - dy * s2, o);
  };
  Stage.prototype.log = function (msg, cls) {
    const d = document.createElement("div");
    d.className = "log-line " + (cls || "");
    d.innerHTML = msg;
    this.logEl.prepend(d);
    while (this.logEl.children.length > 5) this.logEl.lastChild.remove();
  };
  Stage.prototype.stats = function (obj) {
    this.statsEl.innerHTML = Object.entries(obj).map(([k, v]) => `<span class="stat"><span>${k}</span><b>${v}</b></span>`).join("");
  };
  Stage.prototype.act = function (name, fn) { this.host.querySelectorAll(`[data-act="${name}"]`).forEach((b) => b.addEventListener("click", () => fn(b))); };
  Stage.prototype.onSel = function (name, fn) { const s = this.host.querySelector(`[data-sel="${name}"]`); s.addEventListener("change", () => fn(s.value)); return s; };
  Stage.prototype.destroy = function () { this.alive = false; this.timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); };
  Stage.prototype.line = function (x1, y1, x2, y2, cls, parent) { return this.add("line", { x1, y1, x2, y2, class: cls || "aline" }, parent || this.layerBg); };
  Stage.prototype.text = function (x, y, txt, cls, anchor, parent) { return this.add("text", { x, y, class: cls || "atext", "text-anchor": anchor || "middle", text: txt }, parent || this.layer); };

  const A = {};

  /* ------------------------- Load balancing -------------------------- */
  A.lb = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls:
      sel("algo", [["rr", "Round robin"], ["wrr", "Weighted RR (3:1:1:1)"], ["lc", "Least connections"], ["p2c", "Power of two choices"], ["hash", "IP hash (sticky)"], ["rand", "Random"]], "Algorithm") +
      btn("kill", "Kill server 3") + btn("pause", "Pause") });
    const clients = [85, 165, 245].map((y, i) => S.box(60, y, 88, 40, "Client " + (i + 1), { cls: "client" }));
    const lb = S.box(250, 165, 120, 56, "Load Balancer", { cls: "edge", sub: "round robin" });
    const servers = [50, 127, 204, 281].map((y, i) => {
      const b = S.box(520, y, 170, 60, "Server " + (i + 1) + (i === 1 ? " (slow)" : "") + (i === 0 ? " · w3" : ""), { cls: "service", sub: "0 active · 0 served" });
      b.g.querySelector(".abox-label").setAttribute("y", -9);
      b.g.querySelector(".abox-sub").setAttribute("y", 7);
      S.add("rect", { x: -75, y: 15, width: 150, height: 6, rx: 3, class: "meter-bg" }, b.g);
      b.bar = S.add("rect", { x: -75, y: 15, width: 0, height: 6, rx: 3, class: "meter" }, b.g);
      Object.assign(b, { active: 0, served: 0, up: true, slow: i === 1, weight: i === 0 ? 3 : 1 });
      return b;
    });
    clients.forEach((c) => S.line(c.x + 44, c.y, lb.x - 60, lb.y));
    servers.forEach((s) => S.line(lb.x + 60, lb.y, s.x - 85, s.y));
    let algo = "rr", rr = 0, paused = false;
    const names = { rr: "round robin", wrr: "weighted RR", lc: "least connections", p2c: "power of 2 choices", hash: "IP hash", rand: "random" };
    const tips = {
      rr: "Round robin cycles through servers in order. It ignores load, so the <b>slow</b> Server 2 piles up connections.",
      wrr: "Weighted RR sends 3× more traffic to Server 1 (a bigger machine).",
      lc: "Least connections sends each request to the server with the fewest in-flight requests, so load adapts to the slow server.",
      p2c: "Power of two choices samples 2 random servers and picks the less loaded one. Nearly as good as least connections, without global state.",
      hash: "IP hash always maps a client to the same server (sticky). Watch what happens to the mapping when a server dies.",
      rand: "Random is surprisingly fine at scale, but uneven for small clusters."
    };
    function upd(s) {
      s.sub(`${s.active} active · ${s.served} served`);
      s.bar.setAttribute("width", Math.min(150, s.active * 15));
      s.bar.setAttribute("class", "meter" + (s.active > 6 ? " hot" : ""));
    }
    function choose(ci) {
      const up = servers.filter((s) => s.up);
      if (!up.length) return null;
      switch (algo) {
        case "rr": return up[rr++ % up.length];
        case "wrr": { const l = []; up.forEach((s) => { for (let i = 0; i < s.weight; i++) l.push(s); }); return l[rr++ % l.length]; }
        case "lc": return up.reduce((a, b) => (b.active < a.active ? b : a));
        case "p2c": { const a = pick(up), b = pick(up); return a.active <= b.active ? a : b; }
        case "hash": return up[ci % up.length];
        default: return pick(up);
      }
    }
    function spawn() {
      if (paused) return;
      const ci = ri(0, 2), c = clients[ci];
      S.send(c, lb, { ms: 320, r: 5 }).then(() => {
        const s = choose(ci);
        if (!s) { S.log("No healthy servers! 503 Service Unavailable", "bad"); return; }
        S.send(lb, s, { ms: 330, r: 5, cls: algo === "hash" ? "c" + ci : "" }).then(() => {
          s.active++; s.served++; upd(s);
          S.wait(rnd(700, 2000) * (s.slow ? 2.8 : 1)).then(() => { s.active--; upd(s); S.send(s, lb, { ms: 260, r: 3.5, cls: "ok" }); });
        });
      });
    }
    S.every(360, spawn);
    S.onSel("algo", (v) => { algo = v; lb.sub(names[v]); servers.forEach((s) => { s.served = 0; upd(s); }); S.log(tips[v]); });
    S.act("kill", (b) => {
      const s = servers[2]; s.up = !s.up; s.state(s.up ? "" : "down");
      b.textContent = s.up ? "Kill server 3" : "Revive server 3";
      S.log(s.up ? "Server 3 passes its health checks and is <b>added back</b> to rotation." : "Server 3 fails its health checks and is <b>removed from rotation</b>. Traffic shifts to the others.", s.up ? "ok" : "bad");
    });
    S.act("pause", (b) => { paused = !paused; b.textContent = paused ? "Resume" : "Pause"; });
    S.log(tips.rr);
    return S;
  };

  /* ---------------------------- Caching ------------------------------ */
  A.cache = function (host) {
    const S = new Stage(host, { w: 640, h: 310, controls:
      sel("strat", [["cache-aside", "Cache-aside (lazy)"], ["read-through", "Read-through"], ["write-through", "Write-through"], ["write-behind", "Write-behind (write-back)"], ["write-around", "Write-around"], ["refresh-ahead", "Refresh-ahead"]], "Strategy") +
      btn("read", "Read key", "primary") + btn("write", "Write key") + btn("auto", "Auto") + btn("crash", "Crash cache") });
    const app = S.box(100, 160, 120, 56, "Application", { cls: "service", sub: "" });
    const cache = S.box(390, 70, 230, 60, "Cache (Redis) · cap 4", { cls: "cache", sub: "(empty)" });
    const db = S.box(390, 250, 230, 60, "Database", { cls: "db", sub: "k1…k6 · source of truth" });
    S.line(160, 150, 275, 80); S.line(160, 170, 275, 245); S.line(390, 100, 390, 220, "aline dashed");
    const keys = ["k1", "k2", "k3", "k4", "k5", "k6"];
    let strat = "cache-aside", order = [], dirty = new Set(), busy = false, hits = 0, misses = 0, lat = "–", flushing = false, auto = false;
    const has = (k) => order.includes(k);
    const touch = (k) => { order = order.filter((x) => x !== k); order.push(k); };
    function put(k) { touch(k); if (order.length > 4) { const ev = order.shift(); if (dirty.has(ev)) dirty.delete(ev); S.log(`Cache full: <b>evicted ${ev}</b> (least recently used)`, "warn"); } }
    const del = (k) => { order = order.filter((x) => x !== k); };
    function render() {
      cache.sub(order.length ? order.map((k) => k + (dirty.has(k) ? "*" : "")).join("  ") + (dirty.size ? "   (* = dirty)" : "") : "(empty)");
      S.stats({ Hits: hits, Misses: misses, "Hit ratio": hits + misses ? Math.round((hits / (hits + misses)) * 100) + "%" : "–", "Last op latency": lat, Strategy: strat });
    }
    async function read() {
      if (busy) return; busy = true;
      const k = pick(keys.slice(0, order.length > 2 ? 6 : 4));
      await S.send(app, cache, { label: "GET " + k });
      if (has(k)) {
        touch(k); await S.send(cache, app, { cls: "ok", label: "HIT" });
        hits++; lat = "~1 ms"; S.log(`<b>HIT</b> ${k} served from memory in ~1 ms`, "ok");
        if (strat === "refresh-ahead" && Math.random() < 0.6) {
          S.log(`<b>HIT</b> ${k}, but its TTL is almost up, so the cache <b>refreshes it in the background</b> before it expires. The next reader won't miss.`, "ok");
          S.send(cache, db, { cls: "alt", label: "refresh " + k, r: 4 }).then(() => S.send(db, cache, { cls: "alt", r: 4 }));
        }
      } else if (strat === "read-through") {
        await S.send(cache, db, { cls: "warn", label: "load " + k }); await S.send(db, cache, { label: k });
        put(k); render(); await S.send(cache, app, { label: k });
        misses++; lat = "~12 ms"; S.log(`<b>MISS</b> ${k}: the <i>cache itself</i> loaded it from the DB (read-through). The app only talks to the cache.`, "warn");
      } else {
        await S.send(cache, app, { cls: "bad", label: "MISS" });
        await S.send(app, db, { label: "SELECT " + k }); await S.send(db, app, { label: k });
        await S.send(app, cache, { label: "SET " + k }); put(k);
        misses++; lat = "~13 ms"; S.log(`<b>MISS</b> ${k}: the app read the DB, then stored it in the cache (cache-aside)`, "warn");
      }
      busy = false; render();
    }
    function scheduleFlush() {
      if (flushing) return; flushing = true;
      S.wait(2600).then(async () => {
        const n = dirty.size;
        if (n) { await S.send(cache, db, { cls: "warn", label: `flush ${n} key${n > 1 ? "s" : ""}` }); S.log(`Background flush wrote <b>${n}</b> dirty key(s) to the DB in one batch`, "ok"); }
        dirty.clear(); flushing = false; render();
      });
    }
    async function write() {
      if (busy) return; busy = true;
      const k = pick(keys);
      switch (strat) {
        case "cache-aside": case "read-through": case "refresh-ahead":
          await S.send(app, db, { label: "UPDATE " + k }); await S.send(db, app, { cls: "ok", label: "ok" });
          await S.send(app, cache, { cls: "bad", label: "DEL " + k }); del(k); lat = "~11 ms";
          S.log(`Write ${k}: update the DB, then <b>invalidate</b> the cache key. The next read repopulates it (deleting is safer than updating).`); break;
        case "write-through":
          await S.send(app, cache, { label: "SET " + k }); put(k); render();
          await S.send(cache, db, { label: "write " + k }); await S.send(db, cache, { cls: "ok", label: "ack" }); await S.send(cache, app, { cls: "ok", label: "ack" });
          lat = "~12 ms"; S.log(`Write-through: ${k} written to the cache <b>and</b> the DB synchronously. Fresh cache, slower writes.`); break;
        case "write-behind":
          await S.send(app, cache, { label: "SET " + k }); put(k); dirty.add(k); render();
          await S.send(cache, app, { cls: "ok", label: "ack" }); lat = "~1 ms";
          S.log(`Write-behind: acknowledged after the cache write (~1 ms). The DB is updated <b>later, in batches</b>. Try "Crash cache"!`, "warn");
          scheduleFlush(); break;
        case "write-around":
          await S.send(app, db, { label: "UPDATE " + k }); await S.send(db, app, { cls: "ok", label: "ok" });
          await S.send(app, cache, { cls: "bad", label: "DEL " + k }); del(k); lat = "~11 ms";
          S.log(`Write-around: ${k} goes only to the DB and the cache is bypassed. Good for write-once data that's rarely read.`); break;
      }
      busy = false; render();
    }
    S.onSel("strat", (v) => { strat = v; render(); S.log({ "cache-aside": "Cache-aside: the app manages the cache. Read the cache → on a miss read the DB → populate.", "read-through": "Read-through: the cache sits in front of the DB and loads misses itself.", "write-through": "Write-through: every write goes through the cache to the DB synchronously.", "write-behind": "Write-behind: writes hit the cache and are flushed to the DB asynchronously.", "write-around": "Write-around: writes skip the cache; reads populate it lazily.", "refresh-ahead": "Refresh-ahead: hot keys nearing expiry are reloaded proactively. Lower latency if the prediction is right, wasted work if it isn't." }[v]); });
    S.act("read", read); S.act("write", write);
    S.act("auto", (b) => { auto = !auto; b.textContent = auto ? "Stop auto" : "Auto"; });
    S.every(1500, () => { if (auto && !busy) (Math.random() < 0.7 ? read : write)(); });
    S.act("crash", () => {
      const lost = dirty.size;
      order = []; dirty.clear(); cache.state("down"); S.wait(700).then(() => cache.state(""));
      S.log(lost ? `💥 Cache crashed: <b>${lost} unflushed write(s) lost forever</b>. This is the write-behind risk.` : "💥 Cache crashed and restarted empty (cold cache). Expect misses while it warms up.", lost ? "bad" : "warn");
      render();
    });
    render(); S.log("Click <b>Read key</b> a few times: the first reads miss, then hits appear. Switch strategies to compare.");
    return S;
  };

  /* ----------------------- Consistent hashing ------------------------ */
  A["consistent-hashing"] = function (host) {
    const S = new Stage(host, { w: 640, h: 360, controls: btn("add", "Add node", "primary") + btn("remove", "Remove node") + btn("vnodes", "Virtual nodes: off") + btn("reset", "Reset") });
    const cx = 200, cy = 180, R = 130;
    const palette = ["#60a5fa", "#f472b6", "#34d399", "#fbbf24", "#a78bfa", "#f87171", "#2dd4bf", "#fb923c"];
    const names = ["A", "B", "C", "D", "E", "F", "G", "H"];
    const ang = (s) => (hash(s) % 36000) / 100;
    const xy = (a, r) => [cx + r * Math.sin((a * Math.PI) / 180), cy - r * Math.cos((a * Math.PI) / 180)];
    const K = 30;
    const keys = Array.from({ length: K }, (_, i) => ({ id: "user:" + (i * 7 + 13), a: ang("key-" + (i * 7 + 13)) }));
    let nodes, vnodes = false;
    const gRing = S.add("g", null, S.layerBg), gKeys = S.add("g", null, S.layer), gNodes = S.add("g", null, S.layer), gBars = S.add("g", null, S.layer);
    S.add("circle", { cx, cy, r: R, class: "ring" }, gRing);
    const gArcs = S.add("g", null, gRing);
    keys.forEach((k) => { const [x, y] = xy(k.a, R - 24); k.el = S.add("circle", { cx: x, cy: y, r: 5, class: "kdot" }, gKeys); });
    S.text(cx, cy - 4, "hash ring", "atext muted");
    S.text(cx, cy + 12, "0 … 2³²", "atext muted small");
    function points() {
      const pts = [];
      nodes.forEach((n) => { const c = vnodes ? 3 : 1; for (let i = 0; i < c; i++) pts.push({ n, i, a: ang(n.name + "#" + i) }); });
      return pts.sort((a, b) => a.a - b.a);
    }
    function ownerOf(a, pts) { for (const p of pts) if (p.a >= a) return p.n; return pts[0].n; }
    function owners() { const pts = points(); return keys.map((k) => ownerOf(k.a, pts)); }
    function arc(a1, a2) {
      let d = a2 - a1; if (d <= 0) d += 360;
      const [x1, y1] = xy(a1, R), [x2, y2] = xy(a1 + d, R);
      if (d >= 359.9) return `M${cx},${cy - R} A${R},${R} 0 1 1 ${cx - 0.01},${cy - R}`;
      return `M${x1},${y1} A${R},${R} 0 ${d > 180 ? 1 : 0} 1 ${x2},${y2}`;
    }
    function render(moved) {
      const pts = points();
      gArcs.innerHTML = ""; gNodes.innerHTML = ""; gBars.innerHTML = "";
      pts.forEach((p, i) => { const prev = pts[(i - 1 + pts.length) % pts.length]; S.add("path", { d: arc(prev.a, p.a), stroke: p.n.color, class: "arc" }, gArcs); });
      pts.forEach((p) => {
        const [x, y] = xy(p.a, R);
        const g = S.add("g", { transform: `translate(${x},${y})`, class: "rnode" }, gNodes);
        S.add("rect", { x: -13, y: -13, width: 26, height: 26, rx: 6, fill: p.n.color }, g);
        S.add("text", { x: 0, y: 4.5, "text-anchor": "middle", class: "rnode-t", text: p.n.name + (vnodes ? p.i + 1 : "") }, g);
      });
      const own = owners();
      keys.forEach((k, i) => { k.el.setAttribute("fill", own[i].color); k.el.classList.toggle("moved", !!(moved && moved.has(i))); });
      const counts = nodes.map((n) => own.filter((o) => o === n).length);
      const max = Math.max(...counts, 1);
      S.text(470, 30, "Keys per node", "atext strong", "start", gBars);
      nodes.forEach((n, i) => {
        const y = 52 + i * 34;
        S.add("text", { x: 400, y: y + 12, class: "atext", text: n.name }, gBars);
        S.add("rect", { x: 415, y, width: 200, height: 16, rx: 4, class: "meter-bg" }, gBars);
        S.add("rect", { x: 415, y, width: Math.min(200, Math.max(2, (counts[i] / K) * 200 * 1.6)), height: 16, rx: 4, fill: n.color, class: "bar-anim" }, gBars);
        S.add("text", { x: 612, y: y + 12, "text-anchor": "end", class: "atext small", text: counts[i] }, gBars);
      });
      const avg = K / nodes.length;
      S.stats({ Nodes: nodes.length, Keys: K, "Ideal per node": avg.toFixed(1), "Max / ideal": (max / avg).toFixed(2) + "×", "Virtual nodes": vnodes ? "3 per node" : "off" });
    }
    function modOwners(list) { return keys.map((k) => list[hash(k.id) % list.length].name); }
    function change(fn, verb, name) {
      const before = owners().map((n) => n.name), modBefore = modOwners(nodes);
      fn();
      const after = owners().map((n) => n.name), modAfter = modOwners(nodes);
      const moved = new Set(); before.forEach((b, i) => { if (b !== after[i]) moved.add(i); });
      const modMoved = modBefore.filter((b, i) => b !== modAfter[i]).length;
      render(moved);
      S.log(`${verb} <b>${name}</b>: consistent hashing moved <b>${moved.size}/${K}</b> keys (${Math.round((moved.size / K) * 100)}%). With <code>hash mod N</code>, <b>${modMoved}/${K}</b> would have moved.`, moved.size < modMoved ? "ok" : "");
    }
    function reset() { nodes = names.slice(0, 3).map((n, i) => ({ name: n, color: palette[i] })); render(); }
    S.act("add", () => {
      if (nodes.length >= names.length) return S.log("That's enough nodes for this demo.");
      const name = names.find((n) => !nodes.some((x) => x.name === n));
      change(() => nodes.push({ name, color: palette[names.indexOf(name)] }), "Added node", name);
    });
    S.act("remove", () => {
      if (nodes.length <= 1) return S.log("Need at least one node.");
      const victim = pick(nodes);
      change(() => { nodes = nodes.filter((n) => n !== victim); }, "Removed node", victim.name);
    });
    S.act("vnodes", (b) => { vnodes = !vnodes; b.textContent = "Virtual nodes: " + (vnodes ? "on" : "off"); render(); S.log(vnodes ? "Each node now owns 3 points on the ring, so ranges are smaller and load evens out (check Max / ideal)." : "One point per node: arcs vary a lot in size, so load is uneven."); });
    S.act("reset", () => { vnodes = false; host.querySelector('[data-act="vnodes"]').textContent = "Virtual nodes: off"; reset(); });
    reset();
    S.log("Each key belongs to the first node <b>clockwise</b> on the ring. Add or remove nodes and watch how few keys move.");
    return S;
  };

  /* --------------------------- Replication --------------------------- */
  A.replication = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls: sel("mode", [["async", "Asynchronous"], ["semi", "Semi-synchronous (1 ack)"], ["sync", "Synchronous (all acks)"]], "Replication") + btn("write", "Write", "primary") + btn("read", "Read from slowest replica") + btn("crash", "Crash leader") + btn("reset", "Reset") });
    let mode = "async", nodes, writer, reader, electing = false;
    function build() {
      S.layer.innerHTML = ""; S.layerBg.innerHTML = ""; S.layerPk.innerHTML = "";
      writer = S.box(80, 60, 100, 40, "Writer", { cls: "client" });
      reader = S.box(575, 60, 100, 40, "Reader", { cls: "client" });
      const spec = [["L", 330, 60, 0], ["F1", 150, 250, 400], ["F2", 330, 250, 950], ["F3", 510, 250, 2000]];
      nodes = spec.map(([id, x, y, lag]) => ({ id, x, y, lag, v: 0, alive: true, role: id === "L" ? "leader" : "follower" }));
      nodes.forEach((n) => { n.box = S.box(n.x, n.y, 150, 56, "", { cls: "db", sub: "" }); });
      nodes.slice(1).forEach((n) => S.line(330, 90, n.x, n.y - 28, "aline dashed"));
      S.line(130, 60, 255, 60); S.line(525, 60, 510, 222, "aline dashed");
      nodes.forEach(upd);
      S.stats({ Mode: mode, "Latest write": "v0" });
    }
    function upd(n) {
      n.box.label(!n.alive ? "✕ Down" : n.role === "leader" ? "★ Leader" : "Follower");
      n.box.sub(`${n.id} · data v${n.v}${n.role !== "leader" && n.alive ? ` · lag ${n.lag / 1000}s` : ""}`);
      n.box.state(!n.alive ? "down" : n.role === "leader" ? "leader" : "");
    }
    const leader = () => nodes.find((n) => n.role === "leader" && n.alive);
    async function write() {
      const L = leader();
      if (!L) return S.log("No leader right now: <b>writes are unavailable</b> until failover completes.", "bad");
      const t0 = performance.now();
      await S.send(writer, L.box, { label: "write" });
      if (!L.alive) return;
      const v = ++L.v; upd(L);
      const fs = nodes.filter((n) => n !== L && n.alive);
      const reps = fs.map((f) => S.send(L.box, f.box, { ms: f.lag, label: "v" + v, cls: "alt" }).then(() => { if (!f.alive) return; f.v = Math.max(f.v, v); upd(f); return S.send(f.box, L.box, { ms: 250, r: 4, cls: "ok" }); }));
      const need = mode === "async" ? 0 : mode === "semi" ? 1 : fs.length;
      if (need === 1 && reps.length) await Promise.race(reps);
      else if (need > 1) await Promise.all(reps);
      await S.send(L.box, writer, { cls: "ok", label: "ack" });
      const ms = Math.round(performance.now() - t0);
      S.log(`v${v} acknowledged after <b>${ms} ms</b> (${mode}). ${mode === "async" ? "Fast, but followers are still catching up." : mode === "semi" ? "At least one follower has it: safe if the leader dies." : "Every follower has it: safest, and as slow as the slowest replica."}`, "ok");
      S.stats({ Mode: mode, "Latest write": "v" + v });
    }
    async function read() {
      const L = leader();
      const fs = nodes.filter((n) => n.alive && n.role !== "leader");
      if (!fs.length) return S.log("No live followers to read from.");
      const f = fs.reduce((a, b) => (b.lag > a.lag ? b : a));
      await S.send(reader, f.box, { label: "read" });
      await S.send(f.box, reader, { label: "v" + f.v, cls: L && f.v < L.v ? "bad" : "ok" });
      if (L && f.v < L.v) S.log(`<b>Stale read</b>: ${f.id} returned v${f.v}, but the leader has v${L.v} (replication lag). Use read-your-writes routing or read from the leader.`, "bad");
      else S.log(`${f.id} returned v${f.v}: up to date.`, "ok");
    }
    async function crash() {
      const L = leader();
      if (!L || electing) return;
      L.alive = false; upd(L); electing = true;
      S.log("💥 Leader crashed. Followers stop receiving heartbeats…", "bad");
      await S.wait(1400);
      const cands = nodes.filter((n) => n.alive);
      if (!cands.length) { electing = false; return; }
      const w = cands.reduce((a, b) => (b.v > a.v || (b.v === a.v && b.lag < a.lag) ? b : a));
      w.role = "leader"; L.role = "follower"; nodes.forEach(upd); electing = false;
      const lost = L.v - w.v;
      S.log(lost > 0 ? `${w.id} promoted to leader (most up-to-date). <b>Writes v${w.v + 1}…v${L.v} are lost</b>: they were acknowledged but never replicated (async risk).` : `${w.id} promoted to leader. <b>No data lost</b>: it had every acknowledged write.`, lost > 0 ? "bad" : "ok");
    }
    S.onSel("mode", (v) => { mode = v; S.stats({ Mode: mode, "Latest write": "v" + (leader() ? leader().v : "?") }); });
    S.act("write", write); S.act("read", read); S.act("crash", crash); S.act("reset", () => { build(); S.log("Reset."); });
    build();
    S.log("Write a few times in <b>async</b> mode, then crash the leader quickly. Compare with <b>sync</b>.");
    return S;
  };

  /* ---------------------------- Sharding ----------------------------- */
  A.sharding = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls: sel("mode", [["range", "Range-based (by first letter)"], ["hash", "Hash-based (hash mod 4)"]], "Strategy") + btn("run", "Pause inserts") + btn("hot", "🔥 Celebrity hot key") + btn("reset", "Reset") });
    const names = ["sam", "sarah", "sophia", "steve", "scott", "sean", "simon", "sofia", "susan", "samuel", "sara", "mia", "michael", "maria", "mark", "matt", "mohammed", "mary", "john", "james", "jack", "julia", "jane", "jose", "anna", "alex", "adam", "amy", "ben", "chris", "david", "emma", "liam", "lucas", "noah", "olivia", "ryan", "tom", "zoe", "kevin", "hannah", "grace", "paul", "rachel", "nina", "omar", "priya", "raj", "tanvi", "yuki", "wei"];
    let mode = "range", running = true, seq = 0, counts = [0, 0, 0, 0], hot = false;
    const router = S.box(320, 50, 170, 50, "Router", { cls: "edge", sub: "shard by first letter" });
    const ranges = ["A – F", "G – L", "M – R", "S – Z"];
    const shards = [95, 245, 395, 545].map((x, i) => {
      const b = S.box(x, 180, 130, 60, "Shard " + (i + 1), { cls: "db", sub: ranges[i] });
      S.line(320, 75, x, 150, "aline dashed");
      S.add("rect", { x: x - 55, y: 225, width: 110, height: 80, rx: 6, class: "meter-bg" }, S.layer);
      b.fill = S.add("rect", { x: x - 55, y: 305, width: 110, height: 0, rx: 6, class: "fill" }, S.layer);
      b.cnt = S.text(x, 320, "0 rows", "atext small");
      return b;
    });
    function shardOf(key) {
      if (mode === "range") { const c = key[0]; return c <= "f" ? 0 : c <= "l" ? 1 : c <= "r" ? 2 : 3; }
      return hash(key) % 4;
    }
    function render() {
      const max = Math.max(...counts, 1), total = counts.reduce((a, b) => a + b, 0);
      shards.forEach((s, i) => {
        const h = (counts[i] / max) * 78; s.fill.setAttribute("height", h); s.fill.setAttribute("y", 304 - h);
        s.cnt.textContent = `${counts[i]} rows (${total ? Math.round((counts[i] / total) * 100) : 0}%)`;
      });
      S.stats({ Strategy: mode === "range" ? "Range" : "Hash", Rows: total, "Skew (max / avg)": total ? (Math.max(...counts) / (total / 4)).toFixed(2) + "×" : "–" });
    }
    function insert(key, cls) {
      const i = shardOf(key);
      return S.send(router, shards[i], { label: key, ms: 500, cls: cls || "" }).then(() => { if (!hot || cls !== "bad") counts[i]++; render(); });
    }
    S.every(260, () => { if (!running || hot) return; seq++; insert(pick(names) + "_" + ri(1, 999)); if (seq === 40) S.log(mode === "range" ? "See the skew? Many names start with S or M, so range sharding puts more rows on those shards (a <b>hotspot</b>)." : "Hash sharding spreads keys evenly regardless of the name distribution.", mode === "range" ? "warn" : "ok"); });
    S.onSel("mode", (v) => { mode = v; counts = [0, 0, 0, 0]; seq = 0; router.sub(v === "range" ? "shard by first letter" : "hash(key) mod 4"); shards.forEach((s, i) => s.sub(v === "range" ? ranges[i] : "hash % 4 = " + i)); render(); S.log(v === "range" ? "Range sharding: great for range scans (all S names together), but prone to skew." : "Hash sharding: even spread, but range queries must hit every shard (scatter-gather)."); });
    S.act("run", (b) => { running = !running; b.textContent = running ? "Pause inserts" : "Resume inserts"; });
    S.act("hot", async () => {
      if (hot) return; hot = true;
      const key = "taylor_swift", i = shardOf(key);
      shards[i].state("hot");
      S.log(`🔥 Millions of requests for <b>${key}</b>: every one hits <b>Shard ${i + 1}</b>, in <i>either</i> strategy. Fixes: cache the key, replicate it, or split it into key#1…key#N.`, "bad");
      for (let n = 0; n < 24; n++) { insert(key, "bad"); await S.wait(70); }
      await S.wait(900); shards[i].state(""); hot = false;
    });
    S.act("reset", () => { counts = [0, 0, 0, 0]; seq = 0; render(); });
    render();
    S.log("Users are being inserted. Watch how rows spread across the shards.");
    return S;
  };

  /* -------------------------- Rate limiting -------------------------- */
  A["rate-limit"] = function (host) {
    const S = new Stage(host, { w: 640, h: 320, controls: sel("algo", [["token", "Token bucket"], ["leaky", "Leaky bucket"], ["fixed", "Fixed window"], ["log", "Sliding window log"], ["counter", "Sliding window counter"]], "Algorithm") + btn("one", "Send 1 request", "primary") + btn("burst", "Burst ×8") + btn("auto", "Auto (1.4 req/s)") });
    const CAP = 5, RATE = 1, WIN = 5;
    const client = S.box(70, 100, 100, 46, "Client", { cls: "client" });
    const lim = S.box(320, 100, 200, 96, "Token bucket", { cls: "edge", sub: "" });
    lim.t.setAttribute("y", -28); lim.s.setAttribute("y", -12);
    const server = S.box(570, 100, 100, 46, "API", { cls: "service" });
    S.line(120, 100, 220, 100); S.line(420, 100, 520, 100);
    const slots = Array.from({ length: CAP }, (_, i) => S.add("rect", { x: -70 + i * 29, y: 6, width: 24, height: 24, rx: 6, class: "slot" }, lim.g));
    const winBar = S.add("rect", { x: -70, y: 36, width: 0, height: 4, rx: 2, class: "meter" }, lim.g);
    // timeline
    const TL = { x0: 30, x1: 610, y: 262, pps: 29 };
    S.line(TL.x0, TL.y, TL.x1, TL.y, "aline");
    S.text(TL.x0, 240, "Timeline (last 20 s)", "atext small", "start");
    S.text(TL.x1, 300, "now", "atext small", "end");
    const gTL = S.add("g", null, S.layer);
    let algo = "token", st, events = [], auto = false;
    const now = () => performance.now() / 1000;
    function resetState() { st = { tokens: CAP, last: now(), q: 0, count: 0, win: Math.floor(now() / WIN), log: [], prev: 0, cur: 0 }; }
    function allow(t) {
      switch (algo) {
        case "token": st.tokens = Math.min(CAP, st.tokens + (t - st.last) * RATE); st.last = t; if (st.tokens >= 1) { st.tokens -= 1; return "ok"; } return "bad";
        case "leaky": if (st.q < CAP) { st.q++; return "queued"; } return "bad";
        case "fixed": { const w = Math.floor(t / WIN); if (w !== st.win) { st.win = w; st.count = 0; } if (st.count < CAP) { st.count++; return "ok"; } return "bad"; }
        case "log": st.log = st.log.filter((x) => t - x < WIN); if (st.log.length < CAP) { st.log.push(t); return "ok"; } return "bad";
        case "counter": { roll(t); const est = st.prev * (1 - (t % WIN) / WIN) + st.cur; if (est < CAP) { st.cur++; return "ok"; } return "bad"; }
      }
    }
    function roll(t) { const w = Math.floor(t / WIN); if (w !== st.win) { st.prev = w === st.win + 1 ? st.cur : 0; st.cur = 0; st.win = w; } }
    function meter(t) {
      switch (algo) {
        case "token": { const tk = Math.min(CAP, st.tokens + (t - st.last) * RATE); return [tk, `${tk.toFixed(1)} / ${CAP} tokens · refill +1/s`, 0]; }
        case "leaky": return [st.q, `queue ${st.q}/${CAP} · leaks 1 req/s`, 0];
        case "fixed": { const w = Math.floor(t / WIN); const c = w === st.win ? st.count : 0; return [c, `${c}/${CAP} used · window resets in ${(WIN - (t % WIN)).toFixed(1)} s`, (t % WIN) / WIN]; }
        case "log": { const l = st.log.filter((x) => t - x < WIN).length; return [l, `${l}/${CAP} timestamps in the last ${WIN} s`, 0]; }
        case "counter": { roll(t); const wgt = 1 - (t % WIN) / WIN; const est = st.prev * wgt + st.cur; return [est, `≈ ${est.toFixed(1)} = ${st.prev}×${wgt.toFixed(2)} + ${st.cur}`, (t % WIN) / WIN]; }
      }
    }
    function draw() {
      const t = now(); const [m, txt, wp] = meter(t);
      slots.forEach((s, i) => s.setAttribute("class", "slot" + (m >= i + 1 ? " on" : m > i ? " half" : "") + (algo === "leaky" && m >= i + 1 ? " q" : "") + ((algo === "fixed" || algo === "log" || algo === "counter") && m >= i + 1 ? " used" : "")));
      lim.sub(txt); winBar.setAttribute("width", wp * 140);
      events = events.filter((e) => t - e.t < 21);
      gTL.innerHTML = "";
      if (algo === "fixed" || algo === "counter") {
        for (let w = Math.floor((t - 20) / WIN) + 1; w * WIN <= t; w++) { const x = TL.x1 - (t - w * WIN) * TL.pps; if (x > TL.x0) S.add("line", { x1: x, y1: TL.y - 16, x2: x, y2: TL.y + 16, class: "aline dashed" }, gTL); }
      }
      events.forEach((e) => { const x = TL.x1 - (t - e.t) * TL.pps; if (x >= TL.x0) S.add("circle", { cx: x, cy: TL.y, r: 5.5, class: "tl-dot " + e.s }, gTL); });
    }
    function request() {
      S.send(client, lim, { ms: 300, r: 5 }).then(() => {
        const t = now(), r = allow(t);
        events.push({ t, s: r });
        if (r === "ok") S.send(lim, server, { ms: 320, cls: "ok", r: 5 });
        else if (r === "bad") { S.send(lim, client, { ms: 320, cls: "bad", label: "429", r: 5 }); }
        const allowed = events.filter((e) => e.s !== "bad").length, rejected = events.filter((e) => e.s === "bad").length;
        S.stats({ Algorithm: lim.t.textContent, Limit: `${CAP} per ${WIN} s (avg 1/s)`, "Allowed (20 s)": allowed, "Rejected (20 s)": rejected });
      });
    }
    S.every(1000, () => { if (algo === "leaky" && st.q > 0) { st.q--; S.send(lim, server, { ms: 320, cls: "warn", r: 5 }); } });
    S.every(100, draw);
    S.every(700, () => { if (auto) request(); });
    const tips = {
      token: "Token bucket: holds up to 5 tokens, refilled at 1/s. A burst spends saved tokens, then you're limited to the refill rate.",
      leaky: "Leaky bucket: requests queue (amber) and are processed at a constant 1/s. Full queue → dropped. Smooth output, added latency.",
      fixed: "Fixed window: 5 requests per 5-second window. Send a burst at the end of a window and another right after: 10 requests in ~1 s get through.",
      log: "Sliding log: keeps every timestamp from the last 5 s. Exact, but the memory grows with traffic.",
      counter: "Sliding window counter: estimates the rate by weighting the previous window. Nearly exact, O(1) memory."
    };
    S.onSel("algo", (v) => { algo = v; lim.label({ token: "Token bucket", leaky: "Leaky bucket", fixed: "Fixed window", log: "Sliding window log", counter: "Sliding window counter" }[v]); resetState(); events = []; S.log(tips[v]); });
    S.act("one", request);
    S.act("burst", async () => { for (let i = 0; i < 8; i++) { request(); await S.wait(90); } });
    S.act("auto", (b) => { auto = !auto; b.textContent = auto ? "Stop auto" : "Auto (1.4 req/s)"; });
    resetState(); S.log(tips.token);
    S.stats({ Algorithm: "Token bucket", Limit: `${CAP} per ${WIN} s (avg 1/s)`, "Allowed (20 s)": 0, "Rejected (20 s)": 0 });
    return S;
  };

  /* ------------------------------- CAP ------------------------------- */
  A.cap = function (host) {
    const S = new Stage(host, { w: 640, h: 300, controls: sel("mode", [["CP", "CP: prefer consistency"], ["AP", "AP: prefer availability"]], "System") + btn("part", "✂ Cut network") + btn("write", "A writes x", "primary") + btn("read", "B reads x") + btn("reset", "Reset") });
    const a = S.box(90, 70, 110, 44, "Client A", { cls: "client" });
    const b = S.box(550, 70, 110, 44, "Client B", { cls: "client" });
    const n1 = S.box(210, 210, 150, 64, "Node 1", { cls: "db", sub: "x = v0" });
    const n2 = S.box(430, 210, 150, 64, "Node 2", { cls: "db", sub: "x = v0" });
    S.line(120, 92, 180, 178); S.line(520, 92, 460, 178);
    const link = S.line(285, 210, 355, 210, "aline thick");
    const cut = S.text(320, 200, "", "atext bad big");
    let mode = "CP", part = false, x1 = 0, x2 = 0, ver = 0;
    const render = () => { n1.sub("x = v" + x1); n2.sub("x = v" + x2); S.stats({ Mode: mode, Network: part ? "PARTITIONED" : "healthy", "Node 1": "v" + x1, "Node 2": "v" + x2, Consistent: x1 === x2 ? "yes" : "NO (diverged)" }); };
    async function write() {
      const v = ++ver;
      await S.send(a, n1, { label: "x=v" + v });
      if (!part) {
        x1 = v; render(); await S.send(n1, n2, { label: "replicate", cls: "alt" }); x2 = v; render();
        await S.send(n1, a, { cls: "ok", label: "ok" }); S.log("No partition: replicated to both nodes, then acknowledged. Consistent <b>and</b> available.", "ok");
      } else if (mode === "CP") {
        await S.send(n1, a, { cls: "bad", label: "error" }); ver--;
        S.log("<b>CP</b>: Node 1 can't reach a majority to replicate, so it <b>rejects the write</b>. Less available, but no divergent data.", "bad");
      } else {
        x1 = v; render(); await S.send(n1, a, { cls: "ok", label: "ok" });
        S.log("<b>AP</b>: Node 1 accepts the write locally. Available, but Node 2 is now <b>stale</b>.", "warn");
      }
    }
    async function read() {
      await S.send(b, n2, { label: "read x" });
      if (part && mode === "CP") { await S.send(n2, b, { cls: "bad", label: "error" }); S.log("<b>CP</b>: Node 2 can't confirm it has the latest value, so it <b>refuses to answer</b> (or would block).", "bad"); return; }
      const stale = x2 < x1;
      await S.send(n2, b, { cls: stale ? "bad" : "ok", label: "v" + x2 });
      S.log(stale ? `<b>AP</b>: B got <b>v${x2}</b>, but the latest is v${x1}. Available, but a <b>stale read</b>.` : `B read v${x2}: consistent.`, stale ? "warn" : "ok");
    }
    async function toggle(btnEl) {
      part = !part;
      link.setAttribute("class", "aline thick" + (part ? " cut" : ""));
      cut.textContent = part ? "✂ partition" : "";
      btnEl.textContent = part ? "Heal network" : "✂ Cut network";
      if (!part && x1 !== x2) {
        S.log("Network healed. Anti-entropy reconciles the replicas (last-write-wins here)…");
        await S.send(n1, n2, { label: "sync v" + x1, cls: "alt" }); x2 = x1;
      } else S.log(part ? "The link is cut. Now the system must choose: <b>consistency or availability</b>?" : "Network healed.");
      render();
    }
    S.onSel("mode", (v) => { mode = v; render(); });
    S.act("write", write); S.act("read", read); S.act("part", toggle);
    S.act("reset", () => { part = false; x1 = x2 = ver = 0; link.setAttribute("class", "aline thick"); cut.textContent = ""; host.querySelector('[data-act="part"]').textContent = "✂ Cut network"; render(); });
    render(); S.log("Try: cut the network → A writes → B reads, first in CP then in AP mode.");
    return S;
  };

  /* ------------------------ Queue vs Pub/Sub ------------------------- */
  A.queue = function (host) {
    const S = new Stage(host, { w: 640, h: 310, controls: sel("mode", [["queue", "Queue (competing consumers)"], ["pubsub", "Pub/Sub (fan-out)"]], "Pattern") + btn("burst", "Burst ×10", "primary") + btn("slow", "Slow consumers: off") + btn("pause", "Pause producer") });
    const prod = S.box(70, 155, 110, 50, "Producer", { cls: "service", sub: "orders svc" });
    const broker = S.box(300, 155, 200, 96, "Queue", { cls: "queue", sub: "" });
    broker.t.setAttribute("y", -30); broker.s.setAttribute("y", 40);
    const slots = Array.from({ length: 8 }, (_, i) => S.add("rect", { x: -88 + i * 22.5, y: -18, width: 19, height: 30, rx: 4, class: "slot" }, broker.g));
    const cons = [60, 155, 250].map((y, i) => { const c = S.box(545, y, 160, 52, "Worker " + (i + 1), { cls: "worker", sub: "processed 0" }); c.busy = false; c.n = 0; S.line(400, 155, 465, y, "aline dashed"); return c; });
    S.line(125, 155, 200, 155);
    let mode = "queue", msgs = [], id = 0, slow = false, paused = false;
    const hue = (i) => `hsl(${(i * 47) % 360} 75% 60%)`;
    function render() {
      slots.forEach((s, i) => { const m = msgs[i]; s.setAttribute("class", "slot" + (m ? " on" : "")); s.style.fill = m ? hue(m.id) : ""; });
      broker.sub(msgs.length > 8 ? `backlog ${msgs.length} ⚠` : `backlog ${msgs.length}`);
      broker.state(msgs.length > 8 ? "hot" : "");
      S.stats({ Pattern: mode === "queue" ? "Queue" : "Pub/Sub", Backlog: msgs.length, Produced: id, Consumers: cons.map((c) => c.n).join(" / ") });
    }
    function produce() {
      const m = { id: ++id, pending: new Set([0, 1, 2]) };
      S.send(prod, broker, { ms: 450, r: 6, label: "#" + m.id }).then(() => { msgs.push(m); render(); });
    }
    function consume() {
      cons.forEach((c, ci) => {
        if (c.busy) return;
        let m;
        if (mode === "queue") m = msgs.shift();
        else { m = msgs.find((x) => x.pending.has(ci)); if (m) { m.pending.delete(ci); if (!m.pending.size) msgs = msgs.filter((x) => x !== m); } }
        if (!m) return;
        c.busy = true; render();
        const g = S.send(broker, c, { ms: 420, r: 6, label: "#" + m.id });
        g.then(() => { c.state("busy"); return S.wait(slow ? 2600 : 700); }).then(() => { c.busy = false; c.n++; c.sub("processed " + c.n); c.state(""); render(); });
      });
    }
    S.every(1000, () => { if (!paused) produce(); });
    S.every(120, consume);
    S.onSel("mode", (v) => {
      mode = v; msgs = []; broker.label(v === "queue" ? "Queue" : "Topic");
      ["Email svc", "Analytics", "Search indexer"].forEach((n, i) => { cons[i].label(v === "queue" ? "Worker " + (i + 1) : n); cons[i].n = 0; cons[i].sub("processed 0"); });
      render();
      S.log(v === "queue" ? "Queue: each message goes to <b>exactly one</b> worker. Workers share the load (competing consumers)." : "Pub/Sub: each message is delivered to <b>every</b> subscriber. Different services react to the same event.");
    });
    S.act("burst", () => { for (let i = 0; i < 10; i++) setTimeout(produce, i * 80); S.log("A traffic spike! The queue <b>buffers</b> it, so consumers work through the backlog at their own pace (load levelling)."); });
    S.act("slow", (b) => { slow = !slow; b.textContent = "Slow consumers: " + (slow ? "on" : "off"); S.log(slow ? "Consumers are slower than the producer, so the backlog grows. Scale out consumers or apply <b>backpressure</b>." : "Consumers are fast again."); });
    S.act("pause", (b) => { paused = !paused; b.textContent = paused ? "Resume producer" : "Pause producer"; });
    render(); S.log("Queue: each message goes to <b>exactly one</b> worker. Switch to Pub/Sub to compare.");
    return S;
  };

  /* ------------------------------- CDN ------------------------------- */
  A.cdn = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls: btn("one", "Request from random user", "primary") + btn("all", "Everyone requests") + btn("purge", "Purge cache") + sel("ttl", [["10", "TTL 10 s"], ["30", "TTL 30 s"], ["5", "TTL 5 s"]], "Cache TTL") });
    const origin = S.box(320, 165, 150, 58, "Origin server", { cls: "service", sub: "us-east-1" });
    const spec = [["Frankfurt", 160, 60, 45, 60, 0.9], ["Tokyo", 480, 60, 595, 60, 1.2], ["São Paulo", 160, 275, 45, 275, 0.8], ["Sydney", 480, 275, 595, 275, 1.4]];
    const edges = spec.map(([name, x, y, ux, uy, dist]) => {
      const e = S.box(x, y, 130, 48, name + " edge", { cls: "edge", sub: "empty" });
      e.user = S.box(ux, uy, 62, 34, "users", { cls: "client" });
      e.dist = dist; e.exp = 0;
      S.line(x, y, 320, 165, "aline dashed"); S.line(ux, uy, x, y);
      return e;
    });
    let ttl = 10, hits = 0, misses = 0, latSum = 0, n = 0, originReq = 0;
    const tnow = () => performance.now() / 1000;
    function render() {
      edges.forEach((e) => { const left = e.exp - tnow(); e.sub(left > 0 ? `cached · ${left.toFixed(0)}s left` : "empty"); e.state(left > 0 ? "warm" : ""); });
      S.stats({ "Hit ratio": n ? Math.round((hits / n) * 100) + "%" : "–", Hits: hits, Misses: misses, "Origin requests": originReq, "Avg latency": n ? Math.round(latSum / n) + " ms" : "–" });
    }
    async function req(e) {
      await S.send(e.user, e, { ms: 250, r: 5 });
      let lat;
      if (e.exp > tnow()) { hits++; lat = Math.round(15 + Math.random() * 15); await S.send(e, e.user, { ms: 250, cls: "ok", r: 5, label: lat + " ms" }); S.log(`<b>HIT</b> at ${e.t.textContent}: served from the edge in ~${lat} ms`, "ok"); }
      else {
        misses++; originReq++;
        await S.send(e, origin, { ms: 700 * e.dist, cls: "warn", r: 5, label: "miss" });
        await S.send(origin, e, { ms: 700 * e.dist, r: 5 });
        e.exp = tnow() + ttl;
        lat = Math.round(120 * e.dist + 40 + Math.random() * 30);
        await S.send(e, e.user, { ms: 250, cls: "bad", r: 5, label: lat + " ms" });
        S.log(`<b>MISS</b> at ${e.t.textContent}: fetched from the origin across the ocean (~${lat} ms), now cached for ${ttl} s`, "warn");
      }
      n++; latSum += lat; render();
    }
    S.every(500, render);
    S.act("one", () => req(pick(edges)));
    S.act("all", () => edges.forEach((e, i) => setTimeout(() => req(e), i * 150)));
    S.act("purge", () => { edges.forEach((e) => (e.exp = 0)); render(); S.log("Cache purged at every edge: the next requests go back to the origin. (Tip: versioned filenames avoid purges.)"); });
    S.onSel("ttl", (v) => { ttl = +v; S.log(`New objects are cached for ${ttl} s. A longer TTL means more hits but staler content.`); });
    render(); S.log("Users fetch content from their nearest edge. The first request misses, and later ones hit.");
    return S;
  };

  /* --------------------------- Bloom filter -------------------------- */
  A.bloom = function (host) {
    const S = new Stage(host, { w: 640, h: 260, controls: `<label class="ctl"><span>Word</span><input data-in="word" type="text" value="cat" maxlength="16" autocomplete="off"></label>` + btn("add", "Add to set", "primary") + btn("check", "Check membership") + btn("fill", "Add 6 random words") + btn("reset", "Reset") });
    const M = 24, K = 3, cw = 23, x0 = 320 - (M * cw) / 2, y0 = 150;
    const bits = new Array(M).fill(0), cells = [];
    for (let i = 0; i < M; i++) {
      cells.push(S.add("rect", { x: x0 + i * cw + 1, y: y0, width: cw - 3, height: 32, rx: 4, class: "bit" }));
      S.text(x0 + i * cw + cw / 2 - 0.5, y0 + 50, i, "atext tiny");
      cells[i].bitText = S.text(x0 + i * cw + cw / 2 - 0.5, y0 + 21, "0", "atext small");
    }
    const word = S.text(320, 55, "", "atext big");
    const gl = S.add("g", null, S.layerBg);
    let set = [];
    const inp = host.querySelector('[data-in="word"]');
    const hs = (s) => { const h1 = hash(s), h2 = hash("salt" + s) | 1; return Array.from({ length: K }, (_, i) => (h1 + i * h2) % M); };
    function render() {
      bits.forEach((b, i) => { cells[i].setAttribute("class", "bit" + (b ? " on" : "")); cells[i].bitText.textContent = b; });
      const nn = set.length, fp = Math.pow(1 - Math.exp((-K * nn) / M), K);
      S.stats({ "m (bits)": M, "k (hashes)": K, "n (items)": nn, "False-positive rate ≈": (fp * 100).toFixed(1) + "%", Set: set.slice(-6).join(", ") || "∅" });
    }
    async function show(w, mode) {
      const idx = hs(w);
      word.textContent = `"${w}" → h₁,h₂,h₃ = ${idx.join(", ")}`;
      gl.innerHTML = "";
      await Promise.all(idx.map((i) => { S.add("line", { x1: 320, y1: 68, x2: x0 + i * cw + cw / 2, y2: y0, class: "aline dashed" }, gl); return S.packet(320, 68, x0 + i * cw + cw / 2, y0 - 4, { ms: 550, cls: mode === "add" ? "alt" : "", r: 5 }); }));
      return idx;
    }
    async function add(w) { if (!w) return; const idx = await show(w, "add"); idx.forEach((i) => (bits[i] = 1)); if (!set.includes(w)) set.push(w); render(); S.log(`Added "<b>${w}</b>": set bits ${idx.join(", ")}`, "ok"); }
    async function check(w) {
      if (!w) return;
      const idx = await show(w, "check");
      idx.forEach((i) => cells[i].classList.add("probe"));
      setTimeout(() => idx.forEach((i) => cells[i] && cells[i].classList.remove("probe")), 1200);
      const all = idx.every((i) => bits[i]);
      if (!all) S.log(`"<b>${w}</b>": at least one bit is 0 → <b>definitely NOT</b> in the set (no false negatives, ever).`, "ok");
      else if (set.includes(w)) S.log(`"<b>${w}</b>": all bits are 1 → <b>probably</b> in the set (true positive).`, "ok");
      else S.log(`"<b>${w}</b>": all bits are 1, but it was never added. That's a <b>FALSE POSITIVE</b>. Other words set those bits.`, "bad");
    }
    const pool = ["dog", "fish", "bird", "lion", "wolf", "bear", "frog", "duck", "goat", "mouse", "horse", "tiger", "zebra", "panda", "koala", "otter", "eagle", "shark", "whale", "crab"];
    S.act("add", () => add(inp.value.trim().toLowerCase()));
    S.act("check", () => check(inp.value.trim().toLowerCase()));
    S.act("fill", async () => { for (const w of shuffle(pool.filter((p) => !set.includes(p))).slice(0, 6)) { await add(w); } S.log("Now check words you haven't added (for example 'moose', 'snake'). With more bits set, false positives appear."); });
    S.act("reset", () => { bits.fill(0); set = []; word.textContent = ""; gl.innerHTML = ""; render(); });
    inp.addEventListener("keydown", (e) => { if (e.key === "Enter") add(inp.value.trim().toLowerCase()); });
    render(); S.log("Type a word and <b>Add</b> it: 3 hash functions set 3 bits. <b>Check</b> tests whether all 3 bits are set.");
    return S;
  };

  /* ------------------------- Circuit breaker ------------------------- */
  A["circuit-breaker"] = function (host) {
    const S = new Stage(host, { w: 640, h: 320, controls: btn("toggle", "Make Service B fail", "primary") + btn("pause", "Pause") });
    const a = S.box(80, 80, 120, 50, "Service A", { cls: "service", sub: "caller" });
    const br = S.box(320, 80, 170, 60, "Circuit breaker", { cls: "edge", sub: "CLOSED · 0/3 fails" });
    const b = S.box(560, 80, 120, 50, "Service B", { cls: "service", sub: "healthy" });
    S.line(140, 80, 235, 80); S.line(405, 80, 500, 80);
    const sm = { CLOSED: [140, 245], OPEN: [320, 245], HALF: [500, 245] };
    const smEl = {};
    S.add("path", { d: "M170,225 Q230,190 290,225", class: "aline arrowed" }, S.layerBg);
    S.text(230, 196, "3 failures", "atext tiny");
    S.add("path", { d: "M350,225 Q410,190 470,225", class: "aline arrowed" }, S.layerBg);
    S.text(410, 196, "after 4 s", "atext tiny");
    S.add("path", { d: "M470,268 Q320,330 170,268", class: "aline arrowed" }, S.layerBg);
    S.text(320, 312, "trial succeeds", "atext tiny");
    S.add("path", { d: "M470,256 Q410,285 350,256", class: "aline arrowed" }, S.layerBg);
    S.text(410, 288, "trial fails", "atext tiny");
    Object.entries(sm).forEach(([k, [x, y]]) => { const g = S.add("g", { class: "smstate", transform: `translate(${x},${y})` }); S.add("circle", { r: 32 }, g); S.text(0, 5, k === "HALF" ? "HALF-OPEN" : k, "atext small strong", "middle", g); smEl[k] = g; });
    let state = "CLOSED", healthy = true, win = [], openUntil = 0, trial = false, paused = false, ok = 0, fail = 0, short = 0;
    function setState(s) {
      state = s; Object.entries(smEl).forEach(([k, g]) => g.setAttribute("class", "smstate" + (k === s ? " on " + k.toLowerCase() : "")));
      br.state(s === "OPEN" ? "down" : s === "HALF" ? "warm" : "");
      render();
    }
    function render() {
      const fails = win.filter((x) => !x).length;
      br.sub(state === "CLOSED" ? `CLOSED · ${fails}/3 fails` : state === "OPEN" ? `OPEN · retry in ${Math.max(0, (openUntil - performance.now()) / 1000).toFixed(1)}s` : "HALF-OPEN · 1 trial");
      S.stats({ State: state === "HALF" ? "HALF-OPEN" : state, Succeeded: ok, Failed: fail, "Short-circuited (fast fail)": short });
    }
    async function request() {
      if (paused) return;
      if (state === "OPEN" && performance.now() >= openUntil) { setState("HALF"); S.log("Cool-down over → <b>HALF-OPEN</b>: letting one trial request through."); }
      await S.send(a, br, { ms: 350, r: 5 });
      if (state === "OPEN" || (state === "HALF" && trial)) { short++; render(); await S.send(br, a, { ms: 300, r: 5, cls: "warn", label: "fallback" }); return; }
      const isTrial = state === "HALF"; if (isTrial) trial = true;
      await S.send(br, b, { ms: 350, r: 5 });
      if (healthy) {
        await S.send(b, br, { ms: 300, r: 5, cls: "ok" }); await S.send(br, a, { ms: 300, r: 5, cls: "ok" }); ok++;
        if (isTrial) { trial = false; win = []; setState("CLOSED"); S.log("Trial succeeded → <b>CLOSED</b>. Traffic flows normally.", "ok"); }
        else { win.push(true); win = win.slice(-6); }
      } else {
        await S.wait(600); fail++;
        await S.send(b, br, { ms: 300, r: 5, cls: "bad", label: "timeout" }); await S.send(br, a, { ms: 300, r: 5, cls: "bad" });
        if (isTrial) { trial = false; openUntil = performance.now() + 4000; setState("OPEN"); S.log("Trial failed → back to <b>OPEN</b> for another 4 s.", "bad"); }
        else { win.push(false); win = win.slice(-6); if (state === "CLOSED" && win.filter((x) => !x).length >= 3) { openUntil = performance.now() + 4000; setState("OPEN"); S.log("3 failures → <b>OPEN</b>. Calls now fail fast with a fallback instead of waiting on timeouts. B gets breathing room.", "bad"); } }
      }
      render();
    }
    S.every(750, request);
    S.every(250, render);
    S.act("toggle", (btnEl) => { healthy = !healthy; b.sub(healthy ? "healthy" : "failing"); b.state(healthy ? "" : "down"); btnEl.textContent = healthy ? "Make Service B fail" : "Heal Service B"; S.log(healthy ? "Service B has recovered." : "Service B starts timing out…", healthy ? "ok" : "bad"); });
    S.act("pause", (btnEl) => { paused = !paused; btnEl.textContent = paused ? "Resume" : "Pause"; });
    setState("CLOSED"); S.log("Requests flow through the breaker. Make Service B fail and watch the state machine.");
    return S;
  };

  /* ------------------------------ Quorum ----------------------------- */
  A.quorum = function (host) {
    const S = new Stage(host, { w: 640, h: 300, controls:
      `<label class="ctl"><span>N</span><input type="range" min="3" max="7" value="3" data-rng="N"><b data-out="N">3</b></label>
       <label class="ctl"><span>W</span><input type="range" min="1" max="3" value="2" data-rng="W"><b data-out="W">2</b></label>
       <label class="ctl"><span>R</span><input type="range" min="1" max="3" value="2" data-rng="R"><b data-out="R">2</b></label>` +
      btn("write", "Write", "primary") + btn("read", "Read") + btn("repair", "Anti-entropy repair") });
    const client = S.box(320, 50, 130, 44, "Coordinator", { cls: "service" });
    const verdict = S.text(320, 285, "", "atext strong");
    let N = 3, W = 2, R = 2, reps = [], latest = 0, busy = false;
    const gR = S.add("g", null, S.layer);
    const rngs = {}; ["N", "W", "R"].forEach((k) => (rngs[k] = host.querySelector(`[data-rng="${k}"]`)));
    const out = (k, v) => (host.querySelector(`[data-out="${k}"]`).textContent = v);
    function build() {
      gR.innerHTML = ""; S.layerBg.innerHTML = ""; latest = 0;
      reps = Array.from({ length: N }, (_, i) => { const x = 320 + (i - (N - 1) / 2) * 84; const b = S.box(x, 185, 70, 60, "R" + (i + 1), { cls: "db", sub: "v0", parent: gR }); b.v = 0; S.line(320, 72, x, 155, "aline dashed"); return b; });
      render();
    }
    function render() {
      reps.forEach((r) => { r.sub("v" + r.v); r.state(r.v < latest ? "stale" : ""); });
      const strong = W + R > N;
      verdict.textContent = `W + R = ${W + R} ${strong ? ">" : "≤"} N = ${N}  →  ${strong ? "read & write quorums always overlap" : "stale reads possible"}`;
      verdict.setAttribute("class", "atext strong " + (strong ? "ok" : "bad"));
      S.stats({ N, W, R, "Latest version": "v" + latest, "Stale replicas": reps.filter((r) => r.v < latest).length, "Fault tolerance (writes)": N - W + " down OK", "Fault tolerance (reads)": N - R + " down OK" });
    }
    function sync() { ["W", "R"].forEach((k) => { rngs[k].max = N; }); W = Math.min(W, N); R = Math.min(R, N); rngs.W.value = W; rngs.R.value = R; out("N", N); out("W", W); out("R", R); }
    Object.entries(rngs).forEach(([k, el]) => el.addEventListener("input", () => { const v = +el.value; if (k === "N") { N = v; sync(); build(); } else { if (k === "W") W = v; else R = v; out(k, v); render(); } }));
    S.act("write", async () => {
      if (busy) return; busy = true;
      const v = ++latest; const chosen = shuffle(reps).slice(0, W);
      await Promise.all(chosen.map((r) => S.send(client, r, { label: "v" + v, cls: "alt", ms: 600 }).then(() => { r.v = v; render(); })));
      await Promise.all(chosen.map((r) => S.send(r, client, { cls: "ok", ms: 350, r: 4 })));
      S.log(`Write v${v} acknowledged by <b>${W}</b> replica(s): ${chosen.map((r) => r.t.textContent).join(", ")}. The other ${N - W} missed it (slow or partitioned).`);
      busy = false; render();
    });
    S.act("read", async () => {
      if (busy) return; busy = true;
      const chosen = shuffle(reps).slice(0, R);
      chosen.forEach((r) => r.g.classList.add("probe"));
      await Promise.all(chosen.map((r) => S.send(client, r, { ms: 500 })));
      const best = Math.max(...chosen.map((r) => r.v));
      await Promise.all(chosen.map((r) => S.send(r, client, { ms: 400, label: "v" + r.v, cls: r.v === latest ? "ok" : "bad" })));
      chosen.forEach((r) => r.g.classList.remove("probe"));
      S.log(best === latest ? `Read ${chosen.map((r) => r.t.textContent).join(", ")} → newest is <b>v${best}</b>. Correct (a quorum overlapped the write).` : `Read ${chosen.map((r) => r.t.textContent).join(", ")} → got <b>v${best}</b>, but the latest is v${latest}. <b>Stale read</b>: no overlap with the write quorum.`, best === latest ? "ok" : "bad");
      busy = false;
    });
    S.act("repair", async () => { if (busy) return; busy = true; const src = reps.find((r) => r.v === latest); if (src) await Promise.all(reps.filter((r) => r.v < latest).map((r) => S.send(src, r, { cls: "alt", ms: 600 }).then(() => { r.v = latest; render(); }))); S.log("Anti-entropy (Merkle-tree sync / read repair) brought every replica up to date."); busy = false; });
    build(); S.log("Try W=1, R=1 with N=3: write a few times, then read. Now try W=2, R=2.");
    return S;
  };

  /* ---------------------------- LSM tree ----------------------------- */
  A.lsm = function (host) {
    const S = new Stage(host, { w: 640, h: 340, controls: btn("write", "Write random key", "primary") + btn("write4", "Write ×4") + btn("read", "Read a key") + btn("reset", "Reset") });
    const client = S.box(60, 45, 90, 40, "Client", { cls: "client" });
    const wal = S.box(290, 45, 300, 40, "WAL (append-only, on disk)", { cls: "storage", sub: "" });
    wal.t.setAttribute("y", -4); wal.s.setAttribute("y", 12);
    const mem = S.box(110, 150, 190, 64, "Memtable (RAM, sorted)", { cls: "cache", sub: "∅" });
    S.text(110, 198, "flushes at 4 keys", "atext tiny");
    S.text(460, 108, "Level 0: immutable SSTables (newest first)", "atext small");
    S.text(320, 248, "Level 1: compacted SSTable", "atext small");
    const gFiles = S.add("g", null, S.layer);
    const keys = "abcdefghijkl".split("");
    let memt = new Map(), l0 = [], l1 = new Map(), ver = 0, walTail = [], busy = false, writes = 0, compactions = 0, dropped = 0;
    const fmt = (m) => [...m.keys()].sort().map((k) => `${k}${m.get(k)}`).join(" ") || "∅";
    let l0Boxes = [], l1Box;
    function render() {
      gFiles.innerHTML = "";
      l0Boxes = l0.slice().reverse().map((m, i) => S.box(330 + i * 120, 150, 112, 56, "SST #" + (l0.length - i), { cls: "db", sub: fmt(m), parent: gFiles }));
      l1Box = S.box(320, 290, 440, 50, "L1", { cls: "db", sub: fmt(l1), parent: gFiles });
      mem.sub(fmt(memt)); wal.sub(walTail.slice(-8).join("  ") || "(empty)");
      S.stats({ Writes: writes, "Memtable keys": memt.size, "L0 files": l0.length, Compactions: compactions, "Stale versions dropped": dropped });
    }
    async function write() {
      const k = pick(keys), v = ++ver; writes++;
      await S.send(client, wal, { ms: 350, label: `${k}=${v}`, r: 5 });
      walTail.push(`${k}=${v}`); render();
      await S.send(wal, mem, { ms: 350, r: 5 });
      memt.set(k, v); render();
      if (memt.size >= 4) {
        S.log("Memtable full → <b>flush</b> it to disk as a new immutable, sorted SSTable (a sequential write, which is fast).");
        await S.packet(200, 150, 330, 150, { ms: 450, cls: "warn", r: 7 });
        l0.push(new Map(memt)); memt = new Map(); walTail = []; render();
        if (l0.length >= 3) {
          S.log("3 files in L0 → <b>compaction</b>: merge them with L1, keep only the newest version of each key.");
          await Promise.all(l0Boxes.map((b) => S.send(b, l1Box, { ms: 600, cls: "alt", r: 6 })));
          const merged = new Map(l1); let seen = 0;
          l0.forEach((m) => m.forEach((v2, k2) => { seen++; merged.set(k2, v2); }));
          dropped += seen + l1.size - merged.size; l1 = merged; l0 = []; compactions++; render();
        }
      }
    }
    async function read() {
      if (busy) return; busy = true;
      const all = new Set([...memt.keys(), ...l0.flatMap((m) => [...m.keys()]), ...l1.keys()]);
      const k = all.size && Math.random() < 0.8 ? pick([...all]) : pick(keys);
      const path = [];
      mem.g.classList.add("probe"); await S.wait(450); mem.g.classList.remove("probe");
      if (memt.has(k)) { S.log(`read(${k}): found in <b>memtable</b> → ${k}=${memt.get(k)} (fastest, in RAM)`, "ok"); busy = false; return; }
      path.push("memtable ✗");
      for (let i = l0.length - 1; i >= 0; i--) {
        const b = l0Boxes[l0.length - 1 - i];
        b.g.classList.add("probe"); await S.wait(450); b.g.classList.remove("probe");
        if (!l0[i].has(k)) { path.push(`SST#${i + 1} (bloom: skip)`); continue; }
        S.log(`read(${k}): ${path.join(" → ")} → <b>SST#${i + 1} ✓</b> ${k}=${l0[i].get(k)}`, "ok"); busy = false; return;
      }
      l1Box.g.classList.add("probe"); await S.wait(450); l1Box.g.classList.remove("probe");
      S.log(l1.has(k) ? `read(${k}): ${path.join(" → ")} → <b>L1 ✓</b> ${k}=${l1.get(k)}. Reads may touch several files: that's read amplification.` : `read(${k}): not found anywhere (Bloom filters let most files be skipped cheaply).`, l1.has(k) ? "ok" : "warn");
      busy = false;
    }
    S.act("write", write);
    S.act("write4", async () => { for (let i = 0; i < 4; i++) await write(); });
    S.act("read", read);
    S.act("reset", () => { memt = new Map(); l0 = []; l1 = new Map(); walTail = []; writes = compactions = dropped = 0; render(); });
    render(); S.log("Writes append to the WAL and go into the in-memory memtable. Keep writing to see flushes and compaction.");
    return S;
  };

  /* ----------------- Polling / Long polling / SSE / WS ---------------- */
  A.realtime = function (host) {
    const S = new Stage(host, { w: 640, h: 250, controls: sel("mode", [["poll", "Short polling (every 2 s)"], ["long", "Long polling"], ["sse", "Server-Sent Events"], ["ws", "WebSocket"]], "Technique") + btn("reset", "Restart") });
    const CY = 70, SY = 190, PPS = 55;
    S.text(14, CY - 14, "Client", "atext strong", "start"); S.text(14, SY + 26, "Server", "atext strong", "start");
    const lanes = S.add("g", null, S.layerBg);
    S.add("line", { x1: 0, y1: CY, x2: 640, y2: CY, class: "lane" }, lanes);
    S.add("line", { x1: 0, y1: SY, x2: 640, y2: SY, class: "lane" }, lanes);
    const world = S.add("g", null, S.layer);
    let mode = "poll", t0, nextEvent, pendingData, stats, held, lastPoll, wsOpen, nextClientMsg;
    const now = () => performance.now() / 1000 - t0;
    const X = (t) => t * PPS;
    function reset() {
      world.innerHTML = ""; t0 = performance.now() / 1000; nextEvent = 1.5; pendingData = []; held = null; lastPoll = -10; wsOpen = false; nextClientMsg = 3;
      stats = { requests: 0, empty: 0, delivered: 0, delaySum: 0 };
      if (mode === "sse" || mode === "ws") connect();
    }
    function arrow(t1, y1, t2, y2, cls, label) {
      const l = S.add("line", { x1: X(t1), y1, x2: X(t2), y2, class: "msg " + (cls || "") }, world);
      if (label) S.add("text", { x: (X(t1) + X(t2)) / 2 + 4, y: (y1 + y2) / 2, class: "atext tiny", "text-anchor": "start", text: label }, world);
      return l;
    }
    function mark(t, y, cls, txt) { S.add("circle", { cx: X(t), cy: y, r: 5, class: "evt " + cls }, world); if (txt) S.add("text", { x: X(t), y: y + 20, class: "atext tiny", text: txt }, world); }
    function deliver(t) { pendingData.forEach((e) => { stats.delivered++; stats.delaySum += t - e; }); const had = pendingData.length; pendingData = []; return had; }
    function connect() {
      const t = now(); stats.requests++;
      arrow(t, CY, t + 0.25, SY, "req", mode === "ws" ? "HTTP Upgrade" : "GET /events");
      if (mode === "ws") arrow(t + 0.3, SY, t + 0.55, CY, "resp", "101 Switching");
      S.wait(600).then(() => { wsOpen = true; });
    }
    function tick() {
      const t = now();
      world.setAttribute("transform", `translate(${Math.min(0, 560 - X(t))},0)`);
      if (t >= nextEvent) { pendingData.push(t); mark(t, SY, "data", "new data"); nextEvent = t + rnd(1.2, 4); if (mode === "sse" || mode === "ws") { if (wsOpen) { arrow(t, SY, t + 0.2, CY, "push", mode === "sse" ? "event" : "frame"); deliver(t + 0.2); } } else if (mode === "long" && held) { arrow(t, SY, t + 0.25, CY, "resp data", "200 + data"); deliver(t + 0.25); held = null; S.wait(300).then(longReq); } }
      if (mode === "poll" && t - lastPoll >= 2) {
        lastPoll = t; stats.requests++;
        const has = pendingData.length > 0;
        arrow(t, CY, t + 0.25, SY, "req", "GET");
        arrow(t + 0.3, SY, t + 0.55, CY, has ? "resp data" : "resp empty", has ? "200 + data" : "empty");
        if (has) deliver(t + 0.55); else stats.empty++;
      }
      if (mode === "long" && held && t - held.t > 6) { arrow(t, SY, t + 0.25, CY, "resp empty", "timeout"); stats.empty++; held = null; S.wait(300).then(longReq); }
      if (mode === "long" && held) { held.bar.setAttribute("x2", X(t)); }
      if (mode === "ws" && wsOpen && t >= nextClientMsg) { arrow(t, CY, t + 0.2, SY, "push up", "client msg"); nextClientMsg = t + rnd(2.5, 5); }
      world.querySelectorAll("line,circle,text").forEach((e) => { const x = +(e.getAttribute("x1") || e.getAttribute("cx") || e.getAttribute("x")); if (x < X(t) - 800) e.remove(); });
      S.stats({ "HTTP requests": stats.requests, "Empty responses": stats.empty, "Events delivered": stats.delivered, "Avg delivery delay": stats.delivered ? (stats.delaySum / stats.delivered).toFixed(2) + " s" : "–" });
    }
    function longReq() {
      if (mode !== "long" || !S.alive) return;
      const t = now(); stats.requests++;
      arrow(t, CY, t + 0.25, SY, "req", "GET (held)");
      if (pendingData.length) { arrow(t + 0.3, SY, t + 0.55, CY, "resp data", "200 + data"); deliver(t + 0.55); S.wait(850).then(longReq); return; }
      held = { t: t + 0.25, bar: S.add("line", { x1: X(t + 0.25), y1: SY - 6, x2: X(t + 0.25), y2: SY - 6, class: "held" }, world) };
    }
    const tips = {
      poll: "Short polling: the client asks every 2 s. Most answers are <b>empty</b>, and new data waits until the next poll.",
      long: "Long polling: the server <b>holds</b> the request (orange bar) until data arrives or it times out, then the client re-requests.",
      sse: "SSE: one long-lived HTTP response. The server <b>pushes</b> events as they happen (one direction only).",
      ws: "WebSocket: after an HTTP upgrade handshake, both sides can send frames at any time with tiny overhead."
    };
    S.onSel("mode", (v) => { mode = v; reset(); if (v === "long") longReq(); S.log(tips[v]); });
    S.act("reset", () => { reset(); if (mode === "long") longReq(); });
    reset(); S.every(50, tick); S.log(tips.poll);
    return S;
  };

  /* ---------------------------- Snowflake ---------------------------- */
  A.snowflake = function (host) {
    const S = new Stage(host, { w: 640, h: 250, controls:
      `<label class="ctl"><span>Datacenter</span><input type="number" min="0" max="31" value="3" data-in="dc"></label>
       <label class="ctl"><span>Worker</span><input type="number" min="0" max="31" value="17" data-in="wk"></label>` +
      btn("gen", "Generate ID", "primary") + btn("burst", "Burst ×6 (same ms)") });
    const EPOCH = 1288834974657n;
    const sections = [["sign", 1, "s0"], ["timestamp (41 bits · ms since epoch)", 41, "s1"], ["datacenter (5)", 5, "s2"], ["worker (5)", 5, "s3"], ["sequence (12)", 12, "s4"]];
    const cw = 9.2, x0 = 320 - (64 * cw) / 2, y0 = 60;
    const cells = [];
    for (let i = 0; i < 64; i++) cells.push(S.add("rect", { x: x0 + i * cw, y: y0, width: cw - 1.2, height: 26, rx: 2, class: "bitc" }));
    let off = 0;
    sections.forEach(([name, n, cls]) => {
      for (let i = off; i < off + n; i++) cells[i].classList.add(cls);
      if (n > 1) { S.add("path", { d: `M${x0 + off * cw},${y0 + 32} v5 h${n * cw - 1.2} v-5`, class: "brace " + cls }); S.text(x0 + (off + n / 2) * cw, y0 + 52, name, "atext tiny " + cls); }
      off += n;
    });
    const idText = S.text(320, 150, "", "atext mono big");
    const decode = S.text(320, 178, "", "atext small");
    const list = S.text(320, 222, "", "atext mono tiny");
    let lastMs = -1n, seq = 0n, recent = [];
    function gen() {
      const dc = BigInt(Math.max(0, Math.min(31, +host.querySelector('[data-in="dc"]').value || 0)));
      const wk = BigInt(Math.max(0, Math.min(31, +host.querySelector('[data-in="wk"]').value || 0)));
      let ms = BigInt(Date.now());
      if (ms === lastMs) seq = (seq + 1n) & 4095n; else seq = 0n;
      lastMs = ms;
      const id = ((ms - EPOCH) << 22n) | (dc << 17n) | (wk << 12n) | seq;
      const bin = id.toString(2).padStart(64, "0");
      cells.forEach((c, i) => { c.classList.toggle("one", bin[i] === "1"); c.classList.remove("flash"); });
      requestAnimationFrame(() => cells.slice(52).forEach((c) => c.classList.add("flash")));
      idText.textContent = id.toString();
      decode.textContent = `time ${new Date(Number(ms)).toISOString().replace("T", " ").slice(0, 23)} · dc ${dc} · worker ${wk} · seq ${seq}`;
      recent.unshift(id.toString()); recent = recent.slice(0, 3);
      list.textContent = "recent: " + recent.join("  ›  ");
      S.stats({ "Bits": "1 + 41 + 5 + 5 + 12", "IDs / ms / worker": "4,096", "Lifetime": "~69 years", "Sorted by time": "yes (roughly)" });
    }
    S.act("gen", gen);
    S.act("burst", () => { for (let i = 0; i < 6; i++) gen(); S.log("Six IDs in the same millisecond: only the <b>sequence</b> bits change, and the IDs still sort by time."); });
    gen(); S.log("A Snowflake ID packs time, location and a counter into 64 bits, so there's no central coordination and IDs are roughly time-ordered.");
    return S;
  };

  /* ---------------------- Geospatial (quadtree) ---------------------- */
  A.geo = function (host) {
    const S = new Stage(host, { w: 640, h: 340, controls: btn("add", "Add 20 random points", "primary") + btn("city", "Add a dense city") + btn("grid", "Show geohash grid") + btn("reset", "Reset") });
    const X0 = 20, Y0 = 20, SZ = 300, CAPQ = 4, MAXD = 6, RAD = 38;
    S.add("rect", { x: X0, y: Y0, width: SZ, height: SZ, class: "map" }, S.layerBg);
    const gGrid = S.add("g", { class: "gh-grid" }, S.layerBg);
    const gCells = S.add("g", null, S.layer), gPts = S.add("g", null, S.layer), gQ = S.add("g", null, S.layer);
    const info = S.add("g", null, S.layer);
    S.text(480, 40, "Click anywhere on the map", "atext strong", "middle", info);
    S.text(480, 60, "to find points within the circle", "atext small", "middle", info);
    const ghText = S.text(480, 110, "", "atext mono big", "middle", info);
    const ghSub = S.text(480, 132, "", "atext tiny", "middle", info);
    const qText = S.text(480, 180, "", "atext small", "middle", info);
    const qText2 = S.text(480, 200, "", "atext small", "middle", info);
    const qText3 = S.text(480, 220, "", "atext small", "middle", info);
    let pts = [], root, showGrid = false;
    function Node(x, y, s, d) { this.x = x; this.y = y; this.s = s; this.d = d; this.p = []; this.k = null; }
    Node.prototype.insert = function (pt) {
      if (pt.x < this.x || pt.x >= this.x + this.s || pt.y < this.y || pt.y >= this.y + this.s) return false;
      if (!this.k && (this.p.length < CAPQ || this.d >= MAXD)) { this.p.push(pt); return true; }
      if (!this.k) { const h = this.s / 2; this.k = [new Node(this.x, this.y, h, this.d + 1), new Node(this.x + h, this.y, h, this.d + 1), new Node(this.x, this.y + h, h, this.d + 1), new Node(this.x + h, this.y + h, h, this.d + 1)]; this.p.forEach((q) => this.k.some((c) => c.insert(q))); this.p = []; }
      return this.k.some((c) => c.insert(pt));
    };
    Node.prototype.leaves = function (out) { if (this.k) this.k.forEach((c) => c.leaves(out)); else out.push(this); return out; };
    Node.prototype.query = function (cx, cy, r, vis, found) {
      const nx = Math.max(this.x, Math.min(cx, this.x + this.s)), ny = Math.max(this.y, Math.min(cy, this.y + this.s));
      if ((nx - cx) ** 2 + (ny - cy) ** 2 > r * r) return;
      if (this.k) { this.k.forEach((c) => c.query(cx, cy, r, vis, found)); return; }
      vis.push(this); this.p.forEach((p) => { if ((p.x - cx) ** 2 + (p.y - cy) ** 2 <= r * r) found.push(p); });
    };
    function rebuild() {
      root = new Node(X0, Y0, SZ, 0); pts.forEach((p) => root.insert(p));
      gCells.innerHTML = ""; gPts.innerHTML = "";
      root.leaves([]).forEach((l) => { l.el = S.add("rect", { x: l.x, y: l.y, width: l.s, height: l.s, class: "qcell" }, gCells); });
      pts.forEach((p) => { p.el = S.add("circle", { cx: p.x, cy: p.y, r: 3.2, class: "gpt" }, gPts); });
      S.stats({ Points: pts.length, "Leaf cells": root.leaves([]).length, "Max per leaf": CAPQ, "Max depth": MAXD });
    }
    function addRandom(n) { for (let i = 0; i < n; i++) pts.push({ x: X0 + rnd(2, SZ - 2), y: Y0 + rnd(2, SZ - 2) }); rebuild(); }
    function addCity() { const cx = X0 + rnd(60, SZ - 60), cy = Y0 + rnd(60, SZ - 60); for (let i = 0; i < 40; i++) { const a = rnd(0, 6.28), r = Math.abs(rnd(0, 1) * rnd(0, 1)) * 45; pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }); } rebuild(); S.log("A dense city: the quadtree splits into <b>smaller cells</b> there and stays coarse in empty areas (adaptive)."); }
    const B32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    function geohash(px, py, prec) {
      let lat = [-90, 90], lon = [-180, 180], bit = 0, ch = 0, even = true, out = "";
      const LON = -180 + ((px - X0) / SZ) * 360, LAT = 90 - ((py - Y0) / SZ) * 180;
      while (out.length < prec) {
        const rng = even ? lon : lat, v = even ? LON : LAT, mid = (rng[0] + rng[1]) / 2;
        if (v >= mid) { ch = (ch << 1) | 1; rng[0] = mid; } else { ch = ch << 1; rng[1] = mid; }
        even = !even; if (++bit === 5) { out += B32[ch]; bit = 0; ch = 0; }
      }
      return out;
    }
    function drawGrid() {
      gGrid.innerHTML = ""; if (!showGrid) return;
      const cw = SZ / 8, ch = SZ / 4;
      for (let c = 0; c < 8; c++) for (let r = 0; r < 4; r++) {
        const rs = 3 - r; const idx = (((c >> 2) & 1) << 4) | (((rs >> 1) & 1) << 3) | (((c >> 1) & 1) << 2) | ((rs & 1) << 1) | (c & 1);
        S.add("rect", { x: X0 + c * cw, y: Y0 + r * ch, width: cw, height: ch, class: "ghcell" }, gGrid);
        S.add("text", { x: X0 + c * cw + cw / 2, y: Y0 + r * ch + ch / 2 + 6, class: "ghchar", "text-anchor": "middle", text: B32[idx] }, gGrid);
      }
    }
    S.svg.addEventListener("click", (ev) => {
      const pt = S.svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
      const p = pt.matrixTransform(S.svg.getScreenCTM().inverse());
      if (p.x < X0 || p.x > X0 + SZ || p.y < Y0 || p.y > Y0 + SZ) return;
      gQ.innerHTML = ""; root.leaves([]).forEach((l) => l.el.classList.remove("vis")); pts.forEach((q) => q.el.classList.remove("found"));
      const vis = [], found = [];
      root.query(p.x, p.y, RAD, vis, found);
      S.add("circle", { cx: p.x, cy: p.y, r: RAD, class: "qcircle" }, gQ);
      S.add("circle", { cx: p.x, cy: p.y, r: 3, class: "qcenter" }, gQ);
      vis.forEach((l) => l.el.classList.add("vis")); found.forEach((q) => q.el.classList.add("found"));
      const gh = geohash(p.x, p.y, 6);
      ghText.textContent = "geohash: " + gh;
      ghSub.textContent = `prefix "${gh.slice(0, 2)}" ≈ region, "${gh.slice(0, 4)}" ≈ city, "${gh}" ≈ ~1 km`;
      const leaves = root.leaves([]).length;
      qText.textContent = `Checked ${vis.length} of ${leaves} cells`;
      qText2.textContent = `Found ${found.length} of ${pts.length} points in radius`;
      qText3.textContent = `(a full scan would test all ${pts.length})`;
    });
    S.act("add", () => addRandom(20));
    S.act("city", addCity);
    S.act("grid", (b) => { showGrid = !showGrid; b.textContent = showGrid ? "Hide geohash grid" : "Show geohash grid"; drawGrid(); if (showGrid) S.log("Geohash precision 1: the world splits into 32 cells, each named by one base32 character. Each extra character subdivides the cell into 32 more."); });
    S.act("reset", () => { pts = []; gQ.innerHTML = ""; rebuild(); });
    addRandom(30); addCity();
    S.log("Each leaf holds at most 4 points; full cells split into 4. Click the map to run a radius search.");
    return S;
  };

  /* ------------------------------- Saga ------------------------------ */
  A.saga = function (host) {
    const S = new Stage(host, { w: 640, h: 300, controls: sel("fail", [["-1", "No failure"], ["1", "Fail at: Reserve stock"], ["2", "Fail at: Charge payment"], ["3", "Fail at: Ship order"]], "Scenario") + sel("style", [["orch", "Orchestration"], ["chor", "Choreography"]], "Style") + btn("run", "Run saga", "primary") });
    const steps = ["Create order", "Reserve stock", "Charge payment", "Ship order"];
    const comps = ["Cancel order", "Release stock", "Refund payment"];
    const xs = [85, 240, 395, 550];
    const orch = S.box(320, 38, 190, 40, "Saga orchestrator", { cls: "worker" });
    const sb = steps.map((s, i) => S.box(xs[i], 130, 132, 50, s, { cls: "service", sub: "pending" }));
    const cb = comps.map((s, i) => S.box(xs[i], 240, 132, 46, s, { cls: "db", sub: "" }));
    for (let i = 0; i < 3; i++) S.line(xs[i] + 66, 130, xs[i + 1] - 66, 130, "aline arrowed");
    S.text(14, 205, "compensating actions ↓", "atext tiny", "start");
    let style = "orch", failAt = -1, running = false;
    const events = ["OrderCreated", "StockReserved", "PaymentCharged", "OrderShipped"];
    function resetBoxes() { sb.forEach((b) => { b.state(""); b.sub("pending"); }); cb.forEach((b) => { b.state("ghost"); b.sub(""); }); orch.g.style.opacity = style === "orch" ? 1 : 0.15; }
    async function run() {
      if (running) return; running = true; resetBoxes();
      const done = [];
      for (let i = 0; i < steps.length; i++) {
        if (style === "orch") await S.send(orch, sb[i], { ms: 450, label: "do", r: 5 });
        else if (i > 0) await S.send(sb[i - 1], sb[i], { ms: 500, label: events[i - 1], cls: "alt", r: 5 });
        sb[i].state("busy"); sb[i].sub("running…"); await S.wait(500);
        if (i === failAt) {
          sb[i].state("down"); sb[i].sub("✕ failed");
          S.log(`<b>${steps[i]}</b> failed (${["", "out of stock", "card declined", "carrier API down"][i]}). Run compensations in <b>reverse order</b>.`, "bad");
          if (style === "orch") await S.send(sb[i], orch, { ms: 450, cls: "bad", r: 5, label: "failed" });
          for (let j = done.length - 1; j >= 0; j--) {
            const k = done[j];
            if (style === "orch") await S.send(orch, cb[k], { ms: 500, cls: "warn", r: 5, label: "undo" });
            else await S.send(sb[j + 1 <= i ? i : j + 1], cb[k], { ms: 500, cls: "warn", r: 5, label: "…Failed" });
            cb[k].state("warm"); cb[k].sub("↩ done"); sb[k].state("comp"); sb[k].sub("compensated");
            await S.wait(350);
          }
          S.log("Saga rolled back via compensations. The system is consistent again, without a distributed lock.", "warn");
          running = false; return;
        }
        sb[i].state("ok"); sb[i].sub("✓ committed locally"); done.push(i);
        if (style === "orch") await S.send(sb[i], orch, { ms: 400, cls: "ok", r: 4 });
      }
      S.log("All local transactions committed → the saga is complete.", "ok"); running = false;
    }
    S.onSel("fail", (v) => { failAt = +v; });
    S.onSel("style", (v) => { style = v; resetBoxes(); S.log(v === "orch" ? "Orchestration: a central coordinator tells each service what to do next." : "Choreography: each service listens for the previous event and publishes its own. There's no central brain."); });
    S.act("run", run);
    resetBoxes(); S.stats({ "Steps": 4, "Isolation": "none: use PENDING states", "Needs": "idempotent steps + compensations" });
    S.log("Pick a failure point and run the saga.");
    return S;
  };

  /* ------------------------------- Raft ------------------------------ */
  A.raft = function (host) {
    const S = new Stage(host, { w: 640, h: 340, controls: btn("write", "Client write", "primary") + btn("crash", "Crash leader") + btn("crashf", "Crash a follower") + btn("restart", "Restart crashed nodes") + btn("pause", "Pause") });
    const cx = 250, cy = 172, R = 118;
    const rt = () => rnd(2600, 4200);
    const nodes = Array.from({ length: 5 }, (_, i) => {
      const a = (i * 72 - 90) * (Math.PI / 180), x = cx + R * Math.cos(a), y = cy + R * Math.sin(a);
      const g = S.add("g", { class: "rnode2", transform: `translate(${x},${y})` });
      const ring = S.add("circle", { r: 36, class: "tring" }, g);
      S.add("circle", { r: 29, class: "rbody" }, g);
      S.add("text", { y: 5, "text-anchor": "middle", class: "atext strong", text: "S" + (i + 1) }, g);
      const sub = S.add("text", { y: 50, "text-anchor": "middle", class: "atext tiny", text: "" }, g);
      const C = 2 * Math.PI * 36; ring.setAttribute("stroke-dasharray", C);
      return { i, x, y, w: 60, h: 60, g, ring, sub, C, role: "follower", term: 1, alive: true, voted: null, to: rt(), tot: 3000, log: 0, commit: 0 };
    });
    nodes[0].role = "leader";
    let paused = false;
    const leader = () => nodes.find((n) => n.alive && n.role === "leader");
    function render() {
      nodes.forEach((n) => {
        n.g.setAttribute("class", "rnode2 " + (n.alive ? n.role : "down"));
        n.sub.textContent = n.alive ? `${n.role} · T${n.term} · log ${n.log}/${n.commit}` : "crashed";
        const frac = n.role === "leader" || !n.alive ? 0 : Math.max(0, n.to / n.tot);
        n.ring.setAttribute("stroke-dashoffset", n.C * (1 - frac));
      });
      const L = leader();
      S.stats({ Leader: L ? "S" + (L.i + 1) : "none (election)", Term: Math.max(...nodes.map((n) => n.term)), "Alive": nodes.filter((n) => n.alive).length + "/5", "Majority needed": 3 });
    }
    function send(a, b, cls, label) { return S.packet(a.x, a.y, b.x, b.y, { ms: 480, r: 5, cls, label }); }
    function heartbeat() {
      const L = leader(); if (!L || paused) return;
      nodes.filter((n) => n !== L && n.alive).forEach((n) => send(L, n, "ok hb").then(() => {
        if (!n.alive || !L.alive || L.role !== "leader") return;
        if (L.term >= n.term) { n.term = L.term; n.role = "follower"; n.to = rt(); n.tot = n.to; n.log = Math.max(n.log, L.log); n.commit = L.commit; }
        else { L.role = "follower"; S.log(`S${L.i + 1} sees a higher term and steps down.`); }
        render();
      }));
    }
    function election(c) {
      c.role = "candidate"; c.term++; c.voted = c.i; c.to = rt(); c.tot = c.to;
      const term = c.term; let votes = 1;
      S.log(`S${c.i + 1} timed out → <b>candidate</b> for term ${term}, requesting votes`, "warn");
      nodes.filter((n) => n !== c && n.alive).forEach((n) => send(c, n, "warn", "vote?").then(() => {
        if (!n.alive || !c.alive) return;
        if (term > n.term) { n.term = term; n.voted = null; if (n.role !== "follower") n.role = "follower"; }
        const grant = term === n.term && (n.voted === null || n.voted === c.i) && c.log >= n.log;
        if (!grant) return;
        n.voted = c.i; n.to = rt(); n.tot = n.to; render();
        return send(n, c, "ok", "✓").then(() => {
          if (c.role !== "candidate" || c.term !== term || !c.alive) return;
          votes++;
          if (votes >= 3) { c.role = "leader"; S.log(`S${c.i + 1} won <b>${votes} votes</b> → leader for term ${term}`, "ok"); render(); heartbeat(); }
        });
      }));
      render();
    }
    S.every(100, () => {
      if (paused) return;
      nodes.forEach((n) => { if (!n.alive || n.role === "leader") return; n.to -= 100; if (n.to <= 0) election(n); });
      render();
    });
    S.every(1000, heartbeat);
    S.act("write", () => {
      const L = leader(); if (!L) return S.log("No leader: writes must wait for an election to finish.", "bad");
      L.log++; const idx = L.log; let acks = 1; render();
      S.log(`Leader S${L.i + 1} appends entry #${idx} and replicates it…`);
      nodes.filter((n) => n !== L && n.alive).forEach((n) => send(L, n, "alt", "append").then(() => {
        if (!n.alive) return; n.log = Math.max(n.log, idx); render();
        return send(n, L, "ok").then(() => { acks++; if (acks === 3 && L.alive) { L.commit = Math.max(L.commit, idx); S.log(`Entry #${idx} stored on a majority (3/5) → <b>committed</b>`, "ok"); render(); } });
      }));
    });
    S.act("crash", () => { const L = leader(); if (!L) return; L.alive = false; L.role = "follower"; S.log(`💥 Leader S${L.i + 1} crashed. Followers' election timers (rings) keep draining…`, "bad"); render(); });
    S.act("crashf", () => { const f = nodes.filter((n) => n.alive && n.role !== "leader"); if (!f.length) return; const v = pick(f); v.alive = false; S.log(`💥 S${v.i + 1} crashed. ${nodes.filter((n) => n.alive).length >= 3 ? "Still a majority: the cluster keeps working." : "No majority left: no leader can be elected!"}`, "bad"); render(); });
    S.act("restart", () => { nodes.forEach((n) => { if (!n.alive) { n.alive = true; n.role = "follower"; n.to = rt(); n.tot = n.to; } }); S.log("Crashed nodes restarted as followers; they catch up from the leader."); render(); });
    S.act("pause", (b) => { paused = !paused; b.textContent = paused ? "Resume" : "Pause"; });
    render(); S.log("S1 is the leader and sends heartbeats (green). The rings are each follower's election timeout.");
    return S;
  };

  SD.animations = A;
  SD._anim = { Stage, btn, sel, pick, rnd, ri, shuffle, hash };
})();
