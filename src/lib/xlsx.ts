type WorkbookCell = string | number | boolean | null | undefined;

export type WorkbookSheet = {
	name: string;
	headers: string[];
	rows: WorkbookCell[][];
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
		const worksheet = XLSX.utils.aoa_to_sheet([sheet.headers, ...sheet.rows]);
		const sheetName = toUniqueSheetName(sheet.name, usedNames);
		XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
	});

	XLSX.writeFile(workbook, filename);
};

