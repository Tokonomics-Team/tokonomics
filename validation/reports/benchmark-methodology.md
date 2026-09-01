# 🧪 Tokonomics Benchmark Methodology & Experimental Protocol

> **Document Version**: `2.1.0`  
> **Benchmark Classification**: `Controlled Synthetic Benchmark` ($N=160$ Multilingual Tasks)  
> **Upstream Models Executed**: None
> **Evidence Scope**: Compiler mechanics and deterministic synthetic fixtures only

> **Critical limitation:** The current runners select predetermined fixed or buggy patches
> from the executable corpus. They do not invoke an upstream model and therefore cannot
> establish model task-success uplift, production code accuracy, provider latency, or billed
> cost savings. Those outcomes remain unverified until artifact-level external evaluation.

---

## 1. Experimental Conditions (3-Run Protocol)

To ensure scientifically valid causal attribution, every benchmark task is executed across three controlled runs where the **only experimental variable is the prompt context strategy**:

### Run A — Normal Baseline
- **Definition**: Represents standard unoptimized context payload.
- **Context Provided**: Raw file dumps of active files, unpruned system instructions, and raw chat history up to the context budget.
- **Context Omitted**: No AST program slicing, no semantic deduplication, no Knapsack utility optimization, no KV cache alignment.

### Run B — Full Context Reference (Broad Relevant Context)
- **Definition**: Broad, complete context containing all relevant workspace definitions, interface contracts, and full dependency closures up to maximum token window (18,400 tokens).
- **Purpose**: Serves as the upper-bound quality reference oracle.

### Run C — Tokonomics (Local Context Compiler)
- **Definition**: Tokonomics compiler enabled with Deterministic Context Governor.
- **Context Provided**: Context IR multi-resolution representations ($R_{\text{exclude}}$ to $R_5$), hybrid retrieval with MMR, 0/1 Knapsack optimization, SDG slicing, and KV cache prefix alignment.

---

## 2. Mathematical Metric Definitions

1. **Token Reduction (%)**:
   $$\text{TokenReduction} = \frac{\text{RawTokens} - \text{OptimizedTokens}}{\text{RawTokens}} \times 100$$
2. **Effective Cost Savings (%)**:
   $$\text{CostSavings} = \frac{\text{BaselineCost} - \text{OptimizedCost}}{\text{BaselineCost}} \times 100$$
3. **Absolute Task Success Improvement (% points)**:
   $$\text{AbsoluteImprovement} = \text{TokonomicsSuccess} - \text{BaselineSuccess}$$
4. **Relative Task Success Improvement (%)**:
   $$\text{RelativeImprovement} = \frac{\text{TokonomicsSuccess} - \text{BaselineSuccess}}{\text{BaselineSuccess}} \times 100$$
5. **Context Success Preservation Ratio**:
   $$\text{ContextSuccessPreservationRatio} = \frac{\text{TokonomicsSuccess}}{\text{FullContextSuccess}} \quad (\le 1.0)$$
   *(When Tokonomics strictly exceeds Full Context, the gain is reported separately as **Task Success Uplift vs Full Context**).*
6. **False Aggressive Rate (%)**:
   $$\text{FalseAggressiveRate} = \frac{\text{UnsafeAggressiveDecisions}}{\text{TotalAggressiveDecisions}} \times 100$$
7. **Optimization Regret**:
   $$\text{OptimizationRegret} = \text{Downstream Quality Loss relative to Token Cost Savings}$$

---

## 3. Pricing & Provenance Accounting

- **Accounting Standard**: Observed provider usage tokens; billing calculated from authoritative published rate cards (Feb 2025/2026).
- **Cache Policy**: Cache discounts ($75\% - 90\%$ reduction) applied only to authoritative static prefix tokens exceeding provider minimum thresholds (1,024 tokens for Claude, 2,048 for OpenAI).
