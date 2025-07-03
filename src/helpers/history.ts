import * as vscode from 'vscode';
import { BrowserHistory } from '../types';

const MAX_HISTORY_ITEMS = 100;
const HISTORY_KEY = 'vsBrowser.history';

export class HistoryManager {
    private context: vscode.ExtensionContext;
    private history: BrowserHistory[] = [];
    private currentIndex: number = -1;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
        this.loadHistory();
    }

    private loadHistory(): void {
        const stored = this.context.globalState.get<BrowserHistory[]>(HISTORY_KEY);
        if (stored) {
            this.history = stored;
            this.currentIndex = this.history.length - 1;
        }
    }

    private saveHistory(): void {
        // Keep only the most recent items
        if (this.history.length > MAX_HISTORY_ITEMS) {
            this.history = this.history.slice(-MAX_HISTORY_ITEMS);
        }
        this.context.globalState.update(HISTORY_KEY, this.history);
    }

    addEntry(url: string, title: string = ''): void {
        // Don't add duplicate consecutive entries
        if (this.history.length > 0 && this.history[this.history.length - 1].url === url) {
            return;
        }

        // If we're not at the end of history, remove forward history
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }

        const entry: BrowserHistory = {
            url,
            title: title || url,
            timestamp: Date.now()
        };

        this.history.push(entry);
        this.currentIndex = this.history.length - 1;
        this.saveHistory();
    }

    canGoBack(): boolean {
        return this.currentIndex > 0;
    }

    canGoForward(): boolean {
        return this.currentIndex < this.history.length - 1;
    }

    goBack(): string | null {
        if (this.canGoBack()) {
            this.currentIndex--;
            return this.history[this.currentIndex].url;
        }
        return null;
    }

    goForward(): string | null {
        if (this.canGoForward()) {
            this.currentIndex++;
            return this.history[this.currentIndex].url;
        }
        return null;
    }

    getCurrentUrl(): string | null {
        if (this.currentIndex >= 0 && this.currentIndex < this.history.length) {
            return this.history[this.currentIndex].url;
        }
        return null;
    }

    getHistory(): BrowserHistory[] {
        return [...this.history];
    }

    clearHistory(): void {
        this.history = [];
        this.currentIndex = -1;
        this.context.globalState.update(HISTORY_KEY, []);
    }

    getNavigationState(): { canGoBack: boolean; canGoForward: boolean } {
        return {
            canGoBack: this.canGoBack(),
            canGoForward: this.canGoForward()
        };
    }
}