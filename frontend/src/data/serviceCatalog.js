export const VEHICLE_SIZE_OPTIONS = [
  { key: 'small-bike', label: 'Small Bike' },
  { key: 'big-bike', label: 'Big Bike' },
  { key: 'x-small', label: 'X Small' },
  { key: 'small', label: 'Small' },
  { key: 'medium', label: 'Medium' },
  { key: 'large', label: 'Large' },
  { key: 'x-large', label: 'X Large' },
  { key: 'xx-large', label: 'XX Large' },
]

export const SERVICE_CATALOG = [
  {
    code: 'ppf-basic',
    name: 'PPF Basic',
    group: 'PPF Services',
    sizePrices: {
      'x-small': 55000,
      small: 60000,
      medium: 65000,
      large: 70000,
      'x-large': 75000,
      'xx-large': 80000,
    },
  },
  {
    code: 'ppf-standard-5y',
    name: 'PPF Standard (5 Years Warranty)',
    group: 'PPF Services',
    sizePrices: {
      'x-small': 65000,
      small: 75000,
      medium: 85000,
      large: 95000,
      'x-large': 105000,
      'xx-large': 115000,
    },
  },
  {
    code: 'ppf-standard-7y',
    name: 'PPF Standard (7 Years Warranty)',
    group: 'PPF Services',
    sizePrices: {
      'x-small': 75000,
      small: 85000,
      medium: 95000,
      large: 105000,
      'x-large': 115000,
      'xx-large': 125000,
    },
  },
  {
    code: 'ppf-signature',
    name: 'PPF SIGNATURE (7 YEARS WARRANTY)',
    group: 'PPF Services',
    sizePrices: {
      'x-small': 85000,
      small: 95000,
      medium: 105000,
      large: 115000,
      'x-large': 125000,
      'xx-large': 135000,
    },
  },
  {
    code: 'ppf-full',
    name: 'PPF Full Body',
    group: 'PPF Services',
    sizePrices: {
      'x-small': 95000,
      small: 95000,
      medium: 95000,
      large: 95000,
      'x-large': 95000,
      'xx-large': 95000,
    },
  },
  {
    code: 'wash-basic',
    name: 'Car Wash Basic',
    group: 'Car Wash Services',
    sizePrices: {
      'small-bike': 120,
      'big-bike': 150,
      'x-small': 150,
      small: 170,
      medium: 200,
      large: 250,
      'x-large': 300,
      'xx-large': 350,
    },
  },
  {
    code: 'wash-premium',
    name: 'Car Wash Premium',
    group: 'Car Wash Services',
    sizePrices: {
      'small-bike': 300,
      'big-bike': 400,
      'x-small': 400,
      small: 500,
      medium: 600,
      large: 700,
      'x-large': 800,
      'xx-large': 900,
    },
  },
  {
    code: 'wash-signature',
    name: 'Car Wash Signature',
    group: 'Car Wash Services',
    sizePrices: {
      'small-bike': 500,
      'big-bike': 600,
      'x-small': 600,
      small: 700,
      medium: 800,
      large: 900,
      'x-large': 1000,
      'xx-large': 1100,
    },
  },
  {
    code: 'detail-exterior',
    name: 'Exterior Detailing',
    group: 'Detailing Services',
    sizePrices: {
      'small-bike': 2000,
      'big-bike': 3000,
      'x-small': 4000,
      small: 5000,
      medium: 6000,
      large: 7000,
      'x-large': 8000,
      'xx-large': 9000,
    },
  },
  {
    code: 'detail-interior',
    name: 'Interior Detailing',
    group: 'Detailing Services',
    sizePrices: {
      'x-small': 3000,
      small: 4000,
      medium: 5000,
      large: 6000,
      'x-large': 7000,
      'xx-large': 8000,
    },
  },
  {
    code: 'detail-full',
    name: 'Full Detailing',
    group: 'Detailing Services',
    sizePrices: {
      'x-small': 6000,
      small: 8000,
      medium: 10000,
      large: 12000,
      'x-large': 14000,
      'xx-large': 16000,
    },
  },
  {
    code: 'coat-ceramic',
    name: 'Ceramic Coating',
    group: 'Coating Services',
    sizePrices: {
      'small-bike': 6000,
      'big-bike': 7000,
      'x-small': 9000,
      small: 10000,
      medium: 12000,
      large: 15000,
      'x-large': 18000,
      'xx-large': 20000,
    },
  },
  {
    code: 'coat-graphene',
    name: 'Graphene Coating',
    group: 'Coating Services',
    sizePrices: {
      'small-bike': 8000,
      'big-bike': 10000,
      'x-small': 11000,
      small: 12000,
      medium: 15000,
      large: 18000,
      'x-large': 22000,
      'xx-large': 25000,
    },
  },
  {
    code: 'other-b2z',
    name: 'Back to Zero',
    group: 'Other Services',
    sizePrices: {
      'x-small': 400,
      small: 500,
      medium: 600,
      large: 700,
      'x-large': 800,
      'xx-large': 900,
    },
  },
  {
    code: 'other-headlight',
    name: 'Headlight Restoration',
    group: 'Other Services',
    sizePrices: {
      'x-small': 1000,
      small: 1000,
      medium: 1000,
      large: 1000,
      'x-large': 1000,
      'xx-large': 1000,
    },
  },
  {
    code: 'other-acid-rain',
    name: 'Acid Rain Removal',
    group: 'Other Services',
    sizePrices: {
      'x-small': 600,
      small: 700,
      medium: 800,
      large: 900,
      'x-large': 1000,
      'xx-large': 1100,
    },
  },
  {
    code: 'other-water-repellant',
    name: 'Water Repellant',
    group: 'Other Services',
    sizePrices: {
      'x-small': 600,
      small: 700,
      medium: 800,
      large: 900,
      'x-large': 1000,
      'xx-large': 1100,
    },
  },
  {
    code: 'other-engine-wash',
    name: 'Engine Wash',
    group: 'Other Services',
    sizePrices: {
      'x-small': 400,
      small: 600,
      medium: 800,
      large: 1000,
      'x-large': 1200,
      'xx-large': 1400,
    },
  },
  {
    code: 'other-engine-detail',
    name: 'Engine Detail',
    group: 'Other Services',
    sizePrices: {
      'x-small': 800,
      small: 1000,
      medium: 1200,
      large: 1400,
      'x-large': 1600,
      'xx-large': 1800,
    },
  },
  {
    code: 'other-armorall',
    name: 'ArmorAll Protectant',
    group: 'Other Services',
    sizePrices: {
      'x-small': 300,
      small: 400,
      medium: 500,
      large: 600,
      'x-large': 700,
      'xx-large': 800,
    },
  },
]

export function formatCurrency(value) {
  return `₱${Number(value || 0).toLocaleString()}`
}

export function getServiceByCode(code) {
  return SERVICE_CATALOG.find((service) => service.code === code)
}

/**
 * Returns the effective price for a service+size, preferring an override from
 * Settings > Quotations over the static catalog default.
 * @param {string} code      - service code e.g. 'detail-exterior'
 * @param {string} sizeKey   - vehicle size key e.g. 'medium'
 * @param {Object} overrides - { [code]: { [sizeKey]: price } } from config
 */
export function getEffectivePrice(code, sizeKey, overrides = {}) {
  const ov = overrides?.[code]?.[sizeKey]
  if (ov !== undefined && ov !== null && ov !== '') return Number(ov)
  const service = SERVICE_CATALOG.find((s) => s.code === code)
  return service?.sizePrices?.[sizeKey] ?? 0
}

export function getCatalogGroups() {
  return Array.from(new Set(SERVICE_CATALOG.map((service) => service.group)))
}
