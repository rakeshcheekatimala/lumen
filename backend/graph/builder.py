"""Builds the NetworkX dependency graph from service topology + parsed specs."""
import networkx as nx
from graph.models import ServiceNode, ServiceEdge, EndpointModel, FieldModel, DependencyGraph

# OTEL Demo service topology — ground truth for the hackathon demo
OTEL_SERVICES: list[ServiceNode] = [
    ServiceNode(
        id="frontend",
        name="Frontend",
        language="TypeScript",
        team="Platform",
        description="BFF and web UI for the e-commerce store",
        port=8080,
        endpoints=[
            EndpointModel(id="frontend-home", path="/", method="GET", description="Home page"),
            EndpointModel(id="frontend-cart", path="/cart", method="GET", description="Cart page"),
            EndpointModel(id="frontend-checkout", path="/checkout", method="POST", description="Checkout page"),
        ],
    ),
    ServiceNode(
        id="checkout",
        name="Checkout",
        language="Go",
        team="Checkout",
        description="Orchestrates the full checkout flow",
        port=5050,
        endpoints=[
            EndpointModel(
                id="checkout-place-order",
                path="/PlaceOrder",
                method="POST",
                description="Places a new order",
                request_fields=[
                    FieldModel(name="user_id", type="string", required=True),
                    FieldModel(name="user_currency", type="string", required=True),
                    FieldModel(name="address", type="object", required=True),
                    FieldModel(name="email", type="string", required=True),
                    FieldModel(name="credit_card", type="object", required=True),
                ],
                response_fields=[
                    FieldModel(name="order_id", type="string", required=True),
                    FieldModel(name="shipping_tracking_id", type="string", required=True),
                    FieldModel(name="total_cost", type="object", required=True),
                ],
            ),
        ],
    ),
    ServiceNode(
        id="payment",
        name="Payment",
        language="JavaScript",
        team="Payment",
        description="Processes credit card charges",
        port=50051,
        endpoints=[
            EndpointModel(
                id="payment-charge",
                path="/Charge",
                method="POST",
                description="Charges a credit card",
                request_fields=[
                    FieldModel(name="amount", type="object", required=True, description="Money amount with units/nanos"),
                    FieldModel(name="credit_card", type="object", required=True, description="Card number, expiry, CVV"),
                    FieldModel(name="order_id", type="string", required=True, description="Order reference"),
                    FieldModel(name="transaction_id", type="string", required=False, description="Idempotency key"),
                ],
                response_fields=[
                    FieldModel(name="transaction_id", type="string", required=True),
                    FieldModel(name="status", type="string", required=True),
                ],
            ),
        ],
    ),
    ServiceNode(
        id="email",
        name="Email",
        language="Ruby",
        team="Notifications",
        description="Sends order confirmation emails",
        port=8080,
        endpoints=[
            EndpointModel(
                id="email-send-order-confirmation",
                path="/SendOrderConfirmation",
                method="POST",
                description="Sends order confirmation email",
                request_fields=[
                    FieldModel(name="email", type="string", required=True),
                    FieldModel(name="order", type="object", required=True, description="Full order details"),
                ],
                response_fields=[],
            ),
        ],
    ),
    ServiceNode(
        id="cart",
        name="Cart",
        language=".NET",
        team="Cart",
        description="Manages shopping cart state in Valkey cache",
        port=7070,
        endpoints=[
            EndpointModel(
                id="cart-get",
                path="/GetCart",
                method="GET",
                description="Gets user cart",
                request_fields=[FieldModel(name="user_id", type="string", required=True)],
                response_fields=[
                    FieldModel(name="user_id", type="string", required=True),
                    FieldModel(name="items", type="array", required=True),
                ],
            ),
            EndpointModel(
                id="cart-add-item",
                path="/AddItem",
                method="POST",
                description="Adds item to cart",
                request_fields=[
                    FieldModel(name="user_id", type="string", required=True),
                    FieldModel(name="item", type="object", required=True),
                ],
                response_fields=[],
            ),
            EndpointModel(
                id="cart-empty",
                path="/EmptyCart",
                method="DELETE",
                description="Empties the cart after checkout",
                request_fields=[FieldModel(name="user_id", type="string", required=True)],
                response_fields=[],
            ),
        ],
    ),
    ServiceNode(
        id="product-catalog",
        name="Product Catalog",
        language="Go",
        team="Catalog",
        description="Product database and search",
        port=3550,
        endpoints=[
            EndpointModel(
                id="catalog-list-products",
                path="/ListProducts",
                method="GET",
                description="Lists all products",
                response_fields=[FieldModel(name="products", type="array", required=True)],
            ),
            EndpointModel(
                id="catalog-get-product",
                path="/GetProduct",
                method="GET",
                description="Gets a single product",
                request_fields=[FieldModel(name="id", type="string", required=True)],
                response_fields=[
                    FieldModel(name="id", type="string", required=True),
                    FieldModel(name="name", type="string", required=True),
                    FieldModel(name="price_usd", type="object", required=True),
                ],
            ),
        ],
    ),
    ServiceNode(
        id="currency",
        name="Currency",
        language="C++",
        team="Checkout",
        description="Currency conversion service",
        port=7000,
        endpoints=[
            EndpointModel(
                id="currency-convert",
                path="/Convert",
                method="POST",
                description="Converts money between currencies",
                request_fields=[
                    FieldModel(name="from", type="object", required=True),
                    FieldModel(name="to_code", type="string", required=True),
                ],
                response_fields=[FieldModel(name="converted", type="object", required=True)],
            ),
        ],
    ),
    ServiceNode(
        id="shipping",
        name="Shipping",
        language="Rust",
        team="Logistics",
        description="Calculates shipping costs and tracks shipments",
        port=50051,
        endpoints=[
            EndpointModel(
                id="shipping-get-quote",
                path="/GetQuote",
                method="POST",
                description="Gets shipping cost estimate",
                request_fields=[
                    FieldModel(name="address", type="object", required=True),
                    FieldModel(name="items", type="array", required=True),
                ],
                response_fields=[FieldModel(name="cost_usd", type="object", required=True)],
            ),
            EndpointModel(
                id="shipping-ship-order",
                path="/ShipOrder",
                method="POST",
                description="Ships an order",
                request_fields=[
                    FieldModel(name="address", type="object", required=True),
                    FieldModel(name="items", type="array", required=True),
                ],
                response_fields=[FieldModel(name="tracking_id", type="string", required=True)],
            ),
        ],
    ),
    ServiceNode(
        id="recommendation",
        name="Recommendation",
        language="Python",
        team="ML",
        description="ML-based product recommendations",
        port=8080,
        endpoints=[
            EndpointModel(
                id="recommendation-list",
                path="/ListRecommendations",
                method="POST",
                description="Returns product recommendations",
                request_fields=[
                    FieldModel(name="user_id", type="string", required=True),
                    FieldModel(name="product_ids", type="array", required=False),
                ],
                response_fields=[FieldModel(name="product_ids", type="array", required=True)],
            ),
        ],
    ),
    ServiceNode(
        id="ad",
        name="Ad",
        language="Java",
        team="Ads",
        description="Contextual ad serving",
        port=9555,
        endpoints=[
            EndpointModel(
                id="ad-get-ads",
                path="/GetAds",
                method="POST",
                description="Returns contextual ads",
                request_fields=[FieldModel(name="context_keys", type="array", required=True)],
                response_fields=[FieldModel(name="ads", type="array", required=True)],
            ),
        ],
    ),
    ServiceNode(
        id="fraud-detection",
        name="Fraud Detection",
        language="Kotlin",
        team="Risk",
        description="Real-time fraud detection on transactions",
        port=8080,
        endpoints=[],
    ),
    ServiceNode(
        id="accounting",
        name="Accounting",
        language=".NET",
        team="Finance",
        description="Accounting ledger for all transactions",
        port=8080,
        endpoints=[],
    ),
    ServiceNode(
        id="quote",
        name="Quote",
        language="PHP",
        team="Logistics",
        description="Calculates shipping quotes",
        port=8090,
        endpoints=[
            EndpointModel(
                id="quote-calculate",
                path="/calculateQuote",
                method="POST",
                description="Calculates a shipping price quote",
                request_fields=[FieldModel(name="numberOfItems", type="integer", required=True)],
                response_fields=[FieldModel(name="costUsd", type="object", required=True)],
            ),
        ],
    ),
    ServiceNode(
        id="flagd",
        name="Feature Flags",
        language="Go",
        team="Platform",
        description="Feature flag management service",
        port=8013,
        endpoints=[],
    ),
]

