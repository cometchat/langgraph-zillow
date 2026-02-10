import { useCallback, useEffect, useRef } from 'react';
import { CometChat } from '@cometchat/chat-sdk-javascript';
import { CometChatAIAssistantChat, CometChatUIKit } from '@cometchat/chat-uikit-react';
import { buildFilterMetadataPayload } from '../utils/filterMetadata.js';
import { buildListingMetadataPayload } from '../utils/listingMetadata.js';

const parsePriceValue = (rawValue) => {
  if (!rawValue) {
    return null;
  }

  const normalized = String(rawValue).replace(/[$,\s]/g, '').trim();
  if (!normalized) {
    return null;
  }

  let multiplier = 1;
  const lastChar = normalized.slice(-1).toLowerCase();
  let numericPortion = normalized;

  if (lastChar === 'k') {
    multiplier = 1_000;
    numericPortion = normalized.slice(0, -1);
  } else if (lastChar === 'm') {
    multiplier = 1_000_000;
    numericPortion = normalized.slice(0, -1);
  }

  const value = Number(numericPortion);
  if (!Number.isFinite(value)) {
    return null;
  }

  return value * multiplier;
};

const extractPriceDirective = (text) => {
  if (!text) {
    return {};
  }

  const lower = text.toLowerCase();

  const betweenMatch = lower.match(
    /between\s+([$\d.,\s]*[km]??)\s+(?:and|to)\s+([$\d.,\s]*[km]?)/,
  );
  if (betweenMatch) {
    const minValue = parsePriceValue(betweenMatch[1]);
    const maxValue = parsePriceValue(betweenMatch[2]);
    return {
      priceMin: Number.isFinite(minValue) ? minValue : undefined,
      priceMax: Number.isFinite(maxValue) ? maxValue : undefined,
      summaryParts: [
        minValue != null ? `Min price: ${minValue}` : null,
        maxValue != null ? `Max price: ${maxValue}` : null,
      ].filter(Boolean),
    };
  }

  const maxMatch = lower.match(
    /(under|below|less than|up to|upto|maximum|max)\s+([$\d.,\s]*[km]?)/,
  );
  if (maxMatch) {
    const value = parsePriceValue(maxMatch[2]);
    return {
      priceMax: Number.isFinite(value) ? value : undefined,
      summaryParts: [value != null ? `Max price: ${value}` : null].filter(Boolean),
    };
  }

  const minMatch = lower.match(
    /(over|above|greater than|more than|at least|min|minimum)\s+([$\d.,\s]*[km]?)/,
  );
  if (minMatch) {
    const value = parsePriceValue(minMatch[2]);
    return {
      priceMin: Number.isFinite(value) ? value : undefined,
      priceMax: null,
      summaryParts: [value != null ? `Min price: ${value}` : null].filter(Boolean),
    };
  }

  return {};
};

const mapImage = new URL('../assets/images/map-placeholder.png', import.meta.url).href;
const chatFabIcon = new URL('../assets/images/zillow_logo.png', import.meta.url).href;

