import { useEffect, useState } from 'react';

/** Delays reflecting `value` until it stops changing for `delayMs`. Used to
 * keep search-as-you-type inputs from firing a server request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
