import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TopBar from './components/TopBar';
import SearchBar from './components/SearchBar';
import MapPanel from './components/MapPanel';
import ListingGrid from './components/ListingGrid';
import ListingModal from './components/ListingModal';
import listingsData from './data/listings.json';
import { useAssistantChat } from './hooks/useAssistantChat.js';
import { useListingsManager } from './hooks/useListingsManager.js';
import './styles.css';
import {
  HOME_TYPE_DEFAULT_SELECTION,
  normalizeHomeType,
} from './constants/filterOptions.js';
import { SORT_OPTIONS } from './constants/sortOptions.js';
import { buildListingDetailSnapshot } from './utils/listingMetadata.js';

const defaultFilters = {
  query: '',
  saleType: 'forSale',
  priceMin: null,
  priceMax: null,
  bedsMin: 0,
  bedsMax: null,
  bathsMin: 0,
  bathsMax: null,
  sqftMax: null,
  exactBeds: false,
  homeTypes: [...HOME_TYPE_DEFAULT_SELECTION],
};

const STATE_NAME_TO_ABBR = {
  alabama: 'al',
  alaska: 'ak',
  arizona: 'az',
  arkansas: 'ar',
  california: 'ca',
  colorado: 'co',
  connecticut: 'ct',
  delaware: 'de',
  'district of columbia': 'dc',
  florida: 'fl',
  georgia: 'ga',
  hawaii: 'hi',
  idaho: 'id',
  illinois: 'il',
  indiana: 'in',
  iowa: 'ia',
  kansas: 'ks',
  kentucky: 'ky',
  louisiana: 'la',
  maine: 'me',
  maryland: 'md',
  massachusetts: 'ma',
  michigan: 'mi',
  minnesota: 'mn',
  mississippi: 'ms',
  missouri: 'mo',
  montana: 'mt',
  nebraska: 'ne',
  nevada: 'nv',
  'new hampshire': 'nh',
  'new jersey': 'nj',
  'new mexico': 'nm',
  'new york': 'ny',
  'north carolina': 'nc',
  'north dakota': 'nd',
  ohio: 'oh',
  oklahoma: 'ok',
  oregon: 'or',
  pennsylvania: 'pa',
  'rhode island': 'ri',
  'south carolina': 'sc',
  'south dakota': 'sd',
  tennessee: 'tn',
  texas: 'tx',
  utah: 'ut',
  vermont: 'vt',
  virginia: 'va',
  washington: 'wa',
  'west virginia': 'wv',
  wisconsin: 'wi',
  wyoming: 'wy',
};

const STATE_ABBR_TO_NAME = Object.fromEntries(
  Object.entries(STATE_NAME_TO_ABBR).map(([name, abbr]) => [abbr, name]),
);

const SORT_ALIAS_MAP = {
  homesforyou: 'homesForYou',
  default: 'homesForYou',
  recommended: 'homesForYou',
  pricelowhigh: 'priceLowHigh',
  lowtohigh: 'priceLowHigh',
  lowestprice: 'priceLowHigh',
  priceasc: 'priceLowHigh',
  pricehighlow: 'priceHighLow',
  hightolow: 'priceHighLow',
  highestprice: 'priceHighLow',
  pricedesc: 'priceHighLow',
  newest: 'newest',
  recent: 'newest',
  recentlyadded: 'newest',
  bedshighlow: 'bedsHighLow',
  mostbeds: 'bedsHighLow',
  bathshighlow: 'bathsHighLow',
  mostbaths: 'bathsHighLow',
  sqfthighlow: 'sqftHighLow',
  largest: 'sqftHighLow',
};

