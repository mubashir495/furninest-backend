export interface AllowedColor {
  name: string;
  hex: string;
}

export const ALLOWED_COLORS: AllowedColor[] = [
  { name: 'Cream', hex: '#FDFBF7' },
  { name: 'Beige', hex: '#E6D7C3' },
  { name: 'Sand', hex: '#C2B280' },
  { name: 'Charcoal Grey', hex: '#36454F' },
  { name: 'Light Grey', hex: '#D3D3D3' },
  { name: 'Slate Grey', hex: '#708090' },
  { name: 'Midnight Blue', hex: '#191970' },
  { name: 'Navy Blue', hex: '#000080' },
  { name: 'Emerald Green', hex: '#046307' },
  { name: 'Forest Green', hex: '#228B22' },
  { name: 'Olive Green', hex: '#556B2F' },
  { name: 'Mustard Gold', hex: '#DAA520' },
  { name: 'Rust Orange', hex: '#B7410E' },
  { name: 'Terracotta', hex: '#E2725B' },
  { name: 'Dusty Rose', hex: '#DCAE96' },
  { name: 'Warm Brown', hex: '#8B5A2B' },
  { name: 'Chocolate Brown', hex: '#3D2314' },
  { name: 'Velvet Black', hex: '#1B1B1B' },
  { name: 'Pure White', hex: '#FFFFFF' },
];

export const ALLOWED_CONFIGS_BY_CATEGORY: Record<string, string[]> = {
  sofa: [
    'Single Armchair',
    '2-Seater',
    '3-Seater',
    '4-Seater Corner',
    'L-Shape Left Facing',
    'L-Shape Right Facing',
    'U-Shape Large',
    'Sofa Bed',
  ],
  'dining table': [
    'Table Only (140cm)',
    'Table Only (160cm)',
    'Table Only (180cm)',
    'Table Only (Extendable)',
    'Table + 4 Chairs Set',
    'Table + 6 Chairs Set',
    'Table + 8 Chairs Set',
  ],
  chair: [
    'Single Chair',
    'Set of 2',
    'Set of 4',
    'Set of 6',
  ],
  bed: [
    'Single (3ft)',
    'Small Double (4ft)',
    'Double (4ft6)',
    'King Size (5ft)',
    'Super King (6ft)',
    'Ottoman Storage Bed (4ft6)',
    'Ottoman Storage Bed (5ft)',
  ],
  default: [
    'Standard',
    'Small',
    'Medium',
    'Large',
  ],
};

export const ALLOWED_MATERIALS = [
  'Luxury Velvet',
  'Boucle',
  'Chenille',
  'Textured Linen',
  'Premium Leather',
  'Solid Oak',
  'Solid Walnut',
  'Marble Effect',
  'Natural Marble',
  'Sintered Stone',
  'Tempered Glass',
  'Powder-Coated Steel',
  'Brushed Gold Metal',
];

export const CONFIG_PRICE_MULTIPLIERS: Record<string, number> = {
  // Sofa configs (e.g. 2-Seater 0.8, 3-Seater 1.0, 4-Seater 1.2, L-Shape 1.5)
  'Single Armchair': 0.6,
  '2-Seater': 0.8,
  '3-Seater': 1.0,
  '4-Seater Corner': 1.2,
  '4-Seater': 1.2,
  'L-Shape Left Facing': 1.5,
  'L-Shape Right Facing': 1.5,
  'L-Shape': 1.5,
  'U-Shape Large': 1.8,
  'Sofa Bed': 1.2,

  // Dining table configs
  'Table Only (140cm)': 0.85,
  'Table Only (160cm)': 1.0,
  'Table Only (180cm)': 1.15,
  'Table Only (Extendable)': 1.25,
  'Table + 4 Chairs Set': 1.5,
  'Table + 6 Chairs Set': 1.8,
  'Table + 8 Chairs Set': 2.1,

  // Chair configs
  'Single Chair': 0.35,
  'Set of 2': 0.65,
  'Set of 4': 1.0,
  'Set of 6': 1.4,

  // Bed configs
  'Single (3ft)': 0.75,
  'Small Double (4ft)': 0.85,
  'Double (4ft6)': 1.0,
  'King Size (5ft)': 1.15,
  'Super King (6ft)': 1.3,
  'Ottoman Storage Bed (4ft6)': 1.35,
  'Ottoman Storage Bed (5ft)': 1.5,

  // Generic / Default configs
  'Small': 0.8,
  'Standard': 1.0,
  'Medium': 1.0,
  'Large': 1.2,
};

export function getMultiplierForConfig(configName: string): number {
  if (!configName) return 1.0;
  // 1. Direct match
  if (CONFIG_PRICE_MULTIPLIERS[configName] !== undefined) {
    return CONFIG_PRICE_MULTIPLIERS[configName];
  }

  const clean = configName.toLowerCase().trim();

  // 2. Exact match case-insensitive
  for (const [key, mult] of Object.entries(CONFIG_PRICE_MULTIPLIERS)) {
    if (key.toLowerCase() === clean) {
      return mult;
    }
  }

  // 3. Pattern / substring checks
  if (clean.includes('l-shape')) return 1.5;
  if (clean.includes('2-seater') || clean.includes('2 seater')) return 0.8;
  if (clean.includes('3-seater') || clean.includes('3 seater')) return 1.0;
  if (clean.includes('4-seater') || clean.includes('4 seater')) return 1.2;
  if (clean.includes('single')) return 0.6;
  if (clean.includes('8 chairs') || clean.includes('set of 8')) return 2.1;
  if (clean.includes('6 chairs') || clean.includes('set of 6')) return 1.8;
  if (clean.includes('4 chairs') || clean.includes('set of 4')) return 1.5;

  return 1.0;
}
