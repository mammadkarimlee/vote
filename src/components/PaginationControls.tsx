type PaginationControlsProps = {
	totalItems: number;
	page: number;
	pageSize: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (pageSize: number) => void;
	pageSizeOptions?: number[];
};

const buildPageNumbers = (current: number, total: number) => {
	if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
	if (current <= 4) return [1, 2, 3, 4, 5, -1, total];
	if (current >= total - 3)
		return [1, -1, total - 4, total - 3, total - 2, total - 1, total];
	return [1, -1, current - 1, current, current + 1, -1, total];
};

export const PaginationControls = ({
	totalItems,
	page,
	pageSize,
	onPageChange,
	onPageSizeChange,
	pageSizeOptions = [10, 25, 50, 100],
}: PaginationControlsProps) => {
	const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
	const safePage = Math.min(Math.max(page, 1), totalPages);
	const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
	const end = Math.min(totalItems, safePage * pageSize);
	const pages = buildPageNumbers(safePage, totalPages);

	return (
		<div className="pagination">
			<div className="pagination__info">
				<span>
					Göstərilir: {start}-{end} / {totalItems}
				</span>
				<label className="pagination__size">
					<span>Səhifə ölçüsü</span>
					<select
						className="input"
						value={pageSize}
						onChange={(event) => onPageSizeChange(Number(event.target.value))}
					>
						{pageSizeOptions.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</label>
			</div>
			<div className="pagination__buttons">
				<button
					className="btn ghost"
					type="button"
					onClick={() => onPageChange(safePage - 1)}
					disabled={safePage <= 1}
				>
					Əvvəlki
				</button>
				<div className="pagination__pages">
					{pages.map((item, index) =>
						item === -1 ? (
							<span className="pagination__dots" key={`dots-${safePage}-${index}`}>
								...
							</span>
						) : (
							<button
								key={item}
								className={item === safePage ? "btn primary" : "btn"}
								type="button"
								onClick={() => onPageChange(item)}
							>
								{item}
							</button>
						),
					)}
				</div>
				<button
					className="btn ghost"
					type="button"
					onClick={() => onPageChange(safePage + 1)}
					disabled={safePage >= totalPages}
				>
					Sonrakı
				</button>
			</div>
		</div>
	);
};
