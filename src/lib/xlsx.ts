type WorkbookCell = string | number | boolean | null | undefined;

export type WorkbookSheet = {
	name: string;
	headers: string[];
	rows: WorkbookCell[][];
	title?: string;
	metaRows?: WorkbookCell[][];
};

const INVALID_SHEET_NAME_CHARS = /[\\/*?:[\]]/g;

const toSheetName = (rawName: string) => {
	const cleaned = rawName.replace(INVALID_SHEET_NAME_CHARS, " ").trim();
	const collapsed = cleaned.replace(/\s+/g, " ");
	return collapsed || "Sheet";
};

const toUniqueSheetName = (rawName: string, usedNames: Set<string>) => {
	const normalized = toSheetName(rawName);
	let candidate = normalized.slice(0, 31) || "Sheet";
	let suffix = 1;

	while (usedNames.has(candidate)) {
		const suffixText = `_${suffix}`;
		const base = normalized.slice(0, Math.max(1, 31 - suffixText.length));
		candidate = `${base}${suffixText}`;
		suffix += 1;
	}

	usedNames.add(candidate);
	return candidate;
};

export const downloadWorkbook = async (
	filename: string,
	sheets: WorkbookSheet[],
) => {
	const XLSX = await import("xlsx");
	const workbook = XLSX.utils.book_new();
	const usedNames = new Set<string>();

	sheets.forEach((sheet) => {
		const leadingRows = [
			...(sheet.title ? [[sheet.title]] : []),
			...(sheet.metaRows ?? []),
		];
		const headerRowIndex = leadingRows.length;
		const worksheet = XLSX.utils.aoa_to_sheet([
			...leadingRows,
			sheet.headers,
			...sheet.rows,
		]);
		worksheet["!freeze"] = {
			xSplit: 0,
			ySplit: headerRowIndex + 1,
			topLeftCell: `A${headerRowIndex + 2}`,
			activePane: "bottomLeft",
			state: "frozen",
		};
		worksheet["!cols"] = sheet.headers.map((header, columnIndex) => {
			const values = [
				header,
				...sheet.rows.map((row) => row[columnIndex]),
				...leadingRows.map((row) => row[columnIndex]),
			];
			const width = Math.min(
				60,
				Math.max(
					12,
					...values.map((value) => String(value ?? "").length + 2),
				),
			);
			return { wch: width };
		});
		const sheetName = toUniqueSheetName(sheet.name, usedNames);
		XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
	});

	XLSX.writeFile(workbook, filename);
};
