import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/biq-template");
await fs.mkdir(outputDir, { recursive: true });

const parseEnv = async (filePath) => {
	const text = await fs.readFile(filePath, "utf8");
	const env = {};
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const index = trimmed.indexOf("=");
		if (index === -1) continue;
		env[trimmed.slice(0, index)] = trimmed.slice(index + 1);
	}
	return env;
};

const env = await parseEnv(".env.local");
const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY;
const orgId = env.VITE_ORG_ID || "default";

if (!supabaseUrl || !serviceRoleKey) {
	throw new Error("Supabase env vars are missing");
}

const restFetch = async (table, query) => {
	const rows = [];
	let from = 0;
	const pageSize = 1000;
	while (true) {
		const url = `${supabaseUrl}/rest/v1/${table}?${query}`;
		const response = await fetch(url, {
			headers: {
				apikey: serviceRoleKey,
				authorization: `Bearer ${serviceRoleKey}`,
				range: `${from}-${from + pageSize - 1}`,
				prefer: "count=exact",
			},
		});
		if (!response.ok) {
			throw new Error(`${table}: ${response.status} ${await response.text()}`);
		}
		const page = await response.json();
		rows.push(...page);
		if (page.length < pageSize) break;
		from += pageSize;
	}
	return rows;
};

const encode = encodeURIComponent;
const [
	branches,
	teachers,
	groups,
	subjects,
	assignments,
	users,
	teacherBiqResults,
	classBiqResults,
	cycles,
] = await Promise.all([
	restFetch("branches", `select=*&org_id=eq.${encode(orgId)}`),
	restFetch(
		"teachers",
		`select=*&org_id=eq.${encode(orgId)}&deleted_at=is.null`,
	),
	restFetch("groups", `select=*&org_id=eq.${encode(orgId)}&deleted_at=is.null`),
	restFetch("subjects", `select=*&org_id=eq.${encode(orgId)}&deleted_at=is.null`),
	restFetch("teaching_assignments", `select=*&org_id=eq.${encode(orgId)}`),
	restFetch("users", `select=*&org_id=eq.${encode(orgId)}`),
	restFetch("pkpd_teacher_biq_results", `select=*&org_id=eq.${encode(orgId)}`),
	restFetch("biq_class_results", `select=*&org_id=eq.${encode(orgId)}`),
	restFetch("survey_cycles", `select=*&org_id=eq.${encode(orgId)}`),
]);

const byId = (rows) => Object.fromEntries(rows.map((row) => [row.id, row]));
const branchById = byId(branches);
const teacherById = byId(teachers);
const groupById = byId(groups);
const subjectById = byId(subjects);
const userById = byId(users);

const latestYear =
	assignments.reduce((max, row) => Math.max(max, Number(row.year ?? 0)), 0) ||
	new Date().getFullYear();

const latestCycle = [...cycles]
	.filter((cycle) => Number(cycle.year ?? 0) <= latestYear)
	.sort((a, b) => {
		const byYear = Number(b.year ?? 0) - Number(a.year ?? 0);
		if (byYear !== 0) return byYear;
		return String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""));
	})[0];

const latestCycleId = latestCycle?.id ?? null;

const existingTeacherScoreByKey = new Map(
	teacherBiqResults
		.filter((row) => !latestCycleId || row.cycle_id === latestCycleId)
		.map((row) => [
			`${row.teacher_id}_${row.group_id}_${row.subject_id}`,
			row.score,
		]),
);

const existingClassScoreByKey = new Map(
	classBiqResults
		.filter((row) => !latestCycleId || row.cycle_id === latestCycleId)
		.map((row) => [`${row.branch_id}_${row.group_id}_${row.subject_id}`, row.score]),
);

const getLogin = (teacher) => {
	if (!teacher) return "";
	if (teacher.login) return teacher.login;
	const user = teacher.user_id ? userById[teacher.user_id] : null;
	return user?.login ?? "";
};

const normalizeTeacherCategory = (teacher) =>
	teacher?.teacher_category || teacher?.category || "standard";

