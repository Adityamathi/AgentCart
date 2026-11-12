export type Category =
  | 'laptops'
  | 'smartphones'
  | 'headphones'
  | 'peripherals'
  | 'accessories'
  | 'electronics';

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string;
  category: Category;
  description: string;
  priceCents: number;
  currency: string;
  stock: number;
  rating: number;
  specs: Record<string, string>;
  tags: string[];
  pros: string[];
  cons: string[];
}

export interface AgentSessionRow {
  id: string;
  user_id: string;
  title: string;
  status: string;
  state: string;
  created_at: string;
  updated_at: string;
}

export interface PolicyRecord {
  id: string;
  user_id: string;
  max_budget_cents: number;
  max_quantity: number;
  allowed_categories: string;
  blocked_categories: string;
  require_approval: number;
  updated_at: string;
}

export interface ToolExecution {
  id: string;
  step: number;
  tool: string;
  status: 'ok' | 'error';
  input: unknown;
  output: unknown;
  error?: string;
  durationMs: number;
  label: string;
}
