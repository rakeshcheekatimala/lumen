package com.lumen.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestTemplate;

@RestController
public class PaymentController {

    private final FraudServiceClient fraudClient;
    private final MpgsClient mpgsClient;
    private final KafkaTemplate<String, String> kafka;
    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${notification-service.url}")
    private String notificationServiceUrl;

    public PaymentController(
        FraudServiceClient fraudClient,
        MpgsClient mpgsClient,
        KafkaTemplate<String, String> kafka
    ) {
        this.fraudClient = fraudClient;
        this.mpgsClient = mpgsClient;
        this.kafka = kafka;
    }

    @PostMapping("/charge")
    public ChargeResponse charge(@RequestBody ChargeRequest req) {
        // 1. Fraud check via @FeignClient → fraud-service
        var fraud = fraudClient.check(
            new FraudServiceClient.FraudRequest(req.customerId(), req.amount(), req.currency())
        );
        if (!fraud.approved()) {
            return new ChargeResponse("DECLINED", fraud.reason(), null);
        }

        // 2. Authorize card via Mastercard MPGS external gateway
        var auth = mpgsClient.authorize(new MpgsClient.AuthorizationRequest(
            req.orderId(),
            req.transactionId(),
            req.amount(),
            req.currency(),
            req.cardNumber(),
            req.expiryMonth(),
            req.expiryYear(),
            req.cvv()
        ));
        if (!auth.approved()) {
            return new ChargeResponse("DECLINED", "Gateway: " + auth.gatewayCode(), null);
        }

        // 3. Notify via REST → notification-service
        restTemplate.postForObject(
            notificationServiceUrl + "/notify",
            new NotifyRequest(req.customerId(), "PAYMENT_CHARGED"),
            Void.class
        );

        // 4. Emit Kafka event for async downstream consumers
        kafka.send("payment-events", req.customerId());

        return new ChargeResponse("APPROVED", "OK", auth.gatewayCode());
    }

    record ChargeRequest(
        String customerId, String orderId, String transactionId,
        double amount, String currency,
        String cardNumber, String expiryMonth, String expiryYear, String cvv
    ) {}
    record ChargeResponse(String status, String message, String gatewayCode) {}
    record NotifyRequest(String userId, String event) {}
}
