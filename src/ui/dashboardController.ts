/**
 * Tokonomics Real-Time Dashboard Controller
 * Bridges the EventBus, MetricsAggregator, and HistoryStore to the VS Code Webview.
 */

import type * as vscode from 'vscode';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { LiveMetricsAggregator, MetricTimeWindow } from '../metrics/liveAggregator';
import { LocalHistoryStore } from '../history/localHistoryStore';
import { RequestLedger, PrivacySafeDecisionTrace } from '../events/requestLedger';
import { FinOpsService } from '../finops/finOpsService';

export interface WebviewMessage {
    type: 'LIFECYCLE_UPDATE' | 'SUMMARY_UPDATE' | 'INIT_STATE' | 'TRACE_DETAIL' | 'ERROR' | 'ACTIVE_FILE_DIAGNOSIS' | 'WORKSPACE_SCAN_RESULT' | 'SPEND_UPDATE';
    payload: PromptOptimizationEvent | ReturnType<LiveMetricsAggregator['getAggregateSummary']> |
        DashboardInitialPayload | PrivacySafeDecisionTrace | { message: string } | any;
}

export interface DashboardInitialPayload {
    summary: ReturnType<LiveMetricsAggregator['getAggregateSummary']>;
    recentEvents: PromptOptimizationEvent[];
    latestEvent?: PromptOptimizationEvent;
    historyRecords: ReturnType<LocalHistoryStore['getRecords']>;
}

export class DashboardController {
    private static instance: DashboardController;
    private activeWebviews: Set<vscode.Webview> = new Set();
    private eventBus = OptimizationEventBus.getInstance();
    private aggregator = LiveMetricsAggregator.getInstance();
    private historyStore = LocalHistoryStore.getInstance();
    private ledger = RequestLedger.getInstance();
    private currentWindow: MetricTimeWindow = 'session';
    private unsubscribe?: () => void;
    private unsubscribeSpend?: () => void;
    private spendTimer?: ReturnType<typeof setTimeout>;
    private source = 'all';

    constructor() {
        this.subscribeToEvents();
        this.unsubscribeSpend = FinOpsService.getInstance().subscribe(() => {
            if (this.spendTimer) return;
            this.spendTimer = setTimeout(() => { this.spendTimer = undefined; this.sendSpend(); }, 500);
        });
    }

    public static getInstance(): DashboardController {
        if (!DashboardController.instance) {
            DashboardController.instance = new DashboardController();
        }
        return DashboardController.instance;
    }

    public registerWebview(webview: vscode.Webview, commandHandler?: (message: any) => void | Promise<void>): () => void {
        this.activeWebviews.add(webview);

        // Send initial state immediately
        this.sendInitialState(webview);

        // Handle incoming messages from Webview
        const messageListener = async (msg: any) => {
            this.handleWebviewMessage(msg, webview);
            if (msg?.command && commandHandler) await commandHandler(msg);
        };

        // If webview has onDidReceiveMessage
        let sub: any;
        if (typeof (webview as any).onDidReceiveMessage === 'function') {
            sub = (webview as any).onDidReceiveMessage(messageListener);
        }

        return () => {
            this.activeWebviews.delete(webview);
            if (sub && typeof sub.dispose === 'function') {
                sub.dispose();
            }
        };
    }

    private subscribeToEvents(): void {
        this.unsubscribe = this.eventBus.subscribe((event: PromptOptimizationEvent) => {
            this.broadcast({
                type: 'LIFECYCLE_UPDATE',
                payload: { event, summary: this.aggregator.getAggregateSummary(this.currentWindow) }
            });
        });
    }

    private handleWebviewMessage(msg: any, webview: vscode.Webview): void {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.action) {
            case 'DASHBOARD_READY':
                // Webview messages sent before its script is ready may be dropped by
                // the host, so repeat the authoritative state after the client handshake.
                this.sendInitialState(webview);
                this.sendSpend(webview);
                break;

            case 'CHANGE_SPEND_SOURCE':
                if (['all', 'tokonomics', 'claude-jsonl'].includes(msg.source)) { this.source = msg.source; this.sendSpend(webview); }
                break;

            case 'CHANGE_TIME_WINDOW':
                if (isMetricTimeWindow(msg.window)) {
                    this.currentWindow = msg.window as MetricTimeWindow;
                    this.postToWebview(webview, {
                        type: 'SUMMARY_UPDATE',
                        payload: this.aggregator.getAggregateSummary(this.currentWindow)
                    });
                    this.sendSpend(webview);
                }
                break;

            case 'REQUEST_HISTORY':
                this.postToWebview(webview, {
                    type: 'INIT_STATE',
                    payload: this.getInitialPayload()
                });
                break;

            case 'REQUEST_TRACE': {
                const trace = typeof msg.requestId === 'string' ? this.ledger.getDecisionTrace(msg.requestId) : undefined;
                this.postToWebview(webview, trace
                    ? { type: 'TRACE_DETAIL', payload: trace }
                    : { type: 'ERROR', payload: { message: 'Trace unavailable for this request.' } });
                break;
            }
        }
    }

    public getInitialPayload(): DashboardInitialPayload {
        const recentEvents = this.aggregator.getRecentEvents(50);
        return {
            summary: this.aggregator.getAggregateSummary(this.currentWindow),
            recentEvents,
            latestEvent: recentEvents[recentEvents.length - 1],
            historyRecords: this.historyStore.getRecords(50)
        };
    }

    public getCurrentWindow(): MetricTimeWindow {
        return this.currentWindow;
    }

    private sendSpend(webview?: vscode.Webview): void {
        const message: WebviewMessage = { type: 'SPEND_UPDATE', payload: FinOpsService.getInstance().snapshot(this.currentWindow, this.source) };
        if (webview) this.postToWebview(webview, message); else this.broadcast(message);
    }

    private sendInitialState(webview: vscode.Webview): void {
        this.postToWebview(webview, {
            type: 'INIT_STATE',
            payload: this.getInitialPayload()
        });
    }

    private broadcast(message: WebviewMessage): void {
        for (const webview of this.activeWebviews) {
            this.postToWebview(webview, message);
        }
    }

    private postToWebview(webview: vscode.Webview, message: WebviewMessage): void {
        try {
            if (webview && typeof webview.postMessage === 'function') {
                void Promise.resolve(webview.postMessage(message)).catch(() => {
                    console.warn('[DashboardController] A webview update failed safely.');
                });
            }
        } catch {
            console.warn('[DashboardController] A webview update failed safely.');
        }
    }

    public dispose(): void {
        this.unsubscribeSpend?.();
        if (this.spendTimer) clearTimeout(this.spendTimer);
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.activeWebviews.clear();
    }
}

function isMetricTimeWindow(value: unknown): value is MetricTimeWindow {
    return value === 'session' || value === 'today' || value === '7_days' || value === 'lifetime';
}
