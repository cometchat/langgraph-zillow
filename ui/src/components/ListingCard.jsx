const fallbackImage = new URL('../assets/images/listing-placeholder.svg', import.meta.url).href;

function formatHomeType(homeType) {
  if (!homeType) return null;
  return homeType
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function ListingCard({ listing, onSelect }) {
  const image = listing.image || listing.images?.[0] || fallbackImage;
  const badge = listing.badge;

  const metaItems = [];
  if (Number.isFinite(listing.beds)) {
    metaItems.push({
      label: listing.beds === 1 ? 'bd' : 'bds',
      value: listing.beds,
    });
  }
  if (Number.isFinite(listing.baths)) {
    metaItems.push({
      label: listing.baths === 1 ? 'ba' : 'ba',
      value: listing.baths,
    });
  }
  if (listing.livingArea) {
    metaItems.push({
      label: 'sqft',
      value: Number(listing.livingArea).toLocaleString(),
    });
  }

  let metaStatusLabel = 'House for sale';
  if (badge && /new construction/i.test(badge)) {
    metaStatusLabel = 'New construction';
  } else if (listing.openHouse) {
    metaStatusLabel = 'Open house';
  }

  const attributionLabel = formatHomeType(listing.homeType);
  const hasMetaItems = metaItems.length > 0;

  const handleSelect = () => {
    if (typeof onSelect === 'function') {
      onSelect(listing);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleSelect();
    }
  };

  return (
    <article
      className="card"
      role="button"
      tabIndex={0}
      onClick={handleSelect}
      onKeyDown={handleKeyDown}
    >
      <div className="card__media">
        {badge && <div className="card__badge">{badge}</div>}
        <button
          className="card__save"
          type="button"
          aria-label="Save listing"
          data-demo-toast
          onClick={(event) => event.stopPropagation()}
        >
          <svg viewBox="0 0 24 24" role="presentation" aria-hidden="true">
            <path
              d="M12 20.75a.74.74 0 01-.48-.17c-4.94-4.16-6.41-5.66-7.17-6.6A4.86 4.86 0 013 10.36 5.16 5.16 0 018.32 5a4.9 4.9 0 013.68 1.64A4.9 4.9 0 0115.68 5 5.16 5.16 0 0121 10.36a4.86 4.86 0 01-1.35 3.62c-.76.94-2.23 2.44-7.17 6.6a.74.74 0 01-.48.17z"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          className="card__image-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            handleSelect();
          }}
        >
          <img className="card__image" src={image} alt={listing.displayAddress || 'Listing'} />
        </button>
        {listing.images?.length ? (
          <div className="card__dots">
            {listing.images.slice(0, 5).map((_, index) => (
              <span
                key={index}
                className={`card__dot ${index === 0 ? 'card__dot--active' : ''}`}
              />
            ))}
          </div>
        ) : null}
      </div>

      <div className="card__body">
        <div className="card__body-top">
          <p className="card__price">{listing.price || '$—'}</p>
        <button
          className="card__more"
          type="button"
          aria-label="More actions"
          data-demo-toast
          onClick={(event) => event.stopPropagation()}
        >
            ⋯
          </button>
        </div>

        <p className="card__meta">
          {metaItems.map((item, index) => (
            <span key={item.label} className="card__meta-group">
              <span className="card__meta-item">
                <strong>{item.value}</strong>
                {item.label}
              </span>
              {index < metaItems.length - 1 && (
                <span className="card__meta-divider" aria-hidden="true">
                  |
                </span>
              )}
            </span>
          ))}
          <span
            className={`card__meta-status ${hasMetaItems ? '' : 'card__meta-status--solo'}`.trim()}
          >
            {hasMetaItems ? `- ${metaStatusLabel}` : metaStatusLabel}
          </span>
        </p>

        <p className="card__address">{listing.displayAddress || 'Address unavailable'}</p>

        {attributionLabel ? (
          <a
            className="card__attribution" 
            target="_blank"
            rel="noopener noreferrer"
          >
            {attributionLabel}
          </a>
        ) : null}
      </div>
    </article>
  );
}
