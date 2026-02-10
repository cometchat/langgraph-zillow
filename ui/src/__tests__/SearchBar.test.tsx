import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HOME_TYPE_DEFAULT_SELECTION } from '../constants/filterOptions.js';
import SearchBar from '../components/SearchBar.jsx';

const createFilters = (overrides = {}) => ({
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
  ...overrides,
});

const setup = (overrides = {}) => {
  const onFiltersChange = vi.fn();
  const filters = createFilters(overrides);
  render(<SearchBar filters={filters} onFiltersChange={onFiltersChange} />);
  return { onFiltersChange };
};

describe('SearchBar filter controls', () => {
  test('shows default chip labels', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Beds' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Baths' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sqft' })).toBeInTheDocument();
  });

  test('updates minimum beds', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Beds' }));
    await user.click(screen.getByRole('button', { name: '3+' }));

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.bedsMin).toBe(3);
    expect(lastCall?.bedsMax).toBeNull();
  });

  test('selecting exact beds toggles max to match min', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Beds' }));
    await user.click(screen.getByRole('button', { name: '4+' }));
    await user.click(screen.getByRole('button', { name: '≤4' }));
    await user.click(screen.getByRole('checkbox', { name: /use exact match/i }));

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.exactBeds).toBe(true);
    expect(lastCall?.bedsMin).toBe(4);
    expect(lastCall?.bedsMax).toBe(4);
  });

  test('applies preset square footage cap', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Sqft' }));
    await user.click(screen.getByRole('button', { name: '≤2,000' }));

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.sqftMax).toBe(2000);
  });

  test('applies custom square footage value', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = setup();

    await user.click(screen.getByRole('button', { name: 'Sqft' }));
    const input = screen.getByPlaceholderText('Enter sqft');
    await user.clear(input);
    await user.type(input, '4500');

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.sqftMax).toBe(4500);
  });

  test('clearing custom sqft returns to null', async () => {
    const user = userEvent.setup();
    const { onFiltersChange } = setup({ sqftMax: 3000 });

    await user.click(screen.getByRole('button', { name: '≤3,000 sqft' }));
    const clearButton = screen.getByRole('button', { name: /clear/i });
    await user.click(clearButton);

    const lastCall = onFiltersChange.mock.calls.at(-1)?.[0];
    expect(lastCall?.sqftMax).toBeNull();
  });
});
