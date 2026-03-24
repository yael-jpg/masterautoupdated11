/**
 * Philippine Vehicle Makes Database
 * Complete list of common vehicle brands available in Philippines
 * Organized by category for better UX
 */

export const VEHICLE_MAKES = [
  // ==========================================
  // Japanese Brands (Most Popular in PH)
  // ==========================================
  {
    id: 1,
    name: 'Toyota',
    category: 'Japanese',
    logo: '/images/vehicle-logos/toyota.png',
    models: [
      'Vios',
      'Corolla',
      'Fortuner',
      'Hiace',
      'Innova',
      'Camry',
      'Avanza',
      'Wigo',
      'Yaris',
      'Land Cruiser',
    ],
  },
  {
    id: 2,
    name: 'Honda',
    category: 'Japanese',
    logo: '/images/vehicle-logos/honda.png',
    models: [
      'City',
      'Civic',
      'CR-V',
      'Accord',
      'Jazz',
      'Odyssey',
      'Pilot',
      'HR-V',
      'Mobilio',
    ],
  },
  {
    id: 3,
    name: 'Mitsubishi',
    category: 'Japanese',
    logo: '/images/vehicle-logos/mitsubishi.png',
    models: [
      'Mirage',
      'Lancer',
      'Montero',
      'Pajero',
      'Outlander',
      'Xpander',
      'Strada',
      'L300',
    ],
  },
  {
    id: 4,
    name: 'Nissan',
    category: 'Japanese',
    logo: '/images/vehicle-logos/nissan.png',
    models: [
      'Almera',
      'Sentra',
      'Navara',
      'X-Trail',
      'Urvan',
      'Frontier',
      'Serena',
    ],
  },
  {
    id: 5,
    name: 'Suzuki',
    category: 'Japanese',
    logo: '/images/vehicle-logos/suzuki.png',
    models: [
      'Alto',
      'Celerio',
      'Ertiga',
      'Swift',
      'Vitara',
      'Carry',
      'APV',
      'Multicab',
    ],
  },
  {
    id: 6,
    name: 'Mazda',
    category: 'Japanese',
    logo: '/images/vehicle-logos/mazda.png',
    models: ['CX-3', 'CX-5', 'CX-9', 'Mazda 2', 'Mazda 3', 'Mazda 6', 'BT-50'],
  },
  {
    id: 7,
    name: 'Subaru',
    category: 'Japanese',
    logo: '/images/vehicle-logos/subaru.png',
    models: ['Outback', 'XV', 'Impreza', 'Legacy', 'Forester'],
  },
  {
    id: 8,
    name: 'Isuzu',
    category: 'Japanese',
    logo: '/images/vehicle-logos/isuzu.png',
    models: ['D-Max', 'MU-X', 'Trooper', 'Panther', 'N-Series'],
  },
  {
    id: 9,
    name: 'Daihatsu',
    category: 'Japanese',
    logo: '/images/vehicle-logos/daihatsu.png',
    models: ['Xenia', 'Terios', 'Mira', 'Charade', 'Gran Max'],
  },
  {
    id: 10,
    name: 'Yamaha',
    category: 'Japanese',
    logo: null,
    models: ['Nmax', 'XMAX', 'Mio', 'Jupiter', 'Aerox'],
  },

  // ==========================================
  // Korean Brands
  // ==========================================
  {
    id: 11,
    name: 'Hyundai',
    category: 'Korean',
    logo: '/images/vehicle-logos/hyundai.png',
    models: [
      'Accent',
      'Elantra',
      'Tucson',
      'Santa Fe',
      'Kona',
      'Venue',
      'H100',
      'HD65',
    ],
  },
  {
    id: 12,
    name: 'Kia',
    category: 'Korean',
    logo: '/images/vehicle-logos/kia.png',
    models: [
      'Soluto',
      'Picanto',
      'Cerato',
      'Sportage',
      'Sorento',
      'Seltos',
      'Carnival',
    ],
  },

  // ==========================================
  // American Brands
  // ==========================================
  {
    id: 13,
    name: 'Ford',
    category: 'American',
    logo: '/images/vehicle-logos/ford.png',
    models: [
      'Fiesta',
      'EcoSport',
      'Everest',
      'Ranger',
      'Bronco',
      'Mustang',
      'Transit',
    ],
  },
  {
    id: 14,
    name: 'Chevrolet',
    category: 'American',
    logo: '/images/vehicle-logos/chevrolet.png',
    models: [
      'Spark',
      'Aveo',
      'Trailblazer',
      'Captiva',
      'Colorado',
      'Silverado',
    ],
  },
  {
    id: 15,
    name: 'GMC',
    category: 'American',
    logo: '/images/vehicle-logos/gmc.png',
    models: ['Sierra', 'Yukon', 'Canyon', 'Terrain'],
  },
  {
    id: 16,
    name: 'Jeep',
    category: 'American',
    logo: '/images/vehicle-logos/jeep.png',
    models: [
      'Wrangler',
      'Cherokee',
      'Grand Cherokee',
      'Compass',
      'Renegade',
    ],
  },

  // ==========================================
  // European Brands
  // ==========================================
  {
    id: 17,
    name: 'BMW',
    category: 'European',
    logo: '/images/vehicle-logos/bmw.png',
    models: ['BMW 1', 'BMW 3', 'BMW 5', 'BMW 7', 'X3', 'X5', 'X7'],
  },
  {
    id: 18,
    name: 'Mercedes-Benz',
    category: 'European',
    logo: '/images/vehicle-logos/mercedes.png',
    models: ['C-Class', 'E-Class', 'S-Class', 'GLC', 'GLE', 'GLS', 'A-Class'],
  },
  {
    id: 19,
    name: 'Audi',
    category: 'European',
    logo: '/images/vehicle-logos/audi.png',
    models: ['A3', 'A4', 'A6', 'A8', 'Q3', 'Q5', 'Q7'],
  },
  {
    id: 20,
    name: 'Volkswagen',
    category: 'European',
    logo: '/images/vehicle-logos/volkswagen.png',
    models: [
      'Golf',
      'Jetta',
      'Passat',
      'Tiguan',
      'Touareg',
      'Beetle',
      'Polo',
    ],
  },
  {
    id: 21,
    name: 'Porsche',
    category: 'European',
    logo: '/images/vehicle-logos/porsche.png',
    models: ['911', '918', 'Cayenne', 'Panamera', 'Macan'],
  },
  {
    id: 22,
    name: 'Volvo',
    category: 'European',
    logo: '/images/vehicle-logos/volvo.png',
    models: ['V40', 'S60', 'V60', 'S90', 'V90', 'XC40', 'XC60', 'XC90'],
  },
  {
    id: 23,
    name: 'Lexus',
    category: 'European',
    logo: '/images/vehicle-logos/lexus.png',
    models: [
      'CT',
      'IS',
      'ES',
      'GS',
      'LS',
      'NX',
      'RX',
      'GX',
      'LX',
    ],
  },
  {
    id: 24,
    name: 'Renault',
    category: 'European',
    logo: '/images/vehicle-logos/renault.png',
    models: ['Clio', 'Megane', 'Duster', 'Captur', 'Koleos'],
  },

  // ==========================================
  // Chinese Brands (Growing in PH)
  // ==========================================
  {
    id: 25,
    name: 'MG',
    category: 'Chinese',
    logo: '/images/vehicle-logos/mg.png',
    models: ['MG3', 'MG5', 'MG6', 'ZS', 'RX5', 'RX8'],
  },
  {
    id: 26,
    name: 'Geely',
    category: 'Chinese',
    logo: '/images/vehicle-logos/geely.png',
    models: ['Emgrand', 'GS', 'SX11', 'LC', 'EX', 'VX11'],
  },
  {
    id: 27,
    name: 'Chery',
    category: 'Chinese',
    logo: '/images/vehicle-logos/chery.png',
    models: ['QQ', 'A1', 'A3', 'A5', 'Tiggo', 'Arrizo'],
  },
  {
    id: 28,
    name: 'Foton',
    category: 'Chinese',
    logo: '/images/vehicle-logos/foton.png',
    models: ['Tunland', 'Toplander', 'Gratour', 'Sauvest'],
  },
  {
    id: 29,
    name: 'GAC',
    category: 'Chinese',
    logo: '/images/vehicle-logos/gac.png',
    models: ['GS4', 'GS5', 'GS7', 'GS8', 'Aion'],
  },
  {
    id: 30,
    name: 'BYD',
    category: 'Chinese',
    logo: '/images/vehicle-logos/byd.png',
    models: ['Song', 'Yuan', 'Qin', 'Tang', 'Seagull'],
  },

  // Additional brands requested
  {
    id: 31,
    name: 'Peugeot',
    category: 'European',
    logo: '/images/vehicle-logos/peugeot.png',
    models: [],
  },
  {
    id: 32,
    name: 'Land Rover',
    category: 'European',
    logo: '/images/vehicle-logos/landrover.png',
    models: [],
  },
  {
    id: 33,
    name: 'Mini',
    category: 'European',
    logo: '/images/vehicle-logos/mini.png',
    models: [],
  },
  {
    id: 34,
    name: 'Jetour',
    category: 'Chinese',
    logo: '/images/vehicle-logos/jetour.png',
    models: [],
  },
  {
    id: 35,
    name: 'JMC',
    category: 'Chinese',
    logo: '/images/vehicle-logos/jmc.png',
    models: [],
  },
  {
    id: 36,
    name: 'Tata',
    category: 'Other',
    logo: '/images/vehicle-logos/tata.png',
    models: [],
  },
  {
    id: 37,
    name: 'Ferrari',
    category: 'European',
    logo: '/images/vehicle-logos/ferrari.png',
    models: [],
  },
  {
    id: 38,
    name: 'Lamborghini',
    category: 'European',
    logo: '/images/vehicle-logos/lamborghini.png',
    models: [],
  },
  {
    id: 39,
    name: 'Maserati',
    category: 'European',
    logo: '/images/vehicle-logos/maserati.png',
    models: [],
  },
  {
    id: 40,
    name: 'Tesla',
    category: 'American',
    logo: '/images/vehicle-logos/tesla.png',
    models: [],
  },
  {
    id: 41,
    name: 'GAC Aion',
    category: 'Chinese',
    logo: '/images/vehicle-logos/gac-aion.png',
    models: [],
  },

  // ==========================================
  // Other / Rare / Imported
  // ==========================================
  {
    id: 42,
    name: 'Other (Specify)',
    category: 'Other',
    logo: null,
    models: [],
  },
];

