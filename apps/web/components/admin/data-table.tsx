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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
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
            <Input
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-9 max-w-xs"
            />
          )}
          <div className="ml-auto flex items-center gap-2">{toolbar}</div>
        </div>
      )}

      <div className="rounded-xl border border-white/10 bg-white/[0.02]">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id}>
                {hg.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <button
                          type="button"
                          className={cn(
                            'inline-flex items-center gap-1',
                            canSort && 'cursor-pointer hover:text-white',
                          )}
                          onClick={header.column.getToggleSortingHandler()}
                          disabled={!canSort}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          {canSort && <ArrowUpDown className="h-3 w-3 opacity-50" />}
                        </button>
                      )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  className={cn(onRowClick && 'cursor-pointer')}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center text-sm text-white/40"
                >
                  {empty ?? 'Sin resultados'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between gap-3 text-xs text-white/50">
        <div>
          {rows.length} / {data.length} filas
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <span>
            Página {table.getState().pagination.pageIndex + 1} de{' '}
            {table.getPageCount() || 1}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}
