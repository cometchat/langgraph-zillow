import ListingCard from './ListingCard';

export default function ListingGrid({
  listings,
  total = 0,
  sortOptions = [],
  sortOrder = 'homesForYou',
  onSortChange,
  onSelectListing,
  isLoading = false,
}) {
  const formattedTotal = total.toLocaleString();

  const activeSort = sortOptions.find((option) => option.id === sortOrder);
  const handleSortChange = (event) => {
    const nextValue = event.target.value;
    if (onSortChange) {
      onSortChange(nextValue);
    }
  };

  return (
    <section className="listings" aria-label="Listing results">
      <header className="listings__header">
        <div>
          <h2 className="listings__title">Real Estate &amp; Homes For Sale</h2>
          <p className="listings__meta">{formattedTotal} results</p>
        </div>
        <label className="listings__sort">
          <span className="listings__sort-label">Sort:</span>
          <select
            className="listings__sort-select"
            value={activeSort ? activeSort.id : sortOrder}
            onChange={handleSortChange}
            aria-label="Sort listings"
          >
            {sortOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {isLoading ? (
        <div className="listings__loader" role="status" aria-live="polite">
          <span className="listings__spinner" aria-hidden="true" />
          <span>Updating listings...</span>
        </div>
      ) : total === 0 ? (
        <p className="listings__empty" role="status">
          This is just for demonstration purpose.
        </p>
      ) : (
        <div className="cards">
          {listings.map((listing) => (
            <ListingCard key={listing.zpid} listing={listing} onSelect={onSelectListing} />
          ))}
        </div>
      )}
    </section>
  );
}