# Directed edges: source DEPENDS ON / CALLS target
OTEL_EDGES: list[ServiceEdge] = [
    ServiceEdge(source="frontend", target="cart", protocol="grpc", endpoints_called=["cart-get", "cart-add-item", "cart-empty"]),
    ServiceEdge(source="frontend", target="checkout", protocol="grpc", endpoints_called=["checkout-place-order"]),
    ServiceEdge(source="frontend", target="currency", protocol="grpc", endpoints_called=["currency-convert"]),
    ServiceEdge(source="frontend", target="shipping", protocol="grpc", endpoints_called=["shipping-get-quote"]),
    ServiceEdge(source="frontend", target="recommendation", protocol="grpc", endpoints_called=["recommendation-list"]),
    ServiceEdge(source="frontend", target="ad", protocol="grpc", endpoints_called=["ad-get-ads"]),
    ServiceEdge(source="frontend", target="product-catalog", protocol="grpc", endpoints_called=["catalog-list-products", "catalog-get-product"]),
    ServiceEdge(source="checkout", target="payment", protocol="grpc", endpoints_called=["payment-charge"]),
    ServiceEdge(source="checkout", target="cart", protocol="grpc", endpoints_called=["cart-get", "cart-empty"]),
    ServiceEdge(source="checkout", target="email", protocol="http", endpoints_called=["email-send-order-confirmation"]),
    ServiceEdge(source="checkout", target="currency", protocol="grpc", endpoints_called=["currency-convert"]),
    ServiceEdge(source="checkout", target="shipping", protocol="grpc", endpoints_called=["shipping-ship-order"]),
    ServiceEdge(source="checkout", target="product-catalog", protocol="grpc", endpoints_called=["catalog-get-product"]),
    ServiceEdge(source="checkout", target="flagd", protocol="grpc", label="feature flags"),
    ServiceEdge(source="fraud-detection", target="checkout", protocol="kafka", label="consumes checkout events"),
    ServiceEdge(source="accounting", target="payment", protocol="kafka", label="consumes payment events"),
    ServiceEdge(source="recommendation", target="product-catalog", protocol="grpc", endpoints_called=["catalog-list-products"]),
    ServiceEdge(source="shipping", target="quote", protocol="http", endpoints_called=["quote-calculate"]),
    ServiceEdge(source="payment", target="flagd", protocol="grpc", label="feature flags"),
    ServiceEdge(source="cart", target="flagd", protocol="grpc", label="feature flags"),
]


