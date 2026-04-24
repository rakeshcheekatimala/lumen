package com.lumen.payment;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Base64;
import java.util.Map;

/**
 * Client for Mastercard Payment Gateway Service (MPGS).
 * Processes card authorizations via the MPGS REST API.
 */
@Component
public class MpgsClient {

    private final RestTemplate restTemplate = new RestTemplate();

    @Value("${MPGS_API_URL:https://na.api.mastercard.com/gateway/version/65}")
    private String mpgsApiUrl;

    @Value("${MPGS_MERCHANT_ID}")
    private String merchantId;

    @Value("${MPGS_API_KEY}")
    private String apiKey;

    public AuthorizationResult authorize(AuthorizationRequest req) {
        String credentials = Base64.getEncoder().encodeToString(
            ("merchant." + merchantId + ":" + apiKey).getBytes()
        );

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Basic " + credentials);

        Map<String, Object> body = Map.of(
            "apiOperation", "AUTHORIZE",
            "order", Map.of(
                "id", req.orderId(),
                "amount", req.amount(),
                "currency", req.currency()
            ),
            "sourceOfFunds", Map.of(
                "type", "CARD",
                "provided", Map.of(
                    "card", Map.of(
                        "number", req.cardNumber(),
                        "expiry", Map.of(
                            "month", req.expiryMonth(),
                            "year", req.expiryYear()
                        ),
                        "securityCode", req.cvv()
                    )
                )
            )
        );

        String url = mpgsApiUrl + "/merchant/" + merchantId
            + "/order/" + req.orderId()
            + "/transaction/" + req.transactionId();

        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restTemplate.postForObject(
                url, new HttpEntity<>(body, headers), Map.class
            );
            String result = response != null
                ? (String) response.getOrDefault("result", "FAILURE")
                : "FAILURE";
            return new AuthorizationResult("SUCCESS".equals(result), result);
        } catch (Exception e) {
            return new AuthorizationResult(false, "MPGS_ERROR: " + e.getMessage());
        }
    }

    public record AuthorizationRequest(
        String orderId,
        String transactionId,
        double amount,
        String currency,
        String cardNumber,
        String expiryMonth,
        String expiryYear,
        String cvv
    ) {}

    public record AuthorizationResult(boolean approved, String gatewayCode) {}
}
