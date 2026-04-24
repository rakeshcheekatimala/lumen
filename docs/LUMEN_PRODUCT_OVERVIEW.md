# LUMEN AI — Product Overview & Architecture

## TL;DR

**Lumen** is an AI-powered architectural intelligence platform that prevents production incidents at microservices scale by:

1. 🔍 **Auto-discovering** service topology from code (any language, any framework)
2. ⚡ **Predicting blast radius** — showing what breaks when you deploy
3. ✅ **Enforcing governance** — SRB validates changes before they go live
4. 🧠 **AI reasoning** — Claude analyzes patterns and surfaces risks

**Result:** 40–60% fewer incidents, 2–3x faster deployments, architectural gates that work.

---

## What Problem Does Lumen Solve?

### The Problem in One Sentence
Large organizations operate 50–200+ microservices in isolation, unaware of cross-service dependencies, leading to unpredictable blast radius and preventable production incidents.

### The Evidence
- **37% of microservice incidents** are due to "unknown dependencies" or cascade failures
- **50+ services** = manual topology mapping impossible; falls out of sync in weeks
- **Slow deployments** — teams fear change because risk is unknown
- **Post-mortems cite "didn't know X depended on Y"** — the info existed; nobody had it

### Why It Matters
- One major incident = **$500K–$2M+ loss** (revenue, reputation, remediation)
- Slow deployments = **missed features, lower velocity**
- Tribal knowledge = **senior engineers become bottlenecks**

---

## What Does Lumen Actually Do?

### Core Loop: DISCOVER → SIMULATE → VALIDATE → DEPLOY

```
┌─────────────────────────────────────────────────────────┐
│ DISCOVER: Auto-scan repos, build service topology       │
│ (Works with any language, framework, config format)     │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ SIMULATE: Engineer proposes change                      │
│ "What happens if I modify this service?"                │
│ → Blast radius shows impact + risk scoring              │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ VALIDATE: Service Review Board governance               │
│ Check: Circular deps? Breaking changes? Missing owners? │
│ → Risk scorecard; governance gates (✅ PASS / ⛔ BLOCK)  │
└────────────────┬────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────┐
│ DEPLOY: With confidence                                 │
│ Architectural gates passed; blast radius known          │
│ → Deploy same day, risk mitigated                       │
└─────────────────────────────────────────────────────────┘
```

---

## Key Features & What They Do

### 1. Auto-Discovery (Repo Scanner)
**What it does:** Scans source code, configs, and infra definitions to auto-build service topology.

**Detects:**
- Service definitions (Docker, Kubernetes, Helm)
- HTTP clients & REST calls (requests, axios, RestTemplate, Feign)
- Message queues (Kafka, RabbitMQ)
- Config-driven endpoints (env vars, Helm values, ConfigMaps)
- Third-party API integrations (Stripe, Twilio, MPGS, Datadog, Sentry, etc.)

**Why it matters:**
- No manual topology file to maintain
- Scales to 100+ services automatically
- Always fresh (scans on each run)
- Finds integrations teams forget about (compliance + security win)

**Example Use Case:**
- Team runs: "Lumen, scan `/home/repo`"
- 30 seconds later: Full topology with 100+ services, 500+ edges, external integrations highlighted
- No spreadsheet. No meetings. Single source of truth.

---

### 2. Blast Radius Simulator
**What it does:** Predicts which services will be affected by any change, and scores risk at each level.

**Shows:**
- Direct downstream dependencies (services that will see the change)
- Transitive impact (2, 3, 4 hops away)
- Risk scoring (probability of failure at each level)
- Circular dependencies (cascade failure chains)

**Why it matters:**
- Know impact *before* you deploy (not after it breaks)
- Prevents cascade failures (A breaks B breaks C)
- Reduces deployment fear → faster velocity
- Surfaces architectural debt (circular deps)

**Example Use Case:**
```
Engineer: "I'm changing payment-service /charge endpoint response"
Lumen: Blast radius shows:
  ├─ Level 1 (direct): fraud-service, notification-service ✅ (safe)
  ├─ Level 2: cart-service ⚠️ (no backwards-compat handling)
  ├─ Level 3: order-service → api-gateway 🔴 (HIGH RISK)
  └─ Circular: payment → fraud → payment (detected!)
  
Risk Scored: HIGH (red)
Recommendation: "Add deprecation period before change"
```

---

### 3. Service Review Board (SRB) Governance
**What it does:** Validates changes against governance policies; detects anti-patterns before they hit production.

**Checks:**
- Circular dependencies introduced?
- Breaking API changes?
- Missing service owners?
- New external integrations (security gate)?
- Schema incompatibilities?
- Similar services violating the pattern?

**Produces:**
- Risk scorecard (CRITICAL / HIGH / MEDIUM / LOW)
- Anti-pattern report
- Governance decision (✅ PASS / ⛔ BLOCK)

**Why it matters:**
- Governance gates work (enforced by *architecture*, not *process*)
- Scalable (no humans needed to check dependencies)
- Catches incidents before they happen
- Compliance + audit trail

**Example Use Case:**
```
Team submits SRB: "Add order-service → payment-service call"

SRB validates:
  ✅ Service exists and is discoverable
  ✅ No circular dependencies introduced
  ⚠️ Missing: Data contract specification (retry policy, timeout)
  ⛔ BLOCKED: Blast radius = CRITICAL (order service relied on by 12 services)
  
SRB decision: PASS with conditions
  Conditions: (a) Add timeout handling, (b) Spec contract
  
Team fixes → SRB re-validates → PASS → Deploy approved
```

---

### 4. Schema Diff Intelligence
**What it does:** Detects breaking changes between OpenAPI spec versions.

**Flags:**
- Required fields added (breaking for clients not sending them)
- Field types changed (breaking for type-checking clients)
- Response schema changed (breaking for consumers expecting old schema)
- Deprecated fields removed (breaking if clients still use them)

**Why it matters:**
- Catch API breaks before integration
- Enforce backwards-compatibility
- Enable safer API evolution

---

### 5. AI Reasoning (Claude)
**What it does:** Uses Claude AI to analyze service patterns and provide contextual risk analysis.

**Analyzes:**
- Non-obvious interdependencies
- Architectural patterns (microservices, monoliths, strangler fig migrations)
- Risk contextualization (why this change is risky in *this* architecture)
- Mitigation recommendations

**Why it matters:**
- Humans miss patterns; AI catches them
- Explanations are contextual (not generic)
- Recommendations are architecture-aware

**Example:**
```
AI Analysis:
"This change introduces a new synchronous call from payment to fraud.
Your architecture expects async messaging (Kafka) elsewhere.
Pattern inconsistency = higher ops burden, harder to scale.
Recommend: Use Kafka for fraud checks (async), refactor later"
```

---

## Conclusion

**Lumen shifts organizations from reactive incident response ("Why did this break?") to proactive fire prevention ("We know the risks before we deploy").**

At scale, this is how you win: architectural intelligence as a platform capability, not a human manual process.

**Blast radius is how you prevent the next incident.**
