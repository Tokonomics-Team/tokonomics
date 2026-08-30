/**
 * Smart Review Prompter v1.0
 * Prompts users for a VS Code Marketplace review only after moments of high value,
 * not immediately on installation. Triggers after:
 *   - 50 successful optimization actions, OR
 *   - 14 days of active usage
 * 
 * Shows at most once. User can dismiss permanently or snooze for 7 days.
 * Never interrupts active coding — only triggers after a successful optimization.
 */

import * as vscode from 'vscode';

const REVIEW_STATE_KEY = 'tokonomics_review_prompt_state';
const MARKETPLACE_URL = 'https://marketplace.visualstudio.com/items?itemName=tokonomics.tokonomics&ssr=false#review-details';

interface ReviewPromptState {
    /** Whether the user has already been prompted and either reviewed or permanently dismissed */
    dismissed: boolean;
    /** Timestamp of last snooze (user said "remind me later") */
    snoozedUntil: number | null;
    /** Total successful optimizations since install */
    totalActions: number;
    /** Installation timestamp */
    installedAt: number;
    /** Whether the user has already left a review */
    reviewed: boolean;
}

const DEFAULT_STATE: ReviewPromptState = {
    dismissed: false,
    snoozedUntil: null,
    totalActions: 0,
    installedAt: Date.now(),
    reviewed: false
};

// Thresholds for triggering the review prompt
const ACTION_THRESHOLD = 50;
const DAYS_THRESHOLD = 14;
const SNOOZE_DAYS = 7;

export class ReviewPrompter {
    private state: ReviewPromptState;

    constructor(private memento: vscode.Memento) {
        const saved = this.memento.get<ReviewPromptState>(REVIEW_STATE_KEY);
        if (saved) {
            this.state = saved;
        } else {
            this.state = { ...DEFAULT_STATE };
            this.persist();
        }
    }

    /**
     * Called after every successful optimization. Increments the action counter
     * and checks if it's time to show the review prompt.
     */
    public recordAction(): void {
        if (this.state.dismissed || this.state.reviewed) return;

        this.state.totalActions++;
        this.persist();

        // Check if conditions are met
        if (this.shouldPrompt()) {
            this.showPrompt();
        }
    }

    private shouldPrompt(): boolean {
        // Already reviewed or permanently dismissed
        if (this.state.dismissed || this.state.reviewed) return false;

        // Currently snoozed
        if (this.state.snoozedUntil && Date.now() < this.state.snoozedUntil) return false;

        const daysSinceInstall = (Date.now() - this.state.installedAt) / (1000 * 60 * 60 * 24);

        // Trigger after 50 actions OR 14 days of usage
        return this.state.totalActions >= ACTION_THRESHOLD || daysSinceInstall >= DAYS_THRESHOLD;
    }

    private async showPrompt(): Promise<void> {
        const tokensSaved = this.state.totalActions * 2000; // rough estimate
        const costSaved = (tokensSaved / 1_000_000) * 3.00; // at Anthropic rates

        const message = this.state.totalActions >= ACTION_THRESHOLD
            ? `🎉 Tokonomics has optimized ${this.state.totalActions} prompts for you, saving ~${tokensSaved.toLocaleString()} tokens (~$${costSaved.toFixed(2)})! If it's been helpful, a quick review helps other developers find us.`
            : `🎉 You've been using Tokonomics for over 2 weeks! If it's been saving you tokens and money, a quick review helps other developers discover it.`;

        const selection = await vscode.window.showInformationMessage(
            message,
            '⭐ Leave a Review',
            '⏰ Remind Me Later',
            '🚫 Don\'t Ask Again'
        );

        switch (selection) {
            case '⭐ Leave a Review':
                this.state.reviewed = true;
                vscode.env.openExternal(vscode.Uri.parse(MARKETPLACE_URL));
                break;
            case '⏰ Remind Me Later':
                this.state.snoozedUntil = Date.now() + (SNOOZE_DAYS * 24 * 60 * 60 * 1000);
                break;
            case '🚫 Don\'t Ask Again':
                this.state.dismissed = true;
                break;
            default:
                // User clicked X — treat as snooze
                this.state.snoozedUntil = Date.now() + (SNOOZE_DAYS * 24 * 60 * 60 * 1000);
                break;
        }

        this.persist();
    }

    private persist(): void {
        this.memento.update(REVIEW_STATE_KEY, this.state);
    }
}
