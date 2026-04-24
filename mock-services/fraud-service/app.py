from flask import Flask, request, jsonify

app = Flask("fraud-service")

# Standalone — no outgoing service calls.
# Scores transactions using simple heuristics.

BLOCKED_CUSTOMERS = {"cust_blocked_001", "cust_blocked_002"}


@app.post("/check")
def check():
    body = request.get_json()
    customer_id = body.get("customerId", "")
    amount = float(body.get("amount", 0))

    if customer_id in BLOCKED_CUSTOMERS:
        return jsonify({"approved": False, "reason": "customer blocked"})
    if amount > 10_000:
        return jsonify({"approved": False, "reason": "amount exceeds limit"})

    return jsonify({"approved": True, "reason": "ok"})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8082)
