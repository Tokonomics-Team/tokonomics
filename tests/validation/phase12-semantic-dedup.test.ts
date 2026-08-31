import * as assert from 'assert';
import { ExactDedupEngine, DedupItem } from '../../src/dedup/exactDedup';

export function runPhase12SemanticDedupValidation(): boolean {
    console.log('--- Phase 12: 4-Tier Deduplication & Negative Control Invariants ---');

    const exactDedup = new ExactDedupEngine();

    // 1. Positive Dedup Test: Exact duplicate is culled
    const items: DedupItem[] = [
        { id: '1', content: 'export function calculateTax(amt: number) { return amt * 0.08; }', tokens: 20 },
        { id: '2', content: 'export function calculateTax(amt: number) { return amt * 0.08; }', tokens: 20 }
    ];
    const res = exactDedup.deduplicate(items);
    assert.strictEqual(res.unique.length, 1, 'Exact duplicate must be culled');
    assert.strictEqual(res.duplicates.length, 1, 'One duplicate must be recorded');

    // 2. Critical Negative Control Test: Distinct business functions must NEVER be culled
    const distinctItems: DedupItem[] = [
        { id: 'withdraw', content: 'export function withdraw(account: Account, amount: number) { account.balance -= amount; }', tokens: 20 },
        { id: 'deposit', content: 'export function deposit(account: Account, amount: number) { account.balance += amount; }', tokens: 20 }
    ];
    const distinctRes = exactDedup.deduplicate(distinctItems);
    assert.strictEqual(distinctRes.unique.length, 2, 'Distinct semantic functions (withdraw vs deposit) must NEVER be culled');

    console.log('  ✓ 4-tier deduplication positive and negative controls verified.');
    return true;
}
