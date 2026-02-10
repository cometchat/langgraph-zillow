export const SALE_TYPE_OPTIONS = [
  { id: 'forSale', label: 'For Sale' },
  { id: 'forRent', label: 'For Rent' },
  { id: 'sold', label: 'Sold' },
];

export const HOME_TYPE_OPTIONS = [
  {
    id: 'SingleFamilyResidence',
    label: 'Houses',
    aliases: ['singlefamilyresidence', 'single family residence', 'singlefamily'],
  },
  { id: 'Townhouse', label: 'Townhomes', aliases: ['townhouse', 'town home', 'townhomes'] },
  { id: 'MultiFamily', label: 'Multi-family', aliases: ['multifamily', 'multi family'] },
  { id: 'Condominium', label: 'Condos/Co-ops', aliases: ['condominium', 'condo', 'condos'] },
  { id: 'LotsLand', label: 'Lots/Land', aliases: ['lotsland', 'lot', 'land'] },
  { id: 'Apartment', label: 'Apartments', aliases: ['apartment', 'apartments'] },
  { id: 'Manufactured', label: 'Manufactured', aliases: ['manufactured'] },
];

export const HOME_TYPE_DEFAULT_SELECTION = HOME_TYPE_OPTIONS.map((option) => option.id);

const HOME_TYPE_ALIAS_MAP = HOME_TYPE_OPTIONS.reduce((acc, option) => {
  const aliases = new Set([option.id, option.id.toLowerCase(), ...(option.aliases || [])]);
  aliases.forEach((alias) => {
    acc[alias.replace(/\s+/g, '').toLowerCase()] = option.id;
  });
  return acc;
}, {});

export function normalizeHomeType(value) {
  if (!value) {
    return null;
  }
  const key = String(value).replace(/\s+/g, '').toLowerCase();
  return HOME_TYPE_ALIAS_MAP[key] || null;
}

export function getHomeTypeLabel(id) {
  const option = HOME_TYPE_OPTIONS.find((item) => item.id === id);
  return option ? option.label : null;
}
