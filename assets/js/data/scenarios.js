/* System design scenarios.
 * Diagram coordinates live in a 1000 x 520 viewBox; nodes are 136 x 50 boxes centred on (x, y).
 * n(id, label, sub, type, x, y, desc, icon?)  — types: client, edge, service, cache, db, queue, storage, worker, search, analytics, external
 * Edges: [from, to, label?, curve?]    Flow steps: [from, to, caption]
 */
window.SD = window.SD || {};
(function () {
  const n = (id, label, sub, type, x, y, desc, icon) => ({ id, label, sub, type, x, y, desc, icon });

  SD.scenarios = [
    /* ------------------------------------------------------------------ */
    {
      id: "url-shortener",
      title: "URL Shortener",
      aka: "TinyURL · bit.ly",
      category: "Classic",
      level: "Easy",
      icon: "link",
      summary: "Turn long URLs into short codes and redirect billions of clicks with very low latency.",
      tags: ["key-value", "cache", "base62", "hashing", "read-heavy", "301", "302"],
      functional: [
        "Create a short URL for a long URL (optional custom alias and expiry)",
        "Redirect a short URL to the original with very low latency",
        "Track click analytics (counts, referrer, country, device)",
        "Let owners delete links or let them expire"
      ],
      nonFunctional: [
        "Very read-heavy: about 100 reads for every write",
        "Redirect p99 under 50 ms",
        "Highly available, because broken links are very visible",
        "Codes must be unique and ideally not guessable",
        "Durable: links live for years"
      ],
      estimates: [
        ["New URLs / day", "100 M → ~1.2 K writes/s"],
        ["Redirects / day", "10 B → ~116 K reads/s (peak ~250 K)"],
        ["Record size", "~500 bytes"],
        ["Storage (5 years)", "100 M × 365 × 5 × 500 B ≈ 90 TB"],
        ["Key space", "base62, 7 chars = 62⁷ ≈ 3.5 trillion codes"],
        ["Cache", "The hot 20% of daily URLs is tens of GB, which fits a Redis cluster"]
      ],
      api: [
        "POST /v1/urls  {longUrl, alias?, expiresAt?} → 201 {shortUrl}",
        "GET  /{code}  → 302 Location: <longUrl>",
        "DELETE /v1/urls/{code}",
        "GET  /v1/urls/{code}/stats → clicks by day / country"
      ],
      dataModel: [
        "urls: code (PK) · long_url · owner_id · created_at · expires_at",
        "users: user_id (PK) · email · plan · api_key_hash",
        "clicks (OLAP): code · ts · country · referrer · device"
      ],
      choices: [
        { c: "Primary DB", pick: "Key-value / wide-column (DynamoDB, Cassandra)", why: "Every access is a single-key lookup (code → URL). There are no joins, and the store must scale horizontally to about 100 TB and 100 K+ reads/s.", alt: "PostgreSQL sharded by code is fine up to a few TB, and simpler if you also want rich user dashboards." },
        { c: "Code generation", pick: "Pre-generated keys (KGS) or counter + base62", why: "No collision checks on the hot path. A Key Generation Service hands each app server a batch of unused keys, or each server leases counter ranges from ZooKeeper/etcd.", alt: "Hash(longUrl) and take 7 chars. You must handle collisions, but the same URL always gets the same code." },
        { c: "Cache", pick: "Redis cluster, cache-aside, LRU", why: "Clicks follow a Zipf distribution, so a few links get most of the traffic. Caching them removes 90%+ of DB reads." },
        { c: "Analytics", pick: "Kafka → ClickHouse / Druid", why: "Never block a redirect on analytics. Emit click events asynchronously and aggregate them in a columnar OLAP store." },
        { c: "Redirect status", pick: "302 if analytics matter, 301 otherwise", why: "Browsers cache a 301, so later clicks never reach you: less load, but no tracking and you can't change the target." }
      ],
      diagram: {
        nodes: [
          n("client", "Client", "browser / app", "client", 80, 260, "Users creating links, and everyone clicking them."),
          n("lb", "Load Balancer", "L7, TLS offload", "edge", 240, 260, "Spreads traffic over stateless API servers and health-checks them.", "lb"),
          n("write", "Shorten API", "stateless", "service", 420, 150, "Validates the URL, gets a code, writes the mapping."),
          n("redir", "Redirect Svc", "stateless", "service", 420, 370, "Hot path: looks up code → URL and returns a 302."),
          n("kgs", "Key Gen Svc", "batches of keys", "worker", 600, 60, "Pre-generates random 7-char base62 keys and hands out batches so app servers never collide."),
          n("keydb", "Key Store", "unused / used", "db", 800, 60, "Two tables of unused and used keys. A batch moves to 'used' atomically when leased."),
          n("db", "URL Store", "DynamoDB / Cassandra", "db", 800, 260, "Partitioned by code. Simple GET/PUT by key, replicated 3×."),
          n("cache", "URL Cache", "Redis · LRU", "cache", 600, 370, "Hot codes live here. Cache-aside with TTL, so misses fall back to the DB."),
          n("mq", "Click Stream", "Kafka", "queue", 600, 480, "Asynchronous click events that never slow down redirects."),
          n("olap", "Analytics", "ClickHouse", "analytics", 800, 480, "Columnar store for fast aggregations: clicks per day, country, referrer.")
        ],
        edges: [["client", "lb"], ["lb", "write"], ["lb", "redir"], ["write", "kgs"], ["kgs", "keydb"], ["write", "db"], ["redir", "cache"], ["redir", "db"], ["redir", "mq"], ["mq", "olap"]],
        flows: [
          { name: "Shorten a URL", steps: [
            ["client", "lb", "POST /v1/urls {longUrl}"],
            ["lb", "write", "Routed to any stateless API instance"],
            ["write", "kgs", "Take the next key from a locally cached batch (refill ~1000 at a time)"],
            ["kgs", "keydb", "Refills move a batch from unused → used atomically"],
            ["write", "db", "PUT code → longUrl (conditional put: fail if the code exists)"],
            ["write", "client", "201 Created · https://sho.rt/aZ3kP9x"]
          ]},
          { name: "Redirect", steps: [
            ["client", "lb", "GET /aZ3kP9x"],
            ["lb", "redir", "Routed to the redirect fleet"],
            ["redir", "cache", "GET aZ3kP9x (hit rate usually >90%)"],
            ["redir", "db", "On a miss, read from the DB and populate the cache with a TTL"],
            ["redir", "mq", "Fire-and-forget click event (async, batched)"],
            ["redir", "client", "302 Found · Location: https://very-long-url…"],
            ["mq", "olap", "Consumers aggregate clicks into ClickHouse"]
          ]}
        ]
      },
      deepDives: [
        { t: "Generating unique short codes", b: [
          "Counter + base62: a global counter (or per-server ranges leased from ZooKeeper) encoded in base62. Codes are short and never collide, but they're sequential and guessable, so you can shuffle the bits with a bijective function.",
          "Hash + truncate: MD5/SHA-256(longUrl), take the first 7 base62 chars. You get deterministic dedup, but you must detect collisions and re-hash with a salt.",
          "Key Generation Service: random keys generated offline and stored in a key DB. App servers lease batches, so the hot path does no coordination. Keys in a crashed server's batch are lost, which is fine because there are 3.5 T of them.",
          "Snowflake-style IDs: 64-bit time-ordered IDs, base62-encoded to about 11 chars. Longer codes, but no coordination at all."
        ]},
        { t: "301 vs 302", p: "A 301 (permanent) is cached by browsers and proxies, which cuts your load but means you can't count clicks or re-point the link. A 302 or 307 (temporary) sends every click through you. Most commercial shorteners use 302 for analytics." },
        { t: "Scaling reads", b: [
          "Cache-aside in Redis with LRU eviction; hot keys can also be cached in-process for a few seconds",
          "Partition the URL table by hash(code) so load spreads evenly",
          "Serve redirects from edge workers (CloudFront Functions or Cloudflare Workers with KV) for global p99 under 20 ms"
        ]},
        { t: "Expiry and cleanup", p: "Store expires_at and check it on read (lazy expiry). Run a background sweeper or use the database's native TTL (DynamoDB TTL, Cassandra TTL) to delete old rows, and optionally return expired keys to the KGS pool." },
        { t: "Abuse and security", b: ["Rate-limit creation per API key or IP", "Check long URLs against Safe Browsing / malware lists", "Use non-sequential codes to prevent enumeration"] }
      ],
      pitfalls: ["Viral links create hot keys: use replicated cache entries or a local cache", "The KGS becomes a single point of failure: run replicas that own disjoint key ranges", "Writing analytics synchronously on redirect slows the hot path", "Counting on 301 caching when you need analytics"],
      tradeoffs: [["301 (less load)", "302 (analytics, re-pointable)"], ["Hash (dedup, collisions)", "Counter/KGS (no collisions, needs coordination)"], ["SQL (simple, rich queries)", "NoSQL KV (massive scale, key-only access)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "rate-limiter",
      title: "Distributed Rate Limiter",
      aka: "API throttling",
      category: "Infrastructure",
      level: "Medium",
      icon: "gauge",
      summary: "Limit how many requests a client can make per time window across a fleet of servers.",
      tags: ["token bucket", "sliding window", "redis", "lua", "429", "gateway"],
      functional: [
        "Limit requests per user / IP / API key / endpoint (e.g. 100 req/min)",
        "Return HTTP 429 with Retry-After and X-RateLimit-* headers",
        "Support different rules per plan (free vs paid) and per endpoint",
        "Allow rule changes without redeploying"
      ],
      nonFunctional: [
        "Adds very little latency (under 1–2 ms per check)",
        "Accurate across many gateway instances (a shared counter store)",
        "Fault tolerant: if the limiter is down, fail open (or closed for sensitive APIs)",
        "Handles millions of distinct keys"
      ],
      estimates: [
        ["Traffic", "1 M req/s at the gateway"],
        ["Keys", "10 M active clients × ~100 bytes ≈ 1 GB of counters"],
        ["Redis ops", "~1–2 ops per request → a sharded Redis cluster (≈100 K ops/s per shard)"],
        ["Latency budget", "Redis RTT inside the data centre ~0.3–1 ms"]
      ],
      api: [
        "Middleware: allow(key, rule) → {allowed, remaining, resetAt}",
        "Response headers: X-RateLimit-Limit / -Remaining / -Reset, Retry-After",
        "Admin: PUT /rules/{id} {match, limit, window, algorithm}"
      ],
      dataModel: [
        "rules: id · match (path, plan) · limit · window · algorithm",
        "Redis: rl:{key}:{window} → count  (fixed window, TTL = window)",
        "Redis: rl:{key} → {tokens, last_refill}  (token bucket hash)",
        "Redis ZSET: rl:{key} → request timestamps  (sliding log)"
      ],
      choices: [
        { c: "Counter store", pick: "Redis Cluster (in-memory)", why: "Sub-millisecond atomic INCR/EXPIRE, Lua scripts for atomic multi-step logic, built-in TTL. Shard by client key.", alt: "Local in-process counters (approximate, per node) combined with periodic sync, for extreme scale." },
        { c: "Algorithm", pick: "Token bucket (bursty APIs) or sliding window counter", why: "Token bucket allows short bursts while enforcing an average rate, and is used by AWS and Stripe. A sliding window counter is memory-cheap and smooths the fixed-window boundary spike.", alt: "Sliding log is exact but costs O(requests) memory. Leaky bucket gives a smooth constant outflow, which suits queue-based processing." },
        { c: "Placement", pick: "API gateway / sidecar middleware", why: "Rejects abusive traffic before it reaches services. One place for policy.", alt: "Client-side SDK throttling (cooperative) or per-service limiters for internal protection." },
        { c: "Rules", pick: "Config service (etcd / DB) cached in memory", why: "Rules change rarely and are read on every request, so cache them locally and refresh on change notifications." }
      ],
      diagram: {
        nodes: [
          n("client", "Clients", "users / API keys", "client", 80, 280, "Anyone calling your APIs, good citizens and abusers alike."),
          n("gw", "API Gateway", "limiter middleware", "edge", 270, 280, "Every request passes the limiter check before routing.", "gateway"),
          n("rl", "Rate Limiter", "token bucket", "service", 460, 140, "Library or sidecar that runs the algorithm. Uses an atomic Lua script against Redis."),
          n("redis", "Counter Store", "Redis Cluster", "cache", 680, 60, "Shared counters keyed by client + rule. Sharded by key, TTLs clean up idle keys."),
          n("rules", "Rules Store", "etcd / Postgres", "db", 880, 140, "Limits per plan and endpoint. Cached in memory by every limiter."),
          n("api", "Services", "orders, users …", "service", 680, 380, "Protected backends that only see allowed traffic."),
          n("metrics", "Metrics", "throttle events", "analytics", 460, 460, "Dashboards and alerts on 429 rates, used to tune limits and spot attacks.")
        ],
        edges: [["client", "gw"], ["gw", "rl"], ["rl", "redis"], ["rl", "rules"], ["gw", "api"], ["gw", "metrics"]],
        flows: [
          { name: "Allowed request", steps: [
            ["client", "gw", "GET /v1/orders  (api_key=k_123)"],
            ["gw", "rl", "allow(k_123, 'orders:read')?"],
            ["rl", "rules", "Rule from the local cache: 100 req/min, burst 20"],
            ["rl", "redis", "EVALSHA token_bucket.lua: refill by elapsed time, take 1 token"],
            ["redis", "rl", "Allowed: 57 tokens remain"],
            ["gw", "api", "Forward the request"],
            ["gw", "client", "200 OK · X-RateLimit-Remaining: 57"]
          ]},
          { name: "Throttled request", steps: [
            ["client", "gw", "Burst of 500 requests in 1 second"],
            ["gw", "rl", "allow(k_123)?"],
            ["rl", "redis", "Atomic script: bucket empty"],
            ["redis", "rl", "Denied, retry in 3 s"],
            ["gw", "metrics", "Emit a throttled event (for alerting and abuse detection)"],
            ["gw", "client", "429 Too Many Requests · Retry-After: 3"]
          ]}
        ]
      },
      deepDives: [
        { t: "Algorithms compared", b: [
          "Token bucket: capacity C, refill r tokens/s. Allows bursts up to C. State is 2 numbers per key.",
          "Leaky bucket: a FIFO queue drained at a constant rate. Smooth output, but bursts wait or drop.",
          "Fixed window counter: INCR key:minute. Cheapest, but allows up to 2× the limit around window boundaries.",
          "Sliding window log: a ZSET of timestamps. Exact, but memory grows with the request count.",
          "Sliding window counter: weighted current + previous window. ~99% accurate at fixed-window cost."
        ]},
        { t: "Race conditions", p: "Read-then-write from many gateways races. Use atomic operations: INCR + EXPIRE in a MULTI, or a single Lua script (Redis runs scripts atomically). Avoid distributed locks on the hot path." },
        { t: "Multi-region", p: "Global exact limits need cross-region coordination (slow). Most systems enforce per-region limits (limit / regions), or sync counters asynchronously and accept small overshoot." },
        { t: "Failure modes", b: ["Redis down: fail open (allow) for availability, or fail closed for login / payment endpoints", "Hot keys (one huge customer): shard the key into N sub-counters or use local pre-aggregation", "Clock skew: do timing math inside Redis (TIME) rather than on the gateways"] }
      ],
      pitfalls: ["Non-atomic check-then-increment lets bursts through", "Fixed windows allow 2× bursts at boundaries", "Per-node local limits without syncing multiply the effective limit by the node count", "No Retry-After header makes clients retry immediately and amplify load"],
      tradeoffs: [["Accuracy (sliding log)", "Memory / speed (fixed window)"], ["Fail open (availability)", "Fail closed (protection)"], ["Central Redis (exact)", "Local counters (fast, approximate)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "kv-store",
      title: "Distributed Key-Value Store",
      aka: "Dynamo · Cassandra internals",
      category: "Infrastructure",
      level: "Hard",
      icon: "db",
      summary: "Build a highly available, partitioned, replicated key-value store like Amazon Dynamo.",
      tags: ["consistent hashing", "quorum", "vector clocks", "gossip", "hinted handoff", "read repair", "merkle tree", "AP"],
      functional: ["put(key, value) and get(key)", "Small values (under 10 KB)", "Tunable consistency per request"],
      nonFunctional: ["Always writable (AP): 99.99%+ availability", "Horizontal scalability: add nodes with minimal data movement", "Low latency (single-digit ms p99)", "Survives node, rack and data-centre failures"],
      estimates: [["Data", "100 TB, 3× replication → 300 TB raw"], ["Nodes", "~2 TB usable each → ~150 nodes"], ["Throughput", "1 M ops/s ÷ 150 nodes ≈ 7 K ops/s per node"]],
      api: ["get(key) → [value(s), context]", "put(key, context, value)", "Consistency params: N (replicas), W (write acks), R (read replies)"],
      dataModel: ["Storage engine per node: LSM tree (memtable + WAL + SSTables) or B-tree", "Each value carries a vector clock or a timestamp for conflict resolution"],
      choices: [
        { c: "Partitioning", pick: "Consistent hashing with virtual nodes", why: "Adding or removing a node moves only ~1/N of keys. Virtual nodes even out load and let bigger machines take more vnodes." },
        { c: "Replication", pick: "N = 3 replicas on the next distinct nodes clockwise (rack-aware)", why: "Survives node and rack failure. The preference list skips vnodes on the same physical host." },
        { c: "Consistency", pick: "Quorum: W + R > N (e.g. N=3, W=2, R=2)", why: "Read and write sets overlap, so reads see the latest acknowledged write. Lower W/R for latency and availability." },
        { c: "Conflicts", pick: "Vector clocks (siblings) or last-write-wins", why: "Concurrent writes during partitions create divergent versions. Vector clocks detect them; the app or a CRDT merges them. LWW is simpler but loses data." },
        { c: "Membership", pick: "Gossip protocol + phi-accrual failure detector", why: "Decentralised, no single point of failure. Nodes converge on cluster state in O(log N) rounds." },
        { c: "Storage engine", pick: "LSM tree", why: "Sequential writes → very high write throughput. Bloom filters keep reads fast." }
      ],
      diagram: {
        nodes: [
          n("client", "Client", "SDK", "client", 80, 260, "Talks to any node, or uses a partition-aware client that knows the ring."),
          n("coord", "Coordinator", "any node", "service", 270, 260, "The node that receives a request coordinates it: hashes the key, finds replicas and collects acks."),
          n("A", "Node A", "tokens 0–72", "db", 650, 70, "First replica for this key (owner on the ring)."),
          n("B", "Node B", "tokens 72–144", "db", 830, 200, "Second replica, the next node clockwise."),
          n("C", "Node C", "tokens 144–216", "db", 760, 410, "Third replica."),
          n("D", "Node D", "tokens 216–288", "db", 540, 410, "Holds other key ranges; may keep hinted-handoff writes when a replica is down."),
          n("E", "Node E", "tokens 288–360", "db", 470, 170, "Holds other key ranges.")
        ],
        edges: [["client", "coord"], ["coord", "A"], ["coord", "B", "", 0.15], ["coord", "C"], ["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"], ["E", "A"]],
        flows: [
          { name: "Quorum write (W=2)", steps: [
            ["client", "coord", "put('cart:42', v) with context (vector clock)"],
            ["coord", "A", "hash('cart:42') → token 31 → preference list [A, B, C]"],
            ["coord", "B", "Replicate in parallel"],
            ["coord", "C", "Replicate in parallel"],
            ["A", "coord", "ACK (append to WAL + memtable)"],
            ["B", "coord", "ACK. W=2 reached"],
            ["coord", "client", "Success. C catches up asynchronously"]
          ]},
          { name: "Quorum read + read repair", steps: [
            ["client", "coord", "get('cart:42') with R=2"],
            ["coord", "A", "Read request"],
            ["coord", "B", "Read request"],
            ["A", "coord", "Version with clock [A:3]"],
            ["B", "coord", "Version with clock [A:2] (stale)"],
            ["coord", "B", "Read repair: push the newer version to B"],
            ["coord", "client", "Return the newest value (or siblings if clocks conflict)"]
          ]},
          { name: "Gossip membership", steps: [
            ["A", "B", "Every second: exchange heartbeat counters with a random peer"],
            ["B", "C", "State spreads epidemically"],
            ["C", "D", "D learns about A's heartbeat"],
            ["D", "E", "A node whose heartbeat stops increasing is suspected, then marked down"],
            ["E", "A", "The whole cluster converges in O(log N) rounds"]
          ]}
        ]
      },
      deepDives: [
        { t: "Handling temporary failures: sloppy quorum and hinted handoff", p: "If replica C is down, the write goes to the next healthy node (D) with a hint saying 'this belongs to C'. When C recovers, D hands the data back. The store stays writable during failures." },
        { t: "Handling permanent failures: anti-entropy with Merkle trees", p: "Replicas build a Merkle tree over each key range and compare root hashes. They walk down only the differing subtrees, which makes sync bandwidth proportional to the differences, not the data size." },
        { t: "Tunable consistency", b: ["W=1, R=1: fastest, eventual consistency", "W=N: durable writes but less write availability", "R=N: always fresh reads but slow", "W+R>N: read-your-writes overlap (strong-ish, not linearizable under sloppy quorum)"] },
        { t: "Write path (LSM)", b: ["Append to the commit log (WAL) for durability", "Insert into the in-memory memtable (sorted)", "When the memtable is full, flush to an immutable SSTable on disk", "Background compaction merges SSTables and drops tombstones", "Reads check memtable → bloom filters → SSTables"] }
      ],
      pitfalls: ["LWW with skewed clocks silently drops writes", "Tombstones pile up and slow reads (delete-heavy workloads)", "Hot partitions from bad keys: add a salt or bucket suffix", "Assuming quorum means linearizable"],
      tradeoffs: [["AP (always writable)", "CP (consistent, may reject writes)"], ["Vector clocks (no data loss)", "LWW (simple, can lose writes)"], ["LSM (write-optimised)", "B-tree (read-optimised)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "web-crawler",
      title: "Web Crawler",
      aka: "Googlebot · Common Crawl",
      category: "Data pipeline",
      level: "Medium",
      icon: "spider",
      summary: "Download billions of web pages politely, deduplicate them, and keep them fresh.",
      tags: ["BFS", "frontier", "politeness", "bloom filter", "simhash", "robots.txt", "dns cache"],
      functional: ["Start from seed URLs, fetch pages, extract links and repeat", "Store page content for indexing", "Respect robots.txt and crawl delay", "Re-crawl pages based on change frequency"],
      nonFunctional: ["Scale: ~1 B pages/month", "Politeness: never overload a host (1 connection per host)", "Robust to spider traps, bad HTML and huge pages", "Extensible (images, PDFs later)"],
      estimates: [["Pages/month", "1 B → ~400 pages/s (peak 800)"], ["Page size", "~500 KB → 500 TB/month raw"], ["Storage (5 yrs)", "~30 PB (compress ~5× → 6 PB)"], ["URL-seen set", "10 B URLs → Bloom filter ~12 GB at 1% FP"]],
      api: ["Internal pipeline, no public API", "Frontier: enqueue(url, priority), dequeue(worker) → url"],
      dataModel: ["url_state: url_hash (PK) · url · last_crawled · next_due · priority · etag", "content: content_hash (PK) · s3_path · simhash · fetched_at", "hosts: host (PK) · robots_rules · crawl_delay · last_access"],
      choices: [
        { c: "URL frontier", pick: "Two-tier queues: priority front queues → per-host back queues (Kafka / custom)", why: "Front queues order by importance (PageRank, freshness); back queues guarantee one host per queue, so each host is hit by one worker with a delay." },
        { c: "URL dedup", pick: "Bloom filter + persistent URL store (RocksDB / Bigtable)", why: "Checking billions of URLs in memory is fast. A Bloom filter has no false negatives, and a rare false positive just skips a page." },
        { c: "Content dedup", pick: "Fingerprints (SHA-256 for exact, SimHash for near-duplicates)", why: "About 30% of the web is duplicate. Skip storing and parsing mirrors." },
        { c: "Content storage", pick: "Object storage (S3 / HDFS) in WARC files", why: "Huge, immutable, append-only blobs. Cheap and durable. Metadata goes in Bigtable/Cassandra." },
        { c: "DNS", pick: "Local DNS cache / resolver", why: "DNS lookups (10–200 ms) are a major bottleneck. Cache aggressively." }
      ],
      diagram: {
        nodes: [
          n("seed", "Seed URLs", "curated list", "db", 80, 280, "Starting points: popular sites, sitemaps, previously known domains."),
          n("frontier", "URL Frontier", "priority + politeness", "queue", 260, 280, "Prioritised queues, partitioned by host so each host is crawled politely."),
          n("dns", "DNS Resolver", "cached", "cache", 260, 110, "A local caching resolver avoids slow external lookups."),
          n("fetcher", "Fetchers", "HTML downloaders", "worker", 450, 170, "Thousands of async workers. Obey robots.txt, time out slow hosts, cap page size."),
          n("web", "The Web", "billions of hosts", "external", 670, 60, "The outside world: slow, flaky, sometimes hostile (spider traps)."),
          n("parser", "Parser", "extract links", "worker", 670, 200, "Parses HTML, normalises URLs, extracts text and outgoing links."),
          n("dedup", "Content Seen?", "SimHash", "cache", 880, 330, "Fingerprint of the content. Near-duplicates are skipped."),
          n("content", "Content Store", "S3 · WARC", "storage", 880, 200, "Raw pages for the indexer and ML pipelines."),
          n("filter", "URL Filter", "robots, normalise", "service", 670, 390, "Drops disallowed, blacklisted or trap URLs (infinite calendars, session IDs)."),
          n("seen", "URL Seen?", "Bloom filter", "cache", 450, 440, "Has this URL been crawled or queued already? Fast probabilistic membership test.")
        ],
        edges: [["seed", "frontier"], ["frontier", "fetcher"], ["fetcher", "dns"], ["fetcher", "web"], ["fetcher", "parser"], ["parser", "dedup"], ["dedup", "content"], ["parser", "filter"], ["filter", "seen"], ["seen", "frontier"]],
        flows: [
          { name: "Crawl loop", steps: [
            ["seed", "frontier", "Enqueue seed URLs with a priority score"],
            ["frontier", "fetcher", "Dequeue from a per-host queue (one host per worker, honouring the crawl delay)"],
            ["fetcher", "dns", "Resolve the host (cached)"],
            ["fetcher", "web", "GET page (If-Modified-Since / ETag for re-crawls)"],
            ["fetcher", "parser", "Raw HTML"],
            ["parser", "dedup", "SimHash the content. Duplicate? Skip."],
            ["dedup", "content", "Store new content in S3 (WARC)"],
            ["parser", "filter", "Extracted links → normalise, check robots.txt"],
            ["filter", "seen", "Bloom filter: already seen?"],
            ["seen", "frontier", "New URLs go back into the frontier"]
          ]}
        ]
      },
      deepDives: [
        { t: "Politeness and priority (Mercator frontier)", b: ["Front queues: a prioritiser assigns URLs to F priority queues", "Back queues: each maps to exactly one host, with a heap of next-allowed-fetch times", "A worker picks the back queue whose host is ready, fetches, then reschedules the host after its delay"] },
        { t: "Freshness", p: "Re-crawl frequency adapts to observed change rate: news homepages every few minutes, static docs monthly. Use conditional GETs (ETag, Last-Modified) and sitemaps' lastmod." },
        { t: "Spider traps and robustness", b: ["Cap URL length and path depth", "Cap pages per domain per crawl", "Detect repetitive path patterns (/a/b/a/b/…)", "Timeouts and max response size", "Isolate parsing in sandboxes"] },
        { t: "Distributing the crawl", p: "Partition URLs by hash(host) so a host's queue and politeness state live on a single crawler node. This avoids cross-node coordination for politeness." }
      ],
      pitfalls: ["Ignoring robots.txt or hammering one host (you get blocked)", "Uncached DNS becomes the bottleneck", "No dedup means crawling the same content through infinite URL variants", "Storing everything in a relational DB instead of blob storage"],
      tradeoffs: [["BFS (breadth, discovery)", "Priority (important pages first)"], ["Freshness (re-crawl often)", "Coverage (crawl new pages)"], ["Bloom filter (memory-cheap, FP)", "Exact set (big, exact)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "notification",
      title: "Notification System",
      aka: "Push · SMS · Email",
      category: "Messaging",
      level: "Medium",
      icon: "bell",
      summary: "Send millions of push, SMS and email notifications reliably, respecting user preferences.",
      tags: ["queue", "fan-out", "retry", "idempotency", "APNs", "FCM", "templates", "DLQ"],
      functional: ["Send push (iOS/Android), SMS and email", "Triggered by services (events) or scheduled campaigns", "Respect opt-outs, quiet hours and frequency caps", "Templates and localisation", "Track delivery, open and click status"],
      nonFunctional: ["At-least-once delivery with deduplication", "Soft real-time (seconds) for transactional, minutes are fine for marketing", "Scales to 10 M+ notifications/day with spikes", "Decoupled: one slow provider must not block the others"],
      estimates: [["Push", "10 M/day"], ["SMS", "1 M/day"], ["Email", "5 M/day"], ["Peak", "campaign blast → 50 K/s for a few minutes"]],
      api: ["POST /v1/notify {userIds|segment, channel[], templateId, params, priority, idempotencyKey}", "PUT /v1/users/{id}/preferences", "GET /v1/notifications/{id}/status"],
      dataModel: ["devices: user_id · device_token · platform · last_seen", "preferences: user_id · channel · category · opted_in · quiet_hours", "notification_log: id · user_id · channel · status · attempts · provider_msg_id"],
      choices: [
        { c: "Decoupling", pick: "Per-channel message queues (Kafka / SQS)", why: "Buffers spikes and isolates channels: an SMS provider outage doesn't block push. Workers scale independently." },
        { c: "Preferences / devices", pick: "Relational or KV store + Redis cache", why: "Looked up for every notification, so cache heavily. Relational DB for ownership and consistency of settings." },
        { c: "Delivery log", pick: "Wide-column (Cassandra) or DynamoDB", why: "Very high write volume, append-mostly, queried by user and time." },
        { c: "Reliability", pick: "Retries with exponential backoff + DLQ + idempotency keys", why: "Third-party providers fail often. Dedup keys prevent double-sending on retries." },
        { c: "Providers", pick: "APNs, FCM, Twilio / SNS, SES / SendGrid", why: "Never build carrier or mail infrastructure yourself. Keep a fallback provider per channel." }
      ],
      diagram: {
        nodes: [
          n("svc", "Trigger Services", "billing, social…", "service", 80, 170, "Other services emit events like OrderShipped or NewFollower."),
          n("cron", "Campaign Scheduler", "marketing, reminders", "worker", 80, 380, "Scheduled or segment-based sends.", "clock"),
          n("notif", "Notification Svc", "validate · dedupe", "service", 280, 270, "Validates, dedupes by idempotency key, applies preferences, rate limits and renders templates."),
          n("cache", "Prefs Cache", "Redis", "cache", 460, 80, "User preferences, device tokens, templates and frequency-cap counters."),
          n("prefs", "Prefs & Devices", "Postgres", "db", 460, 460, "Source of truth for opt-ins and device tokens."),
          n("qp", "Push Queue", "Kafka / SQS", "queue", 590, 180, "Push notifications buffered separately."),
          n("qs", "SMS Queue", "Kafka / SQS", "queue", 590, 280, "SMS buffered separately (expensive, strict rate limits)."),
          n("qe", "Email Queue", "Kafka / SQS", "queue", 590, 380, "Email buffered separately (bulk-friendly)."),
          n("wp", "Push Workers", "retry + backoff", "worker", 760, 180, "Pull, send, retry on 5xx, delete invalid tokens."),
          n("ws", "SMS Workers", "retry + backoff", "worker", 760, 280, "Respect provider throughput limits."),
          n("we", "Email Workers", "retry + backoff", "worker", 760, 380, "Batch sends, handle bounces."),
          n("apns", "APNs / FCM", "", "external", 920, 180, "Apple / Google push gateways."),
          n("twilio", "Twilio / SNS", "", "external", 920, 280, "SMS aggregators."),
          n("ses", "SES / SendGrid", "", "external", 920, 380, "Email delivery providers."),
          n("log", "Delivery Log", "Cassandra", "db", 760, 480, "Every attempt and status. Used for analytics, dedup and support.")
        ],
        edges: [["svc", "notif"], ["cron", "notif"], ["notif", "cache"], ["notif", "prefs"], ["notif", "qp"], ["notif", "qs"], ["notif", "qe"], ["qp", "wp"], ["qs", "ws"], ["qe", "we"], ["wp", "apns"], ["ws", "twilio"], ["we", "ses"], ["we", "log"]],
        flows: [
          { name: "Transactional push", steps: [
            ["svc", "notif", "OrderShipped{userId:7, idempotencyKey:'ship-991'}"],
            ["notif", "cache", "Seen 'ship-991'? No. Load prefs + devices; check frequency cap"],
            ["notif", "qp", "Render template (locale) → enqueue push job"],
            ["qp", "wp", "Worker pulls a batch"],
            ["wp", "apns", "Send to the device token. 410 Gone? Delete the token"],
            ["wp", "qp", "Transient failure: re-enqueue with exponential backoff (after N tries → DLQ)"]
          ]},
          { name: "Marketing email blast", steps: [
            ["cron", "notif", "Campaign: segment 'inactive_30d' (2 M users)"],
            ["notif", "prefs", "Filter out users who opted out of marketing"],
            ["notif", "qe", "Enqueue in chunks, spreading load over minutes"],
            ["qe", "we", "Workers send in batches (1000 recipients/API call)"],
            ["we", "ses", "Provider accepts; bounces come back via webhook"],
            ["we", "log", "Record status for analytics and suppression lists"]
          ]}
        ]
      },
      deepDives: [
        { t: "Exactly-once? No: at-least-once + dedup", p: "Queues and retries give at-least-once delivery. Make sending idempotent: keep a dedup store (Redis SETNX with TTL) keyed on the idempotency key per user and channel, checked before sending." },
        { t: "Priority", p: "Use separate queues or topics for OTP / security alerts (high) and marketing (low) so a 5 M-user campaign can't delay a login code." },
        { t: "User experience controls", b: ["Frequency caps (max N marketing pushes/day)", "Quiet hours in the user's time zone", "Collapse keys (replace 'you have 3 messages' with 'you have 4')", "Aggregation / digest emails"] },
        { t: "Tracking", p: "Opens and clicks come back via tracking pixels, redirect links and provider webhooks. Write them to the delivery log and to an analytics pipeline." }
      ],
      pitfalls: ["One shared queue: a slow channel blocks all channels", "Retrying without idempotency sends duplicate SMS (costly, annoying)", "Stale device tokens: handle provider feedback and prune", "Blasting campaigns at once hits provider rate limits"],
      tradeoffs: [["Push-based fan-out (fast)", "Batching (cheaper, delayed)"], ["At-least-once (+dedup)", "At-most-once (may drop)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "news-feed",
      title: "News Feed / Timeline",
      aka: "Twitter · Facebook · Instagram",
      category: "Social",
      level: "Hard",
      icon: "feed",
      summary: "Show each user a ranked feed of posts from people they follow, at massive read volume.",
      tags: ["fan-out on write", "fan-out on read", "hybrid", "celebrity problem", "redis", "timeline cache", "ranking"],
      functional: ["Publish posts (text, images, video)", "View a home feed of followed users' posts, ranked or chronological", "Follow / unfollow", "Like, comment and share"],
      nonFunctional: ["Feed load p99 under 200 ms", "Read-heavy (reads ≫ writes)", "Eventual consistency is fine: a post can take a few seconds to appear", "Highly available"],
      estimates: [["DAU", "300 M"], ["Feed reads", "300 M × 10/day = 3 B/day → ~35 K/s (peak ~100 K/s)"], ["Posts", "300 M × 0.5/day = 150 M/day → ~1.7 K/s"], ["Fan-out", "avg 200 followers → 350 K timeline inserts/s"], ["Timeline cache", "300 M users × 800 ids × 8 B ≈ 2 TB of Redis"]],
      api: ["POST /v1/posts {text, mediaIds[]}", "GET /v1/feed?cursor=…&limit=20", "POST /v1/users/{id}/follow"],
      dataModel: ["posts: post_id (Snowflake) · author_id · text · media_urls · created_at (sharded by post_id or author_id)", "follows: follower_id · followee_id (both directions indexed; graph store)", "timeline cache: feed:{userId} → list of post_ids (Redis)"],
      choices: [
        { c: "Feed generation", pick: "Hybrid fan-out", why: "Fan-out on write (push) for normal users makes reads a single cache read. Celebrities (millions of followers) use fan-out on read (pull), merged at read time.", alt: "Pure pull: simple writes but slow, expensive reads. Pure push: the celebrity problem, where one post means 100 M writes." },
        { c: "Post storage", pick: "Sharded MySQL (by post_id) or Cassandra", why: "Huge volume, simple access by id. Snowflake IDs give time ordering without a global counter." },
        { c: "Timeline cache", pick: "Redis lists / sorted sets per user", why: "Precomputed feed of post IDs, capped at ~800 entries. O(1) fetch of the top N." },
        { c: "Social graph", pick: "Sharded KV / graph store (TAO-like)", why: "Follower lists are read on every fan-out. Store adjacency lists keyed by user." },
        { c: "Media", pick: "Object storage + CDN", why: "Images and video are served from the edge. The app only stores URLs." },
        { c: "Ranking", pick: "Candidate generation → ML ranking service", why: "Chronological is easy; engagement-ranked feeds score candidates with features (affinity, recency, type)." }
      ],
      diagram: {
        nodes: [
          n("client", "Client", "mobile / web", "client", 80, 260, "Users posting and scrolling."),
          n("cdn", "CDN", "images / video", "edge", 80, 440, "Media is uploaded via presigned URLs and served from the edge.", "cdn"),
          n("obj", "Object Store", "S3", "storage", 250, 440, "Origin for all media."),
          n("lb", "API Gateway", "auth, routing", "edge", 250, 260, "Auth, rate limiting and routing to services.", "gateway"),
          n("post", "Post Service", "write path", "service", 430, 120, "Validates and stores posts, emits PostCreated."),
          n("feed", "Feed Service", "read path", "service", 430, 400, "Builds the feed: reads precomputed IDs, merges celebrity posts, hydrates and ranks."),
          n("postdb", "Post Store", "Cassandra / MySQL", "db", 620, 40, "Durable posts, sharded by post_id."),
          n("q", "Fan-out Queue", "Kafka", "queue", 620, 170, "Decouples posting from the expensive fan-out."),
          n("graph", "Social Graph", "follower lists", "db", 830, 40, "Who follows whom. Sharded adjacency lists."),
          n("fan", "Fan-out Workers", "push to timelines", "worker", 830, 170, "For each follower (except for celebrity authors) push the post id into their timeline."),
          n("tl", "Timeline Cache", "Redis", "cache", 830, 330, "feed:{userId} → [postIds]. Capped, precomputed."),
          n("pc", "Post Cache", "Redis / Memcached", "cache", 620, 470, "Hydrates post ids into full objects with a multi-get.")
        ],
        edges: [["client", "lb"], ["client", "cdn"], ["cdn", "obj"], ["lb", "post"], ["lb", "feed"], ["post", "postdb"], ["post", "q"], ["q", "fan"], ["fan", "graph"], ["fan", "tl"], ["feed", "tl"], ["feed", "pc"]],
        flows: [
          { name: "Publish (fan-out on write)", steps: [
            ["client", "cdn", "Upload photo via a presigned URL → stored in S3"],
            ["client", "lb", "POST /posts {text, mediaId}"],
            ["lb", "post", "Authenticated request"],
            ["post", "postdb", "Persist the post (Snowflake id)"],
            ["post", "q", "Emit PostCreated(authorId, postId)"],
            ["q", "fan", "Worker consumes the event"],
            ["fan", "graph", "Fetch follower ids (paged). Author is a celebrity? Stop, it will be pulled."],
            ["fan", "tl", "LPUSH postId to each follower's feed and LTRIM to 800 (only active users)"]
          ]},
          { name: "Read home feed", steps: [
            ["client", "lb", "GET /feed?limit=20"],
            ["lb", "feed", "Feed request"],
            ["feed", "tl", "LRANGE feed:{me} 0 50 → precomputed post ids"],
            ["feed", "pc", "Multi-get post objects + recent posts from followed celebrities (pull)"],
            ["feed", "client", "Merge, rank, paginate with a cursor → 20 posts, media URLs → CDN"]
          ]}
        ]
      },
      deepDives: [
        { t: "Push vs pull vs hybrid", b: ["Push (fan-out on write): fast reads, but slow and expensive writes for high-follower accounts; work is wasted on inactive users", "Pull (fan-out on read): cheap writes, but reads must query N followees and merge (slow)", "Hybrid: push for most users, pull for celebrities (for example, over 100 K followers), and skip pushing to users inactive for 30+ days"] },
        { t: "Pagination", p: "Use cursor-based pagination (last seen post_id / timestamp), not OFFSET. The feed changes while the user scrolls, so offsets cause duplicates or skipped posts." },
        { t: "Cache sizing", p: "Keep timelines only for active users and cap the length. Rebuild on demand for users returning after a long gap (pull from followees, then cache)." },
        { t: "Ranking pipeline", b: ["Candidate generation: followees, groups, recommendations", "Feature fetch: affinity, recency, engagement, content type", "Scoring model (a GBDT or neural ranker)", "Diversity rules and business constraints", "Log impressions for training"] }
      ],
      pitfalls: ["Pure fan-out on write: the Justin Bieber problem (tens of millions of writes per post)", "OFFSET pagination on a changing feed", "Synchronous fan-out in the post request (slow posting)", "Forgetting deletes and privacy changes must propagate to caches"],
      tradeoffs: [["Fan-out on write (fast reads)", "Fan-out on read (cheap writes)"], ["Chronological (simple, transparent)", "Ranked (engagement, complex)"], ["Strong consistency", "Eventual (seconds of delay fine)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "chat",
      title: "Chat / Messaging",
      aka: "WhatsApp · Messenger · Slack",
      category: "Real-time",
      level: "Hard",
      icon: "chat",
      summary: "Deliver 1:1 and group messages in real time, with ordering, receipts, presence and offline sync.",
      tags: ["websocket", "presence", "pub/sub", "cassandra", "message ordering", "delivery receipts", "E2E encryption"],
      functional: ["1:1 and group chats (up to ~500 members)", "Online presence and last seen", "Sent / delivered / read receipts", "Offline delivery + push notifications", "Media sharing and message history on all devices"],
      nonFunctional: ["Real-time: under 200 ms delivery between online users", "Messages are never lost; order is preserved within a conversation", "Highly available, with global users", "Huge write volume"],
      estimates: [["DAU", "500 M"], ["Messages", "500 M × 40/day = 20 B/day → ~230 K msg/s"], ["Storage", "20 B × 100 B ≈ 2 TB/day → 730 TB/year"], ["Concurrent connections", "~200 M WebSockets → ~2000 servers at 100 K conns each"]],
      api: ["WS connect: wss://chat/…  (auth token)", "→ send {convId, clientMsgId, body}", "← message {convId, msgId, seq, from, body}", "→ ack {msgId, status: delivered|read}", "GET /v1/conversations/{id}/messages?before=seq (history sync)"],
      dataModel: ["messages: (conversation_id, seq) PK · sender_id · body · created_at  [Cassandra partition = conversation]", "conversations: id · type · members · last_seq", "user_conversations: user_id · conversation_id · last_read_seq (inbox)", "sessions (Redis): user_id → gateway server id"],
      choices: [
        { c: "Transport", pick: "WebSockets (persistent, bi-directional)", why: "Server push without polling overhead. Mobile falls back to push notifications when the app is backgrounded.", alt: "Long polling (legacy fallback), MQTT (WhatsApp historically used an XMPP variant)." },
        { c: "Message store", pick: "Wide-column: Cassandra / HBase / ScyllaDB", why: "Enormous write throughput, time-ordered data per conversation (partition key conversation_id, clustering key seq), linear scaling. Discord and Messenger use this pattern." },
        { c: "Routing", pick: "Session registry (Redis) + pub/sub between chat servers", why: "Find which server holds the recipient's connection and forward there. Redis Pub/Sub, Kafka or direct RPC." },
        { c: "Ordering", pick: "Per-conversation sequence numbers", why: "Global clocks are unreliable. A per-conversation counter (or Snowflake id) gives total order within a chat." },
        { c: "Presence", pick: "Redis with TTL heartbeats", why: "Ephemeral, high churn. Heartbeat every ~30 s and expire. Fan out presence only to active contacts." }
      ],
      diagram: {
        nodes: [
          n("a", "User A", "sender", "client", 80, 120, "Keeps a WebSocket to one chat server."),
          n("b", "User B", "recipient", "client", 80, 420, "Connected to a different chat server."),
          n("lb", "L4 LB", "sticky WS", "edge", 250, 270, "Balances new WebSocket connections. Long-lived connections stay on one server.", "lb"),
          n("s1", "Chat Server 1", "WebSocket", "service", 430, 120, "Stateful connection holder for ~100 K users."),
          n("s2", "Chat Server 2", "WebSocket", "service", 430, 420, "Holds User B's connection."),
          n("sess", "Session Registry", "Redis", "cache", 430, 270, "user → server mapping, refreshed on connect and heartbeat."),
          n("bus", "Message Bus", "Kafka / Redis Pub/Sub", "queue", 640, 270, "Routes messages between chat servers and to persistence and push."),
          n("persist", "Persistence", "workers", "worker", 640, 100, "Writes messages to storage in order."),
          n("store", "Message Store", "Cassandra", "db", 860, 100, "Partition per conversation, clustered by sequence number."),
          n("push", "Push Gateway", "APNs / FCM", "external", 860, 270, "Wakes offline or backgrounded devices."),
          n("pres", "Presence", "Redis TTL", "cache", 640, 440, "Online / last-seen with heartbeat TTLs.")
        ],
        edges: [["a", "lb"], ["b", "lb"], ["lb", "s1"], ["lb", "s2"], ["s1", "sess"], ["s2", "sess"], ["s1", "bus"], ["bus", "s2"], ["bus", "persist"], ["persist", "store"], ["bus", "push"], ["s2", "pres"]],
        flows: [
          { name: "Send to an online user", steps: [
            ["a", "s1", "WS frame {to: B, clientMsgId: c-81, text: 'hi'} (already connected)"],
            ["s1", "sess", "Where is B? → Chat Server 2"],
            ["s1", "bus", "Publish to server-2's channel + persistence topic"],
            ["bus", "persist", "Assign seq (per conversation), persist"],
            ["persist", "store", "INSERT (conv_id, seq) …"],
            ["s1", "a", "ACK: sent ✓ (server has it)"],
            ["bus", "s2", "Deliver to B's server"],
            ["s2", "b", "Push over WebSocket"],
            ["b", "s2", "delivered ✓✓ → routed back to A the same way"]
          ]},
          { name: "Recipient offline", steps: [
            ["a", "s1", "Message for B"],
            ["s1", "sess", "B has no active session"],
            ["s1", "bus", "Publish (persisted as usual)"],
            ["bus", "push", "Send a push notification (no content if E2E encrypted)"],
            ["b", "lb", "B opens the app → reconnects"],
            ["s2", "store", "Sync: fetch messages with seq > last_seen_seq for each conversation"]
          ]}
        ]
      },
      deepDives: [
        { t: "Group chat fan-out", p: "Small groups (under a few hundred members): fan out on write, delivering a copy to each member's server and inbox. Very large channels (Slack/Discord style): store once per channel and have clients pull or subscribe to the channel stream." },
        { t: "Delivery guarantees", b: ["The client generates clientMsgId, so the server dedupes retries (idempotency)", "The server acks only after a durable write", "The recipient acks delivered and read, which updates last_read_seq", "On reconnect, the client syncs from its last seq in each conversation"] },
        { t: "Multi-device", p: "Each device has its own connection and cursor. Messages fan out to all of a user's devices. With E2E encryption (the Signal protocol), messages are encrypted per device key." },
        { t: "Presence at scale", p: "Don't broadcast every status change to everyone. Send presence only to users who currently have the chat open, and batch or debounce flapping connections." }
      ],
      pitfalls: ["Using HTTP polling for real-time chat", "Relying on client timestamps for ordering", "Storing messages in one big relational table with no partitioning", "Broadcasting presence to all contacts on every change"],
      tradeoffs: [["WebSocket (real-time, stateful)", "Long polling (simple, wasteful)"], ["Fan-out on write (small groups)", "Fan-out on read (huge channels)"], ["Server-side history (multi-device)", "Device-only storage (privacy, WhatsApp style)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "autocomplete",
      title: "Search Autocomplete",
      aka: "Typeahead · Google Suggest",
      category: "Search",
      level: "Medium",
      icon: "search",
      summary: "Return the top-k query completions for a prefix in under 100 ms as the user types.",
      tags: ["trie", "top-k", "prefix", "cache", "sampling", "spark", "debounce"],
      functional: ["Return the top 5–10 suggestions for a typed prefix", "Rank by popularity (and freshness, personalisation)", "Filter offensive or blocked terms"],
      nonFunctional: ["p99 under 100 ms end-to-end (fired on every keystroke)", "Very high QPS", "Eventually consistent: the trie can be minutes or hours stale"],
      estimates: [["DAU", "100 M × 10 searches × ~6 keystrokes → 6 B req/day ≈ 70 K QPS (peak 150 K)"], ["Unique queries", "~1 B, but the top ~100 M cover most traffic"], ["Trie size", "~100 M phrases × ~30 B + top-k lists → tens of GB (sharded)"]],
      api: ["GET /v1/suggest?q=sys&limit=5&lang=en → ['system design', …]", "Cache-Control: public, max-age=3600 (short prefixes are highly cacheable)"],
      dataModel: ["query_counts: query · count · window (aggregated from logs)", "Trie node: children map + precomputed top-k [(query, score)]", "Serialized trie snapshots in blob storage / KV (prefix → top-k)"],
      choices: [
        { c: "Core data structure", pick: "Trie with precomputed top-k at every node", why: "Lookup is O(prefix length), with no traversal of the subtree at query time. The trade-off is memory for speed." },
        { c: "Serving store", pick: "In-memory trie per shard, or a Redis/KV map prefix → top-k", why: "Everything must be in RAM for latency. Shard by prefix range (a–f, g–m…) or hash, with replicas for QPS." },
        { c: "Data collection", pick: "Query logs → Kafka → Spark / Flink aggregation", why: "Don't update the trie per query. Aggregate counts in batches (hourly/daily), build a new trie offline and swap it in." },
        { c: "Caching", pick: "Browser cache + CDN for short prefixes", why: "One- and two-letter prefixes are identical for everyone and highly cacheable." },
        { c: "Alternative", pick: "Elasticsearch completion suggester", why: "Great for moderate scale or product catalogues (supports fuzzy matching), with no custom trie to build." }
      ],
      diagram: {
        nodes: [
          n("client", "Client", "debounced input", "client", 80, 200, "Sends requests after a ~100 ms debounce and caches responses locally."),
          n("lb", "Gateway / CDN", "cached prefixes", "edge", 260, 200, "Short prefixes are served from cache.", "cdn"),
          n("sugg", "Suggest Svc", "stateless", "service", 450, 200, "Routes the prefix to the right trie shard and applies filters and personalisation."),
          n("tc", "Trie Cache", "in-memory shards", "cache", 660, 110, "Prefix → precomputed top-k. Replicated for QPS."),
          n("td", "Trie Store", "snapshots", "db", 870, 110, "Versioned serialized tries (S3 / KV) used to load servers."),
          n("kafka", "Query Log", "Kafka", "queue", 450, 410, "Every submitted search (sampled) is logged."),
          n("agg", "Aggregator", "Spark / Flink", "worker", 660, 410, "Counts query frequency per window, with decay for freshness.", "analytics"),
          n("build", "Trie Builder", "offline", "worker", 870, 410, "Builds the trie with top-k per node and publishes a new version.")
        ],
        edges: [["client", "lb"], ["lb", "sugg"], ["sugg", "tc"], ["td", "tc", "load"], ["sugg", "kafka"], ["kafka", "agg"], ["agg", "build"], ["build", "td"]],
        flows: [
          { name: "Typing 'sys'", steps: [
            ["client", "lb", "GET /suggest?q=sys (after a 100 ms debounce)"],
            ["lb", "sugg", "CDN miss (3-letter prefix)"],
            ["sugg", "tc", "Route to the shard for 's…' → node 's'→'y'→'s' → top-5 already stored"],
            ["sugg", "client", "['system design', 'systemd', 'sysco', …] + Cache-Control"]
          ]},
          { name: "Rebuilding the trie", steps: [
            ["sugg", "kafka", "Log submitted queries (sampled 1 in N)"],
            ["kafka", "agg", "Aggregate counts per query with time decay"],
            ["agg", "build", "(query, score) table"],
            ["build", "td", "Build the trie, compute top-k per node, store version v42"],
            ["td", "tc", "Servers load v42 and hot-swap it"]
          ]}
        ]
      },
      deepDives: [
        { t: "Why store top-k at each node?", p: "Without it, answering 'a' means traversing millions of descendants. Precomputing top-k (say k=10) at every node makes queries O(|prefix|). The cost is extra memory and a rebuild on updates." },
        { t: "Freshness (trending queries)", p: "Batch rebuilds are hours stale. For trending topics, run a small real-time layer (streaming counts over a 1-hour window) and blend it with the batch trie at query time." },
        { t: "Sharding", b: ["By first letters: simple, but uneven (many words start with 's')", "By hash(prefix): even, but every prefix length must be stored separately", "Use a shard map built from historical distribution"] },
        { t: "Client optimisations", b: ["Debounce keystrokes", "Cache prefix results in the browser; filter the 'sys' results locally for 'syst'", "Prefetch on focus"] }
      ],
      pitfalls: ["Updating the trie synchronously on every search", "Traversing subtrees at query time", "No filtering for offensive or legally sensitive suggestions", "Calling the server on every keystroke without debounce"],
      tradeoffs: [["Freshness (streaming)", "Simplicity (batch rebuild)"], ["Memory (top-k per node)", "Latency (compute on the fly)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "video-streaming",
      title: "Video Streaming",
      aka: "YouTube · Netflix",
      category: "Media",
      level: "Hard",
      icon: "play",
      summary: "Upload, transcode and stream video globally with adaptive bitrate and minimal buffering.",
      tags: ["CDN", "transcoding", "HLS", "DASH", "adaptive bitrate", "object storage", "DAG", "presigned URL"],
      functional: ["Upload videos (up to several GB)", "Transcode to multiple resolutions and codecs", "Stream smoothly on any device and bandwidth", "Metadata, search, likes, comments, view counts"],
      nonFunctional: ["Smooth playback: fast start (under 2 s), minimal rebuffering", "Massive egress bandwidth, served globally", "Uploads can be processed asynchronously (minutes are OK)", "Cost-efficient storage and CDN"],
      estimates: [["Uploads", "500 hours of video/minute (YouTube scale)"], ["Views", "1 B hours watched/day"], ["Storage", "1 min of 1080p ≈ 50–100 MB; × ~5 renditions"], ["Egress", "5 Mbps × 10 M concurrent = 50 Tbps → must be served by CDN / ISP caches"]],
      api: ["POST /v1/videos → {videoId, uploadUrl (presigned, multipart)}", "PUT <uploadUrl> (chunks, resumable)", "GET /v1/videos/{id} → {title, manifestUrl, thumbnails}", "GET <cdn>/{id}/master.m3u8 → renditions → segments"],
      dataModel: ["videos: id · owner · title · status (UPLOADING→PROCESSING→READY) · duration · renditions (MySQL/Vitess)", "view_counts: sharded counters / stream aggregation", "Blobs: raw/{id}, encoded/{id}/{rendition}/seg_0001.ts"],
      choices: [
        { c: "Video storage", pick: "Object storage (S3 / GCS)", why: "Unlimited, cheap, 11-nines durable. Move cold videos to infrequent-access tiers." },
        { c: "Delivery", pick: "CDN (plus ISP-embedded caches like Netflix Open Connect)", why: "Egress is the dominant cost and bottleneck. Serve from the edge, closest to users. Pre-position popular content off-peak." },
        { c: "Streaming protocol", pick: "HLS / MPEG-DASH with adaptive bitrate", why: "Video is split into 2–6 s segments at multiple bitrates. The player switches renditions based on measured bandwidth." },
        { c: "Transcoding", pick: "Async DAG pipeline on a queue + worker fleet", why: "Split into chunks (GOPs), encode in parallel, merge. CPU/GPU heavy, so scale workers independently. Retries per chunk." },
        { c: "Metadata", pick: "Sharded MySQL (Vitess) + cache; Elasticsearch for search", why: "YouTube famously scaled MySQL with Vitess. Relational data (users, channels, playlists) with heavy caching." },
        { c: "Upload", pick: "Presigned URLs, multipart and resumable", why: "Large files go straight to storage without passing through app servers. Resume from the failed chunk." }
      ],
      diagram: {
        nodes: [
          n("creator", "Creator", "uploader", "client", 80, 90, "Uploads large raw video files."),
          n("up", "Upload Svc", "presigned URLs", "service", 270, 90, "Creates the video record and returns a multipart presigned URL."),
          n("raw", "Raw Storage", "S3", "storage", 470, 90, "Original uploads."),
          n("tq", "Transcode Queue", "SQS / Kafka", "queue", 670, 90, "Transcoding jobs (a DAG of tasks)."),
          n("tx", "Transcoders", "GPU/CPU fleet", "worker", 870, 90, "Split → encode (H.264/VP9/AV1 × 240p–4K) → package HLS/DASH → thumbnails."),
          n("enc", "Encoded Storage", "S3 segments", "storage", 870, 300, "Renditions as small segments + manifests."),
          n("cdn", "CDN", "edge caches", "edge", 660, 440, "Serves segments close to viewers. The origin shield protects S3.", "cdn"),
          n("viewer", "Viewer", "ABR player", "client", 80, 380, "The adaptive player measures bandwidth and picks the rendition per segment."),
          n("api", "Video API", "metadata", "service", 270, 300, "Video pages, recommendations, the manifest URL."),
          n("cache", "Metadata Cache", "Redis", "cache", 470, 200, "Hot video metadata."),
          n("meta", "Metadata DB", "MySQL / Vitess", "db", 470, 310, "Videos, channels, users, status.")
        ],
        edges: [["creator", "up"], ["up", "raw"], ["raw", "tq"], ["tq", "tx"], ["tx", "enc"], ["enc", "cdn"], ["viewer", "api"], ["api", "cache"], ["api", "meta"], ["viewer", "cdn"], ["up", "meta"]],
        flows: [
          { name: "Upload & transcode", steps: [
            ["creator", "up", "POST /videos → videoId + presigned multipart URL"],
            ["up", "meta", "Insert the video with status=UPLOADING"],
            ["up", "raw", "Client uploads chunks directly to S3 (resumable)"],
            ["raw", "tq", "S3 ObjectCreated event → transcode job"],
            ["tq", "tx", "Split into chunks, encode each rendition in parallel, package HLS"],
            ["tx", "enc", "Write segments + master.m3u8, thumbnails"],
            ["tx", "tq", "Job complete → status=READY, notify the creator"]
          ]},
          { name: "Watch", steps: [
            ["viewer", "api", "GET /videos/abc → title, manifest URL"],
            ["api", "cache", "Metadata cache hit"],
            ["viewer", "cdn", "GET master.m3u8 → pick 720p for the current bandwidth"],
            ["cdn", "enc", "Edge miss → origin shield → S3 (then cached)"],
            ["viewer", "cdn", "Fetch segments; bandwidth drops → switch to 480p seamlessly"]
          ]}
        ]
      },
      deepDives: [
        { t: "Adaptive bitrate streaming", p: "The master manifest lists renditions (e.g. 240p @ 400 kbps … 4K @ 16 Mbps). Each rendition is cut into segments of a few seconds. The player keeps a buffer and switches rendition at segment boundaries based on throughput and buffer health." },
        { t: "Transcoding DAG", b: ["Inspect → split by GOP → encode chunks in parallel → merge", "Separate audio, captions and thumbnail tasks", "Per-title encoding (Netflix): pick bitrate ladders per content complexity", "Checkpoint per chunk, so a failure retries only that chunk"] },
        { t: "Cost optimisation", b: ["Only encode popular videos in expensive codecs (AV1)", "Long-tail content served from fewer locations", "Storage lifecycle: hot → infrequent access → archive"] },
        { t: "View counting", p: "Don't UPDATE a row per view. Stream view events into Kafka, aggregate in windows, and write periodically. Deduplicate and filter bots." }
      ],
      pitfalls: ["Streaming video through app servers", "Synchronous transcoding in the upload request", "A single bitrate means buffering on slow networks", "Counting views with row updates (lock contention)"],
      tradeoffs: [["Pre-encode all renditions (fast start)", "Encode on demand (cheaper storage)"], ["Longer segments (efficient)", "Shorter segments (faster adaptation, lower latency)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "file-sync",
      title: "File Storage & Sync",
      aka: "Dropbox · Google Drive",
      category: "Storage",
      level: "Hard",
      icon: "folder",
      summary: "Store files in the cloud and keep them in sync across devices, efficiently and without conflicts.",
      tags: ["chunking", "deduplication", "delta sync", "metadata", "long polling", "versioning", "conflict resolution"],
      functional: ["Upload, download and delete files and folders", "Automatic sync across devices", "File versioning / history", "Sharing with permissions", "Offline edits, synced later"],
      nonFunctional: ["Strong consistency for metadata (no lost updates)", "Durability: never lose a file (11 nines)", "Bandwidth efficient: only send changed chunks", "Scales to billions of files"],
      estimates: [["Users", "500 M total, 100 M DAU"], ["Files", "avg 200 files × 100 KB (median) → ~10 PB+"], ["Sync events", "100 M × ~10 changes/day → ~12 K metadata writes/s"], ["Chunk size", "4 MB blocks, content-addressed by SHA-256"]],
      api: ["POST /v1/files/commit {path, parentRev, blockHashes[]} → {missingBlocks[]} or {newRev}", "PUT /v1/blocks/{sha256} (upload chunk)", "GET /v1/blocks/{sha256}", "GET /v1/changes?cursor=… (long poll)"],
      dataModel: ["files: file_id · namespace_id · path · latest_rev · is_dir", "file_versions: file_id · rev · block_list [h1,h2,…] · size · modified_by", "blocks: sha256 (PK) · s3_key · ref_count", "journal: namespace_id · cursor(seq) · change  (drives sync)"],
      choices: [
        { c: "File content", pick: "Object storage, content-addressed chunks", why: "Chunks are keyed by hash → automatic dedup across users and versions. Only changed chunks upload." },
        { c: "Metadata", pick: "Relational DB (sharded MySQL / Spanner)", why: "Needs ACID: renames, moves, versions and permission checks must be consistent. Shard by namespace (user / shared folder)." },
        { c: "Change notification", pick: "Long polling / WebSocket + per-namespace change journal", why: "Clients hold a request open. When the namespace journal advances, they fetch changes since their cursor." },
        { c: "Conflicts", pick: "Optimistic concurrency (parent revision check)", why: "If the parent revision isn't the latest, create a 'conflicted copy' instead of overwriting. Google Docs-style merging only applies to structured docs." },
        { c: "Client", pick: "Watcher + chunker + local SQLite index", why: "Detects changes, computes chunk hashes, uploads in parallel, and resumes after going offline." }
      ],
      diagram: {
        nodes: [
          n("client", "Desktop Client", "watcher + chunker", "client", 80, 260, "Detects file changes, splits into 4 MB chunks and hashes them."),
          n("other", "Other Devices", "phone, laptop", "client", 80, 450, "Waiting for changes on a long-poll connection."),
          n("lb", "Load Balancer", "", "edge", 250, 260, "Routes to block, metadata or notification services.", "lb"),
          n("block", "Block Service", "chunks", "service", 440, 100, "Uploads and downloads content-addressed chunks."),
          n("bs", "Block Store", "S3 by SHA-256", "storage", 660, 100, "Immutable chunks. Deduplicated globally."),
          n("meta", "Metadata Svc", "commit / revisions", "service", 440, 260, "Commits new file versions transactionally, checks for conflicts."),
          n("mdb", "Metadata DB", "sharded MySQL", "db", 660, 260, "Files, versions, block lists and the change journal."),
          n("q", "Change Queue", "Kafka", "queue", 660, 420, "FileChanged events."),
          n("notify", "Notification Svc", "long poll / WS", "service", 440, 430, "Wakes clients waiting on namespaces that changed.")
        ],
        edges: [["client", "lb"], ["other", "lb"], ["lb", "block"], ["lb", "meta"], ["lb", "notify"], ["block", "bs"], ["meta", "mdb"], ["meta", "q"], ["q", "notify"]],
        flows: [
          { name: "Edit & sync a file", steps: [
            ["client", "lb", "report.pdf changed: re-chunk, 1 of 3 chunk hashes differs"],
            ["lb", "meta", "commit(path, parentRev=7, [h1, h2', h3])"],
            ["meta", "mdb", "Which blocks exist? h1 and h3 are known, h2' is missing"],
            ["meta", "client", "Please upload h2' (dedup saves 2/3 of the bandwidth)"],
            ["client", "lb", "PUT /blocks/h2'"],
            ["lb", "block", "Store the chunk"],
            ["block", "bs", "Put the object keyed by SHA-256"],
            ["meta", "mdb", "Re-commit: txn check parentRev==7 → write rev 8, append to the journal"],
            ["meta", "q", "FileChanged(namespace, cursor=1043)"],
            ["q", "notify", "Wake waiters on this namespace"],
            ["notify", "other", "Long poll returns: changes since your cursor"],
            ["other", "lb", "Fetch new metadata + download only h2'"]
          ]}
        ]
      },
      deepDives: [
        { t: "Chunking and dedup", p: "Fixed 4 MB chunks are simple. Content-defined chunking (Rabin fingerprint boundaries) survives insertions in the middle of a file. Chunk hashes allow cross-user dedup, but be careful: dedup can leak whether a file exists, so dedup per user or use convergent encryption carefully." },
        { t: "Conflict handling", b: ["Each commit names the parent revision it was based on", "If the server's latest ≠ parent → conflict", "Keep both: 'report (Alice's conflicted copy).pdf'", "Real-time co-editing needs OT/CRDT (see Collaborative Editor)"] },
        { t: "Sync protocol", p: "Each namespace has a monotonic journal. Clients store a cursor. /changes?cursor=N returns everything since N, or blocks (long poll) up to 60 s until something changes. This is simple and resumable." },
        { t: "Durability", p: "Object storage replicates across AZs with erasure coding. Metadata DB uses synchronous replication and point-in-time backups. Reference counting plus a delayed GC removes unreferenced chunks." }
      ],
      pitfalls: ["Re-uploading entire files on every change", "Eventually consistent metadata (lost renames, ghost files)", "Last-writer-wins silently dropping edits", "Pushing events to offline clients instead of using cursors"],
      tradeoffs: [["Small chunks (better dedup)", "Large chunks (less metadata)"], ["Global dedup (storage savings)", "Per-user dedup (privacy)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "ride-sharing",
      title: "Ride Sharing",
      aka: "Uber · Lyft",
      category: "Geo / Real-time",
      level: "Hard",
      icon: "car",
      summary: "Match riders with nearby drivers in real time, track trips, and price dynamically.",
      tags: ["geospatial", "H3", "geohash", "quadtree", "websocket", "matching", "surge pricing", "state machine"],
      functional: ["Riders request rides and see price and ETA", "Drivers stream their location; nearby drivers are matched", "Real-time trip tracking", "Payments, ratings and trip history"],
      nonFunctional: ["Matching under ~1 s; location updates every ~4 s", "No double-booking of drivers (consistency on trip state)", "Highly available in every city", "Massive write load from location pings"],
      estimates: [["Active drivers", "5 M, pinging every 4 s → 1.25 M location writes/s"], ["Ride requests", "20 M/day → ~230/s (peaks ×10)"], ["Location record", "~50 B → the live index is tiny (~250 MB), all in memory"]],
      api: ["POST /v1/rides {pickup, dropoff} → {rideId, fare, eta}", "WS driver: → location {lat, lng, heading}  ← offer {rideId}", "POST /v1/rides/{id}/accept · /start · /complete", "WS rider: ← driverLocation, status changes"],
      dataModel: ["driver_locations (in memory): cell_id → set(driver_id, lat, lng, ts), TTL", "trips: trip_id · rider · driver · status (REQUESTED→ACCEPTED→ARRIVED→IN_PROGRESS→COMPLETED) · fare · route", "drivers: id · vehicle · rating · status (available/busy/offline)"],
      choices: [
        { c: "Location index", pick: "In-memory geo index (H3 hex cells / geohash) in Redis or custom sharded services", why: "Ephemeral, extremely write-heavy data. Only the current location matters. Shard by city/region. Uber built H3 for this." },
        { c: "Nearby search", pick: "k-ring of hex cells around the pickup", why: "Look up the pickup cell and its neighbours, filter by distance and ETA. Expand rings until there are enough candidates." },
        { c: "Trip data", pick: "Strongly consistent DB (Postgres / Spanner / Schemaless on MySQL)", why: "Trip state transitions and driver assignment must be atomic to prevent double-assigning a driver." },
        { c: "Location history", pick: "Kafka → data lake / Cassandra", why: "Used for receipts, fraud, ETA models and surge. Append-only, huge volume." },
        { c: "Communication", pick: "WebSockets (or gRPC streams) + push", why: "Bi-directional: drivers send pings, the server sends offers and rider updates." },
        { c: "Surge pricing", pick: "Stream processing (Flink) of supply/demand per cell", why: "Computes multipliers per region every minute from live streams." }
      ],
      diagram: {
        nodes: [
          n("rider", "Rider App", "", "client", 80, 120, "Requests rides and watches the driver approach."),
          n("driver", "Driver App", "GPS every 4 s", "client", 80, 400, "Streams location and receives ride offers."),
          n("gw", "API Gateway", "WS + REST", "edge", 250, 260, "Terminates WebSockets, authenticates and routes.", "gateway"),
          n("trip", "Trip Service", "state machine", "service", 440, 120, "Owns the trip lifecycle and guards transitions transactionally."),
          n("tdb", "Trip DB", "Postgres / Spanner", "db", 660, 120, "Strongly consistent trips and assignments."),
          n("pay", "Payments", "PSP", "external", 880, 40, "Charges at trip completion."),
          n("match", "Matching Svc", "dispatch", "service", 440, 260, "Finds candidate drivers, ranks by ETA and sends offers."),
          n("price", "Pricing / ETA", "surge", "service", 660, 260, "Fare estimate, surge multiplier and routing ETA."),
          n("maps", "Maps / Routing", "", "external", 880, 260, "Road graph routing and traffic-aware ETA.", "geo"),
          n("loc", "Location Svc", "ingest pings", "service", 440, 400, "Handles 1 M+ writes/s of driver pings."),
          n("geo", "Geo Index", "Redis GEO / H3", "cache", 660, 400, "cell → available drivers, in memory with TTL.", "geo"),
          n("kafka", "Location Stream", "Kafka", "queue", 880, 400, "History for ETA models, surge, fraud and receipts.")
        ],
        edges: [["rider", "gw"], ["driver", "gw"], ["gw", "trip"], ["gw", "match"], ["gw", "loc"], ["trip", "tdb"], ["trip", "pay"], ["match", "trip"], ["match", "price"], ["price", "maps"], ["match", "geo"], ["loc", "geo"], ["loc", "kafka"]],
        flows: [
          { name: "Driver location updates", steps: [
            ["driver", "gw", "{lat, lng, heading} every 4 s over WebSocket"],
            ["gw", "loc", "Route to the location shard for this city"],
            ["loc", "geo", "Move the driver to H3 cell 8a2a1072b59ffff (TTL 30 s)"],
            ["loc", "kafka", "Append to the location stream (ETA / surge / history)"]
          ]},
          { name: "Request & match a ride", steps: [
            ["rider", "gw", "Request ride {pickup, dropoff}"],
            ["gw", "match", "Dispatch request"],
            ["match", "price", "Quote: ETA + fare × surge 1.4"],
            ["price", "maps", "Route and traffic ETA"],
            ["match", "geo", "Available drivers in the pickup cell + k-ring neighbours"],
            ["match", "driver", "Offer to the best driver (15 s timeout, then the next)"],
            ["driver", "gw", "Accept"],
            ["gw", "trip", "accept(rideId, driverId)"],
            ["trip", "tdb", "Txn: driver available? → assign, status=ACCEPTED (no double booking)"],
            ["trip", "rider", "Driver assigned. Live location stream starts"]
          ]}
        ]
      },
      deepDives: [
        { t: "Geospatial indexing options", b: ["Geohash: a string prefix means proximity. Simple, works in Redis and databases. Cells are rectangles with edge effects, so query neighbours too.", "Quadtree: adapts to density (split when a cell has over K drivers). Good for static data like businesses.", "H3 (Uber): hexagonal cells, uniform neighbour distance, hierarchical. Great for k-ring searches and surge regions.", "S2 (Google): cells on a sphere projection, used by Google Maps and Tinder."] },
        { t: "Avoiding double assignment", p: "Offer to one driver at a time, or use a lease: atomically set driver.status = OFFERED with expiry (Redis SET NX PX or a conditional DB update). Acceptance commits in the trip DB transaction." },
        { t: "Handling the ping firehose", p: "Don't write pings to the primary DB. Keep only the latest location in memory (sharded by region), stream history to Kafka, and batch-write to cold storage." },
        { t: "Multi-region", p: "Cities are natural shards. Route each city to a home region. Failover moves the city to a backup region; in-flight trip state is replicated." }
      ],
      pitfalls: ["Storing live locations in a relational DB with per-ping updates", "Querying only one geohash cell (missing nearby drivers across the boundary)", "Offering the same driver to multiple riders", "Ignoring driver-app connectivity drops (use TTLs)"],
      tradeoffs: [["Geohash (simple)", "H3/quadtree (uniform, adaptive)"], ["Greedy nearest driver (fast)", "Batch matching (globally optimal, adds delay)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "proximity",
      title: "Proximity Service",
      aka: "Yelp · Google Places · Nearby",
      category: "Geo / Search",
      level: "Medium",
      icon: "pin",
      summary: "Find nearby businesses within a radius, fast, for a dataset that changes rarely.",
      tags: ["geohash", "quadtree", "PostGIS", "read replicas", "cache", "geospatial index"],
      functional: ["Search businesses within radius R of (lat, lng), with filters", "View business details and reviews", "Owners add and update businesses (visible by next day is fine)"],
      nonFunctional: ["Low latency search (under 100 ms)", "Read-heavy: searches ≫ business updates", "Highly available; updates can be eventually consistent"],
      estimates: [["Businesses", "200 M"], ["Search QPS", "100 M DAU × 5 searches = 500 M/day → ~5.8 K QPS (peak ×5)"], ["Geo index", "200 M × (geohash 8 B + id 8 B) ≈ 3–4 GB, fits in memory on each server"]],
      api: ["GET /v1/search/nearby?lat=…&lng=…&radius=1km&category=cafe&cursor=…", "GET /v1/businesses/{id}", "POST/PUT /v1/businesses (owner)"],
      dataModel: ["businesses: id · name · lat · lng · category · hours · rating (Postgres, source of truth)", "geo_index: geohash_prefix → [business_ids] (or quadtree in memory)", "reviews: business_id · user_id · rating · text"],
      choices: [
        { c: "Geo index", pick: "Geohash (precision 5–6) in Redis/DB, or an in-memory quadtree", why: "Nearby lookups become prefix lookups on the cell plus 8 neighbours. Quadtree adapts to density (Manhattan vs desert).", alt: "PostGIS GiST / R-tree indexes, or the Elasticsearch geo_distance query, are simplest at moderate scale." },
        { c: "Business data", pick: "Relational (Postgres + PostGIS) with read replicas", why: "Structured, relational (reviews, owners), low write rate. Replicas scale reads." },
        { c: "Caching", pick: "Redis: geohash cell → business ids; business id → details", why: "Popular areas are queried constantly and data changes rarely, so hit ratios are high." },
        { c: "Freshness", pick: "Nightly or CDC-driven index rebuild", why: "Business changes can be next-day, so rebuild the quadtree offline and roll it out." }
      ],
      diagram: {
        nodes: [
          n("client", "Client", "map / list", "client", 80, 260, "User searching near their location."),
          n("lb", "Load Balancer", "", "edge", 250, 260, "Separates search traffic from business CRUD.", "lb"),
          n("search", "Search Svc", "nearby queries", "service", 440, 160, "Stateless. Computes covering cells and filters by exact distance."),
          n("biz", "Business Svc", "CRUD + reviews", "service", 440, 380, "Owner updates and business detail pages."),
          n("geo", "Geo Index", "geohash / quadtree", "cache", 660, 80, "In-memory index: cell → business ids.", "geo"),
          n("bc", "Business Cache", "Redis", "cache", 660, 230, "Hot business details."),
          n("db", "Business DB", "Postgres + PostGIS", "db", 660, 380, "Source of truth, primary for writes."),
          n("rep", "Read Replicas", "", "db", 870, 380, "Scale reads for details and reviews."),
          n("builder", "Index Builder", "nightly / CDC", "worker", 870, 170, "Rebuilds geo cells from the DB and pushes them to index servers.")
        ],
        edges: [["client", "lb"], ["lb", "search"], ["lb", "biz"], ["search", "geo"], ["search", "bc"], ["biz", "db"], ["db", "rep"], ["db", "builder"], ["builder", "geo"], ["bc", "rep", "", 0.2]],
        flows: [
          { name: "Nearby search", steps: [
            ["client", "lb", "GET /nearby?lat=37.77&lng=-122.41&radius=500m"],
            ["lb", "search", "Search request"],
            ["search", "geo", "Geohash 9q8yy + 8 neighbours → candidate business ids"],
            ["search", "bc", "Multi-get details (misses go to replicas)"],
            ["search", "client", "Filter by exact distance, rank by distance/rating, paginate"]
          ]},
          { name: "Owner updates a business", steps: [
            ["client", "lb", "PUT /businesses/42 {hours}"],
            ["lb", "biz", "Validate the owner"],
            ["biz", "db", "UPDATE on the primary"],
            ["db", "rep", "Async replication"],
            ["db", "builder", "Nightly or CDC: rebuild affected cells"],
            ["builder", "geo", "Publish the new index version"]
          ]}
        ]
      },
      deepDives: [
        { t: "Choosing geohash precision", b: ["Length 4 ≈ 39 × 19.5 km", "Length 5 ≈ 4.9 × 4.9 km", "Length 6 ≈ 1.2 × 0.6 km", "Pick the precision whose cell ≥ radius, query the cell + 8 neighbours, then filter by true distance"] },
        { t: "Quadtree", p: "Recursively split a region into 4 until each leaf has ≤ K businesses (say 100). Dense cities get deep, small cells; empty areas stay coarse. Build it in memory on server start (minutes for 200 M points) and serve from each replica." },
        { t: "Why not just SQL lat/lng ranges?", p: "WHERE lat BETWEEN … AND lng BETWEEN … can use only one index efficiently. It's fine for small data; at scale, use a real spatial index (R-tree/GiST, geohash, quadtree)." }
      ],
      pitfalls: ["Querying only the containing cell (misses nearby points across the edge)", "Treating the geo index as the source of truth", "Two-column lat/lng B-tree indexes for radius search"],
      tradeoffs: [["Geohash (simple, fixed grid)", "Quadtree (adaptive, in-memory build)"], ["Real-time index updates", "Periodic rebuild (simpler)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "ecommerce",
      title: "E-commerce & Flash Sale",
      aka: "Amazon · Shopify",
      category: "Commerce",
      level: "Hard",
      icon: "cart",
      summary: "Catalog, cart, checkout and inventory that stay correct under massive flash-sale spikes.",
      tags: ["inventory", "saga", "idempotency", "overselling", "elasticsearch", "CDN", "microservices", "queue"],
      functional: ["Browse and search the product catalog", "Cart management", "Checkout with payment", "Inventory tracking (no overselling)", "Order history and tracking"],
      nonFunctional: ["Catalog: read-heavy, highly cacheable", "Checkout: correctness over availability (never oversell, never double-charge)", "Survive 10–100× traffic spikes (Black Friday, drops)", "Search latency under 200 ms"],
      estimates: [["Catalog", "100 M products, ~1 TB of metadata + images on CDN"], ["Browsing", "50 K QPS (peak 500 K)"], ["Orders", "1 M/day avg; a flash sale can see 100 K attempts in seconds for 1,000 units"]],
      api: ["GET /v1/products?q=…&filters", "POST /v1/cart/items", "POST /v1/checkout  (Idempotency-Key header) → orderId", "GET /v1/orders/{id}"],
      dataModel: ["products (catalog DB / document store): id · title · attributes (varying per category) · price", "inventory: sku · warehouse · available · reserved (ACID)", "orders: id · user · status · items · total (ACID)", "carts: user_id → items (KV / Redis, TTL)"],
      choices: [
        { c: "Catalog", pick: "Document DB (MongoDB/DynamoDB) + Elasticsearch", why: "Products have varied attributes per category (a flexible schema). Search, facets and relevance come from ES, fed by CDC." },
        { c: "Orders & inventory", pick: "Relational (Postgres/MySQL) with ACID transactions", why: "Money and stock need atomic updates and constraints (available ≥ 0)." },
        { c: "Flash sale inventory", pick: "Redis atomic DECR (or Lua) as a gate + DB as the source of truth", why: "Counting in Redis absorbs the stampede. Only winners proceed to create DB orders. Reconcile afterwards." },
        { c: "Cart", pick: "Redis / DynamoDB with TTL", why: "High-churn, per-user, ephemeral-ish data. No complex queries." },
        { c: "Checkout orchestration", pick: "Saga (orchestrated) over Kafka", why: "Order → reserve inventory → pay → ship across services without distributed transactions. Compensate on failure." },
        { c: "Traffic spikes", pick: "CDN + waiting room + queue-based order intake", why: "Static pages are cached at the edge. A virtual queue admits users at a rate the backend can handle." }
      ],
      diagram: {
        nodes: [
          n("client", "Shopper", "web / app", "client", 80, 260, "Browsing, carting and checking out."),
          n("cdn", "CDN", "pages + images", "edge", 80, 80, "Product pages and images cached at the edge.", "cdn"),
          n("gw", "API Gateway", "auth · rate limit", "edge", 250, 260, "Authentication, rate limiting and routing to microservices.", "gateway"),
          n("cat", "Catalog Svc", "", "service", 440, 80, "Product data and search."),
          n("es", "Search Index", "Elasticsearch", "search", 660, 80, "Full-text search, facets and relevance, fed by CDC from the catalog DB."),
          n("cart", "Cart Svc", "", "service", 440, 200, "Per-user carts."),
          n("cs", "Cart Store", "Redis / DynamoDB", "cache", 660, 200, "Carts with TTL."),
          n("order", "Order Svc", "saga orchestrator", "service", 440, 330, "Creates orders and coordinates the checkout saga."),
          n("odb", "Orders DB", "Postgres", "db", 660, 330, "ACID orders and payments state."),
          n("inv", "Inventory Svc", "", "service", 440, 460, "Reserves and releases stock atomically."),
          n("idb", "Inventory", "Redis gate + SQL", "db", 660, 460, "Redis DECR for the stampede; SQL row with a CHECK (available ≥ 0)."),
          n("kafka", "Order Events", "Kafka", "queue", 870, 330, "OrderCreated, PaymentSucceeded, …"),
          n("pay", "Payment Svc", "", "service", 870, 200, "Charges the customer (idempotent)."),
          n("ship", "Fulfillment", "", "worker", 870, 460, "Warehouse picking and shipping.")
        ],
        edges: [["client", "cdn"], ["client", "gw"], ["gw", "cat"], ["gw", "cart"], ["gw", "order"], ["cat", "es"], ["cart", "cs"], ["order", "odb"], ["order", "inv"], ["inv", "idb"], ["odb", "kafka"], ["kafka", "pay"], ["kafka", "ship"]],
        flows: [
          { name: "Browse & search", steps: [
            ["client", "cdn", "Product page HTML and images from the nearest edge"],
            ["client", "gw", "GET /products?q=running shoes&size=10"],
            ["gw", "cat", "Search request"],
            ["cat", "es", "Full-text + facets + ranking"],
            ["cat", "client", "Results (prices re-validated at checkout)"]
          ]},
          { name: "Checkout saga", steps: [
            ["client", "gw", "POST /checkout  Idempotency-Key: 7f3…"],
            ["gw", "order", "Create order PENDING (dedupe on key)"],
            ["order", "inv", "Reserve SKU×1"],
            ["inv", "idb", "DECR stock:sku ≥ 0 ? reserve : sold out (atomic)"],
            ["order", "odb", "Order PENDING_PAYMENT; outbox row written in the same txn"],
            ["odb", "kafka", "Outbox relay publishes OrderCreated"],
            ["kafka", "pay", "Charge. On failure → compensate: release inventory, cancel order"],
            ["kafka", "ship", "PaymentSucceeded → fulfil. Order CONFIRMED"]
          ]}
        ]
      },
      deepDives: [
        { t: "Preventing overselling", b: ["Pessimistic: SELECT … FOR UPDATE on the inventory row (simple, contention at high QPS)", "Optimistic: UPDATE inv SET qty=qty-1 WHERE sku=? AND qty>0 (check affected rows)", "Flash sale: pre-load stock into Redis and DECR atomically; only successful decrements create orders", "Reservation with TTL: release unpaid reservations after 10–15 min"] },
        { t: "Idempotency everywhere", p: "Checkout, payment and webhook handlers must be idempotent. Store the idempotency key with the result, and return the stored result on retry. This prevents double orders when users double-click or clients retry on timeouts." },
        { t: "Saga vs 2PC", p: "Microservices can't hold locks across services for seconds. A saga runs local transactions per step, and failures trigger compensating actions (refund, restock). Use the transactional outbox to publish events reliably." },
        { t: "Surviving the spike", b: ["Pre-scale and warm caches before announced sales", "Virtual waiting room / token admission", "Degrade gracefully: turn off recommendations and reviews", "Queue order intake and confirm asynchronously"] }
      ],
      pitfalls: ["Reading stock, then writing it without atomicity (overselling)", "Distributed transactions (2PC) across microservices", "No idempotency keys, so double-clicks create double charges", "Putting the product search load on the primary OLTP database"],
      tradeoffs: [["Reserve at add-to-cart (fair, locks stock)", "Reserve at checkout (simple, can disappoint)"], ["Orchestrated saga (clear flow)", "Choreographed saga (loose coupling)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "payment",
      title: "Payment System",
      aka: "Stripe · PayPal",
      category: "Fintech",
      level: "Hard",
      icon: "card",
      summary: "Move money correctly: idempotent APIs, double-entry ledger, reconciliation, exactly-once effects.",
      tags: ["ACID", "double-entry ledger", "idempotency", "reconciliation", "PSP", "state machine", "outbox", "exactly-once"],
      functional: ["Accept payments (card, wallet) for merchants", "Refunds and payouts", "Maintain balances and a full audit trail", "Webhooks to merchants"],
      nonFunctional: ["Correctness above all: no double charge, no lost money", "Strong consistency and durability (ACID)", "Auditability and immutability", "PCI-DSS compliance; availability 99.99%"],
      estimates: [["Transactions", "10 M/day → ~115 TPS (peaks ×10)"], ["Scale", "Throughput is modest; correctness and latency of external PSPs dominate"], ["Ledger rows", "2+ entries per movement → ~30 M rows/day, retained for years"]],
      api: ["POST /v1/payments {amount, currency, source, merchant}  Idempotency-Key: …", "POST /v1/refunds {paymentId, amount}", "Webhook → merchant: payment.succeeded"],
      dataModel: ["payments: id · merchant_id · amount · currency · status (CREATED→AUTHORIZED→CAPTURED | FAILED) · psp_ref · idempotency_key (UNIQUE)", "ledger_entries: id · txn_id · account_id · debit/credit · amount (append-only; sum per txn = 0)", "accounts: id · type (merchant, customer_clearing, fees) · balance (derived / cached)"],
      choices: [
        { c: "Database", pick: "Relational with ACID (Postgres / MySQL; Spanner/CockroachDB for global)", why: "Multi-row transactions, constraints, serializable isolation where needed. The whole domain is relational and audited." },
        { c: "Ledger", pick: "Double-entry, append-only", why: "Every movement debits one account and credits another. Entries are never updated, so errors are corrected with reversing entries. Balances are derived and can always be verified." },
        { c: "Idempotency", pick: "Idempotency keys with a unique constraint", why: "Network timeouts are inevitable. Retries with the same key return the stored outcome instead of charging twice." },
        { c: "External calls", pick: "PSP (Stripe/Adyen) or card networks with retries + reconciliation", why: "The PSP may succeed while you time out. Query status, retry idempotently, and reconcile daily against settlement files." },
        { c: "Events", pick: "Transactional outbox → Kafka", why: "State changes and events must never diverge. Write the event in the same DB transaction, then relay it." }
      ],
      diagram: {
        nodes: [
          n("m", "Merchant", "checkout", "client", 80, 260, "Calls the API with an idempotency key."),
          n("gw", "API Gateway", "auth · idempotency", "edge", 250, 260, "Authenticates merchants and short-circuits duplicate requests.", "gateway"),
          n("risk", "Risk / Fraud", "ML scoring", "service", 440, 90, "Blocks or step-up authenticates risky payments.", "lock"),
          n("ps", "Payment Svc", "state machine", "service", 440, 260, "Drives payment states and calls the PSP."),
          n("pdb", "Payments DB", "Postgres (ACID)", "db", 660, 260, "Payment records with a unique idempotency key and the outbox."),
          n("psp", "PSP / Networks", "Visa, MC, banks", "external", 870, 260, "Authorises and captures. Sends settlement files daily.", "card"),
          n("wallet", "Wallet / Ledger Svc", "", "service", 440, 430, "Posts balanced double-entry transactions."),
          n("ledger", "Ledger", "append-only", "db", 660, 430, "Immutable debits and credits. Balances are derived."),
          n("q", "Events", "Kafka (outbox)", "queue", 660, 90, "PaymentSucceeded etc., published reliably."),
          n("recon", "Reconciliation", "daily batch", "worker", 870, 90, "Compares internal ledger vs PSP settlement files and flags mismatches."),
          n("hook", "Webhooks", "retry + backoff", "worker", 870, 430, "Notifies merchants with signed, retried events.")
        ],
        edges: [["m", "gw"], ["gw", "ps"], ["ps", "risk"], ["ps", "pdb"], ["ps", "psp"], ["ps", "wallet"], ["wallet", "ledger"], ["pdb", "q"], ["q", "recon"], ["recon", "psp"], ["q", "hook"]],
        flows: [
          { name: "Charge a card", steps: [
            ["m", "gw", "POST /payments $50  Idempotency-Key: ord-991"],
            ["gw", "ps", "Key unseen → proceed (seen → return the stored response)"],
            ["ps", "risk", "Fraud score 0.03 → allow"],
            ["ps", "pdb", "INSERT payment CREATED (unique idempotency_key)"],
            ["ps", "psp", "Authorise + capture (PSP idempotency key = payment id)"],
            ["ps", "pdb", "UPDATE → CAPTURED + outbox event (same txn)"],
            ["ps", "wallet", "Post the ledger transaction"],
            ["wallet", "ledger", "DEBIT customer_clearing $50 / CREDIT merchant $48.55 / CREDIT fees $1.45"],
            ["pdb", "q", "Outbox relay → PaymentSucceeded"],
            ["q", "hook", "Signed webhook to the merchant, retried until 2xx"]
          ]},
          { name: "Timeout & recovery", steps: [
            ["ps", "psp", "Authorise… timeout! (did it succeed?)"],
            ["ps", "pdb", "Mark UNKNOWN (never assume failure)"],
            ["ps", "psp", "Query status / retry with the same key → 'already captured'"],
            ["q", "recon", "Daily: match every ledger entry with a settlement line"],
            ["recon", "psp", "Mismatch → alert + adjusting entries"]
          ]}
        ]
      },
      deepDives: [
        { t: "Exactly-once is at-least-once + idempotency", p: "You can't guarantee a message is delivered exactly once over a network. You can guarantee the effect happens once: every mutating call carries a unique key, stored with a unique constraint, and a replay returns the recorded result." },
        { t: "Double-entry ledger", b: ["Each transaction has ≥ 2 entries whose signed amounts sum to zero", "Entries are immutable; corrections are new reversing entries", "Balance = sum(entries), cached with a version for speed", "Invariant checks run continuously (all transactions balance)"] },
        { t: "Payment state machine", p: "CREATED → AUTHORIZED → CAPTURED → (REFUNDED), with FAILED/CANCELED. Transitions are validated (no CAPTURED → AUTHORIZED) and persisted with the event atomically." },
        { t: "Security and compliance", b: ["Tokenise cards (vault); keep raw PANs out of most systems (PCI scope)", "Encrypt at rest and in transit, HSMs for keys", "Audit logs, least privilege, 4-eyes on manual adjustments"] }
      ],
      pitfalls: ["Floating-point money: use integer minor units (cents) or decimal", "Treating a timeout as failure and retrying without an idempotency key", "Mutable balance columns without a ledger (no audit trail)", "Publishing events outside the DB transaction (lost or phantom events)"],
      tradeoffs: [["Strong consistency (correct)", "Availability (may reject during failures)"], ["Sync capture (simple)", "Async / queued (resilient, more states)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "ticket-booking",
      title: "Ticket Booking",
      aka: "Ticketmaster · BookMyShow",
      category: "Commerce",
      level: "Hard",
      icon: "ticket",
      summary: "Sell a fixed number of seats to a huge surge of buyers, without double-booking.",
      tags: ["seat locking", "distributed lock", "TTL", "waiting room", "strong consistency", "contention", "redis SETNX"],
      functional: ["Browse events and venues", "View the seat map with availability", "Hold seats temporarily while paying", "Book (pay) and receive tickets"],
      nonFunctional: ["Never double-book a seat (strong consistency)", "Handle huge surges (millions for a popular tour)", "Fairness during on-sales", "Seat map should update quickly"],
      estimates: [["Events", "100 K active events"], ["Normal", "~1 K bookings/s"], ["On-sale surge", "10 M users for 50 K seats → admit via a queue at ~5 K/s"]],
      api: ["GET /v1/events?city=…", "GET /v1/events/{id}/seats → availability map", "POST /v1/holds {eventId, seatIds} → holdId, expiresAt", "POST /v1/bookings {holdId, payment} (idempotent)"],
      dataModel: ["events · venues · seats(event_id, seat_id, status, hold_id, version)", "bookings: id · user · event · seats · status · payment_id", "Unique constraint (event_id, seat_id) on confirmed tickets"],
      choices: [
        { c: "Bookings DB", pick: "Relational (Postgres) with row-level locking or unique constraints", why: "The core invariant, one seat to one buyer, is enforced by transactions and constraints." },
        { c: "Seat holds", pick: "Redis SET NX with TTL (10 min)", why: "Fast, auto-expiring locks absorb contention. The DB remains the final authority." },
        { c: "Event discovery", pick: "Elasticsearch + CDN cache", why: "Search by artist, city and date. Event pages are heavily cached." },
        { c: "Surge control", pick: "Virtual waiting room (queue + signed admission tokens)", why: "Protects the backend and gives fair, first-come access instead of a refresh-button lottery." }
      ],
      diagram: {
        nodes: [
          n("user", "Fans", "millions", "client", 80, 260, "Many users trying to buy the same seats at once."),
          n("wait", "Waiting Room", "queue + tokens", "edge", 260, 260, "Admits users at a controlled rate with signed tokens.", "clock"),
          n("event", "Event Svc", "browse", "service", 450, 110, "Event and venue info, seat maps."),
          n("es", "Search", "Elasticsearch", "search", 660, 40, "Find events by artist, city or date."),
          n("book", "Booking Svc", "holds + confirm", "service", 450, 260, "Creates seat holds and confirms bookings transactionally."),
          n("lock", "Seat Holds", "Redis NX + TTL", "cache", 660, 180, "seat:{event}:{seat} → holdId, expires in 10 min."),
          n("db", "Bookings DB", "Postgres", "db", 660, 330, "Seats and bookings. Unique constraints are the final guard."),
          n("pay", "Payment Svc", "", "service", 450, 420, "Charges idempotently."),
          n("psp", "PSP", "", "external", 660, 460, "Card processing.", "card")
        ],
        edges: [["user", "wait"], ["wait", "event"], ["wait", "book"], ["event", "es"], ["book", "lock"], ["book", "db"], ["book", "pay"], ["pay", "psp"]],
        flows: [
          { name: "Hold & book seats", steps: [
            ["user", "wait", "Join the queue at 10:00:00 → position 48,213"],
            ["wait", "book", "Admitted with a signed token → hold A12, A13"],
            ["book", "lock", "SET seat:e9:A12 hold77 NX EX 600 (both succeed?)"],
            ["book", "db", "UPDATE seats SET status='HELD' WHERE id IN (…) AND status='AVAILABLE'"],
            ["book", "user", "Held for 10:00. Pay now"],
            ["book", "pay", "Pay with holdId as the idempotency key"],
            ["pay", "psp", "Charge"],
            ["book", "db", "Txn: HELD → BOOKED, insert tickets (unique seat constraint)"],
            ["book", "lock", "Delete the holds (or let them expire)"]
          ]},
          { name: "Contention (two users, one seat)", steps: [
            ["wait", "book", "User X and User Y both click A12"],
            ["book", "lock", "X: SET NX → OK.  Y: SET NX → fails"],
            ["book", "user", "Y: 'Seat just taken', suggest nearby seats"],
            ["book", "db", "Hold expires unpaid? Seat returns to AVAILABLE"]
          ]}
        ]
      },
      deepDives: [
        { t: "Locking strategies", b: ["Pessimistic: SELECT … FOR UPDATE, which serialises buyers (fine at low contention)", "Optimistic: version column, UPDATE … WHERE version=? (retry on conflict)", "Redis TTL holds: fast, auto-release; the DB constraint is the backstop", "Queue per event: serialise all booking requests through one consumer (simple, strict ordering)"] },
        { t: "Seat map freshness", p: "Serve availability from a cache updated on hold and release events (push via SSE/WebSocket for hot events). Accept slight staleness, because the hold step is the source of truth." },
        { t: "Fairness and bots", b: ["Waiting room with randomised position at open time", "CAPTCHA / device attestation", "Purchase limits per account and card", "Verified-fan presales"] }
      ],
      pitfalls: ["Checking availability, then booking in separate non-atomic steps", "Holds without expiry (seats locked forever)", "Letting the whole surge hit the DB", "Relying only on the cache for the booked state"],
      tradeoffs: [["Pessimistic locks (simple, contention)", "Optimistic (scales, retries)"], ["Longer holds (user-friendly)", "Shorter holds (less inventory locked)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "leaderboard",
      title: "Real-time Leaderboard",
      aka: "Gaming ranks",
      category: "Real-time",
      level: "Medium",
      icon: "trophy",
      summary: "Rank millions of players by score in real time and fetch top-N and 'my rank' instantly.",
      tags: ["redis sorted set", "ZADD", "ZREVRANK", "skip list", "sharding", "top-k"],
      functional: ["Update a player's score after each match", "Show the top 10 / top 100", "Show a player's rank and neighbours (±5)", "Daily / weekly / all-time and regional boards"],
      nonFunctional: ["Real-time updates (under 1 s)", "Rank queries under 10 ms", "Scale: 50 M+ players", "Durable history (rebuildable)"],
      estimates: [["Players", "50 M monthly, 5 M DAU"], ["Score updates", "5 M × 10 matches/day → ~600/s (peak ~6 K/s)"], ["Memory", "Sorted set ~100 B/member → 50 M × 100 B ≈ 5 GB (one Redis node can hold it)"]],
      api: ["POST /v1/scores {userId, delta, matchId}", "GET /v1/leaderboard/{board}/top?n=10", "GET /v1/leaderboard/{board}/rank/{userId}?around=5"],
      dataModel: ["Redis ZSET lb:{board}:{period} → member=userId, score", "scores_history (DynamoDB/MySQL): user_id · match_id · delta · ts", "users: id · display_name · avatar"],
      choices: [
        { c: "Ranking store", pick: "Redis Sorted Sets", why: "A skip list + hash gives O(log N) insert and rank, O(log N + k) range. ZINCRBY, ZREVRANGE and ZREVRANK are exactly the operations needed.", alt: "A SQL ORDER BY with RANK() over 50 M rows per request is far too slow; a precomputed batch table is too stale." },
        { c: "Durability", pick: "Score events in Kafka + history in a DB", why: "Redis can be rebuilt from history or snapshots (AOF/RDB). Also needed for anti-cheat audits." },
        { c: "Scaling beyond one node", pick: "Shard by score range or by region/board", why: "Top-N needs a global view. Shard by score bands (each knows counts) or keep per-shard top-K and merge." },
        { c: "Periods", pick: "One key per period with TTL", why: "lb:weekly:2026-W39 expires automatically, so there is no mass delete." }
      ],
      diagram: {
        nodes: [
          n("player", "Game Clients", "", "client", 80, 260, "Finish matches and view rankings."),
          n("gw", "API Gateway", "", "edge", 250, 260, "Auth and routing.", "gateway"),
          n("game", "Game Svc", "match results", "service", 440, 140, "Validates match results (anti-cheat) and emits score events."),
          n("lbs", "Leaderboard Svc", "reads", "service", 440, 380, "Top-N, rank and neighbours queries."),
          n("kafka", "Score Events", "Kafka", "queue", 660, 80, "Durable, replayable score changes."),
          n("upd", "Score Updater", "consumer", "worker", 870, 200, "Applies ZINCRBY per board and period and writes history."),
          n("redis", "Sorted Sets", "Redis", "cache", 660, 270, "In-memory ranked sets per board and period."),
          n("hist", "Score History", "DynamoDB", "db", 870, 80, "Durable per-match record, used to rebuild Redis."),
          n("prof", "Profile Svc", "names, avatars", "service", 660, 450, "Hydrates user ids for display.")
        ],
        edges: [["player", "gw"], ["gw", "game"], ["gw", "lbs"], ["game", "kafka"], ["kafka", "upd"], ["upd", "redis"], ["upd", "hist"], ["lbs", "redis"], ["lbs", "prof"]],
        flows: [
          { name: "Score update", steps: [
            ["player", "gw", "Match finished: +42 points"],
            ["gw", "game", "Validate match signature and anti-cheat"],
            ["game", "kafka", "ScoreUpdated{user:17, +42, match:9f}"],
            ["kafka", "upd", "Consume (idempotent on matchId)"],
            ["upd", "redis", "ZINCRBY lb:weekly:W39 42 user:17 → O(log N)"],
            ["upd", "hist", "Persist history for rebuilds and audits"]
          ]},
          { name: "Read top 10 + my rank", steps: [
            ["player", "gw", "GET /leaderboard/weekly/top?n=10 + my rank"],
            ["gw", "lbs", "Read request"],
            ["lbs", "redis", "ZREVRANGE 0 9 WITHSCORES; ZREVRANK user:17 → 1,203"],
            ["lbs", "prof", "Batch-fetch display names and avatars (cached)"],
            ["lbs", "player", "Top 10 + 'You are #1,203'"]
          ]}
        ]
      },
      deepDives: [
        { t: "Why sorted sets are perfect", p: "Redis ZSETs combine a hash map (member → score) with a skip list ordered by score. Updating a score, getting a rank and range-reading are all logarithmic, so millions of members stay in single-digit milliseconds." },
        { t: "Ties", p: "Encode a tiebreaker into the score, e.g. score × 10¹⁰ + (MAX_TS − achieved_ts), so earlier achievers rank higher among equal scores." },
        { t: "Approximate ranks at huge scale", p: "For hundreds of millions of players, exact rank for everyone isn't needed. Bucket scores into a histogram and estimate percentile ('top 3%'). Keep exact ranks only for the top K." }
      ],
      pitfalls: ["Computing rank with SQL COUNT(*) WHERE score > x per request", "No idempotency on score events (double counting on retries)", "Keeping Redis as the only copy of scores"],
      tradeoffs: [["Exact ranks (costly at scale)", "Approximate percentiles (cheap)"], ["Single Redis (simple)", "Sharded (scalable, top-N merge)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "monitoring",
      title: "Metrics & Logging Platform",
      aka: "Datadog · Prometheus · ELK",
      category: "Observability",
      level: "Hard",
      icon: "chart",
      summary: "Ingest millions of metrics and log lines per second, store them efficiently, query and alert.",
      tags: ["time-series", "downsampling", "retention", "kafka", "elasticsearch", "loki", "alerting", "cardinality"],
      functional: ["Collect metrics (counters, gauges, histograms) and logs from all hosts", "Dashboards with arbitrary time ranges", "Alerting on thresholds and anomalies", "Log search and tailing"],
      nonFunctional: ["Write-heavy ingestion (millions of points/s)", "Recent data queryable within seconds", "Cheap long-term retention (downsampled)", "The monitoring system must be more reliable than what it monitors"],
      estimates: [["Hosts", "100 K hosts × 1000 metrics every 10 s → 10 M points/s"], ["Point size", "~1.5 B compressed (Gorilla encoding) → ~1.3 TB/day"], ["Logs", "100 K hosts × 1 KB/s → 100 MB/s → ~8.6 TB/day"]],
      api: ["Agent → POST /v1/series (batched, compressed)", "Query: rate(http_requests_total{service='api'}[5m])", "Alert rule: if p99_latency > 500ms for 5m → page"],
      dataModel: ["Series identity: metric name + tag set (host, service, region) → series_id", "Data: (series_id, timestamp, value) in time-partitioned compressed blocks", "Rollups: 10 s raw (7 d) → 1 m (30 d) → 1 h (1 yr)", "Logs: indexed labels + compressed chunks in object storage"],
      choices: [
        { c: "Metrics store", pick: "Time-series DB (Prometheus/Thanos/Mimir, InfluxDB, M3, VictoriaMetrics)", why: "Optimised for append-only timestamped data: delta-of-delta and XOR compression, time partitioning, downsampling and retention policies." },
        { c: "Ingestion buffer", pick: "Kafka", why: "Absorbs spikes, decouples collectors from writers, and allows replays and multiple consumers (TSDB, alerting, archive)." },
        { c: "Logs", pick: "Elasticsearch/OpenSearch (full-text) or Loki/ClickHouse (label index + cheap storage)", why: "ES gives rich search but is expensive. Loki indexes only labels and stores chunks in S3 for cheap retention." },
        { c: "Long-term storage", pick: "Object storage (S3) with downsampled blocks", why: "Cheap, durable. Query engines (Thanos/Mimir) read historical blocks directly." },
        { c: "Alerting", pick: "Streaming evaluation on ingest + rule engine", why: "Don't depend on slow queries. Evaluate rules continuously, dedupe and route to on-call." }
      ],
      diagram: {
        nodes: [
          n("hosts", "Hosts & Services", "agents / OTel SDK", "client", 80, 260, "Emit metrics, logs and traces; agents batch and compress."),
          n("coll", "Collectors", "OTel / gateways", "service", 260, 260, "Validate, enrich tags and apply rate/cardinality limits."),
          n("kafka", "Ingest Buffer", "Kafka", "queue", 440, 260, "Partitioned by series or tenant. Absorbs bursts."),
          n("alert", "Alert Manager", "rules engine", "worker", 440, 90, "Evaluates rules continuously, groups and dedupes alerts."),
          n("page", "PagerDuty / Slack", "", "external", 250, 90, "On-call notifications.", "bell"),
          n("mw", "Metrics Writer", "", "worker", 630, 170, "Builds compressed time-series blocks."),
          n("lw", "Log Indexer", "", "worker", 630, 380, "Parses and indexes logs."),
          n("tsdb", "Time-series DB", "downsample · retention", "analytics", 840, 170, "Hot recent data in memory/SSD, older blocks in object storage."),
          n("logs", "Log Store", "Elasticsearch / Loki", "search", 840, 380, "Searchable logs."),
          n("dash", "Dashboards", "Grafana", "client", 630, 40, "Query and visualise."),
          n("cold", "Cold Storage", "S3", "storage", 840, 480, "Months or years of compressed data.")
        ],
        edges: [["hosts", "coll"], ["coll", "kafka"], ["kafka", "mw"], ["kafka", "lw"], ["mw", "tsdb"], ["lw", "logs"], ["logs", "cold"], ["kafka", "alert"], ["alert", "page"], ["dash", "tsdb"]],
        flows: [
          { name: "Metric ingestion & alert", steps: [
            ["hosts", "coll", "Batch: 1000 points, gzip, every 10 s"],
            ["coll", "kafka", "Enrich tags, drop over-cardinality series, produce"],
            ["kafka", "mw", "Consume partitions"],
            ["mw", "tsdb", "Append to the head block; compress (Gorilla)"],
            ["kafka", "alert", "Streaming rule: p99 > 500 ms for 5 m?"],
            ["alert", "page", "Fire → dedupe/group → page on-call"],
            ["dash", "tsdb", "Grafana query over 7 days → served from 1-min rollups"]
          ]},
          { name: "Log pipeline", steps: [
            ["hosts", "coll", "Structured JSON logs"],
            ["coll", "kafka", "Buffer"],
            ["kafka", "lw", "Parse, redact PII, extract labels"],
            ["lw", "logs", "Index (hot tier, 7 days)"],
            ["logs", "cold", "Roll to S3 after 7 days (searchable on demand)"]
          ]}
        ]
      },
      deepDives: [
        { t: "Why TSDBs compress so well", b: ["Timestamps are regular → delta-of-delta encoding gets ~1 bit per timestamp", "Values change slowly → XOR with the previous value (Gorilla) gets ~1.4 bytes per point", "Columnar, time-partitioned blocks → dropping old data means deleting a file"] },
        { t: "Cardinality explosion", p: "Each unique tag combination is a new series. Putting user_id or request_id in a metric tag creates millions of series and blows up memory. Enforce limits and use logs or traces for high-cardinality data." },
        { t: "Push vs pull", p: "Prometheus pulls (scrapes) targets. It is simple to tell whether a target is down, but it needs service discovery. Push (StatsD, OTLP) suits short-lived jobs and serverless. Large systems combine both through gateways." }
      ],
      pitfalls: ["High-cardinality tags (user_id) on metrics", "Monitoring stack sharing failure domains with the systems it monitors", "Storing raw resolution forever", "Alert fatigue: too many noisy alerts"],
      tradeoffs: [["Full-text log index (powerful, costly)", "Label-only index (cheap, grep-like)"], ["Pull (simple health)", "Push (ephemeral jobs)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "collab-editor",
      title: "Collaborative Editor",
      aka: "Google Docs · Figma · Notion",
      category: "Real-time",
      level: "Hard",
      icon: "doc",
      summary: "Let many users edit the same document concurrently and converge on the same result.",
      tags: ["OT", "CRDT", "websocket", "operation log", "snapshots", "presence", "conflict resolution"],
      functional: ["Multiple users edit a doc simultaneously", "See others' cursors and selections", "Version history and restore", "Offline editing that syncs later", "Comments and permissions"],
      nonFunctional: ["Low latency: local edits apply instantly, remote edits appear in ~100 ms", "Convergence: all replicas end in the same state", "No lost edits", "Scales to many docs (each doc has few editors)"],
      estimates: [["Docs", "1 B documents; ~10 M open at any time"], ["Editors/doc", "typically 1–10, up to ~100"], ["Ops", "~2 ops/s per active editor → a few million ops/s total"]],
      api: ["WS /docs/{id}: → op {rev, ops[]}  ← ack {rev} / remote op {rev, ops, author}", "GET /docs/{id}/snapshot?rev=…", "GET /docs/{id}/history"],
      dataModel: ["docs: id · owner · acl · latest_rev · snapshot_rev", "ops: (doc_id, rev) → op, author, ts (append-only log)", "snapshots: doc_id · rev · content (blob)"],
      choices: [
        { c: "Concurrency model", pick: "OT with a central server (Google Docs) or CRDT (Figma-like, Yjs/Automerge)", why: "OT transforms concurrent operations against each other and needs a central ordering server. CRDTs merge without coordination, which suits offline and P2P, at some metadata cost." },
        { c: "Routing", pick: "All editors of a doc connect to the same session server (consistent hashing on doc_id)", why: "The single owner serialises ops per doc: simple OT and in-memory state." },
        { c: "Storage", pick: "Append-only op log (Cassandra/Bigtable/Kafka) + periodic snapshots (S3)", why: "The op log gives history and replay. Snapshots bound load time: load snapshot + ops since." },
        { c: "Presence / cursors", pick: "Ephemeral in-memory / Redis pub/sub", why: "High-frequency and lossy-OK, so it doesn't need durable storage." }
      ],
      diagram: {
        nodes: [
          n("a", "Editor A", "local-first", "client", 80, 120, "Applies edits locally at once, sends ops to the server."),
          n("b", "Editor B", "", "client", 80, 400, "Receives transformed ops and applies them."),
          n("gw", "WS Gateway", "", "edge", 250, 260, "Terminates WebSockets and routes by doc id.", "gateway"),
          n("router", "Doc Router", "docId → server", "cache", 440, 90, "Consistent hashing / lease: which server owns this doc session."),
          n("collab", "Collab Svc", "OT / CRDT session", "service", 440, 260, "Owns the doc in memory, orders and transforms ops, broadcasts."),
          n("pres", "Presence", "cursors", "cache", 440, 430, "Ephemeral cursor and selection state."),
          n("meta", "Doc Metadata", "ACL · titles", "db", 660, 90, "Permissions and document info."),
          n("oplog", "Operation Log", "Bigtable / Cassandra", "db", 660, 260, "Durable, ordered ops per doc (revision numbers)."),
          n("snap", "Snapshotter", "compaction", "worker", 870, 260, "Every N ops, writes a full snapshot."),
          n("blob", "Snapshots", "S3", "storage", 870, 430, "Fast document loads and version history.")
        ],
        edges: [["a", "gw"], ["b", "gw"], ["gw", "collab"], ["collab", "router"], ["collab", "meta"], ["collab", "oplog"], ["collab", "pres"], ["oplog", "snap"], ["snap", "blob"]],
        flows: [
          { name: "Concurrent edits (OT)", steps: [
            ["a", "gw", "insert('X', pos 5) based on rev 41 (already shown locally)"],
            ["gw", "collab", "Routed to the doc's owning session server"],
            ["collab", "router", "(owner lease confirmed)"],
            ["collab", "oplog", "B's op landed first as rev 42 → transform A's op against it → pos 6 → append rev 43"],
            ["collab", "a", "ack rev 43"],
            ["collab", "b", "Broadcast the transformed op (rev 43); B applies it"],
            ["collab", "pres", "Cursor updates (not persisted)"],
            ["oplog", "snap", "Every 500 ops → snapshot"],
            ["snap", "blob", "Store snapshot @ rev 500"]
          ]}
        ]
      },
      deepDives: [
        { t: "OT vs CRDT", b: ["OT: ops are index-based (insert at 5); the server transforms concurrent ops. Proven at Google Docs scale, but needs a central server and tricky transform functions.", "CRDT: each character has a unique, ordered id, and merges are commutative. Works offline and P2P (Yjs, Automerge). Costs extra metadata (tombstones).", "Figma: server-authoritative, CRDT-inspired, with last-writer-wins per property."] },
        { t: "Loading a document", p: "Load the latest snapshot, then replay ops after the snapshot revision. Old ops can be compacted after they are covered by snapshots and history checkpoints." },
        { t: "Offline", p: "The client queues ops with its base revision. On reconnect, the server transforms them against everything that happened meanwhile (OT), or the CRDT merges automatically." }
      ],
      pitfalls: ["Locking the whole document per editor", "Last-write-wins on the entire document (lost edits)", "Persisting cursor positions durably", "Replaying the full op history on every open (no snapshots)"],
      tradeoffs: [["OT (central, compact)", "CRDT (offline/P2P, metadata heavy)"], ["Single session server per doc (simple)", "Multi-master (complex)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "job-scheduler",
      title: "Distributed Job Scheduler",
      aka: "Cron at scale · Airflow · Temporal",
      category: "Infrastructure",
      level: "Medium",
      icon: "clock",
      summary: "Run millions of scheduled and delayed jobs reliably, exactly when due, at least once.",
      tags: ["leader election", "SKIP LOCKED", "visibility timeout", "idempotency", "retries", "DLQ", "cron"],
      functional: ["Create one-off (run at T) and recurring (cron) jobs", "Execute jobs on a worker fleet", "Retries with backoff, timeouts and a dead-letter queue", "Job status and history"],
      nonFunctional: ["No missed jobs; at-least-once execution", "Jobs start within ~1 s of the due time", "Scales to millions of jobs/day", "No single point of failure"],
      estimates: [["Jobs", "10 M executions/day → ~115/s (peaks at the top of each hour ×50)"], ["Job rows", "100 M scheduled jobs × 1 KB = 100 GB"]],
      api: ["POST /v1/jobs {schedule: '0 * * * *' | runAt, payload, retries, timeout}", "GET /v1/jobs/{id}/runs", "DELETE /v1/jobs/{id}"],
      dataModel: ["jobs: id · schedule · next_run_at (indexed) · payload · owner · retry_policy", "runs: run_id (job_id + scheduled_time) · status · attempts · worker · started/finished"],
      choices: [
        { c: "Job store", pick: "Relational DB with an index on next_run_at (Postgres)", why: "Durable, transactional claims with SELECT … FOR UPDATE SKIP LOCKED let many schedulers poll without conflict.", alt: "Redis ZSET (score = run time) for delays; Cassandra time-bucketed tables at huge scale." },
        { c: "Dispatch", pick: "Task queue (SQS / Kafka / RabbitMQ)", why: "Decouples the scheduler from execution. Visibility timeouts redeliver jobs whose workers died." },
        { c: "Coordination", pick: "Leader election / partitioned ownership via ZooKeeper / etcd", why: "Ensure each time-partition of jobs is scanned by exactly one scheduler; failover on leader loss." },
        { c: "Correctness", pick: "Idempotent jobs with run_id = job_id + scheduled_time", why: "At-least-once can run twice. Dedupe on run_id." }
      ],
      diagram: {
        nodes: [
          n("client", "Clients", "API / UI", "client", 80, 260, "Teams registering jobs."),
          n("api", "Scheduler API", "", "service", 260, 260, "Validates cron expressions and computes next_run_at."),
          n("jdb", "Job Store", "Postgres", "db", 450, 110, "Jobs indexed by next_run_at."),
          n("sched", "Scheduler", "leader / partitions", "worker", 450, 260, "Polls due jobs every second, enqueues runs, advances next_run_at.", "clock"),
          n("zk", "Coordination", "etcd / ZooKeeper", "db", 450, 420, "Leader election and partition leases."),
          n("q", "Task Queue", "SQS / Kafka", "queue", 660, 260, "Due runs waiting for workers."),
          n("w", "Executors", "worker fleet", "worker", 870, 260, "Run jobs with timeouts and heartbeats; autoscaled on queue depth."),
          n("runs", "Run History", "DB", "db", 870, 100, "Status and attempts per run."),
          n("dlq", "Dead Letters", "DLQ", "queue", 870, 430, "Runs that failed after max retries, for inspection.")
        ],
        edges: [["client", "api"], ["api", "jdb"], ["sched", "jdb"], ["sched", "zk"], ["sched", "q"], ["q", "w"], ["w", "runs"], ["w", "dlq"]],
        flows: [
          { name: "Schedule & execute", steps: [
            ["client", "api", "Create job: '0 * * * *' send-report"],
            ["api", "jdb", "INSERT job, next_run_at = 14:00"],
            ["sched", "zk", "Hold the lease for partitions 0–15 (renew every 5 s)"],
            ["sched", "jdb", "SELECT … WHERE next_run_at <= now() FOR UPDATE SKIP LOCKED LIMIT 500"],
            ["sched", "q", "Enqueue run_id=job42@14:00; set next_run_at = 15:00 (same txn)"],
            ["q", "w", "Worker receives the run (visibility timeout 5 min)"],
            ["w", "runs", "RUNNING → SUCCEEDED (dedupe on run_id)"],
            ["w", "dlq", "Failed 5× with backoff → DLQ + alert"]
          ]}
        ]
      },
      deepDives: [
        { t: "Avoiding the thundering herd at :00", p: "Many cron jobs fire on the hour. Add jitter where allowed, pre-enqueue slightly early into a delay queue, and autoscale workers before known peaks." },
        { t: "Worker failure", p: "A worker heartbeats while running. If it dies, the queue's visibility timeout expires and the message is redelivered to another worker. Because of this, jobs must be idempotent." },
        { t: "Workflow engines", p: "For multi-step jobs with dependencies (DAGs) and long-running state, use Airflow (batch DAGs) or Temporal/Step Functions (durable workflows with retries and timers per step)." }
      ],
      pitfalls: ["A single cron box (SPOF)", "Scanning the whole jobs table every tick (missing index)", "Non-idempotent jobs with at-least-once delivery", "No max retries or DLQ (poison jobs loop forever)"],
      tradeoffs: [["DB polling (simple, durable)", "Timer wheel in memory (precise, must persist)"], ["At-least-once (+idempotency)", "At-most-once (can miss runs)"]]
    },

    /* ------------------------------------------------------------------ */
    {
      id: "ad-click",
      title: "Ad Click Aggregation",
      aka: "Real-time analytics",
      category: "Data pipeline",
      level: "Hard",
      icon: "chart",
      summary: "Aggregate billions of click events into accurate per-minute metrics for billing and dashboards.",
      tags: ["stream processing", "flink", "kafka", "OLAP", "lambda", "kappa", "exactly-once", "watermarks", "dedup"],
      functional: ["Count clicks per ad per minute (and filter by country, device)", "Query the top N most-clicked ads over the last M minutes", "Correct data for billing (reconcilable)"],
      nonFunctional: ["Accuracy matters: advertisers are billed on these numbers", "Latency: aggregates within a minute or two", "Handle late and duplicate events", "Scales to 1 B+ clicks/day with spikes"],
      estimates: [["Clicks", "1 B/day → ~12 K/s avg, 50 K/s peak"], ["Raw event", "~200 B → 200 GB/day raw"], ["Aggregates", "2 M ads × 1440 min × ~50 B ≈ 150 GB/day (before rollups)"]],
      api: ["GET /v1/ads/{id}/clicks?from=…&to=…&granularity=1m&filter=country:US", "GET /v1/ads/top?window=5m&n=100"],
      dataModel: ["raw clicks: click_id · ad_id · ts · user/ip hash · country · device (Parquet on S3)", "agg: ad_id · minute · filter_key · count (ClickHouse / Druid / Pinot)"],
      choices: [
        { c: "Event transport", pick: "Kafka", why: "Durable, replayable log. Partition by ad_id so aggregation state is local. Also feeds the raw archive." },
        { c: "Aggregation", pick: "Flink (event-time windows, watermarks, exactly-once state)", why: "Tumbling 1-minute windows on event time, with late events handled by allowed lateness. Checkpointing gives exactly-once state." },
        { c: "Serving store", pick: "OLAP columnar DB (ClickHouse, Druid, Pinot)", why: "Fast group-by and filter queries over billions of rows, with real-time ingestion from Kafka." },
        { c: "Correctness", pick: "Raw archive + nightly batch recompute (reconcile)", why: "A Lambda-style safety net: batch results over the immutable raw data correct any streaming errors for billing." },
        { c: "Dedup", pick: "click_id dedup within a window (state/Bloom)", why: "Clients retry and bots double-click. Dedupe before counting." }
      ],
      diagram: {
        nodes: [
          n("users", "Ad Clicks", "browsers / apps", "client", 80, 260, "Clicks on ads across the web."),
          n("click", "Click Service", "redirect + log", "service", 250, 260, "Logs the click event and redirects to the advertiser."),
          n("kafka", "Raw Clicks", "Kafka", "queue", 430, 260, "Partitioned by ad_id, retained for days for replay."),
          n("flink", "Stream Aggregator", "Flink windows", "worker", 630, 260, "Dedup → 1-minute tumbling windows per ad (event time + watermarks).", "analytics"),
          n("dedup", "Dedup State", "RocksDB / Bloom", "cache", 630, 100, "Recently seen click_ids."),
          n("olap", "OLAP Store", "ClickHouse / Druid", "analytics", 840, 260, "Aggregates for dashboards and billing queries."),
          n("qapi", "Query API", "dashboards", "service", 840, 100, "Advertiser dashboards and top-N queries."),
          n("raw", "Raw Archive", "S3 · Parquet", "storage", 430, 440, "Immutable source of truth."),
          n("batch", "Batch Reconcile", "Spark nightly", "worker", 630, 440, "Recomputes aggregates from raw data and corrects the OLAP store for billing.")
        ],
        edges: [["users", "click"], ["click", "kafka"], ["kafka", "flink"], ["flink", "dedup"], ["flink", "olap"], ["qapi", "olap"], ["kafka", "raw"], ["raw", "batch"], ["batch", "olap"]],
        flows: [
          { name: "Streaming path", steps: [
            ["users", "click", "Click on ad 881 (click_id c-7f)"],
            ["click", "kafka", "Produce event keyed by ad_id"],
            ["kafka", "flink", "Consume; assign to the [12:00, 12:01) window by event time"],
            ["flink", "dedup", "Seen c-7f? No → count it"],
            ["flink", "olap", "Watermark passes 12:01 → emit (ad 881, 12:00, 42 clicks)"],
            ["qapi", "olap", "Dashboard: clicks per minute for the last hour"]
          ]},
          { name: "Batch reconciliation", steps: [
            ["kafka", "raw", "Connector writes hourly Parquet files"],
            ["raw", "batch", "Nightly Spark job recomputes exact counts"],
            ["batch", "olap", "Overwrite yesterday's partitions (billing-grade)"]
          ]}
        ]
      },
      deepDives: [
        { t: "Event time vs processing time", p: "Mobile clicks can arrive minutes late. Aggregate by when the click happened (event time), use watermarks to decide when a window is complete, and either update results for late data or send it to a correction path." },
        { t: "Lambda vs Kappa", b: ["Lambda: a streaming layer (fast, approximate) + a batch layer (slow, exact) merged at query time. Two codebases.", "Kappa: stream only. Reprocess by replaying Kafka from the start with the new code. Simpler, needs long retention.", "Common in practice: Kappa for serving + periodic batch reconciliation for billing"] },
        { t: "Hot ads", p: "One viral ad can overload a single partition. Pre-aggregate locally (combine per task) or salt the key (ad_id#0..N) and merge in a second stage." }
      ],
      pitfalls: ["Counting in the transactional DB with UPDATE count+1", "Processing-time windows (wrong buckets for late data)", "No dedup (retries double-bill advertisers)", "No raw archive to recompute from"],
      tradeoffs: [["Streaming (fresh)", "Batch (exact, cheap)"], ["Exactly-once state (complex)", "At-least-once + dedup (simpler)"]]
    }
  ];

  /* A generic architecture used on the home page */
  SD.homeDiagram = {
    nodes: [
      n("user", "User", "browser / app", "client", 80, 260, "Where every request starts."),
      n("dns", "DNS", "Route 53", "edge", 250, 70, "Resolves the domain to the nearest load balancer or CDN (GeoDNS).", "dns"),
      n("cdn", "CDN", "edge cache", "edge", 250, 450, "Serves static assets and media from edge locations near users.", "cdn"),
      n("lb", "Load Balancer", "L7", "edge", 250, 260, "Terminates TLS and spreads requests across healthy app servers.", "lb"),
      n("app", "App Servers", "stateless, autoscaled", "service", 440, 260, "Business logic. Stateless, so any instance can serve any request."),
      n("cache", "Cache", "Redis", "cache", 640, 110, "Hot data in memory, sub-millisecond reads."),
      n("db", "Primary DB", "Postgres", "db", 640, 260, "Source of truth. Handles writes."),
      n("rep", "Read Replicas", "async", "db", 850, 260, "Scale reads; slightly stale."),
      n("q", "Message Queue", "Kafka / SQS", "queue", 640, 420, "Moves slow work off the request path."),
      n("w", "Workers", "async jobs", "worker", 850, 420, "Emails, thumbnails, indexing, analytics."),
      n("obj", "Object Storage", "S3", "storage", 440, 450, "Files and media. Origin for the CDN."),
      n("search", "Search", "Elasticsearch", "search", 850, 110, "Full-text search index fed from the DB.")
    ],
    edges: [["user", "dns"], ["user", "lb"], ["user", "cdn"], ["cdn", "obj"], ["lb", "app"], ["app", "cache"], ["app", "db"], ["db", "rep"], ["app", "q"], ["q", "w"], ["w", "search"], ["app", "obj"]],
    flows: [
      { name: "Life of a request", steps: [
        ["user", "dns", "Resolve api.example.com → nearest region"],
        ["user", "cdn", "Static JS/CSS/images come from the closest edge"],
        ["cdn", "obj", "Edge miss → fetch from origin (then cached)"],
        ["user", "lb", "HTTPS API request"],
        ["lb", "app", "Round-robin to a healthy, stateless instance"],
        ["app", "cache", "Try the cache first (~0.5 ms)"],
        ["app", "db", "Cache miss → query the DB (~5 ms), then populate the cache"],
        ["db", "rep", "Writes replicate asynchronously to read replicas"],
        ["app", "q", "Slow work (email, thumbnails) goes to a queue"],
        ["q", "w", "Workers process it asynchronously"],
        ["w", "search", "…e.g. update the search index"],
        ["app", "user", "Respond in ~50 ms"]
      ]}
    ]
  };
})();
