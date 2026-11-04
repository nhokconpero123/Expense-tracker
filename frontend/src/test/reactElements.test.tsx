import { describe, expect, expectTypeOf, it } from 'vitest';
import type { ComponentProps } from 'react';
import { AnalyticsViewControls } from '../components/AnalyticsControls';
import { childrenOf, elementProps } from './reactElements';

describe('typed test element extraction', () => {
  it('infers component props from the checked component identity', () => {
    const onChange = () => {};
    const node = <AnalyticsViewControls view="table" onChange={onChange} />;
    const extracted = elementProps(node, AnalyticsViewControls);
    expectTypeOf(extracted).toEqualTypeOf<ComponentProps<typeof AnalyticsViewControls>>();
    expect(extracted).toBe(node.props);
    expect(extracted.onChange).toBe(onChange);
  });
  it('rejects an unexpected native or component element type', () => {
    expect(() => elementProps(<div />, 'button')).toThrow('requested type');
    expect(() => elementProps(<div />, AnalyticsViewControls)).toThrow('requested type');
  });
  it('rejects non-elements rather than asserting arbitrary props', () => {
    expect(() => elementProps(null, 'button')).toThrow('requested type');
    expect(() => childrenOf('text')).toThrow('Expected React element');
  });
});
