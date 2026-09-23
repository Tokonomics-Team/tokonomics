# Regex inventory

Scope: tracked first-party TS/JS regex literals and RegExp constructor sites (including inline webview scripts where found). Vendor code, generated bundles and regex-looking prose are excluded. Source literal spelling is preserved; actual U+0008 is displayed as \x08. Dynamic construction is assessed from its current callers. Safe within tested scope is not a formal complexity proof.

| Location | Pattern | Backtracking assessment | Remediation |
|---|---|---|---|
| scripts/audit-dependencies.js:44 | `/503 Service Unavailable\|audit endpoint returned an error\|ENOTFOUND\|ECONNREFUSED\|ETIMEDOUT/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/generate-supply-chain.js:19 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/generate-supply-chain.js:31 | `/^node_modules\//` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/generate-v7-phase0-baseline.js:22 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:40 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:42 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:43 | `/^validation\/reports\/.*\.(?:json\|md)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:44 | `/^validation\/results\/.*\.json$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:85 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:90 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/certification-evidence.js:159 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:13 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:38 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:54 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:65 | `/export type ComponentId\s*=([\s\S]*?);/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:67 | `/'([^']+)'/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:68 | `/\b(core\|conditional\|flaggedCore\|shadow)\(\s*'([^']+)'\s*,\s*'([^']+)'/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:77 | `/\b(?:globalState\|workspaceState\|SecretStorage\|\.secrets)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:78 | `/\b(?:setTimeout\|setInterval)\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:79 | `/\b(?:createFileSystemWatcher\|onDidChangeTextDocument\|onDidSaveTextDocument\|onDidCreateFiles\|onDidDeleteFiles\|onDidRenameFiles\|onDidChangeWorkspaceFolders\|onDidChangeConfiguration)\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:80 | `/\bnew\s+(?:Worker\|WorkerConstructor)\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:81 | `/\b(?:queue\|pendingUpdates\|queuedByKey)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:82 | `/\.sendRequest\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:157 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/v7-phase0-baseline.js:171 | `/^tokonomics-.*\.vsix$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/lib/vsix-artifact.js:16 | `/^[A-Za-z]:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/qa-chat-panel.js:131 | `/data-panel-qa="([^"]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/qa-finops-dashboard.js:33 | `/script-src 'nonce-([^']+)'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/qa-finops-dashboard.js:83 | `/<script[^>]*>([\s\S]*?)<\/script>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/qa-finops-dashboard.js:97 | `/data-finops-qa="([^"]+)"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/qa-subscription-host.js:30 | `/\bvscode\.(\w+)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/run-extension-host-matrix.js:45 | `/\.cmd$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/run-v7-phase0-benchmark.js:31 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:37 | `/final master development plan/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:38 | `/supersedes all\s+earlier modernization roadmaps/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:39 | `/wait for explicit repository-owner approval/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:40 | `/## Phase 11 - Production hardening and v7\.0\.1 release certification/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:60 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:94 | `/CERTIFIED FOR WORLDWIDE PRODUCTION/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:95 | `/releaseDecision\s*:\s*["']CERTIFIED/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:96 | `/APPROVED_FOR_GLOBAL_ROLLOUT/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:97 | `/allGatesPassed\s*:\s*true/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:98 | `/totalTestSuites\s*:\s*\d+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:99 | `/repositoryCommitSha\s*:\s*["'][0-9a-f]{7,40}["']/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:104 | `/createCertificationReport/` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:110 | `/programmatically verified\|synthetic\|deterministic/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:115 | `/historical\s+development artifacts/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:116 | `/not release certificates/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:117 | `/predetermined corpus fixtures/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:118 | `/v7\.0\.1 Phase 0 baseline/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-phase0.js:123 | `/repositoryCommitSha\s*:\s*["'][0-9a-f]{7,40}["']/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-vsix.js:17 | `/(^\|\/)(?:src\|tests?\|validation\|scripts\|out\|out_test\|\.git\|\.github\|\.vscode-test)(?:\/\|$)\|(?:\.map\|\.ts\|\.log\|\.env\|\.pem\|\.key\|package-lock\.json)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| scripts/verify-vsix.js:24 | `/\.md$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:353 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:391 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:414 | `/^[A-Za-z_][A-Za-z0-9_]*(\s*:\s*[^=]+)?(\s*=.*)?$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:452 | `/^[A-Z_0-9]+\s*(=\|:)\|TypeVar/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:483 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:489 | `/^(if\|unless\|while\|until\|case\|for\|begin)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:490 | `/^def\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:491 | `/\bdo(\s*\\|[^\|]*\\|)?\s*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:497 | `/^end\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:523 | `/^(require\|require_relative\|load)\s+['"]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:530 | `/^(class\|module)\s+[\w\d_:]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:537 | `/^(include\|extend\|prepend\|attr_reader\|attr_writer\|attr_accessor\|public\|private\|protected)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:544 | `/^[A-Z][A-Za-z0-9_]*\s*=/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:558 | `/^def\s+[\w\d_.=?!]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:560 | `/\bend\s*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:573 | `/^(\s*)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:609 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:621 | `/^(\/\/\|--\|#(?!!\|\s*frozen_string_literal))\s*.*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:631 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:687 | `/^(export\s+)?(abstract\s+)?class\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:694 | `/^(export\s+)?(async\s+)?function\s*[\w\d_]*\s*\(/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:726 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:752 | `/^type\s+[\w\d_]+\s+(struct\|interface)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:759 | `/^type\s+[\w\d_]+\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:765 | `/^func\s+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:786 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:805 | `/^(pub\s+)?(struct\|enum\|trait)\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:812 | `/^impl(\s*<[^>]+>)?\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:819 | `/^(pub(\([^)]+\))?\s+)?(async\s+)?fn\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:869 | `/^(pub(\([^)]+\))?\s+)?(async\s+)?fn\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:899 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:923 | `/^(public\|internal\|protected\|\s)*(interface)\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:930 | `/^(public\|internal\|protected\|private\|abstract\|sealed\|static\|\s)*(class\|struct\|record)\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:945 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:964 | `/^(class\|struct)\s+[\w\d_]+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:971 | `/^[\w\d_:<>&*]+\s+[\w\d_:]+\s*\([^)]*\)\s*\{/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:988 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1002 | `/^class\s+[\w\d_]+(\([^)]*\))?:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1007 | `/^(async\s+)?def\s+[\w\d_]+\s*\([^)]*\)\s*(->\s*[^:]+)?:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1009 | `/^\s*/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1014 | `/^[A-Z_0-9]+\s*:\s*[^=]+=/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1014 | `/^[A-Z_0-9]+\s*=\s*TypeVar/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1024 | `/\/\*\*[\s\S]*?\*\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1170 | `/^(public\|private\|protected)\s*:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1180 | `/^(public\|private\|protected\|\s)*constructor\s*\([^)]*\)\s*\{/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1204 | `/^(public\|private\|protected\|readonly\|static\|\s)*[\w\d_]+(\?)?:\s*[^;=]+;/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1206 | `/^(public\|private\|protected\|readonly\|static\|\s)*[\w\d_]+(\?)?:\s*[^=]+=/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1210 | `/^[\w\d_:<>&*]+\s+[\w\d_]+(\s*\[[^\]]*\])?\s*;/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1277 | `/^package\s+[\w\d_]+/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1277 | `/^func\s+/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1278 | `/^use\s+[\w\d_:]+\|^fn\s+[\w\d_]+\|^pub\s+(struct\|enum\|fn)/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1279 | `/^using\s+System;\|^namespace\s+[\w\d_.]+/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1280 | `/^package\s+[\w\d_.]+;\s*import\s+java/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1281 | `/^#include\s+<[\w\d_.]+>/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1282 | `/^import\s+.*from\s+['"]\|^export\s+(class\|interface\|type\|const\|function)/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1287 | `/^def\s+[\w\d_]+\s*\(\|^import\s+\w+\|^from\s+\w+\s+import/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/pruner.ts:1290 | `/^(require\|require_relative)\s+['"]\|^def\s+[\w\d_!?]+\|^class\s+[\w\d_:]+(\s*<\|$)\|^module\s+[\w\d_:]+/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:23 | `/\beval\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:24 | `/\bFunction\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:25 | `/\bgetattr\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:26 | `/\bsetattr\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:27 | `/\bReflect\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:28 | `/\bProxy\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:32 | `/\[[a-zA-Z0-9_]+\]\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:33 | `/\.apply\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:34 | `/\.call\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:35 | `/\b__getitem__\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:39 | `/\bprocess\.env\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:40 | `/\bglobalThis\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:41 | `/\bwindow\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:42 | `/\bdocument\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:43 | `/\bglobal\s+[a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:47 | `/@inject\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:48 | `/@autowired\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:49 | `/container\.resolve\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:50 | `/injector\.get\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:51 | `/useContext\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:55 | `/\bimport\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:56 | `/\brequire\s*\(\s*[^'"&#96;]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:57 | `/\b__import__\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:61 | `/\.on\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:62 | `/\.addEventListener\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:63 | `/\.subscribe\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:64 | `/\.emit\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:65 | `/\bEventEmitter\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:69 | `/\bffi\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:70 | `/\bnapi_/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:71 | `/\bctypes\./` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/sliceConfidence.ts:72 | `/\bWebAssembly\.instantiate/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:59 | `/(?:(?:const\|let\|var)\s+\|this\.)?([a-zA-Z0-9_]+)$/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![a-zA-Z0-9_])(?:(?:const\|let\|var)\s+\|this\.)?([a-zA-Z0-9_]+)$/ |
| src/ast/systemDependenceGraph.ts:65 | `/(?:this\.)?([a-zA-Z0-9_]+)\s*(?:\+\+\|--\|\+=\|-=)/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![a-zA-Z0-9_])(?:this\.)?([a-zA-Z0-9_]+)\s*(?:\+\+\|--\|\+=\|-=)/ |
| src/ast/systemDependenceGraph.ts:73 | `/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:82 | `/^(if\|for\|while\|switch)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:171 | `/^(export\s+)?(class\|function\|interface\|type)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:216 | `/^(if\|while\|for\|switch\|catch\|return\|throw)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:219 | `/^\s*(?:(?:public\|private\|protected\|async\|static\|export\|override)\s+)*(?:function\|def\|fn\|func\|[a-zA-Z_][a-zA-Z0-9_]*)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:226 | `/^\s*(export\s+)?(class\|interface)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:240 | `/\{/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:243 | `/^\s*(return\|throw)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:248 | `/\}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:268 | `/^\s*return\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:307 | `/^(export\s+)?(class\|interface)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:317 | `/this\.([a-zA-Z0-9_]+)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/systemDependenceGraph.ts:322 | `new RegExp(&#96;^\\s*(?:(?:private\|public\|protected\|readonly\|static)\\s+)*${propName}\\b&#96;)` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/ast/systemDependenceGraph.ts:335 | `/^(export\s+)?(class\|interface\|type\|enum)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:36 | `/import\s+(?:type\s+)?\{([^}]+)\}\s*from/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:56 | `/import\s+(?:type\s+)?([\w\d_]+)\s+from\s+['"][^'"]+['"]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:62 | `/import\s+(?:type\s+)?\*\s+as\s+([\w\d_]+)\s+from/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:68 | `/from\s+[\w\d_.]+\s+import\s+([^#\n]+)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:94 | `/\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:103 | `/\b([A-Z][a-zA-Z0-9_]+)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:109 | `/\b([a-z][a-z0-9]*[A-Z][a-zA-Z0-9_]*)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:115 | `/\b([a-z][a-z0-9]*_[a-z0-9_]+)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:199 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:326 | `/[a-zA-Z_$]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:363 | `/[=(:,[!&\|?;{]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:364 | `/\b(return\|typeof\|yield\|await\|case)\b$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:443 | `/^(?:export\s+)?(?:default\s+\|declare\s+\|abstract\s+\|pub\s+\|public\s+\|static\s+\|async\s+)*(?:class\|interface\|type\|(?:const\s+)?enum\|struct\|trait\|func\|def\|fn\|function)\s+([\w\d_]+)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:444 | `/^(?:export\s+)?(?:const\|let\|var)\s+([\w\d_]+)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ast/treeShaker.ts:445 | `/^type\s+([\w\d_]+)\s+(?:struct\|interface)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/normalizer.ts:17 | `/\r\n/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/normalizer.ts:17 | `/\r/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/normalizer.ts:20 | `/([a-zA-Z0-9_.-]+)\\([a-zA-Z0-9_.-]+)/g` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. |
| src/cache/normalizer.ts:26 | `/(?:Current Time\|Current Date\|Session Started at\|Timestamp):\s*[^\n]+/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:183 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:185 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:260 | `/[^\w\s]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:260 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:264 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/responseCache.ts:310 | `/\b(latest\|current\|currently\|today\|tonight\|now\|recent\|news\|weather\|price\|stock\|market\|exchange rate\|schedule\|time\|date)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cache/schemaMinifier.ts:130 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:61 | `/\/\*\*[\s\S]*?\*\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:63 | `/\/\*\*\|\*\/\|\*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:63 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:66 | `/^[ \t]*\/\/[^/].*$/gm` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:67 | `/\n\s*\n\s*\n+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:170 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/compressionProvider.ts:170 | `/; /g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:53 | `new RegExp(&#96;[A-Za-z0-9+/=_-]{${BLOB_THRESHOLD_CHARS},}&#96;, 'g')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/compression/conservativePathCompressor.ts:67 | `/[ \t]+$/gm` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![ \t])[ \t]+$/gm |
| src/compression/conservativePathCompressor.ts:107 | `/&#96;&#96;&#96;([a-zA-Z0-9_-]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:108 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:119 | `/&#96;&#96;&#96;([a-zA-Z0-9_+#-]+)\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:122 | `/\\\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:123 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:123 | `/^[ \t]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:133 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/compression/conservativePathCompressor.ts:154 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cost/pricingCatalog.ts:116 | `/^[A-Z]{3}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cost/pricingCatalog.ts:141 | `/^[a-z0-9._-]{1,100}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cost/pricingCatalog.ts:142 | `/^[a-z0-9._-]{1,150}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/cost/pricingCatalog.ts:143 | `/^\d{4}-\d{2}-\d{2}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:18 | `/\/\/.*$/gm` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:19 | `/\/\*[\s\S]*?\*\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:21 | `/(["'&#96;])(?:(?=(\\?))\2.)*?\1/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:22 | `/\b[0-9]+\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:24 | `/\b(const\|let\|var\|function\|class\|interface\|type\|return\|if\|else\|for\|while\|import\|export\|from\|async\|await)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:25 | `/\b[a-zA-Z_][a-zA-Z0-9_]*\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/astFingerprint.ts:27 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/lexicalNearDedup.ts:73 | `/[^a-zA-Z0-9_]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/lexicalNearDedup.ts:73 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:41 | `/\b(not\|no\|never\|deny\|denied\|unauthorized\|disabled\|forbidden\|reject\|failed\|failure\|false\|without\|except)\b\|!/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:42 | `/\b(public\|private\|protected\|readonly\|static\|const\|let\|var)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:43 | `/\b\d+(?:\.\d+)?\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:44 | `/\b(ms\|s\|sec\|seconds?\|min\|minutes?\|bytes?\|kb\|mb\|gb)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:45 | `/\b(?:TS\d{4,5}\|error\[E\d+\]\|E\d{4})\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:196 | `/\bnull\b\|\bundefined\b\|\?\s*:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:197 | `/\bnull\b\|\bundefined\b\|\?\s*:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:225 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/dedup/semanticDedup.ts:226 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/agenticCompactor.ts:124 | `/^<\d+>:\s*/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compactor.ts:125 | `/^\s+at\s+[\w\d_.$<>]+\s+\(/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compactor.ts:128 | `/^\s+at\s+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/componentRegistry.ts:310 | `/[^a-z0-9_.:-]/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:21 | `/\b(?:it is (?:worth noting\|definitely worth noting\|important to note) that)\b[,]?\s*/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:22 | `/\b(?:as (?:mentioned earlier\|previously stated\|a matter of fact))\b[,]?\s*/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:23 | `/\b(?:in order to)\b/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:24 | `/\b(?:with respect to\|in terms of)\b/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:25 | `/\b(?:basically\|actually\|literally\|essentially\|furthermore\|moreover\|nevertheless\|consequently\|incidentally\|please\|kindly\|sincerely\|definitely\|certainly\|obviously\|clearly\|undoubtedly\|presumably)\b[,]?\s*/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:28 | `/\b(?:very\|extremely\|highly\|quite\|really\|simply\|just)\b\s*/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:79 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;\|&#96;[^&#96;\n]+&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/compress.ts:131 | `/[ \t]{2,}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/conversationalPrompt.ts:53 | `/[?&#96;~<>{}[\]()=/\\@#$*\|]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/conversationalPrompt.ts:54 | `/\d/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/conversationalPrompt.ts:59 | `/[^a-z\s'-]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/conversationalPrompt.ts:60 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/conversationalPrompt.ts:61 | `/^['-]+\|['-]+$/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/deduplicator.ts:37 | `/&#96;&#96;&#96;(?:[\w\d_\-+.]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/deduplicator.ts:55 | `/[&#96;\\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/diffOutputOptimizer.ts:125 | `/&#96;&#96;&#96;diff\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/diffOutputOptimizer.ts:155 | `/^\+\+\+ [ab]\//` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/diffOutputOptimizer.ts:155 | `/^\+\+\+ /` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/diffOutputOptimizer.ts:160 | `/^@@ -(\d+),?(\d*) \+(\d+),?(\d*) @@/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/imageRightsizer.ts:43 | `/data:image\/(png\|jpeg\|jpg\|gif\|webp\|bmp);base64,([A-Za-z0-9+/=]{1000,})/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/imageRightsizer.ts:46 | `/\b([\w\-./\\]+\.(png\|jpg\|jpeg\|gif\|webp\|bmp\|tiff))\b/gi` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![\w\-./\\])\b([\w\-./\\]+\.(png\|jpg\|jpeg\|gif\|webp\|bmp\|tiff))\b/gi |
| src/engine/imageRightsizer.ts:187 | `new RegExp(IMAGE_FILE_REF_REGEX.source, IMAGE_FILE_REF_REGEX.flags)` | Vulnerable (polynomial, cloned pattern) | BUG-REGEX-01: fix IMAGE_FILE_REF_REGEX, inherited by this clone. |
| src/engine/legacyPipeline.ts:30 | `/&#96;&#96;&#96;([a-zA-Z0-9_-]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localModelManager.ts:97 | `/[^a-zA-Z0-9._-]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:198 | `/<\\|endoftext\\|>/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:199 | `/<\\|im_start\\|>/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:200 | `/<\\|im_end\\|>/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:201 | `/\[INST\]/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:202 | `/\[\/INST\]/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:203 | `/SYSTEM\s*:/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:204 | `/ASSISTANT\s*:/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:205 | `/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:206 | `/ignore\s+(all\s+)?previous\s+instructions/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:207 | `/disregard\s+(all\s+)?prior\s+guidance/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:211 | `/Bearer\s+[A-Za-z0-9\-_.]+/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:212 | `/AIza[0-9A-Za-z-_]{35}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:213 | `/sk-[a-zA-Z0-9]{20,}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:214 | `/-----BEGIN\s+[A-Z\s]+KEY-----[\s\S]*?-----END\s+[A-Z\s]+KEY-----/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:241 | `/\/\*[\s\S]*?\*\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:242 | `/^\s*\/\/.*$/gm` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*\/\/.*$/gm |
| src/engine/localSlmBrain.ts:244 | `/\b[A-Za-z_][A-Za-z0-9_]*\b\|\b\d+(?:\.\d+)?\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:548 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:626 | `/\/\*[\s\S]*?\*\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:627 | `/^\s*\/\/.*$/gm` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*\/\/.*$/gm |
| src/engine/localSlmBrain.ts:628 | `/\n\s*\n/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/localSlmBrain.ts:787 | `/\b[A-Z][a-zA-Z0-9_]+\b\|\b[a-z]+[A-Z][a-zA-Z0-9_]*\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:49 | `/\b(format\|lint\|indent\|align\|spacing)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:50 | `/\b(import\|require\|include\|use)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:51 | `/\b(rename\|typo\|spelling\|capitalize)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:52 | `/\b(comment\|doc(string)?\|jsdoc\|tsdoc)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:53 | `/\b(boilerplate\|scaffold\|template\|stub)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:54 | `/\b(type\s*annotation\|add\s*types?)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:59 | `/\b(architect(ure)?\|design\s*(pattern\|system)?\|system\s*design)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:60 | `/\b(debug\|investigate\|diagnose\|root\s*cause)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:61 | `/\b(security\|vulnerabilit\|exploit\|injection\|xss\|csrf)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:62 | `/\b(performance\|optimize\|bottleneck\|profil(e\|ing))\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:63 | `/\b(concurren(cy\|t)\|race\s*condition\|deadlock\|mutex)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:64 | `/\b(migrat(e\|ion)\|upgrade\|backwards?\s*compat)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:65 | `/\b(explain\s*(why\|how)\|reason(ing)?\|analyz(e\|is))\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:66 | `/\b(refactor\s*(entire\|whole\|all\|major))\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:67 | `/\b(across\s*(multiple\|many)\s*files\|multi.?file)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/modelRouter.ts:87 | `new RegExp(pattern, 'i')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/engine/modelRouter.ts:95 | `new RegExp(pattern, 'i')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/engine/pipelineOrchestrator.ts:813 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:910 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1178 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1180 | `/[a-zA-Z_][a-zA-Z0-9_]*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1219 | `/&#96;&#96;&#96;([a-zA-Z0-9_-]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1240 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1241 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1400 | `/\r?\n$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/pipelineOrchestrator.ts:1525 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/prefixContinuity.ts:35 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/prefixContinuity.ts:36 | `/[a-zA-Z_][a-zA-Z0-9_]*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/progressiveSummarizer.ts:73 | `/[.!?]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:40 | `/you must always ensure that you/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:41 | `/you must ensure that/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:42 | `/please make sure to/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:43 | `/it is very important that you/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:44 | `/under no circumstances should you/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:45 | `/do not ever/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:46 | `/do not use any/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:47 | `/always provide your response in/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:48 | `/format your output as/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:49 | `/output your answer in the form of/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:50 | `/in order to make sure that/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:51 | `/as a senior software engineer/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:52 | `/as an expert programming assistant/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:53 | `/for example, you can/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:54 | `/such as, for instance/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:55 | `/without any additional explanation or conversational filler/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:56 | `/only output the code without markdown formatting/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:64 | `/[ \t]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:65 | `/\n\s*\n/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/promptMinifier.ts:86 | `/^[-*•]\s*/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:163 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:441 | `/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:442 | `/^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:443 | `/^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:444 | `/^\s*(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:445 | `/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:446 | `/^\s*def\s+([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:447 | `/^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:448 | `/^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:449 | `/^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:481 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:483 | `/[^a-z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:493 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/ramManager.ts:495 | `/[^a-z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:37 | `/import\s+.*?from\s+['"]([^'"]+)['"]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:38 | `/import\s+['"]([^'"]+)['"]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:39 | `/require\s*\(\s*['"]([^'"]+)['"]\s*\)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:40 | `/from\s+(\S+)\s+import/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:41 | `/import\s+"([^"]+)"/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:42 | `/use\s+(\S+);/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:43 | `/#include\s+[<"]([^>"]+)[>"]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:125 | `new RegExp(pattern.source, pattern.flags)` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/engine/relevanceScorer.ts:131 | `/^\.\//` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/relevanceScorer.ts:132 | `/\.\w+$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/safePathPolicy.ts:106 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/safePathPolicy.ts:106 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/scratchpadManager.ts:141 | `/[\n\r]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/scratchpadManager.ts:148 | `/(?:Error\|Exception):[^\n]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/taskCompressionPolicy.ts:32 | `/\b(?:interface\|public api\|api surface\|signature\|signatures\|exports\|type definition\|type definitions)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/taskCompressionPolicy.ts:33 | `/\b(?:flow\|logic\|behavio(?:u)?r\|edge case\|correctness\|implementation\|how .* works?)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/engine/tokenizer.ts:11 | `/[\p{L}\p{N}]+\|[^\s\p{L}\p{N}]+\|\s+/gu` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/independentOracles.ts:79 | `/[a-zA-Z0-9_]+\|[^\s\w]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/networkAuditEngine.ts:45 | `/\brequire\s*\(\s*['"](http\|https\|http2\|net\|tls\|dgram\|axios\|got\|superagent\|request\|undici)['"]\s*\)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/networkAuditEngine.ts:46 | `/\bimport\s+.*?\s+from\s+['"](http\|https\|http2\|net\|tls\|dgram\|axios\|got\|superagent\|request\|undici)['"]/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/networkAuditEngine.ts:47 | `/\b(fetch\|axios\|superagent)\s*\(/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/networkAuditEngine.ts:48 | `/\bchild_process.*?\b(curl\|wget\|nc\|ncat\|telnet)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/networkAuditEngine.ts:81 | `/(?:\bfetch\s*\(\|\bXMLHttpRequest\b\|\bWebSocket\s*\(\|require\(["'](?:https?\|net\|tls\|dgram\|http2)["']\))/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:29 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:142 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:146 | `/["']([a-zA-Z0-9_\-\.\s]{3,40})["']/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:176 | `/\b[a-zA-Z_][a-zA-Z0-9_]{3,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:240 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:246 | `new RegExp(&#96;\\b${task}\\b&#96;)` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/evaluation/preservationGate.ts:258 | `/export\s+(?:default\s+)?(?:async\s+)?(?:abstract\s+)?(?:function\|class\|interface\|const\|let\|var\|type\|enum\|namespace)\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:267 | `/\b(?:interface\|public api\|api surface\|signature\|signatures\|exports\|type definition\|type definitions)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:268 | `/\b(?:flow\|logic\|behavio(?:u)?r\|edge case\|correctness\|implementation\|how .* works?)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:279 | `/&#96;&#96;&#96;(?:[a-zA-Z0-9_-]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/evaluation/preservationGate.ts:288 | `new RegExp(&#96;\\b(?:${CONTROL_FLOW_KEYWORDS.join('\|')})\\b&#96;, 'g')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/experiments/promotionEvaluator.ts:40 | `/^[0-9a-f]{64}$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/experiments/promotionEvaluator.ts:41 | `/^[0-9a-f]{64}$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/extension.ts:188 | `/[/\\](?:\.gitignore\|\.tokenignore)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/finops/claudeUsage.ts:10 | `/^[a-zA-Z0-9._:@/-]{1,150}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/finops/usageFileReader.ts:30 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/finops/usageStore.ts:68 | `/^\d{4}-\d{2}-\d{2}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/finops/usageStore.ts:118 | `/mask\|dedup/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:54 | `/^\s*at\s+[\w$.<>\s]+\(?[^\s)]+:\d+(?::\d+)?\)?\s*$/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*at[ \t]+[^\r\n]{1,1024}:\d{1,10}(?::\d{1,10})?\)?[ \t]*$/m |
| src/governor/inlineEvidenceClassifier.ts:55 | `/Traceback \(most recent call last\):/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:56 | `/^panic:\s+.+$/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:57 | `/^\s*at\s+[\w.$]+\([\w.]+\.java:\d+\)\s*$/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*at[ \t]+[\w.$]+\([\w.]+\.java:\d+\)[ \t]*$/m |
| src/governor/inlineEvidenceClassifier.ts:58 | `/\b(?:TS\|CS)\d{4,5}\b\s*[:.]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:59 | `/thread '[^']+' panicked at/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:60 | `/\b\w*(?:Error\|Exception)\b:[^\n]{0,200}\n[\s\S]{0,400}?(?:^\s*at\s\|File ")/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:62 | `/(?:^\|\s)(?:describe\|it\|test)\s*\(\s*['"&#96;]/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:63 | `/\b(?:expect\s*\(\|assert(?:Equal\|True\|That\|\.\w+)?\s*\(\|should\.\w+\|\.toBe\w*\s*\()/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:64 | `/^func\s+Test[A-Z]\w*\s*\(\s*\w+\s+\*testing\.T\s*\)/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:65 | `/#\[(?:test\|tokio::test)\]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:66 | `/@(?:Test\|ParameterizedTest)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:67 | `/^\s*def\s+test_\w+\s*\(/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*def[ \t]+test_\w+[ \t]*\(/m |
| src/governor/inlineEvidenceClassifier.ts:69 | `/(?:^\|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+\s*\(\|(?:public\|private\|protected)\s+\w+\s*\(\|def\s+\w+\s*\(\|func\s+\w+\s*\(\|fn\s+\w+\s*[(<])/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function[ \t]+\w+[ \t]*\(\|(?:public\|private\|protected)[ \t]+\w+[ \t]*\(\|def[ \t]+\w+[ \t]*\(\|func[ \t]+\w+[ \t]*\(\|fn[ \t]+\w+[ \t]*[(<])/ |
| src/governor/inlineEvidenceClassifier.ts:70 | `/(?:^\|\n)\s*(?:export\s+)?(?:abstract\s+)?(?:class\|struct\|impl\|enum)\s+\w+/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:abstract[ \t]+)?(?:class\|struct\|impl\|enum)[ \t]+\w+/ |
| src/governor/inlineEvidenceClassifier.ts:72 | `/(?:^\|\n)\s*(?:export\s+)?(?:interface\s+\w+\|type\s+\w+\s*=\|declare\s+(?:module\|namespace\|function)\|trait\s+\w+\|protocol\s+\w+)/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:interface[ \t]+\w+\|type[ \t]+\w+[ \t]*=\|declare[ \t]+(?:module\|namespace\|function)\|trait[ \t]+\w+\|protocol[ \t]+\w+)/ |
| src/governor/inlineEvidenceClassifier.ts:75 | `/\)\s*:\s*(?:Promise\s*<)?\s*[A-Za-z_$][\w$]*(?:\s*[<\[])?/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:77 | `/^diff --git \|^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@\|^(?:\+\+\+\|---) [ab]?\//m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:78 | `/^commit [0-9a-f]{7,40}$/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:81 | `/\b(?:package\.json\|tsconfig(?:\.\w+)?\.json\|pyproject\.toml\|Cargo\.toml\|go\.mod\|pom\.xml\|build\.gradle\|\.eslintrc\|webpack\.config\|vite\.config\|docker-compose\.ya?ml\|Dockerfile)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:83 | `/\b(?:jest\.mock\s*\(\|sinon\.(?:stub\|spy\|mock)\s*\(\|unittest\.mock\|@patch\b\|Mockito\.\w+\|gomock\.\|mockery\.\|createMock\w*\s*\()/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:84 | `/\b(?:@pytest\.fixture\|beforeEach\s*\(\|setUp\s*\(\s*\)\|fixture\s*\(\|testdata\/\|__fixtures__)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/inlineEvidenceClassifier.ts:182 | `/&#96;&#96;&#96;([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:17 | `/\b(debug\|fix\|fixes\|bug\|bugs\|error\|errors\|exception\|exceptions\|crash\|crashes\|fails?\|failing\|broken\|nullpointer\|undefined\|traceback\|panic\|segfault)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:18 | `/\b(uncaught\|typeerror\|referenceerror\|syntaxerror\|cannot read property\|stack trace)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:22 | `/\b(refactor\|refactoring\|clean\s*up\|restructure\|restructuring\|rename\|extract\|modularize\|simplify\|reorganize\|decouple\|optimize code)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:26 | `/\b(tests?\|unit\s*tests?\|integration\s*tests?\|specs?\|coverage\|assertions?\|asserts?\|mocks?\|fixtures?\|e2e\|jest\|pytest\|junit\|vitest)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:30 | `/\b(explain\|explains\|explanation\|how\s+does\|walk\s*through\|document\|documentation\|overview\|what\s+is\|understand\|clarify\|describe)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:37 | `/\b(?:list\|show\|summar(?:ise\|ize)\|enumerate\|outline\|what)\b[^.?!]{0,80}\b(?:public\s+api\|api\s+surface\|exports?\|exported\|signatures?\|type\s+definitions?\|declarations?\|interfaces?)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:41 | `/\b(review\|reviews\|pr\|pull\s*requests?\|diff\|audit\|security\s*check\|code\s*smell\|lint)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:45 | `/\b(architecture\|architectural\|design\|pattern\|system\s*design\|schema\|data\s*model\|pipeline\|topology\|scaffold)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:49 | `/\b(find\|search\|where\s+is\|locate\|list\s+all\|usages?\s+of\|references?\s+to)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/governor/intentExtractor.ts:53 | `/\b(add\|create\|implement\|build\|support\|new\s+feature\|endpoint\|generate\|integrate)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:212 | `/\b(?:we(?:'ll\| will)?\|let's\|going to\|decided to\|agreed to\|chose to)\s+[^.!?\n]{8,}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:213 | `/\b(?:use\|using\|switch to\|keep\|adopt)\s+[A-Za-z0-9_@.\/-]{2,}[^.!?\n]{0,80}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:216 | `/\b(?:must\|must not\|never\|always\|do not\|don't\|cannot\|required to\|should not)\s+[^.!?\n]{8,}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:219 | `/\b(?:todo\|to do\|next\|still need to\|remaining\|outstanding\|not yet)\b[^.!?\n]{5,}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:222 | `/\b(?:error\|exception\|failed\|failing\|cannot find\|is not assignable\|undefined)\b[^.!?\n]{5,}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/contextEpoch.ts:224 | `/\b[\w.-]+\/[\w.\/-]*\.[a-z]{1,4}\b\|\b[\w-]+\.(?:ts\|tsx\|js\|jsx\|py\|go\|rs\|java\|cs\|cpp\|h\|json\|md)\b/gi` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![\w./-])[\w.-]+\/[\w./-]{0,4096}\.[a-z]{1,4}\b\|(?<![\w-])[\w-]+\.(?:ts\|tsx\|js\|jsx\|py\|go\|rs\|java\|cs\|cpp\|h\|json\|md)\b/gi |
| src/history/contextEpoch.ts:268 | `/'([^']{2,64})'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/modelHistory.ts:3 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/modelHistory.ts:8 | `/^>\s*(?:⚡\|💡\|🧠\|🔷\|🚫)?\s*(?:\*\*)?(?:Tokonomics\|This task could use\|Complex task detected\|Standard tier\|Model Policy\|Verified Exact Response Cache Hit)/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/modelHistory.ts:9 | `/^###\s+(?:⚡\s+)?Tokonomics\b/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/modelHistory.ts:10 | `/^\*\(No downstream .*model available/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/history/modelHistory.ts:16 | `/\n{3,}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:10 | `/^\.env(?:\..+)?$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:10 | `/^\.npmrc$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:10 | `/^\.pypirc$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:10 | `/^\.netrc$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:11 | `/^credentials(?:\..+)?$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:11 | `/^secrets?(?:\..+)?$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:11 | `/^id_(?:rsa\|dsa\|ecdsa\|ed25519)(?:\.pub)?$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:26 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:28 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:33 | `/(^\|\/)\.kube\/config$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:37 | `/(^\|\/)(node_modules\|dist\|build\|out\|coverage\|\.git\|\.next)(\/\|$)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:52 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:67 | `/^\//` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:67 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:67 | `/\/$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:68 | `/[.+^${}()\|[\]\\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:69 | `/\*\*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:70 | `/\*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:71 | `/\?/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:72 | `/\u0000/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ignore/tokenIgnore.ts:73 | `new RegExp(&#96;${anchored ? '^' : '(^\|.*/)'}${source}(?:/.*)?$&#96;, 'i')` | Vulnerable (exponential) | BUG-REGEX-02: state-machine matcher; no regex generated from globs. |
| src/memory/projectMemory.ts:188 | `/(?:ignore\s+previous\s+instructions\|system\s*:\s*you\s+are\|you\s+are\s+an?\s+ai\s+assistant\|(?:^\|\n)\s*(?:human\|assistant\|system)\s*:)/i` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:ignore[ \t]+previous[ \t]+instructions\|system[ \t]*:[ \t]*you[ \t]+are\|you[ \t]+are[ \t]+an?[ \t]+ai[ \t]+assistant\|(?:^\|\n)[ \t]*(?:human\|assistant\|system)[ \t]*:)/i |
| src/memory/projectMemory.ts:197 | `/(?:import\s+.*from\s+['"][^'"]+['"][\s\S]*import\s+.*from\s+['"][^'"]+['"]\|export\s+(?:default\s+)?(?:class\|interface\|function)\s+\w+[\s\S]{300,})/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/memory/projectMemory.ts:206 | `/(?:\x1b\[[0-9;]*[a-zA-Z]\|(?:^\|\n)\s*(?:PS\s+[A-Za-z]:\\\|\$\s+\|>\s*npm\s+(?:run\|test\|build)\|Traceback\s+\(most\s+recent\s+call\s+last\):))/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:\x1b\[[0-9;]*[a-zA-Z]\|(?:^\|\n)[ \t]*(?:PS[ \t]+[A-Za-z]:\\\|\$[ \t]+\|>[ \t]*npm[ \t]+(?:run\|test\|build)\|Traceback[ \t]+\(most[ \t]+recent[ \t]+call[ \t]+last\):))/m |
| src/memory/projectMemory.ts:223 | `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z\|a-z]{2,}\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/memory/projectMemory.ts:231 | `/\b(?:(?:25[0-5]\|2[0-4][0-9]\|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]\|2[0-4][0-9]\|[01]?[0-9][0-9]?)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/memory/projectMemory.ts:529 | `/[\s,._-]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/memory/projectMemory.ts:619 | `/[^a-zA-Z0-9_-]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:732 | `/data:image\/(png\|jpeg\|jpg\|gif\|webp\|bmp);base64,([A-Za-z0-9+/=]{1000,})/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:836 | `/^(export\s+)?(default\s+)?(class\|interface\|type\|enum\|function\|const\|let\|var\|import\|package\|namespace)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:837 | `/^(public\|private\|protected\|static\|readonly\|async\|override)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:838 | `/^(def\|class\|async\s+def)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:841 | `/\{/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:842 | `/\}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:848 | `/\{/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/performance/workerPool.ts:849 | `/\}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/protocol/canonicalCompiler.ts:193 | `/[^A-Z0-9_]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatContextReferences.ts:63 | `/&#96;&#96;&#96;[\s\S]+&#96;&#96;&#96;/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatContextReferences.ts:63 | `/\b(?:codebase\|workspace\|repository\|(?:this\|my\|our\|the\|current\|entire\|whole\|local)\s+(?:(?:current\|entire\|whole\|local\|existing)\s+)?(?:code\|file\|project\|extension\|function\|class\|repo)\|extension\s+source)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:211 | `/:L?(\d+)-L?(\d+)$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:215 | `/:L?\d+-L?\d+$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:255 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:279 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:493 | `/\b([\w\d_-]+\.(?:ts\|js\|tsx\|jsx\|py\|go\|rs\|java\|cs\|cpp\|h))\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:537 | `/\r\n/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:556 | `/&#96;&#96;&#96;diff\s*\n([\s\S]*?)&#96;&#96;&#96;/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:752 | `/&#96;&#96;&#96;[\s\S]+&#96;&#96;&#96;/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/chatParticipant.ts:1100 | `/^[A-Z0-9_]{1,64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/contextAnalyzer.ts:157 | `/&#96;&#96;&#96;(?:[\w\d_\-+.]+)?\r?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/proxy/modelProvider.ts:459 | `/^[A-Za-z0-9_-]+$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:59 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:125 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:255 | `/^(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:256 | `/^(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:257 | `/^(?:export\s+)?type\s+([A-Za-z0-9_$]+)\s*=/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:258 | `/^(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:259 | `/^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:260 | `/^(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:262 | `/^class\s+([A-Za-z0-9_]+)(?:\(.*\))?:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:263 | `/^(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:265 | `/^type\s+([A-Za-z0-9_]+)\s+struct\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:266 | `/^type\s+([A-Za-z0-9_]+)\s+interface\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:267 | `/^func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:269 | `/^(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:270 | `/^(?:pub\s+)?trait\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:271 | `/^(?:pub\s+)?enum\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:272 | `/^(?:pub\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:274 | `/^(?:public\|private\|protected)?\s*(?:static\s+)?(?:class\|interface\|record)\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:297 | `/\{.*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/repo/repoMap.ts:304 | `/\b([A-Z][A-Za-z0-9_]{2,})\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceContract.ts:10 | `/\b(error\|exception\|failed\|failure\|stack\|diagnostic\|traceback)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceContract.ts:24 | `/\b[A-Z][A-Za-z0-9_$]{2,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:103 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:111 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:146 | `/(?:^\|\/)(?:test\|tests\|__tests__)(?:\/\|$)\|\.(?:test\|spec)\./i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:166 | `/\b(?:error\|exception\|traceback\|TS\d{3,5})\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:178 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:186 | `/[\\\\/]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:187 | `/[\\\\/]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:312 | `/(?:^\|\/)(?:test\|tests\|__tests__)(?:\/\|$)\|\.(?:test\|spec)\./i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:313 | `/(?:^\|\/)(?:config\|configuration)(?:\/\|$)\|\.(?:json\|ya?ml\|toml)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:498 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:498 | `/[^a-z0-9_$]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/evidenceRetriever.ts:505 | `new RegExp(&#96;\\b${symbolName.replace(/[.*+?^${}()\|[\]\\]/g, '\\$&')}\\b&#96;, 'i')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/retrieval/evidenceRetriever.ts:505 | `/[.*+?^${}()\|[\]\\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:21 | `/\b[A-Z][A-Za-z0-9_$]{2,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:23 | `/\b(?:class\|interface\|type\|enum\|function\|def\|struct)\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:26 | `/(?:[^\s:]+):L?\d+(?:-L?\d+)?/g` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![^\s:])(?:[^\s:]+):L?\d+(?:-L?\d+)?/g |
| src/retrieval/structuredPreservation.ts:29 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:29 | `/\b(?:Error\|Exception\|Traceback\|TS\d{3,5})\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:33 | `/\bimport\s+(?:type\s+)?(?:\{\s*)?([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/retrieval/structuredPreservation.ts:36 | `/(?:callId\|tool_call_id)["']?\s*[:=]\s*["']([^"']+)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:133 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:134 | `/[^a-zA-Z0-9_]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:136 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:241 | `/^[ 	]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:246 | `/\x08(?:if\|else\|switch\|case\|for\|while\|catch\|match)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:247 | `/\x08(?:function\|class\|interface\|struct\|enum\|def\|func\|fn\|impl\|type)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:248 | `/\x08(?:async\|await\|Promise\|Future\|go\s\|spawn\|thread)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:249 | `/\w\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:250 | `/["'&#96;]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/embeddingProvider.ts:251 | `/(?:\/\/\|#\|\/\*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/hybridRetriever.ts:43 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/hybridRetriever.ts:44 | `/[^a-zA-Z0-9_]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/hybridRetriever.ts:46 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/mmrDiversity.ts:135 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/mmrDiversity.ts:136 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/reranker.ts:121 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/search/reranker.ts:148 | `/[^a-zA-Z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:165 | `new RegExp(this.escapeRegExp(user), 'gi')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/security/anonymizedLogger.ts:171 | `/[A-Za-z]:[/\\]Users[/\\][^/\\]+[/\\]/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:174 | `/(?:\/home\|\/Users)\/[^/\\]+\//gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:177 | `/[A-Za-z]:[/\\](?:[A-Za-z0-9_.\-]+[/\\]){1,2}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:183 | `/\b(?:(?:25[0-5]\|2[0-4][0-9]\|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]\|2[0-4][0-9]\|[01]?[0-9][0-9]?)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:199 | `/[.*+?^${}()\|[\]\\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:204 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/anonymizedLogger.ts:204 | `/^\s*at\s/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:81 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:81 | `/\/$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:82 | `/\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:83 | `new RegExp(&#96;${pathPattern}(?:[\\\\/]([^\\s\&#96;'"<>\|]+))?&#96;, 'gi')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/security/requestBoundary.ts:83 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:85 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:85 | `/\/$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:87 | `/\//g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:88 | `new RegExp(&#96;${homePattern}(?:[\\\\/]([^\\s\&#96;'"<>\|]+))?&#96;, 'gi')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/security/requestBoundary.ts:88 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/requestBoundary.ts:110 | `/^(?:api[_-]?key\|access[_-]?token\|auth[_-]?token\|client[_-]?secret\|password\|passwd\|secret)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:17 | `/(?:mock\|test\|fake\|dummy\|sample\|example\|placeholder\|changeme\|temp\|default\|123456\|abcdef\|your[_-]\|none\|null\|undefined\|xxx)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:18 | `/^(?:mock\|test\|fake\|dummy\|sample\|example\|temp\|fixture)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:21 | `/\b(?:ignore\|disregard\|forget)\s+(?:all\s+\|any\s+)?(?:previous\|prior\|past\|above\|earlier)\s+(?:instructions\|guidelines\|rules\|prompts\|commands\|directives)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:22 | `/\b(?:system\s+prompt\|system\s+directive\|system\s+instruction)\s*:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:23 | `/\[\s*(?:system\|admin\|developer\|override\|jailbreak)\s+(?:instruction\|directive\|prompt\|override\|command)\s*\]/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:24 | `/\b(?:you\s+are\s+now\|switch\s+to\|act\s+as)\s+(?:in\s+)?(?:maintenance\|developer\|admin\|root\|debug\|unrestricted\|god\|dan)\s+mode\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:25 | `/\b(?:bypass\|override)\s+(?:all\s+)?(?:safety\|security\|system)\s+(?:rules\|filters\|guidelines\|instructions)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:26 | `/\b(?:output\|reveal\|dump)\s+(?:all\s+)?(?:secrets\|passwords\|credentials\|api[_-]?keys\|tokens\|system\s+prompt)\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:30 | `/\bsk-ant-(?:api\d{2}-)?[a-zA-Z0-9_-]{20,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:31 | `/\bsk-(?!ant-)(?:proj-\|live-\|test-)?[a-zA-Z0-9_-]{20,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:32 | `/\b(?:ghp\|gho\|ghu\|ghs\|ghr)_[a-zA-Z0-9_-]{30,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:33 | `/\bglpat-[a-zA-Z0-9_-]{20,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:34 | `/\bAIza[0-9A-Za-z_-]{30,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:35 | `/\b(?:AKIA\|ASIA)[0-9A-Z]{16}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:36 | `/\bnpm_[a-zA-Z0-9]{30,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:37 | `/\b(?:sk\|rk)_(?:live\|test)_[a-zA-Z0-9]{16,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:38 | `/\bSG\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:39 | `/\beyJ[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\.[a-zA-Z0-9_-]{8,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:40 | `/\bBearer\s+[a-zA-Z0-9_.~+\/-]{20,}/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:41 | `/-----BEGIN (?:RSA \|EC \|DSA \|OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA \|EC \|DSA \|OPENSSH )?PRIVATE KEY-----/g` | Vulnerable (quadratic repeated unterminated headers; static) | BUG-SEC-01 replaces PEM scans with a consuming forward scan. |
| src/security/sanitizer.ts:42 | `/(?:mongodb(?:\+srv)?\|postgres(?:ql)?\|mysql\|redis):\/\/[^:\s]+:[^@\s]+@[^\s"']+/gi` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:43 | `/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9_/-]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:46 | `/\b([a-zA-Z0-9_-]*(?:api[_-]?key\|access[_-]?token\|auth[_-]?token\|client[_-]?secret\|password\|passwd\|secret)[a-zA-Z0-9_-]*)\b(\s*[:=]\s*)(["']?)(?!\*\*\*\[REDACTED)([^\s,"'&#96;;}{]{8,})\3/gi` | Vulnerable (polynomial ambiguous repetitions; static) | BUG-SEC-01 removes this regex from the active assignment scan. |
| src/security/sanitizer.ts:90 | `/^["']\|["']$/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:183 | `/\/\*[\s\S]*?\*\//g` | Vulnerable (quadratic repeated unterminated block starts; static) | BUG-REGEX-01: use the consuming replaceDelimited scanner supplied in REMEDIATION.md. |
| src/security/sanitizer.ts:192 | `/(?:"""[\s\S]*?"""\|'''[\s\S]*?''')/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:201 | `/\/\/[^\n]*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:210 | `/(^\|[ \t])#[^\n]*/gm` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:219 | `/(^\|[ \t])--[^\n]*/gm` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:237 | `/(\r?\n)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:239 | `/^\r?\n$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sanitizer.ts:247 | `/[.*+?^${}()\|[\]\\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sourcePolicy.ts:11 | `/^(?:\.env(?:\..*)?\|\.npmrc\|\.pypirc\|\.netrc\|credentials?\|secrets?\|id_(?:rsa\|dsa\|ecdsa\|ed25519))(?:\..*)?$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/security/sourcePolicy.ts:37 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:100 | `new RegExp(String.fromCharCode(13) + '?' + String.fromCharCode(10))` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| src/subscriptions/cliTransport.ts:116 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:134 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:144 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:222 | `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:240 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/cliTransport.ts:275 | `/logged in using chatgpt/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/modelChoices.ts:33 | `/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/subscriptions/subscriptionModels.ts:18 | `/\.(cmd\|bat\|ps1\|js)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/tools/toolIndex.ts:45 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatMarkdown.ts:31 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatMarkdown.ts:43 | `/^(https?:\/\/\|mailto:)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatMarkdown.ts:43 | `/[\u0000-\u0020\u007f]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatMarkdown.ts:49 | `/^text-align:(left\|center\|right)$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatPersistence.ts:26 | `/^chat_[\w-]{1,200}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/chatViewProvider.ts:161 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:272 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:346 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:386 | `/&/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:387 | `/</g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:388 | `/>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:389 | `/"/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:390 | `/'/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:395 | `/</g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:396 | `/>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:397 | `/&/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:398 | `/\u2028/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/ui/dashboardWebview.ts:399 | `/\u2029/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/deltaContextEngine.ts:76 | `/\+([0-9]+)(?:,([0-9]+))?/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:41 | `/Property '([^']+)' does not exist on type/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:43 | `/Property '([^']+)' does not exist on type/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:44 | `/Cannot find name '([^']+)'/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:46 | `/Cannot find name '([^']+)'/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:47 | `/Type '([^']+)' is not assignable to type '([^']+)'/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:49 | `/Type '([^']+)' is not assignable/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:50 | `/SyntaxError\|Unexpected token/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:52 | `/AssertionError\|Expected: .* Received:/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:54 | `/failed to compile\|build failed\|cannot find module/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:74 | `/\u001b\[[0-9;?]*[ -/]*[@-~]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:76 | `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:88 | `/at\s+(?:([a-zA-Z0-9_$.#]+)\s+\()?(?:[a-zA-Z]:)?[\\/]?([^:()]+):([0-9]+):([0-9]+)\)?/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:91 | `/File "([^"]+)", line ([0-9]+), in ([a-zA-Z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:101 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/errorIntelligence.ts:118 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/gitGraph.ts:22 | `/<[^>]*>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/gitGraph.ts:23 | `/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z\|a-z]{2,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/gitGraph.ts:28 | `/https?:\/\/[^\s]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/gitGraph.ts:29 | `/git@[^\s]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/lspAdapter.ts:225 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:39 | `/code generated by .* do not edit/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:40 | `/@generated/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:41 | `/generated by openapi generator/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:42 | `/generated by protoc/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:43 | `/this file is automatically generated/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:44 | `/autogenerated by swagger/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:45 | `/generated by graphql-codegen/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:49 | `/\.generated\.(ts\|js\|go\|java\|cs)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:50 | `/_pb\.(ts\|js\|go\|py)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:51 | `/\.pb\.(go\|ts\|js)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:52 | `/_grpc\.(ts\|js\|go\|py)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:61 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:85 | `/(?:^\|[\\/])(vendor\|third_party\|node_modules\|extern\|deps\|bower_components)[\\/]/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:95 | `/\.(?:proto\|graphql\|gql)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:96 | `/\.(?:json\|ya?ml)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:96 | `/(?:swagger\|openapi\|schema\|spec)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:107 | `/(?:^\|[\\/])migrations?[\\/]\|(?:^\|[\\/])db[\\/]migrate[\\/]\|\bmigration\b.*\.(?:sql\|ts\|js\|py)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:117 | `/\.min\.(?:js\|css\|json)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:151 | `/openapi/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:151 | `/swagger/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:152 | `/protobuf\|protoc/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:153 | `/graphql/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:154 | `/grpc/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:163 | `/\.env(?:$\|\.)\|\.pem$\|\.key$\|id_rsa/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:214 | `/_pb\|_grpc\|generated/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/provenance.ts:254 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/scipIndexer.ts:78 | `/[.()#]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/scipIndexer.ts:85 | `/[.()#]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/semanticChunk.ts:139 | `/;\s*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:81 | `/is not assignable\|type '.*' is not\|expected .* but got\|incompatible type/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:82 | `/cannot find name\|is not defined\|undefined symbol\|has no exported member\|does not exist on type/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:83 | `/unexpected token\|syntax error\|expression expected\|unterminated/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:84 | `/uncaught\|threw\|exception\|stack trace/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:85 | `/test failed\|assertion\|expect\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCollection.ts:91 | `/'([A-Za-z_$][A-Za-z0-9_$]*)'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCoordinator.ts:124 | `/\b(?:at\s+[a-zA-Z0-9_$.#]+\|File\s+"[^"]+",\s+line\s+\d+\|TS\d{4,5}\|AssertionError)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCoordinator.ts:370 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCoordinator.ts:378 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/signalCoordinator.ts:382 | `/^buffer:(\d+)$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:437 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:439 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:440 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:473 | `/\b[a-zA-Z_][a-zA-Z0-9_]{2,}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:509 | `/^file:\/\//` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/snapshotSafeLsp.ts:573 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:47 | `/\u001b\[[0-9;?]*[ -/]*[@-~]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:49 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:60 | `/^\s*(?:\[[=\->\s]+\]\|\d{1,3}%\|[\/\\\|\-]\s*)+\s*$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:65 | `/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:86 | `/(?:\/home\/[a-zA-Z0-9._-]+\|\/Users\/[a-zA-Z0-9._-]+\|[A-Za-z]:\\Users\\[a-zA-Z0-9._-]+)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:89 | `/https?:\/\/[^\s"'>]+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:92 | `/\b(?:10\.\d{1,3}\|192\.168\.\d{1,3}\|172\.(?:1[6-9]\|2\d\|3[0-1])\.\d{1,3})\.\d{1,3}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:104 | `/\bTS\d{4,5}\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:108 | `/\berror\[(E\d{4})\]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:111 | `/E\d{4}/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:117 | `/\b(?:ERR_[A-Z_]+\|ELIFECYCLE)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:121 | `/\b(?:AssertionError\|NullPointerException\|IndexOutOfBoundsException\|FileNotFoundException\|TypeError\|ValueError\|KeyError\|ZeroDivisionError)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:170 | `/\bTS\d{4,5}:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:176 | `/at\s+(?:([a-zA-Z0-9_$.#]+)\s+\()?\s*([a-zA-Z]:[\\/][^:()]+\|[^:()]+):([0-9]+):([0-9]+)\)?/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:177 | `/File "([^"]+)", line ([0-9]+), in ([a-zA-Z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:184 | `/^✕ \|^FAIL /` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:197 | `/^FAILED /` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:216 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:237 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/terminalOptimizer.ts:265 | `/\bTS\d{4,5}:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIdentity.ts:35 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIdentity.ts:64 | `/[\\/]+$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:559 | `/\b([A-Z][A-Za-z0-9_$]{2,})\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:723 | `/^\s*(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:724 | `/^\s*(?:export\s+)?interface\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:725 | `/^\s*(?:export\s+)?type\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:726 | `/^\s*(?:export\s+)?enum\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:727 | `/^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:728 | `/^\s*def\s+([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:729 | `/^\s*func\s+(?:\([^)]+\)\s+)?([A-Za-z0-9_]+)\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:730 | `/^\s*(?:pub\s+)?fn\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:731 | `/^\s*(?:pub\s+)?struct\s+([A-Za-z0-9_]+)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:734 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:748 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:748 | `/[^a-z0-9_]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:758 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| src/workspace/workspaceIndex.ts:760 | `/(?:^\|\/)(?:test\|tests\|fixtures\|generated)(?:\/\|$)/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/chatSurface.test.ts:301 | `/unsafe-inline\|unsafe-eval/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/chatSurface.test.ts:305 | `/\.innerHTML/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/chatSurface.test.ts:306 | `/\son(?:click\|error\|load\|input\|change)\s*=/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/chatSurface.test.ts:325 | `/case 'ready':[\s\S]*?return;[\s\S]*?case 'refreshModels':\s*await controller\.refreshModels\(\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/comprehensive-audit.test.ts:357 | `new RegExp(&#96;\\b${construct}\\b&#96;, 'g')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| tests/comprehensive-audit.test.ts:358 | `new RegExp(&#96;\\b${construct}\\b&#96;, 'g')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| tests/dashboardLiveUpdate.test.ts:31 | `/DASHBOARD_READY/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:32 | `/id="stageWaterfall"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:33 | `/id="requestCostEvidence"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:34 | `/--vscode-editor-background/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:35 | `/@media \(max-width: 860px\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:36 | `/pairs\.length === 1/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:37 | `/aria-live="polite"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:38 | `/id="activeOptimizationProfile"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:39 | `/id="observedComponentStatus"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:40 | `/updateObservedComponentStatus/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:41 | `/<script nonce="[^"]+">([\s\S]*?)<\/script>/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/dashboardLiveUpdate.test.ts:52 | `/class="window-btn active" data-window="today" aria-pressed="true"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/finOps.test.ts:40 | `/overwritten/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/finOps.test.ts:41 | `/Invalid/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/finOps.test.ts:42 | `/rate/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/finOps.test.ts:71 | `/Missing Claude session\/message\/model identity/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/finOps.test.ts:141 | `/1 MiB/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:27 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:44 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:48 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:50 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:75 | `/[^A-Za-z0-9_./-]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:83 | `/\.sendRequest\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:190 | `/Release certified: \*\*No\*\*/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:191 | `/controlled synthetic benchmarks/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:192 | `/CERTIFIED FOR WORLDWIDE PRODUCTION/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:198 | `/releaseDecision\s*:\s*['"]CERTIFIED/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:199 | `/allGatesPassed\s*:\s*true/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:200 | `/totalTestSuites\s*:\s*\d+/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:206 | `/predetermined fixed or buggy patches/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:207 | `/do not invoke an upstream model/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:208 | `/model task-success uplift/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:215 | `/repositoryCommitSha\s*:\s*['"][0-9a-f]{7,40}['"]/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:219 | `/final master development plan/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase0MeasurementTruth.test.ts:220 | `/audits do not create another overhaul plan/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase10Experiments.test.ts:42 | `/private prompt/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase10Experiments.test.ts:43 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase11Reachability.test.ts:94 | `/Unknown component/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase11Reachability.test.ts:161 | `/cannot be invoked before it is attempted/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase11Reachability.test.ts:165 | `/cannot contribute before it is invoked/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase11Reachability.test.ts:178 | `/already has a terminal receipt/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase11Reachability.test.ts:186 | `/^[a-z0-9_.:-]*$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:78 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:85 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:99 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:156 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:194 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:195 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:224 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase12LspIntelligence.test.ts:382 | `/\\/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:70 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:83 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:93 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:103 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:113 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:122 | `/prohibited content/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:133 | `/automated memory proposals require explicit user confirmation/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:147 | `/workspace consent required/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase17ProjectMemory.test.ts:157 | `/untrusted workspace/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase2ProtocolCompiler.test.ts:152 | `/not available/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase5GlobalBudget.test.ts:149 | `/&#96;&#96;&#96;[^\n]*\n([\s\S]*?)\n&#96;&#96;&#96;/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6CacheEconomics.test.ts:121 | `/No originating request\|already reconciled/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6CacheEconomics.test.ts:125 | `/Provider usage does not match/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6CacheEconomics.test.ts:128 | `/No versioned pricing entry/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:138 | `/<meta http-equiv="Content-Security-Policy" content="([^"]+)">/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:142 | `/script-src 'nonce-[^']+'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:143 | `/style-src 'nonce-[^']+'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:144 | `/'unsafe-inline'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:146 | `/'unsafe-eval'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:151 | `/<style[^>]*>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:154 | `/nonce="[^"]+"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:157 | `/<script[^>]*>/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:160 | `/nonce="[^"]+"/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:165 | `/\son[a-z]+="/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:170 | `/<script nonce="[^"]+">([\s\S]*?)<\/script>/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:175 | `/ACTIVE_FILE_DIAGNOSIS/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:177 | `/WORKSPACE_SCAN_RESULT/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:179 | `/vscode\.getState\(\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase6WebviewBridge.test.ts:181 | `/vscode\.setState\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase9ReleaseCertification.test.ts:50 | `/VSIX entry path/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase9ReleaseCertification.test.ts:52 | `/Encrypted/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase9ReleaseCertification.test.ts:53 | `/size limit/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/phase9ReleaseCertification.test.ts:54 | `/compression ratio/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:12 | `/\bsrc\//i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:12 | `/PipelineOrchestrator/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:12 | `/tree-sitter/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:12 | `/PageRank/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:12 | `/\bBM25\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:13 | `/knapsack/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:13 | `/McNemar/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:13 | `/\bHMAC\b/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:13 | `/16-stage/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:14 | `/System Dependence Graph/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:14 | `/Reciprocal Rank/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:14 | `/T0\s*\/\s*T1\s*\/\s*T2/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:17 | `/^# Tokonomics 8\.0\.0/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/publicDocumentation.test.ts:18 | `/^## 8\.0\.0\b/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:106 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:143 | `/dormant/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:159 | `/Cross-Encoder/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:194 | `/^\d{4}-\d{2}-\d{2}/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:207 | `/No versioned pricing entry/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:228 | `/auditable source/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase0CapabilityTruth.test.ts:232 | `/Invalid pricing rate/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase1ContextEntry.test.ts:216 | `/signalSnapshot,/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase3RetrievalOrdering.test.ts:60 | `/negation/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase3RetrievalOrdering.test.ts:60 | `/modifier/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase3RetrievalOrdering.test.ts:173 | `/\.(ts\|tsx\|js\|jsx)$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase3RetrievalOrdering.test.ts:216 | `/focal file recalled in \d+\/\d+ cases/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:130 | `/^[0-9a-f]{8}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:147 | `/billed\|usage\|cost/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:249 | `/canonical gateway/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:251 | `/never bypass\|must not depend/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:255 | `/telemetry counter/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:257 | `/resolveCeiling/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase4EpochBudget.test.ts:280 | `/Cannot find name/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase5EvidenceClaims.test.ts:191 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/sotaPhase5EvidenceClaims.test.ts:192 | `/^[0-9a-f]{64}$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:46 | `/no longer listed/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:51 | `/Invalid/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:68 | `/role/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:69 | `/text context/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:120 | `/timed out/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:122 | `/cancelled/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:123 | `/8 MiB/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:124 | `/Cannot start/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:128 | `/hit your usage limit/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:129 | `/unknown option/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:142 | `/quota exhausted/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:225 | `/no longer at/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:230 | `/\.(cmd\|bat\|ps1\|js)$/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/subscriptions.test.ts:248 | `/provider reported/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v71AuditRemediation.test.ts:111 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v71AuditRemediation.test.ts:112 | `/\.[cm]?tsx?$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v71AuditRemediation.test.ts:270 | `/repeated 37 more times/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v71AuditRemediation.test.ts:493 | `/elided, 4000 characters/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase10GovernedLocalIntelligence.test.ts:26 | `/consent/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase10GovernedLocalIntelligence.test.ts:62 | `/approval/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase10GovernedLocalIntelligence.test.ts:63 | `/size mismatch\|hash mismatch/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase11ReleaseContract.test.ts:28 | `/^# Tokonomics 8\.0\.0/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase11ReleaseContract.test.ts:29 | `/^## 8\.0\.0\b/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase11ReleaseContract.test.ts:30 | `/PipelineOrchestrator\|BM25\|knapsack\|cross-encoder\|AES-256-GCM\|Ed25519\|threshold\|architecture layer/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase11ReleaseContract.test.ts:31 | `/local-model assistance is not enabled or advertised/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase1Preferences.test.ts:208 | `/getConfiguration\(['"]tokenOptimizer['"]\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:121 | `/\.sendRequest\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:131 | `/\.sendRequest\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:132 | `/[^A-Za-z0-9_./-]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:140 | `/selectChatModels\(\{ vendor: PROXY_VENDOR \}\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:142 | `/const PROXY_VENDOR = 'tokonomics'/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase2SecurityBoundary.test.ts:146 | `/^\s*import[^;]*(?:providerGateway\|canonicalEgress\|canonicalCompiler)/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Suggested pattern: /^[ \t]*import[^;]*(?:providerGateway\|canonicalEgress\|canonicalCompiler)/m |
| tests/v7Phase2SecurityBoundary.test.ts:148 | `/CanonicalProviderGateway\.(?:prepare\|send)\s*\(\|prepareCanonicalEgress\s*\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase3LifecycleResources.test.ts:40 | `/REQUEST_ID_NOT_UNIQUE/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase3LifecycleResources.test.ts:84 | `/displaced\|superseded/i` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase4AccountingDashboard.test.ts:36 | `/No versioned price/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase4AccountingDashboard.test.ts:56 | `/No versioned pricing/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase6StageContracts.test.ts:46 | `/from ['"](?:\.\.\/)?(?:ui\|proxy)\|from ['"]vscode['"]\|require\(['"]vscode['"]\)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase6StageContracts.test.ts:48 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase9UtilityBudget.test.ts:49 | `/resolveContextEpoch\(epochHistory/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase9UtilityBudget.test.ts:50 | `/applyContextEpoch\(chatContext\.history/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase9UtilityBudget.test.ts:51 | `/maxRetainedTurns:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase9UtilityBudget.test.ts:52 | `/sanitizeModelHistoryText\(/` | Safe within tested scope | None demonstrated by the bounded probes. |
| tests/v7Phase9UtilityBudget.test.ts:54 | `/requestOptions:/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/audit/oracleAuditEngine.ts:203 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/audit/oracleAuditEngine.ts:204 | `/\.[cm]?tsx?$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:53 | `new RegExp(&#96;[A-Za-z0-9+/=_-]{${BLOB_THRESHOLD_CHARS},}&#96;, 'g')` | Safe within reviewed construction | Escaped identifiers/paths or closed constant patterns; this assessment does not cover future untrusted pattern sources. |
| validation/corpus/src__compression__conservativePathCompressor.ts:67 | `/[ \t]+$/gm` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?<![ \t])[ \t]+$/gm |
| validation/corpus/src__compression__conservativePathCompressor.ts:107 | `/&#96;&#96;&#96;([a-zA-Z0-9_-]+)?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:108 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:119 | `/&#96;&#96;&#96;([a-zA-Z0-9_+#-]+)\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:122 | `/\\\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:123 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:123 | `/^[ \t]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:133 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__compression__conservativePathCompressor.ts:154 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__engine__prefixContinuity.ts:35 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__engine__prefixContinuity.ts:36 | `/[a-zA-Z_][a-zA-Z0-9_]*/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__engine__safePathPolicy.ts:106 | `/&#96;&#96;&#96;[\s\S]*?&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__engine__safePathPolicy.ts:106 | `/\s+/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:54 | `/^\s*at\s+[\w$.<>\s]+\(?[^\s)]+:\d+(?::\d+)?\)?\s*$/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*at[ \t]+[^\r\n]{1,1024}:\d{1,10}(?::\d{1,10})?\)?[ \t]*$/m |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:55 | `/Traceback \(most recent call last\):/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:56 | `/^panic:\s+.+$/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:57 | `/^\s*at\s+[\w.$]+\([\w.]+\.java:\d+\)\s*$/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*at[ \t]+[\w.$]+\([\w.]+\.java:\d+\)[ \t]*$/m |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:58 | `/\b(?:TS\|CS)\d{4,5}\b\s*[:.]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:59 | `/thread '[^']+' panicked at/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:60 | `/\b\w*(?:Error\|Exception)\b:[^\n]{0,200}\n[\s\S]{0,400}?(?:^\s*at\s\|File ")/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:62 | `/(?:^\|\s)(?:describe\|it\|test)\s*\(\s*['"&#96;]/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:63 | `/\b(?:expect\s*\(\|assert(?:Equal\|True\|That\|\.\w+)?\s*\(\|should\.\w+\|\.toBe\w*\s*\()/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:64 | `/^func\s+Test[A-Z]\w*\s*\(\s*\w+\s+\*testing\.T\s*\)/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:65 | `/#\[(?:test\|tokio::test)\]/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:66 | `/@(?:Test\|ParameterizedTest)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:67 | `/^\s*def\s+test_\w+\s*\(/m` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /^[ \t]*def[ \t]+test_\w+[ \t]*\(/m |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:69 | `/(?:^\|\n)\s*(?:export\s+)?(?:async\s+)?(?:function\s+\w+\s*\(\|(?:public\|private\|protected)\s+\w+\s*\(\|def\s+\w+\s*\(\|func\s+\w+\s*\(\|fn\s+\w+\s*[(<])/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:async[ \t]+)?(?:function[ \t]+\w+[ \t]*\(\|(?:public\|private\|protected)[ \t]+\w+[ \t]*\(\|def[ \t]+\w+[ \t]*\(\|func[ \t]+\w+[ \t]*\(\|fn[ \t]+\w+[ \t]*[(<])/ |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:70 | `/(?:^\|\n)\s*(?:export\s+)?(?:abstract\s+)?(?:class\|struct\|impl\|enum)\s+\w+/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:abstract[ \t]+)?(?:class\|struct\|impl\|enum)[ \t]+\w+/ |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:72 | `/(?:^\|\n)\s*(?:export\s+)?(?:interface\s+\w+\|type\s+\w+\s*=\|declare\s+(?:module\|namespace\|function)\|trait\s+\w+\|protocol\s+\w+)/` | Vulnerable (polynomial) | See BUG-REGEX-01; fixed token starts/horizontal whitespace/bounded fields. Replacement: /(?:^\|\n)[ \t]*(?:export[ \t]+)?(?:interface[ \t]+\w+\|type[ \t]+\w+[ \t]*=\|declare[ \t]+(?:module\|namespace\|function)\|trait[ \t]+\w+\|protocol[ \t]+\w+)/ |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:75 | `/\)\s*:\s*(?:Promise\s*<)?\s*[A-Za-z_$][\w$]*(?:\s*[<\[])?/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:77 | `/^diff --git \|^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@\|^(?:\+\+\+\|---) [ab]?\//m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:78 | `/^commit [0-9a-f]{7,40}$/m` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:81 | `/\b(?:package\.json\|tsconfig(?:\.\w+)?\.json\|pyproject\.toml\|Cargo\.toml\|go\.mod\|pom\.xml\|build\.gradle\|\.eslintrc\|webpack\.config\|vite\.config\|docker-compose\.ya?ml\|Dockerfile)\b/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:83 | `/\b(?:jest\.mock\s*\(\|sinon\.(?:stub\|spy\|mock)\s*\(\|unittest\.mock\|@patch\b\|Mockito\.\w+\|gomock\.\|mockery\.\|createMock\w*\s*\()/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:84 | `/\b(?:@pytest\.fixture\|beforeEach\s*\(\|setUp\s*\(\s*\)\|fixture\s*\(\|testdata\/\|__fixtures__)/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__governor__inlineEvidenceClassifier.ts:182 | `/&#96;&#96;&#96;([a-zA-Z0-9_+-]*)\r?\n([\s\S]*?)&#96;&#96;&#96;/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__history__modelHistory.ts:3 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__history__modelHistory.ts:8 | `/^>\s*(?:⚡\|💡\|🧠\|🔷\|🚫)?\s*(?:\*\*)?(?:Tokonomics\|This task could use\|Complex task detected\|Standard tier\|Model Policy\|Verified Exact Response Cache Hit)/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__history__modelHistory.ts:9 | `/^###\s+(?:⚡\s+)?Tokonomics\b/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__history__modelHistory.ts:10 | `/^\*\(No downstream .*model available/iu` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__history__modelHistory.ts:16 | `/\n{3,}/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__proxy__modelProvider.ts:381 | `/^[A-Za-z0-9_-]+$/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:123 | `/([a-z])([A-Z])/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:124 | `/[^a-zA-Z0-9_]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:126 | `/\s+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:231 | `/^[ 	]+/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:236 | `/\x08(?:if\|else\|switch\|case\|for\|while\|catch\|match)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:237 | `/\x08(?:function\|class\|interface\|struct\|enum\|def\|func\|fn\|impl\|type)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:238 | `/\x08(?:async\|await\|Promise\|Future\|go\s\|spawn\|thread)\x08/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:239 | `/\w\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:240 | `/["'&#96;]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/corpus/src__search__embeddingProvider.ts:241 | `/(?:\/\/\|#\|\/\*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:230 | `/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:231 | `/export\s+(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:232 | `/export\s+interface\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:233 | `/export\s+const\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:234 | `/export\s+type\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:235 | `/export\s+enum\s+([A-Za-z_$][\w$]*)/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:246 | `/\bpublic\s+(?:static\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:253 | `/\b(?:if\|else\|for\|while\|switch\|case\|catch\|finally\|return\|throw)\b/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:279 | `/[\/]/g` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:290 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:416 | `/incomplete="/` | Safe within tested scope | None demonstrated by the bounded probes. |
| validation/measurement/savingsMeasurement.ts:517 | `/\r?\n/` | Safe within tested scope | None demonstrated by the bounded probes. |
