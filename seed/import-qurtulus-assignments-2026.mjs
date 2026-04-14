import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(ROOT_DIR, ".env.local") });
dotenv.config({ path: path.join(ROOT_DIR, ".env"), override: false });

const ORG_ID = process.env.VITE_ORG_ID || "default";
const BRANCH_ID = "65ba598b-fe8d-41da-aeaa-10ce5dbe9023";
const BRANCH_NAME = "Qurtuluş Campusu";
const YEAR = 2026;
const INPUT_FILE = path.join(__dirname, "qurtulus-assignments-2026.txt");

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_URL / VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false, autoRefreshToken: false },
});

const AZ_CHAR_MAP = {
	Ə: "e",
	ə: "e",
	İ: "i",
	ı: "i",
	I: "i",
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
	Ə: "e",
	é: "e",
	É: "e",
};

const TEACHER_ALIAS_MAP = new Map([
	["Aisa D", "Ayşə Dəmirçiyeva"],
	["Ariza M", "Arizə Məmmədova"],
	["Arzu E", "Arzu Əhmədova"],
	["Arzu M", "Arzu Məmmədova"],
	["Aysel A", "Aysel Abutalıbova"],
	["Aysel Ab", "Aysel Abbasova"],
	["Aysel E", "Aysel Əsgərova"],
	["Aysel R", "Aysel Rəhimli"],
	["Aysen.A", "Ayşən Abduləzimova"],
	["Aytac C", "Aytac Cəfərova"],
	["Aytac E", "Aytac Eylazlı"],
	["Aytac N", "Aytac Nəsibova"],
	["Ayten E", "Aytən Ədilova"],
	["Azer.I", "Azər İbrahimov"],
	["Cemile P", "Cəmilə Pirmətova"],
	["Cemile T", "Cəmilə Tağıyeva"],
	["Ceyhune D", "Ceyhunə Davudova"],
	["Diana S", "Diana Şixverdiyeva"],
	["Efruz S", "Əfruz Səfərova"],
	["Ehmed B", "Əhməd Bayraqdarov"],
	["Elmar.A", "Elmar Əliyev"],
	["Elnare F", "Elnarə Fərzəli"],
	["Esmer B", "Əsmər Bürcəliyeva"],
	["Ezim H", "Əzim Hacıyev"],
	["Fatime R", "Fatimə Rəfizadə"],
	["Feteli F", "Fətəli Fərzəliyev"],
	["Fezile P", "Fəzilə Paşayeva"],
	["Gülgez A", "Gülgəz Əmrəliyeva"],
	["Gülsabah I", "Gülsabah İbadullayeva"],
	["Gülsen O", "Gülşən Osmanova"],
	["Gülsen S", "Gülşən Sadıxova"],
	["Gülsüm T", "Gülsüm Tahirova"],
	["Gülyaz B", "Gülyaz Bəhrəmova"],
	["Günay T", "Günay Təhməzova"],
	["Günel C", "Günel Cəfərova"],
	["Ilahe E", "İlahə Əzizli"],
	["Ismayil F", "İsmayıl Fətəliyev"],
	["Jale I", "Jalə İsmayılova"],
	["Leman A", "Ləman Ağayeva"],
	["Leyla H", "Leyla Həsənova"],
	["Metanet H", "Mətanət Hüseynova"],
	["Natavan Y", "Natəvan Yelmarova"],
	["Nergiz N", "Nərgiz Namazova"],
	["Nezrin Q", "Nəzrin Qurbanova"],
	["Nigar E", "Nigar Əliyeva"],
	["Nurane.H", "Nuranə Hacıyeva"],
	["Nuray A", "Nuray Abdullazadə"],
	["Nurida A", "Nuridə Əsədova"],
	["Nuru A", "Nuru Abdullayev"],
	["Pervane M", "Pərvanə Məmmədova"],
	["Qafar H", "Qafar Hüseynov"],
	["Ramila Q", "Ramıla Gulıeva"],
	["Ramina A", "Raminə Atayeva"],
	["Ruzigar D", "Ruzigar Dəmirov"],
	["Röya H", "Röya Hüseynzadə"],
	["Rüzgar A", "Rüzgar Ağabbasoy"],
	["Sakir H", "Şakir Hüseynli"],
	["Sekine M", "Səkinə Məmmədova"],
	["Servinaz C", "Sərvinaz Cəfərli"],
	["Sevda A", "Sevda Axundova"],
	["Sevinc B", "Sevinc Bağırzadə"],
	["Sevinc E", "Sevinc Əliyeva"],
	["Sevinc I", "Sevinc İsmayılova"],
	["Sevinc Q", "Sevinc Qənbərova"],
	["Seyrane E", "Seyranə Əliyeva"],
	["Tunara R", "Tunarə Rəhimova"],
	["Tuqay A", "Tuqay Abdullayeva"],
	["Ulker.S", "Ülkər Şərifli"],
	["Valeh H", "Valeh Həsənli"],
	["Vusale E", "Vüsalə Əliyeva"],
	["Vüqar M", "Vüqar Məhərrəmov"],
	["Xatire E", "Xatirə Əhmədzadə"],
	["Xaver H", "Xavər Həsənzadə"],
	["Xaver M", "Xavər Məmmədli"],
	["Yegane R", "Yeganə Ramazanova"],
	["Yelizaveta X", "Elızaveta Khalılova"],
	["Zehra C", "Zəhra Cəfərzadə"],
	["Zerine Z", "Zərinə Zübahirova"],
]);

