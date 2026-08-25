const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

/**
 * Parses page/limit query params into safe, bounded integers. Every list
 * endpoint should route its req.query through this instead of re-deriving
 * `Number(page)`/`Number(limit)` inline — that pattern let non-numeric
 * input (`?page=abc`) flow through as NaN into `.skip(NaN)` (a 500, not a
 * clean rejection) and let a client request an unbounded `limit` (no cap
 * anywhere except booking.service.js's pageOfReservations).
 */
export const parsePagination = (query = {}, { defaultLimit = DEFAULT_LIMIT, maxLimit = MAX_LIMIT } = {}) => {
  const rawPage = Number(query.page);
  const rawLimit = Number(query.limit);

  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;
  const limit =
    Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(Math.floor(rawLimit), maxLimit) : defaultLimit;

  return { page, limit };
};

export const buildPaginatedResult = (items, total, page, limit) => ({
  items,
  total,
  page,
  pages: Math.ceil(total / limit) || 1,
});
