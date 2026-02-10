const toSlug = (value) => {
  if (value == null) {
    return null;
  }

  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .trim();
};

const SLUG_STOP_WORDS = new Set([
  'http',
  'https',
  'www',
  'com',
  'www-zillow-com',
  'zillow',
  'zillow-com',
  'homedetails',
  'm',
  'app',
]);

const shouldKeepSlug = (slug) => {
  if (!slug) {
    return false;
  }

  if (SLUG_STOP_WORDS.has(slug)) {
    return false;
  }

  if (/^https-/.test(slug) || /^http-/.test(slug)) {
    return false;
  }

  return slug.length >= 3;
};

const normalizeSlugTokens = (slug) => {
  if (!slug) {
    return [];
  }

  return slug
    .split('-')
    .map((token) => token.trim())
    .filter((token) => token && !SLUG_STOP_WORDS.has(token));
};

const collectListingSlugs = (listing) => {
  if (!listing) {
    return [];
  }

  const slugs = new Set();
  const add = (value) => {
    const slug = toSlug(value);
    if (slug && shouldKeepSlug(slug)) {
      slugs.add(slug);
    }
  };

  add(listing?.detailUrl);

  if (listing?.detailUrl) {
    String(listing.detailUrl)
      .split('/')
      .filter(Boolean)
      .forEach(add);
  }

  add(listing?.displayAddress);
  add(listing?.name);

  const displayParts = String(listing?.displayAddress ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (displayParts.length) {
    add(displayParts[0]);
    add(displayParts.slice(0, 2).join(' '));
    add(displayParts.slice(0, 2).join(', '));
  }

  const addressSegments = [
    listing?.address?.streetAddress,
    listing?.address?.city,
    listing?.address?.state,
    listing?.address?.zipcode,
  ].filter(Boolean);

  add(addressSegments.join(' '));
  add(addressSegments.slice(0, 3).join(' '));
  add(addressSegments.slice(0, 2).join(' '));
  add(listing?.address?.streetAddress);
  add([listing?.address?.streetAddress, listing?.address?.city].filter(Boolean).join(' '));

  add(listing?.zpid);

  return Array.from(slugs);
};

export const buildListingContext = (listing) => {
  if (!listing) {
    return null;
  }

  const zpid = listing?.zpid ?? null;
  const name = listing?.name ?? listing?.displayAddress ?? null;
  const address = listing?.displayAddress ?? listing?.name ?? null;
  const detailUrl = listing?.detailUrl ?? null;

  if (!zpid && !detailUrl && !name) {
    return null;
  }

  return {
    zpid,
    name,
    address,
    price: listing?.price ?? null,
    detailUrl,
    detailUrlSlug: toSlug(detailUrl ?? address ?? name),
  };
};

const toNullableNumber = (value) => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const numeric = Number(value.replace(/[^0-9.\-]/g, ''));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
};

const normalizeArray = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value == null) {
    return [];
  }
  return [value];
};

const extractSchemaBlock = (listing, type) => {
  if (!listing || !Array.isArray(listing.ldjson)) {
    return null;
  }
  return (
    listing.ldjson.find((item) => {
      if (!item || typeof item !== 'object') {
        return false;
      }
      if (Array.isArray(item['@type'])) {
        return item['@type'].includes(type);
      }
      return item['@type'] === type;
    }) ?? null
  );
};