const EXTRA_TEACHERS = new Map([
	[
		"Aytac Nəsibova",
		{
			id: "qurtulus-teacher-aytac-nesibova",
			firstName: "Aytac",
			lastName: "Nəsibova",
			departmentName: "Ümumi",
		},
	],
	[
		"Gülsabah İbadullayeva",
		{
			id: "qurtulus-teacher-gulsabah-ibadullayeva",
			firstName: "Gülsabah",
			lastName: "İbadullayeva",
			departmentName: "Təbiət fənləri kafedrası",
		},
	],
]);

const GROUP_NAME_OVERRIDES = new Map([["5R3", "5R2"]]);

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

const slugify = (value) => normalizeForKey(value).replace(/\s+/g, "-");

const withHash = (prefix, value) =>
	`${prefix}-${slugify(value)}-${createHash("sha1").update(value).digest("hex").slice(0, 6)}`;

const readLines = (filePath) =>
	fs
		.readFileSync(filePath, "utf8")
		.replace(/^\uFEFF/, "")
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean);

const normalizeGroupName = (rawGroupName) => {
	const withoutQuarter = compactSpaces(rawGroupName).replace(/\s*\(Q-\d+\)\s*/g, "");
	return GROUP_NAME_OVERRIDES.get(withoutQuarter) ?? withoutQuarter;
};

const parseAssignments = (lines) => {
	const rows = [];

	for (const line of lines) {
		const dashIndex = line.indexOf("—");
		if (dashIndex === -1) {
			throw new Error(`Cannot parse line (missing dash): ${line}`);
		}

		const alias = compactSpaces(line.slice(0, dashIndex));
		const teacherName = TEACHER_ALIAS_MAP.get(alias);
		if (!teacherName) {
			throw new Error(`Teacher alias is not mapped: ${alias}`);
		}

		const rightSide = compactSpaces(line.slice(dashIndex + 1));
		for (const segment of rightSide.split(/\s*\|\s*/)) {
			const colonIndex = segment.indexOf(":");
			if (colonIndex === -1) {
				throw new Error(`Cannot parse subject segment: ${segment}`);
			}

			const subjectName = compactSpaces(segment.slice(0, colonIndex));
			const groupNames = segment
				.slice(colonIndex + 1)
				.split(",")
				.map((item) => normalizeGroupName(item))
				.filter(Boolean);

			for (const groupName of groupNames) {
				rows.push({ alias, teacherName, subjectName, groupName });
			}
		}
	}

	return Array.from(
		new Map(
			rows.map((row) => [`${row.teacherName}||${row.subjectName}||${row.groupName}`, row]),
		).values(),
	);
};

const loadBranchTeachers = async () => {
	const { data, error } = await supabase
		.from("teachers")
		.select("id,name,first_name,last_name,branch_id")
		.eq("org_id", ORG_ID)
		.eq("branch_id", BRANCH_ID)
		.order("name");

	if (error) {
		throw new Error(`Failed to load branch teachers: ${error.message}`);
	}

	return data ?? [];
};

const loadBranchGroups = async () => {
	const { data, error } = await supabase
		.from("groups")
		.select("id,name,class_level")
		.eq("org_id", ORG_ID)
		.eq("branch_id", BRANCH_ID)
		.order("name");

	if (error) {
		throw new Error(`Failed to load branch groups: ${error.message}`);
	}

	return data ?? [];
};

const loadSubjects = async () => {
	const { data, error } = await supabase
		.from("subjects")
		.select("id,name")
		.eq("org_id", ORG_ID)
		.order("name");

	if (error) {
		throw new Error(`Failed to load subjects: ${error.message}`);
	}

	return data ?? [];
};

const loadDepartments = async () => {
	const { data, error } = await supabase
		.from("departments")
		.select("id,name")
		.eq("org_id", ORG_ID)
		.eq("branch_id", BRANCH_ID)
		.order("name");

	if (error) {
		throw new Error(`Failed to load departments: ${error.message}`);
	}

	return data ?? [];
};

const insertTeacher = async ({ id, name, firstName, lastName, departmentId }) => {
	const { error } = await supabase.from("teachers").insert({
		id,
		org_id: ORG_ID,
		name,
		first_name: firstName,
		last_name: lastName,
		department_id: departmentId,
		branch_id: BRANCH_ID,
		branch_ids: [BRANCH_ID],
		teacher_category: "standard",
	});

	if (error) {
		throw new Error(`Failed to create teacher ${name}: ${error.message}`);
	}
};

const insertSubjects = async (subjects) => {
	if (subjects.length === 0) return;

	const { error } = await supabase.from("subjects").insert(subjects);
	if (error) {
		throw new Error(`Failed to create subjects: ${error.message}`);
	}
};

