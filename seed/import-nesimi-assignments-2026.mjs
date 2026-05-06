import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const args = process.argv.slice(2);

const getArg = (name, fallback = "") => {
	const idx = args.indexOf(`--${name}`);
	if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
	return fallback;
};

const hasFlag = (name) => args.includes(`--${name}`);

const HELP = `Usage:
  node seed/import-nesimi-assignments-2026.mjs --file seed/nesimi-schedule-2026.json
  node seed/import-nesimi-assignments-2026.mjs --file seed/nesimi-schedule-2026.json --apply

Options:
  --file <path>              JSON schedule file. Default: seed/nesimi-schedule-2026.json
  --branch <name>            Branch name. Default: N\u0259simi Campusu
  --year <year>              Assignment year. Default: 2026
  --apply                    Replace DB assignments after validation.
  --allow-missing-logins     Do not fail when scheduled teachers have no teacher login.
  --force-with-tasks         Allow replace when branch already has tasks.
`;

if (hasFlag("help") || hasFlag("h")) {
	console.log(HELP);
	process.exit(0);
}

const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_NAME = getArg("branch", "N\u0259simi Campusu");
const YEAR = Number(getArg("year", "2026"));
const INPUT_FILE = path.resolve(
	process.cwd(),
	getArg("file", path.join("seed", "nesimi-schedule-2026.json")),
);
const SHOULD_APPLY = hasFlag("apply");
const ALLOW_MISSING_LOGINS = hasFlag("allow-missing-logins");
const FORCE_WITH_TASKS = hasFlag("force-with-tasks");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!Number.isInteger(YEAR)) {
	throw new Error(`Invalid --year: ${getArg("year")}`);
}

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error(
		"Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
	);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const AZ_CHAR_MAP = {
	"\u018F": "e",
	"\u0259": "e",
	"\u0130": "i",
	I: "i",
	"\u0131": "i",
	"\u015E": "s",
	"\u015F": "s",
	"\u00C7": "c",
	"\u00E7": "c",
	"\u011E": "g",
	"\u011F": "g",
	"\u00D6": "o",
	"\u00F6": "o",
	"\u00DC": "u",
	"\u00FC": "u",
};

// Ambiguous short aliases must be explicit. Never let fuzzy matching choose.
const TEACHER_ID_OVERRIDES = new Map([
	["leyla e", "nesimi-teacher-leyla-ehmedova-vaqifovna"],
]);

const NON_TEACHER_KEYS = new Set([
	"clubs",
	"clubs 1 2",
	"clubs 3 7",
	"clubs 8",
	"dernek 1 2",
	"dernek 3 6",
]);

const compactSpaces = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const transliterate = (value) =>
	Array.from(String(value ?? ""))
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("");

const normalizeForKey = (value) =>
	transliterate(compactSpaces(value))
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();

const normalizeDisplay = (value) =>
	transliterate(compactSpaces(value))
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.trim();

const slugify = (value) =>
	normalizeForKey(value)
		.replace(/\s+/g, "-")
		.replace(/^-+|-+$/g, "");

const withHash = (prefix, value) => {
	const slug = slugify(value) || "item";
	const hash = createHash("sha1").update(value).digest("hex").slice(0, 6);
	return `${prefix}-${slug}-${hash}`;
};

const firstWord = (value) => compactSpaces(value).split(" ").filter(Boolean)[0] ?? "";
const secondWord = (value) =>
	compactSpaces(value).split(" ").filter(Boolean)[1] ?? "";

const firstChar = (value) => Array.from(compactSpaces(value))[0] ?? "";

const getTeacherAliasKey = (teacher) => {
	const firstName = teacher.first_name || firstWord(teacher.name);
	const lastName = teacher.last_name || secondWord(teacher.name);
	return normalizeForKey(`${firstName} ${firstChar(lastName)}`);
};

const normalizeGroupName = (value) => compactSpaces(value).replace(/\s+/g, "");

const classLevelFromGroupName = (value) => {
	const match = normalizeGroupName(value).match(/^\d+/);
	return match?.[0] ?? "";
};

const isNonTeacherLesson = (lesson) => {
	const teacherKey = normalizeForKey(lesson.muellim);
	const subjectKey = normalizeForKey(lesson.fenn);
	return NON_TEACHER_KEYS.has(teacherKey) || NON_TEACHER_KEYS.has(subjectKey);
};

