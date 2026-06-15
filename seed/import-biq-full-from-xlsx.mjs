import path from "node:path";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });
dotenv.config();

const DEFAULT_FILE = "C:\\Users\\mamma\\Downloads\\biq_full_ready_starsZs (2).xlsx";
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

const averageTeacherBiqRows = (rows) => {
	const totals = new Map();
	for (const row of rows) {
		const key = `${row.org_id}|${row.branch_id}|${row.cycle_id}|${row.teacher_id}`;
		const current = totals.get(key) ?? {
			org_id: row.org_id,
			branch_id: row.branch_id,
			cycle_id: row.cycle_id,
			teacher_id: row.teacher_id,
			sum: 0,
			count: 0,
		};
		current.sum += row.score;
		current.count += 1;
		totals.set(key, current);
	}

	return [...totals.values()].map(({ sum, count, ...row }) => ({
		...row,
		score: count > 0 ? Number((sum / count).toFixed(4)) : 0,
		note: `BIQ import average from ${count} scored row${count === 1 ? "" : "s"}`,
	}));
};

const fetchStoredTeacherAverageRows = async (rows) => {
	const scopeMap = new Map();
	for (const row of rows) {
		const key = `${row.branch_id}|${row.cycle_id}`;
		const current = scopeMap.get(key) ?? {
			branch_id: row.branch_id,
			cycle_id: row.cycle_id,
			teacherIds: new Set(),
		};
		current.teacherIds.add(row.teacher_id);
		scopeMap.set(key, current);
	}

	const storedRows = [];
	for (const scope of scopeMap.values()) {
		const teacherIds = [...scope.teacherIds];
		for (let index = 0; index < teacherIds.length; index += BATCH_SIZE) {
			const chunk = teacherIds.slice(index, index + BATCH_SIZE);
			const { data, error } = await supabase
				.from("pkpd_teacher_biq_results")
				.select("org_id,branch_id,cycle_id,teacher_id,score")
				.eq("org_id", ORG_ID)
				.eq("branch_id", scope.branch_id)
				.eq("cycle_id", scope.cycle_id)
				.in("teacher_id", chunk);
			if (error) throw new Error(`Stored BIQ average lookup failed: ${error.message}`);
			storedRows.push(...(data ?? []));
		}
	}

	return averageTeacherBiqRows(storedRows);
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

const fetchCycleId = async (branchIds) => {
	if (cycleIdArg) return cycleIdArg;

	const { data, error } = await supabase
		.from("survey_cycles")
		.select("id, year, created_at, branch_ids")
		.eq("org_id", ORG_ID)
		.order("year", { ascending: false })
		.order("created_at", { ascending: false });
	if (error) throw new Error(`Cycle lookup failed: ${error.message}`);

	const branchIdSet = new Set(branchIds.filter(Boolean));
	const matchingCycle = (data ?? []).find((cycle) => {
		const cycleBranchIds = Array.isArray(cycle.branch_ids) ? cycle.branch_ids : [];
		return cycleBranchIds.some((id) => branchIdSet.has(id));
	});
	const globalCycle = (data ?? []).find((cycle) => {
		const cycleBranchIds = Array.isArray(cycle.branch_ids) ? cycle.branch_ids : [];
		return cycleBranchIds.length === 0;
	});

	if (matchingCycle?.id) return matchingCycle.id;
	if (globalCycle?.id) return globalCycle.id;
	throw new Error("No survey cycle found for the workbook branch. Pass --cycle=<id>.");
};

const readSheet = (workbook, name) => {
	const sheet = workbook.Sheets[name];
	if (!sheet) return [];
	return xlsx.utils.sheet_to_json(sheet, { defval: "", raw: false });
};

const upsertChunks = async (table, rows, onConflict) => {
	for (let index = 0; index < rows.length; index += BATCH_SIZE) {
		const chunk = rows.slice(index, index + BATCH_SIZE);
		const { error } = await supabase.from(table).upsert(chunk, { onConflict });
		if (error) throw new Error(`${table} upsert failed: ${error.message}`);
	}
};

const workbook = xlsx.readFile(inputFile);
const teacherRowsInput = readSheet(workbook, "biq_muellim");
const classRowsInput = readSheet(workbook, "biq_sinif_fenn");
const cycleId = await fetchCycleId([
	...teacherRowsInput.map((row) => row.branch_id),
	...classRowsInput.map((row) => row.branch_id),
]);

const teacherRowsRaw = teacherRowsInput
	.map((row) => ({
		org_id: ORG_ID,
		branch_id: String(row.branch_id ?? "").trim(),
		cycle_id: cycleId,
		teacher_id: String(row.teacher_id ?? "").trim(),
		group_id: String(row.group_id ?? "").trim(),
		subject_id: String(row.subject_id ?? "").trim(),
		score: toScore(row.bal),
	}))
	.filter((row) => row.score !== null);

const classRowsRaw = classRowsInput
	.map((row) => ({
		org_id: ORG_ID,
		branch_id: String(row.branch_id ?? "").trim(),
		cycle_id: cycleId,
		group_id: String(row.group_id ?? "").trim(),
		subject_id: String(row.subject_id ?? "").trim(),
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
const teacherAverageRows = averageTeacherBiqRows(validTeacherRows);

const report = {
	file: inputFile,
	apply,
	cycleId,
	sheets: workbook.SheetNames.map((name) => ({ name })),
	teacherBiq: {
		inputRows: teacherRowsInput.length,
		scoredRows: teacherRowsRaw.length,
		uniqueRows: teacherRows.length,
		validRows: validTeacherRows.length,
		skippedRows: teacherRows.length - validTeacherRows.length,
		averageRows: teacherAverageRows.length,
	},
	classBiq: {
		inputRows: classRowsInput.length,
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
		"pkpd_teacher_biq_averages",
		await fetchStoredTeacherAverageRows(validTeacherRows),
		"org_id,cycle_id,teacher_id",
	);
	await upsertChunks(
		"biq_class_results",
		validClassRows,
		"org_id,branch_id,cycle_id,group_id,subject_id",
	);
}

console.log(JSON.stringify(report, null, 2));
