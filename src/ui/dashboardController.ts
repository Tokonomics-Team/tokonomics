/**
 * Tokonomics Real-Time Dashboard Controller
 * Bridges the EventBus, MetricsAggregator, and HistoryStore to the VS Code Webview.
 */

import type * as vscode from 'vscode';
import { OptimizationEventBus, PromptOptimizationEvent } from '../events/optimizationEvent';
import { LiveMetricsAggregator, MetricTimeWindow } from '../metrics/liveAggregator';
import { LocalHistoryStore } from '../history/localHistoryStore';
import { RequestLedger, PrivacySafeDecisionTrace } from '../events/requestLedger';

export interface WebviewMessage {
    type: 'EVENT' | 'SUMMARY_UPDATE' | 'INIT_STATE' | 'TRACE_DETAIL' | 'ERROR';
    payload: PromptOptimizationEvent | ReturnType<LiveMetricsAggregator['getAggregateSummary']> |
        DashboardInitialPayload | PrivacySafeDecisionTrace | { message: string };
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

    constructor() {
        this.subscribeToEvents();
    }

    public static getInstance(): DashboardController {
        if (!DashboardController.instance) {
            DashboardController.instance = new DashboardController();
        }
        return DashboardController.instance;
    }

    public registerWebview(webview: vscode.Webview): () => void {
        this.activeWebviews.add(webview);

        // Send initial state immediately
        this.sendInitialState(webview);

        // Handle incoming messages from Webview
        const messageListener = (msg: any) => {
            this.handleWebviewMessage(msg, webview);
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
                type: 'EVENT',
                payload: event
            });

            this.broadcast({
                type: 'SUMMARY_UPDATE',
                payload: this.aggregator.getAggregateSummary(this.currentWindow)
            });
        });
    }

    private handleWebviewMessage(msg: any, webview: vscode.Webview): void {
        if (!msg || typeof msg !== 'object') return;

        switch (msg.action) {
            case 'CHANGE_TIME_WINDOW':
                if (msg.window) {
                    this.currentWindow = msg.window as MetricTimeWindow;
                    this.postToWebview(webview, {
                        type: 'SUMMARY_UPDATE',
                        payload: this.aggregator.getAggregateSummary(this.currentWindow)
                    });
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
                webview.postMessage(message);
            }
        } catch (err) {
            console.warn('[DashboardController] Error posting message to webview:', err);
        }
    }

    public dispose(): void {
        if (this.unsubscribe) {
            this.unsubscribe();
        }
        this.activeWebviews.clear();
    }
}