const readSchedule = () => {
	if (!fs.existsSync(INPUT_FILE)) {
		throw new Error(`Schedule JSON file not found: ${INPUT_FILE}`);
	}

	const raw = fs.readFileSync(INPUT_FILE, "utf8").replace(/^\uFEFF/, "");
	const parsed = JSON.parse(raw);
	if (!Array.isArray(parsed)) {
		throw new Error("Schedule JSON must be an array.");
	}

	const rows = [];
	const skipped = [];
	for (const classEntry of parsed) {
		const sourceClassName = compactSpaces(classEntry?.sinif);
		const groupName = normalizeGroupName(sourceClassName);
		if (!sourceClassName || !Array.isArray(classEntry?.dersler)) {
			throw new Error(`Invalid schedule class entry: ${JSON.stringify(classEntry)}`);
		}

		for (const lesson of classEntry.dersler) {
			const subjectName = compactSpaces(lesson?.fenn);
			const teacherAlias = compactSpaces(lesson?.muellim);
			if (!subjectName || !teacherAlias) {
				throw new Error(
					`Invalid lesson in ${sourceClassName}: ${JSON.stringify(lesson)}`,
				);
			}

			if (isNonTeacherLesson({ fenn: subjectName, muellim: teacherAlias })) {
				skipped.push({ groupName, subjectName, teacherAlias });
				continue;
			}

			rows.push({
				sourceClassName,
				groupName,
				classLevel: classLevelFromGroupName(groupName),
				subjectName,
				teacherAlias,
			});
		}
	}

	const duplicateSubjects = new Map();
	for (const row of rows) {
		const key = `${row.groupName}|${normalizeForKey(row.subjectName)}`;
		const existing = duplicateSubjects.get(key);
		if (!existing) {
			duplicateSubjects.set(key, row);
			continue;
		}

		if (normalizeForKey(existing.teacherAlias) !== normalizeForKey(row.teacherAlias)) {
			throw new Error(
				`Duplicate class+subject with different teachers: ${row.groupName} / ${row.subjectName}: ${existing.teacherAlias}, ${row.teacherAlias}`,
			);
		}
	}

	return { rows, skipped };
};

const fetchAll = async (table, buildQuery) => {
	const pageSize = 1000;
	const rows = [];
	for (let from = 0; ; from += pageSize) {
		const to = from + pageSize - 1;
		const query = buildQuery(supabase.from(table).select("*")).range(from, to);
		const { data, error } = await query;
		if (error) throw error;
		rows.push(...(data ?? []));
		if (!data || data.length < pageSize) break;
	}
	return rows;
};

const findBranch = async () => {
	const { data, error } = await supabase
		.from("branches")
		.select("*")
		.eq("org_id", ORG_ID)
		.is("deleted_at", null);
	if (error) throw error;

	const targetKey = normalizeForKey(BRANCH_NAME);
	const branch = (data ?? []).find(
		(item) =>
			normalizeForKey(item.name) === targetKey ||
			normalizeForKey(item.code) === normalizeForKey("NES"),
	);
	if (!branch) {
		throw new Error(`Branch not found: ${BRANCH_NAME}`);
	}
	return branch;
};

