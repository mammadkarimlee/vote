import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEFAULT_FILE = "C:\\Users\\mamma\\Downloads\\all_excel_to_markdown_full.md";
const ORG_ID = process.env.VITE_ORG_ID || "default";
const BATCH_SIZE = 500;

const args = new Set(process.argv.slice(2));
const getArg = (name, fallback = null) => {
	const prefix = `${name}=`;
	const found = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
	return found ? found.slice(prefix.length) : fallback;
};

const apply = args.has("--apply");
const inputFile = path.resolve(getArg("--file", DEFAULT_FILE));
const cycleIdArg = getArg("--cycle");

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
	console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
	auth: { persistSession: false },
});

const parseMarkdownTables = (content) => {
	const sheets = [];
	const lines = content.split(/\r?\n/);
	let current = null;

	for (const line of lines) {
		const sheetMatch = line.match(/^### Sheet: `([^`]+)`/);
		if (sheetMatch) {
			current = { name: sheetMatch[1], header: null, rows: [] };
			sheets.push(current);
			continue;
		}

		if (!current || !line.startsWith("|")) continue;
		const cells = line
			.replace(/^\|/, "")
			.replace(/\|$/, "")
			.split("|")
			.map((cell) => cell.trim());

		if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
		if (!current.header) {
			current.header = cells;
			continue;
		}
		if (cells.length !== current.header.length) continue;

		current.rows.push(
			Object.fromEntries(current.header.map((header, index) => [header, cells[index]])),
		);
	}

	return sheets;
};

const toScore = (value) => {
	const normalized = String(value ?? "").trim().replace(",", ".");
	if (!normalized) return null;
	const score = Number(normalized);
	return Number.isFinite(score) && score >= 0 && score <= 100 ? score : null;
};

const uniqueBy = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) map.set(keyFn(row), row);
	return [...map.values()];
};

const fetchExistingIds = async (table, column, ids) => {
	const uniqueIds = [...new Set(ids.filter(Boolean))];
	const existing = new Set();
	for (let index = 0; index < uniqueIds.length; index += BATCH_SIZE) {
		const chunk = uniqueIds.slice(index, index + BATCH_SIZE);
		const { data, error } = await supabase
			.from(table)
			.select(column)
			.eq("org_id", ORG_ID)
			.in(column, chunk);
		if (error) throw new Error(`${table} lookup failed: ${error.message}`);
		for (const row of data ?? []) existing.add(row[column]);
	}
	return existing;
};

const fetchCycleId = async () => {
	if (cycleIdArg) return cycleIdArg;
	const { data, error } = await supabase
		.from("survey_cycles")
		.select("id, year, created_at")
		.eq("org_id", ORG_ID)
		.order("year", { ascending: false })
		.order("created_at", { ascending: false })
		.limit(1)
		.single();
	if (error) throw new Error(`Cycle lookup failed: ${error.message}`);
	if (!data?.id) throw new Error("No survey cycle found.");
	return data.id;
};

const upsertChunks = async (table, rows, onConflict) => {
	for (let index = 0; index < rows.length; index += BATCH_SIZE) {
		const chunk = rows.slice(index, index + BATCH_SIZE);
		const { error } = await supabase.from(table).upsert(chunk, { onConflict });
		if (error) throw new Error(`${table} upsert failed: ${error.message}`);
	}
};

const content = fs.readFileSync(inputFile, "utf8");
const sheets = parseMarkdownTables(content);
const cycleId = await fetchCycleId();

const teacherRowsRaw = sheets
	.filter((sheet) => sheet.name === "biq_muellim")
	.flatMap((sheet) => sheet.rows)
	.map((row) => ({
		org_id: ORG_ID,
		branch_id: row.branch_id,
		cycle_id: cycleId,
		teacher_id: row.teacher_id,
		group_id: row.group_id,
		subject_id: row.subject_id,
		score: toScore(row.bal),
	}))
	.filter((row) => row.score !== null);

const classRowsRaw = sheets
	.filter((sheet) => sheet.name === "biq_sinif_fenn")
	.flatMap((sheet) => sheet.rows)
	.map((row) => ({
		org_id: ORG_ID,
		branch_id: row.branch_id,
		cycle_id: cycleId,
		group_id: row.group_id,
		subject_id: row.subject_id,
		score: toScore(row.bal),
	}))
	.filter((row) => row.score !== null);

const teacherRows = uniqueBy(
	teacherRowsRaw,
	(row) => `${row.org_id}|${row.branch_id}|${row.cycle_id}|${row.teacher_id}|${row.group_id}|${row.subject_id}`,
);
const classRows = uniqueBy(
	classRowsRaw,
	(row) => `${row.org_id}|${row.branch_id}|${row.cycle_id}|${row.group_id}|${row.subject_id}`,
);

const [branchIds, teacherIds, groupIds, subjectIds] = await Promise.all([
	fetchExistingIds("branches", "id", [
		...teacherRows.map((row) => row.branch_id),
		...classRows.map((row) => row.branch_id),
	]),
	fetchExistingIds("teachers", "id", teacherRows.map((row) => row.teacher_id)),
	fetchExistingIds("groups", "id", [
		...teacherRows.map((row) => row.group_id),
		...classRows.map((row) => row.group_id),
	]),
	fetchExistingIds("subjects", "id", [
		...teacherRows.map((row) => row.subject_id),
		...classRows.map((row) => row.subject_id),
	]),
]);

const validTeacherRows = teacherRows.filter(
	(row) =>
		branchIds.has(row.branch_id) &&
		teacherIds.has(row.teacher_id) &&
		groupIds.has(row.group_id) &&
		subjectIds.has(row.subject_id),
);
const validClassRows = classRows.filter(
	(row) =>
		branchIds.has(row.branch_id) &&
		groupIds.has(row.group_id) &&
		subjectIds.has(row.subject_id),
);

const report = {
	file: inputFile,
	apply,
	cycleId,
	sheets: sheets.map((sheet) => ({ name: sheet.name, rows: sheet.rows.length })),
	teacherBiq: {
		scoredRows: teacherRowsRaw.length,
		uniqueRows: teacherRows.length,
		validRows: validTeacherRows.length,
		skippedRows: teacherRows.length - validTeacherRows.length,
	},
	classBiq: {
		scoredRows: classRowsRaw.length,
		uniqueRows: classRows.length,
		validRows: validClassRows.length,
		skippedRows: classRows.length - validClassRows.length,
	},
};

if (apply) {
	await upsertChunks(
		"pkpd_teacher_biq_results",
		validTeacherRows,
		"org_id,branch_id,cycle_id,teacher_id,group_id,subject_id",
	);
	await upsertChunks(
		"biq_class_results",
		validClassRows,
		"org_id,branch_id,cycle_id,group_id,subject_id",
	);
}

console.log(JSON.stringify(report, null, 2));
