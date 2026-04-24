package com.lumen.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

@RestController
public class PaymentController {

    private final FraudServiceClient fraudClient;
    private final KafkaTemplate<String, String> kafka;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${notification-service.url}")
    private String notificationServiceUrl;

    public PaymentController(FraudServiceClient fraudClient, KafkaTemplate<String, String> kafka) {
        this.fraudClient = fraudClient;
        this.kafka = kafka;
    }

    @PostMapping("/charge")
    public ChargeResponse charge(@RequestBody ChargeRequest req) {
        // 1. Fraud check via @FeignClient → fraud-service
        var fraud = fraudClient.check(
            new FraudServiceClient.FraudRequest(req.customerId(), req.amount(), req.currency())
        );
        if (!fraud.approved()) {
            return new ChargeResponse("DECLINED", fraud.reason());
        }

        // 2. Notify via REST → notification-service
        restTemplate.postForObject(
            notificationServiceUrl + "/notify",
            new NotifyRequest(req.customerId(), "PAYMENT_CHARGED"),
            Void.class
        );

        // 3. Emit Kafka event for async downstream consumers
        kafka.send("payment-events", req.customerId());

        return new ChargeResponse("APPROVED", "OK");
    }

    record ChargeRequest(String customerId, double amount, String currency) {}
    record ChargeResponse(String status, String message) {}
    record NotifyRequest(String userId, String event) {}
}
