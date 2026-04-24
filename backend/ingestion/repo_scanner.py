"""
Generic repository scanner: discovers microservice boundaries and
inter-service dependency edges from source code, Docker, k8s configs,
Helm values, and application config files.

Reusable pattern for ANY repository:
    scanner = RepoScanner("/path/to/repo")
    nodes, edges = scanner.scan()
"""
import json
import re
import yaml
from pathlib import Path
from dataclasses import dataclass
from graph.models import ServiceNode, ServiceEdge


# ── Constants ─────────────────────────────────────────────────────────────────

_SKIP_DIRS = frozenset({
    "node_modules", ".git", "vendor", "venv", ".venv", "__pycache__",
    "dist", "build", ".next", "target", ".gradle", ".idea", ".vscode",
    "coverage", ".nyc_output", "tmp", ".cache",
})

_CODE_EXT = frozenset({
    ".py", ".go", ".ts", ".tsx", ".js", ".jsx",
    ".java", ".kt", ".rs", ".rb", ".php", ".cs",
})

_EXT_LANG = {
    ".py": "Python", ".go": "Go",
    ".ts": "TypeScript", ".tsx": "TypeScript",
    ".js": "JavaScript", ".jsx": "JavaScript",
    ".java": "Java", ".kt": "Kotlin",
    ".rs": "Rust", ".rb": "Ruby",
    ".php": "PHP", ".cs": ".NET",
    ".cpp": "C++", ".c": "C", ".scala": "Scala",
}

_INTERNAL_HOSTS = frozenset({"localhost", "127.0.0.1", "0.0.0.0", "::1"})
_JUNK_HOSTS = frozenset({
    "example.com", "schema.org", "json-schema.org", "openapi.org",
    "swagger.io", "w3.org", "ietf.org",
})


# ── Patterns ──────────────────────────────────────────────────────────────────

# Literal http(s) URL with a hostname
_RE_URL = re.compile(
    r'["\']https?://([a-z0-9][a-z0-9_\-\.]*[a-z0-9])(?::\d+)?(?:/[^"\']*)?["\']',
    re.IGNORECASE,
)

# Env var references that hint at a downstream service
_RE_ENV_VAR = re.compile(
    r'(?:os\.environ\.get|os\.getenv|os\.Getenv|System\.getenv|process\.env)'
    r'[\[\(]["\']([A-Z][A-Z0-9_]*(?:_URL|_HOST|_ADDR|_ENDPOINT|_BASE|_SERVICE))["\']',
    re.IGNORECASE,
)

# gRPC dial / channel creation
_RE_GRPC = re.compile(
    r'(?:grpc\.Dial|grpc\.dial|grpc\.insecure_channel|grpc\.secure_channel'
    r'|ManagedChannelBuilder\.forAddress|newChannel)\s*\(\s*["\']?'
    r'([a-z0-9][a-z0-9_\-\.]*[a-z0-9])(?::\d+)?["\']?',
    re.IGNORECASE,
)

# HTTP client calls (Python requests/httpx, JS fetch/axios, Go http, Java RestTemplate)
_RE_HTTP_CALL = re.compile(
    r'(?:requests\.|httpx\.|axios\.|fetch\s*\(|got\s*\(|http\.Get\s*\(|http\.Post\s*\('
    r'|RestTemplate|WebClient|urllib\.request\.)'
    r'[^"\']{0,40}["\']https?://([a-z0-9][a-z0-9_\-\.]*[a-z0-9])(?::\d+)?',
    re.IGNORECASE,
)

# Kafka producer
_RE_KAFKA_PROD = re.compile(
    r'(?:producer\.(?:produce|send|publish)|KafkaProducer|kafka\.send)\s*\(\s*["\']'
    r'([a-z0-9][a-z0-9_\-\.]*)["\']',
    re.IGNORECASE,
)

# Kafka consumer
_RE_KAFKA_CONS = re.compile(
    r'(?:consumer\.subscribe|consumer\.assign|KafkaConsumer)\s*\(\s*\[?\s*["\']'
    r'([a-z0-9][a-z0-9_\-\.]*)["\']',
    re.IGNORECASE,
)

# Spring @FeignClient annotation
_RE_FEIGN = re.compile(
    r'@FeignClient\s*\(\s*(?:name\s*=\s*)?["\']([a-z0-9][a-z0-9_\-]*)["\']',
    re.IGNORECASE,
)

