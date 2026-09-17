const DEFAULT_PAGE_SIZE = 25;

export function selectPages(pages, options = {}) {
  if (!Array.isArray(pages) || pages.length === 0) {
    return [];
  }
  const size = normalizeSize(options.size);
  const first = Math.max(0, Math.min(options.start || 0, pages.length - 1));
  const end = first + size - 1;
  return pages.slice(first, end);
}

export function pageCount(total, size = DEFAULT_PAGE_SIZE) {
  if (total <= 0 || size <= 0) {
    return 0;
  }
  return Math.ceil(total / size);
}

function normalizeSize(size) {
  if (!Number.isInteger(size) || size < 1) {
    return DEFAULT_PAGE_SIZE;
  }
  return size;
}
