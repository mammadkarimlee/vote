import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const args = process.argv.slice(2);
const hasFlag = (name) => args.includes(`--${name}`);
const getArg = (name, fallback = "") => {
	const idx = args.indexOf(`--${name}`);
	return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : fallback;
};

const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_CODE = getArg("branch-code", "AZA");
const YEAR = Number(getArg("year", "2026"));
const INPUT_FILE = path.resolve(
	process.cwd(),
	getArg(
		"file",
		"C:/Users/mamma/Downloads/Sagirdlərin siyahısı 2025-2026  yeni (3).xlsx",
	),
);
const APPLY = hasFlag("apply");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

if (!Number.isInteger(YEAR)) {
	throw new Error(`Invalid --year: ${YEAR}`);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const AZ_CHAR_MAP = {
	Ə: "e",
	ə: "e",
	İ: "i",
	I: "i",
	ı: "i",
	Ş: "s",
	ş: "s",
	Ç: "c",
	ç: "c",
	Ğ: "g",
	ğ: "g",
	Ö: "o",
	ö: "o",
	Ü: "u",
	ü: "u",
};

const TEACHER_ID_OVERRIDES = new Map([
	["fatime ibrahimova", "azadliq-teacher-ibrahimova-fatime-vidadiyevna"],
	["leman babaxanova", "azadliq-teacher-liaman-badalova-xxx"],
	["nermin emirli", "azadliq-teacher-nermin-emirova-eldar-qizi"],
	["oqtay babayev", "azadliq-teacher-oktay-babayev-ezizaga-oglu"],
]);

const TEACHER_DISPLAY_FIXES = [
	{
		id: "azadliq-teacher-liaman-badalova-xxx",
		name: "Ləman Babaxanova",
		first_name: "Ləman",
		last_name: "Babaxanova",
	},
	{
		id: "azadliq-teacher-ibrahimova-fatime-vidadiyevna",
		name: "Fatimə İbrahimova Vidadiyevna",
		first_name: "Fatimə",
		last_name: "İbrahimova",
	},
	{
		id: "azadliq-teacher-nermin-emirova-eldar-qizi",
		name: "Nərmin Əmirli",
		first_name: "Nərmin",
		last_name: "Əmirli",
	},
];

const STUDENT_ALIASES = new Map([
	["eliyev samir samir", { dbKey: "aliyev samir samir", updateName: true }],
	["quliyev miraga", { dbKey: "quliyev miraga aqsin", updateName: false }],
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

const slugify = (value) =>
	normalizeForKey(value)
		.replace(/\s+/g, "-")
		.replace(/^-+|-+$/g, "");

const stableId = (prefix, value) => {
	const slug = slugify(value) || "item";
	const hash = createHash("sha1").update(value).digest("hex").slice(0, 6);
	return `${prefix}-${slug}-${hash}`;
};

const classLevelFromGroup = (groupName) => {
	const match = compactSpaces(groupName).match(/^\d+/);
	return match?.[0] ?? "";
};

const groupNameFromSheetAndBlock = (sheetName, blockCell) => {
	const sheet = compactSpaces(sheetName);
	const block = compactSpaces(blockCell);
	if (!/^\d+$/.test(block)) return sheet;
	const match = sheet.match(/^(\d+[A-Za-z]+)\d+$/);
	if (!match) return sheet;
	return `${match[1]}${block}`;
};

const isTeacherHeader = (teacherCell, subjectCell) => {
	const left = compactSpaces(teacherCell).toLowerCase();
	const right = compactSpaces(subjectCell).toLowerCase();
	return (
		(left.includes("llim") || left.includes("muellim")) &&
		left.includes("ad") &&
		(right.includes("dris") || right.includes("fənn") || right.includes("fenn"))
	);
};

const readWorkbook = () => {
	if (!fs.existsSync(INPUT_FILE)) {
		throw new Error(`Input workbook not found: ${INPUT_FILE}`);
	}

	const workbook = xlsx.readFile(INPUT_FILE);
	const students = [];
	const assignmentRows = [];
	const duplicateStudentNames = [];
	const seenStudentKeys = new Map();

	for (const sheetName of workbook.SheetNames) {
		if (sheetName === "Sheet3") continue;
		const rows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], {
			header: 1,
			defval: null,
			blankrows: false,
		});
		if (rows.length === 0) continue;

		let headerRow = -1;
		let teacherCol = -1;
		let subjectCol = -1;
		for (let r = 0; r < rows.length; r += 1) {
			const cells = rows[r].map(compactSpaces);
			for (let c = 0; c < cells.length; c += 1) {
				if (isTeacherHeader(cells[c], cells[c + 1] ?? "")) {
					headerRow = r;
					teacherCol = c;
					subjectCol = c + 1;
					break;
				}
			}
			if (headerRow >= 0) break;
		}

		if (headerRow < 0) {
			throw new Error(`Teacher section not found in sheet: ${sheetName}`);
		}

		for (const row of rows.slice(1, headerRow)) {
			const no = row[0];
			const surname = compactSpaces(row[1]);
			const firstName = compactSpaces(row[2]);
			const fatherName = compactSpaces(row[3]);
			const groupName = groupNameFromSheetAndBlock(sheetName, row[4]);
			const hasNumber = typeof no === "number" || /^\d+$/.test(compactSpaces(no));
			if (!hasNumber || (!surname && !firstName)) continue;

			const name = compactSpaces([surname, firstName, fatherName].filter(Boolean).join(" "));
			const key = normalizeForKey(name);
			const entry = {
				name,
				groupName,
				classLevel: classLevelFromGroup(groupName),
			};
			if (seenStudentKeys.has(key)) {
				duplicateStudentNames.push({
					name,
					keptGroupName: seenStudentKeys.get(key).groupName,
					ignoredGroupName: sheetName,
				});
				continue;
			}
			seenStudentKeys.set(key, entry);
			students.push(entry);
		}

		for (const row of rows.slice(headerRow + 1)) {
			const teacherAlias = compactSpaces(row[teacherCol]);
			const sourceSubject = compactSpaces(row[subjectCol]);
			if (!teacherAlias || !sourceSubject) continue;
			assignmentRows.push({
				groupName: sheetName,
				classLevel: classLevelFromGroup(sheetName),
				teacherAlias,
				sourceSubject,
				subjectName: canonicalSubjectName(sourceSubject, sheetName),
			});
		}
	}

	return { students, assignmentRows, duplicateStudentNames };
};

function canonicalSubjectName(sourceSubject, groupName) {
	const key = normalizeForKey(sourceSubject);
	const isRussianGroup = /\d+R/i.test(compactSpaces(groupName));
	if (key === "xarici dil") return "İngilis dili";
	if (key === "tedris dili" || key === "edebiyyat") {
		return isRussianGroup ? "Rus dili və ədəbiyyat" : "Azərbaycan dili və ədəbiyyat";
	}
	const direct = new Map([
		["biologiya", "Biologiya"],
		["cografiya", "Coğrafiya"],
		["fizika", "Fizika"],
		["informatika", "İnformatika"],
		["kimya", "Kimya"],
		["riyaziyyat", "Riyaziyyat"],
		["tarix", "Tarix"],
	]);
	return direct.get(key) ?? sourceSubject;
}

const fetchAll = async (table, select = "*", buildQuery = (query) => query) => {
	const pageSize = 1000;
	const rows = [];
	for (let from = 0; ; from += pageSize) {
		const query = buildQuery(supabase.from(table).select(select)).range(
			from,
			from + pageSize - 1,
		);
		const { data, error } = await query;
		if (error) throw new Error(`${table} fetch failed: ${error.message}`);
		rows.push(...(data ?? []));
		if (!data || data.length < pageSize) break;
	}
	return rows;
};

const indexOneBy = (rows, getKey) => {
	const map = new Map();
	for (const row of rows) map.set(getKey(row), row);
	return map;
};

const indexManyBy = (rows, getKey) => {
	const map = new Map();
	for (const row of rows) {
		const key = getKey(row);
		const bucket = map.get(key) ?? [];
		bucket.push(row);
		map.set(key, bucket);
	}
	return map;
};

const findBranch = async () => {
	const branches = await fetchAll("branches", "*", (query) =>
		query.eq("org_id", ORG_ID).or(`code.eq.${BRANCH_CODE},name.ilike.%Azad%`),
	);
	const branch =
		branches.find((item) => item.code === BRANCH_CODE) ??
		branches.find((item) => normalizeForKey(item.name).includes("azadliq"));
	if (!branch) throw new Error(`Branch not found by code/name: ${BRANCH_CODE}`);
	return branch;
};

const loadState = async (branch) => {
	const [
		groups,
		students,
		teachers,
		subjects,
		assignments,
		tasks,
		submissions,
		users,
		usernames,
	] = await Promise.all([
		fetchAll("groups", "*", (query) => query.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
		fetchAll("students", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id),
		),
		fetchAll("teachers", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id),
		),
		fetchAll("subjects", "*", (query) => query.eq("org_id", ORG_ID)),
		fetchAll("teaching_assignments", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id).eq("year", YEAR),
		),
		fetchAll("tasks", "*", (query) => query.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
		fetchAll("submissions", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id),
		),
		fetchAll("users", "*", (query) => query.eq("org_id", ORG_ID).eq("branch_id", branch.id)),
		fetchAll("usernames", "*", (query) =>
			query.eq("org_id", ORG_ID).eq("branch_id", branch.id),
		),
	]);
	return { branch, groups, students, teachers, subjects, assignments, tasks, submissions, users, usernames };
};

