/* Architecture diagram renderer with ambient traffic and a step-by-step flow player. */
window.SD = window.SD || {};
(function () {
  const NS = "http://www.w3.org/2000/svg";
  const W = 136, H = 50;
  let uid = 0;

  const ICONS = {
    client: "M3 5h18v11H3z M8 20h8 M12 16v4",
    lb: "M3 12h5 M8 12l5-6h4 M8 12l5 6h4 M16 3.5l3 2.5-3 2.5 M16 15.5l3 2.5-3 2.5",
    gateway: "M12 3l8 3.5v5.5c0 4.6-3.4 8.2-8 9.5-4.6-1.3-8-4.9-8-9.5V6.5z M9 12l2 2 4-4",
    service: "M12 2.5l8.5 4.8v9.4L12 21.5l-8.5-4.8V7.3z M12 12l8.5-4.7 M12 12v9.5 M12 12L3.5 7.3",
    db: "M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3z M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6 M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
    bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
    queue: "M3 5h4v14H3z M10 5h4v14h-4z M17 5h4v14h-4z",
    bucket: "M4 7h16l-2 13H6z M4 7c0-1.6 3.6-3 8-3s8 1.4 8 3",
    gear: "M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z M12 2v3 M12 19v3 M2 12h3 M19 12h3 M4.9 4.9L7 7 M17 17l2.1 2.1 M4.9 19.1L7 17 M17 7l2.1-2.1",
    search: "M11 4a7 7 0 100 14 7 7 0 000-14z M16 16l5 5",
    chart: "M4 20V11 M10 20V5 M16 20v-6 M21 20H3",
    cdn: "M12 3a9 9 0 100 18 9 9 0 000-18z M3 12h18 M12 3c2.5 2.5 3.6 5.6 3.6 9s-1.1 6.5-3.6 9c-2.5-2.5-3.6-5.6-3.6-9S9.5 5.5 12 3z",
    cloud: "M7 18h10.5a4 4 0 00.3-8A6 6 0 006.3 11 3.6 3.6 0 007 18z",
    dns: "M4 5h16v5H4z M4 14h16v5H4z M7.5 7.5h.01 M7.5 16.5h.01",
    lock: "M6 11h12v9.5H6z M8.5 11V8a3.5 3.5 0 017 0v3",
    clock: "M12 3a9 9 0 100 18 9 9 0 000-18z M12 7v5l3.5 2.5",
    geo: "M12 21s7-6.2 7-12a7 7 0 10-14 0c0 5.8 7 12 7 12z M12 6.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z",
    bell: "M6 16v-5a6 6 0 0112 0v5l2 2H4z M10 21h4",
    card: "M3 6h18v12H3z M3 10h18 M7 15h3",
    analytics: "M4 20V11 M10 20V5 M16 20v-6 M21 20H3"
  };
  const TYPE_ICON = { client: "client", edge: "lb", service: "service", cache: "bolt", db: "db", queue: "queue", storage: "bucket", worker: "gear", search: "search", analytics: "chart", external: "cloud" };
  const TYPE_LABEL = { client: "Client", edge: "Edge / LB / Gateway", service: "Service", cache: "Cache / in-memory", db: "Database", queue: "Queue / stream", storage: "Object storage", worker: "Worker / job", search: "Search index", analytics: "Analytics", external: "External" };
  SD.ICONS = ICONS;
  SD.TYPE_LABEL = TYPE_LABEL;

  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    if (attrs) for (const k in attrs) { if (attrs[k] == null) continue; if (k === "text") e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (parent) parent.appendChild(e);
    return e;
  }
  function clip(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (!dx && !dy) return { x: a.x, y: a.y };
    const sx = dx ? (W / 2 + 5) / Math.abs(dx) : Infinity;
    const sy = dy ? (H / 2 + 5) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: a.x + dx * s, y: a.y + dy * s };
  }
  function pathD(a, b, curve) {
    const p1 = clip(a, b), p2 = clip(b, a);
    if (!curve) return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} L${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2, dx = p2.x - p1.x, dy = p2.y - p1.y;
    return `M${p1.x.toFixed(1)},${p1.y.toFixed(1)} Q${(mx - dy * curve).toFixed(1)},${(my + dx * curve).toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  SD.icon = function (name, size) {
    const d = ICONS[name] || ICONS.service;
    return `<svg class="ico" width="${size || 18}" height="${size || 18}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  };

  /**
   * Render a diagram into host.
   * opts: { autoplay: bool, compact: bool, title: string }
   */
  SD.renderDiagram = function (host, spec, opts) {
    opts = opts || {};
    const id = "dg" + (++uid);
    const nodes = {};
    spec.nodes.forEach((nd) => (nodes[nd.id] = nd));
    const flows = spec.flows || [];

    const xs = spec.nodes.map((nd) => nd.x), ys = spec.nodes.map((nd) => nd.y);
    const minX = Math.min(...xs) - W / 2 - 14, maxX = Math.max(...xs) + W / 2 + 14;
    const minY = Math.min(...ys) - H / 2 - 16, maxY = Math.max(...ys) + H / 2 + 16;
    const vbW = maxX - minX, vbH = maxY - minY;

    host.innerHTML = `
      <div class="dg${opts.compact ? " compact" : ""}">
        ${flows.length ? `<div class="dg-toolbar">
          <div class="dg-flows" role="tablist" aria-label="Flows">${flows.map((f, i) => `<button role="tab" class="chip${i === 0 ? " on" : ""}" data-flow="${i}">${esc(f.name)}</button>`).join("")}</div>
          <div class="dg-controls">
            <button class="btn icon" data-a="prev" title="Previous step" aria-label="Previous step"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M6 5v14M19 5L9 12l10 7z" fill="currentColor"/></svg></button>
            <button class="btn primary dg-play" data-a="play"><span class="pl-ico"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg></span><span class="pl-txt">Play flow</span></button>
            <button class="btn icon" data-a="next" title="Next step" aria-label="Next step"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M18 5v14M5 5l10 7-10 7z" fill="currentColor"/></svg></button>
            <label class="dg-speed" title="Playback speed">Speed <select data-a="speed"><option value="0.6">0.5×</option><option value="1" selected>1×</option><option value="1.6">1.5×</option><option value="2.4">2×</option></select></label>
          </div>
        </div>` : ""}
        <div class="dg-canvas"><svg class="dg-svg" viewBox="${minX} ${minY} ${vbW} ${vbH}" role="img" aria-label="${esc(opts.title || "Architecture diagram")}"></svg></div>
        ${flows.length ? `<div class="dg-caption" aria-live="polite"><span class="dg-stepno">•</span><span class="dg-text">Press <b>Play flow</b> to watch a request travel through the system, or step through it. Click any component to see what it does.</span></div>
        <ol class="dg-steps"></ol>` : ""}
        <div class="dg-info" hidden></div>
        <div class="dg-legend"></div>
      </div>`;

    const root = host.querySelector(".dg");
    const svg = root.querySelector(".dg-svg");
    const defs = el("defs", null, svg);
    const mk = (mid, cls) => {
      const m = el("marker", { id: mid, viewBox: "0 0 10 10", refX: "9", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
      el("path", { d: "M0,1 L10,5 L0,9 z", class: cls }, m);
    };
    mk(id + "-arr", "arrow");
    mk(id + "-arrh", "arrow hl");

    const gEdges = el("g", { class: "edges" }, svg);
    const gAmb = el("g", { class: "ambient" }, svg);
    const gTemp = el("g", { class: "temp" }, svg);
    const gNodes = el("g", { class: "nodes" }, svg);
    const gPk = el("g", { class: "packets" }, svg);

    const edgeEls = {};
    (spec.edges || []).forEach((e, i) => {
      const a = nodes[e[0]], b = nodes[e[1]];
      if (!a || !b) return;
      const p = el("path", { id: `${id}-e${i}`, d: pathD(a, b, e[3]), class: "edge", "marker-end": `url(#${id}-arr)` }, gEdges);
      edgeEls[e[0] + ">" + e[1]] = p;
      if (e[2]) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        el("text", { x: mx, y: my - 6, class: "edge-label", "text-anchor": "middle", text: e[2] }, gEdges);
      }
      if (!reduceMotion()) {
        const dots = 1 + (i % 2);
        for (let k = 0; k < dots; k++) {
          const c = el("circle", { r: 2.6, class: "amb-dot" }, gAmb);
          const am = el("animateMotion", { dur: (2.6 + (i % 3) * 0.5) + "s", repeatCount: "indefinite", begin: (-(Math.random() * 3 + k * 1.3)).toFixed(2) + "s" }, c);
          el("mpath", { href: `#${id}-e${i}` }, am);
        }
      }
    });

    const nodeEls = {};
    spec.nodes.forEach((nd) => {
      const g = el("g", { class: `node t-${nd.type}`, transform: `translate(${nd.x - W / 2},${nd.y - H / 2})`, tabindex: "0", role: "button", "aria-label": `${nd.label}${nd.sub ? ", " + nd.sub : ""}`, "data-id": nd.id }, gNodes);
      el("rect", { class: "nbox", width: W, height: H, rx: 11 }, g);
      el("rect", { class: "nstripe", x: 0, y: 10, width: 3.5, height: H - 20, rx: 1.75 }, g);
      const ig = el("g", { transform: "translate(11,14) scale(0.92)", class: "nicon" }, g);
      el("path", { d: ICONS[nd.icon || TYPE_ICON[nd.type]] || ICONS.service }, ig);
      const lbl = el("text", { x: 40, y: nd.sub ? 22 : 30, class: "nlabel", text: nd.label }, g);
      if (nd.label.length * 7.1 > 90) { lbl.setAttribute("textLength", 90); lbl.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
      if (nd.sub) {
        const sb = el("text", { x: 40, y: 37, class: "nsub", text: nd.sub }, g);
        if (nd.sub.length * 5.7 > 90) { sb.setAttribute("textLength", 90); sb.setAttribute("lengthAdjust", "spacingAndGlyphs"); }
      }
      nodeEls[nd.id] = g;
    });

    // legend
    const types = [...new Set(spec.nodes.map((nd) => nd.type))];
    root.querySelector(".dg-legend").innerHTML = types.map((t) => `<span class="lg t-${t}"><i></i>${TYPE_LABEL[t] || t}</span>`).join("");

    // info on click
    const info = root.querySelector(".dg-info");
    function showInfo(nid) {
      const nd = nodes[nid];
      Object.values(nodeEls).forEach((g) => g.classList.remove("sel"));
      Object.values(edgeEls).forEach((p) => p.classList.remove("rel"));
      if (!nd) { info.hidden = true; return; }
      nodeEls[nid].classList.add("sel");
      Object.keys(edgeEls).forEach((k) => { const [f, t] = k.split(">"); if (f === nid || t === nid) edgeEls[k].classList.add("rel"); });
      info.hidden = false;
      info.innerHTML = `<span class="tchip t-${nd.type}">${TYPE_LABEL[nd.type] || nd.type}</span> <b>${esc(nd.label)}</b>${nd.sub ? ` <span class="muted">· ${esc(nd.sub)}</span>` : ""}<div>${esc(nd.desc || "")}</div>`;
    }
    gNodes.addEventListener("click", (ev) => { const g = ev.target.closest(".node"); if (g) showInfo(g.dataset.id); });
    gNodes.addEventListener("keydown", (ev) => { if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest(".node")) { ev.preventDefault(); showInfo(ev.target.closest(".node").dataset.id); } });

    /* ---------------- flow player ---------------- */
    let flowIdx = 0, step = -1, playing = false, token = 0, speed = 1, alive = true;
    const caption = root.querySelector(".dg-text");
    const stepno = root.querySelector(".dg-stepno");
    const stepsOl = root.querySelector(".dg-steps");
    const playBtn = root.querySelector(".dg-play");

    function renderStepList() {
      if (!stepsOl) return;
      const f = flows[flowIdx];
      stepsOl.innerHTML = f.steps.map((s, i) => `<li data-i="${i}" class="${i < step ? "done" : i === step ? "cur" : ""}"><span class="sn">${i + 1}</span><span><b>${esc(nodes[s[0]] ? nodes[s[0]].label : s[0])} → ${esc(nodes[s[1]] ? nodes[s[1]].label : s[1])}</b> ${esc(s[2])}</span></li>`).join("");
    }
    function setPlaying(p) {
      playing = p;
      if (!playBtn) return;
      playBtn.querySelector(".pl-txt").textContent = p ? "Pause" : (step >= 0 && step < flows[flowIdx].steps.length - 1 ? "Resume" : "Play flow");
      playBtn.querySelector(".pl-ico").innerHTML = p ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>';
      svg.classList.toggle("playing", p || step >= 0);
    }
    function clearHl() {
      Object.values(nodeEls).forEach((g) => g.classList.remove("hl", "hl-to"));
      Object.values(edgeEls).forEach((p) => { p.classList.remove("hl"); p.setAttribute("marker-end", `url(#${id}-arr)`); });
      gTemp.innerHTML = "";
      gPk.innerHTML = "";
    }
    function reset() {
      token++; step = -1; clearHl(); setPlaying(false);
      if (caption) { caption.innerHTML = "Press <b>Play flow</b> to watch a request travel through the system, or step through it."; stepno.textContent = "•"; }
      renderStepList();
      svg.classList.remove("playing");
    }
    function animatePacket(pathEl, reverse, ms, my) {
      return new Promise((res) => {
        const L = pathEl.getTotalLength();
        const c = el("circle", { r: 6.5, class: "packet" + (reverse ? " back" : "") }, gPk);
        const halo = el("circle", { r: 13, class: "packet-halo" + (reverse ? " back" : "") }, gPk);
        const t0 = performance.now();
        const tick = (now) => {
          if (my !== token || !alive) { c.remove(); halo.remove(); return; }
          let p = Math.min(1, (now - t0) / ms);
          const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
          const pt = pathEl.getPointAtLength((reverse ? 1 - e : e) * L);
          c.setAttribute("cx", pt.x); c.setAttribute("cy", pt.y);
          halo.setAttribute("cx", pt.x); halo.setAttribute("cy", pt.y);
          if (p < 1) requestAnimationFrame(tick); else { setTimeout(() => { c.remove(); halo.remove(); }, 250); res(); }
        };
        requestAnimationFrame(tick);
      });
    }
    function showStep(i, animate) {
      const f = flows[flowIdx];
      if (i < 0 || i >= f.steps.length) return Promise.resolve();
      const my = ++token;
      step = i; clearHl();
      const [from, to, text] = f.steps[i];
      const a = nodes[from], b = nodes[to];
      if (nodeEls[from]) nodeEls[from].classList.add("hl");
      if (nodeEls[to]) nodeEls[to].classList.add("hl-to");
      caption.innerHTML = `<b>${esc(a ? a.label : from)} → ${esc(b ? b.label : to)}</b> &nbsp;${esc(text)}`;
      stepno.textContent = `${i + 1}/${f.steps.length}`;
      renderStepList();
      svg.classList.add("playing");
      let p = edgeEls[from + ">" + to], reverse = false;
      if (!p && edgeEls[to + ">" + from]) { p = edgeEls[to + ">" + from]; reverse = true; }
      if (!p && a && b) { p = el("path", { d: pathD(a, b, 0.12), class: "edge tempedge", "marker-end": `url(#${id}-arrh)` }, gTemp); }
      if (!p) return Promise.resolve();
      p.classList.add("hl");
      if (!reverse) p.setAttribute("marker-end", `url(#${id}-arrh)`);
      if (!animate || reduceMotion()) return Promise.resolve();
      return animatePacket(p, reverse, 950 / speed, my).then(() => my);
    }
    async function play() {
      if (!flows.length) return;
      const f = flows[flowIdx];
      if (step >= f.steps.length - 1) step = -1;
      setPlaying(true);
      for (let i = step + 1; i < f.steps.length; i++) {
        const r = await showStep(i, true);
        if (!playing || !alive || (r !== undefined && r !== token)) return;
        await new Promise((res) => setTimeout(res, 1200 / speed));
        if (!playing || !alive) return;
      }
      setPlaying(false);
      if (playBtn) playBtn.querySelector(".pl-txt").textContent = "Replay";
    }

    if (flows.length) {
      renderStepList();
      root.querySelector(".dg-flows").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-flow]"); if (!b) return;
        root.querySelectorAll("[data-flow]").forEach((x) => x.classList.toggle("on", x === b));
        flowIdx = +b.dataset.flow; reset();
      });
      root.querySelector(".dg-controls").addEventListener("click", (ev) => {
        const b = ev.target.closest("[data-a]"); if (!b) return;
        const a = b.dataset.a;
        if (a === "play") { if (playing) { setPlaying(false); token++; } else play(); }
        if (a === "next") { setPlaying(false); showStep(Math.min(step + 1, flows[flowIdx].steps.length - 1), true); }
        if (a === "prev") { setPlaying(false); showStep(Math.max(step - 1, 0), true); }
      });
      root.querySelector('[data-a="speed"]').addEventListener("change", (ev) => { speed = +ev.target.value; });
      stepsOl.addEventListener("click", (ev) => { const li = ev.target.closest("li"); if (!li) return; setPlaying(false); showStep(+li.dataset.i, true); });
      if (opts.autoplay && !reduceMotion()) setTimeout(() => { if (alive && step < 0) play(); }, opts.autoplayDelay || 900);
    }

    return { destroy() { alive = false; token++; }, root };
  };
})();
