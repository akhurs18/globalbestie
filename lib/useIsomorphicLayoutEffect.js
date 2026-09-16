'use client';

import { useEffect, useLayoutEffect } from 'react';

/**
 * useLayoutEffect in the browser, useEffect on the server.
 *
 * Why this exists: GSAP's ScrollTrigger `pin: true` wraps the pinned element in a
 * `div.pin-spacer`, which makes it a child of that spacer rather than of the parent
 * React rendered it into. React only learns of the swap when it unmounts — and a
 * `useEffect` cleanup is a *passive* effect, which React flushes **after** it has
 * already detached the DOM node. By then `parent.removeChild(pinned)` has thrown:
 *
 *   NotFoundError: Failed to execute 'removeChild' on 'Node':
 *   The node to be removed is not a child of this node.
 *
 * A *layout* effect's cleanup runs synchronously while React is deleting the tree,
 * before the node is detached, so GSAP unwraps the spacer and puts the element back
 * where React expects it. Same animation, correct teardown order.
 *
 * The server branch is only to silence Next's "useLayoutEffect does nothing on the
 * server" warning; effects never run during SSR either way.
 */
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export default useIsomorphicLayoutEffect;
