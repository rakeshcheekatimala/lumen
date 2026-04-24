"""Parses OpenAPI/Swagger specs and converts them to ServiceNode models."""
import yaml
from graph.models import ServiceNode, EndpointModel, FieldModel, ServiceEdge


def _parse_schema_fields(schema: dict, spec: dict) -> list[FieldModel]:
    """Resolve $ref and extract fields from a schema object."""
    if not schema:
        return []

    if "$ref" in schema:
        ref_path = schema["$ref"].lstrip("#/").split("/")
        resolved = spec
        for part in ref_path:
            resolved = resolved.get(part, {})
        return _parse_schema_fields(resolved, spec)

    fields = []
    properties = schema.get("properties", {})
    required_fields = schema.get("required", [])

    for field_name, field_schema in properties.items():
        field_type = field_schema.get("type", "object")
        if "$ref" in field_schema:
            field_type = "object"
        fields.append(FieldModel(
            name=field_name,
            type=field_type,
            required=field_name in required_fields,
            description=field_schema.get("description", ""),
        ))
    return fields


def parse_openapi_spec(spec_content: str, service_id: str, team: str) -> tuple[ServiceNode, list[ServiceEdge]]:
    """Parse an OpenAPI YAML spec into a ServiceNode."""
    spec = yaml.safe_load(spec_content)

    info = spec.get("info", {})
    service_name = info.get("title", service_id)
    description = info.get("description", "")
    language = info.get("x-language", "unknown")
    port = int(spec.get("servers", [{}])[0].get("url", "http://localhost:8080").rsplit(":", 1)[-1].split("/")[0] or 8080)

    endpoints = []
    paths = spec.get("paths", {})

    for path, path_item in paths.items():
        for method, operation in path_item.items():
            if method not in ("get", "post", "put", "delete", "patch"):
                continue

            endpoint_id = f"{service_id}-{path.strip('/').replace('/', '-')}-{method}"
            request_fields = []
            response_fields = []

            # Request body
            request_body = operation.get("requestBody", {})
            if request_body:
                content = request_body.get("content", {})
                schema = (
                    content.get("application/json", {}).get("schema", {})
                    or content.get("application/x-www-form-urlencoded", {}).get("schema", {})
                )
                request_fields = _parse_schema_fields(schema, spec)

            # Response body (200 or 201)
            responses = operation.get("responses", {})
            for status_code in ("200", "201"):
                if status_code in responses:
                    content = responses[status_code].get("content", {})
                    schema = content.get("application/json", {}).get("schema", {})
                    response_fields = _parse_schema_fields(schema, spec)
                    break

            endpoints.append(EndpointModel(
                id=endpoint_id,
                path=path,
                method=method.upper(),
                description=operation.get("summary", ""),
                request_fields=request_fields,
                response_fields=response_fields,
            ))

    service = ServiceNode(
        id=service_id,
        name=service_name,
        language=language,
        team=team,
        description=description,
        port=port,
        endpoints=endpoints,
    )

    # No edges inferred from spec alone — caller provides them
    return service, []
