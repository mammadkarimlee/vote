import { useCallback, useEffect, useMemo, useState } from "react";

export const DEFAULT_PAGE_SIZE_OPTIONS = [15, 30, 50, 100];

export const usePagination = <T,>(items: T[], initialPageSize = 15) => {
	const [page, setPage] = useState(1);
	const [pageSize, setPageSize] = useState(initialPageSize);

	const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
	const safePage = Math.min(page, totalPages);

	useEffect(() => {
		if (page !== safePage) {
			setPage(safePage);
		}
	}, [page, safePage]);

	const paginatedItems = useMemo(() => {
		const start = (safePage - 1) * pageSize;
		return items.slice(start, start + pageSize);
	}, [items, pageSize, safePage]);

	const resetPage = useCallback(() => {
		setPage(1);
	}, []);

	return {
		page: safePage,
		setPage,
		pageSize,
		setPageSize,
		totalItems: items.length,
		paginatedItems,
		resetPage,
	};
};
