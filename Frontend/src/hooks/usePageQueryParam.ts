import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Syncs a paginated list's current page to `?page=` in the URL, so back/
 * forward and reload preserve position instead of always reopening on page 1
 * (every admin/owner list used to lose this on navigate-away-and-back).
 */
export function usePageQueryParam(paramName = 'page') {
  const [searchParams, setSearchParams] = useSearchParams();

  const raw = Number(searchParams.get(paramName));
  const page = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1;

  const setPage = useCallback(
    (next: number) => {
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next <= 1) params.delete(paramName);
          else params.set(paramName, String(next));
          return params;
        },
        { replace: true }
      );
    },
    [paramName, setSearchParams]
  );

  const resetPage = useCallback(() => setPage(1), [setPage]);

  return { page, setPage, resetPage };
}
