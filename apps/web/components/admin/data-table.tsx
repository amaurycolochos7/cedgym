'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  /** When provided, shows a search input that filters across all columns. */
  searchPlaceholder?: string;
  /** Click handler for whole rows (e.g. navigate to detail). */
  onRowClick?: (row: T) => void;
  /** Initial page size. */
  pageSize?: number;
  empty?: React.ReactNode;
  toolbar?: React.ReactNode;
}

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder,
  onRowClick,
  pageSize = 20,
  empty,
  toolbar,
}: DataTableProps<T>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = React.useState('');

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
    globalFilterFn: 'includesString',
  });

  const rows = table.getRowModel().rows;

  return (
    <div className="flex flex-col gap-3">
      {(searchPlaceholder || toolbar) && (
        <div className="flex flex-wrap items-center gap-2">
          {searchPlaceholder && (
            <input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 max-w-xs rounded-xl border border-slate-300 bg-slate-50 px-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-100"
            />
          )}
          <div className="ml-auto flex items-center gap-2">{toolbar}</div>
        </div>
      )}

      {/* Desktop / tablet: classic table */}
      <div className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white md:block">
        <div className="w-full overflow-x-auto">
          <table className="w-full caption-bottom text-left text-sm text-slate-900">
            <thead className="bg-slate-50">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    return (
                      <th
                        key={header.id}
                        className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600"
                      >
                        {header.isPlaceholder ? null : (
                          <button
                            type="button"
                            className={cn(
                              'inline-flex items-center gap-1',
                              canSort && 'cursor-pointer hover:text-slate-900',
                            )}
                            onClick={header.column.getToggleSortingHandler()}
                            disabled={!canSort}
                          >
                            {flexRender(
                              header.column.columnDef.header,
                              header.getContext(),
                            )}
                            {canSort && (
                              <ArrowUpDown className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        )}
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => onRowClick?.(row.original)}
                    className={cn(
                      'border-t border-slate-100 transition hover:bg-slate-50',
                      onRowClick && 'cursor-pointer',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td
                        key={cell.id}
                        className="px-4 py-3.5 align-middle text-sm text-slate-900"
                      >
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="py-10 text-center text-sm text-slate-500"
                  >
                    {empty ?? 'Sin resultados'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile: card view */}
      <div className="flex flex-col gap-3 md:hidden">
        {rows.length ? (
          rows.map((row) => {
            const cells = row.getVisibleCells();
            const [titleCell, ...restCells] = cells;
            const fieldCells: typeof restCells = [];
            const actionCells: typeof restCells = [];

            for (const cell of restCells) {
              const def = cell.column.columnDef;
              const headerDef = def.header;
              const isEmptyHeader =
                headerDef === undefined ||
                headerDef === null ||
                (typeof headerDef === 'string' && headerDef.trim() === '');
              const looksLikeActions =
                cell.column.id === 'actions' || isEmptyHeader;
              if (looksLikeActions) {
                actionCells.push(cell);
              } else {
                fieldCells.push(cell);
              }
            }

            const Wrapper: React.ElementType = onRowClick ? 'button' : 'div';
            const wrapperProps = onRowClick
              ? {
                  type: 'button' as const,
                  onClick: () => onRowClick(row.original),
                }
              : {};

            return (
              <Wrapper
                key={row.id}
                {...wrapperProps}
                className={cn(
                  'flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-4 text-left transition',
                  onRowClick && 'cursor-pointer hover:bg-slate-50 active:bg-slate-100',
                )}
              >
                {titleCell && (
                  <div className="text-base font-semibold text-slate-900">
                    {flexRender(
                      titleCell.column.columnDef.cell,
                      titleCell.getContext(),
                    )}
                  </div>
                )}

                {fieldCells.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    {fieldCells.map((cell) => (
                      <div
                        key={cell.id}
                        className="flex items-start justify-between gap-3"
                      >
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          {flexRender(
                            cell.column.columnDef.header,
                            cell.getContext() as never,
                          )}
                        </span>
                        <span className="text-right text-sm text-slate-900">
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext(),
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {actionCells.length > 0 && (
                  <div
                    className="flex w-full flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {actionCells.map((cell) => (
                      <div key={cell.id} className="flex-1">
                        {flexRender(
                          cell.column.columnDef.cell,
                          cell.getContext(),
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Wrapper>
            );
          })
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white py-10 text-center text-sm text-slate-500">
            {empty ?? 'Sin resultados'}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
        <div>
          {rows.length} / {data.length} filas
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Página anterior"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <span className="tabular-nums">
            Página {table.getState().pagination.pageIndex + 1} de{' '}
            {table.getPageCount() || 1}
          </span>
          <button
            type="button"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40 disabled:hover:bg-transparent"
            aria-label="Página siguiente"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
