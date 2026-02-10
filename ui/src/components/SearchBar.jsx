import { useEffect, useMemo, useRef, useState } from 'react';
import {
  HOME_TYPE_DEFAULT_SELECTION,
  HOME_TYPE_OPTIONS,
  SALE_TYPE_OPTIONS,
  getHomeTypeLabel,
} from '../constants/filterOptions.js';

const BED_MIN_OPTIONS = [0, 1, 2, 3, 4, 5];
const BED_MAX_OPTIONS = [null, 1, 2, 3, 4, 5];
const BATH_MIN_OPTIONS = [0, 1, 1.5, 2, 3, 4];
const BATH_MAX_OPTIONS = [null, 1, 1.5, 2, 3, 4];
const SQFT_OPTIONS = [null, 1000, 1500, 2000, 2500, 3000, 3500, 4000, 5000];

const formatMaxButtonLabel = (value) => {
  if (value === null || value === undefined) {
    return 'Any max';
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  const normalized = Number.isFinite(numeric)
    ? Number.isInteger(numeric)
      ? numeric.toLocaleString()
      : numeric.toLocaleString(undefined, { maximumFractionDigits: 1 }).replace(/\.0$/, '')
    : String(value);
  return `≤${normalized}`;
};

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const defaultHomeTypeSet = new Set(HOME_TYPE_DEFAULT_SELECTION);
const allowedHomeTypes = new Set(HOME_TYPE_OPTIONS.map((option) => option.id));

const sanitizeFilters = (values = {}) => {
  const coerceNullableNumber = (input, fallback = null) => {
    if (input === '' || input === null || input === undefined) {
      return fallback;
    }
    const numeric = Number(input);
    return Number.isFinite(numeric) ? numeric : fallback;
  };

  const coerceCount = (input) => coerceNullableNumber(input, 0);

  const rawHomeTypes = Array.isArray(values.homeTypes) ? values.homeTypes : undefined;
  const homeTypes = rawHomeTypes
    ? rawHomeTypes.reduce((acc, id) => {
        if (allowedHomeTypes.has(id) && !acc.includes(id)) {
          acc.push(id);
        }
        return acc;
      }, [])
    : [...HOME_TYPE_DEFAULT_SELECTION];

  const sanitized = {
    query: typeof values.query === 'string' ? values.query.trim() : '',
    saleType: values.saleType || 'forSale',
    priceMin: coerceNullableNumber(values.priceMin),
    priceMax: coerceNullableNumber(values.priceMax),
    bedsMin: coerceCount(values.bedsMin),
    bedsMax: coerceNullableNumber(values.bedsMax),
    bathsMin: coerceCount(values.bathsMin),
    bathsMax: coerceNullableNumber(values.bathsMax),
    sqftMax: coerceNullableNumber(values.sqftMax),
    exactBeds: Boolean(values.exactBeds),
    homeTypes,
  };

  if (
    sanitized.priceMin !== null &&
    sanitized.priceMax !== null &&
    sanitized.priceMin > sanitized.priceMax
  ) {
    [sanitized.priceMin, sanitized.priceMax] = [sanitized.priceMax, sanitized.priceMin];
  }

  if (sanitized.bedsMax !== null && sanitized.bedsMin > sanitized.bedsMax) {
    sanitized.bedsMax = sanitized.bedsMin;
  }

  if (sanitized.bathsMax !== null && sanitized.bathsMin > sanitized.bathsMax) {
    sanitized.bathsMax = sanitized.bathsMin;
  }

  if (
    sanitized.exactBeds &&
    sanitized.bedsMax !== null &&
    sanitized.bedsMax !== sanitized.bedsMin
  ) {
    sanitized.exactBeds = false;
  }

  return sanitized;
};

export default function SearchBar({ filters, onFiltersChange }) {
  const [openPanel, setOpenPanel] = useState(null);
  const [draftFilters, setDraftFilters] = useState(() => sanitizeFilters(filters));
  const [searchValue, setSearchValue] = useState(filters.query ?? '');
  const toolbarRef = useRef(null);

  useEffect(() => {
    const sanitized = sanitizeFilters(filters);
    setDraftFilters(sanitized);
    setSearchValue(sanitized.query ?? '');
  }, [filters]);

  useEffect(() => {
    if (!openPanel) {
      return undefined;
    }

    const handleClickAway = (event) => {
      if (!toolbarRef.current) {
        return;
      }
      if (!toolbarRef.current.contains(event.target)) {
        setOpenPanel(null);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape') {
        setOpenPanel(null);
      }
    };

    document.addEventListener('mousedown', handleClickAway);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickAway);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openPanel]);

  const togglePanel = (panel) => {
    if (openPanel === panel) {
      setOpenPanel(null);
      return;
    }
    setDraftFilters(sanitizeFilters(filters));
    setOpenPanel(panel);
  };

  const updateFilters = (updater) => {
    setDraftFilters((prev) => {
      const nextDraft =
        typeof updater === 'function' ? updater(prev) : { ...prev, ...updater };
      const sanitized = sanitizeFilters(nextDraft);
      onFiltersChange(sanitized);
      return sanitized;
    });
  };

  const setDraftValue = (key, value) => {
    updateFilters((prev) => ({ ...prev, [key]: value }));
  };

  const handlePriceChange = (key, rawValue) => {
    const value = rawValue === '' ? null : Number(rawValue);
    if (Number.isNaN(value)) {
      return;
    }
    setDraftValue(key, value);
  };

  const handleHomeTypeToggle = (id) => {
    updateFilters((prev) => {
      const nextSet = new Set(prev.homeTypes ?? HOME_TYPE_DEFAULT_SELECTION);
      if (nextSet.has(id)) {
        nextSet.delete(id);
      } else {
        nextSet.add(id);
      }
      return { ...prev, homeTypes: Array.from(nextSet) };
    });
  };

  const selectAllHomeTypes = () => {
    setDraftValue('homeTypes', [...HOME_TYPE_DEFAULT_SELECTION]);
  };

  const clearHomeTypes = () => {
    setDraftValue('homeTypes', []);
  };

  const handleApply = () => {
    setOpenPanel(null);
  };

  const handleCustomSqftChange = (event) => {
    const { value } = event.target;
    if (value === '') {
      setDraftValue('sqftMax', null);
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return;
    }
    setDraftValue('sqftMax', Math.max(0, numeric));
  };

  const handleSearchSubmit = (event) => {
    event.preventDefault();
    const trimmed = searchValue.trim();
    setSearchValue(trimmed);
    setDraftValue('query', trimmed);
  };

  const saleTypeLabel = useMemo(() => {
    const match = SALE_TYPE_OPTIONS.find((option) => option.id === filters.saleType);
    return match ? match.label : 'Sale Type';
  }, [filters.saleType]);

  const priceLabel = useMemo(() => {
    const { priceMin, priceMax } = filters;
    if (priceMin == null && priceMax == null) {
      return 'Price';
    }
    if (priceMin != null && priceMax != null) {
      return `${currencyFormatter.format(priceMin)} - ${currencyFormatter.format(priceMax)}`;
    }
    if (priceMin != null) {
      return `${currencyFormatter.format(priceMin)}+`;
    }
    return `Up to ${currencyFormatter.format(priceMax)}`;
  }, [filters.priceMin, filters.priceMax]);

  const formatRangeLabel = (minValue, maxValue, suffix, { exact = false, defaultLabel }) => {
    const formatValue = (value) => {
      if (value == null) {
        return null;
      }
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric)) {
        return String(value);
      }
      if (numeric === 0) {
        return null;
      }
      return Number.isInteger(numeric)
        ? numeric.toLocaleString()
        : numeric.toLocaleString(undefined, { maximumFractionDigits: 1 }).replace(/\.0$/, '');
    };

    const formattedMin = formatValue(minValue);
    const formattedMax = formatValue(maxValue);

    if (exact && formattedMin != null && formattedMin === formattedMax) {
      return `${formattedMin} ${suffix}`;
    }
    if (formattedMin && formattedMax != null) {
      if (formattedMin === formattedMax) {
        return `${formattedMin} ${suffix}`;
      }
      return `${formattedMin}-${formattedMax} ${suffix}`;
    }
    if (formattedMax != null) {
      return `≤${formattedMax} ${suffix}`;
    }
    if (formattedMin) {
      return `${formattedMin}+ ${suffix}`;
    }
    return defaultLabel;
  };

  const bedsLabel = useMemo(
    () =>
      formatRangeLabel(filters.bedsMin, filters.bedsMax, 'bd', {
        exact: filters.exactBeds,
        defaultLabel: 'Beds',
      }),
    [filters.bedsMin, filters.bedsMax, filters.exactBeds],
  );

  const bathsLabel = useMemo(
    () =>
      formatRangeLabel(filters.bathsMin, filters.bathsMax, 'ba', {
        defaultLabel: 'Baths',
      }),
    [filters.bathsMin, filters.bathsMax],
  );

  const sqftLabel = useMemo(() => {
    if (filters.sqftMax != null) {
      const formatted = Number(filters.sqftMax).toLocaleString();
      return `≤${formatted} sqft`;
    }
    return 'Sqft';
  }, [filters.sqftMax]);

  const homeTypesLabel = useMemo(() => {
    const selected = new Set(filters.homeTypes ?? []);
    if (!selected.size || selected.size === defaultHomeTypeSet.size) {
      return 'Home Type';
    }
    if (selected.size === 1) {
      const id = Array.from(selected)[0];
      return getHomeTypeLabel(id) ?? 'Home Type';
    }
    return `Home Type (${selected.size})`;
  }, [filters.homeTypes]);

  const homeTypeDraftSet = useMemo(
    () => new Set(draftFilters.homeTypes ?? HOME_TYPE_DEFAULT_SELECTION),
    [draftFilters.homeTypes],
  );

  return (
    <div className="search-toolbar" role="search" ref={toolbarRef}>
      <div className="search-toolbar__field">
        <form className="search-toolbar__form" onSubmit={handleSearchSubmit}>
          <input
            className="search-toolbar__input"
            type="search"
            placeholder="Address, neighborhood, city, ZIP"
            aria-label="Search location"
            value={searchValue}
            onChange={(event) => setSearchValue(event.target.value)}
          />
          <button className="search-toolbar__icon" type="submit" aria-label="Search">
            <svg
              aria-hidden="true"
              focusable="false"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="7" />
              <line x1="20" y1="20" x2="16.65" y2="16.65" />
            </svg>
          </button>
        </form>
      </div>
      <div className="search-toolbar__filters">
        <FilterButton
          label={saleTypeLabel}
          isActive={filters.saleType !== 'forSale'}
          isOpen={openPanel === 'saleType'}
          onClick={() => togglePanel('saleType')}
        >
          {openPanel === 'saleType' && (
            <FilterPopover>
              <div className="filter-popover__section">
                <p className="filter-popover__title">Listing Type</p>
                <div className="filter-radio-group">
                  {SALE_TYPE_OPTIONS.map((option) => (
                    <label key={option.id} className="filter-radio">
                      <input
                        type="radio"
                        name="saleType"
                        value={option.id}
                        checked={draftFilters.saleType === option.id}
                        onChange={() => setDraftValue('saleType', option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label={priceLabel}
          isActive={filters.priceMin != null || filters.priceMax != null}
          isOpen={openPanel === 'price'}
          alignRight
          onClick={() => togglePanel('price')}
        >
          {openPanel === 'price' && (
            <FilterPopover align="right">
              <div className="filter-popover__section">
                <div className="filter-popover__tabs">
                  <button type="button" className="filter-tab filter-tab--active" data-demo-toast>
                    List Price
                  </button>
                  <button type="button" className="filter-tab" disabled>
                    Monthly Payment
                  </button>
                </div>
                <div className="filter-popover__helper">Calculate your BuyAbility</div>
                <div className="filter-price-range">
                  <label className="filter-price-field">
                    <span>Minimum</span>
                    <input
                      className="filter-input"
                      type="number"
                      min="0"
                      placeholder="No Min"
                      value={draftFilters.priceMin ?? ''}
                      onChange={(event) => handlePriceChange('priceMin', event.target.value)}
                    />
                  </label>
                  <span className="filter-price-dash" aria-hidden="true">
                    –
                  </span>
                  <label className="filter-price-field">
                    <span>Maximum</span>
                    <input
                      className="filter-input"
                      type="number"
                      min="0"
                      placeholder="No Max"
                      value={draftFilters.priceMax ?? ''}
                      onChange={(event) => handlePriceChange('priceMax', event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label={bedsLabel}
          isActive={filters.bedsMin > 0 || filters.bedsMax !== null}
          isOpen={openPanel === 'beds'}
          alignRight
          onClick={() => togglePanel('beds')}
        >
          {openPanel === 'beds' && (
            <FilterPopover align="right">
              <div className="filter-popover__section filter-popover__section--range">
                <p className="filter-popover__subtitle">Number of Bedrooms</p>
                <div className="filter-range-controls">
                  <span className="filter-range-controls__label">Minimum</span>
                  <div className="filter-grid filter-grid--tight">
                    {BED_MIN_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`filter-pill ${draftFilters.bedsMin === value ? 'filter-pill--active' : ''}`}
                        onClick={() => setDraftValue('bedsMin', value)}
                      >
                        {value === 0 ? 'Any' : `${value}+`}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="filter-checkbox filter-checkbox--inline">
                  <input
                    type="checkbox"
                    checked={draftFilters.exactBeds}
                    onChange={(event) => setDraftValue('exactBeds', event.target.checked)}
                  />
                  <span>Use exact match</span>
                </label>
                <div className="filter-range-controls">
                  <span className="filter-range-controls__label">Maximum</span>
                  <div className="filter-grid filter-grid--tight">
                    {BED_MAX_OPTIONS.map((value) => {
                      const isActive =
                        draftFilters.bedsMax === value ||
                        (value === null && draftFilters.bedsMax === null);
                      return (
                        <button
                          key={value ?? 'any'}
                          type="button"
                          className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
                          onClick={() => setDraftValue('bedsMax', value)}
                        >
                          {formatMaxButtonLabel(value)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label={bathsLabel}
          isActive={filters.bathsMin > 0 || filters.bathsMax !== null}
          isOpen={openPanel === 'baths'}
          alignRight
          onClick={() => togglePanel('baths')}
        >
          {openPanel === 'baths' && (
            <FilterPopover align="right">
              <div className="filter-popover__section filter-popover__section--range">
                <p className="filter-popover__subtitle">Number of Bathrooms</p>
                <div className="filter-range-controls">
                  <span className="filter-range-controls__label">Minimum</span>
                  <div className="filter-grid filter-grid--tight">
                    {BATH_MIN_OPTIONS.map((value) => (
                      <button
                        key={value}
                        type="button"
                        className={`filter-pill ${draftFilters.bathsMin === value ? 'filter-pill--active' : ''}`}
                        onClick={() => setDraftValue('bathsMin', value)}
                      >
                        {value === 0 ? 'Any' : `${value}+`}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="filter-range-controls">
                  <span className="filter-range-controls__label">Maximum</span>
                  <div className="filter-grid filter-grid--tight">
                    {BATH_MAX_OPTIONS.map((value) => {
                      const isActive =
                        draftFilters.bathsMax === value ||
                        (value === null && draftFilters.bathsMax === null);
                      return (
                        <button
                          key={value ?? 'any'}
                          type="button"
                          className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
                          onClick={() => setDraftValue('bathsMax', value)}
                        >
                          {formatMaxButtonLabel(value)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label={sqftLabel}
          isActive={filters.sqftMax !== null}
          isOpen={openPanel === 'sqft'}
          alignRight
          onClick={() => togglePanel('sqft')}
        >
          {openPanel === 'sqft' && (
            <FilterPopover align="right">
              <div className="filter-popover__section filter-popover__section--range">
                <p className="filter-popover__subtitle">Square Footage</p>
                <div className="filter-range-controls">
                  <span className="filter-range-controls__label">Maximum</span>
                  <div className="filter-grid filter-grid--tight">
                    {SQFT_OPTIONS.map((value) => {
                      const isActive =
                        draftFilters.sqftMax === value ||
                        (value === null && draftFilters.sqftMax === null);
                      return (
                        <button
                          key={value ?? 'any'}
                          type="button"
                          className={`filter-pill ${isActive ? 'filter-pill--active' : ''}`}
                          onClick={() => setDraftValue('sqftMax', value)}
                        >
                          {formatMaxButtonLabel(value)}
                        </button>
                      );
                    })}
                  </div>
                  <div className="filter-range-controls__custom">
                    <span className="filter-range-controls__label">Custom max</span>
                    <div className="filter-custom-input">
                      <input
                        type="number"
                        min="0"
                        inputMode="numeric"
                        className={`filter-input ${
                          draftFilters.sqftMax !== null && !SQFT_OPTIONS.includes(draftFilters.sqftMax)
                            ? 'filter-input--active'
                            : ''
                        }`}
                        value={draftFilters.sqftMax ?? ''}
                        onChange={handleCustomSqftChange}
                        placeholder="Enter sqft"
                      />
                      {draftFilters.sqftMax !== null && (
                        <button
                          type="button"
                          className="filter-link-button"
                          onClick={() => setDraftValue('sqftMax', null)}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label={homeTypesLabel}
          isActive={(filters.homeTypes ?? []).length !== HOME_TYPE_DEFAULT_SELECTION.length}
          isOpen={openPanel === 'homeType'}
          alignRight
          onClick={() => togglePanel('homeType')}
        >
          {openPanel === 'homeType' && (
            <FilterPopover align="right">
              <div className="filter-popover__section filter-popover__section--tight">
                <div className="filter-popover__list-header">
                  <button type="button" onClick={selectAllHomeTypes}>
                    Select all
                  </button>
                  <button type="button" onClick={clearHomeTypes}>
                    Deselect all
                  </button>
                </div>
                <div className="filter-popover__list">
                  {HOME_TYPE_OPTIONS.map((option) => (
                    <label key={option.id} className="filter-checkbox">
                      <input
                        type="checkbox"
                        checked={homeTypeDraftSet.has(option.id)}
                        onChange={() => handleHomeTypeToggle(option.id)}
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <FilterApply onApply={handleApply} />
            </FilterPopover>
          )}
        </FilterButton>

        <FilterButton
          label="More"
          isActive={false}
          isOpen={openPanel === 'more'}
          alignRight
          onClick={() => togglePanel('more')}
        >
          {openPanel === 'more' && (
            <FilterPopover align="right">
              <div className="filter-popover__section">
                <p className="filter-popover__subtitle">More filters</p>
                <p className="filter-popover__helper">
                  This is just for demonstration purpose.
                </p>
              </div>
              <FilterApply onApply={() => setOpenPanel(null)} label="Close" />
            </FilterPopover>
          )}
        </FilterButton>
      </div>
    </div>
  );
}

function FilterButton({ label, isActive, isOpen, onClick, alignRight, children }) {
  const classes = [
    'filter-control',
    alignRight ? 'filter-control--right' : '',
    isOpen ? 'filter-control--open' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      <button
        type="button"
        className={`search-toolbar__chip ${isActive || isOpen ? 'search-toolbar__chip--active' : ''}`}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={onClick}
      >
        {label}
        <span aria-hidden="true">▾</span>
      </button>
      {children}
    </div>
  );
}

function FilterPopover({ children, align }) {
  const classes = ['filter-popover'];
  if (align === 'right') {
    classes.push('filter-popover--right');
  }
  return <div className={classes.join(' ')}>{children}</div>;
}

function FilterApply({ onApply, label = 'Done' }) {
  return (
    <div className="filter-popover__actions">
      <button type="button" className="filter-popover__apply" onClick={onApply}>
        {label}
      </button>
    </div>
  );
}