const teacherRows = assignments
	.filter((assignment) => Number(assignment.year) === latestYear)
	.map((assignment) => {
		const teacher = teacherById[assignment.teacher_id];
		const group = groupById[assignment.group_id];
		const subject = subjectById[assignment.subject_id];
		const branch = branchById[assignment.branch_id];
		if (!teacher || !group || !subject || !branch) return null;
		if (normalizeTeacherCategory(teacher) !== "standard") return null;
		const existingScore = existingTeacherScoreByKey.get(
			`${assignment.teacher_id}_${assignment.group_id}_${assignment.subject_id}`,
		);
		return {
			teacher_id: assignment.teacher_id,
			muellim: teacher.name ?? "",
			login: getLogin(teacher),
			branch_id: assignment.branch_id,
			filial: branch.name ?? "",
			group_id: assignment.group_id,
			sinif: group.name ?? "",
			subject_id: assignment.subject_id,
			fenn: subject.name ?? "",
			bal: "",
			movcud_bal: existingScore ?? "",
			qeyd: "",
			year: Number(assignment.year),
		};
	})
	.filter(Boolean)
	.sort((a, b) =>
		[
			a.filial.localeCompare(b.filial, "az"),
			a.muellim.localeCompare(b.muellim, "az"),
			a.sinif.localeCompare(b.sinif, "az", { numeric: true }),
			a.fenn.localeCompare(b.fenn, "az"),
		].find((value) => value !== 0) ?? 0,
	);

const classRowsByKey = new Map();
for (const row of teacherRows) {
	const key = `${row.branch_id}_${row.group_id}_${row.subject_id}`;
	if (!classRowsByKey.has(key)) {
		const existingScore = existingClassScoreByKey.get(key);
		classRowsByKey.set(key, {
			branch_id: row.branch_id,
			filial: row.filial,
			group_id: row.group_id,
			sinif: row.sinif,
			subject_id: row.subject_id,
			fenn: row.fenn,
			bal: "",
			movcud_bal: existingScore ?? "",
			qeyd: "",
			year: row.year,
		});
	}
}

const classRows = Array.from(classRowsByKey.values()).sort((a, b) =>
	[
		a.filial.localeCompare(b.filial, "az"),
		a.sinif.localeCompare(b.sinif, "az", { numeric: true }),
		a.fenn.localeCompare(b.fenn, "az"),
	].find((value) => value !== 0) ?? 0,
);

const theme = {
	teal: "#0F766E",
	tealDark: "#134E4A",
	tealLight: "#CCFBF1",
	blue: "#1D4ED8",
	blueLight: "#DBEAFE",
	amber: "#FEF3C7",
	gray: "#E2E8F0",
	text: "#0F172A",
};

const styleHeader = (sheet, range, fill = theme.teal) => {
	sheet.getRange(range).format = {
		fill,
		font: { bold: true, color: "#FFFFFF" },
		wrapText: true,
		horizontalAlignment: "center",
		verticalAlignment: "center",
	};
};

const styleNote = (sheet, range, fill = theme.amber) => {
	sheet.getRange(range).format = {
		fill,
		font: { color: theme.text },
		wrapText: true,
		verticalAlignment: "top",
	};
};

const addTeacherSheet = (workbook, rows, sheetName = "biq_muellim") => {
	const sheet = workbook.worksheets.add(sheetName);
	const headers = [
		"teacher_id",
		"muellim",
		"login",
		"branch_id",
		"filial",
		"group_id",
		"sinif",
		"subject_id",
		"fenn",
		"bal",
		"movcud_bal",
		"qeyd",
	];
	const values = [
		headers,
		...rows.map((row) => [
			row.teacher_id,
			row.muellim,
			row.login,
			row.branch_id,
			row.filial,
			row.group_id,
			row.sinif,
			row.subject_id,
			row.fenn,
			row.bal,
			row.movcud_bal,
			row.qeyd,
		]),
	];
	sheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;
	styleHeader(sheet, `A1:L1`);
	if (values.length > 1) {
		const table = sheet.tables.add(`A1:L${values.length}`, true, `${sheetName.replace(/[^A-Za-z0-9]/g, "")}Table`);
		table.style = "TableStyleMedium4";
	}
	sheet.getRange("A:A").format.columnWidthPx = 115;
	sheet.getRange("B:B").format.columnWidthPx = 190;
	sheet.getRange("C:C").format.columnWidthPx = 120;
	sheet.getRange("D:D").format.columnWidthPx = 115;
	sheet.getRange("E:E").format.columnWidthPx = 155;
	sheet.getRange("F:F").format.columnWidthPx = 115;
	sheet.getRange("G:G").format.columnWidthPx = 90;
	sheet.getRange("H:H").format.columnWidthPx = 115;
	sheet.getRange("I:I").format.columnWidthPx = 170;
	sheet.getRange("J:J").format.columnWidthPx = 85;
	sheet.getRange("K:K").format.columnWidthPx = 95;
	sheet.getRange("L:L").format.columnWidthPx = 220;
	sheet.getRange("A:I").format.numberFormat = "@";
	sheet.getRange("J:K").format.numberFormat = "0.00";
	sheet.getRange("A:I").format = {
		fill: theme.gray,
		font: { color: "#334155" },
		wrapText: true,
	};
	sheet.getRange("J:J").format = {
		fill: "#FFFFFF",
		font: { bold: true, color: theme.text },
	};
	sheet.getRange("K:K").format = {
		fill: theme.blueLight,
		font: { color: "#1E3A8A" },
	};
	sheet.getRange("A1:L1").format.rowHeightPx = 34;
	sheet.getRange(`A2:L${Math.max(values.length, 2)}`).format.rowHeightPx = 24;
	sheet.dataValidations.add({
		range: `J2:J${Math.max(values.length, 2)}`,
		rule: { type: "decimal", operator: "between", formula1: 0, formula2: 100 },
	});
	return sheet;
};

