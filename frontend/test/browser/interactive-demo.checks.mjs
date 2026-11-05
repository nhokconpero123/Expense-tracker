import assert from 'node:assert/strict';

/** Real application, real localStorage, real keyboard dialogs; no API fixtures. */
export async function runInteractiveDemoChecks({ command, evaluate, waitFor, key, check, send, address, compiled }) {
  const storageKey = 'expense-tracker:interactive-demo:v1';
  const state = () => evaluate(`JSON.parse(localStorage.getItem('${storageKey}'))`);
  const button = (text, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(b => b.textContent.trim() === ${JSON.stringify(text)})`;
  const click = async (text, scope) => { await evaluate(`${button(text, scope)}.focus()`); await key('Enter', 'Enter', 13); };
  const navigate = async page => { await evaluate(`location.hash=${JSON.stringify('#' + page)}`); await waitFor(`document.querySelector('main h1')?.textContent.includes(${JSON.stringify(page[0].toUpperCase() + page.slice(1))})`); };
  const ready = () => waitFor("document.querySelector('main')?.textContent.includes('$2,155.00')");
  const closed = () => waitFor("!document.querySelector('dialog[open]')");
  const field = async (selector, value) => {
    await waitFor(`(() => {const e=document.querySelector(${JSON.stringify(selector)});return e && !e.disabled && (!(e instanceof HTMLSelectElement) || [...e.options].some(o=>o.value===${JSON.stringify(value)}));})()`);
    await evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});const p=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(p,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));}`);
  };
  const submit = async () => {
    await waitFor("!document.querySelector('dialog button[type=submit]').disabled");
    await evaluate("document.querySelector('dialog form').requestSubmit()");
  };
  const openTransaction = async title => {
    await evaluate(`document.querySelector('tr:has(td) [title="${title} transaction"]').focus()`);
    await key('Enter', 'Enter', 13); await waitFor("document.querySelector('dialog:modal')!==null");
  };
  const budgetAction = async label => {
    await waitFor(`document.querySelector('[aria-label="${label}"]') && !document.querySelector('[aria-label="${label}"]').disabled`);
    await evaluate(`document.querySelector('[aria-label="${label}"]').focus()`); await key('Enter', 'Enter', 13); await waitFor("document.querySelector('dialog:modal')!==null");
  };

  await check('fresh public mode works with Render blocked and exact fictional seed totals', async () => {
    await ready(); const initial = await state();
    assert.equal(initial.transactions.length, 13); assert.equal(initial.budgets.length, 6);
    assert.equal(await evaluate("document.body.textContent.includes('Interactive portfolio demo.')"), true);
    assert.equal(await evaluate("document.querySelector('main').textContent.includes('$3,950.00') && document.querySelector('main').textContent.includes('$1,795.00')"), true);
  });
  await check('keyboard add transaction persists and changes Dashboard and Analytics', async () => {
    await navigate('transactions'); await click('Add Transaction');
    await waitFor("document.querySelector('dialog:modal')!==null");
    assert.equal(await evaluate('document.activeElement.id'), 'tx-amount');
    await field('#tx-amount', '25.50'); await field('#tx-category', '4'); await field('#tx-date', '2026-11-30'); await field('#tx-note', 'Fictional interactive browser check');
    await waitFor("!document.querySelector('dialog button[type=submit]').disabled");
    await submit(); await closed(); await waitFor("document.querySelector('tbody')?.textContent.includes('Fictional interactive browser check')");
    assert.equal((await state()).transactions.length, 14);
    await navigate('dashboard'); await waitFor("document.querySelector('main').textContent.includes('$2,180.50')");
    await navigate('analytics'); await waitFor("document.querySelector('main').textContent.includes('$2,180.50')");
    await command('Page.reload'); await waitFor("document.querySelector('main')?.textContent.includes('$2,180.50')");
    assert.equal((await state()).transactions.length, 14);
  });
  await check('edit and confirmed delete recompute totals; delete cancellation preserves data', async () => {
    await navigate('transactions'); await waitFor("document.querySelector('tbody')?.textContent.includes('Fictional interactive browser check')");
    await openTransaction('Edit'); await field('#tx-amount', '30.00'); await submit(); await closed();
    assert.equal((await state()).transactions.find(t => t.note === 'Fictional interactive browser check').amountCents, 3000);
    await openTransaction('Delete'); await key('Escape', 'Escape', 27); await closed();
    assert.equal((await state()).transactions.length, 14);
    await openTransaction('Delete'); await click('Delete Transaction', "document.querySelector('dialog')"); await closed();
    assert.equal((await state()).transactions.length, 13);
    await navigate('dashboard'); await ready();
  });
  await check('set, edit and remove budget through keyboard dialogs persists after reload', async () => {
    await navigate('budgets'); await waitFor("document.querySelector('[aria-label=\"Set budget for Health\"]')!==null");
    await budgetAction('Set budget for Health'); await field('#budget-amount', '100.00'); await submit(); await closed();
    await waitFor("document.querySelector('[aria-label=\"Edit budget for Health\"]')!==null");
    assert.equal((await state()).budgets.find(b => b.categoryId === 9).amountCents, 10000);
    await budgetAction('Edit budget for Health'); await field('#budget-amount', '200.00'); await submit(); await closed();
    await command('Page.reload'); await waitFor("document.querySelector('[aria-label=\"Edit budget for Health\"]')!==null");
    assert.equal((await state()).budgets.find(b => b.categoryId === 9).amountCents, 20000);
    await budgetAction('Remove budget for Health'); await click('Remove budget', "document.querySelector('dialog')"); await closed();
    assert.equal((await state()).budgets.some(b => b.categoryId === 9), false);
  });
  await check('reset cancellation, focus containment and confirmation restore complete seed and month', async () => {
    await navigate('transactions'); await click('Add Transaction'); await waitFor("document.querySelector('dialog:modal')!==null");
    await field('#tx-amount', '5.00'); await field('#tx-category', '4'); await field('#tx-date', '2026-11-30'); await submit(); await closed();
    await navigate('dashboard'); await waitFor("document.querySelector('[aria-label=\"Next month\"]')!==null");
    await evaluate("document.querySelector('[aria-label=\"Next month\"]').click()");
    await click('Reset Demo'); await waitFor("document.querySelector('dialog:modal')!==null");
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Cancel');
    const before = JSON.stringify(await state());
    for (const modifiers of [0, 8]) for (let index = 0; index < 4; index++) {
      await key('Tab', 'Tab', 9, modifiers); assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
    }
    await key('Escape', 'Escape', 27); await closed();
    assert.equal(JSON.stringify(await state()), before);
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), 'Reset Demo');
    await click('Reset Demo'); await waitFor("document.querySelector('dialog:modal')!==null");
    await click('Confirm reset', "document.querySelector('dialog')"); await closed();
    await waitFor("document.body.textContent.includes('Original November 2026 transactions and budgets restored.')");
    assert.equal((await state()).transactions.length, 13); assert.equal((await state()).budgets.length, 6);
    await navigate('dashboard'); await ready();
    assert.equal(await evaluate("document.body.textContent.includes('November 2026')"), true);
    await command('Page.reload'); await ready();
  });
  // The concurrency probe imports the real source adapter; compiled-asset runs cover UI workflows separately.
  if (!compiled) await check('same-origin tabs serialize rapid mutations and update mounted views', async () => {
    const target = await send('Target.createTarget', { url: `http://127.0.0.1:${address.port}/` });
    const { sessionId: otherSession } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    try {
      await send('Network.enable', {}, otherSession);
      const result = await send('Runtime.evaluate', { expression: `(async()=>{const {apiFetch}=await import('/src/lib/deployment.ts');await Promise.all(Array.from({length:10},()=>apiFetch('/api/transactions',{method:'POST',body:JSON.stringify({type:'expense',amountCents:1,categoryId:4,date:'2026-11-30',note:'Fictional concurrent operation'})})));return JSON.parse(localStorage.getItem('${storageKey}')).transactions.length;})()`, awaitPromise: true, returnByValue: true }, otherSession);
      assert.equal(result.result.value, 23);
      await waitFor("document.querySelector('main')?.textContent.includes('$2,155.10')");
      const current = await state(); assert.equal(new Set(current.transactions.map(t => t.id)).size, 23);
    } finally { await send('Target.closeTarget', { targetId: target.targetId }); }
  });
  await check('corrupt storage survives reload until accessible explicit reset', async () => {
    await evaluate(`localStorage.setItem('${storageKey}', 'corrupted demo value')`);
    await command('Page.reload'); await waitFor("document.querySelector('[role=alert]')?.textContent.includes('Stored demo data')");
    assert.equal(await evaluate(`localStorage.getItem('${storageKey}')`), 'corrupted demo value');
    await click('Reset Demo'); await waitFor("document.querySelector('dialog:modal')!==null");
    await click('Confirm reset', "document.querySelector('dialog')"); await closed(); await ready();
    const { nodes } = await command('Accessibility.getFullAXTree');
    assert(nodes.some(n => n.role?.value === 'button' && n.name?.value === 'Reset Demo'));
    assert(nodes.some(n => n.role?.value === 'status'));
  });
  await check('mobile viewport, reduced motion and browser-local isolation remain usable', async () => {
    await command('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: false });
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), true);
    await click('Reset Demo'); await waitFor("document.querySelector('dialog:modal')!==null");
    await click('Cancel', "document.querySelector('dialog')"); await closed();
    assert.equal((await state()).transactions.length, 13);
  });
}
