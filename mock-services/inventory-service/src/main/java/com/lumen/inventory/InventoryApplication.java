package com.lumen.inventory;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@SpringBootApplication
@RestController
public class InventoryApplication {

    private final Map<String, Integer> stock = new ConcurrentHashMap<>(Map.of(
        "item_001", 100,
        "item_002", 50
    ));

    public static void main(String[] args) {
        SpringApplication.run(InventoryApplication.class, args);
    }

    @PostMapping("/reserve")
    public Map<String, Object> reserve(@RequestBody Map<String, Object> req) {
        String itemId   = (String) req.get("item_id");
        int    quantity = (int) req.getOrDefault("quantity", 1);

        int available = stock.getOrDefault(itemId, 0);
        if (available < quantity) {
            return Map.of("reserved", false, "reason", "insufficient stock");
        }
        stock.put(itemId, available - quantity);
        return Map.of("reserved", true, "remaining", available - quantity);
    }

    @GetMapping("/stock/{itemId}")
    public Map<String, Object> getStock(@PathVariable String itemId) {
        return Map.of("item_id", itemId, "quantity", stock.getOrDefault(itemId, 0));
    }
}
