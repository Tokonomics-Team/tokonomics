# Retrieval Stage Ablation

> Generated: `2026-09-07T15:00:31.921Z`
> Corpus: 9 retrieval prompts over this repository's own source, including
> 4 that deliberately name no symbol from the file they are about.

Each stage is disabled individually against the full Maximum Savings configuration.
A stage earns its place by recovering mandatory or focal evidence, or by reducing tokens
without losing either. Token cost is ranked last on purpose: fewer tokens for less evidence
is not a saving.

Baseline with every stage enabled: 19 mandatory categories satisfied, focal file recalled in 9/9 cases, 24362 tokens.

| Stage | Mandatory Δ | Focal Δ | Exact impl Δ | Token Δ | Verdict |
|---|---:|---:|---:|---:|---|
| `enableDenseEmbeddings` | 0 | 0 | 19 | -10345 | earns-its-place |
| `enableCrossEncoder` | 0 | 0 | 0 | 0 | no-measured-effect |
| `enableMmrDiversity` | 0 | 0 | 0 | -1825 | earns-its-place |
| `enableSemanticDedup` | 0 | 0 | 0 | 0 | inert |

### `enableDenseEmbeddings`

Enabling the stage recovers 0 mandatory categor(ies), 0 focal file(s) and 19 exact implementation candidate(s) that are otherwise missed.

### `enableCrossEncoder`

The stage changed the selection or its order, but mandatory recall, focal recall and token count are all identical. This corpus cannot tell whether that reordering helps.

### `enableMmrDiversity`

Evidence quality is unchanged and the stage removes 1825 tokens.

### `enableSemanticDedup`

Disabling the stage produced an identical selection, order and token count. On this corpus it changes nothing that reaches the model.

## Inert stages

These changed nothing observable on this corpus. That is evidence they earn nothing here,
not proof they are useless in general - one repository and five prompts is a narrow test.
They should not be enabled by default on the strength of existing in the codebase.

- `enableSemanticDedup`
