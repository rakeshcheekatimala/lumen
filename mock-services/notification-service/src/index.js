const express = require('express')
const { Kafka } = require('kafkajs')

const app = express()
app.use(express.json())

const kafka = new Kafka({
  clientId: 'notification-service',
  brokers: [process.env['KAFKA_BOOTSTRAP_SERVERS'] || 'localhost:9092'],
})

const consumer = kafka.consumer({ groupId: 'notification-group' })

async function startConsumer() {
  await consumer.connect()
  await consumer.subscribe({ topic: 'payment-events', fromBeginning: false })
  await consumer.run({
    eachMessage: async ({ message }) => {
      const customerId = message.value?.toString()
      console.log(`Sending notification to customer: ${customerId}`)
      // In prod: send email / push / SMS
    },
  })
}

// REST endpoint called by payment-service for immediate notifications
app.post('/notify', (req, res) => {
  const { userId, event } = req.body
  console.log(`Immediate notify: ${event} for ${userId}`)
  res.json({ sent: true })
})

startConsumer().catch(console.error)
app.listen(8083, () => console.log('notification-service listening on :8083'))
