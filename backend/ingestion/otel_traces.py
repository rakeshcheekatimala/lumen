"""Loads simulated OTEL trace data to enrich the dependency graph."""
import json
from pathlib import Path
from graph.models import ServiceEdge


def load_trace_edges(traces_path: str) -> list[ServiceEdge]:
    """
    Parse OTEL-format span data to discover runtime service dependencies.
    Each span with a peer.service attribute becomes a directed edge.
    """
    path = Path(traces_path)
    if not path.exists():
        return []

    with open(path) as f:
        data = json.load(f)

    edges: dict[tuple[str, str], ServiceEdge] = {}

    for trace in data.get("traces", []):
        for span in trace.get("spans", []):
            service = span.get("process", {}).get("serviceName", "")
            peer_service = span.get("tags", {}).get("peer.service", "")
            http_url = span.get("tags", {}).get("http.url", "")

            if service and peer_service and service != peer_service:
                key = (service, peer_service)
                if key not in edges:
                    edges[key] = ServiceEdge(
                        source=service,
                        target=peer_service,
                        protocol="http" if http_url else "grpc",
                        label="runtime-observed",
                    )

    return list(edges.values())
