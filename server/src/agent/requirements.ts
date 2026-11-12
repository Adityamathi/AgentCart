import type { Category, Product } from '../types.js';

export interface RequirementCheck {
  requirement: string;
  satisfied: boolean;
  evidence: string;
}

export interface InferredRequirements {
  budgetCents: number | null;
  category: Category | null;
  mustHave: string[];
  keywords: string[];
  useCases: string[];
}

const CATEGORY_WORDS: Array<{ category: Category; words: string[] }> = [
  { category: 'laptops', words: ['laptop', 'notebook', 'ultrabook', 'macbook', 'chromebook'] },
  { category: 'smartphones', words: ['phone', 'smartphone', 'iphone', 'pixel', 'galaxy'] },
  { category: 'headphones', words: ['headphone', 'headphones', 'earbuds', 'headset', 'airpods'] },
  {
    category: 'peripherals',
    words: ['mouse', 'keyboard', 'monitor', 'webcam', 'display', 'peripheral'],
  },
  { category: 'accessories', words: ['charger', 'power bank', 'hub', 'stand', 'ssd', 'case'] },
  { category: 'electronics', words: ['raspberry pi', 'arduino', 'camera', 'board', 'sensor', 'nvme'] },
];

const STOP_WORDS = new Set([
  'i', 'need', 'a', 'an', 'the', 'for', 'with', 'and', 'my', 'is', 'are', 'to', 'of', 'in', 'on',
  'that', 'this', 'please', 'want', 'would', 'like', 'get', 'buy', 'some', 'looking', 'budget',
  'under', 'below', 'max', 'maximum', 'around', 'about', 'prefer', 'preferably', 'also', 'have',
  'can', 'you', 'me', 'find', 'good', 'best', 'which', 'what', 'do', 'does', 'it', 'be', 'should',
]);

export function parseBudgetCents(text: string): number | null {
  const patterns = [
    /\$\s?([\d,]+(?:\.\d{1,2})?)/,
    /([\d,]+(?:\.\d{1,2})?)\s?(?:dollars|usd|bucks)/i,
    /(?:budget|spend|under|below|max|maximum|up to|less than)\D{0,12}([\d,]{2,7})(?:\.\d{1,2})?/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const value = Number(match[1].replace(/,/g, ''));
      if (Number.isFinite(value) && value >= 5) return Math.round(value * 100);
    }
  }
  return null;
}

export function inferRequirements(text: string): InferredRequirements {
  const lower = text.toLowerCase();
  const budgetCents = parseBudgetCents(lower);
  const category = CATEGORY_WORDS.find((entry) => entry.words.some((word) => lower.includes(word)))?.category ?? null;

  const mustHave: string[] = [];
  if (/\b\d+\s?gb\s?(ram|memory)\b|\bram\b/.test(lower)) mustHave.push('ram');
  if (/\b(gpu|cuda|nvidia|dedicated graphics)\b/.test(lower)) mustHave.push('gpu');
  if (/\bssd\b|\bstorage\b/.test(lower)) mustHave.push('storage');
  if (/\blinux|ubuntu|ros\b/.test(lower)) mustHave.push('linux');
  if (/\bpython\b/.test(lower)) mustHave.push('python');
  if (/\bportable|light|lightweight|travel\b/.test(lower)) mustHave.push('portable');
  if (/\bbattery\b/.test(lower)) mustHave.push('battery');
  if (/\bnoise cancelling|noise-cancelling|anc\b/.test(lower)) mustHave.push('noise cancelling');

  const useCases: string[] = [];
  if (/robot|ros\b/.test(lower)) useCases.push('robotics');
  if (/machine learning|deep learning|neural|model training|\bml\b|\bai\b/.test(lower)) useCases.push('machine learning');
  if (/computer vision|opencv|camera/.test(lower)) useCases.push('computer vision');
  if (/gaming|game/.test(lower)) useCases.push('gaming');
  if (/office|documents|spreadsheet/.test(lower)) useCases.push('office work');
  if (/music|audio|travel/.test(lower)) useCases.push('listening');

  const keywords = lower
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word) && !/^\d+$/.test(word))
    .slice(0, 24);

  return { budgetCents, category, mustHave: [...new Set(mustHave)], keywords, useCases };
}

function numberFromSpec(value: string | undefined, unit: 'gb' | 'tb'): number | null {
  if (!value) return null;
  const match = value.match(/(\d+(?:\.\d+)?)\s*(tb|gb)/i);
  if (!match) return null;
  const amount = Number(match[1]);
  const found = match[2].toLowerCase();
  if (found === unit) return amount;
  return unit === 'gb' ? amount * 1024 : amount / 1024;
}