const deleteAssignments = async () => {
	const { error } = await supabase
		.from("teaching_assignments")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("branch_id", BRANCH_ID)
		.eq("year", YEAR);

	if (error) {
		throw new Error(`Failed to delete old assignments: ${error.message}`);
	}
};

const insertAssignments = async (rows) => {
	const chunkSize = 500;
	for (let index = 0; index < rows.length; index += chunkSize) {
		const chunk = rows.slice(index, index + chunkSize);
		const { error } = await supabase.from("teaching_assignments").insert(chunk);
		if (error) {
			throw new Error(`Failed to insert assignments: ${error.message}`);
		}
	}
};

const lines = readLines(INPUT_FILE);
const parsedAssignments = parseAssignments(lines);

const groups = await loadBranchGroups();
const groupsByName = new Map(groups.map((group) => [group.name, group]));
const departments = await loadDepartments();
const departmentsByKey = new Map(
	departments.map((department) => [normalizeForKey(department.name), department]),
);

for (const assignment of parsedAssignments) {
	if (!groupsByName.has(assignment.groupName)) {
		throw new Error(`Group not found in ${BRANCH_NAME}: ${assignment.groupName}`);
	}
}

const teachers = await loadBranchTeachers();
const teachersByKey = new Map(teachers.map((teacher) => [normalizeForKey(teacher.name), teacher]));

const createdTeacherNames = [];
for (const teacherName of new Set(parsedAssignments.map((row) => row.teacherName))) {
	if (teachersByKey.has(normalizeForKey(teacherName))) continue;

	const extraTeacher = EXTRA_TEACHERS.get(teacherName);
	if (!extraTeacher) {
		throw new Error(`Teacher not found in ${BRANCH_NAME} and no create rule exists: ${teacherName}`);
	}

	const department = departmentsByKey.get(
		normalizeForKey(extraTeacher.departmentName ?? "Ümumi"),
	);
	if (!department) {
		throw new Error(
			`Department not found for ${teacherName}: ${extraTeacher.departmentName ?? "Ümumi"}`,
		);
	}

	await insertTeacher({
		id: extraTeacher.id,
		name: teacherName,
		firstName: extraTeacher.firstName,
		lastName: extraTeacher.lastName,
		departmentId: department.id,
	});

	teachersByKey.set(normalizeForKey(teacherName), {
		id: extraTeacher.id,
		name: teacherName,
		first_name: extraTeacher.firstName,
		last_name: extraTeacher.lastName,
		department_id: department.id,
		branch_id: BRANCH_ID,
	});
	createdTeacherNames.push(teacherName);
}

const existingSubjects = await loadSubjects();
const subjectsByKey = new Map(existingSubjects.map((subject) => [normalizeForKey(subject.name), subject]));

const missingSubjects = [];
for (const subjectName of new Set(parsedAssignments.map((row) => row.subjectName))) {
	if (subjectsByKey.has(normalizeForKey(subjectName))) continue;

	const subjectRow = {
		id: withHash("qurtulus-ta-subject", subjectName),
		org_id: ORG_ID,
		name: subjectName,
		code: slugify(subjectName) || null,
	};

	missingSubjects.push(subjectRow);
	subjectsByKey.set(normalizeForKey(subjectName), subjectRow);
}

await insertSubjects(missingSubjects);
await deleteAssignments();

const assignmentRows = parsedAssignments.map((row) => {
	const teacher = teachersByKey.get(normalizeForKey(row.teacherName));
	const subject = subjectsByKey.get(normalizeForKey(row.subjectName));
	const group = groupsByName.get(row.groupName);

	if (!teacher) {
		throw new Error(`Teacher could not be resolved: ${row.teacherName}`);
	}
	if (!subject) {
		throw new Error(`Subject could not be resolved: ${row.subjectName}`);
	}
	if (!group) {
		throw new Error(`Group could not be resolved: ${row.groupName}`);
	}

	return {
		org_id: ORG_ID,
		teacher_id: teacher.id,
		group_id: group.id,
		subject_id: subject.id,
		branch_id: BRANCH_ID,
		year: YEAR,
	};
});

await insertAssignments(assignmentRows);

console.log(
	JSON.stringify(
		{
			branch: BRANCH_NAME,
			year: YEAR,
			assignmentsInserted: assignmentRows.length,
			teachersReferenced: new Set(parsedAssignments.map((row) => row.teacherName)).size,
			subjectsReferenced: new Set(parsedAssignments.map((row) => row.subjectName)).size,
			groupsReferenced: new Set(parsedAssignments.map((row) => row.groupName)).size,
			createdTeachers: createdTeacherNames,
			createdSubjects: missingSubjects.map((subject) => subject.name),
			assumptions: [
				"9A3/10A3/11A3 Q-1/Q-2/... suffixes were collapsed to the base group name.",
				"5R3 was mapped to 5R2 because Qurtuluş students and groups exist under 5R2 in DB.",
				"Aytac Nəsibova and Gülsabah İbadullayeva were created as Qurtuluş teachers because they were referenced in assignments but missing in branch teachers.",
			],
		},
		null,
		2,
	),
);