const resolveGroups = ({ sourceGroupNames, state }) => {
	const existingByName = indexOneBy(state.groups, (group) => normalizeForKey(group.name));
	const toCreate = [];
	const groupMap = new Map();

	for (const groupName of sourceGroupNames) {
		const key = normalizeForKey(groupName);
		let group = existingByName.get(key);
		if (!group) {
			group = {
				id: stableId("azadliq-group", groupName),
				org_id: ORG_ID,
				branch_id: state.branch.id,
				name: groupName,
				class_level: classLevelFromGroup(groupName),
			};
			toCreate.push(group);
			existingByName.set(key, group);
			state.groups.push(group);
		}
		groupMap.set(groupName, group);
	}

	return { groupMap, toCreate };
};

const resolveTeachers = ({ rows, state }) => {
	const teachersById = indexOneBy(state.teachers, (teacher) => teacher.id);
	const teachersByShortName = indexManyBy(state.teachers, (teacher) => {
		const firstName = teacher.first_name || compactSpaces(teacher.name).split(" ")[0] || "";
		const lastName = teacher.last_name || compactSpaces(teacher.name).split(" ")[1] || "";
		return normalizeForKey(`${firstName} ${lastName}`);
	});
	const teacherMap = new Map();
	const errors = [];

	for (const alias of Array.from(new Set(rows.map((row) => row.teacherAlias))).sort((a, b) =>
		a.localeCompare(b, "az"),
	)) {
		const key = normalizeForKey(alias);
		const overrideId = TEACHER_ID_OVERRIDES.get(key);
		if (overrideId) {
			const teacher = teachersById.get(overrideId);
			if (!teacher) errors.push(`${alias}: override teacher id not found (${overrideId})`);
			else teacherMap.set(alias, teacher);
			continue;
		}

		const matches = teachersByShortName.get(key) ?? [];
		if (matches.length !== 1) {
			errors.push(`${alias}: teacher resolve failed (${matches.length} matches)`);
			continue;
		}
		teacherMap.set(alias, matches[0]);
	}

	if (errors.length > 0) {
		throw new Error(`Teacher resolution failed:\n- ${errors.join("\n- ")}`);
	}

	return teacherMap;
};

