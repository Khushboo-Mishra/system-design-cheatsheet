/* Additional simulations: DDIA topics (isolation, replication lag, fencing, schema evolution, windows, MapReduce) and OOD (LRU cache, hash map). */
(function () {
  const { Stage, btn, sel, pick, rnd, shuffle, hash } = SD._anim;
  const A = SD.animations;

  function chip(S, x, y, w, h, text, cls, parent) {
    const g = S.add("g", { class: "opchip " + (cls || ""), transform: `translate(${x},${y})` }, parent);
    S.add("rect", { x: -w / 2, y: -h / 2, width: w, height: h, rx: 6 }, g);
    const ls = String(text).split("\n");
    ls.forEach((l, i) => S.add("text", { x: 0, y: (i - (ls.length - 1) / 2) * 12 + 4, "text-anchor": "middle", class: "opchip-t", text: l }, g));
    return g;
  }

  /* ---------------------- Transaction isolation anomalies ---------------------- */
  A.isolation = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls:
      sel("anom", [["dirty", "Dirty read"], ["lost", "Lost update (counter)"], ["skew", "Read skew (bank transfer)"], ["wskew", "Write skew (on-call doctors)"]], "Anomaly") +
      sel("lvl", [["1", "Read committed"], ["0", "Read uncommitted"], ["2", "Snapshot isolation / repeatable read"], ["3", "Serializable"]], "Isolation") +
      btn("run", "Run ▶", "primary") });
    const T1Y = 62, T2Y = 272, DBY = 167;
    S.line(50, T1Y, 625, T1Y, "lane"); S.line(50, T2Y, 625, T2Y, "lane");
    S.text(14, T1Y + 5, "T1", "atext big", "start"); S.text(14, T2Y + 5, "T2", "atext big", "start");
    const n1 = S.text(50, T1Y - 26, "", "atext small", "start"), n2 = S.text(50, T2Y + 36, "", "atext small", "start");
    const db = S.box(335, DBY, 340, 76, "Database", { cls: "db", sub: "" });
    db.t.setAttribute("y", -20); db.s.setAttribute("y", 0);
    const row2 = S.add("text", { x: 0, y: 20, "text-anchor": "middle", class: "abox-sub" }, db.g);
    const gOps = S.add("g", null, S.layer);
    const LV = ["Read uncommitted", "Read committed", "Snapshot isolation", "Serializable"];
    const SC = {
      dirty: { label: "Dirty read", min: 1, names: ["T1 · updates x", "T2 · reads x"], init: { a: "x = 2", b: "" },
        bad: [{ t: 1, op: "SET x=3\n(no commit)", set: { a: "x = 3   ← uncommitted!" }, note: "T1 writes x = 3 but hasn't committed yet." },
          { t: 2, op: "READ x\n→ 3", read: 1, cls: "bad", note: "T2 reads the <b>uncommitted</b> value 3 and acts on it." },
          { t: 1, op: "ROLLBACK", set: { a: "x = 2" }, cls: "warn", note: "T1 aborts, so x goes back to 2." }],
        good: [{ t: 1, op: "SET x=3\n(no commit)", set: { a: "x = 2 (committed)", b: "x = 3 (T1, pending)" }, note: "T1 writes x = 3. The DB keeps the old committed value alongside it." },
          { t: 2, op: "READ x\n→ 2", read: 1, cls: "ok", note: "T2 only ever sees <b>committed</b> data." },
          { t: 1, op: "ROLLBACK", set: { a: "x = 2", b: "" }, note: "T1 aborts. T2 never saw the value that was rolled back." }],
        badOut: "Dirty read: T2 made a decision from a value that never officially existed.",
        goodOut: "Read committed prevents dirty reads (and dirty writes, via row locks)." },
      lost: { label: "Lost update", min: 2, names: ["T1 · increment counter", "T2 · increment counter"], init: { a: "counter = 42", b: "" },
        bad: [{ t: 1, op: "READ\n→ 42", read: 1 }, { t: 2, op: "READ\n→ 42", read: 1, note: "Both transactions read 42 (read-modify-write cycle)." },
          { t: 1, op: "WRITE 43", set: { a: "counter = 43" } }, { t: 1, op: "COMMIT", cls: "ok" },
          { t: 2, op: "WRITE 43", set: { a: "counter = 43" }, cls: "bad", note: "T2 writes 42 + 1 = 43, <b>clobbering</b> T1's increment." }, { t: 2, op: "COMMIT" }],
        good: [{ t: 1, op: "READ\n→ 42", read: 1 }, { t: 2, op: "READ\n→ 42", read: 1 },
          { t: 1, op: "WRITE 43", set: { a: "counter = 43" } }, { t: 1, op: "COMMIT", cls: "ok" },
          { t: 2, op: "WRITE 43\n✕ ABORT", cls: "bad", note: "The DB detects the value T2 read has since changed, so T2 is aborted (lost-update detection)." },
          { t: 2, op: "RETRY\nREAD → 43", read: 1 }, { t: 2, op: "WRITE 44\nCOMMIT", set: { a: "counter = 44" }, cls: "ok" }],
        badOut: "Lost update: there were two increments, but the counter only went 42 → 43. Fixes: an atomic UPDATE … SET n = n + 1, SELECT … FOR UPDATE, or compare-and-set.",
        goodOut: "No update lost (44). Snapshot isolation with lost-update detection (PostgreSQL repeatable read, Oracle serializable) aborts the loser. Note: MySQL InnoDB repeatable read does NOT detect this." },
      skew: { label: "Read skew", min: 2, names: ["T1 · transfer $100 acct2 → acct1", "T2 · Alice checks her balances"], init: { a: "acct1 = 500", b: "acct2 = 500" },
        bad: [{ t: 2, op: "READ acct1\n→ 500", read: 1 }, { t: 1, op: "acct1\n+= 100", set: { a: "acct1 = 600" } }, { t: 1, op: "acct2\n-= 100", set: { b: "acct2 = 400" } },
          { t: 1, op: "COMMIT", cls: "ok" }, { t: 2, op: "READ acct2\n→ 400", read: 1, cls: "bad", note: "Alice reads acct2 <i>after</i> the transfer committed." }],
        good: [{ t: 2, op: "READ acct1\n→ 500", read: 1, note: "T2 reads from a snapshot taken when it started." }, { t: 1, op: "acct1\n+= 100", set: { a: "acct1 = 600 (new) │ 500 (old)" } },
          { t: 1, op: "acct2\n-= 100", set: { b: "acct2 = 400 (new) │ 500 (old)" } }, { t: 1, op: "COMMIT", cls: "ok" },
          { t: 2, op: "READ acct2\n→ 500", read: 1, cls: "ok", note: "MVCC keeps the old version, so T2 still sees its consistent snapshot." }],
        badOut: "Read skew (non-repeatable read): Alice sees 500 + 400 = $900, so $100 seems to have vanished. Terrible for backups and analytic queries.",
        goodOut: "Snapshot isolation: Alice sees 500 + 500 = $1000, a consistent point-in-time view (implemented with MVCC)." },
      wskew: { label: "Write skew", min: 3, names: ["T1 · Alice requests leave", "T2 · Bob requests leave"], init: { a: "alice: on call", b: "bob: on call" },
        bad: [{ t: 1, op: "COUNT on_call\n→ 2", read: 1 }, { t: 2, op: "COUNT on_call\n→ 2", read: 1, note: "Both check the rule 'at least one doctor must stay on call': 2 ≥ 2, fine." },
          { t: 1, op: "SET alice\noff", set: { a: "alice: off" } }, { t: 2, op: "SET bob\noff", set: { b: "bob: off" } },
          { t: 1, op: "COMMIT", cls: "ok" }, { t: 2, op: "COMMIT", cls: "bad", note: "They updated <i>different</i> rows, so there's no write conflict to detect." }],
        good: [{ t: 1, op: "COUNT on_call\n→ 2", read: 1 }, { t: 2, op: "COUNT on_call\n→ 2", read: 1 },
          { t: 1, op: "SET alice\noff", set: { a: "alice: off" } }, { t: 2, op: "SET bob\noff" },
          { t: 1, op: "COMMIT", cls: "ok" }, { t: 2, op: "COMMIT\n✕ ABORT", cls: "bad", note: "SSI tracks that T2's premise (count = 2) was invalidated by T1's commit, so it aborts T2." }],
        badOut: "Write skew: nobody is on call now, and the invariant is broken. Snapshot isolation can't catch it. Fixes: serializable isolation, or SELECT … FOR UPDATE on the rows the check depends on.",
        goodOut: "Serializable (SSI / 2PL / serial execution): Bob's request is rejected and he stays on call." }
    };
    let anom = "dirty", lvl = 1, running = false;
    const setRows = (r) => { db.sub(r.a || ""); row2.textContent = r.b || ""; };
    function prep() {
      const sc = SC[anom];
      n1.textContent = sc.names[0]; n2.textContent = sc.names[1]; gOps.innerHTML = ""; setRows(sc.init); db.state("");
      S.stats({ Anomaly: sc.label, "First prevented at": LV[sc.min], [`At ${LV[lvl]}`]: lvl >= sc.min ? "prevented ✓" : "possible ✗" });
    }
    async function run() {
      if (running) return; running = true; prep();
      const sc = SC[anom], safe = lvl >= sc.min, steps = safe ? sc.good : sc.bad, rows = Object.assign({}, sc.init);
      S.log(`At <b>${LV[lvl]}</b>, a ${sc.label.toLowerCase()} is ${safe ? "<b>prevented</b>" : "<b>possible</b>"}. Watch…`);
      const dx = 520 / Math.max(1, steps.length - 1);
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i], x = 90 + i * dx, y = st.t === 1 ? T1Y : T2Y, off = st.t === 1 ? 20 : -20;
        chip(S, x, y, 84, 38, st.op, st.cls || "", gOps);
        const tx = Math.min(490, Math.max(180, x)), ty = st.t === 1 ? DBY - 40 : DBY + 40;
        if (st.read) await S.packet(tx, ty, x, y + off, { ms: 420, cls: st.cls || "", r: 5 });
        else await S.packet(x, y + off, tx, ty, { ms: 420, cls: st.cls || "", r: 5 });
        if (st.set) { Object.assign(rows, st.set); setRows(rows); }
        if (st.note) S.log(st.note, st.cls === "bad" ? "bad" : st.cls === "ok" ? "ok" : "");
        await S.wait(650);
      }
      db.state(safe ? "ok" : "down");
      S.log(safe ? sc.goodOut : sc.badOut, safe ? "ok" : "bad");
      running = false;
    }
    S.onSel("anom", (v) => { anom = v; if (!running) prep(); });
    S.onSel("lvl", (v) => { lvl = +v; if (!running) prep(); });
    S.act("run", run);
    prep(); S.log("Pick an anomaly and an isolation level, then press <b>Run</b>. Try raising the level until the anomaly disappears.");
    return S;
  };

  /* ------------------------- Replication lag anomalies ------------------------- */
  A.lag = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls: sel("mode", [["ryw", "Read-your-writes"], ["mono", "Monotonic reads"], ["prefix", "Consistent prefix reads"]], "Anomaly") + btn("fix", "Fix: off") + btn("run", "Run ▶", "primary") });
    let mode = "ryw", fix = false, running = false, B = {};
    function build() {
      S.layer.innerHTML = ""; S.layerBg.innerHTML = ""; S.layerPk.innerHTML = "";
      if (mode === "prefix") {
        B.ask = S.box(80, 70, 110, 44, "Asker", { cls: "client" });
        B.rsp = S.box(80, 270, 110, 44, "Responder", { cls: "client" });
        B.p1 = S.box(270, 70, 140, 50, "Partition 1 leader", { cls: "db", sub: "∅" });
        B.p2 = S.box(270, 270, 140, 50, "Partition 2 leader", { cls: "db", sub: "∅" });
        B.f1 = S.box(460, 70, 140, 50, "P1 follower", { cls: "db", sub: "lag 3 s · ∅" });
        B.f2 = S.box(460, 270, 140, 50, "P2 follower", { cls: "db", sub: "lag 0.2 s · ∅" });
        B.obs = S.box(585, 170, 96, 44, "Observer", { cls: "client" });
        S.line(135, 70, 200, 70); S.line(135, 270, 200, 270); S.line(340, 70, 390, 70, "aline dashed"); S.line(340, 270, 390, 270, "aline dashed"); S.line(530, 70, 585, 148, "aline dashed"); S.line(530, 270, 585, 192, "aline dashed");
      } else {
        B.user = S.box(80, 165, 110, 48, "You", { cls: "client" });
        B.lead = S.box(330, 60, 170, 50, "Leader", { cls: "db", sub: "comments: 0" });
        B.f1 = S.box(330, 165, 170, 50, "Follower 1", { cls: "db", sub: "lag 0.3 s · comments: 0" });
        B.f2 = S.box(330, 270, 170, 50, "Follower 2", { cls: "db", sub: "lag 4 s · comments: 0" });
        if (mode === "mono") B.other = S.box(575, 60, 110, 44, "Other user", { cls: "client" });
        S.line(330, 85, 330, 140, "aline dashed"); S.add("path", { d: "M415,60 Q470,165 415,270", class: "aline dashed" }, S.layerBg);
      }
      S.stats({ Anomaly: { ryw: "Read-your-writes", mono: "Monotonic reads", prefix: "Consistent prefix reads" }[mode], Fix: fix ? "on" : "off" });
    }
    const cnt = (b, lag, n) => b.sub(`${lag ? "lag " + lag + " · " : ""}comments: ${n}`);
    async function run() {
      if (running) return; running = true; build();
      if (mode === "ryw") {
        await S.send(B.user, B.lead, { label: "post comment" }); cnt(B.lead, "", 1);
        S.send(B.lead, B.f1, { ms: 400, cls: "alt" }).then(() => cnt(B.f1, "0.3 s", 1));
        S.send(B.lead, B.f2, { ms: 4200, cls: "alt" }).then(() => cnt(B.f2, "4 s", 1));
        await S.wait(300);
        const tgt = fix ? B.lead : B.f2;
        await S.send(B.user, tgt, { label: "reload page" });
        if (fix) { await S.send(tgt, B.user, { cls: "ok", label: "1 comment ✓" }); S.log("Fix: reads of <b>data the user may have modified</b> go to the leader (or to a replica that has caught up to the user's last write timestamp).", "ok"); }
        else { await S.send(tgt, B.user, { cls: "bad", label: "0 comments" }); S.log("<b>Read-your-writes violated</b>: you posted, reloaded, and your comment is gone. The read hit a lagging follower.", "bad"); }
      } else if (mode === "mono") {
        await S.send(B.other, B.lead, { label: "post comment" }); cnt(B.lead, "", 1);
        S.send(B.lead, B.f1, { ms: 400, cls: "alt" }).then(() => cnt(B.f1, "0.3 s", 1));
        S.send(B.lead, B.f2, { ms: 5200, cls: "alt" }).then(() => cnt(B.f2, "4 s", 1));
        await S.wait(700);
        await S.send(B.user, B.f1, { label: "read #1" }); await S.send(B.f1, B.user, { cls: "ok", label: "1 comment" });
        const tgt = fix ? B.f1 : B.f2;
        await S.send(B.user, tgt, { label: "read #2" });
        if (fix) { await S.send(tgt, B.user, { cls: "ok", label: "1 comment" }); S.log("Fix: each user always reads from the <b>same replica</b> (e.g. chosen by hash(userId)), so time never goes backwards.", "ok"); }
        else { await S.send(tgt, B.user, { cls: "bad", label: "0 comments" }); S.log("<b>Monotonic reads violated</b>: the first read saw the comment, the refresh hit a staler replica, and it vanished. Time went backwards.", "bad"); }
      } else {
        await S.send(B.ask, B.p1, { label: "Q: how far ahead can you see?" }); B.p1.sub("Q");
        S.send(B.p1, B.f1, { ms: 3200, cls: "alt" }).then(() => B.f1.sub(fix ? "lag 3 s · Q, A" : "lag 3 s · Q"));
        await S.wait(300);
        const tgt = fix ? B.p1 : B.p2;
        await S.send(B.rsp, tgt, { label: "A: about ten seconds" }); tgt.sub(fix ? "Q, A" : "A");
        if (!fix) S.send(B.p2, B.f2, { ms: 250, cls: "alt" }).then(() => B.f2.sub("lag 0.2 s · A"));
        await S.wait(500);
        await S.send(B.obs, B.f2, { ms: 350 }); await S.send(B.obs, B.f1, { ms: 350 });
        if (fix) S.log("Fix: causally related writes go to the <b>same partition</b> (one ordered log), so the observer sees Q then A, or neither yet, never A without Q.", "ok");
        else S.log("<b>Consistent prefix violated</b>: the observer sees the answer before the question. The partitions replicate independently with no global order.", "bad");
      }
      running = false;
    }
    S.onSel("mode", (v) => { mode = v; if (!running) build(); });
    S.act("fix", (b) => { fix = !fix; b.textContent = "Fix: " + (fix ? "on" : "off"); b.classList.toggle("primary", fix); if (!running) build(); });
    S.act("run", run);
    build(); S.log("Asynchronous followers lag behind the leader. Run each anomaly with the fix off, then on.");
    return S;
  };

  /* ----------------------------- Fencing tokens ------------------------------ */
  A.fencing = function (host) {
    const S = new Stage(host, { w: 640, h: 320, controls: btn("fence", "Fencing tokens: on", "primary") + btn("run", "Run scenario ▶") });
    let fence = true, running = false, c1, c2, lock, st;
    function build() {
      S.layer.innerHTML = ""; S.layerBg.innerHTML = ""; S.layerPk.innerHTML = "";
      c1 = S.box(90, 70, 130, 50, "Client 1", { cls: "service", sub: "" });
      c2 = S.box(90, 260, 130, 50, "Client 2", { cls: "service", sub: "" });
      lock = S.box(320, 165, 170, 56, "Lock service", { cls: "edge", sub: "ZooKeeper · lease 3 s" });
      st = S.box(560, 165, 140, 56, "Storage", { cls: "db", sub: "file: v0" });
      S.line(155, 80, 235, 150, "aline dashed"); S.line(155, 250, 235, 180, "aline dashed"); S.line(155, 70, 490, 150, "aline dashed"); S.line(155, 260, 490, 180, "aline dashed");
      S.stats({ "Fencing tokens": fence ? "on" : "off", "Storage checks token": fence ? "yes (rejects older)" : "no" });
    }
    async function run() {
      if (running) return; running = true; build(); let maxTok = 0;
      await S.send(c1, lock, { label: "acquire lease" }); await S.send(lock, c1, { cls: "ok", label: "ok · token 33" }); c1.sub("holds lease · token 33");
      S.log("Client 1 gets the lease with token 33.");
      c1.state("warm"); c1.label("Client 1 ⏸"); S.log("Client 1 hits a <b>long stop-the-world GC pause</b> and doesn't know time is passing…", "warn");
      for (let s = 3; s > 0; s--) { lock.sub(`lease expires in ${s} s`); await S.wait(600); }
      lock.sub("lease 33 expired");
      await S.send(c2, lock, { label: "acquire lease" }); await S.send(lock, c2, { cls: "ok", label: "ok · token 34" }); c2.sub("holds lease · token 34");
      await S.send(c2, st, { label: "write (34)", cls: "ok" }); maxTok = 34; st.sub("file: v1 by C2 · max token 34");
      S.log("Client 2 gets the lease (token 34) and writes to storage.");
      await S.wait(500); c1.state(""); c1.label("Client 1"); S.log("Client 1 wakes up, still <b>believing</b> it holds the lease.", "warn");
      await S.send(c1, st, { label: "write (33)", cls: "warn" });
      if (fence) { await S.send(st, c1, { cls: "bad", label: "rejected: 33 < 34" }); st.state("ok"); S.log("With fencing, storage remembers the highest token it has seen (34) and <b>rejects the stale write</b> from token 33. The data is safe.", "ok"); }
      else { st.sub("file: v2 by C1 (stale!)"); st.state("down"); S.log("Without fencing, storage accepts Client 1's write, <b>corrupting</b> Client 2's work. A lease alone can't protect against process pauses.", "bad"); }
      void maxTok; running = false;
    }
    S.act("fence", (b) => { fence = !fence; b.textContent = "Fencing tokens: " + (fence ? "on" : "off"); b.classList.toggle("primary", fence); build(); });
    S.act("run", run);
    build(); S.log("A node can't trust its own sense of time. Run the scenario with fencing on, then off.");
    return S;
  };

  /* --------------------------- Schema evolution ------------------------------ */
  A.encoding = function (host) {
    const S = new Stage(host, { w: 640, h: 340, controls: sel("chg", [["addOpt", "Add optional field (with default)"], ["addReq", "Add required field"], ["remOpt", "Remove optional field"], ["remReq", "Remove required field"], ["widen", "Change int32 → int64"]], "Schema change v1 → v2") + btn("bwd", "Backward: new code reads old data", "primary") + btn("fwd", "Forward: old code reads new data") });
    const base = [{ tag: 1, name: "userName", type: "string", req: true }, { tag: 2, name: "favoriteNumber", type: "int64", req: false }, { tag: 3, name: "interests", type: "list<string>", req: false }];
    const vals = { 1: "'alice'", 2: "1337", 3: "[hiking, jazz]", 4: "'a@x.io'" };
    let chg = "addOpt", running = false;
    function schemas() {
      let v1 = base.map((f) => Object.assign({}, f)), v2 = base.map((f) => Object.assign({}, f));
      if (chg === "addOpt") v2.push({ tag: 4, name: "email", type: "string", req: false, def: "''" });
      if (chg === "addReq") v2.push({ tag: 4, name: "email", type: "string", req: true });
      if (chg === "remOpt") v2 = v2.filter((f) => f.tag !== 3);
      if (chg === "remReq") v2 = v2.filter((f) => f.tag !== 1);
      if (chg === "widen") { v1[1].type = "int32"; v2[1].type = "int64"; }
      return { v1, v2 };
    }
    const gAll = S.add("g", null, S.layer);
    let writerB, readerB, bytesB;
    function draw() {
      gAll.innerHTML = ""; S.layerPk.innerHTML = "";
      const { v1, v2 } = schemas();
      writerB = S.box(80, 75, 120, 50, "Writer", { cls: "service", sub: "", parent: gAll });
      bytesB = S.box(320, 75, 260, 56, "", { cls: "storage", parent: gAll });
      readerB = S.box(560, 75, 120, 50, "Reader", { cls: "service", sub: "", parent: gAll });
      [[v1, 170, "Schema v1 (old)"], [v2, 470, "Schema v2 (new)"]].forEach(([sc, x, title]) => {
        S.text(x, 175, title, "atext strong", "middle", gAll);
        sc.forEach((f, i) => S.text(x, 197 + i * 18, `${f.req ? "required" : "optional"} ${f.type} ${f.name} = ${f.tag}${f.def ? "  (default " + f.def + ")" : ""}`, "atext mono small", "middle", gAll));
      });
      S.text(320, 300, "Protobuf/Thrift identify fields by tag number. Avro matches by name using the writer's and reader's schemas.", "atext tiny", "middle", gAll);
      S.text(320, 316, "Rule: never reuse a tag, and only add or remove fields that are optional or have defaults.", "atext tiny", "middle", gAll);
    }
    async function run(dir) {
      if (running) return; running = true; draw();
      const { v1, v2 } = schemas();
      const W = dir === "bwd" ? v1 : v2, R = dir === "bwd" ? v2 : v1;
      writerB.sub(dir === "bwd" ? "old code · v1" : "new code · v2"); readerB.sub(dir === "bwd" ? "new code · v2" : "old code · v1");
      const bytes = [];
      for (let i = 0; i < W.length; i++) {
        const f = W[i]; const v = f.tag === 2 && chg === "widen" && W === v2 ? "5000000000" : vals[f.tag];
        await S.packet(140, 75, 200 + i * 62 + 28, 75, { ms: 300, r: 4 });
        chip(S, 200 + i * 62 + 28, 75, 58, 36, `#${f.tag} ${f.type.replace("list<string>", "list")}\n${v}`, "", gAll);
        bytes.push({ tag: f.tag, v, type: f.type });
      }
      await S.packet(450, 75, 500, 75, { ms: 400, r: 5 });
      let ok = true; const lines = [];
      R.forEach((f) => {
        const b = bytes.find((x) => x.tag === f.tag);
        if (b) {
          if (chg === "widen" && f.tag === 2 && f.type === "int32" && b.v === "5000000000") { lines.push(["⚠ " + f.name + ": truncated to 32 bits!", "warn"]); }
          else lines.push(["✓ " + f.name + " = " + b.v, "ok"]);
        } else if (f.req) { lines.push(["✕ " + f.name + ": REQUIRED but missing", "bad"]); ok = false; }
        else lines.push(["○ " + f.name + " → default " + (f.def || "(empty)"), ""]);
      });
      bytes.filter((b) => !R.some((f) => f.tag === b.tag)).forEach((b) => lines.push(["↷ unknown tag #" + b.tag + " skipped", ""]));
      lines.forEach(([t, c], i) => S.text(560, 120 + i * 15, t, "atext tiny " + (c === "bad" ? "bad" : c === "ok" ? "ok" : ""), "middle", gAll));
      readerB.state(ok ? "ok" : "down");
      const warn = lines.some(([, c]) => c === "warn");
      const what = dir === "bwd" ? "Backward compatibility (new code reading old data)" : "Forward compatibility (old code reading new data)";
      S.log(`${what}: <b>${ok ? (warn ? "works, but with data loss" : "works") : "BREAKS"}</b>. ${!ok ? "A field one side requires is missing on the other." : warn ? "The old reader can't hold the wider value." : "Unknown fields are skipped and missing optional fields get defaults."}`, ok ? (warn ? "warn" : "ok") : "bad");
      running = false;
    }
    S.onSel("chg", (v) => { chg = v; if (!running) draw(); });
    S.act("bwd", () => run("bwd")); S.act("fwd", () => run("fwd"));
    draw(); S.log("During a rolling upgrade, old and new code run side by side, so data must be readable in <b>both</b> directions. Try each change.");
    return S;
  };

  /* --------------------------- Stream windows ------------------------------- */
  A.windows = function (host) {
    const S = new Stage(host, { w: 640, h: 300, controls: sel("wt", [["tumbling", "Tumbling (5 s)"], ["hopping", "Hopping (10 s, every 5 s)"], ["session", "Session (gap 2.5 s)"]], "Window") + sel("late", [["update", "Late data: update result"], ["drop", "Late data: drop"]], "Policy") + btn("gen", "New events", "primary") + btn("lateb", "Late event arrives") });
    const X0 = 40, X1 = 610, T = 30, px = (X1 - X0) / T, x = (t) => X0 + t * px, AX = 230;
    S.line(X0, AX, X1, AX, "aline");
    for (let t = 0; t <= T; t += 5) { S.line(x(t), AX - 4, x(t), AX + 4, "aline"); S.text(x(t), AX + 18, t + " s", "atext tiny"); }
    S.text(X0, 286, "event time →", "atext tiny", "start");
    const wm = S.add("line", { x1: x(26), y1: 30, x2: x(26), y2: AX, class: "aline dashed wm" }, S.layer);
    S.text(x(26), 24, "watermark", "atext tiny");
    const gW = S.add("g", null, S.layerBg), gE = S.add("g", null, S.layer);
    let wt = "tumbling", late = "update", events = [];
    function wins() {
      if (wt === "tumbling") return Array.from({ length: 6 }, (_, i) => ({ s: i * 5, e: i * 5 + 5, row: 0 }));
      if (wt === "hopping") return Array.from({ length: 5 }, (_, i) => ({ s: i * 5, e: i * 5 + 10, row: i % 2 }));
      const ts = events.map((e) => e.t).sort((a, b) => a - b), out = [];
      ts.forEach((t) => { const last = out[out.length - 1]; if (last && t - last.last <= 2.5) { last.last = t; last.e = t + 2.5; } else out.push({ s: t, last: t, e: t + 2.5, row: 0 }); });
      return out.map((w) => ({ s: w.s, e: Math.min(T, w.e), row: 0 }));
    }
    function draw(flash) {
      gW.innerHTML = "";
      wins().forEach((w, i) => {
        const inW = events.filter((e) => e.t >= w.s && e.t < w.e && !(e.late && late === "drop")).length;
        const y = w.row ? 118 : 90, h = w.row ? 100 : 128;
        S.add("rect", { x: x(w.s) + 1, y, width: Math.max(4, x(w.e) - x(w.s) - 2), height: h, rx: 6, class: "win w" + (i % 2) + (flash != null && flash >= w.s && flash < w.e ? " flash" : "") }, gW);
        S.add("text", { x: (x(w.s) + x(w.e)) / 2, y: y + 14, "text-anchor": "middle", class: "atext small strong", text: "count " + inW }, gW);
      });
    }
    async function gen() {
      events = []; gE.innerHTML = ""; draw();
      const ts = []; for (let i = 0; i < 18; i++) ts.push(Math.random() < 0.3 ? rnd(12, 15) : rnd(0.3, 25.5));
      for (const t of ts.sort((a, b) => a - b)) {
        const c = S.add("circle", { cx: x(t), cy: 40, r: 5, class: "evdot" }, gE);
        events.push({ t, el: c });
        S.tween(350, (e) => c.setAttribute("cy", 40 + e * (AX - 12 - 40)));
        await S.wait(90); draw();
      }
      S.stats({ Events: events.length, "Window type": wt, "Late policy": late });
    }
    S.act("gen", gen);
    S.act("lateb", async () => {
      const t = rnd(5.2, 9.8), c = S.add("circle", { cx: x(28.5), cy: 40, r: 6, class: "evdot late" }, gE);
      S.log(`A <b>straggler</b> arrives now (processing time ≈ 28 s) but its <b>event time is ${t.toFixed(1)} s</b>: its window closed long ago (the watermark passed it).`, "warn");
      await S.tween(700, (e) => { c.setAttribute("cx", x(28.5) + (x(t) - x(28.5)) * e); c.setAttribute("cy", 40 + e * (AX - 12 - 40)); });
      events.push({ t, el: c, late: true });
      if (late === "drop") { c.classList.add("dropped"); S.log("Policy <b>drop</b>: ignore it (and count dropped events as a metric).", ""); draw(); }
      else { draw(t); S.log("Policy <b>update</b>: emit a <b>correction</b> for the already-published window.", "ok"); }
    });
    S.onSel("wt", (v) => { wt = v; draw(); S.log({ tumbling: "Tumbling: fixed, non-overlapping windows. Every event belongs to exactly one.", hopping: "Hopping: fixed length, overlapping. An event can count in several windows (e.g. 10-minute averages updated every 5 minutes).", session: "Session: no fixed length. A window ends after a gap of inactivity (user sessions). Sliding windows (not shown) cover all events within an interval of each other." }[v]); });
    S.onSel("late", (v) => { late = v; draw(); });
    void wm; gen();
    S.log("Events are placed by <b>event time</b> (when they happened), not arrival time. Try each window type, then send a late event.");
    return S;
  };

  /* ------------------------------ MapReduce ---------------------------------- */
  A.mapreduce = function (host) {
    const S = new Stage(host, { w: 640, h: 330, controls: sel("txt", [["0", "the cat sat / the dog sat / the cat ran"], ["1", "to be or not / to be is to do / do be do"]], "Input") + btn("comb", "Combiner: off") + btn("run", "Run job ▶", "primary") });
    const TEXTS = [["the cat sat", "the dog sat", "the cat ran"], ["to be or not", "to be is to do", "do be do"]];
    let ti = 0, comb = false, running = false, B = {};
    function build() {
      S.layer.innerHTML = ""; S.layerBg.innerHTML = ""; S.layerPk.innerHTML = "";
      S.text(75, 22, "Input splits (HDFS)", "atext tiny"); S.text(230, 22, "Map", "atext tiny"); S.text(420, 22, "Shuffle → Reduce", "atext tiny"); S.text(585, 22, "Output", "atext tiny");
      B.in = TEXTS[ti].map((t, i) => S.box(75, 70 + i * 95, 120, 40, t, { cls: "storage" }));
      B.map = [0, 1, 2].map((i) => S.box(230, 70 + i * 95, 88, 40, "Mapper " + (i + 1), { cls: "worker" }));
      B.red = [0, 1].map((i) => { const b = S.box(420, 95 + i * 140, 130, 110, "Reducer " + (i + 1), { cls: "service" }); b.t.setAttribute("y", -40); b.lines = S.add("g", null, b.g); return b; });
      B.out = [0, 1].map((i) => { const b = S.box(585, 95 + i * 140, 90, 110, "part-" + i, { cls: "db" }); b.t.setAttribute("y", -40); b.lines = S.add("g", null, b.g); return b; });
      B.in.forEach((b, i) => S.line(135, b.y, 186, B.map[i].y));
      B.map.forEach((m) => B.red.forEach((r) => S.line(274, m.y, 355, r.y, "aline dashed")));
      B.red.forEach((r, i) => S.line(485, r.y, 540, B.out[i].y));
      S.stats({ Combiner: comb ? "on" : "off", "Map output records": "–", "Records shuffled": "–" });
    }
    const part = (w) => hash(w) % 2;
    async function run() {
      if (running) return; running = true; build();
      const recv = [{}, {}]; let mapOut = 0, shuffled = 0;
      await Promise.all(B.in.map((b, i) => S.send(b, B.map[i], { ms: 400, label: "split " + (i + 1) })));
      B.map.forEach((m) => m.state("busy"));
      await S.wait(300);
      const emits = [];
      TEXTS[ti].forEach((line, i) => {
        const words = line.split(" "); mapOut += words.length;
        if (comb) { const c = {}; words.forEach((w) => (c[w] = (c[w] || 0) + 1)); Object.entries(c).forEach(([w, n]) => emits.push([i, w, n])); }
        else words.forEach((w) => emits.push([i, w, 1]));
      });
      S.log(`Mappers emit <b>${mapOut}</b> (word, 1) pairs${comb ? `. The combiner pre-sums locally, so only <b>${emits.length}</b> records cross the network` : ""}. Each key goes to reducer hash(word) mod 2.`);
      for (const [i, w, n] of emits) {
        const r = part(w); shuffled++;
        S.send(B.map[i], B.red[r], { ms: 650, label: `${w}:${n}`, r: 4, cls: r ? "alt" : "" }).then(() => { recv[r][w] = (recv[r][w] || 0) + n; });
        await S.wait(comb ? 170 : 120);
      }
      await S.wait(800);
      B.map.forEach((m) => m.state("ok"));
      S.log("Shuffle done: each reducer receives <b>all values for its keys, sorted by key</b>, and sums them.");
      for (let r = 0; r < 2; r++) {
        B.red[r].state("busy");
        const keys = Object.keys(recv[r]).sort();
        keys.slice(0, 6).forEach((k, j) => S.add("text", { x: 0, y: -18 + j * 14, "text-anchor": "middle", class: "atext mono tiny", text: `${k} → ${recv[r][k]}` }, B.red[r].lines));
        await S.send(B.red[r], B.out[r], { ms: 450, cls: "ok" });
        keys.slice(0, 6).forEach((k, j) => S.add("text", { x: 0, y: -18 + j * 14, "text-anchor": "middle", class: "atext mono tiny", text: `${k}\t${recv[r][k]}` }, B.out[r].lines));
        B.red[r].state("ok");
      }
      S.stats({ Combiner: comb ? "on" : "off", "Map output records": mapOut, "Records shuffled": shuffled, "Distinct keys": Object.keys(recv[0]).length + Object.keys(recv[1]).length });
      S.log("Output files are written to HDFS. If any task fails, the framework just re-runs it: inputs are immutable and failed outputs are discarded.", "ok");
      running = false;
    }
    S.onSel("txt", (v) => { ti = +v; build(); });
    S.act("comb", (b) => { comb = !comb; b.textContent = "Combiner: " + (comb ? "on" : "off"); b.classList.toggle("primary", comb); build(); });
    S.act("run", run);
    build(); S.log("Word count, the 'hello world' of MapReduce. Press <b>Run job</b>, then enable the combiner to shrink the shuffle.");
    return S;
  };

  /* ------------------------------- LRU cache --------------------------------- */
  A.lru = function (host) {
    const S = new Stage(host, { w: 640, h: 300, controls: `<label class="ctl"><span>Key</span><select data-sel="key">${"ABCDEFG".split("").map((k) => `<option>${k}</option>`).join("")}</select></label>` + btn("get", "get(key)", "primary") + btn("put", "put(key)") + btn("rand", "Random ops ×6") + btn("reset", "Reset") });
    const CAP = 4, NX = (i) => 130 + i * 120, NY = 200;
    S.text(20, 50, "HashMap", "atext strong", "start");
    S.text(20, 66, "key → node (O(1) lookup)", "atext tiny", "start");
    S.text(20, 180, "Doubly", "atext strong", "start"); S.text(20, 196, "linked list", "atext strong", "start");
    S.text(NX(0), 250, "HEAD · most recent", "atext tiny"); S.text(NX(CAP - 1), 250, "TAIL · evicted next", "atext tiny");
    const gMap = S.add("g", null, S.layer), gList = S.add("g", null, S.layer), gArr = S.add("g", null, S.layerBg);
    let list = [], nodes = {}, hits = 0, misses = 0, evictions = 0, busy = false, ver = 0;
    function mkNode(k, v) {
      const g = S.add("g", { class: "lnode" }, gList);
      g.style.transform = `translate(${NX(CAP)}px, ${NY}px)`;
      S.add("rect", { x: -44, y: -24, width: 88, height: 48, rx: 9 }, g);
      S.add("text", { x: 0, y: -2, "text-anchor": "middle", class: "abox-label", text: k }, g);
      const vt = S.add("text", { x: 0, y: 14, "text-anchor": "middle", class: "abox-sub", text: "val " + v }, g);
      return { k, g, vt };
    }
    function layout() {
      list.forEach((k, i) => (nodes[k].g.style.transform = `translate(${NX(i)}px, ${NY}px)`));
      gArr.innerHTML = "";
      for (let i = 0; i < list.length - 1; i++) S.add("line", { x1: NX(i) + 46, y1: NY, x2: NX(i + 1) - 46, y2: NY, class: "aline thick dll" }, gArr);
      gMap.innerHTML = "";
      "ABCDEFG".split("").forEach((k, i) => {
        const on = list.includes(k), x = 140 + i * 66;
        const g = S.add("g", { class: "mslot" + (on ? " on" : ""), transform: `translate(${x},58)` }, gMap);
        S.add("rect", { x: -26, y: -16, width: 52, height: 32, rx: 6 }, g);
        S.add("text", { x: 0, y: 5, "text-anchor": "middle", class: "abox-label", text: on ? k + " → ●" : k }, g);
        if (on) S.add("line", { x1: x, y1: 76, x2: NX(list.indexOf(k)), y2: NY - 26, class: "aline dashed" }, gArr);
      });
      S.stats({ Capacity: CAP, Size: list.length, Hits: hits, Misses: misses, Evictions: evictions, "Order (MRU→LRU)": list.join(" › ") || "∅" });
    }
    async function op(kind, k) {
      if (busy) return; busy = true;
      if (kind === "get") {
        if (nodes[k] && list.includes(k)) { hits++; list = [k, ...list.filter((x) => x !== k)]; nodes[k].g.classList.add("hit"); setTimeout(() => nodes[k] && nodes[k].g.classList.remove("hit"), 600); S.log(`get(${k}) → <b>hit</b>. Found via the hash map in O(1) and <b>moved to the head</b> (most recently used).`, "ok"); }
        else { misses++; S.log(`get(${k}) → <b>miss</b> (-1)`, "warn"); }
      } else {
        const v = ++ver;
        if (list.includes(k)) { nodes[k].vt.textContent = "val " + v; list = [k, ...list.filter((x) => x !== k)]; S.log(`put(${k}) → updated the value and moved it to the head.`); }
        else {
          if (list.length >= CAP) {
            const ev = list.pop(); evictions++;
            const g = nodes[ev].g; g.classList.add("evict"); g.style.transform = `translate(${NX(CAP)}px, ${NY + 60}px)`;
            S.log(`Cache full → <b>evict ${ev}</b> from the tail (least recently used), and remove it from the hash map.`, "bad");
            setTimeout(() => g.remove(), 500); delete nodes[ev];
          }
          nodes[k] = mkNode(k, v); list = [k, ...list];
          S.log(`put(${k}) → new node inserted at the head. Every operation is O(1).`);
        }
      }
      requestAnimationFrame(layout);
      await S.wait(550); busy = false;
    }
    const keySel = host.querySelector('[data-sel="key"]');
    S.act("get", () => op("get", keySel.value)); S.act("put", () => op("put", keySel.value));
    S.act("rand", async () => { for (let i = 0; i < 6; i++) { await op(Math.random() < 0.55 ? "put" : "get", pick("ABCDEFG".split(""))); await S.wait(250); } });
    S.act("reset", () => { list = []; nodes = {}; gList.innerHTML = ""; hits = misses = evictions = 0; layout(); });
    layout(); S.log("An LRU cache = <b>hash map</b> (key → node) + <b>doubly linked list</b> (recency order). Try put(A), put(B)… beyond capacity 4.");
    return S;
  };

  /* -------------------------------- Hash map --------------------------------- */
  A.hashmap = function (host) {
    const S = new Stage(host, { w: 640, h: 340, controls: `<label class="ctl"><span>Key</span><input data-in="k" type="text" value="cat" maxlength="4" autocomplete="off"></label>` + btn("put", "put", "primary") + btn("get", "get") + btn("del", "remove") + btn("fill", "Insert 5 random") + btn("reset", "Reset") });
    const words = ["dog", "emu", "fox", "gnu", "yak", "owl", "bee", "ant", "elk", "ram", "cod", "hen", "jay", "koi", "ox", "bat", "cow", "pig", "rat", "eel"];
    let n = 8, buckets, busy = false, resizes = 0;
    const gB = S.add("g", null, S.layer), gE = S.add("g", null, S.layer);
    const bx = (i) => 40 + (i + 0.5) * (570 / n);
    function reset() { n = 8; buckets = Array.from({ length: n }, () => []); resizes = 0; draw(); }
    function draw(hl) {
      gB.innerHTML = ""; gE.innerHTML = "";
      const w = 570 / n - 4;
      for (let i = 0; i < n; i++) {
        S.add("rect", { x: bx(i) - w / 2, y: 40, width: w, height: 26, rx: 5, class: "hbucket" + (hl && hl.b === i ? " hl" : "") }, gB);
        S.add("text", { x: bx(i), y: 57, "text-anchor": "middle", class: "atext tiny", text: "[" + i + "]" }, gB);
        buckets[i].forEach((k, d) => {
          const y = 92 + d * 30;
          if (d === 0) S.add("line", { x1: bx(i), y1: 66, x2: bx(i), y2: y - 11, class: "aline" }, gB);
          else S.add("line", { x1: bx(i), y1: y - 19, x2: bx(i), y2: y - 11, class: "aline" }, gB);
          const g = S.add("g", { class: "hentry" + (hl && hl.k === k ? " hl" : ""), transform: `translate(${bx(i)},${y})` }, gE);
          S.add("rect", { x: -w / 2 + 1, y: -11, width: w - 2, height: 22, rx: 5 }, g);
          S.add("text", { x: 0, y: 4, "text-anchor": "middle", class: "atext mono tiny", text: k }, g);
        });
      }
      const size = buckets.reduce((a, b) => a + b.length, 0), longest = Math.max(...buckets.map((b) => b.length));
      S.stats({ Buckets: n, Entries: size, "Load factor": (size / n).toFixed(2) + " (resize > 0.75)", "Longest chain": longest, Resizes: resizes });
    }
    const idx = (k) => hash(k) % n;
    async function put(k) {
      const i = idx(k);
      await S.packet(320, 320, bx(i), 70, { ms: 450, label: `hash("${k}") % ${n} = ${i}`, r: 5 });
      if (buckets[i].includes(k)) { S.log(`"${k}" already in bucket ${i}: value overwritten.`); draw({ b: i, k }); return; }
      buckets[i].push(k); draw({ b: i, k });
      S.log(buckets[i].length > 1 ? `Collision in bucket ${i}: "${k}" is <b>chained</b> after ${buckets[i].length - 1} other entr${buckets[i].length > 2 ? "ies" : "y"} (a lookup scans the chain).` : `"${k}" stored in bucket ${i}.`, buckets[i].length > 1 ? "warn" : "ok");
      const size = buckets.reduce((a, b) => a + b.length, 0);
      if (size / n > 0.75) {
        await S.wait(500);
        S.log(`Load factor ${(size / n).toFixed(2)} > 0.75 → <b>resize</b> to ${n * 2} buckets and rehash every key (amortised O(1) per insert).`, "warn");
        const all = buckets.flat(); n *= 2; resizes++; buckets = Array.from({ length: n }, () => []);
        all.forEach((key) => buckets[hash(key) % n].push(key)); draw();
      }
    }
    async function act(kind) {
      if (busy) return; busy = true;
      const k = host.querySelector('[data-in="k"]').value.trim().toLowerCase().slice(0, 4);
      if (k) {
        if (kind === "put") await put(k);
        else {
          const i = idx(k);
          await S.packet(320, 320, bx(i), 70, { ms: 400, label: `bucket ${i}`, r: 5 });
          const pos = buckets[i].indexOf(k);
          if (kind === "get") S.log(pos >= 0 ? `get("${k}") → found in bucket ${i} after ${pos + 1} comparison(s).` : `get("${k}") → not found (scanned ${buckets[i].length} entr${buckets[i].length === 1 ? "y" : "ies"}).`, pos >= 0 ? "ok" : "warn");
          else { if (pos >= 0) buckets[i].splice(pos, 1); S.log(pos >= 0 ? `remove("${k}") → unlinked from bucket ${i}'s chain.` : `"${k}" isn't there.`); }
          draw({ b: i, k });
        }
      }
      busy = false;
    }
    S.act("put", () => act("put")); S.act("get", () => act("get")); S.act("del", () => act("del"));
    S.act("fill", async () => { if (busy) return; busy = true; for (const w of shuffle(words).slice(0, 5)) await put(w); busy = false; });
    S.act("reset", reset);
    host.querySelector('[data-in="k"]').addEventListener("keydown", (e) => { if (e.key === "Enter") act("put"); });
    reset(); S.log("A hash map = an array of buckets. index = hash(key) mod capacity. Collisions are chained; when the load factor gets high, the table doubles.");
    return S;
  };
})();
