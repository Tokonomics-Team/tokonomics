/**
 * Explainable Decision & Optimization Tracing Engine
 * Logs structured reasoning for every transformation to power @tokonomics /explain.
 */

export interface Decision {
    itemId: string;
    action: 'include' | 'exclude' | 'downgrade' | 'compress' | 'preserve' | 'slice' | 'govern';
    reason: string;
    confidence: number;
    evidence: string[];
}

export interface OptimizationTrace {
    stage: string;
    inputItems: string[];
    outputItems: string[];
    decisions: Decision[];
    tokensBefore: number;
    tokensAfter: number;
    latencyMs: number;
}

export class TraceLogger {
    private static instance: TraceLogger;
    private traces: OptimizationTrace[] = [];
    private maxTraces: number = 50;

    /**
     * Singleton accessor to ensure traces recorded during compilation
     * are universally available to slash commands and UI explainers.
     */
    public static getInstance(): TraceLogger {
        if (!TraceLogger.instance) {
            TraceLogger.instance = new TraceLogger();
        }
        return TraceLogger.instance;
    }

    public recordTrace(trace: OptimizationTrace): void {
        this.traces.push(trace);
        if (this.traces.length > this.maxTraces) {
            this.traces.shift();
        }
    }

    public getTraces(): OptimizationTrace[] {
        return [...this.traces];
    }

    public getLatestTrace(): OptimizationTrace | undefined {
        return this.traces[this.traces.length - 1];
    }

    public clear(): void {
        this.traces = [];
    }

    /**
     * Formats latest optimization trace into a markdown explanation card for VS Code Chat / UI
     */
    public formatExplainCard(): string {
        const latest = this.getLatestTrace();
        if (!latest) {
            return `### 🔍 Tokonomics Explainability Report\nNo recent optimization traces recorded. Run a query with \`@tokonomics\` to generate decisions.`;
        }

        let md = `### 🔍 Tokonomics Context Optimization Explanation\n\n`;
        md += `| Metric | Before | After | Delta |\n`;
        md += `|:---|:---:|:---:|:---:|\n`;
        md += `| **Token Footprint** | ${latest.tokensBefore.toLocaleString()} | ${latest.tokensAfter.toLocaleString()} | **-${Math.round((1 - latest.tokensAfter / (latest.tokensBefore || 1)) * 100)}%** |\n`;
        md += `| **Compile Latency** | — | — | **${latest.latencyMs}ms** |\n\n`;

        md += `#### 📋 Architectural Decisions Made:\n`;
        if (latest.decisions.length === 0) {
            md += `*No individual item mutations performed in this stage.*\n`;
        } else {
            for (const d of latest.decisions) {
                const icon = d.action === 'preserve' ? '🛡️' : d.action === 'compress' ? '⚡' : d.action === 'downgrade' ? '📉' : d.action === 'include' ? '✅' : '❌';
                md += `- ${icon} **\`${d.itemId}\`** [${d.action.toUpperCase()}] *(Confidence: ${Math.round(d.confidence * 100)}%)*\n`;
                md += `  *Reason*: ${d.reason}\n`;
                if (d.evidence && d.evidence.length > 0) {
                    md += `  *Evidence*: ${d.evidence.join(', ')}\n`;
                }
            }
        }

        return md;
    }
}
