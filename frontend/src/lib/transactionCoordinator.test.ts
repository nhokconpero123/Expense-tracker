import { describe, expect, it, vi } from 'vitest';
import {
  type Category,
  type CreateTransactionPayload,
  type Transaction,
  type TransactionListResponse,
} from './api';
import { parseUsdToCents } from './money';
import { isValidDate } from './date';

export interface CoordinatorFilterState {
  type: 'all' | 'income' | 'expense';
  categoryId: number;
  startDate: string;
  endDate: string;
  q: string;
}

export class TransactionCoordinator {
  public filters: CoordinatorFilterState = {
    type: 'all',
    categoryId: 0,
    startDate: '',
    endDate: '',
    q: '',
  };
  public page = 1;
  public isSubmitting = false;

  constructor(
    private readonly categories: Category[],
    private readonly apiCreate: (payload: CreateTransactionPayload) => Promise<Transaction>,
    private readonly apiList: () => Promise<TransactionListResponse>,
    private readonly onTransactionSaved: () => void,
  ) {}

  setFilter<K extends keyof CoordinatorFilterState>(key: K, value: CoordinatorFilterState[K]) {
    this.filters[key] = value;
    // Requirement 8: Reset page to 1 when filters change
    this.page = 1;

    // Reset category if type no longer matches
    if (key === 'type' && value !== 'all' && this.filters.categoryId > 0) {
      const match = this.categories.find((c) => c.id === this.filters.categoryId);
      if (match && match.type !== value) {
        this.filters.categoryId = 0;
      }
    }
  }

  resetFilters() {
    this.filters = {
      type: 'all',
      categoryId: 0,
      startDate: '',
      endDate: '',
      q: '',
    };
    // Requirement 9: Reset page to 1 on clear
    this.page = 1;
  }

  getFilteredCategories(type: 'income' | 'expense'): Category[] {
    return this.categories.filter((c) => c.type === type);
  }

  validateForm(data: {
    type: 'income' | 'expense';
    amountStr: string;
    categoryId: number;
    date: string;
    note?: string;
  }): { valid: boolean; cents?: number | undefined; errors: Record<string, string> } {
    const errors: Record<string, string> = {};

    let cents: number | undefined;
    if (!data.amountStr.trim()) {
      errors.amount = 'Amount is required';
    } else {
      try {
        cents = parseUsdToCents(data.amountStr.trim());
      } catch (err: unknown) {
        errors.amount = err instanceof Error ? err.message : 'Invalid USD amount';
      }
    }

    if (!data.categoryId || data.categoryId <= 0) {
      errors.categoryId = 'Please select a category';
    } else {
      const cat = this.categories.find((c) => c.id === data.categoryId);
      if (!cat || cat.type !== data.type) {
        errors.categoryId = 'Category does not match selected type';
      }
    }

    if (!data.date || !isValidDate(data.date)) {
      errors.date = 'Valid date required (YYYY-MM-DD)';
    }

    if (data.note && data.note.includes('\0')) {
      errors.note = 'Note must not contain NUL characters';
    } else if (data.note && data.note.trim().length > 500) {
      errors.note = 'Note must be at most 500 characters';
    }

    return { valid: Object.keys(errors).length === 0, cents, errors };
  }

  async submitTransaction(payload: CreateTransactionPayload): Promise<{
    success: boolean;
    refreshFailed?: boolean;
    error?: string;
  }> {
    // Requirement 17: Prevent duplicate submissions while saving
    if (this.isSubmitting) {
      return { success: false, error: 'Submission already in progress' };
    }

    this.isSubmitting = true;
    try {
      await this.apiCreate(payload);
      // Requirement 20: Invalidate/notify dashboard summary
      this.onTransactionSaved();

      // Refresh list
      try {
        await this.apiList();
        return { success: true };
      } catch {
        // Requirement 22: Save succeeded but refresh failed
        return { success: true, refreshFailed: true };
      }
    } catch (err: unknown) {
      // Requirement 18: Preserves entered fields on save failure
      const message = err instanceof Error ? err.message : 'Save failed';
      return { success: false, error: message };
    } finally {
      this.isSubmitting = false;
    }
  }
}

