import { createRef, isValidElement, type ComponentProps, type KeyboardEvent, type SyntheticEvent } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BudgetDialog } from './BudgetDialog';
import { BudgetStore } from '../lib/budgetStore';
import type { BudgetItem } from '../lib/budgetApi';

// Node has no DOM. Exercise actual component handlers without claiming browser coverage.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: () => ({ current: null }),
  useEffect: () => {},
  useLayoutEffect: () => {},
}));

const configured: BudgetItem = { categoryId: 4, categoryName: 'Food', month: '2026-11', amountCents: 10000,
  spentCents: 7500, remainingCents: 2500, utilizationPercent: 75, status: 'under' };
const absent: BudgetItem = { ...configured, amountCents: null, remainingCents: null, utilizationPercent: null, status: 'no_budget' };
const modes = ['set', 'edit', 'remove'] as const;
async function setup(mode: typeof modes[number]) {
  const item = mode === 'set' ? absent : configured;
  const api = {
    fetchBudgets: vi.fn(async () => ({ month: item.month, items: [item] })),
    saveBudget: vi.fn(async () => configured),
    deleteBudget: vi.fn(async () => {}),
  };
  const store = new BudgetStore(api);
  await store.load(item.month, 0);
  store.open(item, mode === 'remove' ? 'remove' : 'save');
  function render() {
    const state = store.getState();
    if (!state.editor) return null;
    const element = BudgetDialog({ editor: state.editor, pending: state.pending, store, fallbackFocus: createRef() });
    if (!isValidElement<ComponentProps<'dialog'>>(element)) throw new Error('Expected dialog element');
    return element.props;
  }
  return { store, api, render };
}
function keyboardEvent(key = 'Escape', defaultPrevented = false) {
  return { key, defaultPrevented, preventDefault: vi.fn(), stopPropagation: vi.fn() };
}

describe('BudgetDialog dismissal handlers (not a live browser)', () => {
  it.each(modes)('Escape dismisses %s without mutation or immediate reopening', async mode => {
    const { store, api, render } = await setup(mode);
    const dialog = render(); const event = keyboardEvent();
    dialog?.onKeyDown?.(event as unknown as KeyboardEvent<HTMLDialogElement>);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(store.getState().editor).toBeNull();
    await Promise.resolve();
    expect(render()).toBeNull();
    expect(api.saveBudget).not.toHaveBeenCalled();
    expect(api.deleteBudget).not.toHaveBeenCalled();
    expect(api.fetchBudgets).toHaveBeenCalledTimes(1);
  });
  it.each(modes)('native cancel uses the same dismissal guard for %s', async mode => {
    const { store, api, render } = await setup(mode);
    const event = { preventDefault: vi.fn() };
    render()?.onCancel?.(event as unknown as SyntheticEvent<HTMLDialogElement>);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(store.getState().editor).toBeNull();
    expect(api.saveBudget).not.toHaveBeenCalled(); expect(api.deleteBudget).not.toHaveBeenCalled();
  });
  it.each(modes)('Escape and native cancel remain blocked during pending %s', async mode => {
    const { store, api, render } = await setup(mode);
    let rejectWrite!: (error: Error) => void;
    const write = new Promise<never>((_, reject) => { rejectWrite = reject; });
    if (mode === 'remove') api.deleteBudget.mockReturnValueOnce(write);
    else { api.saveBudget.mockReturnValueOnce(write); store.setAmount('100.00'); }
    const submitting = store.submit();
    const dialog = render(); const editor = store.getState().editor;
    const escape = keyboardEvent(); const cancel = { preventDefault: vi.fn() };
    dialog?.onKeyDown?.(escape as unknown as KeyboardEvent<HTMLDialogElement>);
    dialog?.onCancel?.(cancel as unknown as SyntheticEvent<HTMLDialogElement>);
    store.cancel();
    expect(escape.preventDefault).toHaveBeenCalledOnce();
    expect(cancel.preventDefault).toHaveBeenCalledOnce();
    expect(store.getState().editor).toBe(editor);
    expect(store.getState().pending).toBe(true);
    expect(mode === 'remove' ? api.deleteBudget : api.saveBudget).toHaveBeenCalledTimes(1);
    rejectWrite(new Error('Write rejected')); await submitting;
    render()?.onKeyDown?.(keyboardEvent() as unknown as KeyboardEvent<HTMLDialogElement>);
    expect(store.getState().editor).toBeNull();
  });
  it('leaves other keys and already-handled Escape events alone', async () => {
    const { store, render } = await setup('edit');
    for (const event of [keyboardEvent('Enter'), keyboardEvent('Escape', true)]) {
      render()?.onKeyDown?.(event as unknown as KeyboardEvent<HTMLDialogElement>);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
      expect(store.getState().editor).not.toBeNull();
    }
  });
  it('synchronizes an externally closed native dialog with editor state', async () => {
    const { store, api, render } = await setup('edit');
    const dialog = { open: false, isConnected: true, showModal: vi.fn() };
    render()?.onClose?.({ currentTarget: dialog } as unknown as SyntheticEvent<HTMLDialogElement>);
    expect(store.getState().editor).toBeNull();
    expect(dialog.showModal).not.toHaveBeenCalled();
    expect(api.saveBudget).not.toHaveBeenCalled(); expect(api.deleteBudget).not.toHaveBeenCalled();
  });
  it.each([{ open: true, isConnected: true }, { open: false, isConnected: false }])(
    'ignores cleanup close events for %j', async state => {
      const { store, render } = await setup('edit'); const editor = store.getState().editor;
      const dialog = { ...state, showModal: vi.fn() };
      render()?.onClose?.({ currentTarget: dialog } as unknown as SyntheticEvent<HTMLDialogElement>);
      expect(store.getState().editor).toBe(editor); expect(dialog.showModal).not.toHaveBeenCalled();
    });
  it('restores native modal state if externally closed during a pending write', async () => {
    const { store, api, render } = await setup('remove');
    let resolveWrite!: () => void;
    api.deleteBudget.mockReturnValueOnce(new Promise<void>(resolve => { resolveWrite = resolve; }));
    const submitting = store.submit(); const editor = store.getState().editor;
    const dialog = { open: false, isConnected: true, showModal: vi.fn() };
    render()?.onClose?.({ currentTarget: dialog } as unknown as SyntheticEvent<HTMLDialogElement>);
    expect(dialog.showModal).toHaveBeenCalledOnce(); expect(store.getState().editor).toBe(editor);
    resolveWrite(); await submitting;
  });
});
