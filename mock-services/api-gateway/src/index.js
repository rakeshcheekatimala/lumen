const express = require('express')
const axios = require('axios')

const app = express()
app.use(express.json())

const PAYMENT_SERVICE_URL = process.env['PAYMENT_SERVICE_URL'] || 'http://localhost:8080'
const ORDER_SERVICE_URL   = process.env['ORDER_SERVICE_URL']   || 'http://localhost:8081'

// POST /pay — delegates to payment-service
app.post('/pay', async (req, res) => {
  const result = await axios.post(`${PAYMENT_SERVICE_URL}/charge`, req.body)
  res.json(result.data)
})

// GET /orders — delegates to order-service
app.get('/orders', async (req, res) => {
  const result = await axios.get(`${ORDER_SERVICE_URL}/orders`)
  res.json(result.data)
})

// POST /orders — creates order via order-service (which calls payment-service internally)
app.post('/orders', async (req, res) => {
  const result = await axios.post(`${ORDER_SERVICE_URL}/orders`, req.body)
  res.json(result.data)
})

app.listen(3000, () => console.log('api-gateway listening on :3000'))
