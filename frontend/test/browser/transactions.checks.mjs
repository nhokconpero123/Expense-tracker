import assert from 'node:assert/strict';

/** Exercise real production components/hooks in the existing isolated Chrome session. */
export async function runTransactionChecks({ command, evaluate, waitFor, key, check }) {
  const testUrl = (await evaluate('location.href')).replace('analytics.html', 'transactions.html');
  const button = (name, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
  const click = async (name, scope) => { await evaluate(`{const b=${button(name, scope)};if(!b)throw Error('Missing button');b.focus();}`); await key('Enter', 'Enter', 13); };
  const refresh = () => evaluate("document.querySelector('[aria-label=\"Refresh transaction list\"]').click()");
  const configure = (resource, mode) => evaluate(`transactionsHarness.configure(${JSON.stringify(resource)},${JSON.stringify(mode)})`);
  const release = id => evaluate(`transactionsHarness.release(${id ?? ''})`);
  const count = method => evaluate(`transactionsHarness.requests.filter(r=>r.method===${JSON.stringify(method)}).length`);
  const listCount = () => evaluate("transactionsHarness.requests.filter(r=>r.method==='GET'&&r.url.startsWith('/api/transactions')).length");
  const fresh = async (query = '') => {
    await command('Page.navigate', { url: testUrl + query });
    await waitFor("window.transactionsHarness && document.body.textContent.includes('Original lunch')");
  };
  const setField = (selector, value) => evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});const proto=e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:e instanceof HTMLSelectElement?HTMLSelectElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));}`);
  const fill = async () => { await setField('#tx-amount', '25.50'); await setField('#tx-category', '4'); await setField('#tx-date', '2024-02-03'); await setField('#tx-note', 'Saved fixture'); };
  const open = async mode => {
    if (mode === 'create') await click('Add Transaction');
    else {
      await evaluate(`document.querySelector('[title="${mode === 'edit' ? 'Edit' : 'Delete'} transaction"]').focus()`);
      await key('Enter', 'Enter', 13);
    }
    await waitFor("document.querySelector('dialog:modal') !== null");
  };
  const closed = () => waitFor("document.querySelector('dialog[open]') === null");
  const warning = "document.body.textContent.includes('but the list failed to refresh')";
  const save = () => evaluate("document.querySelector('dialog form').requestSubmit()");

  for (const mode of ['create', 'edit', 'delete']) {
    await check(`transactions ${mode}: native modality, keyboard containment, Escape/Cancel and focus`, async () => {
      await fresh(); await open(mode);
      assert.equal(await evaluate('document.activeElement.id || document.activeElement.textContent.trim()'), mode === 'delete' ? 'Cancel' : 'tx-amount');
      for (const modifiers of [0, 8]) for (let i = 0; i < 12; i++) {
        await key('Tab', 'Tab', 9, modifiers);
        assert.equal(await evaluate("document.querySelector('dialog').contains(document.activeElement)"), true);
      }
      await key('Escape', 'Escape', 27); await closed();
      assert.equal(await count('POST') + await count('PUT') + await count('DELETE'), 0);
      assert.equal(await evaluate("document.activeElement.textContent.includes('Add Transaction') || document.activeElement.title.endsWith('transaction')"), true);
      await open(mode); await click('Cancel', "document.querySelector('dialog')"); await closed();
      assert.equal(await count('POST') + await count('PUT') + await count('DELETE'), 0);
    });
  }
  for (const mode of ['create', 'edit']) {
    await check(`transactions ${mode}: pending save blocks duplicate submission/dismissal and preserves failed form`, async () => {
      await fresh(); await open(mode); await fill(); await configure('write', 'hold_error');
      await evaluate("{const f=document.querySelector('dialog form');f.requestSubmit();f.requestSubmit();}");
      const method = mode === 'create' ? 'POST' : 'PUT';
      await waitFor(`transactionsHarness.requests.some(r=>r.method==='${method}')`);
      await evaluate("{window.dialogTrace=[];for(const name of ['cancel','close'])document.querySelector('dialog').addEventListener(name,e=>{window.dialogTrace.push([name,e.defaultPrevented]);queueMicrotask(()=>window.dialogTrace.push(['after-'+name,e.defaultPrevented]));});}");
      await key('Escape', 'Escape', 27);
      assert.equal(await evaluate("document.querySelector('dialog').matches(':modal')"), true);
      assert.equal(await evaluate(`${button('Cancel', "document.querySelector('dialog')")}.disabled`), true);
      assert.equal(await count(method), 1);
      assert.deepEqual(await evaluate('window.dialogTrace.filter(entry=>entry[0]==="close")'), []);
      await release(); await waitFor("document.querySelector('dialog [role=alert]') !== null");
      assert.equal(await evaluate("document.querySelector('#tx-amount').value"), '25.50');
      assert.equal(await evaluate("document.querySelector('#tx-note').value"), 'Saved fixture');
      await configure('write', 'success'); await save(); await closed(); assert.equal(await count(method), 2);
    });
  }
  await check('transactions delete: pending guard, no duplicate delete, failure retention and Escape', async () => {
    await fresh(); await open('delete'); await configure('write', 'hold_error');
    await evaluate(`{const b=${button('Delete Transaction', "document.querySelector('dialog')")};b.click();b.click();}`);
    await waitFor("transactionsHarness.requests.some(r=>r.method==='DELETE')");
    await key('Escape', 'Escape', 27); assert.equal(await count('DELETE'), 1);
    assert.equal(await evaluate("document.querySelector('dialog').matches(':modal')"), true);
    await release(); await waitFor("document.querySelector('dialog [role=alert]') !== null");
    await key('Escape', 'Escape', 27); await closed();
    assert.equal(await evaluate("document.body.textContent.includes('Original lunch')"), true);
  });
  for (const mode of ['edit', 'delete']) {
    await check(`transactions ${mode}: successful refresh removes trigger and restores page heading`, async () => {
      await fresh(); await open(mode);
      if (mode === 'edit') { await fill(); await save(); }
      else await click('Delete Transaction', "document.querySelector('dialog')");
      await closed(); await waitFor("document.activeElement.tagName === 'H1'");
      await key('Escape', 'Escape', 27); assert.equal(await evaluate("document.querySelector('dialog[open]')"), null);
      assert.equal(await evaluate("document.querySelector('#transaction-revision').textContent"), '1');
    });
  }
  await check('categories failure and retry restores open form without reloading list or losing values', async () => {
    await fresh('?categoryError=1');
    await waitFor("document.body.textContent.includes('Failed to load categories')");
    const lists = await listCount();
    const categories = await evaluate("transactionsHarness.requests.filter(r=>r.url==='/api/categories').length");
    await open('create'); await setField('#tx-amount', '12.34'); await configure('categories', 'hold');
    await evaluate(`{const b=${button('Retry categories', "document.querySelector('dialog')")};b.click();b.click();}`);
    await waitFor("document.querySelector('dialog').textContent.includes('Loading categories')");
    assert.equal(await evaluate("transactionsHarness.requests.filter(r=>r.url==='/api/categories').length"), categories + 1);
    await release(); await waitFor("document.querySelector('#tx-category option[value=\"4\"]') !== null");
    assert.equal(await evaluate("document.querySelector('#tx-amount').value"), '12.34');
    assert.equal(await listCount(), lists); await key('Escape', 'Escape', 27); await closed();
  });
  await check('failed changed-filter request hides obsolete actionable rows and retries exact filters', async () => {
    await fresh(); await configure('list', 'error'); await setField('#filter-search', 'missing');
    await waitFor("document.body.textContent.includes('Simulated list failure')");
    assert.equal(await evaluate("document.querySelector('[title=\"Edit transaction\"]')"), null);
    assert.equal(await evaluate("document.body.textContent.includes('Original lunch')"), false);
    await configure('list', 'success'); await click('Retry');
    await waitFor("document.body.textContent.includes('No transactions match')");
    assert.equal(await evaluate("document.querySelector('#filter-search').value"), 'missing');
    assert.equal(await evaluate("transactionsHarness.requests.at(-1).url.includes('q=missing')"), true);
  });
  await check('late obsolete filter response cannot replace current empty result', async () => {
    await fresh(); await configure('list', 'hold'); await setField('#filter-search', 'Original');
    await waitFor("transactionsHarness.requests.some(r=>r.url.includes('q=Original'))");
    await configure('list', 'success'); await setField('#filter-search', 'missing');
    await waitFor("document.body.textContent.includes('No transactions match')"); await release();
    assert.equal(await evaluate("document.body.textContent.includes('Original lunch')"), false);
    assert.equal(await evaluate("document.querySelector('[title=\"Delete transaction\"]')"), null);
  });
  await check('failed page request retries the selected page without showing the prior page', async () => {
    await fresh(); await evaluate('transactionsHarness.setRowCount(21)'); await refresh();
    await waitFor("document.querySelector('[aria-label=\"Next page\"]')?.disabled === false");
    await configure('list', 'error'); await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()");
    await waitFor("document.body.textContent.includes('Simulated list failure')");
    assert.equal(await evaluate("document.querySelector('[title=\"Edit transaction\"]')"), null);
    await configure('list', 'success'); await click('Retry'); await waitFor("document.body.textContent.includes('Row 21')");
    assert.equal(await evaluate("transactionsHarness.requests.at(-1).url.includes('page=2')"), true);
  });
  for (const mode of ['create', 'edit', 'delete']) {
    await check(`transactions ${mode}: successful mutation, failed GET, failed retry, successful retry clears warning only`, async () => {
      await fresh(); await open(mode); if (mode !== 'delete') await fill();
      await configure('list', 'error');
      if (mode === 'delete') await click('Delete Transaction', "document.querySelector('dialog')"); else await save();
      await closed(); await waitFor(warning);
      const method = mode === 'create' ? 'POST' : mode === 'edit' ? 'PUT' : 'DELETE'; assert.equal(await count(method), 1);
      await configure('list', 'network'); await click('Retry'); await waitFor("document.body.textContent.includes('Simulated network failure')");
      assert.equal(await evaluate(warning), true);
      await configure('list', 'success'); await click('Retry'); await waitFor(`!(${warning})`);
      assert.equal(await count(method), 1);
      assert.equal(await evaluate("document.querySelector('main [role=status]')?.textContent.includes('successfully')"), true);
    });
  }
  await check('older refresh completion cannot clear a newer mutation refresh warning', async () => {
    await fresh(); await open('create'); await fill(); await configure('list', 'error'); await save(); await closed(); await waitFor(warning);
    await configure('list', 'hold'); await click('Retry');
    const oldId = await evaluate('transactionsHarness.requests.at(-1).id');
    await open('create'); await fill(); await configure('list', 'hold_error'); await save();
    await waitFor("transactionsHarness.requests.filter(r=>r.method==='POST').length===2 && transactionsHarness.requests.at(-1).method==='GET'");
    const newId = await evaluate('transactionsHarness.requests.at(-1).id');
    await release(newId); await closed(); await waitFor(warning); await release(oldId);
    assert.equal(await evaluate(warning), true);
    await configure('list', 'success'); await refresh(); await waitFor(`!(${warning})`);
    assert.equal(await count('POST'), 2);
  });
  await check('older success expiration cannot erase newer recovered mutation feedback', async () => {
    await fresh(); await open('create'); await fill(); await save(); await closed();
    await open('create'); await fill(); await configure('list', 'error'); await save(); await closed(); await waitFor(warning);
    await configure('list', 'success'); await click('Retry'); await waitFor(`!(${warning})`);
    await evaluate('new Promise(resolve=>setTimeout(resolve,5100))');
    assert.equal(await evaluate("document.querySelector('main [role=status]')?.textContent.includes('saved successfully')"), true);
    assert.equal(await count('POST'), 2);
  });
  await check('delete last row of page adjusts to a valid page without duplicate reload', async () => {
    await fresh(); await evaluate('transactionsHarness.setRowCount(21)'); await refresh();
    await waitFor("document.querySelector('[aria-label=\"Next page\"]')?.disabled === false");
    await evaluate("document.querySelector('[aria-label=\"Next page\"]').click()"); await waitFor("document.body.textContent.includes('Row 21')");
    const before = await listCount(); await open('delete'); await click('Delete Transaction', "document.querySelector('dialog')"); await closed();
    await waitFor("document.body.textContent.includes('Row 1')"); assert.equal(await listCount(), before + 1);
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Previous page\"]').disabled"), true);
  });
  await check('MonthContext direct actions and accessible controls respect bounds and Dec/Jan transitions', async () => {
    await fresh(); await click('Select minimum month');
    await waitFor("document.querySelector('#selected-month').textContent==='1900-01'");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Previous month\"]').disabled"), true);
    await click('Direct previous'); await click('Direct previous');
    assert.equal(await evaluate("document.querySelector('#selected-month').textContent"), '1900-01');
    await click('Select maximum month'); await waitFor("document.querySelector('#selected-month').textContent==='9999-12'");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Next month\"]').disabled"), true);
    await click('Direct next'); assert.equal(await evaluate("document.querySelector('#selected-month').textContent"), '9999-12');
    await click('Select December'); await click('Direct next'); await waitFor("document.querySelector('#selected-month').textContent==='2025-01'");
    await click('Direct previous'); await waitFor("document.querySelector('#selected-month').textContent==='2024-12'");
  });
  await check('native transaction dialog remains bounded at 360px with a short viewport', async () => {
    await fresh(); await command('Emulation.setDeviceMetricsOverride', { width: 360, height: 500, deviceScaleFactor: 1, mobile: false });
    await open('create');
    const r = await evaluate("(()=>{const r=document.querySelector('dialog').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}})()");
    assert(r.left >= 0 && r.right <= 360 && r.top >= 0 && r.bottom <= 500);
    await key('Escape', 'Escape', 27); await closed();
  });
}
