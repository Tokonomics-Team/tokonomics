**The snippets suggest some “Unavailable” values may reflect missing usage data, but they don’t include enough dashboard logic to confirm the cause.**

Two relevant details are visible:

- `CliResult.usage` is optional in `src/subscriptions/cliTransport.ts`. A subscription request can return an answer without usage data.
- `TokenCounter` produces **estimates**, while `accountingTruth.ts` distinguishes estimates, tokenizer measurements, provider reports, and unavailable data. The dashboard should preserve those distinctions.

I’d suggest these display rules:

| Metric | What to display |
| ------ | --------------- |
| Original/optimized input tokens | Local estimates when available, labeled **Estimated** |
| Input token reduction | Compute from comparable before/after counts; label estimates |
| Provider input/output usage | Provider values when supplied; otherwise **Usage not reported** |
| Actual subscription dollar savings | **Not measured** unless supported by billing evidence |
| Remaining prompts / subscription quota | **Quota data unavailable** unless an authoritative source supplies it |
| No recorded requests | **No activity yet** |

**A possible bug to check is whether missing cost data suppresses otherwise available token metrics.** `costTuple()` can return `undefined`; inspect whether its caller then drops the entire event. Token aggregation should remain independent of cost availability.

Also check for truthiness fallbacks in the renderer:
```ts
// Suggested pattern: preserve valid zero values.
const displayNumber = (value: number | null | undefined) =>
    value != null && Number.isFinite(value)
        ? value.toLocaleString()
        : 'Unavailable';
```

Using `value || 'Unavailable'` would incorrectly hide zero usage or zero savings.

To identify the exact fault, I need the full bodies of **`updateSpend()`****&#x20;in&#x20;****`src/ui/spendDashboard.ts`****, the dashboard payload builder in&#x20;****`src/ui/dashboardController.ts`****, and the aggregation logic in&#x20;****`src/metrics/liveAggregator.ts`**. The attached excerpts show only their declarations or imports, so these are suggested checks, not a verified diagnosis.
