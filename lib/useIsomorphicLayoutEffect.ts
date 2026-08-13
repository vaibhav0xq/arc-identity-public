import { useEffect, useLayoutEffect } from "react";

// useLayoutEffect on the client (runs before the browser paints, so session
// state read from localStorage can seed the first frame without a wrong-state
// flash), useEffect during SSR where layout effects would warn.
export const useIsomorphicLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;
