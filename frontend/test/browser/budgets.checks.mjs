import assert from 'node:assert/strict';

export async function runBudgetChecks({ command, evaluate, waitFor, key, check }) {
  const url = (await evaluate('location.href')).replace(/(?:analytics|transactions)\.html.*$/, 'budgets.html');
  const fresh = async () => {
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url }); await waitFor("window.budgetHarness && document.querySelectorAll('article').length===2");
  };
  const button = (name, scope = 'document') => `[...${scope}.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(name)})`;
  const click = async (name, scope) => { await evaluate(`${button(name, scope)}.focus()`); await key('Enter', 'Enter', 13); };
  const open = async (mode = 'edit') => {
    const name = mode === 'set' ? 'Set budget for Transport' : mode === 'remove' ? 'Remove budget for Food' : 'Edit budget for Food';
    await evaluate(`{window.budgetOpener=document.querySelector('[aria-label="${name}"]');window.budgetOpener.focus();}`); await key('Enter', 'Enter', 13);
    await waitFor("document.querySelector('dialog:modal')!==null");
  };
  const closed = () => waitFor("document.querySelector('dialog')===null");
  const snapshot = () => evaluate("(()=>{const d=document.querySelector('dialog');const e=document.activeElement;return {tag:e.tagName,id:e.id,label:e.tagName==='BODY'?'BODY':e.textContent.trim(),inside:d.contains(e),open:d.open,modal:d.matches(':modal'),documentFocused:document.hasFocus()}})()");
  const setAmount = value => evaluate(`{const e=document.querySelector('#budget-amount');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  const writes = () => evaluate("budgetHarness.requests.filter(r=>r.method!=='GET')");
  const background = async () => {
    await evaluate("document.querySelector('#budget-background').focus()");
    const focusRejected = await evaluate("document.activeElement.id!=='budget-background'");
    const position = await evaluate("(()=>{const r=document.querySelector('#budget-background').getBoundingClientRect(),d=document.querySelector('dialog').getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,outsideDialog:x<d.left||x>d.right||y<d.top||y>d.bottom}})()");
    assert.equal(position.outsideDialog, true, 'Probe must target the backdrop over a real background control');
    const point = { x: position.x, y: position.y };
    await command('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point });
    await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point });
    await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point });
    return { focusRejected, activations: await evaluate('budgetHarness.backgroundActivations'), modal: await evaluate("document.querySelector('dialog').matches(':modal')"), explicitInertAttribute: await evaluate("document.querySelector('#budget-background').inert") };
  };
  const boundaries = async mode => {
    const scope = "document.querySelector('dialog')";
    const lastName = mode === 'remove' ? 'Remove budget' : 'Save budget';
    await evaluate(`${button(lastName, scope)}.focus()`); await key('Tab', 'Tab', 9);
    assert.equal(await evaluate('document.activeElement.id || document.activeElement.textContent.trim()'), mode === 'remove' ? 'Cancel' : 'budget-amount');
    await key('Tab', 'Tab', 9, 8);
    assert.equal(await evaluate('document.activeElement.textContent.trim()'), lastName);
    for (const modifiers of [0, 8]) for (let i = 0; i < 10; i++) {
      await key('Tab', 'Tab', 9, modifiers); const state = await snapshot();
      assert.equal(state.inside, true, JSON.stringify(state)); assert.equal(state.open && state.modal, true);
    }
  };
  const restored = async () => { await closed(); assert.equal(await evaluate('document.activeElement===window.budgetOpener'), true); };
  for (const mode of ['edit', 'set', 'remove']) await check(`budget ${mode}: initial focus, final/first Tab boundaries, Escape/Cancel and trigger restoration`, async () => {
    await fresh(); await open(mode);
    assert.equal(await evaluate('document.activeElement.id || document.activeElement.textContent.trim()'), mode === 'remove' ? 'Cancel' : 'budget-amount');
    if (mode === 'edit') assert.equal(await evaluate("document.querySelector('#budget-amount').value"), '100.00');
    await boundaries(mode); await key('Escape', 'Escape', 27); await restored();
    await open(mode); await click('Cancel', "document.querySelector('dialog')"); await restored();
    assert.deepEqual(await writes(), []);
  });
  await check('budget modal preserves effective background inertness without claiming an inert attribute', async () => {
    await fresh(); await click('Background action'); assert.equal(await evaluate('budgetHarness.backgroundActivations'), 1);
    await open(); const state = await background();
    assert.equal(state.focusRejected, true); assert.equal(state.activations, 1); assert.equal(state.modal, true);
    await key(' ', 'Space', 32); assert.equal(await evaluate('budgetHarness.backgroundActivations'), 1);
    // A background click can focus the dialog itself; the next Tab returns to its controls.
    await key('Tab', 'Tab', 9); assert.equal((await snapshot()).inside, true);
    await boundaries('edit'); await key('Escape', 'Escape', 27); await restored();
    await click('Background action'); assert.equal(await evaluate('budgetHarness.backgroundActivations'), 2);
    assert.deepEqual(await writes(), []);
  });
  for (const mode of ['set', 'edit']) await check(`budget ${mode}: pending Tab/Escape safety, one PUT and fallback focus after save`, async () => {
    await fresh(); await open(mode); await setAmount('123.45'); await evaluate("budgetHarness.configure('hold')");
    await evaluate("{const f=document.querySelector('dialog form');f.requestSubmit();f.requestSubmit();}");
    await waitFor("document.querySelector('dialog form').getAttribute('aria-busy')==='true'");
    for (const modifiers of [0, 8]) { await key('Tab', 'Tab', 9, modifiers); assert.equal((await snapshot()).inside, true); }
    await key('Escape', 'Escape', 27); assert.equal((await snapshot()).modal, true);
    assert.equal(await evaluate(`${button('Cancel', "document.querySelector('dialog')")}.disabled`), true);
    const state = await background(); assert.equal(state.activations, 0); assert.equal(state.focusRejected, true);
    assert.equal((await writes()).length, 1);
    assert.deepEqual((await writes())[0], { method: 'PUT', path: `/api/budgets/${mode === 'set' ? 6 : 4}/2024-02`, body: { amountCents: 12345 } });
    await evaluate('budgetHarness.release()'); await closed();
    await waitFor("document.activeElement.tagName==='H1'");
    assert.equal(await evaluate(`budgetHarness.snapshot().find(i=>i.categoryId===${mode === 'set' ? 6 : 4}).amountCents`), 12345);
    assert.equal((await writes()).length, 1);
  });
  await check('budget validation/write failure preserves values and error focus, then retries safely', async () => {
    await fresh(); await open(); await setAmount('0'); await click('Save budget', "document.querySelector('dialog')");
    await waitFor("document.querySelector('#budget-amount').getAttribute('aria-invalid')==='true'");
    assert.deepEqual(await writes(), []); assert.equal(await evaluate('document.activeElement.id'), 'budget-amount');
    await setAmount('123.45'); await evaluate("budgetHarness.configure('error')"); await click('Save budget', "document.querySelector('dialog')");
    await waitFor("document.querySelector('dialog').textContent.includes('Simulated budget write failure')");
    assert.equal(await evaluate("document.querySelector('#budget-amount').value"), '123.45');
    assert.equal(await evaluate("document.activeElement.getAttribute('role')"), 'alert');
    await boundaries('edit'); await evaluate("budgetHarness.configure('success')"); await click('Save budget', "document.querySelector('dialog')");
    await closed(); assert.equal((await writes()).length, 2); assert((await writes()).every(r=>r.method==='PUT'));
    assert.equal(await evaluate('budgetHarness.snapshot()[0].amountCents'), 12345);
  });
  await check('budget remove: pending duplicate/dismissal guard, failed DELETE retention and confirmed removal', async () => {
    await fresh(); await open('remove'); await evaluate("budgetHarness.configure('hold_error')");
    await evaluate("{const f=document.querySelector('dialog form');f.requestSubmit();f.requestSubmit();}");
    await waitFor("document.querySelector('dialog form').getAttribute('aria-busy')==='true'");
    await key('Tab', 'Tab', 9); await key('Tab', 'Tab', 9, 8); await key('Escape', 'Escape', 27);
    assert.equal((await snapshot()).modal, true); assert.equal((await snapshot()).inside, true); assert.equal((await writes()).length, 1);
    await evaluate('budgetHarness.release()'); await waitFor("document.querySelector('dialog').textContent.includes('Simulated budget write failure')");
    assert.equal(await evaluate('budgetHarness.snapshot()[0].amountCents'), 10000);
    await key('Escape', 'Escape', 27); await restored();
    await open('remove'); await evaluate("budgetHarness.configure('success')"); await click('Remove budget', "document.querySelector('dialog')"); await closed();
    await waitFor("document.activeElement.tagName==='H1'");
    assert.equal((await writes()).length, 2); assert((await writes()).every(r=>r.method==='DELETE'));
    const row = await evaluate('budgetHarness.snapshot()[0]'); assert.equal(row.amountCents, null); assert.equal(row.spentCents, 7500); assert.equal(row.status, 'no_budget');
  });
  await check('budget repeated Set/Edit/Remove reopening retains clean native focus lifecycle', async () => {
    await fresh();
    for (let i = 0; i < 3; i++) for (const mode of ['set', 'edit', 'remove']) {
      await open(mode); await boundaries(mode);
      if (i % 2) await click('Cancel', "document.querySelector('dialog')"); else await key('Escape', 'Escape', 27);
      await restored();
    }
    assert.deepEqual(await writes(), []);
  });
}
