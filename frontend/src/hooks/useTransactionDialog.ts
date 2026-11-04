import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

/** Native modality with pending-safe dismissal and focus restoration after refresh. */
export function useTransactionDialog(isOpen: boolean, pending: boolean, onClose: () => void,
  initialFocus: RefObject<HTMLElement | null>, fallbackFocus?: RefObject<HTMLElement | null>) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const latest = useRef({ pending, onClose });
  latest.current = { pending, onClose };
  const dismiss = () => { if (!latest.current.pending) latest.current.onClose(); };

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    if (!dialog) return;
    // Cancel must be prevented synchronously, including when disabled fields lose focus.
    const cancel = (event: Event) => {
      event.preventDefault();
      if (!latest.current.pending) latest.current.onClose();
    };
    dialog.addEventListener('cancel', cancel);
    if (!dialog.open) dialog.showModal();
    initialFocus.current?.focus();
    return () => {
      dialog.removeEventListener('cancel', cancel);
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
      else fallbackFocus?.current?.focus();
    };
  }, [isOpen, initialFocus, fallbackFocus]);

  useLayoutEffect(() => {
    // Disabling the focused form control must not leave keyboard focus outside the modal.
    if (isOpen && pending) dialogRef.current?.focus();
  }, [isOpen, pending]);

  return {
    ref: dialogRef,
    onKeyDown(event: React.KeyboardEvent<HTMLDialogElement>) {
      if (event.key === 'Tab' && !event.defaultPrevented) {
        const dialog = event.currentTarget;
        const controls = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]')]
          .filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length > 0);
        const first = controls[0], last = controls.at(-1);
        // Keep boundary Tabs inside the page instead of moving into browser chrome.
        if (!first || !last) { event.preventDefault(); dialog.focus(); }
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault(); first.focus();
        }
        return;
      }
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault(); event.stopPropagation(); dismiss();
    },
    onClose(event: React.SyntheticEvent<HTMLDialogElement>) {
      const dialog = event.currentTarget;
      // Native close events can arrive after StrictMode cleanup/reopening.
      if (dialog.open || !dialog.isConnected) return;
      if (latest.current.pending) dialog.showModal(); else dismiss();
    },
    onClick(event: React.MouseEvent<HTMLDialogElement>) {
      if (event.target === event.currentTarget) dismiss();
    },
  };
}
