import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "../lib/utils";
import { EmptyState, LoadingSkeleton } from "./dashboard";

type SortDirection = "asc" | "desc";
export type SortState = { key: string; direction: SortDirection } | null;

export type DataTableColumn<T> = {
	key: string;
	header: ReactNode;
	render: (row: T) => ReactNode;
	sortValue?: (row: T) => string | number | null | undefined;
	className?: string;
};

export const SortableHeader = ({
	children,
	active,
	direction,
	onClick,
}: {
	children: ReactNode;
	active: boolean;
	direction?: SortDirection;
	onClick?: () => void;
}) => (
	<button
		className="sortable-header"
		type="button"
		onClick={onClick}
		aria-sort={
			active ? (direction === "asc" ? "ascending" : "descending") : "none"
		}
	>
		<span>{children}</span>
		<span className="sort-icon" aria-hidden>
			{!active ? "↕" : direction === "asc" ? "↑" : "↓"}
		</span>
	</button>
);

const compareValues = (
	first: string | number | null | undefined,
	second: string | number | null | undefined,
) => {
	if (first === null || first === undefined) return second === null || second === undefined ? 0 : 1;
	if (second === null || second === undefined) return -1;
	if (typeof first === "number" && typeof second === "number") return first - second;
	return String(first).localeCompare(String(second), "az", {
		numeric: true,
		sensitivity: "base",
	});
};

export const sortData = <T,>(
	data: T[],
	columns: Array<DataTableColumn<T>>,
	sort: SortState,
) => {
		if (!sort) return data;
		const column = columns.find((item) => item.key === sort.key);
		if (!column?.sortValue) return data;
		const direction = sort.direction === "asc" ? 1 : -1;
		return [...data].sort(
			(a, b) => compareValues(column.sortValue?.(a), column.sortValue?.(b)) * direction,
		);
};

export const getNextSort = (previous: SortState, key: string): SortState => {
	if (!previous || previous.key !== key) return { key, direction: "asc" };
	if (previous.direction === "asc") return { key, direction: "desc" };
	return null;
};

export const useSortedData = <T,>(
	data: T[],
	columns: Array<DataTableColumn<T>>,
) => {
	const [sort, setSort] = useState<SortState>(null);
	const sortedData = useMemo(
		() => sortData(data, columns, sort),
		[columns, data, sort],
	);

	const toggleSort = (key: string) => {
		setSort((previous) => getNextSort(previous, key));
	};

	return { sortedData, sort, toggleSort };
};

export const DataTable = <T,>({
	columns,
	rows,
	getRowKey,
	emptyTitle = "Bu filterlərə uyğun məlumat tapılmadı.",
	emptyDescription = "Filterləri dəyişərək yenidən yoxlayın.",
	loading = false,
	sort: controlledSort,
	onSortChange,
	className,
}: {
	columns: Array<DataTableColumn<T>>;
	rows: T[];
	getRowKey: (row: T) => string;
	emptyTitle?: ReactNode;
	emptyDescription?: ReactNode;
	loading?: boolean;
	sort?: SortState;
	onSortChange?: (sort: SortState) => void;
	className?: string;
}) => {
	const [internalSort, setInternalSort] = useState<SortState>(null);
	const sort = controlledSort === undefined ? internalSort : controlledSort;
	const sortedData = useMemo(
		() => (controlledSort === undefined ? sortData(rows, columns, sort) : rows),
		[columns, controlledSort, rows, sort],
	);
	const toggleSort = (key: string) => {
		const nextSort = getNextSort(sort, key);
		if (controlledSort === undefined) {
			setInternalSort(nextSort);
		}
		onSortChange?.(nextSort);
	};

	return (
		<div className={cn("modern-data-table", className)}>
			<div className="modern-data-table__scroll">
				<table>
					<thead>
						<tr>
							{columns.map((column) => (
								<th key={column.key} className={column.className}>
									{column.sortValue ? (
										<SortableHeader
											active={sort?.key === column.key}
											direction={sort?.direction}
											onClick={() => toggleSort(column.key)}
										>
											{column.header}
										</SortableHeader>
									) : (
										column.header
									)}
								</th>
							))}
						</tr>
					</thead>
					<tbody>
						{!loading &&
							sortedData.map((row) => (
								<tr key={getRowKey(row)}>
									{columns.map((column) => (
										<td key={column.key} className={column.className}>
											{column.render(row)}
										</td>
									))}
								</tr>
							))}
					</tbody>
				</table>
				{loading && (
					<div className="p-3">
						<LoadingSkeleton rows={5} />
					</div>
				)}
				{!loading && sortedData.length === 0 && (
					<EmptyState title={emptyTitle} description={emptyDescription} />
				)}
			</div>
		</div>
	);
};

export const ActionMenu = ({
	items,
	label = "Əməliyyatlar",
}: {
	label?: string;
	items: Array<{
		label: ReactNode;
		onSelect?: () => void;
		href?: string;
		tone?: "default" | "danger";
		disabled?: boolean;
	}>;
}) => {
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		if (!open) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) setOpen(false);
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div className="action-menu" ref={ref}>
			<button
				className="action-menu__trigger"
				type="button"
				aria-label={label}
				aria-haspopup="menu"
				aria-expanded={open}
				onClick={() => setOpen((value) => !value)}
			>
				⋯
			</button>
			{open && (
				<div className="action-menu__content" role="menu">
					{items.map((item, index) =>
						item.href ? (
							<a
								className={cn(
									"action-menu__item",
									item.tone === "danger" && "danger",
									item.disabled && "disabled",
								)}
								href={item.disabled ? undefined : item.href}
								key={index}
								role="menuitem"
								onClick={() => setOpen(false)}
							>
								{item.label}
							</a>
						) : (
							<button
								className={cn(
									"action-menu__item",
									item.tone === "danger" && "danger",
								)}
								type="button"
								key={index}
								role="menuitem"
								disabled={item.disabled}
								onClick={() => {
									setOpen(false);
									item.onSelect?.();
								}}
							>
								{item.label}
							</button>
						),
					)}
				</div>
			)}
		</div>
	);
};
