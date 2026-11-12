import { findUserById, readMemory, updateMemory, type ShoppingMemory } from './users.js';

/** Non-sensitive shopping preferences the buyer explicitly saved. */
export async function getSessionUserMemory(userId: string): Promise<string[]> {
  const user = await findUserById(userId);
  if (!user) return [];
  const memory = readMemory(user);
  const notes = [...(memory.notes ?? [])];
  if (memory.preferred_brands?.length) notes.push(`Preferred brands: ${memory.preferred_brands.join(', ')}`);
  return notes;
}

export async function loadMemory(userId: string): Promise<ShoppingMemory> {
  const user = await findUserById(userId);
  return user ? readMemory(user) : {};
}

export async function saveShoppingMemory(userId: string, memory: ShoppingMemory): Promise<ShoppingMemory> {
  return updateMemory(userId, memory);
}
