/**
 * Tokonomics Semantic Project Memory Engine
 * Structured knowledge graph persisting architectural decisions, constraints, assumptions,
 * and bugs across multi-turn sessions with explicit supersedes relations.
 */

import { TokenCounter } from '../engine/tokenizer';

export type MemoryItemType = 
    | 'decision' 
    | 'constraint' 
    | 'requirement' 
    | 'assumption' 
    | 'bug' 
    | 'open_question' 
    | 'completed_task' 
    | 'rejected_option' 
    | 'architecture';

export interface ProjectMemoryItem {
    id: string;
    type: MemoryItemType;
    title: string;
    description: string;
    status: 'active' | 'superseded' | 'resolved';
    confidence: number; // 0.0 to 1.0
    sourceTurnId?: string;
    supersededBy?: string;
    dependsOn?: string[];
    createdAt: number;
}

export class ProjectMemory {
    private items: Map<string, ProjectMemoryItem> = new Map();

    public addItem(item: Omit<ProjectMemoryItem, 'createdAt'>): void {
        this.items.set(item.id, {
            ...item,
            createdAt: Date.now()
        });
    }

    public supersedeItem(oldItemId: string, newItemId: string): void {
        const oldItem = this.items.get(oldItemId);
        if (oldItem) {
            oldItem.status = 'superseded';
            oldItem.supersededBy = newItemId;
        }
    }

    public getActiveItems(): ProjectMemoryItem[] {
        return Array.from(this.items.values()).filter(i => i.status === 'active');
    }

    public getItemsByType(type: MemoryItemType, activeOnly: boolean = true): ProjectMemoryItem[] {
        return Array.from(this.items.values()).filter(i => 
            i.type === type && (!activeOnly || i.status === 'active')
        );
    }

    /**
     * Formats active project memory into a compact Markdown context block
     */
    public formatCompactSummary(maxTokenBudget: number = 300): string {
        const active = this.getActiveItems();
        if (active.length === 0) return '';

        let md = `### 🧠 Project Architectural Memory\n`;

        // Group by type
        const decisions = active.filter(i => i.type === 'decision' || i.type === 'architecture');
        const constraints = active.filter(i => i.type === 'constraint' || i.type === 'requirement');
        const bugs = active.filter(i => i.type === 'bug');

        if (decisions.length > 0) {
            md += `**Decisions & Architecture:**\n`;
            for (const d of decisions) {
                md += `- [${d.id}] ${d.title}: ${d.description}\n`;
            }
        }

        if (constraints.length > 0) {
            md += `**Constraints:**\n`;
            for (const c of constraints) {
                md += `- ⚠️ ${c.title}: ${c.description}\n`;
            }
        }

        if (bugs.length > 0) {
            md += `**Active Known Issues:**\n`;
            for (const b of bugs) {
                md += `- 🐞 ${b.title}: ${b.description}\n`;
            }
        }

        // Budget enforcement
        const tokens = TokenCounter.countTokens(md);
        if (tokens > maxTokenBudget) {
            return md.split('\n').slice(0, 10).join('\n') + '\n*...[project memory truncated]*';
        }

        return md;
    }

    public clear(): void {
        this.items.clear();
    }
}
