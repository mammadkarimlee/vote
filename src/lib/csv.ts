export const buildCsv = (
	headers: string[],
	rows: Array<Array<string | number | null | undefined>>,
) => {
	const escapeCell = (value: string | number | null | undefined) => {
		const text = value === null || value === undefined ? "" : String(value);
		const escaped = text.replace(/"/g, '""');
		return `"${escaped}"`;
	};

	const lines = [headers.map(escapeCell).join(",")];
	rows.forEach((row) => {
		lines.push(row.map(escapeCell).join(","));
	});
	return `${lines.join("\n")}\n`;
};

export const downloadCsv = (
	filename: string,
	headers: string[],
	rows: Array<Array<string | number | null | undefined>>,
) => {
	const csv = buildCsv(headers, rows);
	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const link = document.createElement("a");
	link.href = URL.createObjectURL(blob);
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	URL.revokeObjectURL(link.href);
};