const normalizeSortOrderValue = (value) => {
  if (!value) {
    return null;
  }
  const raw = String(value).trim();
  if (!raw) {
    return null;
  }
  const lower = raw.toLowerCase();
  if (SORT_ALIAS_MAP[raw]) {
    return SORT_ALIAS_MAP[raw];
  }
  const compact = raw.replace(/[^a-zA-Z]/g, '').toLowerCase();
  if (!compact) {
    return null;
  }
  const includesAll = (source, ...terms) => terms.every((term) => source.includes(term));

  if (lower.includes('price')) {
    if (
      includesAll(lower, 'low', 'high') &&
      (lower.includes('low to high') || lower.indexOf('low') < lower.lastIndexOf('high') || lower.includes('ascending') ||
        lower.includes('asc') || lower.includes('lowest'))
    ) {
      return 'priceLowHigh';
    }
    if (
      includesAll(lower, 'high', 'low') &&
      (lower.includes('high to low') || lower.indexOf('high') < lower.lastIndexOf('low') || lower.includes('descending') ||
        lower.includes('desc') || lower.includes('highest'))
    ) {
      return 'priceHighLow';
    }
  }

  if (lower.includes('bedroom') || lower.includes('bed ' ) || compact.includes('bed')) {
    return 'bedsHighLow';
  }

  if (lower.includes('bathroom') || lower.includes('bath ') || compact.includes('bath')) {
    return 'bathsHighLow';
  }

  if (lower.includes('newest') || lower.includes('recent') || lower.includes('latest')) {
    return 'newest';
  }

  if (
    lower.includes('sqft') ||
    lower.includes('sq.ft') ||
    lower.includes('sq ft') ||
    lower.includes('sq-feet') ||
    lower.includes('sqfeet') ||
    lower.includes('squarefoot') ||
    lower.includes('squarefeet') ||
    lower.includes('squarefeets') ||
    lower.includes('squarefootage') ||
    lower.includes('squarefit') ||
    compact.includes('sqft') ||
    compact.includes('sqft') ||
    compact.includes('sqfeet') ||
    compact.includes('squarefoot') ||
    compact.includes('squarefeet') ||
    compact.includes('squarefeets') ||
    compact.includes('squarefootage') ||
    compact.includes('squarefit')
  ) {
    return 'sqftHighLow';
  }
  return SORT_ALIAS_MAP[compact] ?? null;
};

const ASSISTANT_PAYLOAD_KEYS = ['data', 'payload', 'response', 'result', 'body', 'args'];

const extractAssistantPayload = (value, depth = 0) => {
  if (value == null || depth > 6) {
    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractAssistantPayload(parsed, depth + 1);
      } catch (error) {
        console.warn('[Assistant payload] failed to parse JSON string', error);
      }
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 1) {
      return extractAssistantPayload(value[0], depth + 1);
    }
    return value;
  }

  if (typeof value !== 'object') {
    return value;
  }

  for (const key of ASSISTANT_PAYLOAD_KEYS) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const next = extractAssistantPayload(value[key], depth + 1);
      if (next !== undefined) {
        return next;
      }
    }
  }

  return value;
};

const findValueInPayload = (value, keys, depth = 0) => {
  if (value == null || depth > 6) {
    return undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const result = findValueInPayload(item, keys, depth + 1);
      if (result !== undefined) {
        return result;
      }
    }
    return undefined;
  }

  if (typeof value !== 'object') {
    return undefined;
  }

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      const candidate = value[key];
      if (candidate !== undefined) {
        return candidate;
      }
    }
  }

  for (const nestedValue of Object.values(value)) {
    const result = findValueInPayload(nestedValue, keys, depth + 1);
    if (result !== undefined) {
      return result;
    }
  }

  return undefined;
};

const COMETCHAT_ASSISTANT_UID = (import.meta.env.VITE_COMETCHAT_ASSISTANT_UID ?? '').trim();

const HAS_COMETCHAT_CONFIG = Boolean(
  (import.meta.env.VITE_COMETCHAT_APP_ID ?? '').trim() &&
    (import.meta.env.VITE_COMETCHAT_REGION ?? '').trim() &&
    (import.meta.env.VITE_COMETCHAT_AUTH_KEY ?? '').trim() &&
    (import.meta.env.VITE_COMETCHAT_UID ?? '').trim() &&
    COMETCHAT_ASSISTANT_UID,
);

