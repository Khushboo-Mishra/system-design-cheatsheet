/* Topics from the System Design Primer (donnemartin/system-design-primer) that weren't already covered:
 * extra concepts, object-oriented design, additional scenarios, the primer → site map, and classic papers.
 * All text is original, written for this cheat sheet. */
window.SD = window.SD || {};
(function () {
  const n = (id, label, sub, type, x, y, desc, icon) => ({ id, label, sub, type, x, y, desc, icon });
  const C = (id) => SD.concepts.find((c) => c.id === id);
  const S = (id) => SD.scenarios.find((s) => s.id === id);

  /* ------------------------------- patches ------------------------------- */
  C("dns").points.push("Routing policies: weighted round robin (shift traffic gradually, e.g. canaries or maintenance), latency-based (the lowest-latency region), geolocation (by user location), and failover with health checks.", "Downsides: a small added latency on lookups (mitigated by caching), DNS management is complex, and DNS providers are a DDoS target.");
  C("proxy-gateway").points.push("Load balancer vs reverse proxy: an LB is useful once you have several servers of the same function; a reverse proxy is useful even in front of a single server (TLS, compression, caching, hiding topology). Nginx and HAProxy do both.", "Cons: more complexity, and a single point of failure unless it's deployed redundantly (active-passive or active-active).");
  C("microservices").points.push("Separating the web layer (serves HTTP, templates, static files) from the application layer (business logic, APIs, workers) lets each scale and deploy independently, and lets workers run asynchronous jobs.");
  C("ha-dr").points.push("Fail-over patterns: active-passive (heartbeats between an active node and a hot or cold standby that takes over its IP; the downtime depends on standby warmth) and active-active (all nodes serve and the load is spread; clients or DNS must know all of them).", "Fail-over adds hardware and complexity, and data can be lost if the active node dies before replicating new writes.");
  C("multi-region").points.push("Serving from multiple data centres: GeoDNS/anycast for routing, per-region caches and read replicas, and a write strategy (a home region per user, multi-leader with conflict resolution, or global consensus). Plan for region evacuation.");
  C("caching").points.push("Refresh-ahead: the cache proactively reloads hot entries shortly before they expire. Reads stay fast if the predictions are right; wasted work if they're wrong.");
  C("api-styles").points.push("RPC exposes behaviours (verbs: createUser, chargeCard). It's tightly coupled and fast, great for internal calls. REST exposes resources (nouns: /users/42) with uniform verbs, is stateless and cacheable, and suits public APIs. REST can be chatty for complex operations; RPC endpoints proliferate and are harder to debug with standard HTTP tooling.");
  S("url-shortener").aka = "TinyURL · bit.ly · Pastebin";
  S("url-shortener").deepDives.push({ t: "Pastebin variant", b: ["Same key-generation and redirect design, but pastes are larger blobs: store the content in object storage (S3) and keep only metadata (key, s3 path, expiry, size) in the DB", "Serve popular pastes via a CDN; set Cache-Control from the expiry", "Analytics (hits per paste) via log aggregation, not per-request DB writes", "A cleanup job deletes expired pastes and their objects"] });
  S("news-feed").aka = "Twitter · Facebook timeline · Instagram";
  S("news-feed").deepDives.push({ t: "Search (Twitter search)", b: ["Each new post is tokenised and sent through the pipeline to a search cluster (Lucene/Earlybird-style inverted index), partitioned by time and hashed by post ID", "Queries fan out to all relevant shards, then results are merged, ranked (recency + engagement) and paginated", "Keep recent posts in memory-heavy real-time indexes; archive older ones to cheaper tiers"] },
    { t: "User timeline vs home timeline", p: "A user timeline (someone's own posts) is a simple query on the posts store by author_id + time, cached per user. The home timeline (posts from everyone you follow) is where fan-out and ranking happen." });
  S("chat").aka = "WhatsApp · Messenger · Facebook chat · Slack";

  /* -------------------------------- concepts ------------------------------- */
  const add = (c) => SD.concepts.push(c);
  add({ id: "performance-vs-scalability", cat: "Fundamentals", title: "Performance vs Scalability",
    summary: "A performance problem makes the system slow for a single user. A scalability problem means it's fast for one user but slow under heavy load.",
    points: ["A service is scalable if adding resources increases capacity roughly proportionally.", "Adding resources usually aims at handling more load, but it can also improve redundancy or data volume. Scalability should cover all of these.", "Designs that don't scale hide shared bottlenecks: a single DB primary, global locks, synchronous fan-out, or a centralised counter.", "Measure both: single-request latency profiles (performance) and throughput and latency curves as load increases (scalability)."],
    use: ["Framing capacity discussions; choosing what to optimise first"], pitfalls: ["Optimising single-request speed when the bottleneck is contention under load"] });
  add({ id: "federation", cat: "Data & Storage", title: "Federation (Functional Partitioning)",
    summary: "Split databases by function (users, products, forums) instead of one monolithic database. Less traffic per DB, more cache hits, and writes in parallel.",
    points: ["Each functional database is smaller, so more of its working set fits in memory (better cache locality).", "There's no single primary serialising all writes, so writes to different domains proceed in parallel. Replication lag drops too.", "The application must know which DB to use for what (a routing layer).", "Joins across federated databases become application-side, and cross-database transactions become sagas.", "It's often the step before microservices-with-own-DB, and before sharding a single hot domain."],
    use: ["Monolith DB is overloaded, but the domains are separable"], pitfalls: ["Frequent cross-domain joins", "More hardware and operational overhead"] });
  add({ id: "sql-tuning", cat: "Data & Storage", title: "SQL Tuning",
    summary: "Before adding infrastructure, make the database do less work: better schema, indexes, queries and configuration. Benchmark and profile first.",
    points: ["Benchmark (simulate load, e.g. with pgbench or ab) and profile (the slow query log, EXPLAIN ANALYZE) to find the real bottleneck.", "Tighten the schema: fixed-width types where appropriate, sensible sizes, NOT NULL where possible, and large blobs moved to object storage (store the path).", "Index the columns used in WHERE, JOIN, ORDER BY and GROUP BY, but remember every index slows writes.", "Avoid expensive joins on hot paths: denormalise, precompute, or cache.", "Partition big tables (by time or key) and archive cold rows. Keep hot tables small.", "Tune the configuration: buffer pool / shared_buffers sized to the working set, connection pooling (PgBouncer), avoid N+1 query patterns in ORMs."],
    use: ["First response to DB slowness"], pitfalls: ["Adding replicas or caching to hide a missing index", "SELECT * over wide rows"] });
  add({ id: "cache-layers", cat: "Caching", title: "Where to Cache: Client → CDN → Web → App → DB",
    summary: "Caching can happen at every layer between the user and the disk. Know what each layer caches and how it's invalidated.",
    points: ["Client caching: the browser or app cache, HTTP Cache-Control/ETag, local storage, OS DNS cache.", "CDN caching: static assets, media and cacheable API responses at the edge.", "Web server caching: reverse proxies (Varnish, Nginx) cache whole responses, without touching app servers.", "Application caching: in-memory stores (Memcached, Redis) between the app and the DB, plus in-process caches for very hot keys.", "Database caching: the DB's own buffer pool / page cache (and query caches, largely removed from modern MySQL).", "Query-level caching: hash the query and cache the result. Invalidation is hard (any change to any table involved), and it's brittle for complex queries.", "Object-level caching: cache assembled objects or aggregates (a user profile, a rendered feed item). Easier to invalidate when the underlying data changes, and it enables async population. Usually preferred."],
    use: ["Designing a multi-tier caching strategy with the right TTLs per tier"], pitfalls: ["Caching the same data at five layers with different TTLs and no invalidation plan"] });
  add({ id: "task-queues", cat: "Messaging & Streaming", title: "Task Queues & Background Jobs",
    summary: "Task queues accept jobs with their data, run them on workers asynchronously and return results, often with scheduling, retries and priorities.",
    points: ["Message queue vs task queue: a message queue moves messages, while a task queue executes computations (Celery, Sidekiq, RQ, BullMQ, Temporal activities).", "Pattern: the request enqueues a job and returns 202 + job ID immediately. Workers process it; clients poll or are notified (webhook, WebSocket).", "Features: retries with backoff, dead-letter queues, delayed and scheduled (cron-like) jobs, priorities, rate limits, result backends.", "Jobs must be idempotent (at-least-once delivery) and should carry IDs, not whole payloads, when the data may change.", "Scale workers on queue depth; separate queues per workload so slow jobs don't starve fast ones."],
    use: ["Emails, image/video processing, report generation, webhooks, ML inference batches"], pitfalls: ["Running long jobs inside web requests", "One queue for everything"] });
  add({ id: "network-protocols", cat: "Networking & Traffic", title: "HTTP, TCP & UDP",
    summary: "Know what the transport gives you: TCP trades latency for reliability, UDP trades reliability for latency, and HTTP layers request/response semantics on top.",
    points: ["HTTP: a request/response protocol with verbs (GET, POST, PUT, PATCH, DELETE), status codes, headers and caching semantics. Idempotent verbs: GET, PUT, DELETE. HTTP/2 multiplexes streams over one connection; HTTP/3 runs over QUIC (UDP) to avoid TCP head-of-line blocking.", "TCP: connection-oriented (a 3-way handshake), with ordered, reliable delivery (sequence numbers, acks, retransmits), flow control and congestion control. Higher latency and per-connection memory, so pool connections.", "UDP: connectionless datagrams. No ordering or delivery guarantee, but low overhead and latency, and it supports broadcast and multicast. Used for DNS, VoIP, video calls, real-time games and QUIC.", "Choose TCP when all data must arrive intact (web, DB, file transfer); UDP when late data is worse than lost data.", "TLS adds handshake round trips (TLS 1.3: 1-RTT, 0-RTT resumption). Terminate it at the edge or load balancer."],
    use: ["Picking protocols for real-time features, understanding latency budgets"], pitfalls: ["Opening a new TCP+TLS connection per request", "Building your own reliability on UDP when TCP/QUIC would do"],
    table: [["", "TCP", "UDP"], ["Connection", "Yes (handshake)", "No"], ["Delivery", "Guaranteed, ordered", "Best effort, unordered"], ["Overhead", "Higher", "Minimal"], ["Flow/congestion control", "Yes", "No"], ["Typical uses", "HTTP/1–2, DBs, SSH", "DNS, VoIP, games, QUIC"]] });
  add({ id: "garbage-collection", cat: "Algorithms & Structures", title: "Garbage Collection (Runtime & Distributed)",
    summary: "Reclaiming memory or storage that's no longer referenced, from a language runtime's heap to blobs in a distributed store.",
    points: ["Reference counting: free an object when its count hits zero. Immediate and simple, but it can't collect cycles on its own and adds per-write overhead.", "Tracing (mark-and-sweep): mark everything reachable from the roots, then sweep the rest. Mark-compact also defragments; copying collectors move live objects into a fresh space.", "Generational GC: most objects die young, so collect the young generation often and cheaply, and the old generation rarely.", "Concurrent / incremental collectors (G1, ZGC, Shenandoah, Go's GC) shrink stop-the-world pauses, which matters because GC pauses break leases and timeouts in distributed systems.", "Distributed or storage GC: content-addressed blobs (Dropbox chunks, Git objects, container layers) use reference counts or a periodic mark phase over the metadata, then delete unreferenced blobs after a grace period (to avoid racing with in-flight writes). Tombstones and compaction in LSM stores are another form of GC.", "Design interviews: define the roots, the marking strategy, concurrency with mutators (write barriers), the pause budget, and safety (never delete something still reachable)."],
    use: ["Runtime tuning for latency-sensitive services, blob-store cleanup"], pitfalls: ["Deleting blobs without a grace period (races with new references)", "Ignoring GC pauses when setting timeouts"] });

  /* ------------------------ Object-oriented design ------------------------ */
  add({ id: "ood-hash-map", cat: "Object-Oriented Design", anim: "hashmap", title: "OOD: Design a Hash Map",
    summary: "An array of buckets indexed by hash(key) mod capacity, with collision handling and resizing to keep operations O(1) on average.",
    points: ["API: put(key, value), get(key), remove(key). Keys need hash() and equals().", "Collisions: separate chaining (a linked list or tree per bucket, as in Java 8+) or open addressing (linear or quadratic probing, Robin Hood hashing).", "Load factor = size / capacity. When it exceeds ~0.75, double the capacity and rehash every entry (amortised O(1) inserts).", "Worst case O(n) if everything collides. Mitigate with good hash functions, randomised seeds (against hash-flooding DoS) and treeified buckets.", "Thread safety: a global lock, lock striping (segments), or lock-free designs (ConcurrentHashMap)."],
    use: ["Interview warm-up; the basis of caches, indexes and symbol tables"], pitfalls: ["Mutable keys whose hash changes after insertion", "Forgetting to handle resize during iteration"],
    code: `class Entry:
    def __init__(self, key, value):
        self.key, self.value, self.next = key, value, None

class HashMap:
    def __init__(self, capacity=8, load_factor=0.75):
        self.buckets = [None] * capacity
        self.size, self.load_factor = 0, load_factor

    def _index(self, key):
        return hash(key) % len(self.buckets)

    def get(self, key):
        node = self.buckets[self._index(key)]
        while node:
            if node.key == key:
                return node.value
            node = node.next
        raise KeyError(key)

    def put(self, key, value):
        i = self._index(key)
        node = self.buckets[i]
        while node:
            if node.key == key:
                node.value = value          # overwrite
                return
            node = node.next
        new = Entry(key, value)
        new.next, self.buckets[i] = self.buckets[i], new   # prepend to chain
        self.size += 1
        if self.size / len(self.buckets) > self.load_factor:
            self._resize(2 * len(self.buckets))

    def _resize(self, capacity):
        old, self.buckets, self.size = self.buckets, [None] * capacity, 0
        for head in old:
            while head:
                self.put(head.key, head.value)
                head = head.next` });
  add({ id: "ood-lru-cache", cat: "Object-Oriented Design", anim: "lru", title: "OOD: Design an LRU Cache",
    summary: "A hash map for O(1) lookup plus a doubly linked list for O(1) recency updates and eviction of the least recently used entry.",
    points: ["get(key): look it up in the map, move the node to the head (most recent), return the value.", "put(key, value): update and move to the head, or insert at the head. If over capacity, remove the tail node and delete its key from the map.", "Sentinel head and tail nodes remove edge cases.", "Thread safety: a single lock (simple), or sharded LRUs for concurrency. Approximate LRU (sampling, as Redis does; CLOCK) saves memory.", "Variants: LFU, TTL-based expiry, W-TinyLFU. Distributed version: see the Distributed Cache scenario."],
    use: ["A classic interview question; the core of Memcached/Redis eviction"], pitfalls: ["Singly linked list (O(n) removal)", "Forgetting to delete the evicted key from the map"],
    code: `class Node:
    def __init__(self, key=None, value=None):
        self.key, self.value, self.prev, self.next = key, value, None, None

class LRUCache:
    def __init__(self, capacity):
        self.capacity, self.map = capacity, {}
        self.head, self.tail = Node(), Node()      # sentinels
        self.head.next, self.tail.prev = self.tail, self.head

    def _unlink(self, node):
        node.prev.next, node.next.prev = node.next, node.prev

    def _push_front(self, node):
        node.prev, node.next = self.head, self.head.next
        self.head.next.prev = node
        self.head.next = node

    def get(self, key):
        node = self.map.get(key)
        if not node:
            return None
        self._unlink(node); self._push_front(node)
        return node.value

    def put(self, key, value):
        if key in self.map:
            node = self.map[key]; node.value = value
            self._unlink(node); self._push_front(node)
            return
        if len(self.map) == self.capacity:
            lru = self.tail.prev
            self._unlink(lru); del self.map[lru.key]
        node = Node(key, value)
        self.map[key] = node; self._push_front(node)` });
  add({ id: "ood-call-center", cat: "Object-Oriented Design", title: "OOD: Design a Call Center",
    summary: "Route incoming calls to the first available employee at the lowest level that can handle them, escalating to higher levels.",
    points: ["Actors: Employee (abstract) → Operator, Supervisor, Director, each with a rank. Call has a caller, a required rank and a state. CallCenter owns the queues and the dispatcher.", "Dispatch: try free operators first; if none are free (or the call needs escalation), try supervisors, then directors. Otherwise queue the call.", "When an employee finishes, they pull the next queued call they're allowed to handle.", "Extensions: skill-based routing, priorities/VIP callers, wait-time SLAs, metrics per employee. Thread safety around the queues.", "OOD principles: polymorphism (escalate() behaviour per rank), single responsibility (Dispatcher vs Employee), open/closed (add new ranks without changing the dispatcher)."],
    use: ["OOD interviews; the same pattern applies to support ticket routing"], pitfalls: ["God-class dispatcher with rank if/else chains"],
    code: `from enum import IntEnum
from collections import deque

class Rank(IntEnum):
    OPERATOR = 0; SUPERVISOR = 1; DIRECTOR = 2

class Call:
    def __init__(self, caller):
        self.caller, self.rank, self.state = caller, Rank.OPERATOR, "READY"

class Employee:
    def __init__(self, name, rank, center):
        self.name, self.rank, self.center, self.call = name, rank, center, None
    def take(self, call):
        self.call, call.state = call, "IN_PROGRESS"
    def escalate(self):
        call, self.call = self.call, None
        call.rank = Rank(min(call.rank + 1, Rank.DIRECTOR))
        self.center.dispatch(call)
    def finish(self):
        self.call = None
        self.center.on_free(self)

class CallCenter:
    def __init__(self):
        self.staff = {r: [] for r in Rank}
        self.queues = {r: deque() for r in Rank}
    def dispatch(self, call):
        for rank in Rank:
            if rank < call.rank:
                continue
            free = next((e for e in self.staff[rank] if e.call is None), None)
            if free:
                return free.take(call)
        self.queues[call.rank].append(call)          # nobody free: wait
    def on_free(self, emp):
        for rank in range(emp.rank, -1, -1):          # may handle lower ranks too
            if self.queues[Rank(rank)]:
                return emp.take(self.queues[Rank(rank)].popleft())` });
  add({ id: "ood-deck-of-cards", cat: "Object-Oriented Design", title: "OOD: Design a Deck of Cards",
    summary: "A generic deck and card model that specific games (Blackjack, Poker) extend with their own scoring rules.",
    points: ["Card: suit and value, plus availability (dealt or not). Suit is an enum.", "Deck: a list of cards, shuffle() (Fisher-Yates), deal_card(), and remaining().", "Hand: the cards held, and score(), which specific games override.", "Game-specific subclasses: BlackjackCard.value (face cards = 10), BlackjackHand.score() (Ace = 1 or 11, choose the best score ≤ 21).", "Design points: generics or abstract classes to reuse Deck across games; keep randomness injectable for tests."],
    use: ["OOD interview: inheritance vs composition, enums, polymorphism"], pitfalls: ["Hard-coding one game's rules into Card"],
    code: `import random
from enum import Enum

class Suit(Enum):
    CLUBS = 0; DIAMONDS = 1; HEARTS = 2; SPADES = 3

class Card:
    def __init__(self, value, suit):        # value 1 (Ace) … 13 (King)
        self.value, self.suit, self.available = value, suit, True

class Deck:
    def __init__(self, card_cls=Card, rng=random):
        self.cards = [card_cls(v, s) for s in Suit for v in range(1, 14)]
        self.rng, self.next_i = rng, 0
    def shuffle(self):
        self.rng.shuffle(self.cards); self.next_i = 0     # Fisher-Yates
    def deal(self):
        card = self.cards[self.next_i]; self.next_i += 1
        card.available = False
        return card

class Hand:
    def __init__(self):
        self.cards = []
    def add(self, card):
        self.cards.append(card)
    def score(self):
        return sum(c.value for c in self.cards)

class BlackjackHand(Hand):
    def score(self):
        total = sum(min(c.value, 10) for c in self.cards)
        aces = sum(1 for c in self.cards if c.value == 1)
        while aces and total + 10 <= 21:    # count an Ace as 11 when it helps
            total += 10; aces -= 1
        return total` });
  add({ id: "ood-parking-lot", cat: "Object-Oriented Design", title: "OOD: Design a Parking Lot",
    summary: "Model levels, spots of different sizes and vehicles of different sizes, and assign each vehicle the right spot(s).",
    points: ["Clarify: multiple levels? spot sizes (motorcycle, compact, large)? A bus takes 5 consecutive large spots? Payments and tickets?", "VehicleSize enum; Vehicle (abstract) → Motorcycle, Car, Bus, with required size and number of spots.", "ParkingSpot has a size, a level, a row and the current vehicle; can_fit(vehicle) checks size.", "Level keeps its spots (and free counts per size for O(1) availability); ParkingLot iterates over levels to find a spot.", "Extensions: tickets and fees (strategy pattern for pricing), entry/exit gates, a real-time availability display, concurrency when two cars grab the same spot."],
    use: ["OOD interview classic"], pitfalls: ["Scanning every spot on every park (keep free lists per size)"],
    code: `from enum import IntEnum

class Size(IntEnum):
    MOTORCYCLE = 0; COMPACT = 1; LARGE = 2

class Vehicle:
    size, spots_needed = Size.COMPACT, 1
    def __init__(self, plate):
        self.plate, self.spots = plate, []

class Motorcycle(Vehicle): size = Size.MOTORCYCLE
class Car(Vehicle): size = Size.COMPACT
class Bus(Vehicle): size, spots_needed = Size.LARGE, 5

class Spot:
    def __init__(self, level, row, number, size):
        self.level, self.row, self.number, self.size = level, row, number, size
        self.vehicle = None
    def fits(self, v):
        return self.vehicle is None and v.size <= self.size

class Level:
    def __init__(self, floor, spots):
        self.floor, self.spots = floor, spots
    def park(self, v):
        run = []                                   # consecutive fitting spots
        for spot in self.spots:
            run = run + [spot] if spot.fits(v) and (not run or run[-1].row == spot.row) else ([spot] if spot.fits(v) else [])
            if len(run) == v.spots_needed:
                for s in run: s.vehicle = v
                v.spots = run
                return True
        return False

class ParkingLot:
    def __init__(self, levels):
        self.levels = levels
    def park(self, v):
        return any(level.park(v) for level in self.levels)
    def leave(self, v):
        for s in v.spots: s.vehicle = None
        v.spots = []` });
  add({ id: "ood-chat-server", cat: "Object-Oriented Design", title: "OOD: Design a Chat Server",
    summary: "The object model behind a chat system: users, contacts and requests, private and group chats, and messages. See the Chat scenario for the distributed design.",
    points: ["Clarify the scope: 1:1 and group chats, friend requests, online status, message history. Leave out delivery infrastructure (covered in the Chat scenario).", "UserService manages users, friend requests (send, approve, reject) and presence.", "User has an id, name, friends, and pending sent and received requests. It can message a friend or a group.", "Chat (abstract) holds participants and messages. PrivateChat has exactly 2 users; GroupChat can add and remove users.", "Message has an id, sender, timestamp and content. AddRequest has a from, a to, a status and a timestamp.", "At scale, a chat's message list lives in storage (Cassandra) and is paginated; the object model stays the same."],
    use: ["OOD interview; bridges to the distributed chat design"], pitfalls: ["Storing unbounded message lists in memory objects"],
    code: `from enum import Enum
from datetime import datetime

class RequestStatus(Enum):
    UNREAD = 0; READ = 1; ACCEPTED = 2; REJECTED = 3

class Message:
    def __init__(self, msg_id, sender, text):
        self.id, self.sender, self.text, self.ts = msg_id, sender, text, datetime.utcnow()

class Chat:
    def __init__(self, chat_id):
        self.id, self.users, self.messages = chat_id, [], []
    def post(self, message):
        self.messages.append(message)

class PrivateChat(Chat):
    def __init__(self, chat_id, a, b):
        super().__init__(chat_id); self.users = [a, b]

class GroupChat(Chat):
    def add_user(self, user): self.users.append(user)
    def remove_user(self, user): self.users.remove(user)

class AddRequest:
    def __init__(self, sender, receiver):
        self.sender, self.receiver = sender, receiver
        self.status, self.ts = RequestStatus.UNREAD, datetime.utcnow()

class User:
    def __init__(self, user_id, name):
        self.id, self.name = user_id, name
        self.friends, self.chats, self.received = {}, {}, {}

class UserService:
    def __init__(self):
        self.users = {}
    def send_request(self, sender, receiver):
        receiver.received[sender.id] = AddRequest(sender, receiver)
    def approve(self, receiver, sender_id):
        req = receiver.received.pop(sender_id)
        req.status = RequestStatus.ACCEPTED
        receiver.friends[sender_id] = req.sender
        req.sender.friends[receiver.id] = receiver` });
  add({ id: "ood-circular-array", cat: "Object-Oriented Design", title: "OOD: Design a Circular Array (Ring Buffer)",
    summary: "A fixed-size array with head and size indices that wrap around. O(1) rotation, enqueue and dequeue, and the backbone of many queues and buffers.",
    points: ["Store a head index and a size; element i lives at (head + i) mod capacity.", "Rotate by k is O(1): head = (head + k) mod capacity, with no copying.", "As a queue (ring buffer): enqueue at (head + size) mod capacity, dequeue at head. Full when size == capacity: overwrite the oldest (logs, metrics) or reject (backpressure).", "Make it iterable, and fail fast on concurrent modification.", "Used in: bounded queues, audio/network buffers, Disruptor (LMAX), Kafka-style log segments conceptually, and sliding-window rate limiters."],
    use: ["Bounded buffers, sliding windows, producer/consumer queues"], pitfalls: ["Off-by-one when distinguishing full vs empty (track size, or waste one slot)"],
    code: `class CircularArray:
    def __init__(self, capacity):
        self.items = [None] * capacity
        self.head, self.size = 0, 0

    def _idx(self, i):
        if not 0 <= i < self.size:
            raise IndexError(i)
        return (self.head + i) % len(self.items)

    def __getitem__(self, i):
        return self.items[self._idx(i)]

    def rotate(self, k):                    # O(1): just move the head
        if self.size:
            self.head = (self.head + k) % len(self.items)

    def push(self, x, overwrite=True):      # ring-buffer enqueue
        cap = len(self.items)
        if self.size == cap:
            if not overwrite:
                raise OverflowError("full")
            self.items[self.head] = x       # overwrite the oldest element
            self.head = (self.head + 1) % cap
            return
        self.items[(self.head + self.size) % cap] = x
        self.size += 1

    def pop(self):                          # dequeue the oldest element
        x = self.items[self.head]
        self.head = (self.head + 1) % len(self.items); self.size -= 1
        return x

    def __iter__(self):
        return (self[i] for i in range(self.size))` });

  /* ------------------------------- scenarios ------------------------------- */
  const addS = (s) => SD.scenarios.push(s);

  addS({ id: "scaling-aws", title: "Scaling to Millions of Users (AWS)", aka: "From one box to a global architecture", category: "Classic", level: "Medium", icon: "chart",
    summary: "Evolve a web app step by step from a single server to a horizontally scaled, cached, replicated, asynchronous architecture.",
    tags: ["iterative design", "autoscaling", "read replicas", "CDN", "ELB", "SQS", "RDS", "federation"],
    functional: ["A user makes a read or write request; the service processes it, stores data and returns a result", "Serve static content (images, JS/CSS)", "Grow from a handful of users to tens of millions"],
    nonFunctional: ["High availability (multi-AZ)", "Scale each tier independently", "Keep costs proportional to load", "Evolve iteratively: benchmark → find the bottleneck → fix → repeat"],
    estimates: [["Users", "10 M users, 1 B writes/month (~400/s), 100 B reads/month (~40 K/s)"], ["Read:write", "100:1"], ["Storage", "~1 KB/write → 1 TB/month, ~36 TB in 3 years"]],
    api: ["GET /api/v1/items/{id}", "POST /api/v1/items", "Static assets → https://cdn.example.com/…"],
    dataModel: ["Relational data in MySQL/Aurora; blobs in S3 (path stored in the DB)", "Sessions in Redis (web tier stateless)", "Later: NoSQL (DynamoDB) for high-volume, simple-access tables"],
    choices: [
      { c: "Stage 1: one box", pick: "Single EC2 running web + MySQL; vertical scaling", why: "Cheapest start. Add monitoring (CloudWatch) and an Elastic IP so the address survives restarts." },
      { c: "Stage 2: split storage", pick: "Move MySQL to RDS; static content to S3", why: "Scale the DB and web independently, get managed backups and multi-AZ standby, and take load off the web server." },
      { c: "Stage 3: horizontal web", pick: "ELB + autoscaling group across AZs; stateless web servers", why: "No single web server is a SPOF. Sessions move to Redis/DynamoDB. Separate Write and Read APIs to scale them differently." },
      { c: "Stage 4: reads", pick: "CloudFront CDN + ElastiCache + RDS read replicas", why: "With 100:1 reads, caches and replicas absorb most traffic and the primary handles writes only." },
      { c: "Stage 5: writes & async", pick: "SQS + worker autoscaling; then federation, sharding or NoSQL", why: "Push slow work off the request path. When the write primary saturates, split by function, shard, or move hot tables to DynamoDB." }
    ],
    diagram: { nodes: [
      n("users", "Users", "", "client", 80, 260, "Web and mobile clients."),
      n("dns", "Route 53", "DNS + health checks", "edge", 250, 70, "Routes users; latency or failover routing.", "dns"),
      n("cdn", "CloudFront", "CDN", "edge", 250, 450, "Static and media from the edge.", "cdn"),
      n("s3", "S3", "static + uploads", "storage", 420, 450, "Object storage behind the CDN."),
      n("elb", "Load Balancer", "ELB, multi-AZ", "edge", 250, 260, "Distributes over web servers; health checks.", "lb"),
      n("web", "Web servers", "autoscaling group", "service", 420, 260, "Stateless; scale on CPU/requests."),
      n("wapi", "Write API", "", "service", 590, 150, "Handles writes; scales separately."),
      n("rapi", "Read API", "", "service", 590, 370, "Handles reads; the bulk of traffic."),
      n("q", "SQS", "queue", "queue", 590, 40, "Async jobs (thumbnails, emails, fan-out)."),
      n("workers", "Workers", "autoscaled", "worker", 760, 40, "Consume the queue; scale on its depth."),
      n("master", "MySQL primary", "RDS multi-AZ", "db", 760, 150, "All writes; synchronous standby in another AZ."),
      n("replica", "Read replicas", "RDS", "db", 760, 300, "Scale reads; slightly stale."),
      n("cache", "ElastiCache", "Redis / Memcached", "cache", 760, 450, "Hot objects and sessions.")
    ], edges: [["users", "dns"], ["users", "elb"], ["users", "cdn"], ["cdn", "s3"], ["elb", "web"], ["web", "wapi"], ["web", "rapi"], ["wapi", "master"], ["wapi", "q"], ["q", "workers"], ["master", "replica"], ["rapi", "replica"], ["rapi", "cache"]],
      flows: [
        { name: "Evolution: 1 → millions", steps: [
          ["users", "web", "Stage 1: one server runs everything. Scale vertically, add monitoring"],
          ["wapi", "master", "Stage 2: MySQL moves to its own managed instance (RDS, multi-AZ standby)"],
          ["cdn", "s3", "Stage 2b: static assets and uploads go to S3, served via CloudFront"],
          ["users", "elb", "Stage 3: a load balancer spreads traffic over many stateless web servers in several AZs"],
          ["web", "rapi", "Stage 3b: split Read and Write APIs so each scales independently"],
          ["rapi", "cache", "Stage 4: cache hot reads (80/20 rule) in Redis/Memcached"],
          ["master", "replica", "Stage 4b: add read replicas; the primary serves writes only"],
          ["wapi", "q", "Stage 5: move slow work to SQS"],
          ["q", "workers", "…processed by autoscaled workers"],
          ["users", "dns", "Beyond: DNS failover across regions; federation, sharding or NoSQL for write scale"]
        ]},
        { name: "Read request", steps: [["users", "elb", "GET /items/42"], ["elb", "web", "Pick a healthy instance"], ["web", "rapi", "Route to the Read API"], ["rapi", "cache", "Hit? Return in ~1 ms"], ["rapi", "replica", "Miss → read replica, then populate the cache"], ["rapi", "users", "200 OK"]] }
      ] },
    deepDives: [
      { t: "The iterative loop", b: ["Benchmark / load test", "Profile to find the bottleneck (CPU, memory, disk, DB, network)", "Address it with the simplest fix and evaluate the trade-offs", "Repeat, because a new bottleneck always appears"] },
      { t: "Making the web tier stateless", p: "Move sessions to Redis or DynamoDB, uploads to S3, and config to a parameter store. Then any instance can serve any request, and autoscaling or instance loss has no user impact." },
      { t: "When the write primary saturates", b: ["Federation: split the DB by function (users, products, orders)", "Sharding: split one table by key", "Move high-volume, simple-access tables (sessions, events) to NoSQL", "Buffer writes via queues; batch them"] }
    ],
    pitfalls: ["Premature microservices / sharding at 100 users", "Stateful web servers blocking autoscaling", "No monitoring, so you're guessing at bottlenecks"],
    tradeoffs: [["Vertical (simple)", "Horizontal (resilient, complex)"], ["Managed services (less ops)", "Self-managed (control, cost at scale)"]] });

  addS({ id: "distributed-cache", title: "Distributed Cache", aka: "Memcached · Redis · query cache for a search engine", category: "Infrastructure", level: "Medium", icon: "db",
    summary: "A horizontally scalable in-memory key-value cache with LRU eviction, consistent hashing and graceful node loss.",
    tags: ["LRU", "consistent hashing", "TTL", "replication", "hot keys", "memcached", "redis"],
    functional: ["get(key), set(key, value, ttl), delete(key)", "Evict the least recently used entries when memory is full", "Cache popular search queries → results (the primer's search-engine query cache)"],
    nonFunctional: ["Sub-millisecond latency", "Scales horizontally to TBs of RAM", "High availability: losing a node shouldn't overload the DB", "Mostly eventual consistency with the source of truth"],
    estimates: [["Traffic", "10 B queries/month → ~4 K/s; hot 20% cached"], ["Size", "10 M cached query results × 10 KB = 100 GB → spread over several nodes"], ["Per node", "~100 K+ ops/s; 64–256 GB RAM"]],
    api: ["get(key) → value | miss", "set(key, value, ttl)", "delete(key)", "Client library: key → node via consistent hashing"],
    dataModel: ["Per node: hash map key → node in an LRU doubly linked list (value, expiry)", "Memory: slab allocator (Memcached) to avoid fragmentation"],
    choices: [
      { c: "Node data structure", pick: "Hash map + doubly linked list (LRU)", why: "O(1) get, set and evict. See the OOD: LRU Cache concept." },
      { c: "Partitioning", pick: "Client-side consistent hashing with virtual nodes", why: "Adding or removing a node remaps only ~1/N of keys, which avoids a thundering herd on the DB." },
      { c: "Availability", pick: "Replicas per shard (Redis) or treat the cache as disposable (Memcached)", why: "Replicas keep the hit ratio up during failover. Memcached-style caches accept misses and rely on the DB." },
      { c: "Membership", pick: "Config service (ZooKeeper/etcd) or a proxy (twemproxy, mcrouter)", why: "Clients need a consistent view of the ring. Proxies centralise routing and pooling." },
      { c: "Hot keys", pick: "Local in-process L1 + key replication", why: "One viral key can overload a single node." }
    ],
    diagram: { nodes: [
      n("app", "App servers", "cache client lib", "service", 100, 260, "Hash the key onto the ring and talk directly to the owning node."),
      n("cfg", "Cluster config", "ZooKeeper / etcd", "db", 100, 460, "Ring membership; clients watch for changes."),
      n("a", "Cache node A", "LRU · 128 GB", "cache", 440, 100, "Owns part of the ring."),
      n("b", "Cache node B", "LRU · 128 GB", "cache", 440, 260, "Owns part of the ring."),
      n("c", "Cache node C", "LRU · 128 GB", "cache", 440, 420, "Owns part of the ring."),
      n("rb", "Replica of B", "async", "cache", 700, 260, "Promoted if B fails (Redis-style)."),
      n("db", "Database", "source of truth", "db", 900, 420, "Queried on misses.")
    ], edges: [["app", "a"], ["app", "b"], ["app", "c"], ["cfg", "app"], ["b", "rb"], ["app", "db", "", -0.28]],
      flows: [
        { name: "Get (hit & miss)", steps: [["app", "b", "hash('q:system design') → node B: GET"], ["b", "app", "HIT: results in ~0.3 ms (node moved to MRU)"], ["app", "c", "hash('q:kafka') → node C: GET"], ["c", "app", "MISS"], ["app", "db", "Query the source of truth"], ["app", "c", "SET with TTL (may evict an LRU entry)"]] },
        { name: "Node failure", steps: [["cfg", "app", "Node B is down → updated ring"], ["b", "rb", "Replica promoted (or B's keys remap to neighbours)"], ["app", "rb", "Only ~1/N of keys are affected, so the DB isn't stampeded"]] }
      ] },
    deepDives: [
      { t: "Memcached vs Redis", b: ["Memcached: multithreaded, simple strings, slab allocator, no persistence or replication. A pure cache.", "Redis: rich data structures, persistence (RDB/AOF), replication, Cluster mode, Lua. A cache and more."] },
      { t: "Keeping the cache in sync", b: ["Cache-aside + TTL as the baseline", "Invalidate on write (delete, don't update)", "CDC-driven invalidation for multiple writers", "Lease/token on miss to prevent stale sets (Facebook's memcache paper)"] },
      { t: "Search query cache (primer example)", p: "Normalise the query (lowercase, trim, sort params) → key. Value = the top results page. TTL is short for news-heavy queries. A cache miss hits the reverse index service, and the result is written back." }
    ],
    pitfalls: ["hash mod N partitioning (mass remap on resize)", "Treating the cache as durable storage", "Cache stampede when a hot key expires"],
    tradeoffs: [["Replicated cache (availability)", "Disposable cache (simplicity)"], ["Client-side routing (fast)", "Proxy routing (manageable)"]] });

  addS({ id: "social-graph", title: "Social Network Graph", aka: "Friends of friends · Facebook graph search · degrees of separation", category: "Social", level: "Medium", icon: "service",
    summary: "Store a social graph sharded across many servers and find the shortest path between two people.",
    tags: ["BFS", "bidirectional search", "sharding", "adjacency list", "graph", "cache"],
    functional: ["Find the shortest path (degrees of separation) between two users", "List friends and friends of friends", "Graph search: 'friends who live in Berlin and like jazz'"],
    nonFunctional: ["Hundreds of millions of users and billions of edges: doesn't fit on one machine", "Low latency for 2–3 hop queries", "Mostly read-heavy"],
    estimates: [["Users", "100 M users × 50 friends avg = 5 B edges"], ["Searches", "1 B/month → ~400/s"], ["Adjacency storage", "5 B × 8 B ≈ 40 GB of IDs (×2 for both directions)"]],
    api: ["GET /api/v1/friend_search?person_id=1&target_id=2 → path", "GET /api/v1/users/{id}/friends"],
    dataModel: ["Person server shard: user_id → friend_ids[] (adjacency list)", "Lookup service: user_id → shard / person server", "For graph search: an index on attributes (city, likes) + the graph store (TAO-like)"],
    choices: [
      { c: "Storage", pick: "Sharded adjacency lists (KV by user_id) behind a person lookup service", why: "The graph is too big for one machine. Adjacency lists keyed by user make friend lookups one read." },
      { c: "Algorithm", pick: "Bidirectional BFS, batched per shard", why: "Search from both ends; the frontier grows as bᵈ, so meeting in the middle is about √ of the work. Batch friend lookups per server to cut round trips." },
      { c: "Caching", pick: "Cache hot adjacency lists and recent path results", why: "Celebrities and popular pairs are queried often." },
      { c: "Alternative", pick: "Graph DB (Neo4j) or TAO-style cache over MySQL", why: "Facebook's TAO serves associations from a cache tier over sharded MySQL." }
    ],
    diagram: { nodes: [
      n("client", "Client", "", "client", 80, 260, "Asks for a path between two users."),
      n("gw", "API gateway", "", "edge", 250, 260, "Auth and routing.", "gateway"),
      n("search", "Graph service", "bidirectional BFS", "service", 440, 260, "Runs the search, batching lookups by shard."),
      n("lookup", "Person lookup", "user → shard", "cache", 440, 90, "Knows which person server holds each user."),
      n("cache", "Adjacency cache", "Redis", "cache", 440, 430, "Hot friend lists."),
      n("p1", "Person server 1", "users A–F", "db", 720, 110, "Adjacency lists shard."),
      n("p2", "Person server 2", "users G–M", "db", 720, 260, "Adjacency lists shard."),
      n("p3", "Person server 3", "users N–Z", "db", 720, 410, "Adjacency lists shard.")
    ], edges: [["client", "gw"], ["gw", "search"], ["search", "lookup"], ["search", "cache"], ["search", "p1"], ["search", "p2"], ["search", "p3"]],
      flows: [{ name: "Shortest path: Alice → Zoe", steps: [
        ["client", "gw", "friend_search(alice, zoe)"], ["gw", "search", "Start a BFS from both ends"],
        ["search", "lookup", "Which servers hold alice and zoe?"],
        ["search", "p1", "friends(alice) → [bob, dan, …]"], ["search", "p3", "friends(zoe) → [nick, sam, …]"],
        ["search", "lookup", "Group the next frontier by server (batch)"],
        ["search", "p2", "friends(bob, dan…) in one call per server → found 'nick', so the frontiers meet"],
        ["search", "cache", "Cache hot adjacency lists"],
        ["search", "client", "alice → dan → nick → zoe (3 hops)"]
      ]}] },
    deepDives: [
      { t: "Why bidirectional BFS", p: "With ~200 friends each, 3 hops from one side touches ~8 M nodes; meeting in the middle touches ~2 × 40 K. Always expand the smaller frontier and stop at the first intersection." },
      { t: "Graph search with filters", b: ["Candidate generation from the graph (friends and friends of friends)", "Filter via attribute indexes (city, likes)", "Rank by closeness and affinity", "Facebook's Unicorn built inverted indexes over graph edges"] }
    ],
    pitfalls: ["One network call per node visited (batch per shard!)", "Unbounded search depth; cap at ~3–4 hops"],
    tradeoffs: [["Sharded KV adjacency (scales)", "Graph DB (expressive, harder to shard)"]] });

  addS({ id: "sales-rank", title: "Sales Rank by Category", aka: "Amazon best sellers", category: "Data pipeline", level: "Medium", icon: "trophy",
    summary: "Compute and serve the top products per category over the past week from a huge stream of orders.",
    tags: ["MapReduce", "batch", "top-k", "caching", "SQL", "Spark"],
    functional: ["Compute the most popular products in each category over the past week", "Users view the ranking per category", "Update hourly (more popular categories more often)"],
    nonFunctional: ["Read-heavy (views ≫ recomputes)", "Rankings can be an hour stale", "Handle 1 B+ transactions/month"],
    estimates: [["Products", "10 M in 1,000 categories"], ["Transactions", "1 B/month → ~400 writes/s"], ["Views", "100 B/month → ~40 K reads/s"], ["Logs", "~40 bytes/txn → 40 GB/month"]],
    api: ["GET /api/v1/popular?category_id=1234 → [{product_id, rank, sales}]"],
    dataModel: ["Sales log (S3): timestamp, product_id, category_id, qty, price, buyer, seller", "sales_rank table: category_id, product_id, total_sold, rank (+ indexes on category_id, rank)"],
    choices: [
      { c: "Raw data", pick: "Append order events to object storage (or Kafka → S3)", why: "Cheap, immutable, replayable. Don't query the orders OLTP DB for analytics." },
      { c: "Computation", pick: "Batch MapReduce/Spark: map (category, product) → qty; reduce sum; sort within category", why: "Hourly freshness is enough, and batch is exact and cheap." },
      { c: "Serving", pick: "SQL table (or KV) of precomputed ranks + cache + CDN", why: "Reads are simple lookups of precomputed top-N lists." },
      { c: "Freshness option", pick: "Streaming counts (Flink) with sliding windows", why: "If minutes matter, maintain rolling counts per category and a top-K heap." }
    ],
    diagram: { nodes: [
      n("client", "Shoppers", "", "client", 80, 260, "Buy things and browse best-seller lists."),
      n("web", "Web servers", "", "edge", 250, 260, "Front door.", "lb"),
      n("orders", "Order service", "", "service", 430, 120, "Records every sale."),
      n("s3", "Sales logs", "S3 / data lake", "storage", 640, 120, "Append-only order events."),
      n("mr", "Spark / MapReduce", "hourly", "worker", 840, 120, "Aggregates the past 7 days per category.", "analytics"),
      n("db", "Rank DB", "category → top N", "db", 840, 300, "Precomputed rankings, swapped atomically each run."),
      n("api", "Sales Rank API", "", "service", 430, 300, "Serves rankings."),
      n("cache", "Rank cache", "Redis", "cache", 640, 440, "Hot categories.")
    ], edges: [["client", "web"], ["web", "orders"], ["orders", "s3"], ["s3", "mr"], ["mr", "db"], ["web", "api"], ["api", "cache"], ["api", "db"]],
      flows: [
        { name: "Compute ranks", steps: [["client", "web", "Buy a product"], ["web", "orders", "Place the order"], ["orders", "s3", "Append a sale event (ts, product, category, qty)"], ["s3", "mr", "Hourly: map (category, product) → qty; reduce SUM; sort per category"], ["mr", "db", "Write a new table version, then swap it in atomically"]] },
        { name: "View best sellers", steps: [["client", "web", "GET /popular?category=books"], ["web", "api", "Route"], ["api", "cache", "Hit for popular categories"], ["api", "db", "Miss → SELECT … WHERE category_id = ? ORDER BY rank LIMIT 100"], ["api", "client", "Rankings (cacheable for an hour)"]] }
      ] },
    deepDives: [
      { t: "MapReduce steps", b: ["Map: parse log lines → ((category, product), qty), dropping lines older than 7 days", "Reduce 1: sum per (category, product)", "Map 2: re-key to (category, total, product) for a secondary sort", "Reduce 2: emit the top N per category in order"] },
      { t: "Scaling reads", p: "40 K reads/s of small, rarely changing lists: CDN / HTTP caching, Redis for hot categories, read replicas for the rest." }
    ],
    pitfalls: ["Computing rankings on the OLTP orders DB", "Non-atomic table swaps showing half-written rankings"],
    tradeoffs: [["Batch (exact, cheap)", "Streaming (fresh, complex)"]] });

  addS({ id: "personal-finance", title: "Personal Finance Tracker", aka: "Mint.com", category: "Fintech", level: "Medium", icon: "card",
    summary: "Connect bank accounts, pull and categorise transactions, track budgets and alert on overspending.",
    tags: ["ETL", "queue", "categorisation", "budgets", "security", "batch", "MapReduce"],
    functional: ["Link bank and credit card accounts", "Extract transactions from linked accounts daily (active users more often)", "Auto-categorise transactions (manual override)", "Budgets per category with alerts; monthly spending analytics"],
    nonFunctional: ["Write-heavy ingestion, read-light usage", "Eventual consistency is fine for dashboards", "High security: encrypted credentials and PII", "Resilient to flaky third-party bank APIs"],
    estimates: [["Users", "10 M users, 30 M linked accounts"], ["Transactions", "5 B/month → ~2 K writes/s"], ["Reads", "~500 M/month → ~200/s"], ["Storage", "~50 B × 5 B/month ≈ 250 GB/month (~9 TB over 3 years)"]],
    api: ["POST /api/v1/accounts {institution, oauth_token}", "GET /api/v1/transactions?month=…", "PUT /api/v1/transactions/{id} {category}", "PUT /api/v1/budgets/{category} {amount}"],
    dataModel: ["accounts: id · user_id · institution · encrypted_token · last_synced", "transactions: id · account_id · bank_txn_id (UNIQUE) · amount · merchant · category · ts", "budget_overrides / monthly_spending (precomputed aggregates)"],
    choices: [
      { c: "Ingestion", pick: "Queue of sync jobs + autoscaled extractor workers", why: "Bank APIs are slow, flaky and rate-limited. The queue buffers and retries without blocking users." },
      { c: "Storage", pick: "Relational DB (sharded by user) for accounts and transactions", why: "Structured, relational, needs uniqueness (bank_txn_id) to dedupe re-pulls. Raw statements go in S3." },
      { c: "Analytics", pick: "Batch MapReduce/Spark over transaction logs → monthly_spending table", why: "Dashboards read small precomputed aggregates instead of scanning transactions." },
      { c: "Categorisation", pick: "Merchant → category map + ML fallback + user overrides", why: "Most volume comes from a small set of merchants; overrides also train the model." },
      { c: "Security", pick: "OAuth tokens (not passwords) encrypted with KMS; strict access controls", why: "Financial data is high-value." }
    ],
    diagram: { nodes: [
      n("client", "User", "web / app", "client", 80, 260, "Links accounts, views budgets."),
      n("gw", "Web / API", "", "edge", 250, 260, "Front door.", "gateway"),
      n("api", "Accounts API", "", "service", 430, 140, "Accounts, budgets, dashboard reads."),
      n("db", "SQL DB", "sharded by user", "db", 620, 140, "Accounts, transactions, aggregates."),
      n("q", "Sync queue", "SQS", "queue", 430, 340, "Account refresh jobs."),
      n("ext", "Extractors", "workers", "worker", 620, 340, "Pull transactions from banks with retries."),
      n("bank", "Bank APIs", "aggregators", "external", 840, 340, "Plaid-style aggregators / bank APIs.", "card"),
      n("s3", "Raw data", "S3", "storage", 840, 140, "Raw statements for replay and audit."),
      n("cat", "Categoriser", "rules + ML", "worker", 620, 470, "Assigns a category to each transaction."),
      n("budget", "Budget service", "", "service", 430, 470, "Updates spend; checks budgets."),
      n("notif", "Notifications", "email / push", "external", 250, 470, "Overspending alerts.", "bell")
    ], edges: [["client", "gw"], ["gw", "api"], ["api", "db"], ["api", "q"], ["q", "ext"], ["ext", "bank"], ["ext", "s3"], ["ext", "db"], ["ext", "cat"], ["cat", "budget"], ["budget", "notif"]],
      flows: [
        { name: "Link & sync an account", steps: [["client", "gw", "Link a Chase account (OAuth)"], ["gw", "api", "Create the account"], ["api", "db", "Store it (token encrypted with KMS)"], ["api", "q", "Enqueue the initial sync job"], ["q", "ext", "A worker picks up the job"], ["ext", "bank", "Pull transactions (paged, retry with backoff)"], ["ext", "s3", "Archive raw data"], ["ext", "db", "Upsert transactions; UNIQUE(bank_txn_id) dedupes re-pulls"], ["ext", "cat", "Categorise: 'STARBUCKS #123' → Coffee"], ["cat", "budget", "Update month-to-date spend per category"], ["budget", "notif", "Over the Coffee budget → alert"]] },
        { name: "View dashboard", steps: [["client", "gw", "GET /dashboard"], ["gw", "api", "Read"], ["api", "db", "Read precomputed monthly_spending (not raw transactions)"], ["api", "client", "Charts"]] }
      ] },
    deepDives: [
      { t: "Scheduling syncs", p: "Sync daily for everyone, but more often for recently active users. Spread jobs across the day, respect per-institution rate limits, and prioritise user-triggered refreshes." },
      { t: "Precomputing analytics", p: "A nightly or hourly batch job aggregates transactions into (user, month, category) → total. The dashboard reads kilobytes instead of scanning gigabytes." }
    ],
    pitfalls: ["Storing bank passwords", "No dedupe key, so re-pulls double-count spending", "Synchronous bank calls in user requests"],
    tradeoffs: [["Batch aggregates (cheap)", "Real-time budgets (fresher, costlier)"]] });

  addS({ id: "search-engine", title: "Web Search Engine", aka: "Google · Bing", category: "Search", level: "Hard", icon: "search",
    summary: "Crawl the web, build a sharded inverted index with ranking signals, and answer queries from billions of pages in ~100 ms.",
    tags: ["inverted index", "crawler", "PageRank", "sharding", "scatter-gather", "caching", "BM25"],
    functional: ["Return relevant, ranked results for a keyword query", "Snippets and titles for each result", "Keep the index fresh (news in minutes, the long tail in weeks)"],
    nonFunctional: ["p99 latency < ~200 ms", "Massive read QPS (100 K+)", "Index tens of billions of documents", "Highly available; partial results are better than none"],
    estimates: [["Pages", "~50 B indexed pages"], ["Index size", "Postings compressed ≈ hundreds of TB, sharded across thousands of machines"], ["Queries", "~100 K QPS peak"]],
    api: ["GET /search?q=…&start=0 → results, snippets, spelling suggestion"],
    dataModel: ["Doc store (Bigtable): url → content, metadata, outlinks", "Inverted index shard: term → postings [(docID, positions, tf)]", "Doc signals: PageRank, freshness, spam score, click stats"],
    choices: [
      { c: "Index partitioning", pick: "Shard by document (each shard indexes a subset of docs)", why: "Every query fans out to all shards, but each shard is independent and the load is balanced. Replicate shards for QPS." },
      { c: "Ranking", pick: "Two phases: cheap scoring (BM25 + static PageRank) on each shard → ML re-ranking of the top candidates", why: "You can't run expensive models over millions of matches." },
      { c: "Query serving", pick: "Root → aggregator tree → leaf shards, with timeouts", why: "The tree limits fan-in; dropping slow shards keeps latency bounded (tail tolerance)." },
      { c: "Caching", pick: "Result cache for popular queries + posting list caches", why: "Query popularity is Zipfian, so the head of the distribution is heavily cached." },
      { c: "Freshness", pick: "Tiered indexes: a real-time tier for new content + a base tier rebuilt in batch", why: "Merge the tiers at query time." }
    ],
    diagram: { nodes: [
      n("crawler", "Crawler", "fleet", "worker", 80, 120, "See the Web Crawler scenario.", "search"),
      n("web", "The Web", "", "external", 80, 300, "Billions of pages."),
      n("docs", "Doc store", "Bigtable", "db", 280, 120, "Raw pages + link graph."),
      n("idx", "Indexer", "MapReduce", "worker", 480, 120, "Tokenise → term → postings; builds shard files."),
      n("rank", "Ranking signals", "PageRank etc.", "analytics", 480, 300, "Batch link analysis, spam and quality scores."),
      n("shards", "Index shards", "replicated", "search", 720, 120, "Inverted index by document partition."),
      n("user", "User", "", "client", 80, 460, "Types a query."),
      n("cache", "Results cache", "", "cache", 280, 300, "Popular queries → cached result pages."),
      n("fe", "Frontend", "query parsing", "service", 280, 460, "Spell-correction, query rewriting, snippets."),
      n("root", "Root / aggregator", "scatter-gather", "service", 480, 460, "Fans out to shards and merges the top-k.")
    ], edges: [["crawler", "web"], ["crawler", "docs"], ["docs", "idx"], ["idx", "shards"], ["docs", "rank"], ["rank", "shards"], ["user", "fe"], ["fe", "cache"], ["fe", "root"], ["root", "shards"]],
      flows: [
        { name: "Build the index", steps: [["crawler", "web", "Fetch pages"], ["crawler", "docs", "Store content + outlinks"], ["docs", "idx", "Tokenise, stem; emit (term, docID, positions)"], ["idx", "shards", "Build compressed posting lists per document shard; replicate"], ["docs", "rank", "Compute PageRank over the link graph (iterative batch)"], ["rank", "shards", "Attach static scores to docs"]] },
        { name: "Answer a query", steps: [["user", "fe", "q = 'system design primer'"], ["fe", "cache", "Popular? Serve the cached page (~5 ms)"], ["fe", "root", "Miss → parsed query"], ["root", "shards", "Scatter to all shards; each returns its top-k by BM25 + PageRank"], ["root", "fe", "Merge, re-rank the top candidates with ML, drop slow shards at the deadline"], ["fe", "user", "10 results with snippets"]] }
      ] },
    deepDives: [
      { t: "Inverted index basics", b: ["term → sorted list of docIDs (postings) with term frequency and positions", "Intersect posting lists for multi-word queries (skip pointers)", "Delta- and variable-byte-encode docIDs for compression", "Phrase queries use positions"] },
      { t: "PageRank intuition", p: "A page is important if important pages link to it. Iterate: each page splits its score among its outlinks, with a damping factor for random jumps. It's a classic iterative batch/Pregel job." }
    ],
    pitfalls: ["Term-partitioned index for multi-term queries (cross-shard intersections)", "Waiting for every shard (tail latency)"],
    tradeoffs: [["Doc-partitioned (fan-out every query)", "Term-partitioned (targeted, heavy intersections)"], ["Fresh tier (fast updates)", "Batch base index (efficient)"]] });

  addS({ id: "recommendation", title: "Recommendation System", aka: "Amazon · Netflix · YouTube recommendations", category: "ML systems", level: "Hard", icon: "service",
    summary: "Suggest items a user will like: retrieve candidates cheaply from millions of items, rank them with ML, and learn from feedback.",
    tags: ["collaborative filtering", "embeddings", "ANN", "feature store", "two-tower", "ranking", "A/B testing"],
    functional: ["Personalised recommendations on home and product pages", "'Customers who bought X also bought Y'", "Learn continuously from views, clicks and purchases"],
    nonFunctional: ["Serve in < 100 ms", "Millions of items and users", "Freshness: react to a session within minutes", "Measurable via A/B tests"],
    estimates: [["Users / items", "300 M users, 50 M items"], ["Requests", "~20 K rec requests/s at peak"], ["Events", "~1 M interaction events/s into the pipeline"]],
    api: ["GET /api/v1/recs?user_id=…&context=home&n=20", "Event: POST /events {user, item, type: view|click|buy, ts}"],
    dataModel: ["Interaction log (Kafka → data lake)", "Embeddings: user and item vectors (vector index)", "Feature store: user & item features (online Redis/DynamoDB; offline in the warehouse)", "Co-visitation / item-to-item similarity tables"],
    choices: [
      { c: "Candidate generation", pick: "ANN over embeddings (two-tower) + item-to-item co-occurrence", why: "Cheaply narrows 50 M items to ~1,000 relevant ones. Amazon popularised item-to-item collaborative filtering." },
      { c: "Ranking", pick: "GBDT / neural ranker on rich features", why: "Scores a few hundred candidates with expensive features (recency, price, affinity) for accuracy." },
      { c: "Feature store", pick: "Online KV (Redis/DynamoDB) + offline warehouse, same definitions", why: "Avoids training/serving skew; low-latency lookups at serving time." },
      { c: "Training", pick: "Offline batch (daily) + streaming updates for session signals", why: "Heavy models retrain in batch; real-time features capture intent." },
      { c: "Evaluation", pick: "Offline metrics (recall@k, NDCG) → online A/B tests", why: "Offline gains don't always translate; measure business metrics." }
    ],
    diagram: { nodes: [
      n("user", "User", "", "client", 80, 260, "Browses and buys."),
      n("api", "Rec API", "", "service", 260, 260, "Orchestrates retrieval → ranking → rules."),
      n("cand", "Candidate gen", "retrieval", "service", 480, 160, "Pulls ~1,000 items from several sources."),
      n("vec", "ANN index", "item embeddings", "search", 720, 160, "Nearest neighbours of the user vector (HNSW)."),
      n("ranker", "Ranker", "ML model", "service", 480, 360, "Scores candidates."),
      n("feat", "Feature store", "online KV", "cache", 720, 360, "User and item features at low latency."),
      n("events", "Event stream", "Kafka", "queue", 260, 460, "Views, clicks, purchases."),
      n("train", "Training", "Spark / GPUs", "worker", 480, 500, "Trains embeddings and rankers."),
      n("models", "Model registry", "", "storage", 720, 500, "Versioned models, A/B rollouts.")
    ], edges: [["user", "api"], ["api", "cand"], ["cand", "vec"], ["api", "ranker"], ["ranker", "feat"], ["user", "events"], ["events", "train"], ["train", "models"], ["models", "ranker"]],
      flows: [
        { name: "Serve recommendations", steps: [["user", "api", "Open the home page"], ["api", "cand", "Retrieve candidates"], ["cand", "vec", "ANN: items near the user embedding + 'also bought' lists"], ["api", "ranker", "Score ~1,000 candidates"], ["ranker", "feat", "Fetch features (recency, price, affinity…)"], ["api", "user", "Top 20 after diversity, dedupe and business rules"]] },
        { name: "Learn from feedback", steps: [["user", "events", "Impressions, clicks, purchases"], ["events", "train", "Build training data (with the features as of that time)"], ["train", "models", "Train, evaluate offline, register"], ["models", "ranker", "Canary → A/B test → full rollout"]] }
      ] },
    deepDives: [
      { t: "Collaborative vs content-based", b: ["Collaborative filtering: users who behaved alike like alike items (matrix factorisation, item-to-item)", "Content-based: item attributes and text/image embeddings; solves cold start for new items", "Hybrid in practice"] },
      { t: "Cold start", p: "New users get popularity, context (location, device) and onboarding choices. New items get content embeddings and exploration traffic (bandits)." }
    ],
    pitfalls: ["Training/serving skew from different feature code paths", "Feedback loops that only recommend what's already popular", "Scoring every item per request"],
    tradeoffs: [["Batch models (stable)", "Real-time signals (responsive)"], ["Exploitation (clicks now)", "Exploration (learn more)"]] });

  addS({ id: "photo-sharing", title: "Photo Sharing", aka: "Instagram · Flickr", category: "Social", level: "Medium", icon: "cdn",
    summary: "Upload photos, generate thumbnails, and serve a feed of followed users' photos with global low latency.",
    tags: ["object storage", "CDN", "thumbnails", "fan-out", "sharding", "presigned URL"],
    functional: ["Upload photos with captions", "Follow users; view a feed of their photos", "Like and comment", "View a user's profile grid"],
    nonFunctional: ["Read-heavy; images dominate bandwidth", "Uploads must be durable", "Feed latency < 200 ms; images from the edge", "Eventual consistency is OK for feeds"],
    estimates: [["DAU", "500 M; 100 M photos/day → ~1.2 K uploads/s"], ["Storage", "~2 MB original + renditions → ~250 TB/day"], ["Reads", "Feed views ~50 K/s; image requests ~1 M/s (mostly CDN)"]],
    api: ["POST /v1/photos → {photoId, uploadUrl}", "GET /v1/feed?cursor=…", "GET /v1/users/{id}/photos"],
    dataModel: ["photos: id (Snowflake, encodes shard) · user_id · caption · s3_key · created_at (Postgres sharded by user_id)", "follows: follower · followee", "feed cache: feed:{user} → photo ids (Redis)"],
    choices: [
      { c: "Images", pick: "S3 (originals + renditions) + CDN", why: "Durable, cheap, and served from the edge. App servers never proxy bytes." },
      { c: "Metadata", pick: "Sharded Postgres, with IDs that embed the shard (Instagram-style)", why: "Relational, transactional per user; shard-aware IDs route queries without a lookup." },
      { c: "Processing", pick: "Async thumbnail and rendition workers", why: "Resizing is CPU-heavy; don't block the upload request." },
      { c: "Feed", pick: "Fan-out on write into Redis (hybrid for celebrities)", why: "Same reasoning as the News Feed scenario." }
    ],
    diagram: { nodes: [
      n("user", "User", "", "client", 80, 260, "Uploads and scrolls."),
      n("gw", "API gateway", "", "edge", 260, 260, "Auth, routing.", "gateway"),
      n("cdn", "CDN", "", "edge", 80, 460, "Serves images.", "cdn"),
      n("s3", "Object storage", "S3", "storage", 260, 460, "Originals + renditions."),
      n("thumb", "Thumbnailer", "workers", "worker", 460, 440, "Creates 150/320/640/1080 px versions."),
      n("up", "Upload service", "", "service", 460, 120, "Creates the photo record, returns a presigned URL."),
      n("feed", "Feed service", "", "service", 460, 260, "Reads the precomputed feed and hydrates it."),
      n("meta", "Metadata DB", "Postgres, sharded", "db", 680, 120, "Photos, users, likes."),
      n("fc", "Feed cache", "Redis", "cache", 680, 260, "feed:{user} → photo ids."),
      n("q", "Fan-out queue", "Kafka", "queue", 680, 390, "PhotoPosted events."),
      n("fan", "Fan-out workers", "", "worker", 880, 390, "Push ids into followers' feeds."),
      n("graph", "Follow graph", "", "db", 880, 120, "Who follows whom.")
    ], edges: [["user", "gw"], ["user", "cdn"], ["cdn", "s3"], ["s3", "thumb"], ["gw", "up"], ["gw", "feed"], ["up", "meta"], ["up", "q"], ["q", "fan"], ["fan", "graph"], ["fan", "fc"], ["feed", "fc"], ["feed", "meta"]],
      flows: [
        { name: "Post a photo", steps: [["user", "gw", "POST /photos"], ["gw", "up", "Create the record"], ["up", "meta", "INSERT photo (id encodes the shard)"], ["user", "s3", "Upload the bytes directly via a presigned URL"], ["s3", "thumb", "ObjectCreated → generate renditions"], ["up", "q", "PhotoPosted event"], ["q", "fan", "Fan-out"], ["fan", "graph", "Followers (skip celebrities' followers → pull)"], ["fan", "fc", "Push the id into each follower's feed"]] },
        { name: "View feed", steps: [["user", "gw", "GET /feed"], ["gw", "feed", "Route"], ["feed", "fc", "Photo ids"], ["feed", "meta", "Hydrate captions and like counts (cached)"], ["user", "cdn", "Load renditions sized to the screen from the edge"]] }
      ] },
    deepDives: [
      { t: "Shard-aware IDs", p: "64-bit ID = 41-bit ms timestamp + 13-bit logical shard + 10-bit sequence, generated inside Postgres. Sorting by ID sorts by time, and the shard is known from the ID alone." },
      { t: "Image delivery", b: ["Several renditions + WebP/AVIF", "Responsive sizes per device", "Long cache TTLs with immutable URLs", "Lazy-load below the fold"] }
    ],
    pitfalls: ["Proxying image bytes through app servers", "Synchronous resizing on upload", "Storing images in the database"],
    tradeoffs: [["Pre-generate renditions (fast reads)", "On-the-fly resizing at the edge (flexible, CPU cost)"]] });

  addS({ id: "cdn-design", title: "Content Delivery Network", aka: "Cloudflare · Akamai · CloudFront", category: "Infrastructure", level: "Hard", icon: "cdn",
    summary: "Build a global edge network that routes users to the nearest point of presence, caches content in tiers, and shields origins.",
    tags: ["anycast", "PoP", "tiered caching", "origin shield", "purge", "TLS", "DDoS", "consistent hashing"],
    functional: ["Serve cacheable content from the edge closest to the user", "Pull from customer origins on miss; honour Cache-Control", "Purge by URL, tag or everything within seconds", "TLS termination, WAF/DDoS protection, logs and analytics"],
    nonFunctional: ["Low latency globally (< 50 ms to the edge)", "Massive bandwidth (Tbps) and request rates", "Extreme availability: route around failed PoPs", "Protect origins from load and attacks"],
    estimates: [["PoPs", "~300 cities"], ["Traffic", "~50 M req/s globally, ~100+ Tbps peak"], ["Cache", "Each PoP: tens to hundreds of TB (SSD + RAM tiers)"]],
    api: ["Customer config: origins, cache rules, TTLs, WAF rules", "POST /purge {urls | tags | all}", "Edge: standard HTTP(S)"],
    dataModel: ["Edge cache: key = host + path + (vary) → object, TTL, tags", "Config store: replicated to every PoP (eventually consistent, versioned)", "Logs → streaming pipeline → analytics"],
    choices: [
      { c: "Routing users", pick: "Anycast (the same IP announced from every PoP) or GeoDNS", why: "BGP sends users to the nearest PoP; a failed PoP withdraws its routes and traffic shifts automatically." },
      { c: "Within a PoP", pick: "L4 LB → consistent hashing of cache keys across cache servers", why: "Each object lives on one server per PoP, so the PoP's effective capacity is the sum of its disks." },
      { c: "Tiered caching", pick: "Edge → regional tier / origin shield → origin", why: "Collapses misses from 300 PoPs into a few origin requests, protecting the origin and raising hit ratio." },
      { c: "Purge", pick: "Fan-out via a control-plane message bus to all PoPs within seconds; tag-based purge", why: "Customers need instant invalidation. Versioned URLs avoid purges entirely." },
      { c: "Request collapsing", pick: "Coalesce concurrent misses for the same object", why: "Prevents a thundering herd to the origin when popular content expires." }
    ],
    diagram: { nodes: [
      n("user", "User", "", "client", 80, 260, "Anywhere in the world."),
      n("dns", "Anycast / DNS", "BGP", "edge", 260, 80, "One IP announced from every PoP; the nearest wins.", "dns"),
      n("pop", "Edge PoP", "TLS · WAF · cache", "edge", 300, 260, "Terminates TLS, filters attacks, serves hits.", "cdn"),
      n("shield", "Regional tier", "origin shield", "cache", 560, 260, "Second cache layer that collapses misses."),
      n("origin", "Customer origin", "", "service", 820, 260, "The source of truth for content."),
      n("cp", "Control plane", "config · purge", "service", 560, 450, "Pushes config and purges to all PoPs."),
      n("logs", "Logs & analytics", "", "analytics", 820, 450, "Streamed request logs.")
    ], edges: [["user", "dns"], ["user", "pop"], ["pop", "shield"], ["shield", "origin"], ["cp", "pop"], ["cp", "shield"], ["pop", "logs"]],
      flows: [
        { name: "Cache miss → hit", steps: [["user", "dns", "Resolve cdn.example.com → anycast IP"], ["user", "pop", "BGP routes to the nearest PoP; TLS terminated at the edge"], ["pop", "shield", "Edge miss → consistent-hash to the regional tier"], ["shield", "origin", "Tier miss → a single collapsed request to the origin"], ["shield", "pop", "Cache in both tiers per Cache-Control"], ["pop", "user", "Response; later users in this region hit the edge (~10 ms)"], ["pop", "logs", "Stream the log line for analytics"]] },
        { name: "Purge", steps: [["cp", "pop", "Purge tag 'product-42' → broadcast to every PoP"], ["cp", "shield", "…and to the regional tiers"], ["pop", "user", "The next request misses and refetches fresh content"]] }
      ] },
    deepDives: [
      { t: "DDoS absorption", b: ["Anycast spreads attack traffic across all PoPs", "SYN cookies, rate limiting, challenge pages at the edge", "Protocol validation and WAF rules before the cache"] },
      { t: "What to cache", p: "Static assets for long TTLs with versioned names; HTML and APIs with short TTLs or stale-while-revalidate; never personalised responses without careful Vary/cache keys." }
    ],
    pitfalls: ["Caching personalised responses publicly", "Purge storms instead of versioned URLs", "No request collapsing (origin stampede)"],
    tradeoffs: [["More tiers (higher hit ratio)", "Fewer tiers (lower miss latency)"], ["Anycast (auto failover)", "GeoDNS (finer control)"]] });

  addS({ id: "trending-topics", title: "Trending Topics / Top-K", aka: "Twitter trends · top k requests in a time window", category: "Data pipeline", level: "Hard", icon: "chart",
    summary: "Find the most frequent items (hashtags, queries, URLs) over a sliding time window from a massive event stream.",
    tags: ["count-min sketch", "heavy hitters", "sliding window", "stream processing", "top-k heap", "Kafka", "Flink"],
    functional: ["Top K hashtags (or requests) in the last 5 min / 1 h / 24 h", "Trends per region", "Surface topics that are growing fast, not just large"],
    nonFunctional: ["Handles millions of events/s", "Results within seconds to a minute", "Approximate is acceptable; exact results may come later in batch"],
    estimates: [["Events", "500 M posts/day, ~2 hashtags each → ~12 K/s avg, 100 K/s peak"], ["Distinct keys", "Hundreds of millions → too many for exact counters per window"], ["Sketch", "Count-Min 4 × 1 M counters ≈ 16 MB per window slice"]],
    api: ["GET /v1/trends?region=US&window=1h&k=10"],
    dataModel: ["Per window slice (e.g. 1 min): Count-Min Sketch + a heap of candidate heavy hitters", "Aggregated top-K per window in Redis", "Raw events archived to S3 for exact batch recompute"],
    choices: [
      { c: "Counting", pick: "Count-Min Sketch + min-heap of the top candidates (or the Space-Saving algorithm)", why: "Fixed memory regardless of distinct keys; over-counts slightly but never under-counts." },
      { c: "Distribution", pick: "Partition the stream by key (Kafka) → per-partition top-K → merge", why: "Each worker sees a subset of keys; merging local top-Ks is cheap (keep K × some margin)." },
      { c: "Windows", pick: "1-minute slices summed into sliding 5 min / 1 h windows", why: "Sketches are additive, so a sliding window = the sum of recent slices, with old slices dropped." },
      { c: "'Trending' vs 'popular'", pick: "Score = current rate / baseline rate (with smoothing)", why: "Always-popular terms shouldn't trend; spikes should." },
      { c: "Exactness", pick: "Lambda-style batch job over raw logs", why: "Recompute exact daily top-K for reports." }
    ],
    diagram: { nodes: [
      n("clients", "Clients", "posts / requests", "client", 80, 260, "Produce events containing keys."),
      n("ingest", "Ingest service", "", "service", 260, 260, "Extracts hashtags/keys; normalises them."),
      n("kafka", "Events", "Kafka, keyed", "queue", 440, 260, "Partitioned by key so counts are local."),
      n("cnt", "Stream counters", "CMS + heap / slice", "worker", 640, 160, "Per partition: sketch + local top-K per minute.", "analytics"),
      n("agg", "Top-K aggregator", "merge heaps", "worker", 840, 160, "Merges local top-Ks and sums slices into windows."),
      n("cache", "Trends cache", "Redis", "cache", 840, 360, "Top-K per window and region."),
      n("api", "Trends API", "", "service", 640, 360, "Serves trends."),
      n("batch", "Batch recompute", "Spark on S3", "worker", 440, 440, "Exact counts for reporting.")
    ], edges: [["clients", "ingest"], ["ingest", "kafka"], ["kafka", "cnt"], ["cnt", "agg"], ["agg", "cache"], ["api", "cache"], ["clients", "api"], ["kafka", "batch"], ["batch", "cache"]],
      flows: [{ name: "Count & serve trends", steps: [
        ["clients", "ingest", "Post: 'Loving #SystemDesign #kafka'"], ["ingest", "kafka", "Emit (systemdesign), (kafka) keyed by tag"],
        ["kafka", "cnt", "Increment Count-Min Sketch; if the estimate > heap min, update the local top-K"],
        ["cnt", "agg", "Every 10 s: ship the local top-K for the current minute slice"],
        ["agg", "cache", "Sum the last 60 slices → 1 h window; rank by growth vs baseline"],
        ["clients", "api", "GET /trends?window=1h"], ["api", "cache", "Precomputed top 10"],
        ["kafka", "batch", "Nightly exact recount (reconciliation)"]
      ]}] },
    deepDives: [
      { t: "Count-Min Sketch in one paragraph", p: "d hash rows × w counters. Increment one counter per row; estimate = the minimum across rows. The error is ≤ εN with probability 1 − δ, where w = e/ε and d = ln(1/δ). Sketches for different time slices can be added together." },
      { t: "Top-K requests in an interval (primer question)", b: ["Exact, one machine: hash map of counts + a size-K min-heap → O(n log K)", "Distributed exact: partition by key, top-K per partition, merge", "Approximate at scale: CMS / Space-Saving per window slice"] }
    ],
    pitfalls: ["Exact per-key counters per window at scale (memory blowup)", "Merging top-K lists that were too short (drops global heavy hitters)", "Ranking by raw volume instead of growth"],
    tradeoffs: [["Approximate streaming (fast, tiny memory)", "Exact batch (slow, precise)"]] });

  addS({ id: "multiplayer-game", title: "Online Multiplayer Card Game", aka: "Poker · Hearthstone · UNO online", category: "Real-time", level: "Medium", icon: "trophy",
    summary: "Match players, run authoritative game rooms over persistent connections, and survive disconnects without cheating.",
    tags: ["matchmaking", "websocket", "authoritative server", "state machine", "reconnect", "anti-cheat", "Redis"],
    functional: ["Matchmaking by skill and region", "Real-time turns: deal, play, score", "Reconnect to an in-progress game", "Ratings, match history, spectating"],
    nonFunctional: ["Turn latency < 100–200 ms", "Fairness: server-authoritative, no hidden-information leaks", "Survive game-server crashes (resume from state)", "Scale to millions of concurrent games"],
    estimates: [["Concurrency", "2 M concurrent players → ~500 K games of 4"], ["Messages", "~1 action/5 s per player → 400 K msgs/s"], ["Game servers", "~5 K rooms per server → ~100 servers"]],
    api: ["POST /v1/matchmaking/join {mode}", "WS /game/{roomId}: → action {type, card, seq}  ← state {hand, table, turn, seq}", "GET /v1/players/{id}/history"],
    dataModel: ["Room state (Redis): deck order (server-only), hands, table, turn, seq", "Move log: room_id · seq · player · action (append-only)", "Players: id · rating (Elo/Glicko) · region"],
    choices: [
      { c: "Authority", pick: "Server-authoritative state machine per room", why: "Clients send intents; the server validates, shuffles and deals. Clients only see their own hand, so hidden information never leaks." },
      { c: "Transport", pick: "WebSockets (sticky to the room's server)", why: "Bi-directional low latency. Turn-based games don't need UDP." },
      { c: "Room placement", pick: "Room → server via a registry (Redis/consistent hashing)", why: "All players of a room talk to the same process, so state stays in memory." },
      { c: "Durability", pick: "Snapshot room state to Redis + an append-only move log", why: "If a server dies, another replays the log and resumes. Also used for replays and anti-cheat." },
      { c: "Matchmaking", pick: "Queues per mode/region with widening skill ranges", why: "Balances wait time against fairness." }
    ],
    diagram: { nodes: [
      n("p1", "Player A", "", "client", 80, 120, "Connected via WebSocket."),
      n("p2", "Player B", "", "client", 80, 400, "Connected via WebSocket."),
      n("gw", "WS gateway", "sticky", "edge", 260, 260, "Routes by room id.", "gateway"),
      n("mm", "Matchmaking", "skill + region", "service", 460, 90, "Groups players into rooms."),
      n("gs", "Game server", "authoritative", "service", 460, 260, "Runs the state machine for thousands of rooms."),
      n("reg", "Room registry", "Redis", "cache", 460, 430, "roomId → game server."),
      n("state", "Room state", "Redis snapshot", "cache", 720, 260, "Latest state for failover."),
      n("log", "Move log", "append-only", "db", 720, 430, "Replays, disputes, anti-cheat."),
      n("prof", "Profiles & ratings", "", "db", 720, 90, "Elo ratings, history.")
    ], edges: [["p1", "gw"], ["p2", "gw"], ["gw", "mm"], ["gw", "gs"], ["mm", "gs"], ["mm", "prof"], ["gs", "reg"], ["gs", "state"], ["gs", "log"]],
      flows: [
        { name: "Match & play a turn", steps: [["p1", "gw", "Join a ranked queue"], ["gw", "mm", "Queue by rating ± window, region"], ["mm", "prof", "Ratings"], ["mm", "gs", "Create room 77 with 4 players; the server shuffles and deals"], ["gs", "reg", "Register room 77 → server 12"], ["p2", "gw", "Play Q♠ (seq 14)"], ["gw", "gs", "Validate: is it B's turn, does B hold Q♠, is the move legal?"], ["gs", "log", "Append the move #14"], ["gs", "state", "Snapshot the state"], ["gs", "p1", "Broadcast the new table (each player only sees their own hand)"]] },
        { name: "Reconnect / failover", steps: [["p1", "gw", "The WebSocket drops; reconnect with (room 77, last seq 13)"], ["gw", "gs", "Look up the room's server"], ["gs", "state", "If the server changed: load the snapshot + replay the log tail"], ["gs", "p1", "Send the missed events after seq 13"]] }
      ] },
    deepDives: [
      { t: "Turn timers & disconnects", p: "Each turn has a server-side timer. On timeout, auto-play a legal move or forfeit. A disconnected player keeps their seat for N seconds."},
      { t: "Anti-cheat", b: ["Never send other players' cards to a client", "Server-side RNG with seeds logged for audits", "Rate-limit actions; detect bot patterns and collusion from the move logs"] }
    ],
    pitfalls: ["Trusting client-side game state", "Broadcasting full state, including hidden cards", "No sequence numbers (duplicate or out-of-order actions)"],
    tradeoffs: [["In-memory rooms (fast)", "External state store (resilient, slower)"]] });

  addS({ id: "stock-exchange", title: "Stock Exchange", aka: "NASDAQ · Binance matching engine", category: "Fintech", level: "Hard", icon: "chart",
    summary: "Accept orders, match buyers and sellers in strict price-time priority with microsecond latency, and publish market data.",
    tags: ["matching engine", "order book", "sequencer", "event sourcing", "determinism", "low latency", "market data"],
    functional: ["Place, cancel and modify limit/market orders", "Match orders by price-time priority", "Publish trades and order book updates (market data)", "Risk checks, clearing and settlement"],
    nonFunctional: ["Latency in microseconds to low milliseconds; very predictable", "Strict fairness and total ordering of orders", "No lost or duplicated orders; full audit trail", "Fast failover with identical state"],
    estimates: [["Symbols", "~10 K"], ["Orders", "Billions/day; peaks of millions/s"], ["Latency budget", "Gateway → match → ack in < 1 ms"]],
    api: ["FIX / binary protocol: NewOrder {clientOrderId, symbol, side, qty, price, type}", "Cancel {orderId}", "Market data: L1/L2/L3 feeds (multicast)"],
    dataModel: ["Order book per symbol: price levels (sorted) → FIFO queue of orders", "Event log: sequenced inputs (orders, cancels) and outputs (fills)", "Accounts and positions for risk and settlement"],
    choices: [
      { c: "Ordering", pick: "A sequencer stamps every input with a global sequence number", why: "Total order is fairness. Sequenced inputs make matching a deterministic state machine." },
      { c: "Matching engine", pick: "Single-threaded, in-memory, per-symbol (or per shard of symbols)", why: "No locks, cache-friendly, deterministic. Throughput from mechanical sympathy (LMAX Disruptor ring buffers)." },
      { c: "Durability & HA", pick: "Event sourcing: journal the sequenced inputs; hot standbys replay them", why: "The same inputs in the same order produce the same state, so failover is instant and consistent." },
      { c: "Risk", pick: "Pre-trade checks at the gateway (buying power, limits)", why: "Reject bad orders before they touch the book." },
      { c: "Market data", pick: "UDP multicast with sequence numbers + a retransmission service", why: "Fan-out to many consumers at minimal latency; gaps are detected via sequence numbers." }
    ],
    diagram: { nodes: [
      n("trader", "Brokers / traders", "FIX", "client", 80, 260, "Send orders."),
      n("gw", "Order gateway", "auth · validation", "edge", 260, 260, "Protocol handling, throttling.", "gateway"),
      n("risk", "Risk check", "pre-trade", "service", 260, 90, "Buying power, position limits.", "lock"),
      n("seq", "Sequencer", "total order", "queue", 460, 260, "Assigns a global sequence number to every input."),
      n("me", "Matching engine", "in-memory books", "service", 680, 260, "Price-time priority matching, single-threaded."),
      n("jr", "Journal", "event log", "db", 460, 450, "Durable sequenced inputs."),
      n("sb", "Hot standby", "replays journal", "service", 680, 450, "Identical state; takes over instantly."),
      n("md", "Market data", "multicast feed", "edge", 880, 140, "Trades and book updates.", "cdn"),
      n("clr", "Clearing & settlement", "post-trade", "worker", 880, 380, "Positions, T+1 settlement.")
    ], edges: [["trader", "gw"], ["gw", "risk"], ["gw", "seq"], ["seq", "me"], ["seq", "jr"], ["jr", "sb"], ["me", "md"], ["me", "clr"]],
      flows: [{ name: "Place & match an order", steps: [
        ["trader", "gw", "BUY 100 AAPL @ 190.00 (limit)"], ["gw", "risk", "Enough buying power? Within limits?"],
        ["gw", "seq", "Accepted → sequence #884211"], ["seq", "jr", "Journal the input (durable)"],
        ["seq", "me", "The engine applies #884211: best ask 189.99 × 60 → fill 60; rest 40 @ 190.00 on the bid side"],
        ["jr", "sb", "The standby replays the same input and reaches the same state"],
        ["me", "md", "Publish the trade + book update (multicast, sequenced)"],
        ["me", "clr", "Fills to clearing"], ["me", "trader", "Execution reports: partial fill 60, 40 resting"]
      ]}] },
    deepDives: [
      { t: "Order book data structure", b: ["Per side: price levels in a sorted structure (tree / array indexed by tick)", "Each level: a FIFO doubly linked list of orders (time priority)", "A hash map orderId → node gives O(1) cancel", "Match: while the best opposite price crosses, fill FIFO"] },
      { t: "Why determinism matters", p: "If matching is a pure function of the sequenced input log, you get replicas by replay, audits by re-running history, and bug reproduction exactly as it happened. It's event sourcing in its purest form." }
    ],
    pitfalls: ["Multi-threaded matching with locks (non-determinism, latency jitter)", "GC pauses in the hot path", "Timestamps instead of a sequencer for ordering"],
    tradeoffs: [["Single-threaded determinism", "Parallelism across symbols (shard the books)"]] });

  /* ------------------------------- glossary & quiz ------------------------------- */
  SD.glossary.push(
    ["Federation", "Splitting databases by function (users, products) so each is smaller and writes run in parallel."],
    ["Refresh-ahead", "Proactively refreshing hot cache entries shortly before they expire."],
    ["Task queue", "A queue that runs jobs on workers asynchronously, with retries and scheduling."],
    ["TCP", "Connection-oriented transport with reliable, ordered delivery and congestion control."],
    ["UDP", "Connectionless transport: best-effort, unordered, low overhead."],
    ["Anycast", "The same IP announced from many locations; routing delivers to the nearest."],
    ["Origin shield", "A mid-tier CDN cache that collapses misses before they reach the origin."],
    ["Count-Min Sketch", "A probabilistic table of counters estimating item frequencies in fixed memory."],
    ["Matching engine", "The component of an exchange that pairs buy and sell orders by price-time priority."],
    ["Sequencer", "A component assigning a global order (sequence numbers) to incoming events."],
    ["Candidate generation", "The retrieval stage of a recommender that narrows millions of items to a few hundred."],
    ["Active-passive / active-active", "Failover with a standby taking over vs all nodes serving traffic."]
  );
  SD.quiz.push(
    { q: "Your single MySQL primary is overloaded, but users, products and forums data rarely join. The first split to consider:", o: ["Sharding every table", "Federation by function", "A bigger cache TTL", "Switching to UDP"], a: 1, why: "Federation gives each domain its own DB: smaller working sets, parallel writes, and little cross-DB joining." },
    { q: "Which caching level is generally easier to invalidate?", o: ["Query-level (hash of SQL)", "Object-level (assembled entities)", "Both are equally easy", "Neither can be invalidated"], a: 1, why: "When an entity changes you delete its object key. With query caching you can't easily know which cached queries touched the changed rows." },
    { q: "Real-time voice chat where late packets are useless should use…", o: ["TCP", "UDP", "HTTP/1.1 polling", "SMTP"], a: 1, why: "UDP avoids retransmission delays. For live audio, late data is worse than lost data." },
    { q: "Top-10 hashtags over the last hour from 100 K events/s, with limited memory:", o: ["Exact hash map per window", "Count-Min Sketch + top-K heap over window slices", "SQL COUNT GROUP BY every second", "Bloom filter"], a: 1, why: "Sketches are fixed-size and additive across time slices; a heap tracks the heavy hitters." },
    { q: "A stock exchange guarantees fairness and fast failover mainly through…", o: ["Multi-threaded locks", "A sequencer + deterministic single-threaded matching + journal replay", "Eventual consistency", "Client timestamps"], a: 1, why: "Total ordering of inputs makes matching deterministic; standbys replay the journal to identical state." },
    { q: "An LRU cache with O(1) get/put is built from…", o: ["Two arrays", "A hash map + doubly linked list", "A binary heap", "A trie"], a: 1, why: "The hash map finds nodes in O(1); the doubly linked list moves and evicts in O(1)." }
  );

  /* ------------------------------ primer map ------------------------------ */
  SD.primer = {
    title: "The System Design Primer", url: "https://github.com/donnemartin/system-design-primer",
    groups: [
      { title: "Fundamentals", items: [["Performance vs scalability", ["performance-vs-scalability", "scaling"]], ["Latency vs throughput", ["latency-throughput"]], ["Availability vs consistency · CAP theorem (CP / AP)", ["cap"]], ["Consistency patterns: weak, eventual, strong", ["consistency-models"]], ["Availability patterns: fail-over (active-passive, active-active)", ["ha-dr", "health-checks"]], ["Availability patterns: replication (master-slave, master-master)", ["replication", "multi-leader"]], ["Availability in numbers: nines, in sequence vs in parallel", ["availability", "p:numbers"]]] },
      { title: "Traffic", items: [["Domain name system", ["dns"]], ["Content delivery network: push & pull CDNs", ["cdn", "s:cdn-design"]], ["Load balancer: L4 vs L7, horizontal scaling", ["load-balancing", "scaling"]], ["Reverse proxy (web server) · load balancer vs reverse proxy", ["proxy-gateway"]], ["Application layer · microservices · service discovery", ["microservices", "service-discovery"]]] },
      { title: "Database", items: [["RDBMS: master-slave replication", ["replication", "replication-logs"]], ["RDBMS: master-master replication", ["multi-leader"]], ["RDBMS: federation", ["federation"]], ["RDBMS: sharding", ["sharding", "consistent-hashing", "rebalancing"]], ["RDBMS: denormalization", ["normalization"]], ["RDBMS: SQL tuning", ["sql-tuning", "indexing"]], ["NoSQL: key-value store", ["d:keyvalue"]], ["NoSQL: document store", ["d:document"]], ["NoSQL: wide column store", ["d:widecolumn"]], ["NoSQL: graph database", ["d:graph", "graph-models"]], ["SQL or NoSQL", ["data-models", "p:databases", "p:advisor"]]] },
      { title: "Cache", items: [["Client, CDN, web server, database & application caching", ["cache-layers"]], ["Caching at the query level vs object level", ["cache-layers"]], ["When to update: cache-aside, write-through, write-behind, refresh-ahead", ["caching", "eviction", "cache-problems"]]] },
      { title: "Asynchronism & communication", items: [["Message queues", ["queues-pubsub", "delivery-semantics"]], ["Task queues", ["task-queues", "s:job-scheduler"]], ["Back pressure", ["backpressure"]], ["HTTP · TCP · UDP", ["network-protocols"]], ["RPC vs REST", ["api-styles", "dataflow-modes"]], ["Security", ["security-basics", "authn-authz", "rate-limiting"]]] },
      { title: "Appendix", items: [["Powers of two table", ["p:numbers"]], ["Latency numbers every programmer should know", ["p:numbers"]]] },
      { title: "Interview questions with solutions", items: [["Design Pastebin.com (or Bit.ly)", ["s:url-shortener"]], ["Design the Twitter timeline and search (or Facebook feed and search)", ["s:news-feed"]], ["Design a web crawler", ["s:web-crawler"]], ["Design Mint.com", ["s:personal-finance"]], ["Design the data structures for a social network", ["s:social-graph"]], ["Design a key-value store for a search engine", ["s:distributed-cache", "s:kv-store"]], ["Design Amazon's sales ranking by category feature", ["s:sales-rank"]], ["Design a system that scales to millions of users on AWS", ["s:scaling-aws"]]] },
      { title: "Additional interview questions", items: [["File sync service like Dropbox", ["s:file-sync"]], ["Search engine like Google", ["s:search-engine"]], ["Scalable web crawler like Google", ["s:web-crawler"]], ["Google Docs", ["s:collab-editor"]], ["Key-value store like Redis", ["s:kv-store", "s:distributed-cache"]], ["Cache system like Memcached", ["s:distributed-cache"]], ["Recommendation system like Amazon's", ["s:recommendation"]], ["Tinyurl system like Bitly", ["s:url-shortener"]], ["Chat app like WhatsApp", ["s:chat"]], ["Picture sharing system like Instagram", ["s:photo-sharing"]], ["Facebook news feed", ["s:news-feed"]], ["Facebook timeline", ["s:news-feed"]], ["Facebook chat", ["s:chat"]], ["Graph search like Facebook's", ["s:social-graph"]], ["Content delivery network like CloudFlare", ["s:cdn-design"]], ["Trending topic system like Twitter's", ["s:trending-topics"]], ["Random ID generation system", ["unique-ids"]], ["Top k requests during a time interval", ["s:trending-topics", "probabilistic"]], ["Serve data from multiple data centers", ["multi-region", "multi-leader"]], ["Online multiplayer card game", ["s:multiplayer-game"]], ["Garbage collection system", ["garbage-collection"]], ["API rate limiter", ["s:rate-limiter", "rate-limiting"]], ["Stock exchange (like NASDAQ or Binance)", ["s:stock-exchange"]]] },
      { title: "Object-oriented design", items: [["Hash map", ["ood-hash-map"]], ["Least recently used cache", ["ood-lru-cache"]], ["Call center", ["ood-call-center"]], ["Deck of cards", ["ood-deck-of-cards"]], ["Parking lot", ["ood-parking-lot"]], ["Chat server", ["ood-chat-server", "s:chat"]], ["Circular array", ["ood-circular-array"]]] }
    ]
  };

  /* Landmark papers behind real-world architectures (titles + original one-liners) */
  SD.papers = [
    ["The Google File System", "Google, 2003", "A distributed filesystem for huge files on commodity hardware; the ancestor of HDFS.", ["mapreduce"]],
    ["MapReduce: Simplified Data Processing on Large Clusters", "Google, 2004", "The map/shuffle/reduce model and re-runnable tasks for batch processing.", ["mapreduce", "batch-joins"]],
    ["Bigtable: A Distributed Storage System for Structured Data", "Google, 2006", "The wide-column model on SSTables and LSM-style storage (→ HBase, Cassandra's data model).", ["storage-engines", "d:widecolumn"]],
    ["The Chubby Lock Service", "Google, 2006", "A Paxos-based lock and coordination service (→ ZooKeeper).", ["coordination-services", "leader-election-locks"]],
    ["Dynamo: Amazon's Highly Available Key-value Store", "Amazon, 2007", "Consistent hashing, quorums, vector clocks, hinted handoff.", ["s:kv-store", "quorum", "concurrent-writes"]],
    ["Cassandra: A Decentralized Structured Storage System", "Facebook, 2009", "Dynamo-style distribution combined with the Bigtable data model.", ["d:widecolumn", "gossip"]],
    ["Finding a Needle in Haystack", "Facebook, 2010", "Photo storage that packs many images into large files to cut metadata I/O.", ["s:photo-sharing"]],
    ["Dremel: Interactive Analysis of Web-Scale Datasets", "Google, 2010", "Nested columnar storage and tree-structured query execution (→ BigQuery, Parquet).", ["column-storage"]],
    ["Kafka: a Distributed Messaging System for Log Processing", "LinkedIn, 2011", "The partitioned, replicated log as a messaging primitive.", ["queues-pubsub", "total-order-broadcast"]],
    ["Spanner: Google's Globally-Distributed Database", "Google, 2012", "TrueTime and externally consistent distributed transactions.", ["unreliable-clocks", "d:newsql"]],
    ["TAO: Facebook's Distributed Data Store for the Social Graph", "Facebook, 2013", "A read-optimised graph cache over sharded MySQL.", ["s:social-graph"]],
    ["Scaling Memcache at Facebook", "Facebook, 2013", "Leases, regional pools and invalidation pipelines for a huge cache tier.", ["s:distributed-cache", "cache-problems"]],
    ["In Search of an Understandable Consensus Algorithm (Raft)", "Stanford, 2014", "Leader election and log replication designed for understandability.", ["consensus"]],
    ["Large-scale Cluster Management at Google with Borg", "Google, 2015", "Cluster scheduling and resource isolation (→ Kubernetes).", ["serverless"]],
    ["Zanzibar: Google's Consistent, Global Authorization System", "Google, 2019", "Relationship-based access control at global scale.", ["authn-authz"]],
    ["Time, Clocks, and the Ordering of Events in a Distributed System", "Lamport, 1978", "Happens-before and logical clocks.", ["ordering-causality", "clocks"]]
  ];
})();
