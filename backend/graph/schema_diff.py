"""Semantic OpenAPI spec diff — classifies changes as breaking vs non-breaking."""
import yaml
from graph.models import SchemaChange, SchemaDiffResult


def _parse(spec_text: str) -> dict:
    try:
        return yaml.safe_load(spec_text) or {}
    except yaml.YAMLError:
        return {}


def _resolve_ref(spec: dict, schema: dict) -> dict:
    if not isinstance(schema, dict):
        return {}
    if "$ref" in schema:
        parts = schema["$ref"].lstrip("#/").split("/")
        resolved = spec
        for p in parts:
            resolved = resolved.get(p, {}) if isinstance(resolved, dict) else {}
        return resolved
    return schema


def _collect_fields(spec: dict, schema: dict, prefix: str = "") -> dict[str, dict]:
    """Flatten schema into {dot.path: {type, required}}."""
    schema = _resolve_ref(spec, schema)
    if not schema:
        return {}

    out: dict[str, dict] = {}
    props = schema.get("properties", {}) if isinstance(schema, dict) else {}
    required = set(schema.get("required", []))

    for name, sub in props.items():
        path = f"{prefix}.{name}" if prefix else name
        sub_resolved = _resolve_ref(spec, sub)
        field_type = sub_resolved.get("type", "object") if isinstance(sub_resolved, dict) else "unknown"
        out[path] = {"type": field_type, "required": name in required}
        if field_type == "object" and isinstance(sub_resolved, dict):
            out.update(_collect_fields(spec, sub_resolved, path))
    return out


def _extract_operations(spec: dict) -> dict[str, dict]:
    """{'POST /Charge': {request_fields: {...}, response_fields: {...}}}"""
    ops = {}
    paths = spec.get("paths", {})
    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue
        for method, op in path_item.items():
            if method.lower() not in ("get", "post", "put", "delete", "patch"):
                continue
            key = f"{method.upper()} {path}"

            req_schema = (
                op.get("requestBody", {})
                .get("content", {})
                .get("application/json", {})
                .get("schema", {})
            )
            request_fields = _collect_fields(spec, req_schema)

            resp_schema = {}
            for code in ("200", "201"):
                if code in op.get("responses", {}):
                    resp_schema = (
                        op["responses"][code]
                        .get("content", {})
                        .get("application/json", {})
                        .get("schema", {})
                    )
                    break
            response_fields = _collect_fields(spec, resp_schema)

            ops[key] = {"request_fields": request_fields, "response_fields": response_fields}
    return ops


def diff_specs(old_text: str, new_text: str, service_id: str | None = None) -> SchemaDiffResult:
    old = _parse(old_text)
    new = _parse(new_text)
    old_ops = _extract_operations(old)
    new_ops = _extract_operations(new)

    changes: list[SchemaChange] = []

    # Endpoint-level
    for op_key in old_ops:
        if op_key not in new_ops:
            changes.append(SchemaChange(
                change_type="endpoint_removed",
                location=op_key,
                is_breaking=True,
                severity="critical",
                reason="Callers hitting this endpoint will get 404.",
            ))
    for op_key in new_ops:
        if op_key not in old_ops:
            changes.append(SchemaChange(
                change_type="endpoint_added",
                location=op_key,
                is_breaking=False,
                severity="info",
                reason="New endpoint — additive, safe.",
            ))

    # Field-level within shared endpoints
    for op_key in sorted(set(old_ops) & set(new_ops)):
        for side in ("request_fields", "response_fields"):
            old_fields = old_ops[op_key][side]
            new_fields = new_ops[op_key][side]
            side_label = "request" if side == "request_fields" else "response"

            for field_path, old_meta in old_fields.items():
                location = f"{op_key} → {side_label}.{field_path}"
                if field_path not in new_fields:
                    # Removal
                    if side == "response_fields":
                        changes.append(SchemaChange(
                            change_type="field_removed",
                            location=location,
                            old_value=f"{old_meta['type']}{'*' if old_meta['required'] else ''}",
                            is_breaking=True,
                            severity="critical",
                            reason="Response field removal breaks downstream consumers that read this field.",
                        ))
                    else:  # request
                        changes.append(SchemaChange(
                            change_type="field_removed",
                            location=location,
                            old_value=f"{old_meta['type']}{'*' if old_meta['required'] else ''}",
                            is_breaking=old_meta["required"],
                            severity="high" if old_meta["required"] else "low",
                            reason="Required request field removed — server may still require it in code."
                                   if old_meta["required"] else
                                   "Optional request field removed — low impact.",
                        ))
                else:
                    new_meta = new_fields[field_path]
                    # Type change
                    if old_meta["type"] != new_meta["type"]:
                        changes.append(SchemaChange(
                            change_type="type_changed",
                            location=location,
                            old_value=old_meta["type"],
                            new_value=new_meta["type"],
                            is_breaking=True,
                            severity="high",
                            reason="Type change breaks serialization on both sides.",
                        ))
                    # Required flag change
                    if old_meta["required"] != new_meta["required"]:
                        became_required = not old_meta["required"] and new_meta["required"]
                        changes.append(SchemaChange(
                            change_type="required_changed",
                            location=location,
                            old_value="optional" if not old_meta["required"] else "required",
                            new_value="required" if new_meta["required"] else "optional",
                            is_breaking=became_required and side == "request_fields",
                            severity="high" if became_required and side == "request_fields" else "low",
                            reason="Making a request field required breaks existing clients."
                                   if became_required and side == "request_fields" else
                                   "Relaxing requirements is backwards-compatible.",
                        ))

            for field_path, new_meta in new_fields.items():
                if field_path not in old_fields:
                    location = f"{op_key} → {side_label}.{field_path}"
                    is_breaking = side == "request_fields" and new_meta["required"]
                    changes.append(SchemaChange(
                        change_type="field_added",
                        location=location,
                        new_value=f"{new_meta['type']}{'*' if new_meta['required'] else ''}",
                        is_breaking=is_breaking,
                        severity="high" if is_breaking else "info",
                        reason="New required request field — old clients won't send it."
                               if is_breaking else "Additive field — safe.",
                    ))

    breaking = sum(1 for c in changes if c.is_breaking)
    return SchemaDiffResult(
        changes=changes,
        breaking_count=breaking,
        total_count=len(changes),
        service_id=service_id,
    )
