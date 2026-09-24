# System Design Cheat Sheet (interactive)

An animated, interactive system design cheat sheet. It's a static site with no build step, so it can be hosted on GitHub Pages as is.

## What's inside

| Page | What you get |
|---|---|
| **Study Map** | Every chapter and section of *Designing Data-Intensive Applications* (Kleppmann) and every topic in [The System Design Primer](https://github.com/donnemartin/system-design-primer), mapped to the concepts, simulations, databases and scenarios that cover them, with a coverage check (100% of the 169 DDIA sections and 117 primer topics, down to each section's trade-offs and disadvantages). Chapter progress, "I've read this" tracking, real-world systems (MapReduce → ZooKeeper), key lessons from 23 company architectures, 41 engineering blogs, and classic papers. |
| **Stack Advisor** | Pick requirements (data shape, consistency, workload, scale) or a preset. It scores 12 database families, recommends a polyglot stack (primary DB, cache, search, queue, object store, OLAP…) with reasons, and **generates an animated architecture diagram** with write and read flows. Also includes a filterable "problem → component" table. |
| **Scenarios** | 32 designs: URL shortener/Pastebin, rate limiter, KV store, distributed cache, web crawler, search engine, notifications, news feed, chat, autocomplete, video streaming, photo sharing, Dropbox, Uber, Yelp, e-commerce, payments, Mint, ticketing, leaderboard, trending topics/top-k, monitoring, Google Docs, job scheduler, ad-click aggregation, social graph, Amazon sales rank, recommendations, CDN, multiplayer card game, stock exchange, scaling to millions on AWS. Each covers requirements, estimates, API, data model, **key decisions (what DB and why)**, an animated architecture with step-by-step request flows, deep dives, pitfalls and trade-offs. |
| **Databases** | Interactive decision tree, a catalog of 12 families (strengths, weaknesses, use and avoid cases, real-world users), a fit matrix, SQL vs NoSQL, and storage engines. |
| **Concepts** | 113 concepts, including all of DDIA's topics and the primer's object-oriented design problems (hash map, LRU cache, parking lot, call center, deck of cards, chat server, circular array, each with a code sketch). 26 have **live simulations**: load balancing, caching strategies (including refresh-ahead), consistent hashing, replication and failover, replication-lag anomalies, sharding skew, rate limiters, CAP, queue vs pub/sub, CDN, Bloom filter, circuit breaker, quorum, LSM tree, polling vs SSE vs WebSockets, Snowflake IDs, quadtree/geohash, saga, Raft, transaction isolation anomalies (dirty read, lost update, read skew, write skew), fencing tokens, schema evolution, stream windows, MapReduce, LRU cache and hash map. Others have step-by-step flow diagrams (DNS, 2PC, OAuth, CDC/outbox, CQRS). |
| **Numbers** | Modern and classic (2012) latency numbers (log-scale, can be humanised), handy throughput metrics, a back-of-the-envelope estimator, an availability calculator, capacities per node, and conversions. |
| **Framework** | A study guide by timeline (short/medium/long), a 7-step interview approach with a time budget, persistent checklists, trade-offs and an NFR checklist. |
| **Quiz / Flashcards / Glossary** | 54 questions with explanations; flip-card decks (glossary, concepts, scenarios, OOD) with got-it/again tracking; 138 glossary terms. |

Extras: search with ⌘K or `/`, light and dark themes, "mark as learned" progress tracking (saved in `localStorage`), and support for reduced motion.

## Run locally

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy to GitHub Pages

```bash
git init && git add . && git commit -m "System design cheat sheet"
gh repo create system-design-cheatsheet --public --source=. --push
```

Then go to **Settings → Pages → Build and deployment → Source: Deploy from a branch → `main` / root**. The site will be live at `https://<you>.github.io/system-design-cheatsheet/`.

(`.nojekyll` is included so Pages serves the files untouched. Routing is hash-based, so deep links work without a 404 fallback.)

## Extending

All content lives in plain data files, so you don't need to touch the rendering code:

- `assets/js/data/scenarios.js`: add a scenario. Diagram nodes use a 1000×520 grid: `n(id, label, sub, type, x, y, desc)`. Flows are lists of `[from, to, caption]` steps.
- `assets/js/data/databases.js`: DB families, the advisor's scoring matrix (0–3 per requirement) and the decision tree.
- `assets/js/data/concepts.js`: concepts; set `anim` to one of the keys in `animations.js`, or give it a `diagram`.
- `assets/js/data/reference.js`: numbers, framework, trade-offs, quick picks, glossary, quiz.
- `assets/js/data/ddia.js` / `primer.js` / `primer-extra.js`: DDIA- and primer-derived concepts and scenarios, plus the Study Map section → content mappings (reference IDs: `concept-id`, `s:scenario`, `d:database`, `p:page`).

All explanations are original summaries written for learning; they link to, but don't reproduce, the source material.
