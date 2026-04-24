package com.lumen.payment;

import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

@FeignClient("fraud-service")
public interface FraudServiceClient {

    @PostMapping("/check")
    FraudResult check(@RequestBody FraudRequest request);

    record FraudRequest(String customerId, double amount, String currency) {}
    record FraudResult(boolean approved, String reason) {}
}