export const buildListingDetailSnapshot = (listing) => {
  if (!listing) {
    return null;
  }

  const residenceSchema = extractSchemaBlock(listing, 'SingleFamilyResidence');
  const eventSchema = extractSchemaBlock(listing, 'Event');

  const zpid = listing?.zpid != null ? String(listing.zpid) : null;
  const address = listing?.displayAddress ?? listing?.name ?? residenceSchema?.name ?? null;

  const priceLabel = listing?.price ?? null;
  const priceRaw = toNullableNumber(listing?.priceRaw);
  const beds = toNullableNumber(listing?.beds ?? residenceSchema?.numberOfRooms);
  const baths = toNullableNumber(listing?.baths);

  const livingArea = (() => {
    const fromListing = toNullableNumber(listing?.livingArea);
    if (fromListing != null) {
      return fromListing;
    }
    const raw = residenceSchema?.floorSize?.value ?? residenceSchema?.floorSize;
    return toNullableNumber(raw);
  })();

  const coordinates = {
    latitude:
      toNullableNumber(listing?.latitude) ??
      toNullableNumber(residenceSchema?.geo?.latitude) ??
      toNullableNumber(eventSchema?.location?.geo?.latitude) ??
      null,
    longitude:
      toNullableNumber(listing?.longitude) ??
      toNullableNumber(residenceSchema?.geo?.longitude) ??
      toNullableNumber(eventSchema?.location?.geo?.longitude) ??
      null,
  };

  const openHouse = listing?.openHouse ??
    (eventSchema
      ? {
          name: eventSchema.name ?? null,
          description: eventSchema.description ?? null,
          startDate: eventSchema.startDate ?? null,
          endDate: eventSchema.endDate ?? null,
        }
      : null);

  const nearbySchools = Array.isArray(listing?.nearbySchools)
    ? listing.nearbySchools
    : [];

  const climateFactors = Array.isArray(listing?.climateFactors) ? listing.climateFactors : [];
  const highlights = Array.isArray(listing?.highlights)
    ? listing.highlights
    : normalizeArray(listing?.badge).filter(Boolean);

  const summaryParts = [];
  if (address) {
    summaryParts.push(`Address: ${address}.`);
  }
  if (priceLabel) {
    const rawPricePart = priceRaw != null ? ` (raw: ${priceRaw})` : '';
    summaryParts.push(`List price: ${priceLabel}${rawPricePart}.`);
  }
  if (beds != null || baths != null) {
    const bedPart = beds != null ? `${beds} beds` : null;
    const bathPart = baths != null ? `${baths} baths` : null;
    summaryParts.push(`Bedrooms/Bathrooms: ${[bedPart, bathPart].filter(Boolean).join(', ')}.`);
  }
  if (livingArea != null) {
    summaryParts.push(`Living area: ${livingArea} sqft.`);
  }
  if (listing?.lotSize != null) {
    summaryParts.push(`Lot size: ${listing.lotSize}.`);
  }
  if (listing?.homeType) {
    summaryParts.push(`Home type: ${listing.homeType}.`);
  }
  if (listing?.badge) {
    summaryParts.push(`Badge: ${listing.badge}.`);
  }
  if (openHouse?.startDate || openHouse?.name) {
    const openParts = [openHouse?.name, openHouse?.description]
      .filter(Boolean)
      .join(' — ');
    const timing = [openHouse?.startDate, openHouse?.endDate].filter(Boolean).join(' to ');
    summaryParts.push(`Open house: ${[openParts, timing].filter(Boolean).join(' • ')}.`);
  }
  if (nearbySchools.length) {
    const schoolSummary = nearbySchools
      .map((school) => {
        if (!school || typeof school !== 'object') {
          return null;
        }
        const extra = [
          school.rating ? `Rating ${school.rating}` : null,
          school.grades ? `Grades ${school.grades}` : null,
          school.type,
          school.distance,
        ]
          .filter(Boolean)
          .join(' • ');
        return `${school.name}${extra ? ` (${extra})` : ''}`;
      })
      .filter(Boolean)
      .join('; ');
    if (schoolSummary) {
      summaryParts.push(`Nearby schools: ${schoolSummary}.`);
    }
  }
  if (highlights.length) {
    summaryParts.push(`Highlights: ${highlights.join(', ')}.`);
  }
  if (climateFactors.length) {
    const climateSummary = climateFactors
      .map((factor) => {
        if (!factor || typeof factor !== 'object') {
          return null;
        }
        const { label, value } = factor;
        if (!label && !value) {
          return null;
        }
        return `${label ?? 'Climate factor'}${value ? ` ${value}` : ''}`;
      })
      .filter(Boolean)
      .join(', ');
    if (climateSummary) {
      summaryParts.push(`Climate considerations: ${climateSummary}.`);
    }
  }
  if (listing?.description) {
    summaryParts.push(`Description: ${listing.description}`);
  }
  if (listing?.schoolNote) {
    summaryParts.push(`School note: ${listing.schoolNote}.`);
  }
  if (listing?.neighborhoodNote) {
    summaryParts.push(`Neighborhood insight: ${listing.neighborhoodNote}.`);
  }

  return {
    zpid,
    address,
    city:
      listing?.address?.city ??
      residenceSchema?.address?.addressLocality ??
      eventSchema?.location?.address?.addressLocality ??
      null,
    state:
      listing?.address?.state ??
      residenceSchema?.address?.addressRegion ??
      eventSchema?.location?.address?.addressRegion ??
      null,
    zipcode:
      listing?.address?.zipcode ??
      residenceSchema?.address?.postalCode ??
      eventSchema?.location?.address?.postalCode ??
      null,
    price: priceLabel,
    priceRaw,
    beds,
    baths,
    livingArea,
    lotSize: listing?.lotSize ?? null,
    homeType: listing?.homeType ?? residenceSchema?.['@type'] ?? null,
    badge: listing?.badge ?? null,
    description: listing?.description ?? null,
    highlights,
    climateFactors,
    nearbySchools,
    schoolNote: listing?.schoolNote ?? null,
    neighborhoodNote: listing?.neighborhoodNote ?? null,
    openHouse,
    detailUrl: listing?.detailUrl ?? residenceSchema?.url ?? null,
    coordinates,
    images: Array.isArray(listing?.images) ? listing.images : normalizeArray(listing?.image),
    summary: summaryParts.join('\n'),
  };
};

