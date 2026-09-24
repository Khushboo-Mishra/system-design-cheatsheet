/* Database catalogue, advisor scoring matrix and decision tree. */
window.SD = window.SD || {};
(function () {
  SD.databases = [
    {
      id: "relational", name: "Relational (SQL)", short: "RDBMS", color: "#34d399", icon: "db",
      examples: ["PostgreSQL", "MySQL", "SQL Server", "Oracle", "Aurora", "SQLite"],
      tagline: "Tables, rows, joins and ACID transactions. Choose this first unless you have a clear reason not to.",
      model: "Tables with a fixed schema; relationships via foreign keys; SQL for declarative queries and joins.",
      consistency: "Strong (ACID). Serializable / repeatable-read isolation available.",
      scaling: "Vertical first, then read replicas, then sharding (Vitess, Citus) or partitioning.",
      cap: "CP (single primary)",
      strengths: ["ACID transactions across rows and tables", "Powerful ad-hoc queries, joins and aggregations", "Mature tooling, constraints and integrity checks", "Secondary indexes of every kind (B-tree, GIN, GiST, BRIN)", "Postgres extensions: PostGIS, pgvector, JSONB, full-text"],
      weaknesses: ["Horizontal write scaling is hard (manual sharding)", "Schema migrations on huge tables need care", "Joins across shards are painful"],
      useWhen: ["Money, orders, inventory, bookings: anything needing transactions", "Relational data with many relationships and ad-hoc queries", "Early stage / unknown access patterns", "Up to a few TB and tens of thousands of writes/s on one primary"],
      avoidWhen: ["Massive write throughput (millions/s) with simple access", "Schemaless, rapidly varying data", "Petabyte-scale analytics"],
      realWorld: "Stripe (payments), Shopify (MySQL pods), GitHub (MySQL), Instagram (sharded Postgres)"
    },
    {
      id: "newsql", name: "Distributed SQL (NewSQL)", short: "NewSQL", color: "#10b981", icon: "db",
      examples: ["Google Spanner", "CockroachDB", "YugabyteDB", "TiDB", "Aurora DSQL"],
      tagline: "SQL and ACID transactions that scale horizontally and across regions.",
      model: "Relational tables; data auto-sharded into ranges replicated with Raft/Paxos.",
      consistency: "Strong: serializable or external consistency (Spanner TrueTime).",
      scaling: "Horizontal. Add nodes and ranges rebalance automatically. Multi-region.",
      cap: "CP",
      strengths: ["SQL + ACID at horizontal scale", "Multi-region with strong consistency", "Automatic sharding, rebalancing and failover"],
      weaknesses: ["Higher write latency (consensus round trips, cross-region commits)", "More expensive, operationally newer", "Some Postgres/MySQL features missing"],
      useWhen: ["Global financial or ledger systems", "You've outgrown one Postgres primary but need transactions", "Multi-region active-active with strong consistency"],
      avoidWhen: ["Small apps (single Postgres is simpler and faster)", "Ultra-low-latency writes"],
      realWorld: "Google (AdWords/F1 on Spanner), DoorDash & Netflix (CockroachDB), PingCAP users (TiDB)"
    },
    {
      id: "document", name: "Document Store", short: "Document", color: "#60a5fa", icon: "doc",
      examples: ["MongoDB", "Couchbase", "Firestore", "Amazon DocumentDB", "CouchDB"],
      tagline: "JSON-like documents with flexible schemas, queried by fields and nested attributes.",
      model: "Collections of JSON/BSON documents; nested objects and arrays; secondary indexes on fields.",
      consistency: "Tunable. MongoDB offers single-document atomicity and multi-document ACID transactions.",
      scaling: "Horizontal via sharding on a shard key; replica sets for HA.",
      cap: "CP by default (MongoDB), tunable",
      strengths: ["Flexible schema: fields vary per record", "Data read together is stored together (no joins)", "Natural mapping to application objects", "Rich queries and indexes on nested fields"],
      weaknesses: ["Joins and cross-document relationships are awkward", "Data duplication from denormalisation", "A bad shard key is hard to change"],
      useWhen: ["Product catalogs with category-specific attributes", "Content management, user profiles, event payloads", "Rapid iteration with an evolving schema", "Aggregates loaded as a whole (an order with its line items)"],
      avoidWhen: ["Highly relational data with many-to-many joins", "Complex multi-entity transactions everywhere"],
      realWorld: "eBay, Forbes, Adobe (MongoDB); many mobile apps (Firestore)"
    },
    {
      id: "keyvalue", name: "Key-Value Store", short: "Key-Value", color: "#fbbf24", icon: "key",
      examples: ["DynamoDB", "Riak", "etcd", "FoundationDB", "RocksDB (embedded)", "Aerospike"],
      tagline: "get/put by key at any scale with predictable single-digit ms latency.",
      model: "An opaque value per key; DynamoDB adds partition + sort keys and secondary indexes.",
      consistency: "Usually eventual, with optional strong reads. DynamoDB offers transactions.",
      scaling: "Horizontal, automatic partitioning by hashed key; practically unlimited.",
      cap: "AP (Dynamo-style) / tunable",
      strengths: ["Massive scale with flat, predictable latency", "Simple API, fully managed options", "TTL, streams (CDC), global tables"],
      weaknesses: ["Queries only by key (or pre-planned indexes)", "No ad-hoc queries or joins", "Access patterns must be designed up front (single-table design)"],
      useWhen: ["Session stores, shopping carts, user preferences", "URL shortener mappings, feature flags", "High-scale lookups with known access patterns", "Serverless apps needing zero-ops scaling"],
      avoidWhen: ["Ad-hoc analytics or reporting", "Complex relationships and queries that keep changing"],
      realWorld: "Amazon cart (Dynamo), Lyft, Duolingo, Snapchat (DynamoDB)"
    },
    {
      id: "inmemory", name: "In-Memory Store / Cache", short: "In-memory", color: "#f87171", icon: "bolt",
      examples: ["Redis", "Memcached", "Valkey", "Dragonfly", "Hazelcast"],
      tagline: "Sub-millisecond reads and writes with rich data structures, all held in RAM.",
      model: "Keys → strings, hashes, lists, sets, sorted sets, streams, geo, HyperLogLog, bitmaps.",
      consistency: "Single-threaded atomic ops per key; async replication (possible loss on failover).",
      scaling: "Redis Cluster hash slots (16,384) across shards; replicas for reads/HA.",
      cap: "AP-ish (async replication)",
      strengths: ["~100 K+ ops/s per node, sub-ms latency", "Data structures: sorted sets (leaderboards), streams, geo, pub/sub", "TTL expiry built in", "Atomic Lua scripts"],
      weaknesses: ["RAM is expensive, so the dataset must fit in memory", "Durability is weaker (AOF/RDB) than a DB", "Not a primary store for critical data"],
      useWhen: ["Caching DB queries and computed results", "Sessions, rate-limit counters, distributed locks", "Leaderboards, real-time counters", "Pub/sub, lightweight queues, geo lookups"],
      avoidWhen: ["As the only copy of important data", "Datasets far larger than affordable RAM"],
      realWorld: "Twitter timelines, GitHub, Stack Overflow, Snapchat caching"
    },
    {
      id: "widecolumn", name: "Wide-Column Store", short: "Wide-column", color: "#f59e0b", icon: "cols",
      examples: ["Apache Cassandra", "ScyllaDB", "HBase", "Google Bigtable", "Azure Cosmos DB (Cassandra API)"],
      tagline: "Write-optimised, partitioned rows for huge volumes of time-ordered data.",
      model: "Partition key → sorted rows by clustering key; sparse columns. Query-first table design.",
      consistency: "Tunable per query (ONE, QUORUM, ALL); eventual by default.",
      scaling: "Linear horizontal scaling, masterless ring, multi-datacenter replication.",
      cap: "AP",
      strengths: ["Enormous write throughput (LSM trees)", "No single point of failure, multi-DC", "Efficient range scans within a partition (time series, messages)"],
      weaknesses: ["No joins; limited ad-hoc queries; denormalise per query", "Read-before-write and deletes (tombstones) are costly", "Operationally complex (compaction, repair)"],
      useWhen: ["Chat messages, activity feeds, IoT sensor data", "Write-heavy event logging at petabyte scale", "Multi-region always-on writes"],
      avoidWhen: ["Transactions or joins", "Small data (overkill)", "Unknown or ad-hoc query patterns"],
      realWorld: "Discord (messages, now ScyllaDB), Netflix, Apple, Instagram (Cassandra); Google (Bigtable)"
    },
    {
      id: "graph", name: "Graph Database", short: "Graph", color: "#c084fc", icon: "graph",
      examples: ["Neo4j", "Amazon Neptune", "JanusGraph", "TigerGraph", "Dgraph", "Memgraph"],
      tagline: "Nodes and edges as first-class data, for fast multi-hop relationship traversal.",
      model: "Property graph (nodes, relationships, properties) or RDF triples; Cypher / Gremlin / SPARQL.",
      consistency: "Typically ACID on a single instance (Neo4j).",
      scaling: "Mostly vertical + read replicas; graph partitioning is inherently hard.",
      cap: "CP (typically)",
      strengths: ["Multi-hop traversals in constant time per hop (index-free adjacency)", "Expressive pattern queries (friends of friends who like X)", "A natural model for networks"],
      weaknesses: ["Harder to scale writes horizontally", "Poor for bulk aggregations and simple tabular data", "Smaller ecosystem"],
      useWhen: ["Social networks, recommendations ('people you may know')", "Fraud rings, identity resolution", "Knowledge graphs, network/IT topology, permissions graphs"],
      avoidWhen: ["Mostly simple lookups or aggregations", "When 1–2 levels of joins in SQL suffice"],
      realWorld: "LinkedIn & Facebook (custom graph stores: LIquid, TAO), eBay, NASA (Neo4j)"
    },
    {
      id: "timeseries", name: "Time-Series Database", short: "Time-series", color: "#2dd4bf", icon: "chart",
      examples: ["Prometheus", "InfluxDB", "TimescaleDB", "VictoriaMetrics", "QuestDB", "Amazon Timestream"],
      tagline: "Append-only timestamped points with compression, downsampling and retention.",
      model: "Series (metric + tags) → (timestamp, value) points in time-partitioned, compressed blocks.",
      consistency: "Usually eventual for ingest; optimised for append, not update.",
      scaling: "Sharding by series/time; long-term storage in object stores (Thanos, Mimir).",
      cap: "AP (typically)",
      strengths: ["Very high ingest rates", "10×+ compression (delta-of-delta, XOR)", "Time-window aggregations, rollups, retention policies"],
      weaknesses: ["Updates and deletes of individual points are slow", "High-cardinality tags explode memory", "Not general purpose"],
      useWhen: ["Infrastructure and application metrics", "IoT sensors, telemetry", "Financial tick data, real-time analytics dashboards"],
      avoidWhen: ["Entity data with relationships", "Data needing frequent updates"],
      realWorld: "Prometheus at almost every company; Uber (M3); Tesla, IBM (InfluxDB)"
    },
    {
      id: "search", name: "Search Engine", short: "Search", color: "#f472b6", icon: "search",
      examples: ["Elasticsearch", "OpenSearch", "Apache Solr", "Typesense", "Meilisearch", "Algolia"],
      tagline: "Inverted indexes for full-text search, relevance ranking, facets, fuzzy and geo queries.",
      model: "Documents analysed into terms → inverted index (term → doc ids); BM25 scoring, aggregations.",
      consistency: "Near-real-time (refresh ~1 s); eventual. Not a system of record.",
      scaling: "Horizontal: index split into shards, each with replicas.",
      cap: "AP-ish",
      strengths: ["Full-text search with stemming, synonyms and typo tolerance", "Relevance ranking and faceted navigation", "Log analytics (ELK), geo queries, vector (kNN) search"],
      weaknesses: ["Not a primary datastore (weaker durability and transactions)", "Resource hungry (heap, disk)", "Re-indexing needed for mapping changes"],
      useWhen: ["Product / site search, autocomplete with fuzziness", "Log search and observability", "Filtering and faceting over many attributes"],
      avoidWhen: ["As the source of truth", "Transactional updates"],
      realWorld: "Wikipedia, GitHub code search (formerly), Netflix, Uber (logs, marketplace)"
    },
    {
      id: "object", name: "Object / Blob Storage", short: "Object store", color: "#fb923c", icon: "bucket",
      examples: ["Amazon S3", "Google Cloud Storage", "Azure Blob", "MinIO", "Cloudflare R2", "HDFS"],
      tagline: "Practically unlimited, cheap, extremely durable storage for files and large blobs.",
      model: "Bucket + key → immutable object + metadata. HTTP API; multipart uploads; presigned URLs.",
      consistency: "S3 has been strongly read-after-write consistent since 2020.",
      scaling: "Effectively infinite; storage tiers (hot, infrequent, archive/Glacier).",
      cap: "Highly available and durable (11 nines)",
      strengths: ["Cheapest per GB, 11 nines durability", "Serves files directly or via CDN", "Lifecycle policies, versioning, event notifications", "Data lake foundation (Parquet + Athena/Spark)"],
      weaknesses: ["Higher latency per request (tens of ms)", "No queries within objects (except S3 Select)", "Objects are immutable (rewrite to change)"],
      useWhen: ["Images, videos, documents, user uploads", "Backups, logs archives, data lakes", "Static website hosting, ML datasets"],
      avoidWhen: ["Small, frequently updated records", "Low-latency transactional access"],
      realWorld: "Netflix, Dropbox (Magic Pocket), Airbnb, and nearly every app for media"
    },
    {
      id: "warehouse", name: "Columnar / OLAP Warehouse", short: "OLAP", color: "#22d3ee", icon: "chart",
      examples: ["Snowflake", "BigQuery", "Redshift", "ClickHouse", "Apache Druid", "Apache Pinot", "DuckDB"],
      tagline: "Column-oriented storage for fast aggregations over billions of rows.",
      model: "Columnar tables (star/snowflake schema); vectorised execution; massive parallelism.",
      consistency: "Batch or micro-batch loads; real-time OLAP (ClickHouse/Pinot/Druid) ingests streams.",
      scaling: "Horizontal; compute and storage are often separated (Snowflake, BigQuery).",
      cap: "n/a (analytical)",
      strengths: ["Scan and aggregate billions of rows in seconds", "Great compression per column", "SQL for BI and data science"],
      weaknesses: ["Poor for single-row lookups and frequent updates (OLTP)", "Ingestion latency (except real-time OLAP)", "Cost can spike with careless queries"],
      useWhen: ["Business intelligence, reporting, dashboards", "Clickstream and ad analytics", "Historical trend analysis, ML feature generation"],
      avoidWhen: ["Serving user-facing transactional reads/writes"],
      realWorld: "Uber (Pinot), Cloudflare (ClickHouse), Airbnb (Druid), almost everyone (Snowflake/BigQuery)"
    },
    {
      id: "vector", name: "Vector Database", short: "Vector", color: "#a78bfa", icon: "vector",
      examples: ["pgvector", "Pinecone", "Milvus", "Weaviate", "Qdrant", "Elasticsearch kNN", "Chroma"],
      tagline: "Approximate nearest-neighbour search over embeddings for semantic search and AI.",
      model: "Vectors (hundreds to thousands of dims) + metadata; ANN indexes (HNSW, IVF, PQ).",
      consistency: "Varies; usually eventual for index updates.",
      scaling: "Sharding + replicas; memory-heavy indexes (quantisation helps).",
      cap: "Varies",
      strengths: ["Semantic similarity search (meaning, not keywords)", "RAG for LLM applications", "Recommendations, image and audio similarity, dedup"],
      weaknesses: ["Approximate results (a recall vs speed trade-off)", "Memory hungry; index builds are costly", "Filtering + ANN combined can be tricky"],
      useWhen: ["Retrieval-augmented generation (LLM + your documents)", "'More like this' recommendations", "Image/visual search, semantic dedup"],
      avoidWhen: ["Exact keyword match (use a search engine)", "Small datasets, where pgvector in your existing Postgres is enough"],
      realWorld: "Notion AI, Shopify, Spotify (Voyager/Annoy) recommendations"
    }
  ];

  /* Requirements the user can pick in the advisor. group → used for layout. */
  SD.factors = [
    { id: "rel", group: "Data shape", label: "Structured data with relationships", hint: "Joins, foreign keys, normalised entities" },
    { id: "flex", group: "Data shape", label: "Flexible / evolving schema", hint: "JSON documents, attributes vary per record" },
    { id: "kv", group: "Data shape", label: "Simple lookups by key", hint: "get(id) / put(id) access pattern" },
    { id: "graph", group: "Data shape", label: "Deep relationship traversals", hint: "Friends-of-friends, fraud rings, recommendations" },
    { id: "ts", group: "Data shape", label: "Time-stamped metrics / events", hint: "Sensor data, monitoring, clickstreams" },
    { id: "blob", group: "Data shape", label: "Large files / media", hint: "Images, video, documents, backups" },
    { id: "text", group: "Query needs", label: "Full-text search", hint: "Relevance, fuzzy matching, facets" },
    { id: "vec", group: "Query needs", label: "Semantic / similarity search", hint: "Embeddings, RAG, 'more like this'" },
    { id: "geo", group: "Query needs", label: "Location / proximity queries", hint: "Nearby drivers, stores within 5 km" },
    { id: "olap", group: "Query needs", label: "Analytics over huge data", hint: "Aggregations over billions of rows, BI" },
    { id: "acid", group: "Consistency", label: "Strong consistency & transactions", hint: "Money, inventory, bookings: no anomalies" },
    { id: "eventual", group: "Consistency", label: "Eventual consistency is fine", hint: "Feeds, likes, views can lag by seconds" },
    { id: "readHeavy", group: "Workload", label: "Read-heavy", hint: "Reads ≫ writes (100:1)" },
    { id: "writeHeavy", group: "Workload", label: "Write-heavy / high ingest", hint: "100K+ writes/s, logs, events, pings" },
    { id: "lowLatency", group: "Workload", label: "Sub-millisecond latency", hint: "Hot path lookups, counters" },
    { id: "ttl", group: "Workload", label: "Ephemeral data with TTL", hint: "Sessions, OTPs, rate-limit counters" },
    { id: "realtime", group: "Workload", label: "Real-time counters / rankings", hint: "Leaderboards, live counts, presence" },
    { id: "massive", group: "Scale", label: "Massive scale (TB–PB, horizontal)", hint: "Beyond a single machine" },
    { id: "global", group: "Scale", label: "Multi-region, strongly consistent", hint: "Global users, no stale reads" },
    { id: "simpleOps", group: "Scale", label: "Small team / simple operations", hint: "Prefer managed, well-known tech" }
  ];

  /* Fitness 0 (poor) … 3 (excellent) of each DB family for each factor. */
  SD.scoreMatrix = {
    relational: { rel: 3, flex: 1, kv: 2, graph: 1, ts: 1, blob: 0, text: 1, vec: 1, geo: 2, olap: 1, acid: 3, eventual: 1, readHeavy: 2, writeHeavy: 1, lowLatency: 1, ttl: 0, realtime: 1, massive: 0, global: 0, simpleOps: 3 },
    newsql:     { rel: 3, flex: 1, kv: 2, graph: 0, ts: 1, blob: 0, text: 0, vec: 0, geo: 1, olap: 1, acid: 3, eventual: 1, readHeavy: 2, writeHeavy: 2, lowLatency: 0, ttl: 1, realtime: 0, massive: 2, global: 3, simpleOps: 1 },
    document:   { rel: 1, flex: 3, kv: 2, graph: 0, ts: 1, blob: 0, text: 1, vec: 1, geo: 2, olap: 0, acid: 2, eventual: 2, readHeavy: 2, writeHeavy: 2, lowLatency: 1, ttl: 2, realtime: 0, massive: 2, global: 1, simpleOps: 2 },
    keyvalue:   { rel: 0, flex: 2, kv: 3, graph: 0, ts: 1, blob: 0, text: 0, vec: 0, geo: 0, olap: 0, acid: 1, eventual: 3, readHeavy: 3, writeHeavy: 3, lowLatency: 2, ttl: 3, realtime: 1, massive: 3, global: 1, simpleOps: 3 },
    inmemory:   { rel: 0, flex: 1, kv: 3, graph: 0, ts: 1, blob: 0, text: 0, vec: 1, geo: 2, olap: 0, acid: 0, eventual: 2, readHeavy: 3, writeHeavy: 2, lowLatency: 3, ttl: 3, realtime: 3, massive: 1, global: 0, simpleOps: 2 },
    widecolumn: { rel: 0, flex: 1, kv: 2, graph: 0, ts: 3, blob: 0, text: 0, vec: 0, geo: 0, olap: 1, acid: 0, eventual: 3, readHeavy: 1, writeHeavy: 3, lowLatency: 1, ttl: 2, realtime: 1, massive: 3, global: 1, simpleOps: 0 },
    graph:      { rel: 2, flex: 1, kv: 0, graph: 3, ts: 0, blob: 0, text: 0, vec: 1, geo: 1, olap: 0, acid: 2, eventual: 1, readHeavy: 2, writeHeavy: 0, lowLatency: 1, ttl: 0, realtime: 0, massive: 0, global: 0, simpleOps: 1 },
    timeseries: { rel: 0, flex: 1, kv: 0, graph: 0, ts: 3, blob: 0, text: 0, vec: 0, geo: 0, olap: 2, acid: 0, eventual: 2, readHeavy: 1, writeHeavy: 3, lowLatency: 1, ttl: 3, realtime: 1, massive: 2, global: 0, simpleOps: 2 },
    search:     { rel: 0, flex: 2, kv: 1, graph: 0, ts: 1, blob: 0, text: 3, vec: 2, geo: 2, olap: 1, acid: 0, eventual: 3, readHeavy: 2, writeHeavy: 1, lowLatency: 1, ttl: 0, realtime: 0, massive: 2, global: 0, simpleOps: 1 },
    object:     { rel: 0, flex: 1, kv: 1, graph: 0, ts: 0, blob: 3, text: 0, vec: 0, geo: 0, olap: 1, acid: 0, eventual: 2, readHeavy: 2, writeHeavy: 1, lowLatency: 0, ttl: 1, realtime: 0, massive: 3, global: 1, simpleOps: 3 },
    warehouse:  { rel: 2, flex: 1, kv: 0, graph: 0, ts: 2, blob: 0, text: 1, vec: 0, geo: 1, olap: 3, acid: 1, eventual: 2, readHeavy: 1, writeHeavy: 1, lowLatency: 0, ttl: 0, realtime: 1, massive: 3, global: 0, simpleOps: 2 },
    vector:     { rel: 0, flex: 1, kv: 1, graph: 0, ts: 0, blob: 0, text: 1, vec: 3, geo: 0, olap: 0, acid: 0, eventual: 2, readHeavy: 2, writeHeavy: 1, lowLatency: 1, ttl: 0, realtime: 0, massive: 1, global: 0, simpleOps: 1 }
  };

  /* Preset requirement bundles for one-click scenarios in the advisor */
  SD.advisorPresets = [
    { name: "Banking / payments", f: ["rel", "acid", "readHeavy", "simpleOps"] },
    { name: "Social feed", f: ["kv", "eventual", "readHeavy", "massive", "blob", "lowLatency"] },
    { name: "Chat messages", f: ["ts", "writeHeavy", "eventual", "massive", "realtime"] },
    { name: "E-commerce catalog", f: ["flex", "text", "readHeavy", "blob"] },
    { name: "IoT telemetry", f: ["ts", "writeHeavy", "olap", "ttl"] },
    { name: "Ride hailing", f: ["geo", "writeHeavy", "lowLatency", "ttl", "acid"] },
    { name: "AI chatbot / RAG", f: ["vec", "text", "flex", "simpleOps"] },
    { name: "Fraud detection", f: ["graph", "realtime", "olap"] },
    { name: "Gaming leaderboard", f: ["realtime", "lowLatency", "kv", "writeHeavy"] },
    { name: "Global SaaS (strong)", f: ["rel", "acid", "global", "massive"] },
    { name: "Analytics dashboard", f: ["olap", "ts", "massive", "readHeavy"] },
    { name: "Session store", f: ["kv", "ttl", "lowLatency", "readHeavy"] }
  ];

  /* Decision tree: q nodes have options → next; leaf nodes recommend. */
  SD.dbTree = {
    start: { q: "What are you primarily storing?", opts: [
      ["Files, images, video, backups", "leafObject"],
      ["Business entities (users, orders, accounts)", "structured"],
      ["Semi-structured JSON with varying fields", "semi"],
      ["Highly connected data (who knows whom)", "leafGraph"],
      ["Metrics, events or logs over time", "timeq"],
      ["Text that users search", "leafSearch"],
      ["Embeddings for AI / similarity", "leafVector"],
      ["Historical data for reports and BI", "leafWarehouse"],
      ["Temporary / hot data (cache, sessions)", "leafMemory"]
    ]},
    structured: { q: "Do you need multi-row ACID transactions (money, stock, bookings)?", opts: [["Yes: correctness is critical", "acidScale"], ["No: simple reads/writes by key are enough", "access"]] },
    acidScale: { q: "Will it fit on one primary (with replicas)? Roughly < 5–10 TB and < ~20–50K writes/s", opts: [["Yes, or I'm not sure yet", "leafRelational"], ["No, I need horizontal write scaling", "global"]] },
    global: { q: "Do you need strongly consistent data across multiple regions?", opts: [["Yes: global users, no stale reads", "leafNewSQL"], ["No: one region is fine", "leafShardedSQL"]] },
    access: { q: "What does the dominant access pattern look like?", opts: [["Lookup by key at huge scale", "leafKV"], ["Write-heavy, time-ordered rows per entity (messages, events)", "leafWide"], ["Flexible queries on various fields", "leafDocument"], ["Sub-ms reads of hot data", "leafMemory"]] },
    semi: { q: "How do you query it?", opts: [["By many fields, nested attributes, with secondary indexes", "leafDocument"], ["Only by its id", "leafKV"], ["Full-text search across fields", "leafSearch"]] },
    timeq: { q: "What do you do with it?", opts: [["Monitor metrics with retention and downsampling", "leafTS"], ["Search and grep raw logs", "leafSearch"], ["Slice and aggregate billions of events (analytics)", "leafWarehouse"], ["Store the raw event stream durably at massive scale", "leafWide"]] },
    leafRelational: { db: "relational", note: "Start with PostgreSQL (or MySQL). Add read replicas and a cache before thinking about sharding. Postgres also covers JSONB, full-text, PostGIS and pgvector for many 'secondary' needs." },
    leafShardedSQL: { db: "relational", note: "Shard a relational DB by tenant or user id with Vitess (MySQL) or Citus (Postgres), or move to a distributed SQL database (CockroachDB, TiDB, Yugabyte) to get sharding automatically." },
    leafNewSQL: { db: "newsql", note: "Spanner, CockroachDB or YugabyteDB give serializable transactions across regions. Expect higher write latency (consensus across regions)." },
    leafKV: { db: "keyvalue", note: "DynamoDB (managed) or a Cassandra-style store. Design keys around the access patterns (partition key + sort key) and add a cache for hot keys." },
    leafWide: { db: "widecolumn", note: "Cassandra / ScyllaDB / Bigtable. Model one table per query, partition by entity (for example conversation_id) and cluster by time." },
    leafDocument: { db: "document", note: "MongoDB / Firestore / Couchbase. Choose a shard key with high cardinality and even access. Embed data read together." },
    leafMemory: { db: "inmemory", note: "Redis / Memcached as a cache or ephemeral store, with TTLs. Keep a durable system of record elsewhere." },
    leafGraph: { db: "graph", note: "Neo4j / Neptune for multi-hop traversals. If you only need 1–2 hops, a relational table of edges with indexes is often enough." },
    leafTS: { db: "timeseries", note: "Prometheus (+Thanos/Mimir), InfluxDB, TimescaleDB or VictoriaMetrics. Plan retention, rollups and tag cardinality." },
    leafSearch: { db: "search", note: "Elasticsearch / OpenSearch, fed asynchronously from your primary DB via CDC or Kafka. Never make it the source of truth." },
    leafVector: { db: "vector", note: "Start with pgvector if you already run Postgres. Move to Pinecone, Milvus, Qdrant or Weaviate at larger scale or for advanced filtering." },
    leafWarehouse: { db: "warehouse", note: "Snowflake / BigQuery / Redshift for BI; ClickHouse / Pinot / Druid for real-time, user-facing analytics. Load via ETL/ELT or streams." },
    leafObject: { db: "object", note: "S3 / GCS / Azure Blob for the bytes, a database for the metadata (owner, name, size, key), and a CDN in front for delivery. Upload with presigned URLs." }
  };

  /* Quick comparison rows for the table */
  SD.sqlVsNoSql = [
    ["Data model", "Tables with a fixed schema", "Documents, key-value, wide-column, graph"],
    ["Schema", "Defined up front, migrations", "Flexible, schema-on-read"],
    ["Transactions", "ACID, multi-row, multi-table", "Often single-item atomicity; some support ACID"],
    ["Queries", "Rich SQL, joins, ad-hoc", "Access-pattern driven, limited joins"],
    ["Scaling", "Vertical + replicas; sharding is manual", "Horizontal by design"],
    ["Consistency", "Strong by default", "Often eventual / tunable"],
    ["Best for", "Relational data, correctness, unknown queries", "Massive scale, known access patterns, flexible data"]
  ];

  /* Storage engine comparison */
  SD.engines = [
    ["B-Tree", "Postgres, MySQL InnoDB, most RDBMS", "Update in place in fixed-size pages; WAL for durability", "Fast reads and range scans; predictable", "Random writes, write amplification on updates"],
    ["LSM Tree", "Cassandra, RocksDB, ScyllaDB, HBase, LevelDB", "Memtable → flush to sorted immutable SSTables → compaction", "Very high write throughput, good compression", "Reads may check several files (Bloom filters help); compaction overhead"],
    ["Column store", "ClickHouse, Parquet, Redshift, BigQuery", "Each column stored contiguously and compressed", "Scans and aggregates few columns over many rows", "Single-row inserts/updates, point lookups"],
    ["Hash index / in-memory", "Redis, Memcached, Bitcask", "Hash table in RAM (+ append-only log)", "O(1) point lookups, sub-ms", "No range queries; RAM-bound"],
    ["Inverted index", "Elasticsearch, Lucene, Solr", "term → posting list of documents", "Full-text search, relevance", "Write/refresh cost, not a primary store"]
  ];
})();