const addClassSheet = (workbook, rows, sheetName = "biq_sinif_fenn") => {
	const sheet = workbook.worksheets.add(sheetName);
	const headers = [
		"branch_id",
		"filial",
		"group_id",
		"sinif",
		"subject_id",
		"fenn",
		"bal",
		"movcud_bal",
		"qeyd",
	];
	const values = [
		headers,
		...rows.map((row) => [
			row.branch_id,
			row.filial,
			row.group_id,
			row.sinif,
			row.subject_id,
			row.fenn,
			row.bal,
			row.movcud_bal,
			row.qeyd,
		]),
	];
	sheet.getRangeByIndexes(0, 0, values.length, headers.length).values = values;
	styleHeader(sheet, `A1:I1`, theme.blue);
	if (values.length > 1) {
		const table = sheet.tables.add(`A1:I${values.length}`, true, `${sheetName.replace(/[^A-Za-z0-9]/g, "")}Table`);
		table.style = "TableStyleMedium2";
	}
	sheet.getRange("A:A").format.columnWidthPx = 115;
	sheet.getRange("B:B").format.columnWidthPx = 155;
	sheet.getRange("C:C").format.columnWidthPx = 115;
	sheet.getRange("D:D").format.columnWidthPx = 90;
	sheet.getRange("E:E").format.columnWidthPx = 115;
	sheet.getRange("F:F").format.columnWidthPx = 170;
	sheet.getRange("G:G").format.columnWidthPx = 85;
	sheet.getRange("H:H").format.columnWidthPx = 95;
	sheet.getRange("I:I").format.columnWidthPx = 220;
	sheet.getRange("A:F").format.numberFormat = "@";
	sheet.getRange("G:H").format.numberFormat = "0.00";
	sheet.getRange("A:F").format = {
		fill: theme.gray,
		font: { color: "#334155" },
		wrapText: true,
	};
	sheet.getRange("G:G").format = {
		fill: "#FFFFFF",
		font: { bold: true, color: theme.text },
	};
	sheet.getRange("H:H").format = {
		fill: theme.blueLight,
		font: { color: "#1E3A8A" },
	};
	sheet.getRange("A1:I1").format.rowHeightPx = 34;
	sheet.getRange(`A2:I${Math.max(values.length, 2)}`).format.rowHeightPx = 24;
	sheet.dataValidations.add({
		range: `G2:G${Math.max(values.length, 2)}`,
		rule: { type: "decimal", operator: "between", formula1: 0, formula2: 100 },
	});
	return sheet;
};