# AMQP / RabbitMQ
_RE_AMQP = re.compile(
    r'(?:channel\.(?:queue_declare|basic_publish|exchange_declare)|amqp\.Dial)\s*\(\s*["\']'
    r'([a-z0-9][a-z0-9_\-\.]*)["\']',
    re.IGNORECASE,
)


@dataclass
class CallRef:
    target: str     # raw: hostname, env-var name, topic name
    protocol: str   # http | grpc | kafka | amqp
    file: str
    line: int


# ── Config-file signal detection ──────────────────────────────────────────────

# Config file names (Helm, Spring Boot, .NET, generic, .env)
_CONFIG_FILE_NAMES = frozenset({
    # Helm
    "values.yaml", "values.yml",
    "values-dev.yaml", "values-staging.yaml", "values-prod.yaml",
    "values-local.yaml",
    # Spring Boot
    "application.yaml", "application.yml",
    "application-dev.yaml", "application-prod.yaml",
    "application.properties", "bootstrap.yaml", "bootstrap.yml",
    # .NET
    "appsettings.json", "appsettings.Development.json",
    "appsettings.Production.json", "appsettings.Staging.json",
    # Generic
    "config.yaml", "config.yml", "config.json",
    "settings.yaml", "settings.yml", "settings.json",
    "service.yaml", "service.yml",
    # Env files
    ".env", ".env.example", ".env.local",
    ".env.development", ".env.production", ".env.staging",
    # Python
    "pyproject.toml",
})

# Key segments that hint the value is a service URL/host
_SERVICE_KEY_RE = re.compile(
    r'(?:url|uri|host|addr(?:ess)?|endpoint|base[_\-]?url'
    r'|service[_\-]?url|service[_\-]?host|backend|server|target|remote)',
    re.IGNORECASE,
)

# URL value in a config file (no surrounding quotes required)
_CONFIG_URL_RE = re.compile(
    r'https?://([a-z0-9][a-z0-9_\-\.]*[a-z0-9])(?::\d+)?(?:/[^\s]*)?',
    re.IGNORECASE,
)

# Bare hostname[:port] value — no slashes, no dots, looks like k8s service name
_BARE_HOST_RE = re.compile(
    r'^([a-z0-9][a-z0-9_\-]*[a-z0-9])(?::\d+)?$',
    re.IGNORECASE,
)

# key=value line in .env / .properties files
_ENV_LINE_RE = re.compile(
    r'^([A-Za-z][A-Za-z0-9_\-\.]*)\s*[=:]\s*(.+)$',
)

# Helm template placeholder — skip these values
_HELM_TMPL_RE = re.compile(r'\{\{')

# gRPC address pattern in config values
_CONFIG_GRPC_RE = re.compile(
    r'^([a-z0-9][a-z0-9_\-]*[a-z0-9]):\d{4,5}$',
    re.IGNORECASE,
)


def _flatten_yaml(obj: object, prefix: str = "") -> list[tuple[str, str]]:
    """
    Recursively walk a parsed YAML/JSON object, yielding (dotted.key, str_value).
    Skips Helm template expressions ({{ ... }}).
    """
    results: list[tuple[str, str]] = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            path = f"{prefix}.{k}" if prefix else str(k)
            results.extend(_flatten_yaml(v, path))
    elif isinstance(obj, list):
        for item in obj:
            results.extend(_flatten_yaml(item, prefix))
    elif isinstance(obj, str) and obj.strip() and not _HELM_TMPL_RE.search(obj):
        results.append((prefix, obj.strip()))
    elif isinstance(obj, (int, float)) and prefix:
        results.append((prefix, str(obj)))
    return results