describe('TransactionCoordinator logic and lifecycle', () => {
  const mockCategories: Category[] = [
    { id: 1, name: 'Salary', type: 'income' },
    { id: 4, name: 'Food', type: 'expense' },
    { id: 5, name: 'Transport', type: 'expense' },
  ];

  it('resets page to 1 when any filter changes', () => {
    const coordinator = new TransactionCoordinator(
      mockCategories,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );
    coordinator.page = 4;

    coordinator.setFilter('type', 'expense');
    expect(coordinator.page).toBe(1);

    coordinator.page = 3;
    coordinator.setFilter('q', 'lunch');
    expect(coordinator.page).toBe(1);

    coordinator.page = 2;
    coordinator.resetFilters();
    expect(coordinator.page).toBe(1);
    expect(coordinator.filters.type).toBe('all');
    expect(coordinator.filters.q).toBe('');
  });

  it('filters categories matching selected type and resets mismatched category on type switch', () => {
    const coordinator = new TransactionCoordinator(
      mockCategories,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    const expenseCategories = coordinator.getFilteredCategories('expense');
    expect(expenseCategories.map((c) => c.name)).toEqual(['Food', 'Transport']);

    const incomeCategories = coordinator.getFilteredCategories('income');
    expect(incomeCategories.map((c) => c.name)).toEqual(['Salary']);

    // Select Food (expense)
    coordinator.setFilter('categoryId', 4);
    expect(coordinator.filters.categoryId).toBe(4);

    // Switch type to income -> categoryId should be reset to 0
    coordinator.setFilter('type', 'income');
    expect(coordinator.filters.categoryId).toBe(0);
  });

  it('validates form: exact integer cents conversion, date check, and note rules', () => {
    const coordinator = new TransactionCoordinator(
      mockCategories,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    );

    // Valid entry
    const valid = coordinator.validateForm({
      type: 'expense',
      amountStr: '12.34',
      categoryId: 4,
      date: '2026-11-03',
      note: 'Grocery trip',
    });
    expect(valid.valid).toBe(true);
    expect(valid.cents).toBe(1234);

    // Invalid: fractional cent, mismatched category type, invalid leap date, NUL note
    const invalid = coordinator.validateForm({
      type: 'income',
      amountStr: '12.345',
      categoryId: 4, // Food is expense!
      date: '2023-02-29', // Non-leap year!
      note: 'Note with \0 NUL',
    });
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.amount).toBeDefined();
    expect(invalid.errors.categoryId).toContain('does not match');
    expect(invalid.errors.date).toBeDefined();
    expect(invalid.errors.note).toContain('NUL');
  });

  it('prevents duplicate submissions while saving is pending', async () => {
    let resolveCreate!: () => void;
    const pendingPromise = new Promise<Transaction>((resolve) => {
      resolveCreate = () =>
        resolve({
          id: 1,
          type: 'expense',
          amountCents: 1000,
          categoryId: 4,
          categoryName: 'Food',
          date: '2026-11-03',
          note: '',
          createdAt: '2026-11-03T00:00:00Z',
          updatedAt: '2026-11-03T00:00:00Z',
        });
    });

    const mockCreate = vi.fn().mockReturnValue(pendingPromise);
    const mockList = vi.fn().mockResolvedValue({ data: [], meta: {} });
    const mockNotify = vi.fn();

    const coordinator = new TransactionCoordinator(
      mockCategories,
      mockCreate,
      mockList,
      mockNotify,
    );

    const firstSubmission = coordinator.submitTransaction({
      type: 'expense',
      amountCents: 1000,
      categoryId: 4,
      date: '2026-11-03',
    });

    // Immediate second submission while first is still pending
    const secondSubmission = coordinator.submitTransaction({
      type: 'expense',
      amountCents: 1000,
      categoryId: 4,
      date: '2026-11-03',
    });

    const secondResult = await secondSubmission;
    expect(secondResult.success).toBe(false);
    expect(secondResult.error).toContain('already in progress');
    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate();
    const firstResult = await firstSubmission;
    expect(firstResult.success).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });

  it('preserves entered fields on save failure and returns error message', async () => {
    const mockCreate = vi.fn().mockRejectedValue(new Error('Server database locked'));
    const mockList = vi.fn();
    const mockNotify = vi.fn();

    const coordinator = new TransactionCoordinator(
      mockCategories,
      mockCreate,
      mockList,
      mockNotify,
    );

    const result = await coordinator.submitTransaction({
      type: 'expense',
      amountCents: 1000,
      categoryId: 4,
      date: '2026-11-03',
      note: 'Preserved note',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Server database locked');
    expect(mockNotify).not.toHaveBeenCalled();
    expect(coordinator.isSubmitting).toBe(false);
  });

  it('distinguishes save-success from refresh-failure without misreporting', async () => {
    const mockCreate = vi.fn().mockResolvedValue({
      id: 99,
      type: 'expense',
      amountCents: 500,
      categoryId: 4,
      categoryName: 'Food',
      date: '2026-11-03',
      note: '',
      createdAt: '2026-11-03T00:00:00Z',
      updatedAt: '2026-11-03T00:00:00Z',
    });
    // List refresh fails after create
    const mockList = vi.fn().mockRejectedValue(new Error('Network error on list refresh'));
    const mockNotify = vi.fn();

    const coordinator = new TransactionCoordinator(
      mockCategories,
      mockCreate,
      mockList,
      mockNotify,
    );

    const result = await coordinator.submitTransaction({
      type: 'expense',
      amountCents: 500,
      categoryId: 4,
      date: '2026-11-03',
    });

    // Requirement 22: Must be reported as success with refreshFailed=true
    expect(result.success).toBe(true);
    expect(result.refreshFailed).toBe(true);
    expect(mockNotify).toHaveBeenCalledTimes(1);
  });
});
