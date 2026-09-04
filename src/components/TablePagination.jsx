import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';

const PAGE_SIZES = [10, 25, 50, 100];

/*
 * Builds the page numbers to show, collapsing the middle with ellipses so a
 * long list keeps a fixed-width control: 1 … 4 5 6 … 20
 */
function pageItems(page, pageCount) {
  if (pageCount <= 7) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const items = [1];
  const from = Math.max(2, page - 1);
  const to = Math.min(pageCount - 1, page + 1);

  if (from > 2) items.push('start-gap');
  for (let p = from; p <= to; p++) items.push(p);
  if (to < pageCount - 1) items.push('end-gap');

  items.push(pageCount);
  return items;
}

/**
 * Pagination for a table: the range on the left, the page controls in the
 * middle, and the rows-per-page choice on the right.
 *
 * `page` is 1-based. Nothing renders when there is nothing to page through.
 */
export default function TablePagination({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  itemLabel = 'candidates',
}) {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  const firstRow = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const lastRow = Math.min(safePage * pageSize, totalItems);

  const goTo = (next) => {
    const clamped = Math.min(Math.max(1, next), pageCount);
    if (clamped !== safePage) onPageChange(clamped);
  };

  return (
    <div className="table-pagination">

      {/* left: what you are looking at */}
      <p className="pagination-range">
        {totalItems === 0 ? (
          <>No {itemLabel} to show</>
        ) : (
          <>
            Showing <strong>{firstRow}</strong>&ndash;<strong>{lastRow}</strong> of{' '}
            <strong>{totalItems}</strong> {itemLabel}
          </>
        )}
      </p>

      {/* middle: the controls */}
      <div className="pagination-controls">
        <button
          type="button"
          className="pagination-button"
          onClick={() => goTo(1)}
          disabled={safePage === 1}
          aria-label="First page"
          title="First page"
        >
          <ChevronsLeft size={16} />
        </button>

        <button
          type="button"
          className="pagination-button"
          onClick={() => goTo(safePage - 1)}
          disabled={safePage === 1}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={16} />
        </button>

        <div className="pagination-pages">
          {pageItems(safePage, pageCount).map((item) =>
            typeof item === 'number' ? (
              <button
                key={item}
                type="button"
                className={`pagination-page ${item === safePage ? 'active' : ''}`}
                onClick={() => goTo(item)}
                aria-current={item === safePage ? 'page' : undefined}
                aria-label={`Page ${item}`}
              >
                {item}
              </button>
            ) : (
              <span key={item} className="pagination-gap" aria-hidden="true">
                &hellip;
              </span>
            )
          )}
        </div>

        <button
          type="button"
          className="pagination-button"
          onClick={() => goTo(safePage + 1)}
          disabled={safePage === pageCount}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={16} />
        </button>

        <button
          type="button"
          className="pagination-button"
          onClick={() => goTo(pageCount)}
          disabled={safePage === pageCount}
          aria-label="Last page"
          title="Last page"
        >
          <ChevronsRight size={16} />
        </button>
      </div>

      {/* right: how much to show */}
      <label className="pagination-size">
        <span>Show</span>

        <select
          className="form-select"
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          aria-label={`Rows per page`}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>

    </div>
  );
}