const resolveSubjects = ({ rows, state }) => {
	const subjectsByName = indexOneBy(state.subjects, (subject) => normalizeForKey(subject.name));
	const subjectMap = new Map();
	const errors = [];

	for (const subjectName of Array.from(new Set(rows.map((row) => row.subjectName))).sort((a, b) =>
		a.localeCompare(b, "az"),
	)) {
		const subject = subjectsByName.get(normalizeForKey(subjectName));
		if (!subject) {
			errors.push(subjectName);
			continue;
		}
		subjectMap.set(subjectName, subject);
	}

	if (errors.length > 0) {
		throw new Error(`Subject(s) not found:\n- ${errors.join("\n- ")}`);
	}

	return subjectMap;
};

const buildAssignments = ({ rows, state, groupMap, teacherMap, subjectMap }) => {
	const unique = new Map();
	const duplicateRows = [];
	for (const row of rows) {
		const group = groupMap.get(row.groupName);
		const teacher = teacherMap.get(row.teacherAlias);
		const subject = subjectMap.get(row.subjectName);
		if (!group || !teacher || !subject) {
			throw new Error(`Unresolved row: ${JSON.stringify(row)}`);
		}
		const key = `${teacher.id}|${group.id}|${subject.id}`;
		if (unique.has(key)) {
			duplicateRows.push(row);
			continue;
		}
		unique.set(key, {
			org_id: ORG_ID,
			teacher_id: teacher.id,
			group_id: group.id,
			subject_id: subject.id,
			branch_id: state.branch.id,
			year: YEAR,
		});
	}
	return { assignments: Array.from(unique.values()), duplicateRows };
};