class ConfigScanner:
    """
    Extracts inter-service dependency signals from config files:
      - Helm values.yaml and templates/configmap.yaml
      - k8s ConfigMap manifests
      - Spring Boot application.yaml / application.properties
      - .NET appsettings.json
      - Generic config.yaml / config.json
      - .env and .env.* files
    """

    def __init__(self, known: set[str]):
        self.known = known

    # ── per-format scanners ───────────────────────────────────────────────────

    def _refs_from_kv_pairs(
        self, pairs: list[tuple[str, str]], source: str
    ) -> list[CallRef]:
        """
        Given (key, value) pairs from any config file, emit CallRefs where
        the key suggests a service address and the value contains a hostname.
        """
        refs: list[CallRef] = []
        for key, value in pairs:
            # Key must mention a service-address concept
            key_leaf = key.split(".")[-1]
            if not _SERVICE_KEY_RE.search(key_leaf) and not _SERVICE_KEY_RE.search(key):
                continue

            # Value contains an http URL
            for m in _CONFIG_URL_RE.finditer(value):
                refs.append(CallRef(m.group(1), "http", source, 0))

            # Value is a bare hostname[:port] — could be gRPC or http
            stripped = value.strip('"\'')
            if _BARE_HOST_RE.match(stripped):
                host = stripped.split(":")[0]
                proto = "grpc" if _CONFIG_GRPC_RE.match(stripped) else "http"
                refs.append(CallRef(host, proto, source, 0))

        # Also scan ALL values for http URLs regardless of key (env files especially)
        for key, value in pairs:
            for m in _CONFIG_URL_RE.finditer(value):
                refs.append(CallRef(m.group(1), "http", source, 0))

            # Env-var style key pointing to a service
            upper_key = key.upper().replace(".", "_").replace("-", "_")
            if any(upper_key.endswith(s) for s in (
                "_URL", "_HOST", "_ADDR", "_ENDPOINT", "_BASE", "_SERVICE", "_URI",
            )):
                target = _env_var_to_service(upper_key, self.known)
                if target:
                    refs.append(CallRef(target, "http", source, 0))

        return refs

    def scan_yaml_file(self, path: Path) -> list[CallRef]:
        try:
            data = yaml.safe_load(path.read_text(errors="replace"))
        except Exception:
            return []
        if not data:
            return []
        pairs = _flatten_yaml(data)
        return self._refs_from_kv_pairs(pairs, str(path))

    def scan_json_file(self, path: Path) -> list[CallRef]:
        try:
            data = json.loads(path.read_text(errors="replace"))
        except Exception:
            return []
        pairs = _flatten_yaml(data)  # works for dicts/lists too
        return self._refs_from_kv_pairs(pairs, str(path))

    def scan_env_file(self, path: Path) -> list[CallRef]:
        """Parse .env / application.properties style key=value files."""
        refs: list[CallRef] = []
        try:
            lines = path.read_text(errors="replace").splitlines()
        except Exception:
            return []
        pairs: list[tuple[str, str]] = []
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = _ENV_LINE_RE.match(line)
            if m:
                pairs.append((m.group(1), m.group(2).strip().strip('"\'').strip()))
        return self._refs_from_kv_pairs(pairs, str(path))

    def scan_configmap_doc(self, doc: dict, source: str) -> list[CallRef]:
        """Extract refs from a k8s ConfigMap data: section."""
        data = doc.get("data") or {}
        pairs: list[tuple[str, str]] = []
        for k, v in data.items():
            if isinstance(v, str):
                # Multiline values (| block) may contain multiple lines
                for line in v.splitlines():
                    line = line.strip()
                    if line:
                        pairs.append((k, line))
            elif v is not None:
                pairs.append((k, str(v)))
        return self._refs_from_kv_pairs(pairs, source)

    def scan_helm_chart(self, chart_dir: Path) -> list[CallRef]:
        """Scan a Helm chart directory: values*.yaml + templates/configmap*.yaml."""
        refs: list[CallRef] = []
        # values files
        for f in chart_dir.glob("values*.yaml"):
            refs.extend(self.scan_yaml_file(f))
        for f in chart_dir.glob("values*.yml"):
            refs.extend(self.scan_yaml_file(f))

        # ConfigMap templates
        tmpl_dir = chart_dir / "templates"
        if tmpl_dir.exists():
            for f in tmpl_dir.rglob("*.yaml"):
                try:
                    docs = list(yaml.safe_load_all(f.read_text(errors="replace")))
                except Exception:
                    continue
                for doc in docs:
                    if isinstance(doc, dict) and doc.get("kind") == "ConfigMap":
                        refs.extend(self.scan_configmap_doc(doc, str(f)))
        return refs

    # ── directory scan ────────────────────────────────────────────────────────

    def scan_dir(self, root: Path) -> list[CallRef]:
        """Scan all config files under a service root directory."""
        refs: list[CallRef] = []
        if not root.exists():
            return refs

        # Check if this dir is a Helm chart root
        if (root / "Chart.yaml").exists():
            refs.extend(self.scan_helm_chart(root))

        for f in root.rglob("*"):
            if not f.is_file() or _skip(f):
                continue
            name = f.name.lower()

            if name in {n.lower() for n in _CONFIG_FILE_NAMES}:
                if f.suffix in (".yaml", ".yml"):
                    refs.extend(self.scan_yaml_file(f))
                elif f.suffix == ".json":
                    refs.extend(self.scan_json_file(f))
                elif f.suffix == ".properties" or f.name.startswith(".env"):
                    refs.extend(self.scan_env_file(f))
                elif f.suffix == ".toml":
                    refs.extend(self.scan_env_file(f))  # TOML is close enough for key=value

            elif name.endswith(".yaml") or name.endswith(".yml"):
                # Catch any k8s ConfigMap manifests not already in _CONFIG_FILE_NAMES
                try:
                    docs = list(yaml.safe_load_all(f.read_text(errors="replace")))
                except Exception:
                    continue
                for doc in docs:
                    if isinstance(doc, dict) and doc.get("kind") == "ConfigMap":
                        refs.extend(self.scan_configmap_doc(doc, str(f)))

        return refs

    def resolve(self, refs: list[CallRef]) -> list[tuple[str, str]]:
        """Return deduplicated (target_service_id, protocol) pairs."""
        resolved: set[tuple[str, str]] = set()
        for ref in refs:
            target = None
            if ref.target.upper() == ref.target and "_" in ref.target:
                target = _env_var_to_service(ref.target, self.known)
            else:
                target = _hostname_to_service(ref.target, self.known)
            if target and target in self.known:
                resolved.add((target, ref.protocol))
        return list(resolved)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _skip(path: Path) -> bool:
    return any(p in _SKIP_DIRS for p in path.parts)


