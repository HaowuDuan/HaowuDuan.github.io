import { getCollection } from 'astro:content';

export async function getNotes(collectionName: string) {
  const entries = await getCollection(collectionName as any);
  return entries.sort((a: any, b: any) => a.data.order - b.data.order);
}
