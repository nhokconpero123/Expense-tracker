import { describe, expect, it } from 'vitest';
import { buildBudgetItem } from './budgets.js';

const row = { categoryId: 4n, categoryName: 'Food', amountCents: 10000n, spentCents: 0n };
describe('pure budget calculations', () => {
  it.each([[0n,0,10000,'under'],[7500n,75,2500,'under'],[10000n,100,0,'at_limit'],
    [12500n,125,-2500,'over']] as const)('calculates status and remaining for %s cents', (spentCents,percent,remaining,status)=>{
    expect(buildBudgetItem('2026-01',{...row,spentCents})).toMatchObject({
      spentCents:Number(spentCents),utilizationPercent:percent,remainingCents:remaining,status,
    });
  });
  it('uses null dependent values when the budget is absent but preserves spending',()=>{
    expect(buildBudgetItem('2026-01',{...row,amountCents:null,spentCents:29n})).toEqual({
      categoryId:4,categoryName:'Food',month:'2026-01',amountCents:null,spentCents:29,
      remainingCents:null,utilizationPercent:null,status:'no_budget',
    });
  });
  it.each([[1n,3n,33.3],[2n,3n,66.7],[1n,2000n,0.1],[1n,2001n,0],[1n,1999n,0.1]] as const)(
    'rounds %s/%s percent half-up to one decimal', (spentCents,amountCents,expected)=>{
      expect(buildBudgetItem('2026-01',{...row,spentCents,amountCents}).utilizationPercent).toBe(expected);
    });
  it('preserves safe monetary extrema without capping utilization',()=>{
    const result=buildBudgetItem('9999-12',{...row,amountCents:1n,spentCents:BigInt(Number.MAX_SAFE_INTEGER)});
    expect(result.spentCents).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.remainingCents).toBe(1-Number.MAX_SAFE_INTEGER);
    expect(result.status).toBe('over'); expect(Number.isFinite(result.utilizationPercent)).toBe(true);
  });
  it.each([0n,-1n,100000001n])('rejects invalid stored budget limit %s',amountCents=>{
    expect(()=>buildBudgetItem('2026-01',{...row,amountCents})).toThrow();
  });
  it.each([-1n,BigInt(Number.MAX_SAFE_INTEGER)+1n])('rejects unsafe spending %s',spentCents=>{
    expect(()=>buildBudgetItem('2026-01',{...row,spentCents})).toThrow();
  });
  it('checks category identifier safety',()=>{
    expect(()=>buildBudgetItem('2026-01',{...row,categoryId:BigInt(Number.MAX_SAFE_INTEGER)+1n})).toThrow();
  });
});