def _env_var_to_service(var: str, known: set[str]) -> str | None:
    """Convert PAYMENT_SERVICE_URL → payment-service → match known service."""
    for suffix in (
        "_SERVICE_URL", "_SERVICE_HOST", "_SERVICE_ADDR",
        "_URL", "_HOST", "_ADDR", "_ENDPOINT", "_BASE",
    ):
        if var.upper().endswith(suffix):
            candidate = var[: -len(suffix)].lower().replace("_", "-")
            if candidate in known:
                return candidate
            for sid in known:
                if sid.startswith(candidate) or candidate.startswith(sid):
                    return sid
    return None


def _hostname_to_service(host: str, known: set[str]) -> str | None:
    """Fuzzy-match a hostname to a known service id."""
    host = host.lower().strip(".")
    if host in _INTERNAL_HOSTS or host in _JUNK_HOSTS or "." in host:
        return None
    if host in known:
        return host
    norm = host.replace("_", "-")
    if norm in known:
        return norm
    for sid in known:
        if norm.startswith(sid) or sid.startswith(norm):
            return sid
    return None


def _detect_language(root: Path) -> str:
    counts: dict[str, int] = {}
    try:
        for f in root.rglob("*"):
            if f.is_file() and f.suffix in _EXT_LANG and not _skip(f):
                lang = _EXT_LANG[f.suffix]
                counts[lang] = counts.get(lang, 0) + 1
    except Exception:
        pass
    return max(counts, key=counts.get) if counts else "unknown"


def _compute_risk_scores(nodes: list[ServiceNode], edges: list[ServiceEdge]) -> None:
    in_deg: dict[str, int] = {n.id: 0 for n in nodes}
    for e in edges:
        if e.target in in_deg:
            in_deg[e.target] += 1
    max_d = max(in_deg.values(), default=1) or 1
    for n in nodes:
        n.risk_score = round(in_deg.get(n.id, 0) / max_d, 2)


# ── Service Discovery ─────────────────────────────────────────────────────────