const buildStudentPlan = ({ sourceStudents, state, groupMap }) => {
	const studentsByKey = indexOneBy(state.students, (student) => normalizeForKey(student.name));
	const toCreate = [];
	const toUpdate = [];
	const userDisplayUpdates = [];
	const unresolved = [];

	for (const source of sourceStudents) {
		const group = groupMap.get(source.groupName);
		if (!group) {
			unresolved.push(`${source.name}: group not found (${source.groupName})`);
			continue;
		}

		const sourceKey = normalizeForKey(source.name);
		const alias = STUDENT_ALIASES.get(sourceKey);
		let student = studentsByKey.get(sourceKey);
		if (!student && alias?.dbKey) {
			student = studentsByKey.get(alias.dbKey);
		}

		if (!student) {
			student = {
				id: stableId("azadliq-student", `${source.groupName}-${source.name}`),
				org_id: ORG_ID,
				name: source.name,
				branch_id: state.branch.id,
				group_id: group.id,
				class_level: source.classLevel,
				user_id: null,
				login: null,
			};
			toCreate.push(student);
			studentsByKey.set(sourceKey, student);
			state.students.push(student);
			continue;
		}

		const update = {
			id: student.id,
			group_id: group.id,
			class_level: source.classLevel,
		};
		if (alias?.updateName) update.name = source.name;
		if (
			student.group_id !== group.id ||
			student.class_level !== source.classLevel ||
			(alias?.updateName && student.name !== source.name)
		) {
			toUpdate.push(update);
		}
		if (alias?.updateName && student.user_id) {
			userDisplayUpdates.push({ userId: student.user_id, displayName: source.name });
		}
	}

	if (unresolved.length > 0) {
		throw new Error(`Student resolution failed:\n- ${unresolved.join("\n- ")}`);
	}

	return { toCreate, toUpdate, userDisplayUpdates };
};