const addRulesSheet = (workbook, name = "Qaydalar") => {
	const sheet = workbook.worksheets.add(name);
	sheet.getRange("A1:F1").merge();
	sheet.getRange("A1").values = [[`BİQ import faylı - ${latestYear}`]];
	sheet.getRange("A1:F1").format = {
		fill: theme.tealDark,
		font: { bold: true, color: "#FFFFFF", size: 16 },
	};
	sheet.getRange("A3:F12").values = [
		["Doldurulacaq sütun", "Açıqlama", "Toxunmaq olar?", "Nümunə", "", ""],
		["bal", "Rəhbərlik yalnız bu sütuna 0-100 arası nəticə yazmalıdır.", "Bəli", "88", "", ""],
		["qeyd", "İstəyə bağlı daxili qeyd üçündür.", "Bəli", "Təsdiqləndi", "", ""],
		["teacher_id/group_id/subject_id", "Sistem import zamanı bu ID-lərlə dəqiq uyğunlaşdırır.", "Xeyr", "dəyişməyin", "", ""],
		["muellim/sinif/fenn", "Oxumaq və yoxlamaq üçündür.", "Xeyr", "sistemdəki adlar", "", ""],
		["movcud_bal", "Sistemdə həmin dövr üçün əvvəl saxlanmış bal varsa görünür.", "Xeyr", "84", "", ""],
		["", "", "", "", "", ""],
		["Qaydalar", "", "", "", "", ""],
		["Başlıqları dəyişməyin. Sətirləri merge etməyin. Balı 0-100 arası yazın. Bal yazılmayan sətrləri importdan əvvəl silmək və ya boş saxlamaq olar.", "", "", "", "", ""],
		[`PKPD dövrü: ${latestCycle?.name ?? latestCycle?.title ?? latestCycleId ?? "sistemdə seçilən dövr"}`, "", "", "", "", ""],
	];
	styleHeader(sheet, "A3:D3", theme.blue);
	styleNote(sheet, "A10:F10");
	sheet.getRange("A10:F10").merge();
	sheet.getRange("A11:F11").merge();
	sheet.getRange("A:D").format = { wrapText: true, verticalAlignment: "top" };
	sheet.getRange("A:A").format.columnWidthPx = 180;
	sheet.getRange("B:B").format.columnWidthPx = 360;
	sheet.getRange("C:C").format.columnWidthPx = 130;
	sheet.getRange("D:D").format.columnWidthPx = 150;
	sheet.getRange("E:F").format.columnWidthPx = 20;
	sheet.getRange("A1:F12").format.rowHeightPx = 30;
	sheet.getRange("A4:F9").format.rowHeightPx = 42;
	sheet.getRange("A10:F10").format.rowHeightPx = 54;
	return sheet;
};

const buildWorkbook = (rows, classRowsForWorkbook, fileName) => {
	const workbook = Workbook.create();
	addTeacherSheet(workbook, rows, "biq_muellim");
	addClassSheet(workbook, classRowsForWorkbook, "biq_sinif_fenn");
	addRulesSheet(workbook);
	return { workbook, fileName };
};

const { workbook: masterWorkbook, fileName: masterFile } = buildWorkbook(
	teacherRows,
	classRows,
	"biq_full_ready_all_branches.xlsx",
);

const preview = await masterWorkbook.render({
	sheetName: "biq_muellim",
	range: `A1:L${Math.min(20, Math.max(teacherRows.length + 1, 2))}`,
	autoCrop: "all",
	scale: 1,
	format: "png",
});
await fs.writeFile(
	path.join(outputDir, "biq_full_ready_preview.png"),
	new Uint8Array(await preview.arrayBuffer()),
);

const errors = await masterWorkbook.inspect({
	kind: "match",
	searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
	options: { useRegex: true, maxResults: 50 },
	summary: "formula error scan",
});
console.log(errors.ndjson);

const masterXlsx = await SpreadsheetFile.exportXlsx(masterWorkbook);
await masterXlsx.save(path.join(outputDir, masterFile));

const branchFileNames = [];
for (const branch of branches.sort((a, b) =>
	String(a.name ?? "").localeCompare(String(b.name ?? ""), "az"),
)) {
	const branchRows = teacherRows.filter((row) => row.branch_id === branch.id);
	if (branchRows.length === 0) continue;
	const branchClassRows = classRows.filter((row) => row.branch_id === branch.id);
	const safeBranchName = String(branch.name ?? branch.id)
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/ə/g, "e")
		.replace(/ı/g, "i")
		.replace(/ö/g, "o")
		.replace(/ü/g, "u")
		.replace(/ğ/g, "g")
		.replace(/ç/g, "c")
		.replace(/ş/g, "s")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 40);
	const fileName = `biq_full_ready_${safeBranchName || branch.id}.xlsx`;
	const { workbook } = buildWorkbook(branchRows, branchClassRows, fileName);
	const xlsx = await SpreadsheetFile.exportXlsx(workbook);
	await xlsx.save(path.join(outputDir, fileName));
	branchFileNames.push(fileName);
}

console.log(
	JSON.stringify(
		{
			year: latestYear,
			cycle: latestCycle?.name ?? latestCycle?.title ?? latestCycleId ?? null,
			teacherRows: teacherRows.length,
			classRows: classRows.length,
			masterFile,
			branchFiles: branchFileNames,
		},
		null,
		2,
	),
);