/**
 * Get all makes for dropdown (sorted by category)
 */
export const getAllMakes = () => {
  const categoryOrder = ['Japanese', 'Korean', 'American', 'European', 'Chinese', 'Other'];
  return VEHICLE_MAKES.sort(
    (a, b) => categoryOrder.indexOf(a.category) - categoryOrder.indexOf(b.category)
  );
};

/**
 * Get makes by category
 */
export const getMakesByCategory = (category) => {
  return VEHICLE_MAKES.filter((make) => make.category === category);
};

/**
 * Get all categories
 */
export const getAllCategories = () => {
  const categories = new Set(VEHICLE_MAKES.map((make) => make.category));
  return Array.from(categories);
};

/**
 * Get models for a specific make
 */
export const getModelsForMake = (makeName) => {
  const make = VEHICLE_MAKES.find((m) => m.name === makeName);
  return make ? make.models : [];
};

/**
 * Search makes by keyword
 */
export const searchMakes = (keyword) => {
  const lowercaseKeyword = keyword.toLowerCase();
  return VEHICLE_MAKES.filter(
    (make) =>
      make.name.toLowerCase().includes(lowercaseKeyword) ||
      make.category.toLowerCase().includes(lowercaseKeyword)
  );
};

/**
 * Validate if make exists
 */
export const isMakeValid = (makeName) => {
  return VEHICLE_MAKES.some(
    (make) => make.name.toLowerCase() === makeName.toLowerCase()
  );
};

/**
 * Get make by ID
 */
export const getMakeById = (id) => {
  return VEHICLE_MAKES.find((make) => make.id === id);
};

/**
 * Get make name by ID
 */
export const getMakeNameById = (id) => {
  const make = getMakeById(id);
  return make ? make.name : null;
};