class GraphBuilder:
    def __init__(self):
        self._graph: nx.DiGraph = nx.DiGraph()
        self._services: dict[str, ServiceNode] = {}
        self._edges: list[ServiceEdge] = []

    def build_from_topology(self) -> "GraphBuilder":
        for service in OTEL_SERVICES:
            self._services[service.id] = service
            self._graph.add_node(
                service.id,
                name=service.name,
                language=service.language,
                team=service.team,
                description=service.description,
            )
        for edge in OTEL_EDGES:
            self._edges.append(edge)
            self._graph.add_edge(
                edge.source,
                edge.target,
                protocol=edge.protocol,
                endpoints_called=edge.endpoints_called,
                label=edge.label,
            )
        self._compute_risk_scores()
        return self

    def _compute_risk_scores(self):
        """Risk score = normalized in-degree (how many services depend on this one)."""
        in_degrees = dict(self._graph.in_degree())
        max_degree = max(in_degrees.values()) if in_degrees else 1
        for service_id, degree in in_degrees.items():
            if service_id in self._services:
                self._services[service_id].risk_score = round(degree / max_degree, 2)

    def add_service_from_spec(self, service: ServiceNode, edges: list[ServiceEdge]):
        self._services[service.id] = service
        self._graph.add_node(
            service.id,
            name=service.name,
            language=service.language,
            team=service.team,
        )
        for edge in edges:
            self._edges.append(edge)
            self._graph.add_edge(edge.source, edge.target, protocol=edge.protocol)
        self._compute_risk_scores()

    @property
    def graph(self) -> nx.DiGraph:
        return self._graph

    @property
    def services(self) -> dict[str, ServiceNode]:
        return self._services

    @property
    def edges(self) -> list[ServiceEdge]:
        return self._edges

    def to_dependency_graph(self) -> DependencyGraph:
        return DependencyGraph(
            services=list(self._services.values()),
            edges=self._edges,
        )


# Singleton graph instance
_builder: GraphBuilder | None = None


def get_graph_builder() -> GraphBuilder:
    global _builder
    if _builder is None:
        _builder = GraphBuilder().build_from_topology()
    return _builder
