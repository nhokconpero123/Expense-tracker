import { ApiClientError, fetchMonthlySummary, type MonthlySummary } from './api';

export interface SummaryState {
  summary: MonthlySummary | null;
  isLoading: boolean;
  error: string | null;
}

export type SummaryFetcher = (month: string, signal?: AbortSignal) => Promise<MonthlySummary>;

/**
 * SummaryLoader coordinates data fetching for monthly summaries.
 * Guarantees:
 * 1. Stale-response protection: responses for outdated months are discarded.
 * 2. In-flight request abortion: changing months aborts previous requests.
 * 3. Immediate stale data clearing: switching months or failing a refresh never displays stale data as current.
 */
export class SummaryLoader {
  private activeMonth: string | null = null;
  private abortController: AbortController | null = null;
  private state: SummaryState = {
    summary: null,
    isLoading: false,
    error: null,
  };
  private readonly listeners = new Set<(state: SummaryState) => void>();

  constructor(private readonly fetcher: SummaryFetcher = fetchMonthlySummary) {}

  getState(): SummaryState {
    return this.state;
  }

  subscribe(listener: (state: SummaryState) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setState(partial: Partial<SummaryState>): void {
    this.state = { ...this.state, ...partial };
    for (const listener of this.listeners) {
      listener(this.state);
    }
  }

  async load(month: string): Promise<void> {
    this.activeMonth = month;
    if (this.abortController) {
      this.abortController.abort();
    }
    const controller = new AbortController();
    this.abortController = controller;

    // Immediately clear stale summary and previous error, set loading
    this.setState({ isLoading: true, error: null, summary: null });

    try {
      const data = await this.fetcher(month, controller.signal);
      // Guard against stale response if month has changed since dispatch
      if (this.activeMonth !== month) {
        return;
      }
      this.setState({ summary: data, isLoading: false, error: null });
    } catch (err: unknown) {
      if (this.activeMonth !== month) {
        return;
      }
      if (err instanceof DOMException && err.name === 'AbortError') {
        return;
      }
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to load monthly summary';
      // Failed refresh does not keep old data as current
      this.setState({ summary: null, isLoading: false, error: message });
    }
  }

  destroy(): void {
    if (this.abortController) {
      this.abortController.abort();
    }
    this.listeners.clear();
  }
}