export default function App() {
  const {
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
    resolveListingFromText,
  } = useListingsManager(listingsData, defaultFilters, {
    stateNameToAbbr: STATE_NAME_TO_ABBR,
    stateAbbrToName: STATE_ABBR_TO_NAME,
    defaultHomeTypes: HOME_TYPE_DEFAULT_SELECTION,
    normalizeHomeType,
  });
  const [activeListing, setActiveListing] = useState(null);
  const [chatListingContext, setChatListingContext] = useState(null);
  const [isFiltering, setIsFiltering] = useState(false);
  const assistantUid = COMETCHAT_ASSISTANT_UID;
  const hasChatConfig = HAS_COMETCHAT_CONFIG;

  const closeChatRef = useRef(() => {});
  const isChatOpenRef = useRef(false);

  const priceFormatter = useMemo(
    () =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 0,
      }),
    [],
  );

  useEffect(() => {
    if (!isFiltering) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsFiltering(false);
    }, 250);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [isFiltering, sortedListings]);


  const handleFiltersChange = (nextFilters) => {
    setIsFiltering(true);
    setFilters(nextFilters);
  };

  const handleSortChange = (nextSortOrder) => {
    if (nextSortOrder === sortOrder) {
      return;
    }
    setIsFiltering(true);
    setSortOrder(nextSortOrder);
  };

  const buildListingFromTool = useCallback(
    (item) => {
      if (!item) {
        return null;
      }

      const rawId = item.zpid ?? item.id;
      if (!rawId) {
        return null;
      }

      const zpid = String(rawId);
      const numericPrice = [item.price, item.priceRaw]
        .map((value) => (typeof value === 'number' && Number.isFinite(value) ? value : null))
        .find((value) => value != null);

      const priceLabel = (() => {
        if (typeof item.priceDisplay === 'string' && item.priceDisplay.trim()) {
          return item.priceDisplay.trim();
        }
        if (numericPrice != null) {
          return priceFormatter.format(numericPrice);
        }
        return '$—';
      })();

      return {
        zpid,
        displayAddress:
          (typeof item.address === 'string' && item.address) ||
          (typeof item.name === 'string' && item.name) ||
          (typeof item.detailUrl === 'string' && item.detailUrl) ||
          'Address unavailable',
        name: typeof item.name === 'string' ? item.name : null,
        price: priceLabel,
        priceRaw: numericPrice ?? null,
        beds: Number.isFinite(item.beds) ? item.beds : null,
        baths: Number.isFinite(item.baths) ? item.baths : null,
        livingArea: Number.isFinite(item.area) ? item.area : null,
        badge: item.badge ?? null,
        image: item.image ?? null,
        images: Array.isArray(item.images) ? item.images : undefined,
        detailUrl: item.detailUrl ?? null,
        homeType: item.statusText ?? null,
        openHouse: item.openHouse ?? null,
        latitude: Number.isFinite(item.latitude) ? item.latitude : null,
        longitude: Number.isFinite(item.longitude) ? item.longitude : null,
      };
    },
    [priceFormatter],
  );

  const handleAgentSearchResult = useCallback(
    (payload) => {
      if (!payload) {
        return;
      }

      const data = extractAssistantPayload(payload);
      if (!data || typeof data !== 'object') {
        console.warn('[CometChatAIAssistantTools] Missing search payload data');
        return;
      }

      console.log('[CometChatAIAssistantTools] zillow-property-search payload:', data);

      const listingArray = Array.isArray(data.listings) ? data.listings : [];
      const orderedIds = listingArray
        .map((item) => {
          const rawId = item?.zpid ?? item?.id;
          return rawId ? String(rawId) : '';
        })
        .filter(Boolean);

      const listingLookup = new Map(
        allListings.map((listing) => [String(listing?.zpid ?? ''), listing]),
      );

      const fallbackLookup = new Map(
        listingArray
          .map((item) => {
            const fallback = buildListingFromTool(item);
            return fallback ? [fallback.zpid, fallback] : null;
          })
          .filter(Boolean),
      );

      let workingListings = allListings;

      if (fallbackLookup.size) {
        fallbackLookup.forEach((value, key) => {
          const existing = listingLookup.get(key);
          const mergedValue = existing ? { ...existing, ...value } : value;
          listingLookup.set(key, mergedValue);
        });

        const mergedArray = Array.from(listingLookup.values());
        workingListings = mergedArray;
        setAllListings(mergedArray);
        setListings(mergedArray);
      } else {
        setListings(workingListings);
      }

      const nextListings = (() => {
        if (orderedIds.length) {
          return orderedIds
            .map((id) => listingLookup.get(id) ?? fallbackLookup.get(id) ?? null)
            .filter(Boolean);
        }
        if (fallbackLookup.size) {
          return Array.from(fallbackLookup.values());
        }
        return [];
      })();

      const appliedFilters = data?.appliedFilters ?? {};
      const coercePrice = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim()) {
          const numeric = Number(value.replace(/[^0-9.]/g, ''));
          return Number.isFinite(numeric) ? numeric : null;
        }
        return null;
      };

      const coerceCount = (value) => {
        if (typeof value === 'number' && Number.isFinite(value)) {
          return value;
        }
        if (typeof value === 'string' && value.trim()) {
          const numeric = Number(value.replace(/[^0-9.]/g, ''));
          return Number.isFinite(numeric) ? numeric : null;
        }
        return null;
      };

      const rawLocationCandidate =
        (typeof data.location === 'string' ? data.location : null) ??
        findValueInPayload(data, ['location', 'query', 'searchTerm']) ??
        findValueInPayload(payload, ['location', 'query', 'searchTerm']);

      const rawLocationLabel = typeof rawLocationCandidate === 'string' ? rawLocationCandidate.trim() : '';
      const locationLabel =
        rawLocationLabel && /all sample listings/i.test(rawLocationLabel)
          ? ''
          : rawLocationLabel;

      const incomingMinPrice =
        coercePrice(findValueInPayload(data, ['minPrice', 'priceMin', 'minimum'])) ??
        coercePrice(findValueInPayload(payload, ['minPrice', 'priceMin', 'minimum']));
      const incomingMaxPrice =
        coercePrice(findValueInPayload(data, ['maxPrice', 'priceMax', 'maximum'])) ??
        coercePrice(findValueInPayload(payload, ['maxPrice', 'priceMax', 'maximum']));

      const appliedMinPrice = coercePrice(appliedFilters.minPrice);
      const appliedMaxPrice = coercePrice(appliedFilters.maxPrice);

      const resolvedMinPrice =
        appliedMinPrice ?? (incomingMinPrice !== null ? incomingMinPrice : null);
      const resolvedMaxPrice =
        appliedMaxPrice ?? (incomingMaxPrice !== null ? incomingMaxPrice : null);

      const appliedBeds = coerceCount(
        appliedFilters.minBeds ?? appliedFilters.beds ?? appliedFilters.bedsMin,
      );
      const appliedBedsMax = coerceCount(
        appliedFilters.maxBeds ?? appliedFilters.bedsMax ?? appliedFilters.maxBedrooms,
      );
      const appliedBaths = coerceCount(
        appliedFilters.minBaths ?? appliedFilters.baths ?? appliedFilters.bathsMin,
      );
      const appliedBathsMax = coerceCount(
        appliedFilters.maxBaths ?? appliedFilters.bathsMax ?? appliedFilters.maxBathrooms,
      );
      const appliedSqftMax = coerceCount(
        appliedFilters.maxSqft ??
          appliedFilters.sqftMax ??
          appliedFilters.maxSquareFeet ??
          appliedFilters.maxSquareFootage ??
          appliedFilters.squareFootageMax,
      );

      const incomingBeds =
        coerceCount(findValueInPayload(data, ['bedsMin', 'minBeds', 'beds', 'bedrooms'])) ??
        coerceCount(findValueInPayload(payload, ['bedsMin', 'minBeds', 'beds', 'bedrooms']));
      const incomingBedsMax =
        coerceCount(findValueInPayload(data, ['bedsMax', 'maxBeds', 'maxBedrooms'])) ??
        coerceCount(findValueInPayload(payload, ['bedsMax', 'maxBeds', 'maxBedrooms']));
      const incomingBaths =
        coerceCount(findValueInPayload(data, ['bathsMin', 'minBaths', 'baths', 'bathrooms'])) ??
        coerceCount(findValueInPayload(payload, ['bathsMin', 'minBaths', 'baths', 'bathrooms']));
      const incomingBathsMax =
        coerceCount(findValueInPayload(data, ['bathsMax', 'maxBaths', 'maxBathrooms'])) ??
        coerceCount(findValueInPayload(payload, ['bathsMax', 'maxBaths', 'maxBathrooms']));
      const incomingSqftMax =
        coerceCount(
          findValueInPayload(data, ['sqftMax', 'maxSqft', 'squareFootageMax', 'maxSquareFeet']),
        ) ??
        coerceCount(
          findValueInPayload(payload, ['sqftMax', 'maxSqft', 'squareFootageMax', 'maxSquareFeet']),
        );

      const resolvedBeds = appliedBeds ?? (incomingBeds != null ? incomingBeds : null);
      const resolvedBedsMax =
        appliedBedsMax ?? (incomingBedsMax != null ? incomingBedsMax : null);
      const resolvedBaths = appliedBaths ?? (incomingBaths != null ? incomingBaths : null);
      const resolvedBathsMax =
        appliedBathsMax ?? (incomingBathsMax != null ? incomingBathsMax : null);
      const resolvedSqftMax =
        appliedSqftMax ?? (incomingSqftMax != null ? incomingSqftMax : null);

      const rawSortOrder =
        appliedFilters.sortOrder ??
        findValueInPayload(data, ['sortOrder', 'sort']) ??
        findValueInPayload(payload, ['sortOrder', 'sort']);
      const resolvedSortOrder = normalizeSortOrderValue(rawSortOrder);

      const isResetRequest =
        !locationLabel &&
        resolvedMinPrice == null &&
        resolvedMaxPrice == null &&
        resolvedBeds == null &&
        resolvedBedsMax == null &&
        resolvedBaths == null &&
        resolvedBathsMax == null &&
        resolvedSqftMax == null &&
        !resolvedSortOrder;

      const nextPriceMin = isResetRequest
        ? defaultFilters.priceMin
        : resolvedMinPrice !== null
          ? resolvedMinPrice
          : filters.priceMin;
      const nextPriceMax = isResetRequest
        ? defaultFilters.priceMax
        : resolvedMaxPrice !== null
          ? resolvedMaxPrice
          : filters.priceMax;
      const nextBedsMin = isResetRequest
        ? defaultFilters.bedsMin
        : resolvedBeds !== null
          ? resolvedBeds
          : filters.bedsMin;
      const nextBedsMax = isResetRequest
        ? defaultFilters.bedsMax
        : resolvedBedsMax !== null
          ? resolvedBedsMax
          : filters.bedsMax;
      const nextBathsMin = isResetRequest
        ? defaultFilters.bathsMin
        : resolvedBaths !== null
          ? resolvedBaths
          : filters.bathsMin;
      const nextBathsMax = isResetRequest
        ? defaultFilters.bathsMax
        : resolvedBathsMax !== null
          ? resolvedBathsMax
          : filters.bathsMax;
      const nextSqftMax = isResetRequest
        ? defaultFilters.sqftMax
        : resolvedSqftMax !== null
          ? resolvedSqftMax
          : filters.sqftMax;

      setIsFiltering(true);

      setFilters((prev) => {
        if (isResetRequest) {
          return { ...defaultFilters };
        }

        const next = { ...prev };

        next.priceMin = nextPriceMin;
        next.priceMax = nextPriceMax;
        next.bedsMin = nextBedsMin;
        next.bedsMax = nextBedsMax;
        next.bathsMin = nextBathsMin;
        next.bathsMax = nextBathsMax;
        next.sqftMax = nextSqftMax;
        if (resolvedBeds !== null) {
          next.exactBeds = false;
        }
        if (resolvedBedsMax !== null) {
          next.exactBeds = false;
        }
        if (locationLabel) {
          next.query = locationLabel;
        }
        return next;
      });

      setActiveListing(null);

      if (resolvedSortOrder && resolvedSortOrder !== sortOrder) {
        setSortOrder(resolvedSortOrder);
      } else if (isResetRequest && sortOrder !== 'homesForYou') {
        setSortOrder('homesForYou');
      }

      const nextSortOrder = resolvedSortOrder ?? (isResetRequest ? 'homesForYou' : sortOrder);
      const nextLocationLabel = isResetRequest ? '' : locationLabel || filters.query || '';

      setSearchSummary({
        totalAvailable:
          typeof data.totalAvailable === 'number' && data.totalAvailable >= 0
            ? data.totalAvailable
            : nextListings.length,
        returnedCount: nextListings.length,
        location: nextLocationLabel,
        appliedFilters: {
          minPrice: nextPriceMin,
          maxPrice: nextPriceMax,
          bedsMin: nextBedsMin,
          bedsMax: nextBedsMax,
          bathsMin: nextBathsMin,
          bathsMax: nextBathsMax,
          sqftMax: nextSqftMax,
          sortOrder: nextSortOrder,
        },
        sortOrder: nextSortOrder,
      });
    },
    [allListings, buildListingFromTool, filters, sortOrder],
  );

  const handleListingSelect = (listing) => {
    if (isChatOpenRef.current) {
      closeChatRef.current();
    }

    setActiveListing(listing);
    if (listing) {
      setChatListingContext(listing);
    }
  };

  const handleModalClose = () => {
    setActiveListing(null);
    setChatListingContext(null);
  };

  const handleAgentListingDetailsResult = useCallback(
    (payload) => {
      const data = extractAssistantPayload(payload);
      if (!data || typeof data !== 'object') {
        console.warn('[CometChatAIAssistantTools] Missing listing payload data');
        return;
      }

      const zpidCandidate =
        data.zpid ??
        findValueInPayload(data, ['zpid']) ??
        findValueInPayload(payload, ['zpid']);

      const detailUrlCandidate =
        data.detailUrl ??
        findValueInPayload(data, ['detailUrl', 'url']) ??
        findValueInPayload(payload, ['detailUrl', 'url']);

      if (!zpidCandidate && !detailUrlCandidate) {
        console.warn('[CometChatAIAssistantTools] Listing details payload missing reference');
      }
    },
    [],
  );

  const assistantToolHandlers = useMemo(
    () => ({
      'zillow-property-search': handleAgentSearchResult,
      zillowPropertySearchTool: handleAgentSearchResult,
      'zillow-listing-details': handleAgentListingDetailsResult,
      zillowListingDetailsTool: handleAgentListingDetailsResult,
    }),
    [handleAgentListingDetailsResult, handleAgentSearchResult],
  );

  const {
    assistantUser,
    chatReady,
    chatLoading,
    chatError,
    setChatError,
    assistantTools,
    isChatOpen,
    closeChat,
    toggleChat,
  } = useAssistantChat({ hasChatConfig, assistantUid, toolHandlers: assistantToolHandlers });

  closeChatRef.current = closeChat;
  isChatOpenRef.current = isChatOpen;

  const handleAskAiClick = () => {
    toggleChat();
  };

  const handleChatClose = () => {
    closeChat();
  };

  const handleChatListingResolved = useCallback(
    (listing) => {
      if (!listing) {
        return;
      }

      setChatListingContext(listing);
    },
    [],
  );

  return (
    <div className="app">
      <TopBar />
      {chatError && (
        <div className="chat-banner" role="status">
          {chatError}
        </div>
      )}
      <section className="search-toolbar-shell">
        <SearchBar filters={filters} onFiltersChange={handleFiltersChange} />
      </section>
      <main className="layout">
        <MapPanel
          total={filteredListings.length}
          overall={searchSummary?.totalAvailable ?? listings.length}
          onAskAi={handleAskAiClick}
          onCloseChat={handleChatClose}
          showChat={isChatOpen}
          chatError={chatError}
          chatReady={chatReady}
          assistantUser={assistantUser}
          chatLoading={chatLoading}
          activeFilters={filters}
          activeSortOrder={sortOrder}
          askDisabled={!chatReady || chatLoading || !assistantUser}
          assistantTools={assistantTools}
          resolveListingFromText={resolveListingFromText}
          listingContext={chatListingContext}
          onListingContextChange={setChatListingContext}
          //onListingResolved={handleChatListingResolved}
        />
        <div className="results-panel">
          <ListingGrid
            listings={sortedListings}
            total={filteredListings.length}
            sortOrder={sortOrder}
            sortOptions={SORT_OPTIONS}
            onSortChange={handleSortChange}
            onSelectListing={handleListingSelect}
            isLoading={isFiltering}
          />
        </div>
      </main>
      {activeListing ? (
        <ListingModal
          listing={activeListing}
          onClose={handleModalClose}
          assistantUser={assistantUser}
          chatReady={chatReady}
          chatLoading={chatLoading}
          chatError={chatError}
          assistantTools={assistantTools}
          onListingContextChange={setChatListingContext}
        />
      ) : null}
    </div>
  );
}