class ServiceDiscovery:
    """Finds service boundaries in a repository via config files."""

    def __init__(self, repo: Path):
        self.repo = repo

    def from_docker_compose(self) -> list[dict]:
        results = []
        for dc in self.repo.rglob("docker-compose*.yml"):
            if _skip(dc):
                continue
            try:
                data = yaml.safe_load(dc.read_text()) or {}
            except Exception:
                continue
            for name, cfg in (data.get("services") or {}).items():
                cfg = cfg or {}
                build = cfg.get("build", {})
                if isinstance(build, str):
                    root = (dc.parent / build).resolve()
                elif isinstance(build, dict):
                    root = (dc.parent / build.get("context", ".")).resolve()
                else:
                    root = dc.parent / name

                ports = []
                for p in cfg.get("ports", []):
                    s = str(p)
                    try:
                        ports.append(int(s.split(":")[-1].split("/")[0]))
                    except ValueError:
                        pass

                depends_on = cfg.get("depends_on", [])
                if isinstance(depends_on, dict):
                    depends_on = list(depends_on.keys())

                results.append({
                    "id": name,
                    "name": name,
                    "root": root if root.exists() else dc.parent,
                    "ports": ports,
                    "depends_on": depends_on,
                    "source": f"docker-compose:{dc.relative_to(self.repo)}",
                    "team": "unknown",
                })
        return results

    def from_k8s_manifests(self) -> list[dict]:
        results = []
        for f in self.repo.rglob("*.yaml"):
            if _skip(f):
                continue
            try:
                docs = list(yaml.safe_load_all(f.read_text()))
            except Exception:
                continue
            for doc in docs:
                if not isinstance(doc, dict):
                    continue
                if doc.get("kind") not in ("Deployment", "StatefulSet", "DaemonSet"):
                    continue
                meta = doc.get("metadata") or {}
                name = meta.get("name", "")
                if not name:
                    continue
                labels = meta.get("labels") or {}
                results.append({
                    "id": name,
                    "name": labels.get("app", name),
                    "root": f.parent,
                    "ports": [],
                    "depends_on": [],
                    "source": f"k8s:{f.relative_to(self.repo)}",
                    "team": labels.get("team", "unknown"),
                })
        return results

    def from_helm_charts(self) -> list[dict]:
        """Each directory containing Chart.yaml = a Helm-deployed service."""
        results = []
        for chart_file in self.repo.rglob("Chart.yaml"):
            if _skip(chart_file):
                continue
            chart_dir = chart_file.parent
            try:
                meta = yaml.safe_load(chart_file.read_text()) or {}
            except Exception:
                meta = {}
            name = meta.get("name", chart_dir.name)
            team = meta.get("maintainers", [{}])[0].get("name", "unknown") if meta.get("maintainers") else "unknown"
            results.append({
                "id": name,
                "name": name,
                "root": chart_dir,
                "ports": [],
                "depends_on": [],
                "source": f"helm:{chart_file.relative_to(self.repo)}",
                "team": team,
                "helm_dir": chart_dir,
            })
        return results

    def from_dockerfiles(self) -> list[dict]:
        results = []
        for df in self.repo.rglob("Dockerfile"):
            if _skip(df) or df.parent == self.repo:
                continue
            svc_dir = df.parent
            results.append({
                "id": svc_dir.name,
                "name": svc_dir.name,
                "root": svc_dir,
                "ports": [],
                "depends_on": [],
                "source": f"dockerfile:{df.relative_to(self.repo)}",
                "team": "unknown",
            })
        return results

    def discover(self) -> list[dict]:
        seen: dict[str, dict] = {}
        for strategy in (
            self.from_docker_compose,
            self.from_helm_charts,
            self.from_k8s_manifests,
            self.from_dockerfiles,
        ):
            for svc in strategy():
                if svc["id"] not in seen:
                    seen[svc["id"]] = svc
        return list(seen.values())


# ── Call Scanner ──────────────────────────────────────────────────────────────

