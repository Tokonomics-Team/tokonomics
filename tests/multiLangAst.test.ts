import { AstPrunerEngine } from '../src/ast/pruner';
import { DependencyTreeShaker } from '../src/ast/treeShaker';
import * as assert from 'assert';

export async function runMultiLangAstTests() {
    console.log('\n--- Running Multi-Language AST & Tree-Shaking Tests ---');
    const engine = new AstPrunerEngine();

    // 1. Go Structural Pruning
    const goCode = `
package service

import (
    "context"
    "fmt"
    "time"
)

type Config struct {
    Port int
    Host string
}

type UserStore interface {
    GetUser(ctx context.Context, id string) (*User, error)
    SaveUser(ctx context.Context, u *User) error
}

func NewService(cfg Config, store UserStore) *Service {
    fmt.Println("Initializing service...")
    time.Sleep(100 * time.Millisecond)
    for i := 0; i < 20; i++ {
        fmt.Println("Pre-warming connection cache:", i)
    }
    return &Service{cfg: cfg, store: store}
}

func (s *Service) ProcessBatch(ctx context.Context, batchID string) (int, error) {
    total := 0
    for i := 0; i < 100; i++ {
        total += i
        fmt.Println("Processing batch item:", i)
        if total > 500 {
            fmt.Println("Applying rate limit delay...")
            time.Sleep(10 * time.Millisecond)
        }
    }
    return total, nil
}
`;

    const goResult = engine.pruneCodeContext(goCode, 'go');
    console.log(`[Go AST] Original: ${goResult.originalTokenCount} -> Pruned: ${goResult.prunedTokenCount} (${goResult.reductionPercentage}% reduction)`);
    assert.ok(goResult.reductionPercentage >= 40, `Expected >= 40% reduction on Go code, got ${goResult.reductionPercentage}%`);
    assert.ok(goResult.prunedCode.includes('type Config struct'), 'Should keep Config struct');
    assert.ok(goResult.prunedCode.includes('type UserStore interface'), 'Should keep UserStore interface');
    assert.ok(!goResult.prunedCode.includes('Pre-warming connection cache'), 'Should strip func body');
    console.log('✓ Go AST Pruner verified.');

    // 2. Rust Structural Pruning
    const rustCode = `
use std::collections::HashMap;
use std::sync::Arc;

pub struct DatabasePool {
    connection_string: String,
    pool_size: usize,
}

pub trait Repository {
    fn find_by_id(&self, id: u64) -> Option<String>;
}

impl DatabasePool {
    pub fn new(url: &str) -> Self {
        println!("Connecting to database...");
        for i in 0..30 {
            println!("Initializing worker thread: {}", i);
        }
        Self { connection_string: url.to_string(), pool_size: 10 }
    }

    pub async fn execute_query(&self, sql: &str) -> Result<usize, String> {
        let mut count = 0;
        for i in 0..100 {
            count += i;
            println!("Executing query iteration: {}", i);
        }
        Ok(count)
    }
}
`;

    const rustResult = engine.pruneCodeContext(rustCode, 'rust');
    console.log(`[Rust AST] Original: ${rustResult.originalTokenCount} -> Pruned: ${rustResult.prunedTokenCount} (${rustResult.reductionPercentage}% reduction)`);
    assert.ok(rustResult.reductionPercentage >= 40, `Expected >= 40% reduction on Rust code, got ${rustResult.reductionPercentage}%`);
    assert.ok(rustResult.prunedCode.includes('pub struct DatabasePool'), 'Should keep DatabasePool struct');
    assert.ok(rustResult.prunedCode.includes('pub trait Repository'), 'Should keep Repository trait');
    assert.ok(!rustResult.prunedCode.includes('Initializing worker thread'), 'Should strip method body');
    console.log('✓ Rust AST Pruner verified.');

    // 3. C / C++ Structural Pruning
    const cppCode = `
#include <iostream>
#include <vector>
#include <string>
#include <memory>

struct PacketHeader {
    uint32_t magic;
    uint16_t length;
    uint8_t flags;
};

class NetworkEngine {
private:
    std::string endpoint;
    int port;

public:
    NetworkEngine(const std::string& ep, int p) : endpoint(ep), port(p) {
        std::cout << "Bootstrapping network engine on " << ep << ":" << p << std::endl;
        for (int i = 0; i < 50; i++) {
            std::cout << "Allocating socket buffer pool " << i << std::endl;
        }
    }

    virtual bool sendPacket(const PacketHeader& header, const std::vector<uint8_t>& payload) {
        // Deep loop payload serialization
        for (size_t i = 0; i < payload.size(); ++i) {
            std::cout << "CRC checksum calculation byte: " << i << std::endl;
        }
        return true;
    }
};
`;

    const cppResult = engine.pruneCodeContext(cppCode, 'cpp');
    console.log(`[C/C++ AST] Original: ${cppResult.originalTokenCount} -> Pruned: ${cppResult.prunedTokenCount} (${cppResult.reductionPercentage}% reduction)`);
    assert.ok(cppResult.reductionPercentage >= 40, `Expected >= 40% reduction on C/C++ code, got ${cppResult.reductionPercentage}%`);
    assert.ok(cppResult.prunedCode.includes('#include <iostream>'), 'Should keep #include directives');
    assert.ok(cppResult.prunedCode.includes('struct PacketHeader'), 'Should keep struct PacketHeader');
    assert.ok(cppResult.prunedCode.includes('class NetworkEngine'), 'Should keep class NetworkEngine');
    assert.ok(!cppResult.prunedCode.includes('Allocating socket buffer pool'), 'Should strip constructor body');
    assert.ok(!cppResult.prunedCode.includes('CRC checksum calculation byte'), 'Should strip method body');
    console.log('✓ C & C++ AST Pruner verified.');

    // 4. Java / C# Structural Pruning
    const javaCode = `
package com.enterprise.service;

import java.util.List;
import java.util.Map;

public interface OrderProcessor {
    boolean processOrder(String orderId, double amount);
}

public class OrderManager {
    private String dbUrl;

    public OrderManager(String dbUrl) {
        this.dbUrl = dbUrl;
        System.out.println("Initializing manager with url: " + dbUrl);
    }

    public boolean executeOrder(String id) {
        for (int i = 0; i < 50; i++) {
            System.out.println("Validating inventory item: " + i);
        }
        return true;
    }
}
`;

    const javaResult = engine.pruneCodeContext(javaCode, 'java');
    console.log(`[Java/C# AST] Original: ${javaResult.originalTokenCount} -> Pruned: ${javaResult.prunedTokenCount} (${javaResult.reductionPercentage}% reduction)`);
    assert.ok(javaResult.reductionPercentage >= 40, 'Expected >= 40% reduction on Java/C# code');
    assert.ok(javaResult.prunedCode.includes('public interface OrderProcessor'), 'Should keep interface');
    assert.ok(!javaResult.prunedCode.includes('Validating inventory item'), 'Should strip method body');
    console.log('✓ Java/C# AST Pruner verified.');

    // 5. Dependency Tree Shaker Test
    const fullModule = `
import { Database } from './db';

export interface UserDTO {
    id: string;
    email: string;
}

export interface UnusedProductDTO {
    productId: string;
    price: number;
}

export class UserManager {
    public getUser(): UserDTO { return { id: '1', email: 'test@example.com' }; }
}

export class UnusedPaymentManager {
    public pay(): void { console.log('paying...'); }
}
`;

    const shaken = DependencyTreeShaker.sliceModuleContext(fullModule, ['UserDTO', 'UserManager']);
    console.log(`[Tree Shaker] Original: ${shaken.originalTokens} -> Shaken: ${shaken.shakenTokens} (${shaken.savedTokens} tokens saved)`);
    assert.ok(shaken.shakenCode.includes('UserDTO'), 'Should retain UserDTO');
    assert.ok(shaken.shakenCode.includes('UserManager'), 'Should retain UserManager');
    assert.ok(!shaken.shakenCode.includes('UnusedProductDTO'), 'Should prune UnusedProductDTO');
    assert.ok(!shaken.shakenCode.includes('UnusedPaymentManager'), 'Should prune UnusedPaymentManager');
    console.log('✓ Dependency Tree Shaker verified.');

    // 5. Tree Shaker Resilient Brace Scanning (Strings, Comments, Regex, Template Literals)
    const trickyModule = `
// Comment with unbalanced brace: {
export interface ConfigDTO {
    // Another comment with brace: { and paren (
    rawFormat: string;
    description: string;
}

export class TemplateRenderer {
    private regex = /[{()}]/g;

    public render(msg: string = "{placeholder}"): string {
        /* Multi-line comment with
           unbalanced braces { {
        */
        const prefix = "Prefix with brace: {";
        const template = \`Template with \${msg} and {literal_brace}\`;
        return template;
    }
}

export class UnusedTrickyService {
    public execute(): void {
        console.log("unused with { braces }");
    }
}
`;

    const shakenTricky = DependencyTreeShaker.sliceModuleContext(trickyModule, ['ConfigDTO', 'TemplateRenderer']);
    assert.ok(shakenTricky.retainedSymbols.includes('ConfigDTO'), 'Should retain ConfigDTO despite unbalanced brace in comment');
    assert.ok(shakenTricky.retainedSymbols.includes('TemplateRenderer'), 'Should retain TemplateRenderer despite braces in regex, strings, and template literals');
    assert.ok(shakenTricky.prunedSymbols.includes('UnusedTrickyService'), 'Should prune UnusedTrickyService');
    assert.ok(!shakenTricky.shakenCode.includes('UnusedTrickyService'), 'Shaken code must not contain UnusedTrickyService');
    console.log('✓ Tree Shaker resilient brace scanning verified (strings, comments, regex, template literals).');

    // 6. Tree Shaker import type, camelCase / snake_case helpers, and direct invocation
    const consumerCode = `
import type { User } from './models';
import { type AuthToken, calculateTax } from './utils';

export function checkout(user: User, amount: number) {
    const tax = calculateTax(amount);
    const fee = compute_fee(amount);
    return tax + fee;
}
`;

    const extracted = DependencyTreeShaker.extractImportedSymbols(consumerCode);
    assert.ok(extracted.has('User'), 'Should extract User from "import type { User }"');
    assert.ok(extracted.has('AuthToken'), 'Should extract AuthToken from "import { type AuthToken }"');
    assert.ok(extracted.has('calculateTax'), 'Should extract calculateTax from import & call');
    assert.ok(extracted.has('compute_fee'), 'Should extract snake_case compute_fee from invocation');

    const providerModule = `
export type User = { id: string; name: string };

export type AuthToken = string;

export function calculateTax(amount: number): number {
    return amount * 0.15;
}

export function compute_fee(amount: number): number {
    return 5.0;
}

export function unusedHelper(): void {
    console.log('unused');
}
`;

    const shakenProvider = DependencyTreeShaker.sliceModuleContext(providerModule, extracted);
    assert.ok(shakenProvider.retainedSymbols.includes('User'), 'Should retain User');
    assert.ok(shakenProvider.retainedSymbols.includes('AuthToken'), 'Should retain AuthToken');
    assert.ok(shakenProvider.retainedSymbols.includes('calculateTax'), 'Should retain calculateTax');
    assert.ok(shakenProvider.retainedSymbols.includes('compute_fee'), 'Should retain compute_fee');
    assert.ok(shakenProvider.prunedSymbols.includes('unusedHelper'), 'Should prune unusedHelper');
    assert.ok(!shakenProvider.shakenCode.includes('unusedHelper'), 'Shaken code must not contain unusedHelper');
    console.log('✓ Tree Shaker import type & camelCase/snake_case helpers verified.');

    // 7. Ruby Non-Brace AST Structural Pruning
    const rubyCode = `
require 'json'
require 'net/http'

module PaymentProcessing
  class StripeGateway < BaseGateway
    DEFAULT_TIMEOUT = 30
    attr_reader :api_key, :client

    def initialize(api_key, timeout: DEFAULT_TIMEOUT)
      @api_key = api_key
      @timeout = timeout
      @client = Net::HTTP.new("api.stripe.com", 443)
      @client.use_ssl = true
      @client.open_timeout = timeout
      @client.read_timeout = timeout
    end

    def charge(amount, currency = "USD")
      if amount <= 0
        raise ArgumentError, "Amount must be positive"
      end

      payload = { amount: amount, currency: currency }
      response = @client.post("/v1/charges", payload.to_json)
      response.code == "200"
    end

    def refund(charge_id)
      # Process refund logic
      refund_url = "/v1/refunds"
      response = @client.post(refund_url, { charge: charge_id }.to_json)
      response.code == "200"
    end

    private

    def format_headers
      { "Authorization" => "Bearer #{@api_key}" }
    end
  end
end
`;

    const rubyResult = engine.pruneCodeContext(rubyCode, 'rb');
    console.log(`[Ruby AST] Original: ${rubyResult.originalTokenCount} -> Pruned: ${rubyResult.prunedTokenCount} (${rubyResult.reductionPercentage}% reduction)`);
    assert.strictEqual(rubyResult.language, 'ruby');
    assert.ok(rubyResult.reductionPercentage >= 35, `Expected >= 35% reduction on Ruby code, got ${rubyResult.reductionPercentage}%`);
    assert.ok(rubyResult.prunedCode.includes("require 'json'"), 'Should keep require directives');
    assert.ok(rubyResult.prunedCode.includes('module PaymentProcessing'), 'Should keep module PaymentProcessing');
    assert.ok(rubyResult.prunedCode.includes('class StripeGateway < BaseGateway'), 'Should keep class declaration');
    assert.ok(rubyResult.prunedCode.includes('attr_reader :api_key, :client'), 'Should keep attr_reader');
    assert.ok(rubyResult.prunedCode.includes('def initialize(api_key, timeout: DEFAULT_TIMEOUT)'), 'Should keep initialize signature');
    assert.ok(rubyResult.prunedCode.includes('def charge(amount, currency = "USD")'), 'Should keep charge signature');
    assert.ok(rubyResult.prunedCode.includes('def refund(charge_id)'), 'Should keep refund signature');
    assert.ok(rubyResult.prunedCode.includes('private'), 'Should keep private modifier');
    assert.ok(rubyResult.prunedCode.includes('def format_headers'), 'Should keep format_headers signature');
    assert.ok(!rubyResult.prunedCode.includes('{ /* [Pruned] */ }'), 'Ruby code must NOT be wrapped in JS braces');
    assert.ok(!rubyResult.prunedCode.includes('@client.use_ssl = true'), 'Should strip initialize implementation');
    assert.ok(!rubyResult.prunedCode.includes('Amount must be positive'), 'Should strip charge implementation');
    console.log('✓ Ruby non-brace AST pruner verified.');

    // 8. Generic line-based fallback for unknown non-brace files
    const genericCode = `
# Generic configuration and rule definitions
server_name = prod-ap-southeast-1
port = 8080

# Long noisy debug comment that should be pruned because it exceeds the noise threshold limit
worker_threads = 16
timeout_ms = 5000
`;
    const genericResult = engine.pruneCodeContext(genericCode, 'generic');
    assert.strictEqual(genericResult.language, 'generic');
    assert.ok(!genericResult.prunedCode.includes('{ /* [Pruned] */ }'), 'Generic code must NOT be treated as JS');
    assert.ok(genericResult.prunedCode.includes('server_name = prod-ap-southeast-1'));
    console.log('✓ Generic line pruner fallback verified.');
}