export const buildListingMetadataPayload = (listing) => {
  const context = buildListingContext(listing);
  if (!context) {
    return null;
  }

  const detailSnapshot = listing?.chatDetails ?? buildListingDetailSnapshot(listing);

  const metadata = {
    listing_zpid: context.zpid,
    listing_name: context.name,
    listing_address: context.address,
    listing_price: context.price,
    listing_detail_url: context.detailUrl,
    listing_detail_url_slug: context.detailUrlSlug,
    zpid: context.zpid,
    name: context.name,
    address: context.address,
    price: context.price,
    detailUrl: context.detailUrl,
    detail_url: context.detailUrl,
    detailUrlSlug: context.detailUrlSlug,
    context: {
      listing: context,
    },
    listingContext: context,
    listing_context: context,
    listing_data: listing ?? null,
    listingRaw: listing ?? null,
    listingLdjson: Array.isArray(listing?.ldjson) ? listing.ldjson : null,
  };

  if (detailSnapshot) {
    metadata.listing_details = detailSnapshot;
    metadata.listingDetails = detailSnapshot;
    const existingContext = metadata.context ?? {};
    const mergedListing = {
      ...(existingContext.listing ?? {}),
      ...detailSnapshot,
    };
    const enhancedContext = {
      ...existingContext,
      listing: mergedListing,
      listingDetails: detailSnapshot,
    };
    if (detailSnapshot.summary) {
      metadata.listing_summary = detailSnapshot.summary;
      metadata.summary = detailSnapshot.summary;
      enhancedContext.summary = detailSnapshot.summary;
    }
    metadata.context = enhancedContext;
  }

  return metadata;
};

export const resolveListingFromText = (text, candidates, options = {}) => {
  const { matchText } = options;

  const raw = String(text ?? '').trim();
  if (!raw || !Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  const normalized = raw.toLowerCase();
  const slug = toSlug(raw);
  const inputTokens = normalizeSlugTokens(slug);

  const directIdMatch = candidates.find((listing) => {
    const candidateId = listing?.zpid;
    if (candidateId == null) {
      return false;
    }
    return normalized.includes(String(candidateId).toLowerCase());
  });
  if (directIdMatch) {
    return directIdMatch;
  }

  const directAddressMatch = candidates.find((listing) => {
    const address = String(listing?.displayAddress ?? listing?.name ?? '').toLowerCase();
    if (!address) {
      return false;
    }

    if (normalized.includes(address) || address.includes(normalized)) {
      return true;
    }

    const addressSlug = toSlug(address);
    if (addressSlug && (slug?.includes(addressSlug) || addressSlug.includes(slug))) {
      return true;
    }

    const nameSlug = toSlug(listing?.name ?? '');
    if (nameSlug && (slug?.includes(nameSlug) || nameSlug.includes(slug))) {
      return true;
    }

    return false;
  });
  if (directAddressMatch) {
    return directAddressMatch;
  }

  if (inputTokens.length) {
    const slugMatch = candidates.find((listing) => {
      const slugs = collectListingSlugs(listing);
      return slugs.some((candidateSlug) => {
        if (!candidateSlug) {
          return false;
        }

        if (candidateSlug === slug) {
          return true;
        }

        if (slug?.includes(candidateSlug) || candidateSlug.includes(slug)) {
          return true;
        }

        const candidateTokens = normalizeSlugTokens(candidateSlug);
        if (!candidateTokens.length) {
          return false;
        }

        if (candidateTokens.length > inputTokens.length) {
          return (
            candidateTokens.slice(0, inputTokens.length).join('-') === inputTokens.join('-')
          );
        }

        for (let index = 0; index <= inputTokens.length - candidateTokens.length; index += 1) {
          const windowTokens = inputTokens.slice(index, index + candidateTokens.length);
          if (windowTokens.join('-') === candidateTokens.join('-')) {
            return true;
          }
        }

        return false;
      });
    });

    if (slugMatch) {
      return slugMatch;
    }
  }

  if (typeof matchText === 'function') {
    const fallbackMatch = candidates.find((listing) => matchText(listing, raw));
    if (fallbackMatch) {
      return fallbackMatch;
    }
  }

  return null;
};

export { toSlug, shouldKeepSlug, normalizeSlugTokens, collectListingSlugs };
