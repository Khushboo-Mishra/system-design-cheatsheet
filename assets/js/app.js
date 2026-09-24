/* App shell: routing, pages, advisor engine, search, progress. */
(function () {
  const SD = window.SD;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const app = $("#app");

  /* ------------------------------ storage ----------------------------- */
  const store = {
    get(k, d) { try { const v = localStorage.getItem("sdcs:" + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem("sdcs:" + k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } }
  };
  let learned = new Set(store.get("learned", []));
  const isLearned = (id) => learned.has(id);
  function toggleLearned(id) { learned.has(id) ? learned.delete(id) : learned.add(id); store.set("learned", [...learned]); updateProgressBadge(); }

  /* ------------------------------ theme ------------------------------ */
  const root = document.documentElement;
  const savedTheme = store.get("theme", null);
  if (savedTheme) root.setAttribute("data-theme", savedTheme);
  $("#themeToggle").addEventListener("click", () => {
    const cur = root.getAttribute("data-theme") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next); store.set("theme", next);
  });

  /* ------------------------------ helpers ---------------------------- */
  const ico = (n, s) => SD.icon(n, s);
  const LEVEL_CLS = { Easy: "lv-easy", Medium: "lv-med", Hard: "lv-hard" };
  const dbById = Object.fromEntries(SD.databases.map((d) => [d.id, d]));
  const factorById = Object.fromEntries(SD.factors.map((f) => [f.id, f]));
  const scIcon = { link: "cdn", gauge: "gateway", db: "db", spider: "search", bell: "bell", feed: "service", chat: "queue", search: "search", play: "cdn", folder: "bucket", car: "geo", pin: "geo", cart: "card", card: "card", ticket: "card", trophy: "chart", chart: "chart", doc: "service", clock: "clock", service: "service", cdn: "cdn" };
  let cleanups = [];
  const onCleanup = (fn) => cleanups.push(fn);

  function reveal() {
    const io = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }), { rootMargin: "0px 0px -40px 0px" });
    $$(".reveal", app).forEach((el) => io.observe(el));
    onCleanup(() => io.disconnect());
  }
  function list(items, cls) { return `<ul class="${cls || "blist"}">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`; }
  function learnBtn(id) { return `<button class="btn learn ${isLearned(id) ? "on" : ""}" data-learn="${id}" aria-pressed="${isLearned(id)}">${isLearned(id) ? "✓ Learned" : "Mark as learned"}</button>`; }
  function bindLearn(scope) {
    $$("[data-learn]", scope).forEach((b) => b.addEventListener("click", () => {
      toggleLearned(b.dataset.learn);
      const on = isLearned(b.dataset.learn);
      b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "✓ Learned" : "Mark as learned";
    }));
  }
  function progressStats() {
    const s = SD.scenarios.filter((x) => learned.has("s:" + x.id)).length;
    const c = SD.concepts.filter((x) => learned.has("c:" + x.id)).length;
    return { s, c, total: SD.scenarios.length + SD.concepts.length, done: s + c };
  }
  function updateProgressBadge() {
    const p = progressStats();
    const b = $("#progressBadge");
    if (b) { b.textContent = `${p.done}/${p.total}`; b.title = `${p.s} scenarios + ${p.c} concepts learned`; }
  }

  /* ------------------------------ modal ------------------------------ */
  const modal = $("#modal");
  function openModal(html) {
    $(".modal-body", modal).innerHTML = html;
    modal.hidden = false; document.body.classList.add("noscroll");
    requestAnimationFrame(() => modal.classList.add("open"));
    $(".modal-close", modal).focus();
  }
  function closeModal() { modal.classList.remove("open"); document.body.classList.remove("noscroll"); setTimeout(() => (modal.hidden = true), 180); }
  modal.addEventListener("click", (e) => { if (e.target === modal || e.target.closest(".modal-close")) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !modal.hidden) closeModal(); });

  function dbDetail(id) {
    const d = dbById[id];
    return `<div class="dbd" style="--dbc:${d.color}">
      <div class="dbd-head"><span class="dbd-ico">${ico(d.icon === "key" ? "db" : d.icon === "cols" ? "db" : d.icon === "graph" ? "service" : d.icon === "vector" ? "service" : d.icon === "doc" ? "service" : d.icon, 26)}</span><div><h2>${esc(d.name)}</h2><p class="muted">${esc(d.tagline)}</p></div></div>
      <div class="chips">${d.examples.map((e) => `<span class="chip static">${esc(e)}</span>`).join("")}</div>
      <div class="kv-grid">
        <div><span>Data model</span><p>${esc(d.model)}</p></div>
        <div><span>Consistency</span><p>${esc(d.consistency)}</p></div>
        <div><span>Scaling</span><p>${esc(d.scaling)}</p></div>
        <div><span>CAP leaning</span><p>${esc(d.cap)}</p></div>
      </div>
      <div class="two">
        <div><h4 class="ok-t">✓ Strengths</h4>${list(d.strengths)}</div>
        <div><h4 class="bad-t">✗ Weaknesses</h4>${list(d.weaknesses)}</div>
        <div><h4>Use it when</h4>${list(d.useWhen)}</div>
        <div><h4>Avoid it when</h4>${list(d.avoidWhen)}</div>
      </div>
      <p class="realworld"><b>In the wild:</b> ${esc(d.realWorld)}</p>
    </div>`;
  }
  document.addEventListener("click", (e) => { const t = e.target.closest("[data-db]"); if (t) { e.preventDefault(); openModal(dbDetail(t.dataset.db)); } });

  /* --------------------- study-map references --------------------- */
  const pageNames = { numbers: "Numbers", databases: "Databases", advisor: "Stack Advisor", framework: "Framework", quiz: "Quiz & flashcards", map: "Study Map · architectures" };
  function refInfo(id) {
    if (id.startsWith("s:")) { const sc = SD.scenarios.find((x) => x.id === id.slice(2)); return sc && { kind: "scenario", label: sc.title, href: "#/scenario/" + sc.id, learn: "s:" + sc.id }; }
    if (id.startsWith("d:")) { const d = dbById[id.slice(2)]; return d && { kind: "database", label: d.short + " DB", href: "#/databases", db: d.id }; }
    if (id.startsWith("p:")) { const k = id.slice(2); return pageNames[k] && { kind: "page", label: pageNames[k] + " page", href: k === "map" ? "#/map/arch" : "#/" + k }; }
    const c = SD.concepts.find((x) => x.id === id);
    return c && { kind: "concept", label: c.title, href: "#/concept/" + c.id, learn: "c:" + c.id, live: !!c.anim, flow: !!c.diagram };
  }
  function refChip(id) {
    const r = refInfo(id);
    if (!r) return `<span class="mchip missing">${esc(id)}?</span>`;
    const done = r.learn && isLearned(r.learn);
    return `<a class="mchip k-${r.kind}${done ? " done" : ""}" href="${r.href}"${r.db ? ` data-db="${r.db}"` : ""}>${r.live ? "▶ " : ""}${done ? "✓ " : ""}${esc(r.label)}</a>`;
  }
  const backRefs = {};
  (function buildBackRefs() {
    const push = (id, ref) => { (backRefs[id] = backRefs[id] || []).push(ref); };
    SD.ddia.chapters.forEach((ch) => { let parent = ""; ch.sections.forEach(([t, ids, lvl]) => { if (!lvl) parent = t; ids.forEach((id) => push(id, { src: "DDIA", label: `Ch ${ch.n} · ${ch.title}`, sub: lvl ? `${parent} › ${t}` : t, href: "#/map/ddia-" + ch.n })); }); });
    SD.primer.groups.forEach((g) => g.items.forEach(([t, ids]) => ids.forEach((id) => push(id, { src: "Primer", label: g.title, sub: t, href: "#/map/primer" }))));
  })();
  function refsSection(id) {
    const list = backRefs[id]; if (!list || !list.length) return "";
    const seen = new Set(); const uniq = list.filter((r) => { const k = r.src + r.label + r.sub; if (seen.has(k)) return false; seen.add(k); return true; });
    return `<section class="card reveal"><h2>Covered in your reading</h2><div class="refs">${uniq.map((r) => `<a class="ref" href="${r.href}"><span class="ref-src ${r.src === "DDIA" ? "ddia" : "primer"}">${r.src}</span><span><b>${esc(r.label)}</b><small>${esc(r.sub)}</small></span></a>`).join("")}</div></section>`;
  }

  /* ============================== PAGES ============================== */
  const pages = {};

  /* ------------------------------- HOME ------------------------------ */
  pages.home = function () {
    const p = progressStats();
    const anims = SD.concepts.filter((c) => c.anim).length;
    app.innerHTML = `
      <section class="hero">
        <div class="hero-bg" aria-hidden="true"></div>
        <div class="hero-inner">
          <span class="eyebrow">Interactive system design cheat sheet</span>
          <h1>Design systems <span class="grad">you can see working.</span></h1>
          <p class="lead">Pick your requirements and get a recommended database and architecture. Then walk through ${SD.scenarios.length} real-world designs with animated request flows, and learn ${SD.concepts.length} core concepts through hands-on simulations.</p>
          <div class="cta">
            <a class="btn primary lg" href="#/advisor">${ico("gear", 18)} Open the Stack Advisor</a>
            <a class="btn lg" href="#/scenarios">${ico("service", 18)} Browse scenarios</a>
          </div>
          <div class="hero-stats">
            <div><b data-count="${SD.scenarios.length}">0</b><span>scenarios</span></div>
            <div><b data-count="${SD.databases.length}">0</b><span>database families</span></div>
            <div><b data-count="${SD.concepts.length}">0</b><span>concepts</span></div>
            <div><b data-count="${anims}">0</b><span>live simulations</span></div>
          </div>
        </div>
      </section>

      <section class="card reveal">
        <div class="sec-head"><div><h2>Life of a request</h2><p class="muted">A typical web architecture. Press play to follow a request, or click any box to learn what it does.</p></div></div>
        <div id="homeDiagram"></div>
      </section>

      <section class="reveal">
        <div class="sec-head"><div><h2>Learning path</h2><p class="muted">A good order if you're preparing for interviews or designing something real.</p></div></div>
        <div class="path">
          ${[
            ["#/framework", "1", "Interview framework", "The 7-step approach and what to cover in each step.", "clock"],
            ["#/numbers", "2", "Numbers to know", "Latency, throughput and a back-of-envelope calculator.", "chart"],
            ["#/concepts", "3", "Core concepts", "Caching, sharding, CAP, consensus… with simulations.", "service"],
            ["#/databases", "4", "Choosing a database", "Decision tree, catalog and fit matrix.", "db"],
            ["#/scenarios", "5", "Real-world designs", `${SD.scenarios.length} classic problems with animated architectures.`, "cdn"],
            ["#/quiz", "6", "Test yourself", "Scenario-based quiz with explanations.", "gateway"]
          ].map(([h, n, t, d, i]) => `<a class="path-step" href="${h}"><span class="pn">${n}</span><span class="pi">${ico(i, 22)}</span><b>${t}</b><span class="muted">${d}</span></a>`).join("")}
        </div>
      </section>

      <section class="reveal">
        <a class="banner" href="#/map">
          <span class="banner-ico">${ico("dns", 26)}</span>
          <span><b>Study Map: DDIA + System Design Primer</b><small>Every chapter and section of <i>Designing Data-Intensive Applications</i> and every topic in the System Design Primer, mapped to the concepts, simulations and scenarios here, with coverage and progress.</small></span>
          <span class="banner-go">Open →</span>
        </a>
      </section>

      <section class="grid2 reveal">
        <div class="card">
          <h3>Your progress</h3>
          <p class="muted">Mark scenarios and concepts as learned. Progress is saved in your browser.</p>
          <div class="prog"><div class="prog-bar"><i style="width:${(p.done / p.total) * 100}%"></i></div><span>${p.done} / ${p.total}</span></div>
          <div class="prog-split"><span><b>${p.s}</b>/${SD.scenarios.length} scenarios</span><span><b>${p.c}</b>/${SD.concepts.length} concepts</span><span>Best quiz: <b>${store.get("quizBest", "–")}</b></span></div>
        </div>
        <div class="card">
          <h3>Quick: "I need…"</h3>
          <div class="qp-mini">${SD.quickPicks.slice(0, 8).map(([p2, c, ex]) => `<div><span>${esc(p2)}</span><b>${esc(c)}</b><em>${esc(ex)}</em></div>`).join("")}</div>
          <a class="more" href="#/advisor">See all ${SD.quickPicks.length} quick picks →</a>
        </div>
      </section>`;
    const d = SD.renderDiagram($("#homeDiagram"), SD.homeDiagram, { autoplay: true, autoplayDelay: 1400, title: "Generic web architecture" });
    onCleanup(() => d.destroy());
    $$("[data-count]").forEach((el) => {
      const target = +el.dataset.count; const t0 = performance.now();
      const step = (now) => { const p2 = Math.min(1, (now - t0) / 1100); el.textContent = Math.round(target * (1 - Math.pow(1 - p2, 3))); if (p2 < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };

  /* ------------------------------ ADVISOR ---------------------------- */
  const PRIMARY_CANDIDATES = ["relational", "newsql", "document", "keyvalue", "widecolumn", "graph", "timeseries", "inmemory"];
  const SPECIALIST = ["blob", "text", "vec", "olap"];
  function scoreDb(db, factors) { if (!factors.length) return 0; return factors.reduce((s, f) => s + SD.scoreMatrix[db][f], 0) / (3 * factors.length); }
  function recommend(sel) {
    const F = new Set(sel);
    const M = SD.scoreMatrix;
    const pf = sel.filter((f) => !SPECIALIST.includes(f));
    const ranked = PRIMARY_CANDIDATES.map((db) => ({ db, s: scoreDb(db, pf) })).sort((a, b) => b.s - a.s);
    let primary = pf.length ? ranked[0].db : "relational";
    const slots = [];
    const reasonsFor = (db, fs) => {
      const good = fs.filter((f) => M[db][f] >= 3).map((f) => factorById[f].label.toLowerCase());
      return good.length ? "Excellent at: " + good.join(", ") + "." : "Best overall balance for your requirements.";
    };
    slots.push({ key: "primary", role: primary === "inmemory" ? "Primary (hot-path) store" : "Primary database", db: primary, why: pf.length ? reasonsFor(primary, pf) : "No primary-data requirements picked. A relational DB is the safest default for metadata and users.", type: primary === "inmemory" ? "cache" : "db" });
    if (primary === "inmemory") slots.push({ key: "durable", role: "Durable system of record", db: F.has("acid") ? "relational" : "keyvalue", why: "Redis is fast but not a durable source of truth. Persist events/state to a durable store and rebuild the in-memory view from it.", type: "db" });
    // uncovered capabilities
    const needSecondary = [["acid", F.has("global") || F.has("massive") ? "newsql" : "relational", "Transactions for the parts that need correctness (payments, bookings, inventory)."], ["rel", "relational", "Relational data with joins (users, orders, permissions)."], ["graph", "graph", "Multi-hop relationship queries."], ["ts", "timeseries", "Time-stamped metrics/events with retention and rollups."], ["global", "newsql", "Strong consistency across regions."]];
    needSecondary.forEach(([f, db, why]) => {
      if (F.has(f) && M[primary][f] <= 1 && db !== primary && !slots.some((s) => s.db === db)) slots.push({ key: "sec-" + db, role: "Secondary store", db, why, type: "db", sync: f === "acid" || f === "rel" || f === "global" });
    });
    const cacheNeeded = primary !== "inmemory" && (F.has("readHeavy") || F.has("lowLatency") || F.has("ttl") || F.has("realtime"));
    if (cacheNeeded) {
      const bits = [];
      if (F.has("readHeavy")) bits.push("absorbs repeated reads (cache-aside, TTL)");
      if (F.has("lowLatency")) bits.push("sub-millisecond hot-path lookups");
      if (F.has("ttl")) bits.push("native TTL for sessions/OTPs/counters");
      if (F.has("realtime")) bits.push("sorted sets & atomic counters for live rankings");
      slots.push({ key: "cache", role: "Cache / in-memory layer", db: "inmemory", why: "Redis " + bits.join("; ") + ".", type: "cache" });
    }
    if (F.has("geo") && M[primary].geo < 2) slots.push({ key: "geo", role: "Geospatial index", title: "Redis GEO / PostGIS / H3 cells", why: "Proximity queries need a spatial index (geohash, quadtree or H3). Keep live locations in memory and query the cell + neighbours.", type: "cache", icon: "geo" });
    if (F.has("blob")) slots.push({ key: "blob", role: "File / media storage", db: "object", why: "Store bytes in object storage (presigned uploads), keep metadata in the DB, and serve through a CDN.", type: "storage" });
    const asyncTargets = [];
    if (F.has("text")) { slots.push({ key: "search", role: "Search index", db: "search", why: "Full-text relevance, typo tolerance and facets. Feed it asynchronously from the primary via CDC or Kafka.", type: "search", async: true }); asyncTargets.push("search"); }
    if (F.has("vec")) { const pgv = primary === "relational"; slots.push({ key: "vector", role: "Vector search", db: "vector", title: pgv ? "pgvector (in your Postgres)" : null, why: pgv ? "Start with pgvector inside the existing Postgres. Move to a dedicated vector DB at larger scale." : "ANN search over embeddings for semantic retrieval / RAG, synced from the primary.", type: "search", async: !pgv }); if (!pgv) asyncTargets.push("vector"); }
    if (F.has("olap")) { slots.push({ key: "olap", role: "Analytics store", db: "warehouse", why: "Columnar OLAP for aggregations. Load via CDC/stream (ClickHouse/Pinot for real-time, Snowflake/BigQuery for BI). Keeps heavy queries off the OLTP DB.", type: "analytics", async: true }); asyncTargets.push("olap"); }
    const queueNeeded = F.has("writeHeavy") || asyncTargets.length > 0;
    if (queueNeeded) slots.push({ key: "queue", role: "Message queue / log", title: "Kafka / SQS", why: (F.has("writeHeavy") ? "Buffers write spikes and decouples producers from storage. " : "") + (asyncTargets.length ? "Streams changes (CDC/outbox) to the search/analytics/vector stores." : ""), type: "queue" });
    const replicas = F.has("readHeavy") && ["relational", "newsql", "document"].includes(primary);
    return { primary, slots, replicas, queueNeeded, cacheNeeded, F };
  }
  function stackDiagram(rec) {
    const N = (id, label, sub, type, x, y, desc, icon) => ({ id, label, sub, type, x, y, desc, icon });
    const s = (k) => rec.slots.find((x) => x.key === k);
    const nodes = [N("client", "Clients", "web / mobile", "client", 80, 260, "Your users."), N("gw", "API Gateway / LB", "auth · rate limit", "edge", 250, 260, "Terminates TLS, authenticates and load-balances across stateless services.", "gateway"), N("app", "App Services", "stateless", "service", 420, 260, "Your business logic. Stateless and horizontally scalable.")];
    const edges = [["client", "gw"], ["gw", "app"]];
    const name = (slot) => slot.title || (slot.db ? dbById[slot.db].examples.slice(0, 2).join(" / ") : "");
    const p = s("primary");
    nodes.push(N("primary", dbById[p.db].short, dbById[p.db].examples[0], p.type, 590, 260, dbById[p.db].tagline));
    edges.push(["app", "primary"]);
    if (rec.replicas) { nodes.push(N("rep", "Read Replicas", "async", "db", 760, 260, "Scale reads; slightly stale.")); edges.push(["primary", "rep"]); }
    if (s("cache")) { nodes.push(N("cache", "Cache", "Redis", "cache", 590, 140, s("cache").why)); edges.push(["app", "cache"]); }
    if (s("geo")) { nodes.push(N("geo", "Geo Index", "Redis GEO / H3", "cache", 590, 40, s("geo").why, "geo")); edges.push(["app", "geo", "", 0.15]); }
    if (s("durable")) { nodes.push(N("durable", "Durable Store", dbById[s("durable").db].examples[0], "db", 760, 140, s("durable").why)); edges.push(["primary", "durable"]); }
    const secs = rec.slots.filter((x) => x.key.startsWith("sec-"));
    const syncSec = secs.filter((x) => x.sync).slice(0, 1);
    const asyncSec = secs.filter((x) => !syncSec.includes(x));
    syncSec.forEach((x) => { if (!s("durable")) { nodes.push(N(x.key, dbById[x.db].short, dbById[x.db].examples[0], "db", 760, 140, x.why)); edges.push(["app", x.key]); } else asyncSec.push(x); });
    if (s("blob")) {
      nodes.push(N("cdn", "CDN", "edge cache", "edge", 250, 90, "Serves media from the edge.", "cdn"));
      nodes.push(N("obj", "Object Storage", "S3 / GCS", "storage", 420, 90, s("blob").why));
      edges.push(["client", "cdn"], ["cdn", "obj"], ["app", "obj"]);
    }
    const right = [];
    if (rec.queueNeeded) {
      nodes.push(N("queue", "Kafka / Queue", "events · CDC", "queue", 590, 400, s("queue").why));
      nodes.push(N("worker", "Workers", "consumers", "worker", 760, 400, "Consume events and update downstream stores asynchronously."));
      edges.push(["app", "queue"], ["queue", "worker"]);
      ["search", "vector", "olap"].forEach((k) => { const x = s(k); if (x && x.async !== false) right.push(x); });
      asyncSec.forEach((x) => right.push(x));
    } else if (s("vector") && s("vector").async === false) { /* pgvector lives in primary */ }
    const ys = { 1: [400], 2: [330, 470], 3: [280, 400, 520], 4: [230, 340, 450, 560], 5: [200, 300, 400, 500, 600] }[Math.min(5, right.length)] || [];
    right.slice(0, 5).forEach((x, i) => {
      const lbl = x.key === "olap" ? "Analytics" : x.key === "search" ? "Search" : x.key === "vector" ? "Vector DB" : dbById[x.db].short;
      nodes.push(N(x.key, lbl, name(x), x.type, 920, ys[i], x.why));
      edges.push(["worker", x.key]);
    });
    const write = [["client", "gw", "POST /resource"], ["gw", "app", "Authenticated, rate-limited request"], ["app", "primary", "Write to the " + dbById[p.db].short + " (source of truth)"]];
    if (s("blob")) write.splice(2, 0, ["app", "obj", "Issue a presigned URL; the client uploads bytes directly to object storage"]);
    if (s("cache")) write.push(["app", "cache", "Invalidate / update affected cache keys"]);
    if (rec.replicas) write.push(["primary", "rep", "Replicate asynchronously to read replicas"]);
    if (rec.queueNeeded) { write.push(["app", "queue", "Publish a change event (outbox / CDC)"]); write.push(["queue", "worker", "Consumers pick up the event"]); right.slice(0, 5).forEach((x) => write.push(["worker", x.key, "Update the " + (x.key === "olap" ? "analytics store" : x.key === "search" ? "search index" : x.key === "vector" ? "embeddings index" : dbById[x.db].short)])); }
    write.push(["app", "client", "201 Created"]);
    const read = [["client", "gw", "GET /resource"], ["gw", "app", "Route to a service instance"]];
    if (s("cache")) read.push(["app", "cache", "Check the cache first (sub-ms)"]);
    if (s("geo")) read.push(["app", "geo", "Nearby query: cell + neighbours"]);
    read.push(["app", rec.replicas ? "rep" : "primary", "On a cache miss, read from the " + (rec.replicas ? "replica" : "primary")]);
    if (s("search") && s("search").async !== false && rec.queueNeeded) read.push(["app", "search", "Full-text queries go to the search index"]);
    if (s("vector") && rec.queueNeeded && s("vector").async !== false) read.push(["app", "vector", "Semantic similarity (kNN) search"]);
    if (s("blob")) read.push(["client", "cdn", "Media is fetched from the nearest CDN edge"], ["cdn", "obj", "Edge miss → origin fetch, then cached"]);
    read.push(["app", "client", "Response"]);
    return { nodes, edges, flows: [{ name: "Write path", steps: write }, { name: "Read path", steps: read }] };
  }

  pages.advisor = function () {
    let sel = store.get("advisorSel", []);
    const groups = [...new Set(SD.factors.map((f) => f.group))];
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Stack Advisor</span><h1>Tell me what you need. I'll suggest the stack.</h1>
      <p class="lead">Select the requirements of your system (or start from a preset). The advisor scores ${SD.databases.length} database families, then builds a recommended polyglot architecture with an animated diagram.</p></div>
      <div class="advisor">
        <aside class="adv-left card">
          <h3>Presets</h3>
          <div class="chips wrap">${SD.advisorPresets.map((p, i) => `<button class="chip" data-preset="${i}">${esc(p.name)}</button>`).join("")}</div>
          ${groups.map((g) => `<h3>${g}</h3><div class="reqs">${SD.factors.filter((f) => f.group === g).map((f) => `<button class="req" data-f="${f.id}" aria-pressed="false"><span class="req-box"></span><span><b>${esc(f.label)}</b><small>${esc(f.hint)}</small></span></button>`).join("")}</div>`).join("")}
          <button class="btn ghost full" data-clear>Clear all</button>
        </aside>
        <div class="adv-right" id="advOut"></div>
      </div>
      <section class="card reveal">
        <div class="sec-head"><div><h2>Quick picks: problem → component</h2><p class="muted">The classic lookup table. Filter it.</p></div><input class="search-inline" id="qpFilter" type="search" placeholder="Filter… e.g. search, queue, geo"></div>
        <div class="qp-table" id="qpTable"></div>
      </section>`;
    const out = $("#advOut");
    let diag = null;
    function renderQP(q) {
      q = (q || "").toLowerCase();
      $("#qpTable").innerHTML = SD.quickPicks.filter((r) => r.join(" ").toLowerCase().includes(q)).map(([p, c, ex]) => `<div class="qp-row"><span>${esc(p)}</span><b>${esc(c)}</b><em>${esc(ex)}</em></div>`).join("") || `<p class="muted">No matches.</p>`;
    }
    renderQP(""); $("#qpFilter").addEventListener("input", (e) => renderQP(e.target.value));
    function sync() {
      $$(".req").forEach((b) => { const on = sel.includes(b.dataset.f); b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); });
      store.set("advisorSel", sel);
      render();
    }
    function render() {
      if (diag) { diag.destroy(); diag = null; }
      if (!sel.length) {
        out.innerHTML = `<div class="card empty"><div class="empty-art">${ico("db", 56)}</div><h3>Pick a few requirements</h3><p class="muted">Choose from the list or tap a preset like <b>Banking / payments</b> or <b>Chat messages</b>. Recommendations update instantly.</p></div>`;
        return;
      }
      const rec = recommend(sel);
      const all = SD.databases.map((d) => ({ d, s: scoreDb(d.id, sel) })).sort((a, b) => b.s - a.s);
      const M = SD.scoreMatrix;
      out.innerHTML = `
        <div class="card">
          <div class="sec-head"><div><h2>Recommended stack</h2><p class="muted">For: ${sel.map((f) => `<span class="tag">${esc(factorById[f].label)}</span>`).join(" ")}</p></div></div>
          <div class="slots">${rec.slots.map((s, i) => {
            const d = s.db ? dbById[s.db] : null;
            return `<div class="slot-card" style="--dbc:${d ? d.color : "var(--accent)"}; animation-delay:${i * 70}ms">
              <span class="slot-role">${esc(s.role)}</span>
              <h4>${esc(s.title || (d ? d.name : ""))}</h4>
              ${d ? `<div class="chips">${d.examples.slice(0, 4).map((e) => `<span class="chip static sm">${esc(e)}</span>`).join("")}</div>` : ""}
              <p>${esc(s.why)}</p>
              ${d ? `<a href="#" class="more" data-db="${d.id}">Details →</a>` : ""}
            </div>`; }).join("")}</div>
        </div>
        <div class="card"><div class="sec-head"><div><h2>Generated architecture</h2><p class="muted">Built from your requirements. Play the write and read paths.</p></div></div><div id="advDiagram"></div></div>
        <div class="card">
          <div class="sec-head"><div><h2>How every database family scores</h2><p class="muted">Average fit (0–100%) across your selected requirements. Tap one for details.</p></div></div>
          <div class="rank">${all.map(({ d, s }, i) => {
            const pros = sel.filter((f) => M[d.id][f] >= 3).map((f) => factorById[f].label);
            const cons = sel.filter((f) => M[d.id][f] === 0).map((f) => factorById[f].label);
            return `<button class="rank-row" data-db="${d.id}" style="--dbc:${d.color}">
              <span class="rank-n">${i + 1}</span>
              <span class="rank-name"><b>${esc(d.name)}</b><small>${esc(d.examples.slice(0, 3).join(", "))}</small></span>
              <span class="rank-bar"><i style="--w:${Math.round(s * 100)}%; animation-delay:${i * 50}ms"></i></span>
              <span class="rank-pct">${Math.round(s * 100)}%</span>
              <span class="rank-why">${pros.length ? `<span class="ok-t">✓ ${esc(pros.join(" · "))}</span>` : ""}${cons.length ? `<span class="bad-t">✗ ${esc(cons.join(" · "))}</span>` : ""}</span>
            </button>`; }).join("")}</div>
        </div>`;
      diag = SD.renderDiagram($("#advDiagram"), stackDiagram(rec), { title: "Generated architecture" });
    }
    $$(".req").forEach((b) => b.addEventListener("click", () => { const f = b.dataset.f; sel = sel.includes(f) ? sel.filter((x) => x !== f) : [...sel, f]; $$("[data-preset]").forEach((c) => c.classList.remove("on")); sync(); }));
    $$("[data-preset]").forEach((b) => b.addEventListener("click", () => { sel = SD.advisorPresets[+b.dataset.preset].f.slice(); $$("[data-preset]").forEach((c) => c.classList.toggle("on", c === b)); sync(); if (innerWidth < 1140) out.scrollIntoView({ behavior: "smooth" }); }));
    $("[data-clear]").addEventListener("click", () => { sel = []; $$("[data-preset]").forEach((c) => c.classList.remove("on")); sync(); });
    onCleanup(() => diag && diag.destroy());
    sync();
  };

  /* ----------------------------- DATABASES --------------------------- */
  pages.databases = function () {
    const F = SD.factors;
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Databases</span><h1>Choosing the right database</h1>
      <p class="lead">Answer a few questions, browse the ${SD.databases.length} families, or compare them side by side. Rule of thumb: <b>start with PostgreSQL</b> unless your access pattern, scale or data shape clearly calls for something else.</p>
      <nav class="subnav"><a href="#tree" data-scroll>Decision tree</a><a href="#catalog" data-scroll>Catalog</a><a href="#matrix" data-scroll>Fit matrix</a><a href="#sqlnosql" data-scroll>SQL vs NoSQL</a><a href="#engines" data-scroll>Storage engines</a></nav></div>
      <section class="card" id="tree"><div class="sec-head"><div><h2>Decision tree</h2><p class="muted">Answer the questions to reach a recommendation.</p></div><button class="btn sm" id="treeReset">Start over</button></div><div class="tree" id="treeBox"></div></section>
      <section id="catalog" class="reveal"><div class="sec-head"><div><h2>Catalog</h2><p class="muted">Tap a card for strengths, weaknesses, use cases and real-world users.</p></div></div>
        <div class="dbgrid">${SD.databases.map((d) => `<button class="dbcard" data-db="${d.id}" style="--dbc:${d.color}"><span class="dbcard-top"></span><b>${esc(d.name)}</b><p>${esc(d.tagline)}</p><div class="chips">${d.examples.slice(0, 4).map((e) => `<span class="chip static sm">${esc(e)}</span>`).join("")}</div><span class="dbcard-cap">${esc(d.cap)}</span></button>`).join("")}</div></section>
      <section class="card reveal" id="matrix"><div class="sec-head"><div><h2>Fit matrix</h2><p class="muted">How well each family handles each requirement (darker = better). This is the same scoring the Advisor uses.</p></div></div>
        <div class="matrix-wrap"><table class="matrix"><thead><tr><th></th>${F.map((f) => `<th title="${esc(f.hint)}"><span>${esc(f.label)}</span></th>`).join("")}</tr></thead>
        <tbody>${SD.databases.map((d) => `<tr><th><a href="#" data-db="${d.id}">${esc(d.short)}</a></th>${F.map((f) => { const v = SD.scoreMatrix[d.id][f.id]; return `<td class="m${v}" title="${esc(d.short)} · ${esc(f.label)}: ${["poor", "weak", "good", "excellent"][v]}">${["·", "◔", "◑", "●"][v]}</td>`; }).join("")}</tr>`).join("")}</tbody></table></div></section>
      <section class="card reveal" id="sqlnosql"><h2>SQL vs NoSQL</h2><div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>SQL (relational)</th><th>NoSQL</th></tr></thead><tbody>${SD.sqlVsNoSql.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td>${esc(r[2])}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="card reveal" id="engines"><h2>Storage engines</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Engine</th><th>Used by</th><th>How it works</th><th>Great at</th><th>Weak at</th></tr></thead><tbody>${SD.engines.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(c)}</td>` : `<th>${esc(c)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div>
      <p class="muted">See the <a href="#/concept/storage-engines">LSM-tree simulation</a> for a hands-on look.</p></section>`;
    // decision tree
    let path = [];
    const box = $("#treeBox");
    function renderTree() {
      const nodeId = path.length ? path[path.length - 1].next : "start";
      const node = SD.dbTree[nodeId];
      const crumbs = path.map((p, i) => `<button class="crumb" data-back="${i}"><span>${esc(SD.dbTree[p.from].q)}</span><b>${esc(p.label)}</b></button>`).join("");
      let body;
      if (node.db) {
        const d = dbById[node.db];
        body = `<div class="tree-result" style="--dbc:${d.color}"><span class="eyebrow">Recommendation</span><h3>${esc(d.name)}</h3><div class="chips">${d.examples.map((e) => `<span class="chip static sm">${esc(e)}</span>`).join("")}</div><p>${esc(node.note)}</p><div class="cta"><a href="#" class="btn primary" data-db="${d.id}">Learn about ${esc(d.short)}</a><a class="btn" href="#/advisor">Refine in the Advisor</a></div></div>`;
      } else {
        body = `<div class="tree-q"><h3>${esc(node.q)}</h3><div class="tree-opts">${node.opts.map(([label, next], i) => `<button class="tree-opt" data-i="${i}" style="animation-delay:${i * 45}ms"><span>${esc(label)}</span>${ico("service", 16)}</button>`).join("")}</div></div>`;
      }
      box.innerHTML = `<div class="crumbs">${crumbs}</div>${body}`;
      $$(".tree-opt", box).forEach((b) => b.addEventListener("click", () => { const [label, next] = node.opts[+b.dataset.i]; path.push({ from: nodeId, label, next }); renderTree(); }));
      $$(".crumb", box).forEach((b) => b.addEventListener("click", () => { path = path.slice(0, +b.dataset.back); renderTree(); }));
    }
    renderTree();
    $("#treeReset").addEventListener("click", () => { path = []; renderTree(); });
  };

  /* ----------------------------- SCENARIOS --------------------------- */
  pages.scenarios = function () {
    const cats = ["All", ...new Set(SD.scenarios.map((s) => s.category))];
    let cat = "All", lvl = "All", q = "";
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Scenarios</span><h1>Real-world system designs</h1>
      <p class="lead">Each design covers requirements, estimates, API, data model, the key database and component decisions (and why), an animated architecture with request flows, deep dives and pitfalls.</p></div>
      <div class="filters">
        <input type="search" class="search-inline" id="scQ" placeholder="Search scenarios, tech, patterns…">
        <div class="chips wrap">${cats.map((c) => `<button class="chip ${c === "All" ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
        <div class="chips">${["All", "Easy", "Medium", "Hard"].map((l) => `<button class="chip ${l === "All" ? "on" : ""}" data-lvl="${l}">${l === "All" ? "Any level" : l}</button>`).join("")}</div>
      </div>
      <div class="scgrid" id="scGrid"></div>`;
    function render() {
      const items = SD.scenarios.filter((s) => (cat === "All" || s.category === cat) && (lvl === "All" || s.level === lvl) && (!q || [s.title, s.aka, s.summary, s.category, ...s.tags].join(" ").toLowerCase().includes(q)));
      $("#scGrid").innerHTML = items.map((s, i) => `
        <a class="sccard" href="#/scenario/${s.id}" style="animation-delay:${i * 30}ms">
          <div class="sccard-top"><span class="sc-ico">${ico(scIcon[s.icon] || "service", 22)}</span><span class="lv ${LEVEL_CLS[s.level]}">${s.level}</span>${isLearned("s:" + s.id) ? '<span class="done-badge" title="Learned">✓</span>' : ""}</div>
          <h3>${esc(s.title)}</h3><span class="aka">${esc(s.aka)}</span>
          <p>${esc(s.summary)}</p>
          <div class="chips">${s.tags.slice(0, 4).map((t) => `<span class="chip static sm">${esc(t)}</span>`).join("")}</div>
          <span class="sc-cat">${esc(s.category)}</span>
        </a>`).join("") || `<p class="muted">No scenarios match.</p>`;
    }
    $$("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; $$("[data-cat]").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
    $$("[data-lvl]").forEach((b) => b.addEventListener("click", () => { lvl = b.dataset.lvl; $$("[data-lvl]").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
    $("#scQ").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); render(); });
    render();
  };

  pages.scenario = function (id) {
    const idx = SD.scenarios.findIndex((s) => s.id === id);
    if (idx < 0) return pages.notfound();
    const s = SD.scenarios[idx], prev = SD.scenarios[idx - 1], next = SD.scenarios[idx + 1];
    app.innerHTML = `
      <a class="back" href="#/scenarios">← All scenarios</a>
      <header class="sc-head reveal">
        <span class="sc-ico big">${ico(scIcon[s.icon] || "service", 30)}</span>
        <div class="sc-head-t"><div class="badges"><span class="lv ${LEVEL_CLS[s.level]}">${s.level}</span><span class="tag">${esc(s.category)}</span></div>
          <h1>${esc(s.title)}</h1><span class="aka">${esc(s.aka)}</span><p class="lead">${esc(s.summary)}</p></div>
        <div class="sc-head-a">${learnBtn("s:" + s.id)}</div>
      </header>
      <nav class="subnav sticky-sub"><a href="#req" data-scroll>Requirements</a><a href="#est" data-scroll>Estimates</a><a href="#arch" data-scroll>Architecture</a><a href="#choices" data-scroll>Key decisions</a><a href="#api" data-scroll>API & data</a><a href="#deep" data-scroll>Deep dives</a><a href="#pit" data-scroll>Pitfalls</a></nav>
      <section class="grid2 reveal" id="req">
        <div class="card"><h2>Functional requirements</h2>${list(s.functional, "clist")}</div>
        <div class="card"><h2>Non-functional requirements</h2>${list(s.nonFunctional, "clist nf")}</div>
      </section>
      <section class="card reveal" id="est"><h2>Back-of-the-envelope</h2><div class="est-grid">${s.estimates.map(([k, v]) => `<div class="est"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join("")}</div></section>
      <section class="card" id="arch"><div class="sec-head"><div><h2>Architecture</h2><p class="muted">Pick a flow and press play. Click components for details.</p></div></div><div id="scDiagram"></div></section>
      <section class="reveal" id="choices"><div class="sec-head"><div><h2>Key decisions: what to use, and why</h2></div></div>
        <div class="choices">${s.choices.map((c, i) => `<div class="choice" style="animation-delay:${i * 60}ms"><span class="choice-c">${esc(c.c)}</span><h4>${esc(c.pick)}</h4><p>${esc(c.why)}</p>${c.alt ? `<p class="alt"><b>Alternative:</b> ${esc(c.alt)}</p>` : ""}</div>`).join("")}</div></section>
      <section class="grid2 reveal" id="api">
        <div class="card"><h2>API</h2><pre class="code">${s.api.map(esc).join("\n")}</pre></div>
        <div class="card"><h2>Data model</h2><pre class="code">${s.dataModel.map(esc).join("\n")}</pre></div>
      </section>
      <section class="card reveal" id="deep"><h2>Deep dives</h2>${s.deepDives.map((d, i) => `<details class="acc" ${i === 0 ? "open" : ""}><summary>${esc(d.t)}</summary><div>${d.p ? `<p>${esc(d.p)}</p>` : ""}${d.b ? list(d.b) : ""}</div></details>`).join("")}</section>
      <section class="grid2 reveal" id="pit">
        <div class="card"><h2>Common pitfalls</h2>${list(s.pitfalls, "xlist")}</div>
        <div class="card"><h2>Trade-offs</h2><div class="tos">${s.tradeoffs.map(([a, b]) => `<div class="to"><span>${esc(a)}</span><i>vs</i><span>${esc(b)}</span></div>`).join("")}</div></div>
      </section>
      ${refsSection("s:" + s.id)}
      <nav class="pn-nav">${prev ? `<a href="#/scenario/${prev.id}"><small>← Previous</small><b>${esc(prev.title)}</b></a>` : "<span></span>"}${next ? `<a class="r" href="#/scenario/${next.id}"><small>Next →</small><b>${esc(next.title)}</b></a>` : "<span></span>"}</nav>`;
    const d = SD.renderDiagram($("#scDiagram"), s.diagram, { title: s.title + " architecture" });
    onCleanup(() => d.destroy());
    bindLearn(app);
  };

  /* ------------------------------ CONCEPTS --------------------------- */
  pages.concepts = function () {
    let cat = "All", q = "";
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Concepts</span><h1>Core concepts</h1>
      <p class="lead">${SD.concepts.length} building blocks of distributed systems. Cards marked <span class="badge live">▶ Simulation</span> have a hands-on animation; <span class="badge flow">⇢ Flow</span> have a step-by-step diagram.</p></div>
      <div class="filters">
        <input type="search" class="search-inline" id="cQ" placeholder="Search concepts…">
        <div class="chips wrap">${["All", ...SD.conceptCategories].map((c) => `<button class="chip ${c === "All" ? "on" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("")}</div>
      </div>
      <div id="cGrid"></div>`;
    function render() {
      const items = SD.concepts.filter((c) => (cat === "All" || c.cat === cat) && (!q || [c.title, c.summary, c.cat, ...c.points].join(" ").toLowerCase().includes(q)));
      const byCat = SD.conceptCategories.map((k) => [k, items.filter((c) => c.cat === k)]).filter(([, v]) => v.length);
      $("#cGrid").innerHTML = byCat.map(([k, v]) => `<h2 class="cat-h">${esc(k)}</h2><div class="cgrid">${v.map((c, i) => `
        <a class="ccard" href="#/concept/${c.id}" style="animation-delay:${i * 25}ms">
          <div class="ccard-top">${c.anim ? '<span class="badge live">▶ Simulation</span>' : c.diagram ? '<span class="badge flow">⇢ Flow</span>' : c.code ? '<span class="badge code">{ } Code</span>' : '<span class="badge">Read</span>'}${isLearned("c:" + c.id) ? '<span class="done-badge">✓</span>' : ""}</div>
          <h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p></a>`).join("")}</div>`).join("") || `<p class="muted">No concepts match.</p>`;
    }
    $$("[data-cat]").forEach((b) => b.addEventListener("click", () => { cat = b.dataset.cat; $$("[data-cat]").forEach((x) => x.classList.toggle("on", x === b)); render(); }));
    $("#cQ").addEventListener("input", (e) => { q = e.target.value.toLowerCase(); render(); });
    render();
  };

  pages.concept = function (id) {
    const idx = SD.concepts.findIndex((c) => c.id === id);
    if (idx < 0) return pages.notfound();
    const c = SD.concepts[idx], prev = SD.concepts[idx - 1], next = SD.concepts[idx + 1];
    const related = SD.concepts.filter((x) => x.cat === c.cat && x.id !== c.id);
    app.innerHTML = `
      <a class="back" href="#/concepts">← All concepts</a>
      <header class="sc-head reveal"><div class="sc-head-t"><div class="badges"><span class="tag">${esc(c.cat)}</span>${c.anim ? '<span class="badge live">▶ Simulation</span>' : c.diagram ? '<span class="badge flow">⇢ Flow</span>' : ""}</div>
        <h1>${esc(c.title)}</h1><p class="lead">${esc(c.summary)}</p></div><div class="sc-head-a">${learnBtn("c:" + c.id)}</div></header>
      ${c.anim || c.diagram ? `<section class="card demo"><div id="cDemo"></div></section>` : ""}
      <section class="card reveal"><h2>Key points</h2>${list(c.points, "clist")}</section>
      <section class="grid2 reveal">
        <div class="card"><h2>When to use</h2>${list(c.use, "clist ok")}</div>
        <div class="card"><h2>Pitfalls</h2>${list(c.pitfalls, "xlist")}</div>
      </section>
      ${c.table ? `<section class="card reveal"><div class="table-wrap"><table class="tbl"><thead><tr>${c.table[0].map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${c.table.slice(1).map((r) => `<tr>${r.map((x, i) => (i ? `<td>${esc(x)}</td>` : `<th>${esc(x)}</th>`)).join("")}</tr>`).join("")}</tbody></table></div></section>` : ""}
      ${c.code ? `<section class="card reveal"><h2>Design sketch</h2><pre class="code">${esc(c.code)}</pre></section>` : ""}
      ${refsSection(c.id)}
      ${related.length ? `<section class="reveal"><h2>Related in ${esc(c.cat)}</h2><div class="chips wrap">${related.map((r) => `<a class="chip" href="#/concept/${r.id}">${esc(r.title)}</a>`).join("")}</div></section>` : ""}
      <nav class="pn-nav">${prev ? `<a href="#/concept/${prev.id}"><small>← Previous</small><b>${esc(prev.title)}</b></a>` : "<span></span>"}${next ? `<a class="r" href="#/concept/${next.id}"><small>Next →</small><b>${esc(next.title)}</b></a>` : "<span></span>"}</nav>`;
    if (c.anim && SD.animations[c.anim]) { const a = SD.animations[c.anim]($("#cDemo")); onCleanup(() => a.destroy()); }
    else if (c.diagram) { const d = SD.renderDiagram($("#cDemo"), c.diagram, { title: c.title }); onCleanup(() => d.destroy()); }
    bindLearn(app);
  };

  /* ------------------------------ NUMBERS ---------------------------- */
  function fmtNum(n) { const a = Math.abs(n); if (a >= 1e12) return (n / 1e12).toFixed(1) + " T"; if (a >= 1e9) return (n / 1e9).toFixed(1) + " B"; if (a >= 1e6) return (n / 1e6).toFixed(1) + " M"; if (a >= 1e3) return (n / 1e3).toFixed(1) + " K"; return n.toFixed(n < 10 ? 1 : 0); }
  function fmtBytes(b) { const u = ["B", "KB", "MB", "GB", "TB", "PB", "EB"]; let i = 0; while (b >= 1000 && i < u.length - 1) { b /= 1000; i++; } return (b < 10 ? b.toFixed(2) : b < 100 ? b.toFixed(1) : b.toFixed(0)) + " " + u[i]; }
  function fmtRate(bps) { const bits = bps * 8; const u = ["bps", "Kbps", "Mbps", "Gbps", "Tbps"]; let i = 0, v = bits; while (v >= 1000 && i < u.length - 1) { v /= 1000; i++; } return `${fmtBytes(bps)}/s (${v.toFixed(1)} ${u[i]})`; }
  function humanDur(sec) {
    const units = [["years", 31536000], ["days", 86400], ["hours", 3600], ["min", 60], ["s", 1]];
    for (const [u, s] of units) if (sec >= s) return (sec / s).toFixed(sec / s < 10 ? 1 : 0) + " " + u;
    return sec.toFixed(2) + " s";
  }
  pages.numbers = function () {
    const lat = SD.latency.slice().sort((a, b) => a[1] - b[1]);
    const maxLog = Math.log10(lat[lat.length - 1][1]);
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Numbers</span><h1>Numbers every engineer should know</h1>
      <p class="lead">Use orders of magnitude to justify designs: what fits in memory, what needs sharding, where the latency goes.</p>
      <nav class="subnav"><a href="#lat" data-scroll>Latency</a><a href="#calc" data-scroll>Estimator</a><a href="#avail" data-scroll>Availability</a><a href="#cap" data-scroll>Capacities</a><a href="#conv" data-scroll>Conversions</a></nav></div>
      <section class="card" id="lat"><div class="sec-head"><div><h2>Latency numbers</h2><p class="muted">Log scale. Approximate, 2020s hardware.</p></div><label class="toggle"><input type="checkbox" id="humanize"><span>Humanise (if L1 = 1 second)</span></label></div>
        <div class="lat">${lat.map(([op, ns, h], i) => `<div class="lat-row"><span class="lat-op">${esc(op)}</span><span class="lat-bar"><i style="--w:${Math.max(2, (Math.log10(ns) / maxLog) * 100)}%; animation-delay:${i * 40}ms" class="${ns < 1e3 ? "b1" : ns < 1e6 ? "b2" : ns < 1e8 ? "b3" : "b4"}"></i></span><span class="lat-v" data-ns="${ns}" data-h="${esc(h)}">${esc(h)}</span></div>`).join("")}</div>
        <div class="lat-legend"><span class="b1">nanoseconds (CPU / memory)</span><span class="b2">microseconds (SSD, network)</span><span class="b3">milliseconds (datacentre, disk)</span><span class="b4">100s of ms (cross-continent)</span></div>
        <p class="muted small">Takeaways: memory is ~100× faster than SSD random reads; a round trip inside a datacentre (~0.5 ms) costs as much as reading ~150 MB from RAM; cross-continent round trips dominate everything, so put data and compute close to users.</p>
      </section>
      ${SD.latencyClassic ? `<section class="grid2 reveal">
        <div class="card"><h2>The classic table (2012)</h2><p class="muted">The widely quoted "latency numbers every programmer should know". Hardware has improved (see above), but the ratios still hold.</p><div class="table-wrap"><table class="tbl compact"><tbody>${SD.latencyClassic.map((r) => `<tr><th>${esc(r[0])}</th><td class="mono">${esc(r[1])}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><h2>Handy throughput metrics</h2><p class="muted">Derived from the classic numbers, useful for quick estimates.</p><div class="table-wrap"><table class="tbl compact"><tbody>${SD.handyMetrics.map((r) => `<tr><th>${esc(r[0])}</th><td class="mono"><b>${esc(r[1])}</b></td></tr>`).join("")}</tbody></table></div>
          <p class="muted small">So streaming 1 GB takes ~0.25 s from RAM, ~1 s from SSD, ~10 s over 1 Gbps, and ~33 s from a spinning disk.</p></div>
      </section>` : ""}
      <section class="card reveal" id="calc"><div class="sec-head"><div><h2>Back-of-the-envelope estimator</h2><p class="muted">Tweak the inputs; results update live.</p></div>
        <div class="chips">${[["Social feed", { dau: 300, wpu: 0.5, ratio: 100, wsize: 1, rsize: 20, years: 5, rf: 3, peak: 3, hot: 20 }], ["URL shortener", { dau: 100, wpu: 1, ratio: 100, wsize: 0.5, rsize: 0.5, years: 5, rf: 3, peak: 2, hot: 20 }], ["Chat app", { dau: 500, wpu: 40, ratio: 1, wsize: 0.1, rsize: 0.1, years: 2, rf: 3, peak: 3, hot: 10 }], ["Photo sharing", { dau: 50, wpu: 0.2, ratio: 100, wsize: 2000, rsize: 200, years: 10, rf: 3, peak: 3, hot: 20 }]].map(([n, v]) => `<button class="chip" data-calc='${JSON.stringify(v)}'>${n}</button>`).join("")}</div></div>
        <div class="calc">
          <div class="calc-in">${[["dau", "Daily active users (millions)", 100], ["wpu", "Writes per user per day", 2], ["ratio", "Reads per write (read:write)", 50], ["wsize", "Avg size per write (KB)", 1], ["rsize", "Avg read response (KB)", 5], ["years", "Retention (years)", 5], ["rf", "Replication factor", 3], ["peak", "Peak / average multiplier", 3], ["hot", "Hot data to cache (% of daily reads)", 20]].map(([k, l, v]) => `<label><span>${l}</span><input type="number" min="0" step="any" data-k="${k}" value="${v}"></label>`).join("")}</div>
          <div class="calc-out" id="calcOut"></div>
        </div></section>
      <section class="grid2 reveal" id="avail">
        <div class="card"><h2>Availability: the nines</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Availability</th><th></th><th>Downtime / year</th><th>/ month</th><th>/ week</th><th>/ day</th></tr></thead><tbody>${SD.nines.map((r) => `<tr><th>${r[0]}</th><td class="muted">${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td><td>${r[5] || ""}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><h2>Availability calculator</h2><p class="muted">Components in <b>series</b> multiply; <b>redundant</b> copies fail only if all fail.</p>
          <div class="avail-calc"><label><span>Component availability (%)</span><input type="number" id="avA" value="99.9" step="0.01" min="0" max="100"></label><label><span>Components in series</span><input type="number" id="avS" value="3" min="1" max="20"></label><label><span>Redundant copies of each</span><input type="number" id="avP" value="1" min="1" max="5"></label></div>
          <div id="avOut" class="avail-out"></div></div>
      </section>
      <section class="card reveal" id="cap"><h2>Rough capacities per node</h2><p class="muted">Orders of magnitude for estimates. Always benchmark your own workload.</p><div class="table-wrap"><table class="tbl"><thead><tr><th>Component</th><th>Ballpark</th><th>Notes</th></tr></thead><tbody>${SD.capacities.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td><td class="muted">${esc(r[2])}</td></tr>`).join("")}</tbody></table></div></section>
      <section class="grid3 reveal" id="conv">
        <div class="card"><h3>Powers of two</h3><div class="table-wrap"><table class="tbl compact"><tbody>${SD.powers.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td><td><b>${r[2]}</b></td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><h3>Time & rate conversions</h3><div class="table-wrap"><table class="tbl compact"><tbody>${SD.timeConv.map((r) => `<tr><th>${r[0]}</th><td>${r[1]}</td></tr>`).join("")}</tbody></table></div></div>
        <div class="card"><h3>Typical sizes</h3><div class="table-wrap"><table class="tbl compact"><tbody>${SD.sizes.map((r) => `<tr><th>${esc(r[0])}</th><td>${esc(r[1])}</td></tr>`).join("")}</tbody></table></div></div>
      </section>`;
    $("#humanize").addEventListener("change", (e) => { $$(".lat-v").forEach((el) => { el.textContent = e.target.checked ? humanDur(+el.dataset.ns) : el.dataset.h; }); });
    function calc() {
      const v = {}; $$("[data-k]").forEach((i) => (v[i.dataset.k] = Math.max(0, +i.value || 0)));
      const writesDay = v.dau * 1e6 * v.wpu, wq = writesDay / 86400, rq = wq * v.ratio;
      const perDay = writesDay * v.wsize * 1000, total = perDay * 365 * v.years * v.rf;
      const ingress = wq * v.wsize * 1000, egress = rq * v.rsize * 1000;
      const cacheMem = rq * 86400 * v.rsize * 1000 * (v.hot / 100);
      const peakAll = (wq + rq) * v.peak;
      const servers = Math.max(1, Math.ceil(peakAll / 2000));
      const hints = [];
      if (wq * v.peak > 10000) hints.push("Peak writes > 10K/s: consider sharding, a write-optimised store (Cassandra/DynamoDB) or buffering through Kafka.");
      else hints.push("Peak writes fit comfortably on a single well-sized primary DB.");
      if (total > 10e12) hints.push("Total storage > 10 TB: plan for partitioning/sharding or a distributed database; tier cold data to object storage.");
      if (rq * v.peak > 50000) hints.push("Peak reads > 50K/s: add a cache layer and read replicas; consider a CDN for cacheable responses.");
      if (cacheMem > 1e12) hints.push("The hot set exceeds 1 TB of RAM: shard the cache cluster, or cache only the hottest objects.");
      $("#calcOut").innerHTML = `
        <div class="est-grid">
          <div class="est"><span>Write QPS (avg / peak)</span><b>${fmtNum(wq)} / ${fmtNum(wq * v.peak)}</b></div>
          <div class="est"><span>Read QPS (avg / peak)</span><b>${fmtNum(rq)} / ${fmtNum(rq * v.peak)}</b></div>
          <div class="est"><span>New data per day</span><b>${fmtBytes(perDay)}</b></div>
          <div class="est"><span>Total storage (${v.years} y × ${v.rf} replicas)</span><b>${fmtBytes(total)}</b></div>
          <div class="est"><span>Ingress bandwidth</span><b>${fmtRate(ingress)}</b></div>
          <div class="est"><span>Egress bandwidth</span><b>${fmtRate(egress)}</b></div>
          <div class="est"><span>Cache memory (${v.hot}% of daily reads)</span><b>${fmtBytes(cacheMem)}</b></div>
          <div class="est"><span>App servers @ ~2K req/s each (peak)</span><b>~${fmtNum(servers)}</b></div>
        </div>
        <ul class="clist hints">${hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>
        <details class="acc"><summary>Show the math</summary><pre class="code">writes/day   = ${fmtNum(v.dau * 1e6)} users × ${v.wpu} = ${fmtNum(writesDay)}
write QPS    = ${fmtNum(writesDay)} ÷ 86,400 ≈ ${fmtNum(wq)}
read QPS     = ${fmtNum(wq)} × ${v.ratio} ≈ ${fmtNum(rq)}
storage/day  = ${fmtNum(writesDay)} × ${v.wsize} KB ≈ ${fmtBytes(perDay)}
total        = ${fmtBytes(perDay)} × 365 × ${v.years} × ${v.rf} ≈ ${fmtBytes(total)}
egress       = ${fmtNum(rq)} × ${v.rsize} KB/s ≈ ${fmtBytes(egress)}/s
cache        = ${fmtNum(rq * 86400)} reads/day × ${v.rsize} KB × ${v.hot}% ≈ ${fmtBytes(cacheMem)}</pre></details>`;
    }
    $$("[data-k]").forEach((i) => i.addEventListener("input", calc));
    $$("[data-calc]").forEach((b) => b.addEventListener("click", () => { const v = JSON.parse(b.dataset.calc); Object.entries(v).forEach(([k, x]) => ($(`[data-k="${k}"]`).value = x)); $$("[data-calc]").forEach((x) => x.classList.toggle("on", x === b)); calc(); }));
    calc();
    function avail() {
      const a = Math.min(100, Math.max(0, +$("#avA").value || 0)) / 100, s = Math.max(1, +$("#avS").value || 1), p = Math.max(1, +$("#avP").value || 1);
      const one = 1 - Math.pow(1 - a, p), tot = Math.pow(one, s);
      const down = (1 - tot) * 365 * 86400;
      $("#avOut").innerHTML = `<div class="est"><span>Each (with ${p} redundant cop${p > 1 ? "ies" : "y"})</span><b>${(one * 100).toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}%</b></div><div class="est"><span>System (${s} in series)</span><b>${(tot * 100).toFixed(5).replace(/0+$/, "").replace(/\.$/, "")}%</b></div><div class="est"><span>Expected downtime / year</span><b>${humanDur(down)}</b></div>`;
    }
    ["#avA", "#avS", "#avP"].forEach((s) => $(s).addEventListener("input", avail));
    avail();
  };

  /* ----------------------------- FRAMEWORK --------------------------- */
  pages.framework = function () {
    const checks = store.get("checks", {});
    const tot = 45;
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Framework</span><h1>How to approach any design</h1>
      <p class="lead">A repeatable 7-step process for a 45-minute interview, and a good checklist for real design docs. Tick items as you practise; they're saved locally.</p></div>
      <section class="card"><h2>Time budget (45 min)</h2>
        <div class="timeline">${SD.framework.map((f, i) => { const m = f.time.match(/\d+/g).map(Number); const avg = m.length > 1 ? (m[0] + m[1]) / 2 : m[0]; return `<a href="#fw${i}" data-scroll class="tl-seg" style="--c:${f.color}; flex:${avg}; animation-delay:${i * 90}ms"><b>${i + 1}</b><span>${esc(f.step)}</span><small>${f.time}</small></a>`; }).join("")}</div></section>
      ${SD.studyPlan ? `<section class="card reveal"><h2>Study guide by timeline</h2><p class="muted">${esc(SD.studyPlan.note)}</p>
        <div class="chips" style="margin:8px 0 14px">${SD.studyPlan.timelines.map(([k, v]) => `<span class="chip static"><b>${k}:</b>&nbsp;${esc(v)}</span>`).join("")}</div>
        <div class="table-wrap"><table class="tbl"><thead><tr><th></th><th>Short</th><th>Medium</th><th>Long</th></tr></thead><tbody>${SD.studyPlan.rows.map((r) => `<tr><th style="white-space:normal">${esc(r[0])}</th><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td></tr>`).join("")}</tbody></table></div>
        <p class="muted small">Useful links: <a href="#/concepts">Concepts</a> · <a href="#/scenarios">Scenarios</a> · <a href="#/concepts">Object-oriented design (in Concepts)</a> · <a href="#/map/arch">Real-world architectures & engineering blogs</a> · <a href="#/quiz">Flashcards</a></p></section>` : ""}
      <section class="fw">${SD.framework.map((f, i) => `
        <div class="card fw-step reveal" id="fw${i}" style="--c:${f.color}">
          <div class="fw-num">${i + 1}</div>
          <div class="fw-body"><div class="fw-h"><h3>${esc(f.step)}</h3><span class="tag">${f.time}</span></div><p class="muted">${esc(f.goal)}</p>
          <ul class="checks">${f.items.map((it, j) => { const k = i + "-" + j; return `<li><label><input type="checkbox" data-ck="${k}" ${checks[k] ? "checked" : ""}><span>${esc(it)}</span></label></li>`; }).join("")}</ul></div>
        </div>`).join("")}</section>
      <section class="reveal"><div class="sec-head"><div><h2>Trade-offs to talk about</h2><p class="muted">Interviewers look for judgement. Name the trade-off and say when you'd pick each side.</p></div></div>
        <div class="togrid">${SD.tradeoffs.map((t) => `<div class="tocard"><div class="to-vs"><span>${esc(t.a)}</span><i>vs</i><span>${esc(t.b)}</span></div><p>${esc(t.when)}</p></div>`).join("")}</div></section>
      <section class="card reveal"><h2>Non-functional requirements checklist</h2>
        <div class="nfr">${[["Scalability", "How does it grow 10×? Horizontal scaling, sharding, caching."], ["Availability", "SLO target, redundancy, failover, no SPOFs."], ["Latency", "p99 targets, caching, CDN, data locality."], ["Consistency", "Where strong vs eventual? Read-your-writes?"], ["Durability", "Replication, backups, RPO/RTO."], ["Fault tolerance", "Timeouts, retries, circuit breakers, graceful degradation."], ["Security", "AuthN/Z, encryption, rate limiting, PII handling."], ["Observability", "Metrics, logs, traces, alerts on SLOs."], ["Cost", "Storage tiers, egress, right-sizing, managed vs self-hosted."], ["Maintainability", "Simplicity, clear ownership, deployability."], ["Compliance", "GDPR, PCI, data residency, retention."], ["Operability", "Deploys, migrations, config, on-call runbooks."]].map(([k, v]) => `<div><b>${k}</b><span>${v}</span></div>`).join("")}</div></section>`;
    $$("[data-ck]").forEach((c) => c.addEventListener("change", () => { checks[c.dataset.ck] = c.checked; store.set("checks", checks); }));
  };

  /* -------------------------------- QUIZ ----------------------------- */
  pages.quiz = function (mode) {
    if (mode === "cards") return flashcards();
    let order, i, score, answered;
    function start() { order = SD.quiz.map((_, k) => k).sort(() => Math.random() - 0.5); i = 0; score = 0; answered = false; render(); }
    function render() {
      if (i >= order.length) {
        const best = Math.max(store.get("quizBest", 0) || 0, score); store.set("quizBest", best);
        const pct = Math.round((score / order.length) * 100);
        app.innerHTML = `<div class="page-head"><span class="eyebrow">Quiz</span><h1>Done!</h1></div>
          <div class="card quiz-end"><div class="ring" style="--p:${pct}"><span>${pct}%</span></div><h2>${score} / ${order.length} correct</h2><p class="muted">Best score: ${best} / ${order.length}. ${pct >= 80 ? "Excellent: you're interview-ready on the fundamentals." : pct >= 50 ? "Solid. Review the explanations and revisit the Databases page." : "Keep going: the Advisor and Databases pages cover most of these."}</p><div class="cta"><button class="btn primary" id="qRestart">Try again</button><a class="btn" href="#/databases">Review databases</a></div></div>`;
        $("#qRestart").addEventListener("click", start);
        return;
      }
      const q = SD.quiz[order[i]];
      app.innerHTML = `<div class="page-head"><span class="eyebrow">Quiz</span><h1>Which would you choose?</h1><div class="chips tabs"><a class="chip on" href="#/quiz">❓ Quiz</a><a class="chip" href="#/quiz/cards">🃏 Flashcards</a></div></div>
        <div class="quiz card">
          <div class="quiz-top"><span>Question ${i + 1} of ${order.length}</span><span>Score: <b>${score}</b></span></div>
          <div class="prog-bar"><i style="width:${(i / order.length) * 100}%"></i></div>
          <h2 class="quiz-q">${esc(q.q)}</h2>
          <div class="quiz-opts">${q.o.map((o, k) => `<button class="quiz-opt" data-k="${k}"><span class="qk">${"ABCD"[k]}</span>${esc(o)}</button>`).join("")}</div>
          <div class="quiz-why" hidden></div>
          <div class="quiz-nav"><button class="btn primary" id="qNext" hidden>${i === order.length - 1 ? "See results" : "Next question →"}</button></div>
        </div>`;
      answered = false;
      $$(".quiz-opt").forEach((b) => b.addEventListener("click", () => {
        if (answered) return; answered = true;
        const k = +b.dataset.k, ok = k === q.a;
        if (ok) score++;
        $$(".quiz-opt").forEach((x) => { const kk = +x.dataset.k; x.classList.add(kk === q.a ? "right" : kk === k ? "wrong" : "dim"); x.disabled = true; });
        const w = $(".quiz-why"); w.hidden = false; w.className = "quiz-why " + (ok ? "ok" : "bad");
        w.innerHTML = `<b>${ok ? "Correct!" : "Not quite."}</b> ${esc(q.why)}`;
        $("#qNext").hidden = false; $("#qNext").focus();
      }));
      $("#qNext").addEventListener("click", () => { i++; render(); });
    }
    start();
  };

  function flashcards() {
    const decks = {
      glossary: SD.glossary.map(([t, d]) => ({ id: "g:" + t, f: t, b: d })),
      concepts: SD.concepts.map((c) => ({ id: "c:" + c.id, f: c.title, b: c.summary, href: "#/concept/" + c.id })),
      scenarios: SD.scenarios.map((s) => ({ id: "s:" + s.id, f: `Design: ${s.title}`, b: `Key decisions: ${s.choices.slice(0, 3).map((c) => `${c.c} → ${c.pick}`).join(" · ")}`, href: "#/scenario/" + s.id })),
      ood: SD.concepts.filter((c) => c.cat === "Object-Oriented Design").map((c) => ({ id: "c:" + c.id, f: c.title, b: c.points.slice(0, 2).join(" "), href: "#/concept/" + c.id }))
    };
    let known = new Set(store.get("cardsKnown", [])), deck = store.get("cardsDeck", "glossary"), queue = [], cur = null, flipped = false;
    function build() { queue = decks[deck].filter((c) => !known.has(c.id)).sort(() => Math.random() - 0.5); next(); }
    function next() { cur = queue.shift() || null; flipped = false; render(); }
    function render() {
      const total = decks[deck].length, done = decks[deck].filter((c) => known.has(c.id)).length;
      app.innerHTML = `<div class="page-head"><span class="eyebrow">Flashcards</span><h1>Flashcards</h1><div class="chips tabs"><a class="chip" href="#/quiz">❓ Quiz</a><a class="chip on" href="#/quiz/cards">🃏 Flashcards</a></div>
        <p class="lead">Spaced repetition, lite: flip the card, then mark it <b>Got it</b> (retired) or <b>Again</b> (goes back into the pile). Progress is saved in your browser.</p></div>
        <div class="card fc-wrap">
          <div class="chips">${[["glossary", "Glossary terms"], ["concepts", "Concepts"], ["scenarios", "Scenarios"], ["ood", "Object-oriented design"]].map(([k, l]) => `<button class="chip ${k === deck ? "on" : ""}" data-deck="${k}">${l} (${decks[k].length})</button>`).join("")}</div>
          <div class="prog"><div class="prog-bar"><i style="width:${(done / total) * 100}%"></i></div><span>${done}/${total}</span></div>
          ${cur ? `<button class="fc ${flipped ? "flipped" : ""}" id="fc" aria-label="Flip card"><span class="fc-inner"><span class="fc-face fc-front"><small>Term · click or Space to flip</small><b>${esc(cur.f)}</b></span><span class="fc-face fc-back"><small>${esc(cur.f)}</small><span>${esc(cur.b)}</span>${cur.href ? `<a href="${cur.href}" class="more">Open page →</a>` : ""}</span></span></button>
          <div class="fc-actions"><button class="btn" id="fcAgain">↺ Again</button><button class="btn primary" id="fcGot">✓ Got it</button><span class="muted small">${queue.length} left in this round</span></div>`
          : `<div class="empty"><div class="empty-art">🎉</div><h3>Deck complete!</h3><p class="muted">You've marked every card in this deck as known.</p><button class="btn" id="fcReset">Reset this deck</button></div>`}
        </div>`;
      $$("[data-deck]").forEach((b) => b.addEventListener("click", () => { deck = b.dataset.deck; store.set("cardsDeck", deck); build(); }));
      const fc = $("#fc");
      if (fc) {
        fc.addEventListener("click", (e) => { if (e.target.closest("a")) return; flipped = !flipped; fc.classList.toggle("flipped", flipped); });
        $("#fcGot").addEventListener("click", () => { known.add(cur.id); store.set("cardsKnown", [...known]); next(); });
        $("#fcAgain").addEventListener("click", () => { queue.push(cur); next(); });
      }
      const rs = $("#fcReset"); if (rs) rs.addEventListener("click", () => { decks[deck].forEach((c) => known.delete(c.id)); store.set("cardsKnown", [...known]); build(); });
    }
    const onKey = (e) => {
      if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || !$("#fc")) return;
      if (e.key === " ") { e.preventDefault(); $("#fc").click(); }
      if (e.key === "ArrowRight") $("#fcGot").click();
      if (e.key === "ArrowLeft") $("#fcAgain").click();
    };
    document.addEventListener("keydown", onKey); onCleanup(() => document.removeEventListener("keydown", onKey));
    build();
  }

  /* ------------------------------ GLOSSARY --------------------------- */
  pages.glossary = function () {
    const g = SD.glossary.slice().sort((a, b) => a[0].localeCompare(b[0]));
    app.innerHTML = `<div class="page-head reveal"><span class="eyebrow">Glossary</span><h1>Glossary</h1><p class="lead">${g.length} terms you'll hear in design discussions.</p></div>
      <input type="search" class="search-inline wide" id="gQ" placeholder="Filter terms…">
      <div id="gList" class="glossary"></div>`;
    function render(q) {
      q = (q || "").toLowerCase();
      const items = g.filter(([t, d]) => !q || t.toLowerCase().includes(q) || d.toLowerCase().includes(q));
      const groups = {}; items.forEach((it) => { const L = it[0][0].toUpperCase(); (groups[L] = groups[L] || []).push(it); });
      $("#gList").innerHTML = Object.keys(groups).sort().map((L) => `<div class="g-group"><h2>${L}</h2><dl>${groups[L].map(([t, d]) => `<div><dt>${esc(t)}</dt><dd>${esc(d)}</dd></div>`).join("")}</dl></div>`).join("") || `<p class="muted">No matches.</p>`;
    }
    $("#gQ").addEventListener("input", (e) => render(e.target.value)); render("");
  };

  /* ------------------------------ STUDY MAP ------------------------------ */
  pages.map = function (arg) {
    const tab0 = (arg || "ddia").split("-")[0];
    const openCh = arg && arg.startsWith("ddia-") ? +arg.split("-")[1] : null;
    const readCh = store.get("ddiaRead", {});
    const valid = (ids) => ids.some((id) => refInfo(id));
    const ddiaSecs = SD.ddia.chapters.flatMap((c) => c.sections);
    const ddiaCov = ddiaSecs.filter(([, ids]) => valid(ids)).length;
    const prItems = SD.primer.groups.flatMap((g) => g.items);
    const prCov = prItems.filter(([, ids]) => valid(ids)).length;
    const learnables = (ids) => [...new Set(ids)].map(refInfo).filter((r) => r && r.learn);
    app.innerHTML = `
      <div class="page-head reveal"><span class="eyebrow">Study Map</span><h1>Your reading, mapped</h1>
      <p class="lead">Every chapter and section of <b>${esc(SD.ddia.title)}</b> (${esc(SD.ddia.author)}) and every topic in <a href="${SD.primer.url}" target="_blank" rel="noopener">The System Design Primer</a>, linked to the concepts (▶ = live simulation), databases and scenarios that cover it. Summaries here are original; read the sources for depth.</p>
      <div class="cov">
        <div class="cov-card"><b>${Math.round((ddiaCov / ddiaSecs.length) * 100)}%</b><span>DDIA sections covered (${ddiaCov}/${ddiaSecs.length})</span></div>
        <div class="cov-card"><b>${Math.round((prCov / prItems.length) * 100)}%</b><span>Primer topics covered (${prCov}/${prItems.length})</span></div>
        <div class="cov-card"><b>${Object.values(readCh).filter(Boolean).length}/12</b><span>DDIA chapters marked read</span></div>
      </div>
      <div class="chips tabs">${[["ddia", "📘 DDIA (12 chapters)"], ["primer", "📗 System Design Primer"], ["arch", "🏢 Real-world architectures"], ["papers", "📄 Classic papers"]].map(([k, l]) => `<a class="chip ${k === tab0 ? "on" : ""}" href="#/map/${k}">${l}</a>`).join("")}</div></div>
      <div id="mapBody"></div>`;
    const body = $("#mapBody");
    if (tab0 === "ddia") {
      body.innerHTML = SD.ddia.parts.map((pt, pi) => `<h2 class="cat-h">${esc(pt)}</h2>` + SD.ddia.chapters.filter((c) => c.part === pi).map((ch) => {
        const ls = learnables(ch.sections.flatMap((x) => x[1])); const done = ls.filter((r) => isLearned(r.learn)).length;
        return `<details class="chap card" id="ch${ch.n}" ${openCh === ch.n ? "open" : ""}>
          <summary><span class="chap-n">${ch.n}</span><span class="chap-t"><b>${esc(ch.title)}</b><small>${esc(ch.summary)}</small></span>
            <span class="chap-p"><span class="prog-bar"><i style="width:${ls.length ? (done / ls.length) * 100 : 0}%"></i></span><small>${done}/${ls.length} learned</small></span></summary>
          <div class="chap-body">
            <div class="chap-top"><ul class="clist">${ch.takeaways.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>
              <label class="toggle"><input type="checkbox" data-read="${ch.n}" ${readCh[ch.n] ? "checked" : ""}><span>I've read this chapter</span></label></div>
            <div class="secs">${ch.sections.map(([t, ids, lvl]) => `<div class="sec ${lvl ? "sub" : "main"}"><span class="sec-t">${valid(ids) ? '<i class="ok-t">✓</i>' : '<i class="bad-t">✗</i>'} ${esc(t)}</span><span class="sec-c">${ids.map(refChip).join("")}</span></div>`).join("")}</div>
          </div></details>`; }).join("")).join("");
      $$("[data-read]").forEach((c) => c.addEventListener("change", () => { readCh[c.dataset.read] = c.checked; store.set("ddiaRead", readCh); }));
      if (openCh) setTimeout(() => { const el = $("#ch" + openCh); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }, 80);
    } else if (tab0 === "primer") {
      body.innerHTML = SD.primer.groups.map((g) => `<section class="card reveal"><h2>${esc(g.title)}</h2><div class="secs">${g.items.map(([t, ids]) => `<div class="sec main"><span class="sec-t">${valid(ids) ? '<i class="ok-t">✓</i>' : '<i class="bad-t">✗</i>'} ${esc(t)}</span><span class="sec-c">${ids.map(refChip).join("")}</span></div>`).join("")}</div></section>`).join("");
    } else if (tab0 === "arch") {
      const types = [...new Set(SD.systems.map((x) => x[0]))];
      body.innerHTML = `<p class="muted">Don't memorise details. Look for the shared principles, technologies and patterns, what problem each component solves, where it works and where it doesn't, and the lessons learned.</p>
        <section class="reveal"><h2 class="cat-h">Systems</h2>${types.map((t) => `<h3>${esc(t)}</h3><div class="papers">${SD.systems.filter((x) => x[0] === t).map(([, name, what, ids]) => `<div class="paper card"><h3>${esc(name)}</h3><p>${esc(what)}</p><div class="sec-c">${ids.map(refChip).join("")}</div></div>`).join("")}</div>`).join("")}</section>
        <section class="reveal"><h2 class="cat-h">Company architectures: key lessons</h2><div class="papers">${SD.companies.map(([co, what, ids]) => `<div class="paper card"><h3>${esc(co)}</h3><p>${esc(what)}</p><div class="sec-c">${ids.map(refChip).join("")}</div></div>`).join("")}</div></section>
        <section class="card reveal"><h2>Company engineering blogs</h2><p class="muted">Read a few from the companies you're interviewing with. Their questions often come from the same domain.</p><div class="blogs">${SD.blogs.map(([t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)} ↗</a>`).join("")}</div></section>`;
    } else {
      body.innerHTML = `<div class="papers">${SD.papers.map(([t, who, what, ids]) => `<div class="paper card"><span class="tag">${esc(who)}</span><h3>${esc(t)}</h3><p>${esc(what)}</p><div class="sec-c">${ids.map(refChip).join("")}</div></div>`).join("")}</div>`;
    }
    reveal();
  };

  pages.notfound = function () { app.innerHTML = `<div class="page-head"><h1>Not found</h1><p class="lead">That page doesn't exist. <a href="#/">Go home</a>.</p></div>`; };

  /* ------------------------------ SEARCH ----------------------------- */
  const index = [
    ...[["Home", "#/"], ["Study Map", "#/map"], ["Stack Advisor", "#/advisor"], ["Scenarios", "#/scenarios"], ["Databases", "#/databases"], ["Concepts", "#/concepts"], ["Numbers", "#/numbers"], ["Framework", "#/framework"], ["Quiz", "#/quiz"], ["Flashcards", "#/quiz/cards"], ["Glossary", "#/glossary"]].map(([t, h]) => ({ t, k: "Page", h, x: t })),
    ...SD.scenarios.map((s) => ({ t: s.title, k: "Scenario", h: "#/scenario/" + s.id, x: [s.title, s.aka, s.summary, ...s.tags].join(" "), sub: s.aka })),
    ...SD.concepts.map((c) => ({ t: c.title, k: "Concept", h: "#/concept/" + c.id, x: [c.title, c.summary, c.cat].join(" "), sub: c.cat })),
    ...SD.databases.map((d) => ({ t: d.name, k: "Database", db: d.id, h: "#/databases", x: [d.name, d.tagline, ...d.examples].join(" "), sub: d.examples.slice(0, 3).join(", ") })),
    ...SD.glossary.map(([t, d]) => ({ t, k: "Glossary", h: "#/glossary", x: t + " " + d, sub: d })),
    ...SD.ddia.chapters.map((c) => ({ t: `DDIA Ch ${c.n}: ${c.title}`, k: "Reading", h: "#/map/ddia-" + c.n, x: ["ddia designing data intensive", c.title, c.summary, ...c.sections.map((x) => x[0])].join(" "), sub: c.summary })),
    ...SD.systems.map(([ty, name, what]) => ({ t: name, k: "Reading", h: "#/map/arch", x: [name, ty, what].join(" "), sub: what })),
    ...SD.companies.map(([co, what]) => ({ t: co + " architecture", k: "Reading", h: "#/map/arch", x: [co, what, "architecture company"].join(" "), sub: what })),
    { t: "System Design Primer map", k: "Reading", h: "#/map/primer", x: "system design primer donnemartin topics interview questions object oriented design", sub: "All primer topics → this site" }
  ];
  const pal = $("#palette"), palIn = $("#palIn"), palList = $("#palList");
  let palSel = 0, palItems = [];
  function openPal() { pal.hidden = false; palIn.value = ""; renderPal(""); requestAnimationFrame(() => { pal.classList.add("open"); palIn.focus(); }); }
  function closePal() { pal.classList.remove("open"); setTimeout(() => (pal.hidden = true), 150); }
  function renderPal(q) {
    q = q.trim().toLowerCase();
    const words = q.split(/\s+/).filter(Boolean);
    palItems = (words.length ? index.filter((it) => words.every((w) => it.x.toLowerCase().includes(w))).sort((a, b) => (b.t.toLowerCase().includes(q) ? 1 : 0) - (a.t.toLowerCase().includes(q) ? 1 : 0)) : index.filter((it) => it.k === "Page" || it.k === "Scenario")).slice(0, 12);
    palSel = 0;
    palList.innerHTML = palItems.map((it, i) => `<li class="${i === 0 ? "sel" : ""}" data-i="${i}"><span class="pk-kind k-${it.k.toLowerCase()}">${it.k}</span><span class="pk-t">${esc(it.t)}</span>${it.sub ? `<span class="pk-sub">${esc(it.sub)}</span>` : ""}</li>`).join("") || `<li class="none">No results for "${esc(q)}"</li>`;
  }
  function go(i) { const it = palItems[i]; if (!it) return; closePal(); if (it.db) { location.hash = "#/databases"; setTimeout(() => openModal(dbDetail(it.db)), 60); } else location.hash = it.h; }
  palIn.addEventListener("input", () => renderPal(palIn.value));
  palIn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); palSel = (palSel + (e.key === "ArrowDown" ? 1 : -1) + palItems.length) % Math.max(1, palItems.length); $$("li", palList).forEach((li, i) => li.classList.toggle("sel", i === palSel)); const s = $("li.sel", palList); if (s) s.scrollIntoView({ block: "nearest" }); }
    if (e.key === "Enter") go(palSel);
    if (e.key === "Escape") closePal();
  });
  palList.addEventListener("click", (e) => { const li = e.target.closest("li[data-i]"); if (li) go(+li.dataset.i); });
  pal.addEventListener("click", (e) => { if (e.target === pal) closePal(); });
  $("#searchBtn").addEventListener("click", openPal);
  document.addEventListener("keydown", (e) => {
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
    if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) { e.preventDefault(); pal.hidden ? openPal() : closePal(); }
  });

  /* ------------------------------ ROUTER ----------------------------- */
  function route() {
    cleanups.forEach((fn) => { try { fn(); } catch (e) { /* ignore */ } }); cleanups = [];
    const h = location.hash.replace(/^#\/?/, "");
    if (h && !h.includes("/") && document.getElementById(h) && !pages[h]) return; // in-page anchor
    const [page, arg] = h.split("/");
    const fn = pages[page || "home"] || pages.notfound;
    fn(arg);
    $$(".nav a").forEach((a) => { const t = a.getAttribute("href").replace(/^#\/?/, ""); a.classList.toggle("active", t === (page || "") || (t === "scenarios" && page === "scenario") || (t === "concepts" && page === "concept")); });
    const titles = { advisor: "Stack Advisor", scenarios: "Scenarios", scenario: (SD.scenarios.find((s) => s.id === arg) || {}).title, databases: "Databases", concepts: "Concepts", concept: (SD.concepts.find((c) => c.id === arg) || {}).title, numbers: "Numbers", framework: "Framework", quiz: "Quiz", glossary: "Glossary", map: "Study Map" };
    document.title = (titles[page] ? titles[page] + " · " : "") + "System Design Cheat Sheet";
    window.scrollTo(0, 0);
    reveal();
    $("#nav").classList.remove("open");
  }
  // smooth in-page anchors that don't break the hash router
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-scroll]"); if (!a) return;
    e.preventDefault(); const t = document.querySelector(a.getAttribute("href")); if (t) t.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("#menuBtn").addEventListener("click", () => $("#nav").classList.toggle("open"));
  window.addEventListener("hashchange", route);
  updateProgressBadge();
  route();
})();
