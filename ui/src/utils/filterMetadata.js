const normalizeNumber = (value) => {
  if (Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.replace(/[^0-9.]/g, ''));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

export const buildFilterMetadataPayload = (filters, sortOrder) => {
  if (!filters || typeof filters !== 'object') {
    return null;
  }

  const priceMin = normalizeNumber(filters.priceMin);
  const priceMax = normalizeNumber(filters.priceMax);
  const bedsMin = normalizeNumber(filters.bedsMin);
  const bedsMax = normalizeNumber(filters.bedsMax);
  const bathsMin = normalizeNumber(filters.bathsMin);
  const bathsMax = normalizeNumber(filters.bathsMax);
  const sqftMax = normalizeNumber(filters.sqftMax);

  const payload = {
    query:
      typeof filters.query === 'string' && filters.query.trim() ? filters.query.trim() : null,
    saleType: filters.saleType ?? null,
    priceMin,
    priceMax,
    minPrice: priceMin,
    maxPrice: priceMax,
    bedsMin,
    bedsMax,
    bathsMin,
    bathsMax,
    sqftMax,
    exactBeds: Boolean(filters.exactBeds),
    homeTypes: Array.isArray(filters.homeTypes) ? [...filters.homeTypes] : [],
  };

  if (sqftMax != null) {
    payload.maxSqft = sqftMax;
    payload.squareFootageMax = sqftMax;
  }

  const resolvedSortOrder = sortOrder ?? filters.sortOrder ?? null;
  const normalizedSortOrder =
    typeof resolvedSortOrder === 'string' && resolvedSortOrder.trim() ? resolvedSortOrder.trim() : null;
  payload.sortOrder = normalizedSortOrder;
  payload.source = 'react-ui';

  const hasMeaningfulEntry = Object.values(payload).some((value) => {
    if (Array.isArray(value)) {
      return value.length > 0;
    }
    return value != null && value !== '' && value !== false;
  });

  return hasMeaningfulEntry ? payload : null;
};