class CallScanner:
    """Scans source files for outgoing service calls."""

    def __init__(self, known: set[str]):
        self.known = known

    def scan_file(self, path: Path) -> list[CallRef]:
        try:
            text = path.read_text(errors="replace")
        except Exception:
            return []
        refs = []
        for i, line in enumerate(text.splitlines(), 1):
            for m in _RE_GRPC.finditer(line):
                refs.append(CallRef(m.group(1), "grpc", str(path), i))
            for m in _RE_URL.finditer(line):
                refs.append(CallRef(m.group(1), "http", str(path), i))
            for m in _RE_HTTP_CALL.finditer(line):
                refs.append(CallRef(m.group(1), "http", str(path), i))
            for m in _RE_ENV_VAR.finditer(line):
                refs.append(CallRef(m.group(1), "http", str(path), i))
            for m in _RE_KAFKA_PROD.finditer(line):
                refs.append(CallRef(m.group(1), "kafka", str(path), i))
            for m in _RE_KAFKA_CONS.finditer(line):
                refs.append(CallRef(m.group(1), "kafka", str(path), i))
            for m in _RE_FEIGN.finditer(line):
                refs.append(CallRef(m.group(1), "http", str(path), i))
            for m in _RE_AMQP.finditer(line):
                refs.append(CallRef(m.group(1), "amqp", str(path), i))
        return refs

    def scan_dir(self, root: Path) -> list[CallRef]:
        refs = []
        if not root.exists():
            return refs
        for f in root.rglob("*"):
            if f.is_file() and f.suffix in _CODE_EXT and not _skip(f):
                refs.extend(self.scan_file(f))
        return refs

    def resolve(self, refs: list[CallRef]) -> list[tuple[str, str]]:
        """Return deduplicated (target_service_id, protocol) pairs."""
        resolved = set()
        for ref in refs:
            target = None
            if ref.protocol == "kafka":
                # Topic name → service id (best-effort)
                target = _hostname_to_service(ref.target, self.known)
            elif ref.target.upper() == ref.target and "_" in ref.target:
                # Looks like an env var name
                target = _env_var_to_service(ref.target, self.known)
            else:
                target = _hostname_to_service(ref.target, self.known)

            if target and target in self.known:
                resolved.add((target, ref.protocol))
        return list(resolved)


# ── Top-level scanner ─────────────────────────────────────────────────────────

class RepoScanner:
    """
    Discovers microservices and their dependency edges from any repository.

    Usage:
        nodes, edges = RepoScanner("/path/to/repo").scan()

    Works via three signals (highest → lowest confidence):
        1. docker-compose depends_on        → definite edge
        2. Static code patterns             → http/grpc/kafka calls
        3. Env-var references               → inferred edges
    """

    def __init__(self, repo_path: str):
        self.repo = Path(repo_path).resolve()
        if not self.repo.exists():
            raise ValueError(f"Repo not found: {repo_path}")

    def scan(self) -> tuple[list[ServiceNode], list[ServiceEdge]]:
        raw = ServiceDiscovery(self.repo).discover()

        # Fallback: treat whole repo as one service
        if not raw:
            raw = [{
                "id": self.repo.name,
                "name": self.repo.name,
                "root": self.repo,
                "ports": [],
                "depends_on": [],
                "source": "root",
                "team": "unknown",
            }]

        known: set[str] = {s["id"] for s in raw}
        code_scanner = CallScanner(known)
        cfg_scanner = ConfigScanner(known)
        seen_edges: set[tuple[str, str]] = set()

        nodes: list[ServiceNode] = []
        edges: list[ServiceEdge] = []

        for svc in raw:
            nodes.append(ServiceNode(
                id=svc["id"],
                name=svc["name"],
                language=_detect_language(svc["root"]),
                team=svc["team"],
                description=f"Discovered via {svc['source']}",
                port=svc["ports"][0] if svc["ports"] else 8080,
            ))

            # Signal 1: docker-compose depends_on → highest confidence
            for dep in svc.get("depends_on", []):
                key = (svc["id"], dep)
                if dep in known and key not in seen_edges:
                    edges.append(ServiceEdge(
                        source=svc["id"],
                        target=dep,
                        protocol="http",
                        label="depends_on",
                    ))
                    seen_edges.add(key)

            # Signal 2: config files — Helm values, ConfigMaps, .env, app configs
            helm_dir: Path | None = svc.get("helm_dir")
            cfg_root = helm_dir if helm_dir else svc["root"]
            for target, proto in cfg_scanner.resolve(cfg_scanner.scan_dir(cfg_root)):
                key = (svc["id"], target)
                if target != svc["id"] and key not in seen_edges:
                    edges.append(ServiceEdge(
                        source=svc["id"],
                        target=target,
                        protocol=proto,
                        label="config",
                    ))
                    seen_edges.add(key)

            # Signal 3: static source code analysis
            for target, proto in code_scanner.resolve(code_scanner.scan_dir(svc["root"])):
                key = (svc["id"], target)
                if target != svc["id"] and key not in seen_edges:
                    edges.append(ServiceEdge(
                        source=svc["id"],
                        target=target,
                        protocol=proto,
                    ))
                    seen_edges.add(key)

        _compute_risk_scores(nodes, edges)
        return nodes, edges
