import os
import requests
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="order-service")

PAYMENT_SERVICE_URL   = os.environ.get('PAYMENT_SERVICE_URL',   'http://payment-service:8080')
INVENTORY_SERVICE_URL = os.environ.get('INVENTORY_SERVICE_URL', 'http://inventory-service:8084')


class OrderRequest(BaseModel):
    customer_id: str
    item_id: str
    quantity: int
    amount: float
    currency: str = "USD"


@app.get("/orders")
def list_orders():
    return {"orders": []}


@app.post("/orders")
def create_order(order: OrderRequest):
    # 1. Reserve stock via inventory-service
    inv_resp = requests.post(
        f"{INVENTORY_SERVICE_URL}/reserve",
        json={"item_id": order.item_id, "quantity": order.quantity},
        timeout=5,
    )
    if inv_resp.status_code != 200:
        raise HTTPException(status_code=422, detail="Insufficient inventory")

    # 2. Charge via payment-service
    pay_resp = requests.post(
        f"{PAYMENT_SERVICE_URL}/charge",
        json={
            "customerId": order.customer_id,
            "amount": order.amount,
            "currency": order.currency,
        },
        timeout=10,
    )
    if pay_resp.json().get("status") != "APPROVED":
        raise HTTPException(status_code=402, detail="Payment declined")

    return {"order_id": "ord_mock_123", "status": "CONFIRMED"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8081)
