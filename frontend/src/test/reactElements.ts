import { isValidElement, type ComponentProps, type ElementType, type ReactNode } from 'react';

/** Infer props from the expected element type and check its identity before access. */
export function elementProps<T extends ElementType>(node: ReactNode, expectedType: T): ComponentProps<T> {
  if (!isValidElement<ComponentProps<T>>(node) || node.type !== expectedType) {
    throw new Error('Expected a React element of the requested type');
  }
  return node.props;
}

export function childrenOf(node: ReactNode): ReactNode {
  if (!isValidElement<{ children?: ReactNode }>(node)) throw new Error('Expected React element');
  return node.props.children;
}

/** These production button handlers do not consume the event argument. */
export function clickButton(node: ReactNode): void {
  const handler = elementProps(node, 'button').onClick;
  if (!handler) throw new Error('Expected a button click handler');
  Reflect.apply(handler, undefined, []);
}