const buildTeacherDisplayPlan = (state) => {
	const teachersById = indexOneBy(state.teachers, (teacher) => teacher.id);
	const toUpdate = [];
	const userDisplayUpdates = [];

	for (const fix of TEACHER_DISPLAY_FIXES) {
		const teacher = teachersById.get(fix.id);
		if (!teacher) continue;
		if (
			teacher.name !== fix.name ||
			teacher.first_name !== fix.first_name ||
			teacher.last_name !== fix.last_name
		) {
			toUpdate.push(fix);
		}
		if (teacher.user_id && teacher.name !== fix.name) {
			userDisplayUpdates.push({ userId: teacher.user_id, displayName: fix.name });
		}
	}

	return { toUpdate, userDisplayUpdates };
};

const writeBackup = ({ state, source, plan }) => {
	const backupDir = path.join(__dirname, "backups");
	fs.mkdirSync(backupDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = path.join(backupDir, `azadliq-xlsx-rebuild-${YEAR}-${stamp}.json`);
	fs.writeFileSync(
		backupPath,
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				sourceFile: INPUT_FILE,
				orgId: ORG_ID,
				branch: state.branch,
				year: YEAR,
				source,
				plan,
				before: {
					groups: state.groups,
					students: state.students,
					teachers: state.teachers,
					assignments: state.assignments,
					tasks: state.tasks,
					submissions: state.submissions,
					users: state.users,
					usernames: state.usernames,
				},
			},
			null,
			2,
		),
	);
	return backupPath;
};

const applyChanges = async ({ groupPlan, studentPlan, teacherPlan, assignmentRows, state }) => {
	if (state.submissions.length > 0) {
		throw new Error(`Azadlıq has ${state.submissions.length} submissions; refusing to rebuild.`);
	}

	if (groupPlan.toCreate.length > 0) {
		const { error } = await supabase.from("groups").insert(groupPlan.toCreate);
		if (error) throw new Error(`Group insert failed: ${error.message}`);
	}

	for (const update of teacherPlan.toUpdate) {
		const { error } = await supabase
			.from("teachers")
			.update({
				name: update.name,
				first_name: update.first_name,
				last_name: update.last_name,
				deleted_at: null,
				archived_at: null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", update.id);
		if (error) throw new Error(`Teacher update failed (${update.id}): ${error.message}`);
	}

	for (const update of [...teacherPlan.userDisplayUpdates, ...studentPlan.userDisplayUpdates]) {
		const { error } = await supabase
			.from("users")
			.update({ display_name: update.displayName, deleted_at: null, archived_at: null })
			.eq("org_id", ORG_ID)
			.eq("id", update.userId);
		if (error) throw new Error(`User display update failed (${update.userId}): ${error.message}`);
	}

	if (studentPlan.toCreate.length > 0) {
		const { error } = await supabase.from("students").insert(studentPlan.toCreate);
		if (error) throw new Error(`Student insert failed: ${error.message}`);
	}

	for (const update of studentPlan.toUpdate) {
		const payload = {
			group_id: update.group_id,
			class_level: update.class_level,
			deleted_at: null,
			archived_at: null,
		};
		if (update.name) payload.name = update.name;
		const { error } = await supabase
			.from("students")
			.update(payload)
			.eq("org_id", ORG_ID)
			.eq("id", update.id);
		if (error) throw new Error(`Student update failed (${update.id}): ${error.message}`);
	}

	const { data: deletedRows, error: deleteError } = await supabase
		.from("teaching_assignments")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("branch_id", state.branch.id)
		.eq("year", YEAR)
		.select("id");
	if (deleteError) throw new Error(`Assignment delete failed: ${deleteError.message}`);

	for (let i = 0; i < assignmentRows.length; i += 500) {
		const { error } = await supabase
			.from("teaching_assignments")
			.insert(assignmentRows.slice(i, i + 500));
		if (error) throw new Error(`Assignment insert failed: ${error.message}`);
	}

	return {
		createdGroups: groupPlan.toCreate.length,
		createdStudents: studentPlan.toCreate.length,
		updatedStudents: studentPlan.toUpdate.length,
		updatedTeachers: teacherPlan.toUpdate.length,
		deletedAssignments: deletedRows?.length ?? 0,
		insertedAssignments: assignmentRows.length,
	};
};

const verify = async (branch) => {
	const [
		{ count: assignments, error: assignmentsError },
		{ count: groups, error: groupsError },
		{ count: students, error: studentsError },
		{ count: missingStudentLogins, error: missingLoginsError },
	] = await Promise.all([
		supabase
			.from("teaching_assignments")
			.select("id", { count: "exact", head: true })
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.eq("year", YEAR),
		supabase
			.from("groups")
			.select("id", { count: "exact", head: true })
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id),
		supabase
			.from("students")
			.select("id", { count: "exact", head: true })
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id),
		supabase
			.from("students")
			.select("id", { count: "exact", head: true })
			.eq("org_id", ORG_ID)
			.eq("branch_id", branch.id)
			.or("user_id.is.null,login.is.null"),
	]);
	if (assignmentsError) throw assignmentsError;
	if (groupsError) throw groupsError;
	if (studentsError) throw studentsError;
	if (missingLoginsError) throw missingLoginsError;
	return { assignments, groups, students, missingStudentLogins };
};