const indexBy = (rows, keyFn) => {
	const map = new Map();
	for (const row of rows) {
		const key = keyFn(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return map;
};

const resolveTeachers = ({ rows, teachers }) => {
	const teachersByAlias = indexBy(teachers, getTeacherAliasKey);
	const teachersById = new Map(teachers.map((teacher) => [teacher.id, teacher]));
	const aliases = Array.from(new Set(rows.map((row) => row.teacherAlias))).sort();
	const resolved = new Map();
	const errors = [];

	for (const alias of aliases) {
		const aliasKey = normalizeForKey(alias);
		const overrideId = TEACHER_ID_OVERRIDES.get(aliasKey);

		if (overrideId) {
			const teacher = teachersById.get(overrideId);
			if (!teacher) {
				errors.push(`${alias}: override teacher_id not found (${overrideId})`);
				continue;
			}
			resolved.set(alias, teacher);
			continue;
		}

		const matches = teachersByAlias.get(aliasKey) ?? [];
		if (matches.length === 0) {
			errors.push(`${alias}: teacher alias not found in DB`);
			continue;
		}
		if (matches.length > 1) {
			errors.push(
				`${alias}: ambiguous teacher alias (${matches
					.map((teacher) => `${teacher.id} / ${teacher.name}`)
					.join("; ")})`,
			);
			continue;
		}
		resolved.set(alias, matches[0]);
	}

	const scheduledTeachers = Array.from(
		new Map(Array.from(resolved.values()).map((teacher) => [teacher.id, teacher])).values(),
	);
	const missingLogins = scheduledTeachers.filter((teacher) => !teacher.user_id);
	if (missingLogins.length > 0 && !ALLOW_MISSING_LOGINS) {
		errors.push(
			`Scheduled teachers without user_id/login: ${missingLogins
				.map((teacher) => `${teacher.id} / ${teacher.name}`)
				.join("; ")}`,
		);
	}

	if (errors.length > 0) {
		throw new Error(`Teacher validation failed:\n- ${errors.join("\n- ")}`);
	}

	return { resolved, scheduledTeachers, missingLogins };
};

const resolveGroups = ({ rows, groups }) => {
	const groupsByName = indexBy(groups, (group) => normalizeGroupName(group.name));
	const resolved = new Map();
	const errors = [];

	for (const groupName of Array.from(new Set(rows.map((row) => row.groupName))).sort()) {
		const matches = groupsByName.get(groupName) ?? [];
		if (matches.length === 0) {
			errors.push(`${groupName}: group not found in DB`);
			continue;
		}
		if (matches.length > 1) {
			errors.push(`${groupName}: duplicate group name in DB`);
			continue;
		}
		resolved.set(groupName, matches[0]);
	}

	if (errors.length > 0) {
		throw new Error(`Group validation failed:\n- ${errors.join("\n- ")}`);
	}

	return resolved;
};

const resolveSubjects = ({ rows, subjects }) => {
	const subjectsByDisplay = indexBy(subjects, (subject) => normalizeDisplay(subject.name));
	const subjectsByKey = indexBy(subjects, (subject) => normalizeForKey(subject.name));
	const resolved = new Map();
	const toCreate = [];
	const errors = [];

	for (const subjectName of Array.from(new Set(rows.map((row) => row.subjectName))).sort()) {
		const displayMatches = subjectsByDisplay.get(normalizeDisplay(subjectName)) ?? [];
		if (displayMatches.length === 1) {
			resolved.set(subjectName, displayMatches[0]);
			continue;
		}
		if (displayMatches.length > 1) {
			errors.push(`${subjectName}: duplicate exact subject names in DB`);
			continue;
		}

		const keyMatches = subjectsByKey.get(normalizeForKey(subjectName)) ?? [];
		if (keyMatches.length === 1) {
			resolved.set(subjectName, keyMatches[0]);
			continue;
		}
		if (keyMatches.length > 1) {
			errors.push(
				`${subjectName}: ambiguous subject match (${keyMatches
					.map((subject) => `${subject.id} / ${subject.name}`)
					.join("; ")})`,
			);
			continue;
		}

		const subject = {
			id: withHash("nesimi-ta-subject", subjectName),
			org_id: ORG_ID,
			name: subjectName,
			code: null,
			deleted_at: null,
			archived_at: null,
		};
		resolved.set(subjectName, subject);
		toCreate.push(subject);
	}

	if (errors.length > 0) {
		throw new Error(`Subject validation failed:\n- ${errors.join("\n- ")}`);
	}

	return { resolved, toCreate };
};

const buildAssignmentRows = ({ rows, teacherMap, groupMap, subjectMap, branchId }) => {
	const assignments = [];
	const seen = new Set();

	for (const row of rows) {
		const teacher = teacherMap.get(row.teacherAlias);
		const group = groupMap.get(row.groupName);
		const subject = subjectMap.get(row.subjectName);
		if (!teacher || !group || !subject) {
			throw new Error(`Internal resolve error for row: ${JSON.stringify(row)}`);
		}

		const key = `${teacher.id}|${group.id}|${subject.id}|${branchId}|${YEAR}`;
		if (seen.has(key)) continue;
		seen.add(key);

		assignments.push({
			org_id: ORG_ID,
			teacher_id: teacher.id,
			group_id: group.id,
			subject_id: subject.id,
			branch_id: branchId,
			year: YEAR,
			deleted_at: null,
			archived_at: null,
		});
	}

	return assignments;
};

const writeBackup = ({ branch, existingAssignments, assignments, skipped }) => {
	const backupDir = path.join(__dirname, "backups");
	fs.mkdirSync(backupDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = path.join(
		backupDir,
		`nesimi-assignments-${YEAR}-${stamp}.json`,
	);
	fs.writeFileSync(
		backupPath,
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				orgId: ORG_ID,
				branch: { id: branch.id, name: branch.name },
				year: YEAR,
				existingAssignments,
				newAssignmentCount: assignments.length,
				skipped,
			},
			null,
			2,
		),
	);
	return backupPath;
};

const assertNoTasks = async (branchId) => {
	const { count, error } = await supabase
		.from("tasks")
		.select("id", { count: "exact", head: true })
		.eq("org_id", ORG_ID)
		.eq("branch_id", branchId);
	if (error) throw error;
	if ((count ?? 0) > 0 && !FORCE_WITH_TASKS) {
		throw new Error(
			`Branch already has ${count} task(s). Re-run with --force-with-tasks only if this is intentional.`,
		);
	}
	return count ?? 0;
};

const applyReplacement = async ({ branch, assignments, subjectsToCreate, skipped }) => {
	const taskCount = await assertNoTasks(branch.id);
	const existingAssignments = await fetchAll("teaching_assignments", (query) =>
		query
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.eq("year", YEAR),
	);

	const backupPath = writeBackup({
		branch,
		existingAssignments,
		assignments,
		skipped,
	});

	if (subjectsToCreate.length > 0) {
		const { error } = await supabase.from("subjects").upsert(subjectsToCreate, {
			onConflict: "id",
		});
		if (error) throw error;
	}

	const { data: deletedRows, error: deleteError } = await supabase
		.from("teaching_assignments")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("branch_id", branch.id)
		.eq("year", YEAR)
		.select("id");
	if (deleteError) throw deleteError;

	for (let i = 0; i < assignments.length; i += 500) {
		const chunk = assignments.slice(i, i + 500);
		const { error } = await supabase.from("teaching_assignments").insert(chunk);
		if (error) throw error;
	}

	const { count, error: countError } = await supabase
		.from("teaching_assignments")
		.select("id", { count: "exact", head: true })
		.eq("org_id", ORG_ID)
		.eq("branch_id", branch.id)
		.eq("year", YEAR)
		.is("deleted_at", null);
	if (countError) throw countError;

	if (count !== assignments.length) {
		throw new Error(
			`Post-apply count mismatch. Expected ${assignments.length}, got ${count}. Backup: ${backupPath}`,
		);
	}

	return {
		backupPath,
		taskCount,
		deletedCount: deletedRows?.length ?? 0,
		insertedCount: assignments.length,
	};
};

const main = async () => {
	const { rows, skipped } = readSchedule();
	const branch = await findBranch();
	const [teachers, groups, subjects] = await Promise.all([
		fetchAll("teachers", (query) =>
			query
				.eq("org_id", ORG_ID)
				.or(`branch_id.eq.${branch.id},branch_ids.cs.{${branch.id}}`)
				.is("deleted_at", null),
		),
		fetchAll("groups", (query) =>
			query
				.eq("org_id", ORG_ID)
				.eq("branch_id", branch.id)
				.is("deleted_at", null),
		),
		fetchAll("subjects", (query) =>
			query.eq("org_id", ORG_ID).is("deleted_at", null),
		),
	]);

	const teacherResult = resolveTeachers({ rows, teachers });
	const groupMap = resolveGroups({ rows, groups });
	const subjectResult = resolveSubjects({ rows, subjects });
	const assignments = buildAssignmentRows({
		rows,
		teacherMap: teacherResult.resolved,
		groupMap,
		subjectMap: subjectResult.resolved,
		branchId: branch.id,
	});

	const summary = {
		mode: SHOULD_APPLY ? "apply" : "validate",
		branch: `${branch.name} (${branch.id})`,
		year: YEAR,
		sourceRows: rows.length,
		skippedNonTeacherRows: skipped.length,
		classes: new Set(rows.map((row) => row.groupName)).size,
		teacherAliases: teacherResult.resolved.size,
		scheduledTeachers: teacherResult.scheduledTeachers.length,
		subjectsToCreate: subjectResult.toCreate.length,
		assignments: assignments.length,
	};

	console.log(JSON.stringify(summary, null, 2));

	if (!SHOULD_APPLY) {
		console.log("Validation passed. Re-run with --apply to replace DB rows.");
		return;
	}

	const result = await applyReplacement({
		branch,
		assignments,
		subjectsToCreate: subjectResult.toCreate,
		skipped,
	});
	console.log(JSON.stringify(result, null, 2));
};

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
