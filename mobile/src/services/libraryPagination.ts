// The first page may come from cache; subsequent pages use the caller's
// authenticated request so mutations do not leave cached tail pages stale.
export async function collectLibraryPages(
  first: any,
  field: 'tracks' | 'downloads' | 'history',
  fetchPage: (page: number) => Promise<any>
): Promise<any[]> {
  const rows = Array.isArray(first?.data?.[field]) ? [...first.data[field]] : [];
  const totalPages = Number(first?.data?.pagination?.totalPages) || 1;
  if (!Number.isSafeInteger(totalPages) || totalPages < 1 || totalPages > 10000) {
    throw new Error('Could not read library pagination. Please try again.');
  }
  for (let page = 2; page <= totalPages; page++) {
    const payload = await fetchPage(page);
    if (!Array.isArray(payload?.data?.[field])) throw new Error('Could not load the complete library. Please try again.');
    rows.push(...payload.data[field]);
  }
  return rows;
}
