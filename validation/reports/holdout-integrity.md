# 🔒 Tokonomics Holdout Dataset Integrity & Corpus Distribution Report

> **Benchmark Classification**: `Controlled Synthetic Benchmark`  
> **Dataset Version**: `2026-v2.1`  
> **Total Corpus Size**: `160` tasks  
> **Split Allocation**: Training: `64` (40%) | Validation: `48` (30%) | Holdout: `48` (30%)  
> **Holdout Cryptographic Hash (SHA-256)**: `754d1fa43e95396c1be1c07586326e0dc798871d272390a3657bfe09ef3927cd`  
> **Holdout Lock State**: **LOCKED (Tuning Code Access Denied with Hard Exception)**  
> **Final Status**: **APPROVED (ZERO HOLDOUT DATASET CONTAMINATION)**

---

## 1. Split Allocation Breakdown

| Partition | Task Count (N) | Percentage | Purpose | Access Permission |
| :--- | :---: | :---: | :--- | :--- |
| **Training** | 64 | 40% | Dynamic rule & heuristic validation | Open |
| **Validation** | 48 | 30% | Threshold calibration & ablation | Open |
| **Holdout** | **48** | **30%** | **Final independent blind evaluation** | **STRICTLY LOCKED** |

---

## 2. Language × TaskType Distribution Matrix

| Language | Debug | Feature | Refactor | Test | Total Tasks |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **typescript** | 4 | 3 | 4 | 0 | **11** |
| **javascript** | 4 | 3 | 4 | 0 | **11** |
| **python** | 4 | 3 | 4 | 0 | **11** |
| **go** | 4 | 3 | 4 | 0 | **11** |
| **rust** | 4 | 3 | 4 | 0 | **11** |
| **cpp** | 4 | 3 | 4 | 0 | **11** |
| **java** | 4 | 3 | 4 | 0 | **11** |
| **csharp** | 4 | 3 | 4 | 0 | **11** |

---

## 3. Holdout Contamination Audit Trail
- Total Unauthorized Access Attempts Detected: **0**
- Holdout Dataset Mutation Violations: **0**
