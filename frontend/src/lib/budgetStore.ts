import { ApiClientError } from './api';
import { deleteBudget, fetchBudgets, saveBudget, type BudgetItem, type BudgetMonth } from './budgetApi';
import { parseUsdToCents } from './money';

export interface BudgetEditor {
  item: BudgetItem;
  mode: 'save' | 'remove';
  amount: string;
  error: string | null;
  amountError: string | null;
}
export interface BudgetState {
  month: string;
  revision: number;
  data: BudgetMonth | null;
  loading: boolean;
  error: string | null;
  notice: string | null;
  editor: BudgetEditor | null;
  pending: boolean;
}

const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Budget request failed. Please try again.';

/** Owns real UI state, including request ordering and the write/refresh boundary. */
export class BudgetStore {
  private state: BudgetState = { month: '', revision: -1, data: null, loading: true, error: null,
    notice: null, editor: null, pending: false };
  private listeners = new Set<() => void>();
  private requestId = 0;
  private controller: AbortController | null = null;
  private session = 0;

  constructor(private readonly api = { fetchBudgets, saveBudget, deleteBudget }) {}
  getState = () => this.state;
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private update(patch: Partial<BudgetState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(listener => listener());
  }
  destroy() {
    this.controller?.abort();
    this.requestId++;
    this.session++;
  }

  async load(month: string, revision: number): Promise<boolean> {
    const changedMonth = this.state.month !== month;
    if (changedMonth) this.session++;
    const requestId = ++this.requestId;
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    this.update({ month, revision, data: null, loading: true, error: null,
      ...(changedMonth ? { editor: null, notice: null, pending: false } : {}) });
    try {
      const data = await this.api.fetchBudgets(month, controller.signal);
      if (requestId !== this.requestId) return false;
      this.update({ data, loading: false });
      return true;
    } catch (error) {
      if (requestId !== this.requestId) return false;
      this.update({ error: errorMessage(error), loading: false });
      return false;
    }
  }

  open(item: BudgetItem, mode: BudgetEditor['mode']) {
    if (this.state.pending || this.state.loading || item.month !== this.state.month) return;
    const cents = item.amountCents;
    this.update({ notice: null, editor: { item, mode,
      amount: cents === null ? '' : `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`,
      error: null, amountError: null } });
  }
  cancel() { if (!this.state.pending) this.update({ editor: null }); }
  setAmount(amount: string) {
    if (this.state.editor && !this.state.pending) this.update({ editor: { ...this.state.editor, amount, amountError: null, error: null } });
  }

  async submit(): Promise<void> {
    const editor = this.state.editor;
    if (!editor || this.state.pending) return;
    let amountCents = 0;
    if (editor.mode === 'save') {
      try { amountCents = parseUsdToCents(editor.amount); }
      catch (error) { this.update({ editor: { ...editor, amountError: errorMessage(error) } }); return; }
    }
    const session = this.session;
    this.update({ pending: true, editor: { ...editor, error: null, amountError: null } });
    try {
      if (editor.mode === 'remove') await this.api.deleteBudget(editor.item.categoryId, editor.item.month);
      else await this.api.saveBudget(editor.item.categoryId, editor.item.month, amountCents);
    } catch (error) {
      if (session !== this.session) return;
      this.update({ pending: false, editor: { ...editor, error: errorMessage(error),
        amountError: error instanceof ApiClientError ? error.fields?.['amountCents'] ?? null : null } });
      return;
    }
    if (session !== this.session) return;
    const message = editor.mode === 'remove' ? 'Budget removed. Transactions are preserved.' : 'Budget saved.';
    this.update({ editor: null, notice: message });
    await this.load(this.state.month, this.state.revision);
    if (session !== this.session) return;
    // GET errors have their own retryable state; keep mutation feedback independent.
    this.update({ pending: false });
  }
}
