import { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveListingFromText as resolveListingFromTextUtil } from '../utils/listingMetadata.js';

export function useListingsManager(initialListings, defaultFilters, options = {}) {
  const [allListings, setAllListings] = useState(initialListings);
  const [listings, setListings] = useState(initialListings);
  const [searchSummary, setSearchSummary] = useState(null);
  const [filters, setFilters] = useState(defaultFilters);
  const [sortOrder, setSortOrder] = useState('homesForYou');

  const matchesTextQuery = useCallback(
    (listing, queryText) => {
      const trimmed = String(queryText ?? '').trim().toLowerCase();
      if (!trimmed) {
        return true;
      }

      const tokens = trimmed
        .split(/[^a-z0-9]+/)
        .map((token) => token.trim())
        .filter(Boolean);
      if (!tokens.length) {
        return true;
      }

      const baseParts = [
        listing.displayAddress,
        listing.name,
        listing.city,
        listing.state,
        listing.zip,
      ]
        .filter(Boolean)
        .map((part) => String(part).toLowerCase());

      const state = String(listing.state ?? '').trim().toLowerCase();
      const stateNameToAbbr = options.stateNameToAbbr ?? {};
      const stateAbbrToName = options.stateAbbrToName ?? {};
      if (state && stateAbbrToName[state]) {
        baseParts.push(stateAbbrToName[state]);
      }

      const haystack = baseParts.join(' ');
      if (!haystack) {
        return false;
      }

      return tokens.every((token) => {
        const normalized = token.replace(/\./g, '');
        if (haystack.includes(normalized)) {
          return true;
        }
        if (stateNameToAbbr[normalized]) {
          const abbr = stateNameToAbbr[normalized];
          if (haystack.includes(abbr)) {
            return true;
          }
        }
        if (stateAbbrToName[normalized]) {
          const fullName = stateAbbrToName[normalized];
          if (haystack.includes(fullName)) {
            return true;
          }
        }
        return false;
      });
    },
    [options.stateAbbrToName, options.stateNameToAbbr],
  );

  useEffect(() => {
    setAllListings(initialListings);
    setListings(initialListings);
    setFilters(defaultFilters);
    setSearchSummary({
      totalAvailable: initialListings.length,
      returnedCount: initialListings.length,
      location: '',
      appliedFilters: {
        minPrice: null,
        maxPrice: null,
        bedsMin: null,
        bedsMax: null,
        bathsMin: null,
        bathsMax: null,
        sqftMax: null,
        sortOrder: 'homesForYou',
      },
      sortOrder: 'homesForYou',
    });
  }, [defaultFilters, initialListings]);

  const filteredListings = useMemo(() => {
    if (!listings.length) {
      return [];
    }

    return listings.filter((listing) => {
      const {
        query,
        saleType,
        priceMin,
        priceMax,
        bedsMin,
        bedsMax,
        bathsMin,
        bathsMax,
        sqftMax,
        exactBeds,
        homeTypes,
      } = filters;

      if (query && !matchesTextQuery(listing, query)) {
        return false;
      }

      if (saleType !== 'forSale') {
        return false;
      }

      if (priceMin !== null && listing.priceRaw != null && listing.priceRaw < priceMin) {
        return false;
      }

      if (priceMax !== null && listing.priceRaw != null && listing.priceRaw > priceMax) {
        return false;
      }

      if (bedsMin) {
        if (!Number.isFinite(listing.beds)) {
          return false;
        }
        if (exactBeds) {
          return listing.beds === bedsMin;
        }
        if (listing.beds < bedsMin) {
          return false;
        }
      }

      if (!exactBeds && bedsMax != null) {
        if (!Number.isFinite(listing.beds) || listing.beds > bedsMax) {
          return false;
        }
      }

      if (bathsMin) {
        if (!Number.isFinite(listing.baths) || listing.baths < bathsMin) {
          return false;
        }
      }

      if (bathsMax != null) {
        if (!Number.isFinite(listing.baths) || listing.baths > bathsMax) {
          return false;
        }
      }

      if (sqftMax != null) {
        if (!Number.isFinite(listing.livingArea) || listing.livingArea > sqftMax) {
          return false;
        }
      }

      const defaultHomeTypes = options.defaultHomeTypes ?? [];
      const homeTypeSelection = homeTypes ?? [];
      const isDefaultHomeType =
        !homeTypeSelection.length || homeTypeSelection.length === defaultHomeTypes.length;
      if (!isDefaultHomeType) {
        const normalizeHomeType = options.normalizeHomeType ?? ((value) => value);
        const normalizedType = normalizeHomeType(listing.homeType);
        if (!normalizedType || !homeTypeSelection.includes(normalizedType)) {
          return false;
        }
      }

      return true;
    });
  }, [filters, listings, matchesTextQuery, options.defaultHomeTypes, options.normalizeHomeType]);

  const sortedListings = useMemo(() => {
    if (!filteredListings.length) {
      return [];
    }

    const sorted = [...filteredListings];

    switch (sortOrder) {
      case 'priceLowHigh':
        sorted.sort((a, b) => {
          const aPrice = a.priceRaw ?? Number.POSITIVE_INFINITY;
          const bPrice = b.priceRaw ?? Number.POSITIVE_INFINITY;
          return aPrice - bPrice;
        });
        break;
      case 'priceHighLow':
        sorted.sort((a, b) => {
          const aPrice = a.priceRaw ?? Number.NEGATIVE_INFINITY;
          const bPrice = b.priceRaw ?? Number.NEGATIVE_INFINITY;
          return bPrice - aPrice;
        });
        break;
      case 'newest':
        sorted.sort((a, b) => {
          const aId = Number.parseInt(a.zpid, 10);
          const bId = Number.parseInt(b.zpid, 10);
          const safeA = Number.isFinite(aId) ? aId : Number.NEGATIVE_INFINITY;
          const safeB = Number.isFinite(bId) ? bId : Number.NEGATIVE_INFINITY;
          return safeB - safeA;
        });
        break;
      case 'bedsHighLow':
        sorted.sort((a, b) => {
          const aBeds = Number.isFinite(a.beds) ? a.beds : Number.NEGATIVE_INFINITY;
          const bBeds = Number.isFinite(b.beds) ? b.beds : Number.NEGATIVE_INFINITY;
          return bBeds - aBeds;
        });
        break;
      case 'bathsHighLow':
        sorted.sort((a, b) => {
          const aBaths = Number.isFinite(a.baths) ? a.baths : Number.NEGATIVE_INFINITY;
          const bBaths = Number.isFinite(b.baths) ? b.baths : Number.NEGATIVE_INFINITY;
          return bBaths - aBaths;
        });
        break;
      case 'sqftHighLow':
        sorted.sort((a, b) => {
          const aSqft = Number.isFinite(a.livingArea) ? a.livingArea : Number.NEGATIVE_INFINITY;
          const bSqft = Number.isFinite(b.livingArea) ? b.livingArea : Number.NEGATIVE_INFINITY;
          return bSqft - aSqft;
        });
        break;
      default:
        break;
    }

    return sorted;
  }, [filteredListings, sortOrder]);

  const resolveListingFromText = useCallback(
    (rawText) => {
      const text = String(rawText ?? '').trim();
      if (!text) {
        return null;
      }

      const candidates = allListings.length ? allListings : initialListings;
      return (
        resolveListingFromTextUtil(text, candidates, {
          matchText: matchesTextQuery,
        }) ?? null
      );
    },
    [allListings, initialListings, matchesTextQuery],
  );

  return {
    allListings,
    setAllListings,
    listings,
    setListings,
    searchSummary,
    setSearchSummary,
    filters,
    setFilters,
    sortOrder,
    setSortOrder,
    filteredListings,
    sortedListings,
    matchesTextQuery,
    resolveListingFromText,
  };
}