const main = async () => {
	const source = readWorkbook();
	const sourceGroupNames = Array.from(
		new Set([
			...source.students.map((student) => student.groupName),
			...source.assignmentRows.map((row) => row.groupName),
		]),
	).sort((a, b) => a.localeCompare(b, "az"));

	const branch = await findBranch();
	const state = await loadState(branch);
	const groupPlan = resolveGroups({ sourceGroupNames, state });
	const teacherMap = resolveTeachers({ rows: source.assignmentRows, state });
	const subjectMap = resolveSubjects({ rows: source.assignmentRows, state });
	const assignmentPlan = buildAssignments({
		rows: source.assignmentRows,
		state,
		groupMap: groupPlan.groupMap,
		teacherMap,
		subjectMap,
	});
	const studentPlan = buildStudentPlan({
		sourceStudents: source.students,
		state,
		groupMap: groupPlan.groupMap,
	});
	const teacherPlan = buildTeacherDisplayPlan(state);

	const plan = {
		mode: APPLY ? "apply" : "validate",
		createdGroups: groupPlan.toCreate.map((group) => group.name),
		createdStudents: studentPlan.toCreate.map((student) => ({
			id: student.id,
			name: student.name,
			groupId: student.group_id,
		})),
		updatedStudents: studentPlan.toUpdate.length,
		updatedTeachers: teacherPlan.toUpdate.map((teacher) => ({
			id: teacher.id,
			name: teacher.name,
		})),
		sourceAssignments: source.assignmentRows.length,
		assignmentsToInsert: assignmentPlan.assignments.length,
		mergedDuplicateAssignments: assignmentPlan.duplicateRows.length,
		duplicateStudentNames: source.duplicateStudentNames,
		existingAssignments: state.assignments.length,
		existingTasks: state.tasks.length,
		existingSubmissions: state.submissions.length,
	};

	const backupPath = writeBackup({ state, source, plan });
	let applyResult = null;
	if (APPLY) {
		applyResult = await applyChanges({
			groupPlan,
			studentPlan,
			teacherPlan,
			assignmentRows: assignmentPlan.assignments,
			state,
		});
	}
	const verification = APPLY ? await verify(branch) : null;

	console.log(
		JSON.stringify(
			{
				...plan,
				branch: { id: branch.id, name: branch.name, code: branch.code },
				sourceFile: INPUT_FILE,
				sourceStudents: source.students.length,
				sourceClasses: sourceGroupNames.length,
				backupPath,
				applyResult,
				verification,
			},
			null,
			2,
		),
	);
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