function hasWord(haystack: string, ...needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/**
 * Deterministic requirement matching. Every answer carries the catalogue text
 * it came from, so the model has nothing to invent.
 */
export function checkRequirements(product: Product, requirements: string[]): {
  checks: RequirementCheck[];
  met: number;
  unmet: string[];
} {
  const specs = product.specs;
  const all = [product.name, product.brand, product.description, ...product.tags, ...Object.values(specs)]
    .join(' ')
    .toLowerCase();
  const checks: RequirementCheck[] = [];

  for (const raw of requirements) {
    const requirement = raw.trim();
    if (!requirement) continue;
    const lower = requirement.toLowerCase();

    if (/ram|memory/.test(lower)) {
      const wanted = lower.match(/(\d+)\s*gb/);
      const actual = numberFromSpec(specs.ram, 'gb');
      const target = wanted ? Number(wanted[1]) : 16;
      checks.push({
        requirement,
        satisfied: actual !== null ? actual >= target : false,
        evidence: specs.ram ? `RAM: ${specs.ram}` : 'No memory specification listed',
      });
      continue;
    }

    if (/gpu|cuda|graphics|nvidia/.test(lower)) {
      const gpu = specs.gpu ?? '';
      const dedicated = /nvidia|geforce|rtx|radeon rx|radeon pro/i.test(gpu);
      checks.push({
        requirement,
        satisfied: dedicated,
        evidence: gpu ? `GPU: ${gpu}` : 'No GPU specification listed',
      });
      continue;
    }

    if (/storage|ssd|disk/.test(lower)) {
      const wanted = lower.match(/(\d+)\s*(tb|gb)/);
      const target = wanted ? (wanted[2] === 'tb' ? Number(wanted[1]) * 1024 : Number(wanted[1])) : 512;
      const actual = numberFromSpec(specs.storage, 'gb');
      checks.push({
        requirement,
        satisfied: actual !== null ? actual >= target : false,
        evidence: specs.storage ? `Storage: ${specs.storage}` : 'No storage specification listed',
      });
      continue;
    }

    if (/linux|ubuntu|ros\b/.test(lower)) {
      const evidence = [specs.os, specs.compatibility, ...product.tags].filter(Boolean).join(' | ');
      checks.push({
        requirement,
        satisfied: hasWord(all, 'linux', 'ubuntu', 'ros'),
        evidence: evidence || 'No operating system detail listed',
      });
      continue;
    }

    if (/portable|light|travel/.test(lower)) {
      const weight = Number((specs.weight ?? '').match(/(\d+(?:\.\d+)?)\s*kg/i)?.[1] ?? '99');
      checks.push({
        requirement,
        satisfied: weight <= 2.2,
        evidence: specs.weight ? `Weight: ${specs.weight}` : 'No weight listed',
      });
      continue;
    }

    if (/battery/.test(lower)) {
      const evidence = specs.battery ? `Battery: ${specs.battery}` : 'No battery figure listed';
      checks.push({ requirement, satisfied: Boolean(specs.battery), evidence });
      continue;
    }

    if (/noise cancelling|anc/.test(lower)) {
      const anc = specs.noise_cancelling ?? '';
      checks.push({
        requirement,
        satisfied: /anc|noise/i.test(anc),
        evidence: anc ? `Noise cancelling: ${anc}` : 'No noise cancelling listed',
      });
      continue;
    }

    const tokens = lower
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
    const matchedTokens = tokens.filter((token) => all.includes(token));
    const evidence =
      Object.entries(specs).find(([, value]) => tokens.some((token) => value.toLowerCase().includes(token)))?.[1] ??
      product.tags.find((tag) => tokens.some((token) => tag.includes(token))) ??
      'No matching catalogue detail';
    checks.push({
      requirement,
      satisfied: tokens.length > 0 && matchedTokens.length >= Math.ceil(tokens.length / 2),
      evidence,
    });
  }

  const unmet = checks.filter((check) => !check.satisfied).map((check) => check.requirement);
  return { checks, met: checks.filter((check) => check.satisfied).length, unmet };
}

export function describeProduct(product: Product) {
  return {
    id: product.id,
    name: product.name,
    brand: product.brand,
    category: product.category,
    priceCents: product.priceCents,
    price: `$${(product.priceCents / 100).toFixed(2)}`,
    stock: product.stock,
    rating: product.rating,
    specs: product.specs,
    pros: product.pros,
    cons: product.cons,
    tags: product.tags,
  };
}