export default function MapPanel({
  total,
  overall,
  onAskAi,
  onCloseChat,
  showChat = false,
  askDisabled = false,
  chatError,
  chatReady,
  assistantUser,
  chatLoading = false,
  assistantTools,
  activeFilters,
  activeSortOrder,
  onRequestListing,
  resolveListingFromText,
  onListingResolved,
  listingContext,
  onListingContextChange,
}) {
  const totalFormatted = total.toLocaleString();
  const overallFormatted = (overall ?? total).toLocaleString();
  const chatBodyRef = useRef(null);

  const handleAskClick = () => {
    if (showChat) {
      onCloseChat?.();
    } else {
      onAskAi?.();
    }
  };

  const handleChatLinkClick = useCallback(
    (event) => {
      if (!onRequestListing) {
        return;
      }

      const anchor = event.target?.closest?.('a');
      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute('href') || '';
      const dataZpid = anchor.getAttribute('data-zpid');

      const extractZpid = (value) => {
        if (!value) {
          return null;
        }
        const directMatch = String(value).match(/(\d+)_zpid/i);
        if (directMatch) {
          return directMatch[1];
        }
        const queryMatch = String(value).match(/[?&]zpid=(\d+)/i);
        if (queryMatch) {
          return queryMatch[1];
        }
        if (/^\d+$/.test(String(value).trim())) {
          return String(value).trim();
        }
        return null;
      };

      const zpid = extractZpid(dataZpid) ?? extractZpid(href);
      if (!zpid) {
        return;
      }

      event.preventDefault();
      onRequestListing(zpid);
    },
    [onRequestListing],
  );

  useEffect(() => {
    if (!showChat || !chatBodyRef.current || !onRequestListing) {
      return undefined;
    }

    const node = chatBodyRef.current;
    node.addEventListener('click', handleChatLinkClick);

    return () => {
      node.removeEventListener('click', handleChatLinkClick);
    };
  }, [showChat, handleChatLinkClick, onRequestListing]);

  return (
    <section className="map-surface" aria-label="Map results">
      <div className="map-toolbar">
        <div className="map-counter">{`${totalFormatted} of ${overallFormatted} homes`}</div>
      </div>
      <img className="map-image" src={mapImage} alt="Map of listings" />
      {onAskAi ? (
        <div className="map-ask-wrapper">
          <button
            type="button"
            className={`map-ask ${showChat ? 'map-ask--active' : ''}`}
            onClick={handleAskClick}
            disabled={askDisabled && !showChat}
            aria-expanded={showChat}
            aria-controls="map-chat-panel"
          >
            <span className="sr-only">{showChat ? 'Hide AI assistant' : 'Chat with AI assistant'}</span>
            <span className="map-ask__icon" aria-hidden="true">
              {showChat ? (
                <svg className="map-ask__chevron" width="18" height="12" viewBox="0 0 18 12" xmlns="http://www.w3.org/2000/svg">
                  <path d="M2.12 0L9 6.879 15.879 0 18 2.121 9 11.121 0 2.121 2.12 0Z" fill="currentColor" />
                </svg>
              ) : (
                <img src={chatFabIcon} alt="" />
              )}
            </span>
          </button>
        </div>
      ) : null}
      {onAskAi ? (
        <p className="map-disclaimer">For demonstration purposes only. Not affiliated with Zillow.</p>
      ) : null}
      {showChat ? (
        <div
          id="map-chat-panel"
          className="map-chat"
          role="dialog"
          aria-label="Ask AI assistant"
        >
          {/* <button
            type="button"
            className="map-chat__close"
            onClick={() => onCloseChat?.()}
            aria-label="Close chat"
          >
            ×
          </button> */}
          <div className="map-chat__body" ref={chatBodyRef}>
            {chatError && (!chatReady || !assistantUser) ? (
              <p className="map-chat__status">{chatError}</p>
            ) : chatReady && assistantUser ? (
              <CometChatAIAssistantChat
                user={assistantUser}
                showCloseButton={true}
                onCloseButtonClicked={() => onCloseChat?.()}
                aiAssistantTools={assistantTools}
                onSendButtonClick={(message) => {
                  const text =
                    (typeof message?.getText === 'function' && message.getText()) ??
                    message?.text ??
                    message?.data?.text ??
                    '';

                  const trimmed = String(text ?? '').trim();
                  if (!trimmed) {
                    return;
                  }

                  const resolvedListing = resolveListingFromText?.(trimmed) ?? null;
                  const listing = resolvedListing ?? listingContext ?? null;

                  const currencyFormatter = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    maximumFractionDigits: 0,
                  });

                  const priceDirective = extractPriceDirective(trimmed);
                  const currentMin =
                    typeof activeFilters?.priceMin === 'number' && Number.isFinite(activeFilters.priceMin)
                      ? activeFilters.priceMin
                      : null;
                  const currentMax =
                    typeof activeFilters?.priceMax === 'number' && Number.isFinite(activeFilters.priceMax)
                      ? activeFilters.priceMax
                      : null;

                  let nextMin = currentMin;
                  let nextMax = currentMax;

                  if (priceDirective.priceMin !== undefined) {
                    nextMin =
                      typeof priceDirective.priceMin === 'number' ? priceDirective.priceMin : null;
                  }
                  if (priceDirective.priceMax !== undefined) {
                    nextMax =
                      typeof priceDirective.priceMax === 'number' ? priceDirective.priceMax : null;
                  }

                  if (nextMin != null && nextMax != null && nextMin > nextMax) {
                    nextMax = null;
                  }

                  const overrides = {};
                  let overridesApplied = false;
                  if (nextMin !== currentMin) {
                    overrides.priceMin = nextMin;
                    overridesApplied = true;
                  }
                  if (nextMax !== currentMax) {
                    overrides.priceMax = nextMax;
                    overridesApplied = true;
                  }

                  const summaryParts = [];
                  if (activeFilters?.query) {
                    summaryParts.push(`Location: ${activeFilters.query}`);
                  }
                  if (nextMin != null) {
                    summaryParts.push(`Min price: ${currencyFormatter.format(nextMin)}`);
                  }
                  if (nextMax != null) {
                    summaryParts.push(`Max price: ${currencyFormatter.format(nextMax)}`);
                  }
                  const formatRange = (minValue, maxValue, label) => {
                    if (minValue && maxValue != null) {
                      if (minValue === maxValue) {
                        return `${label}: ${minValue}`;
                      }
                      return `${label}: ${minValue}-${maxValue}`;
                    }
                    if (maxValue != null) {
                      return `${label}: ≤${maxValue}`;
                    }
                    if (minValue) {
                      return `${label}: ${minValue}+`;
                    }
                    return null;
                  };

                  const bedSummary = formatRange(
                    activeFilters?.bedsMin,
                    activeFilters?.bedsMax,
                    'Beds',
                  );
                  if (bedSummary) {
                    summaryParts.push(bedSummary);
                  }
                  const bathSummary = formatRange(
                    activeFilters?.bathsMin,
                    activeFilters?.bathsMax,
                    'Baths',
                  );
                  if (bathSummary) {
                    summaryParts.push(bathSummary);
                  }
                  const sqftSummary = formatRange(
                    null,
                    activeFilters?.sqftMax,
                    'Sqft',
                  );
                  if (sqftSummary) {
                    summaryParts.push(sqftSummary);
                  }

                  const filterSummary = summaryParts.length
                    ? `Current filters → ${summaryParts.join(' | ')}`
                    : '';

                  const metadata = { messageSource: 'react-map-panel' };

                  const listingMetadata = listing ? buildListingMetadataPayload(listing) : null;

                  const zpidValue = String(
                    listing?.zpid ??
                      listingMetadata?.zpid ??
                      listingMetadata?.listing_zpid ??
                      listingMetadata?.zipid ??
                      '',
                  ).trim();
                  if (zpidValue) {
                    metadata.zpid = zpidValue;
                    metadata.listing_zpid = zpidValue;
                    metadata.context = { listing: { zpid: zpidValue } };
                  }

                  const detailUrlValue =
                    listing?.detailUrl ??
                    listingMetadata?.detailUrl ??
                    listingMetadata?.listing_detail_url ??
                    null;
                  if (detailUrlValue) {
                    metadata.detailUrl = detailUrlValue;
                    metadata.listing_detail_url = detailUrlValue;
                  }

                  const addressValue =
                    listing?.displayAddress ??
                    listingMetadata?.listing_address ??
                    listingMetadata?.address ??
                    null;
                  if (addressValue) {
                    metadata.listingAddress = addressValue;
                    metadata.displayAddress = addressValue;
                    metadata.listing_address = addressValue;
                  }

                  const priceValue = listing?.price ?? listingMetadata?.listing_price ?? null;
                  if (priceValue) {
                    metadata.listing_price = priceValue;
                  }

                  const baseFilterMetadata = buildFilterMetadataPayload(activeFilters, activeSortOrder);
                  const filtersPayload = baseFilterMetadata ? { ...baseFilterMetadata } : {};

                  if (nextMin != null) {
                    filtersPayload.priceMin = nextMin;
                    filtersPayload.minPrice = nextMin;
                  } else {
                    delete filtersPayload.priceMin;
                    delete filtersPayload.minPrice;
                  }

                  if (nextMax != null) {
                    filtersPayload.priceMax = nextMax;
                    filtersPayload.maxPrice = nextMax;
                  } else {
                    delete filtersPayload.priceMax;
                    delete filtersPayload.maxPrice;
                  }

                  if (activeFilters?.bedsMin) {
                    filtersPayload.bedsMin = activeFilters.bedsMin;
                  } else {
                    delete filtersPayload.bedsMin;
                  }

                  if (activeFilters?.bedsMax != null) {
                    filtersPayload.bedsMax = activeFilters.bedsMax;
                  } else {
                    delete filtersPayload.bedsMax;
                  }

                  if (activeFilters?.bathsMin) {
                    filtersPayload.bathsMin = activeFilters.bathsMin;
                  } else {
                    delete filtersPayload.bathsMin;
                  }

                  if (activeFilters?.bathsMax != null) {
                    filtersPayload.bathsMax = activeFilters.bathsMax;
                  } else {
                    delete filtersPayload.bathsMax;
                  }

                  if (activeFilters?.sqftMax != null) {
                    filtersPayload.sqftMax = activeFilters.sqftMax;
                    filtersPayload.maxSqft = activeFilters.sqftMax;
                    filtersPayload.squareFootageMax = activeFilters.sqftMax;
                  } else {
                    delete filtersPayload.sqftMax;
                    delete filtersPayload.maxSqft;
                    delete filtersPayload.squareFootageMax;
                  }

                  if (overridesApplied) {
                    filtersPayload.source = 'react-ui+message';
                  }

                  const hasFilterMetadata = Object.values(filtersPayload).some((value) => {
                    if (Array.isArray(value)) {
                      return value.length > 0;
                    }
                    return value != null && value !== '' && value !== false;
                  });

                  if (hasFilterMetadata) {
                    metadata.filters = filtersPayload;
                    metadata.activeFilters = { ...filtersPayload };
                    metadata.uiFilters = { ...filtersPayload };
                  }

                  if (overridesApplied) {
                    const normalizedOverrides = {};
                    if (Object.prototype.hasOwnProperty.call(overrides, 'priceMin')) {
                      normalizedOverrides.priceMin = overrides.priceMin ?? null;
                    }
                    if (Object.prototype.hasOwnProperty.call(overrides, 'priceMax')) {
                      normalizedOverrides.priceMax = overrides.priceMax ?? null;
                    }
                    metadata.filterOverrides = normalizedOverrides;
                  }

                  if (filterSummary) {
                    metadata.filterSummary = filterSummary;
                  }

                  // const prefixedText = metadata.zpid ? `[${metadata.zpid}] ${trimmed}` : trimmed;

                  // if (message instanceof CometChat.TextMessage) {
                  //   if (typeof message.setText === 'function') {
                  //     message.setText(prefixedText);
                  //   } else {
                  //     message.text = prefixedText;
                  //   }
                    message.setMetadata(metadata);
                    if (resolvedListing) {
                      onListingContextChange?.(resolvedListing);
                      onListingResolved?.(resolvedListing);
                    } else if (listing) {
                      onListingContextChange?.(listing);
                    }
                    CometChatUIKit.sendTextMessage(message);
                    return;
                  // }

                  const textMessage = new CometChat.TextMessage(
                    assistantUser?.uid,
                    trimmed,
                    // prefixedText,
                    CometChat.RECEIVER_TYPE.USER,
                  );
                  textMessage.setMetadata(metadata);

                  if (resolvedListing) {
                    onListingContextChange?.(resolvedListing);
                    onListingResolved?.(resolvedListing);
                  } else if (listing) {
                    onListingContextChange?.(listing);
                  }

                  CometChatUIKit.sendTextMessage(textMessage);
                }}
              />
            ) : (
              <p className="map-chat__status">{chatLoading ? 'Connecting to CometChat…' : 'Preparing chat…'}</p>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}
