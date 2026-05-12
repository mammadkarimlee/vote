import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
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
const BRANCH_CODE = getArg("branch-code", "NES");
const YEAR = Number(getArg("year", "2026"));
const INPUT_FILE = path.resolve(
	process.cwd(),
	getArg("file", "C:/Users/mamma/Downloads/NƏSİMİ SİNİF .xlsx"),
);
const APPLY = hasFlag("apply");
const REGENERATE_TASKS = hasFlag("regenerate-tasks");

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

const TEACHER_ID_OVERRIDES = new Map(
	[
		["Amaliya Səmədova", "nesimi-teacher-amaliya-semedova"],
		["Amalya Səmədova", "nesimi-teacher-amaliya-semedova"],
		["Aynur Əmirgünayev", "nesimi-teacher-aynur-isgenderova-mehemmed-qizi"],
		["Aynur İsgəndərova", "nesimi-teacher-aynur-isgenderova-mehemmed-qizi"],
		["Elsema Mammadova", "nesimi-teacher-elsema-memmedova-afik-qizi"],
		["Əsmər Mehtiyeva", "nesimi-teacher-esmer-mehdiyeva-alim-qizi"],
		["Fatimə Həsənova", "nesimi-teacher-fatime-hesenli-vekil-qizi"],
		["Fidan Hasanova", "nesimi-teacher-fidan-hesenova-memmed-qizi"],
		["Fidan Sərdərova", "nesimi-teacher-fidan-serdarova-rabil-qizi"],
		["Gunel Hac;yeva", "nesimi-teacher-gunel-haciyeva-vahid-qizi"],
		["Gunel Mammadova", "nesimi-teacher-gunel-memmedli-sadiq-qizi"],
		["Günay Əhmədzadə", "nesimi-teacher-gunay-ehmed-zade-silduz-qizi"],
		["Günay İsmailova", "nesimi-teacher-gunay-ismayilova-mahir-qizi"],
		["Günay İsmayılzadə", "nesimi-teacher-gunay-ismayilova-mahir-qizi"],
		["Xatire Ahmadzade", "nesimi-teacher-xatire-ehmedzade-hicran-qizi"],
		["Xatirə Əhmədova", "nesimi-teacher-xatire-ehmedzade-hicran-qizi"],
		["Xəlilova Aynur", "nesimi-teacher-aynur-xelilova"],
		["İradə M", "nesimi-teacher-irade-memmedova-mayil-qizi"],
		["Jale Shukurova", "nesimi-teacher-zhala-shukurova-xxx"],
		["Jeiran Vəliyeva", "nesimi-teacher-ceyran-veliyeva-arif-qizi"],
		["Kəmalə Asgərova", "nesimi-teacher-kemale-esgerova-agabey"],
		["Qəndab Kərəmzadə", "nesimi-teacher-qendab-mahmudzade-adil-qizi"],
		["Lalə Bayramlı", "nesimi-teacher-lale-bayramova-elsad-qizi"],
		["Mehdiyeva Əsmər", "nesimi-teacher-esmer-mehdiyeva-alim-qizi"],
		["Nabat Aliyeva", "nesimi-teacher-nabat-eliyeva-rehim-qizi"],
		["Naciye Alizade", "nesimi-teacher-naciye-elizade-mahir-qizi"],
		["Nezrin Huseynova", "nesimi-teacher-nezrin-huseynzade"],
		["Nəzrin Hüseynova", "nesimi-teacher-nezrin-huseynzade"],
		["Nicat Mamedov", "nesimi-teacher-nicat-memmedov"],
		["Nicat Məmmədov", "nesimi-teacher-nicat-memmedov"],
		["Raisa Şirəliyeva", "nesimi-teacher-raisa-siraliyeva-maksudovna"],
		["Reshad Emirgunayev", "nesimi-teacher-resad-emirguneyev-seydulla-oglu"],
		["Rəhilə Nazarli", "nesimi-teacher-rehile-nezerli-rauf-qizi"],
		["Rəşad Amirgunayev", "nesimi-teacher-resad-emirguneyev-seydulla-oglu"],
		["Rəşad Emirgünayev", "nesimi-teacher-resad-emirguneyev-seydulla-oglu"],
		["Rəşad Əmirgunayev", "nesimi-teacher-resad-emirguneyev-seydulla-oglu"],
		["Rəşad Əmirgünayev", "nesimi-teacher-resad-emirguneyev-seydulla-oglu"],
		["Risa Şiraliyeva", "nesimi-teacher-raisa-siraliyeva-maksudovna"],
		["Rövşən Alisoy", "nesimi-teacher-rovsen-eliyev-isfendiyar-oglu"],
		["Rövşən Əlisoy", "nesimi-teacher-rovsen-eliyev-isfendiyar-oglu"],
		["RövşənAlisoy", "nesimi-teacher-rovsen-eliyev-isfendiyar-oglu"],
		["Ruhiyyə Təhməzli", "nesimi-teacher-ruhiye-tehmezli-sohrab-qizi"],
		["Rusiyyə Rəhimova", "nesimi-teacher-ruziyye-rehimova-fezayil-qizi"],
		["Ruziyə Rahimova", "nesimi-teacher-ruziyye-rehimova-fezayil-qizi"],
		["Sara", "nesimi-teacher-sara-hemidova"],
		["Sevil Ashrafli", "nesimi-teacher-sevil-esrefli-firuz-qizi"],
		["Shahin Rehimov", "nesimi-teacher-sahin-rehimov-elcin-oglu"],
		["Şahin Rahimov", "nesimi-teacher-sahin-rehimov-elcin-oglu"],
		["Şükufə Hüseynova", "nesimi-teacher-sukufe-huseynli-arif-qizi"],
		["Şüküfə Hüseynova", "nesimi-teacher-sukufe-huseynli-arif-qizi"],
		["Ulfat Mustafayeva", "nesimi-teacher-ulfet-mustafayeva-efser-qizi"],
		["Ülfat Mustafayeva", "nesimi-teacher-ulfet-mustafayeva-efser-qizi"],
		["Vəfa Alışova", "nesimi-teacher-vefa-aliszade-telman-qizi"],
		["Yusifli Leyla", "nesimi-teacher-leyla-yusifli-huseyn-qizi"],
		["Zahra Alizade", "nesimi-teacher-zehra-elizade-zeka-qizi"],
		["Zəhra Əliyeva", "nesimi-teacher-zehra-elizade-zeka-qizi"],
		["ZəkiyyəMəmmədova", "nesimi-teacher-zekiyye-memmedova-nazim-qizi"],
		["Zinayda Musayeva", "nesimi-teacher-zinaida-musayeva-yasin-qizi"],
	].map(([name, id]) => [nullKey(name), id]),
);

const TEACHERS_TO_CREATE = [
	{
		id: "nesimi-teacher-amaliya-semedova",
		name: "Amaliya Səmədova",
		first_name: "Amaliya",
		last_name: "Səmədova",
		department: "İngilis dili və Alman dili",
	},
	{
		id: "nesimi-teacher-nicat-memmedov",
		name: "Nicat Məmmədov",
		first_name: "Nicat",
		last_name: "Məmmədov",
		department: "İncəsənət",
	},
	{
		id: "nesimi-teacher-aynur-xelilova",
		name: "Aynur Xəlilova",
		first_name: "Aynur",
		last_name: "Xəlilova",
		department: "Riyaziyyat və məntiq",
	},
];

const SUBJECT_ALIASES = new Map(
	[
		["Alman", ["German"]],
		["Art & Design", ["Art&Design"]],
		["Art and design", ["Art&Design"]],
		["Art and Design", ["Art&Design"]],
		["Art&Design", ["Art&Design"]],
		["azerbaijani language", ["Azerb. dili"]],
		["Azərb. tarixi", ["Azerb tarixi"]],
		["Azərbaycan dili", ["Azerb. dili"]],
		["Azərbaycan dili və Ədəbiyyat", ["Azerb. dili", "Edebiyyat"]],
		["Azərbaycan dili, ədəbiyyat", ["Azerb. dili", "Edebiyyat"]],
		["Azərbaycan dili, Fİ, mütaliə saatı", ["Azerb. dili", "Ferdi inkisaf", "Mutalie saati"]],
		["Azərbaycan dili.Məntiq", ["Azerb. dili", "Mentiq"]],
		["Azərbaycan dili/ədəbiyyat", ["Azerb. dili", "Edebiyyat"]],
		["Azərbaycan tarixi", ["Azerb tarixi"]],
		["Azərbaycan Tarixi", ["Azerb tarixi"]],
		["Azərbaycan tarixi və Ümumi tarix", ["Azerb tarixi", "Ümumi tarix"]],
		["Azərbaycan tarixi, Ümumi tarixi", ["Azerb tarixi", "Ümumi tarix"]],
		["Azərbaycan-dili", ["Azerb. dili"]],
		["Biologiya", ["Biologiya"]],
		["Biology", ["Biology"]],
		["Biznes", ["Biznes"]],
		["Cambridge checkpoint", ["Cam Checkpoint Exam"]],
		["Cambridge Checkpoint exam", ["Cam Checkpoint Exam"]],
		["Checkpoint", ["Cam Checkpoint Exam"]],
		["Checkpoint exam support", ["Cam Checkpoint Exam"]],
		["Chemistry", ["Chemistry"]],
		["chess", ["Chess"]],
		["Chess", ["Chess"]],
		["Cografiya", ["Cografiya"]],
		["Coğrafiya", ["Cografiya"]],
		["Compuiting", ["Computing"]],
		["computing", ["Computing"]],
		["Computing", ["Computing"]],
		["Creativ Essay", ["Cre. Essay Wr"]],
		["Creative essay writing", ["Cre. Essay Wr"]],
		["Creative Essay Writing", ["Cre. Essay Wr"]],
		["Creative essay\\wr", ["Cre. Essay Wr"]],
		["Creative writing essay", ["Cre. Essay Wr"]],
		["Dəyərlər", ["Deyerler"]],
		["Dram", ["Drama"]],
		["Drama", ["Drama"]],
		["El&Literature", ["EL&Literature"]],
		["English language and literature", ["EL&Literature"]],
		["English literature", ["EL&Literature"]],
		["Ədebiyyat", ["Edebiyyat"]],
		["Ədəbiyyat", ["Edebiyyat"]],
		["Fərdi inkişaf", ["Ferdi inkisaf"]],
		["Fərdi İnkişaf", ["Ferdi inkisaf"]],
		["Fizika", ["Fizika"]],
		["Fizika tərbiyə", ["Fiziki t"]],
		["Fiziki tərbiyə", ["Fiziki t"]],
		["Fiziki Tərbiyə", ["Fiziki t"]],
		["Fiziki tərbiyyə", ["Fiziki t"]],
		["Geography", ["Geography"]],
		["German", ["German"]],
		["german teacher", ["German"]],
		["global pers.", ["Glob. Pers"]],
		["Global pers.", ["Glob. Pers"]],
		["global perspectives", ["Glob. Pers"]],
		["Global perspectives", ["Glob. Pers"]],
		["Global Perspectives", ["Glob. Pers"]],
		["Grammar", ["Grammar"]],
		["Grammer", ["Grammar"]],
		["Həyat bilgisi", ["Heyat bilgisi"]],
		["History", ["History"]],
		["İnformatika", ["Info / Süni int"]],
		["İnformatika/Suni intelekt", ["Info / Süni int"]],
		["İnformatika/texnologiya", ["Info / Süni int", "Texno./STEAM"]],
		["İngilis dili", ["Lang. Arts"]],
		["Kimya", ["Kimya"]],
		["Qarabağ tarixi", ["Qarabağ tarixi"]],
		["LA", ["Lang. Arts"]],
		["Lagn.arts", ["Lang. Arts"]],
		["Lang. Arts, Cam. Check, Cre. Essay Ür.", ["Lang. Arts", "Cam Checkpoint Exam", "Cre. Essay Wr"]],
		["Lang.Arts", ["Lang. Arts"]],
		["Language art", ["Lang. Arts"]],
		["Language Art", ["Lang. Arts"]],
		["Language arts", ["Lang. Arts"]],
		["Language Arts", ["Lang. Arts"]],
		["LANGUAGE ARTS", ["Lang. Arts"]],
		["Language Arts-Grammar", ["Lang. Arts", "Grammar"]],
		["library time", ["Library Time"]],
		["Library time", ["Library Time"]],
		["Library Time", ["Library Time"]],
		["Logic", ["Logics"]],
		["Logic Math \\Local English", ["Logics (Math)", "Lang. Arts"]],
		["logics", ["Logics"]],
		["Logics", ["Logics"]],
		["Logics Math", ["Logics (Math)"]],
		["Math", ["Math"]],
		["Math, Logic math", ["Math", "Logics (Math)"]],
		["math,logics,math", ["Math", "Logics"]],
		["Mathematics", ["Math"]],
		["Maths", ["Math"]],
		["Məntiq", ["Mentiq"]],
		["music", ["Music"]],
		["Music", ["Music"]],
		["Musiqi", ["Musiqi"]],
		["Mütaliə saatı", ["Mutalie saati"]],
		["Ortaq türk tarixi", ["O. türk tarixi"]],
		["phsce", ["PHSCE"]],
		["PHSCE", ["PHSCE"]],
		["physical education", ["Fiziki t"]],
		["Physical Education", ["Fiziki t"]],
		["Physics", ["Physics"]],
		["Ritorika", ["Ritorika"]],
		["Riyaziyyat", ["Riyaziyyat"]],
		["robotics", ["Robotics"]],
		["Robotics", ["Robotics"]],
		["Rus dili", ["Rus dili"]],
		["Rus dili və ədəbiyyat", ["Rus dili və ədəbiyyat"]],
		["Rus-dili", ["Rus dili"]],
		["science", ["Science"]],
		["Science", ["Science"]],
		["Science (fizika/kimya/biologiya)", ["Science KFB"]],
		["Science(Fiz, Kim, Bio.)", ["Science KFB"]],
		["Science(tədqiqat)", ["Tedqiqat"]],
		["Sinif saatı", ["Sinif saatı"]],
		["Sport", ["Fiziki t"]],
		["Steam lab", ["STEAMlab"]],
		["Steam Lab", ["STEAMlab"]],
		["Steam-lab", ["STEAMlab"]],
		["Şahmat", ["Sahmat"]],
		["Şaxmat", ["Sahmat"]],
		["Tarix", ["Azerb tarixi", "Ümumi tarix"]],
		["Techno Steam", ["Techno/STEAM"]],
		["Techno-Steam", ["Techno/STEAM"]],
		["Techno/STEAM", ["Techno/STEAM"]],
		["technology", ["Techno/STEAM"]],
		["TechnoSteam", ["Techno/STEAM"]],
		["Texnalogiya", ["Texno./STEAM"]],
		["Texno.\\STEAM", ["Texno./STEAM"]],
		["Texno\\steam", ["Texno./STEAM"]],
		["Texno\\Steam", ["Texno./STEAM"]],
		["Texnologiya", ["Texno./STEAM"]],
		["Texnologiya (STEAM)", ["Texno./STEAM"]],
		["Texnologiya STEAM", ["Texno./STEAM"]],
		["Texnologiya/Steam", ["Texno./STEAM"]],
		["Texnologiya/STEAM", ["Texno./STEAM"]],
		["Təbiet", ["Tebiet"]],
		["Təbiət", ["Tebiet"]],
		["Tədqiqat", ["Tedqiqat"]],
		["Tədris dili (Rus dili)", ["Rus dili"]],
		["Təqdiqat", ["Tedqiqat"]],
		["Təsviri incəsənət", ["Tesviri i"]],
		["Təsviri İncəsənət", ["Tesviri i"]],
		["Ümumi tarix", ["Ümumi tarix"]],
		["Wellbeing", ["Wellbeing"]],
		["wellbeing and art", ["Wellbeing", "Art&Design"]],
		["Wellbeing/ PHSCE", ["Wellbeing", "PHSCE"]],
	].map(([name, subjects]) => [nullKey(name), subjects]),
);

function compactSpaces(value) {
	return String(value ?? "").replace(/\s+/g, " ").trim();
}

function transliterate(value) {
	return Array.from(String(value ?? ""))
		.map((char) => AZ_CHAR_MAP[char] ?? char)
		.join("");
}

function normalizeKey(value) {
	return transliterate(compactSpaces(value))
		.normalize("NFKD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
}

function nullKey(value) {
	return normalizeKey(value).replace(/\s+/g, "");
}

function slugify(value) {
	return normalizeKey(value).replace(/\s+/g, "-").replace(/^-+|-+$/g, "");
}

function withHash(prefix, value) {
	const slug = slugify(value) || "item";
	const hash = createHash("sha1").update(`${prefix}:${value}`).digest("hex").slice(0, 8);
	return `${prefix}-${slug}-${hash}`;
}

function normalizeGroupName(value) {
	return normalizeKey(value).replace(/\s+/g, "");
}

function readWorkbookRows() {
	if (!fs.existsSync(INPUT_FILE)) {
		throw new Error(`Excel file not found: ${INPUT_FILE}`);
	}

	const workbook = xlsx.readFile(INPUT_FILE, { cellDates: false });
	const rows = [];
	for (const sheetName of workbook.SheetNames) {
		const sheet = workbook.Sheets[sheetName];
		const values = xlsx.utils.sheet_to_json(sheet, {
			header: 1,
			raw: false,
			defval: "",
		});
		for (const row of values.slice(1)) {
			const teacherName = compactSpaces(row[1]);
			const subjectCell = compactSpaces(row[2]);
			if (!teacherName && !subjectCell) continue;
			if (!teacherName || !subjectCell) {
				throw new Error(`Invalid row in ${sheetName}: ${JSON.stringify(row)}`);
			}
			rows.push({
				sourceGroup: compactSpaces(sheetName),
				groupName: normalizeGroupName(sheetName),
				teacherName,
				subjectCell,
			});
		}
	}
	return rows;
}

async function fetchAll(table, select = "*") {
	const rows = [];
	for (let from = 0; ; from += 1000) {
		const { data, error } = await supabase
			.from(table)
			.select(select)
			.eq("org_id", ORG_ID)
			.range(from, from + 999);
		if (error) throw error;
		rows.push(...(data ?? []));
		if (!data || data.length < 1000) break;
	}
	return rows;
}

async function loadState() {
	const [branches, teachers, departments, groups, subjects, assignments, students, tasks, submissions, users] =
		await Promise.all([
			fetchAll("branches", "id,name,code"),
			fetchAll("teachers", "id,name,first_name,last_name,branch_id,branch_ids,department_id,user_id,login,teacher_category"),
			fetchAll("departments", "id,name,branch_id"),
			fetchAll("groups", "id,name,branch_id,class_level"),
			fetchAll("subjects", "id,name,code"),
			fetchAll("teaching_assignments", "id,teacher_id,group_id,subject_id,branch_id,year"),
			fetchAll("students", "id,name,branch_id,group_id,user_id,login,deleted_at"),
			fetchAll("tasks", "id,cycle_id,branch_id,rater_id,rater_role,target_type,target_id,target_name,group_id,subject_id,group_name,subject_name,status"),
			fetchAll("submissions", "task_id,branch_id,cycle_id"),
			fetchAll("users", "id,role,branch_id,display_name,login,deleted_at"),
		]);
	const branch = branches.find((item) => item.code === BRANCH_CODE);
	if (!branch) throw new Error(`Branch not found by code: ${BRANCH_CODE}`);
	return { branch, teachers, departments, groups, subjects, assignments, students, tasks, submissions, users };
}

function indexBy(rows, getKey) {
	const map = new Map();
	for (const row of rows) {
		const key = getKey(row);
		if (!map.has(key)) map.set(key, []);
		map.get(key).push(row);
	}
	return map;
}

function firstTwoNameKey(name) {
	return normalizeKey(name).split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

function getDepartmentId(departments, branchId, departmentName) {
	const preferred = departments.find(
		(item) => item.branch_id === branchId && normalizeKey(item.name) === normalizeKey(departmentName),
	);
	const fallback = departments.find(
		(item) => item.branch_id === branchId && normalizeKey(item.name) === normalizeKey("Ümumi"),
	);
	const department = preferred ?? fallback;
	if (!department) throw new Error(`Department not found: ${departmentName}`);
	return department.id;
}

async function ensureCreatedTeachers({ state, planned }) {
	const teachersById = new Map(state.teachers.map((teacher) => [teacher.id, teacher]));
	const toCreate = [];
	for (const item of TEACHERS_TO_CREATE) {
		if (teachersById.has(item.id)) continue;
		const teacher = {
			id: item.id,
			org_id: ORG_ID,
			name: item.name,
			first_name: item.first_name,
			last_name: item.last_name,
			department_id: getDepartmentId(state.departments, state.branch.id, item.department),
			branch_id: state.branch.id,
			branch_ids: [state.branch.id],
			teacher_category: "standard",
			user_id: null,
			login: null,
			deleted_at: null,
			archived_at: null,
		};
		toCreate.push(teacher);
		state.teachers.push(teacher);
		teachersById.set(teacher.id, teacher);
	}
	planned.teachersToCreate = toCreate.map((teacher) => ({
		id: teacher.id,
		name: teacher.name,
		department_id: teacher.department_id,
	}));

	if (APPLY && toCreate.length > 0) {
		const { error } = await supabase.from("teachers").insert(toCreate);
		if (error) throw new Error(`Teacher create failed: ${error.message}`);
	}
}

function resolveGroups(rows, state) {
	const scopedGroups = state.groups.filter((group) => group.branch_id === state.branch.id);
	const groupsByKey = indexBy(scopedGroups, (group) => normalizeGroupName(group.name));
	const resolved = new Map();
	const errors = [];
	for (const groupName of Array.from(new Set(rows.map((row) => row.groupName))).sort()) {
		const matches = groupsByKey.get(groupName) ?? [];
		if (matches.length !== 1) {
			errors.push(`${groupName}: group resolve failed (${matches.length} matches)`);
			continue;
		}
		resolved.set(groupName, matches[0]);
	}
	if (errors.length > 0) throw new Error(`Group validation failed:\n- ${errors.join("\n- ")}`);
	return resolved;
}

function resolveTeachers(rows, state) {
	const scopedTeachers = state.teachers.filter(
		(teacher) =>
			teacher.branch_id === state.branch.id || (teacher.branch_ids ?? []).includes(state.branch.id),
	);
	const teachersById = new Map(scopedTeachers.map((teacher) => [teacher.id, teacher]));
	const teachersByFirstTwo = indexBy(scopedTeachers, (teacher) => firstTwoNameKey(teacher.name));
	const resolved = new Map();
	const errors = [];

	for (const teacherName of Array.from(new Set(rows.map((row) => row.teacherName))).sort((a, b) => a.localeCompare(b, "az"))) {
		const overrideId = TEACHER_ID_OVERRIDES.get(nullKey(teacherName));
		if (overrideId) {
			const teacher = teachersById.get(overrideId);
			if (!teacher) {
				errors.push(`${teacherName}: override teacher not found (${overrideId})`);
				continue;
			}
			resolved.set(teacherName, teacher);
			continue;
		}

		const matches = teachersByFirstTwo.get(firstTwoNameKey(teacherName)) ?? [];
		if (matches.length !== 1) {
			errors.push(
				`${teacherName}: teacher resolve failed (${matches.length} matches)${
					matches.length > 1
						? `: ${matches.map((teacher) => `${teacher.id} / ${teacher.name}`).join("; ")}`
						: ""
				}`,
			);
			continue;
		}
		resolved.set(teacherName, matches[0]);
	}

	const scheduledTeachers = Array.from(new Map(Array.from(resolved.values()).map((teacher) => [teacher.id, teacher])).values());
	const missingLogins = scheduledTeachers.filter((teacher) => !teacher.user_id || !teacher.login);

	if (errors.length > 0) throw new Error(`Teacher validation failed:\n- ${errors.join("\n- ")}`);
	return { resolved, scheduledTeachers, missingLogins };
}

function resolveSubjectCell(subjectCell) {
	const subjects = SUBJECT_ALIASES.get(nullKey(subjectCell));
	if (!subjects) {
		throw new Error(`Subject alias missing: ${subjectCell}`);
	}
	return subjects;
}

function chooseSubject(subjects, usageCounts, canonicalName) {
	const matches = subjects.filter((subject) => normalizeKey(subject.name) === normalizeKey(canonicalName));
	if (matches.length === 0) return null;
	return matches.sort((a, b) => {
		const usageDiff = (usageCounts.get(b.id) ?? 0) - (usageCounts.get(a.id) ?? 0);
		if (usageDiff !== 0) return usageDiff;
		return a.id.localeCompare(b.id);
	})[0];
}

async function ensureSubject({ state, usageCounts, canonicalName, planned }) {
	const existing = chooseSubject(state.subjects, usageCounts, canonicalName);
	if (existing) return existing;

	const subject = {
		id: withHash("nesimi-xlsx-subject", canonicalName),
		org_id: ORG_ID,
		name: canonicalName,
		code: null,
		deleted_at: null,
		archived_at: null,
	};
	state.subjects.push(subject);
	planned.subjectsToCreate.push(subject);

	if (APPLY) {
		const { error } = await supabase.from("subjects").upsert(subject, { onConflict: "id" });
		if (error) throw new Error(`Subject create failed (${canonicalName}): ${error.message}`);
	}
	return subject;
}

async function buildAssignments({ rows, state, groupMap, teacherMap, planned }) {
	const usageCounts = new Map();
	for (const assignment of state.assignments) {
		if (assignment.branch_id === state.branch.id && assignment.year === YEAR) {
			usageCounts.set(assignment.subject_id, (usageCounts.get(assignment.subject_id) ?? 0) + 1);
		}
	}

	const assignments = [];
	const seen = new Set();
	const subjectMap = new Map();
	const subjectAliasErrors = [];

	for (const row of rows) {
		let canonicalSubjects;
		try {
			canonicalSubjects = resolveSubjectCell(row.subjectCell);
		} catch (error) {
			subjectAliasErrors.push(`${row.sourceGroup} / ${row.teacherName} / ${row.subjectCell}`);
			continue;
		}

		const teacher = teacherMap.get(row.teacherName);
		const group = groupMap.get(row.groupName);
		for (const canonicalName of canonicalSubjects) {
			const subject =
				subjectMap.get(canonicalName) ??
				(await ensureSubject({ state, usageCounts, canonicalName, planned }));
			subjectMap.set(canonicalName, subject);

			const key = `${teacher.id}|${group.id}|${subject.id}|${state.branch.id}|${YEAR}`;
			if (seen.has(key)) continue;
			seen.add(key);
			assignments.push({
				org_id: ORG_ID,
				teacher_id: teacher.id,
				group_id: group.id,
				subject_id: subject.id,
				branch_id: state.branch.id,
				year: YEAR,
				deleted_at: null,
				archived_at: null,
			});
		}
	}

	if (subjectAliasErrors.length > 0) {
		throw new Error(`Subject validation failed:\n- ${subjectAliasErrors.join("\n- ")}`);
	}

	return { assignments, subjectMap };
}

function writeBackup({ state, rows, groupsToRebuild, newAssignments, existingAssignments, existingTasks }) {
	const backupDir = path.join(__dirname, "backups");
	fs.mkdirSync(backupDir, { recursive: true });
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = path.join(backupDir, `nesimi-xlsx-rebuild-${YEAR}-${stamp}.json`);
	fs.writeFileSync(
		backupPath,
		JSON.stringify(
			{
				createdAt: new Date().toISOString(),
				sourceFile: INPUT_FILE,
				orgId: ORG_ID,
				branch: state.branch,
				year: YEAR,
				groupsToRebuild,
				sourceRows: rows,
				existingAssignments,
				existingTasks,
				newAssignmentCount: newAssignments.length,
			},
			null,
			2,
		),
	);
	return backupPath;
}

function getOpenCycle(state) {
	const openCycleIds = Array.from(
		new Set(
			state.tasks
				.filter((task) => task.branch_id === state.branch.id)
				.map((task) => task.cycle_id),
		),
	);
	if (openCycleIds.length !== 1) {
		throw new Error(`Expected exactly one Nəsimi task cycle, got ${openCycleIds.length}.`);
	}
	return openCycleIds[0];
}

function buildTaskId({ cycleId, raterUid, targetType, targetId, groupId, subjectId }) {
	return [cycleId, raterUid, targetType, targetId, groupId ?? "all", subjectId ?? "all"].join("_");
}

async function regenerateTasks(state, replacementAssignments) {
	const cycleId = getOpenCycle(state);
	const branchTasks = state.tasks.filter(
		(task) => task.branch_id === state.branch.id && task.cycle_id === cycleId,
	);
	const submissions = state.submissions.filter(
		(submission) => submission.branch_id === state.branch.id && submission.cycle_id === cycleId,
	);
	if (submissions.length > 0) {
		throw new Error(`Cannot regenerate Nəsimi tasks: ${submissions.length} submissions exist.`);
	}

	const groupById = new Map(state.groups.map((group) => [group.id, group]));
	const subjectById = new Map(state.subjects.map((subject) => [subject.id, subject]));
	const teacherById = new Map(state.teachers.map((teacher) => [teacher.id, teacher]));
	const usersById = new Map(state.users.map((user) => [user.id, user]));
	const scopedStudents = state.students.filter(
		(student) => student.branch_id === state.branch.id && !student.deleted_at,
	);
	const scopedUsers = state.users.filter(
		(user) => user.branch_id === state.branch.id && !user.deleted_at,
	);
	const branchTeachers = scopedUsers.filter(
		(user) => user.branch_id === state.branch.id && user.role === "teacher" && !user.deleted_at,
	);
	const teacherIdByUserId = new Map();
	for (const teacher of state.teachers) {
		if (teacher.user_id) teacherIdByUserId.set(teacher.user_id, teacher.id);
		teacherIdByUserId.set(teacher.id, teacher.id);
	}

	const assignmentsByGroup = indexBy(replacementAssignments, (assignment) => assignment.group_id);
	const taskRows = [];
	const seen = new Set();

	for (const user of scopedUsers.filter((item) => item.role === "student")) {
		const student = scopedStudents.find((item) => item.id === user.id || item.user_id === user.id);
		if (!student) continue;
		const groupId = student.group_id;
		const assignments = assignmentsByGroup.get(groupId) ?? [];
		const grouped = new Map();
		for (const assignment of assignments) {
			const key = `${assignment.teacher_id}|${assignment.group_id}`;
			if (!grouped.has(key)) {
				grouped.set(key, {
					teacherId: assignment.teacher_id,
					groupId: assignment.group_id,
					subjectNames: [],
				});
			}
			const item = grouped.get(key);
			const subjectName = subjectById.get(assignment.subject_id)?.name ?? assignment.subject_id;
			if (!item.subjectNames.includes(subjectName)) item.subjectNames.push(subjectName);
		}

		for (const item of grouped.values()) {
			const taskId = buildTaskId({
				cycleId,
				raterUid: user.id,
				targetType: "teacher",
				targetId: item.teacherId,
				groupId: item.groupId,
			});
			if (seen.has(taskId)) continue;
			seen.add(taskId);
			taskRows.push({
				id: taskId,
				org_id: ORG_ID,
				cycle_id: cycleId,
				rater_id: user.id,
				rater_role: "student",
				target_type: "teacher",
				target_id: item.teacherId,
				target_name: teacherById.get(item.teacherId)?.name ?? null,
				group_id: item.groupId,
				group_name: groupById.get(item.groupId)?.name ?? null,
				subject_id: null,
				subject_name: item.subjectNames.sort().join(", "),
				branch_id: state.branch.id,
				status: "OPEN",
			});
		}
	}

	for (const user of branchTeachers) {
		const teacherId = teacherIdByUserId.get(user.id);
		if (!teacherId) continue;
		const teacher = teacherById.get(teacherId);
		const taskId = buildTaskId({
			cycleId,
			raterUid: user.id,
			targetType: "teacher",
			targetId: teacherId,
		});
		if (seen.has(taskId)) continue;
		seen.add(taskId);
		taskRows.push({
			id: taskId,
			org_id: ORG_ID,
			cycle_id: cycleId,
			rater_id: user.id,
			rater_role: "teacher",
			target_type: "teacher",
			target_id: teacherId,
			target_name: teacher?.name ?? user.display_name ?? user.login ?? null,
			group_id: null,
			group_name: null,
			subject_id: null,
			subject_name: null,
			branch_id: state.branch.id,
			status: "OPEN",
		});
	}

	if (APPLY) {
		const { error: deleteError } = await supabase
			.from("tasks")
			.delete()
			.eq("org_id", ORG_ID)
			.eq("branch_id", state.branch.id)
			.eq("cycle_id", cycleId);
		if (deleteError) throw new Error(`Task delete failed: ${deleteError.message}`);

		for (let i = 0; i < taskRows.length; i += 500) {
			const { error } = await supabase.from("tasks").insert(taskRows.slice(i, i + 500));
			if (error) throw new Error(`Task insert failed: ${error.message}`);
		}
	}

	return {
		cycleId,
		existingTasks: branchTasks.length,
		submissions: submissions.length,
		newTasks: taskRows.length,
	};
}

async function applyReplacement({ state, rows, groupMap, assignments }) {
	const groupsToRebuild = Array.from(new Set(rows.map((row) => row.groupName)))
		.map((groupName) => groupMap.get(groupName))
		.sort((a, b) => a.name.localeCompare(b.name, "az"));
	const groupIds = groupsToRebuild.map((group) => group.id);
	const existingAssignments = state.assignments.filter(
		(assignment) =>
			assignment.branch_id === state.branch.id &&
			assignment.year === YEAR &&
			groupIds.includes(assignment.group_id),
	);
	const existingTasks = state.tasks.filter((task) => task.branch_id === state.branch.id);
	const backupPath = writeBackup({
		state,
		rows,
		groupsToRebuild,
		newAssignments: assignments,
		existingAssignments,
		existingTasks,
	});

	const { data: deletedRows, error: deleteError } = await supabase
		.from("teaching_assignments")
		.delete()
		.eq("org_id", ORG_ID)
		.eq("branch_id", state.branch.id)
		.eq("year", YEAR)
		.in("group_id", groupIds)
		.select("id");
	if (deleteError) throw new Error(`Assignment delete failed: ${deleteError.message}`);

	for (let i = 0; i < assignments.length; i += 500) {
		const { error } = await supabase.from("teaching_assignments").insert(assignments.slice(i, i + 500));
		if (error) throw new Error(`Assignment insert failed: ${error.message}`);
	}

	return {
		backupPath,
		deletedAssignments: deletedRows?.length ?? 0,
		insertedAssignments: assignments.length,
	};
}

async function main() {
	const rows = readWorkbookRows();
	const state = await loadState();
	const planned = { teachersToCreate: [], subjectsToCreate: [] };
	await ensureCreatedTeachers({ state, planned });

	const groupMap = resolveGroups(rows, state);
	const teacherResult = resolveTeachers(rows, state);
	const { assignments, subjectMap } = await buildAssignments({
		rows,
		state,
		groupMap,
		teacherMap: teacherResult.resolved,
		planned,
	});

	const groupsToRebuild = Array.from(new Set(rows.map((row) => row.groupName))).sort();
	const groupIds = groupsToRebuild.map((groupName) => groupMap.get(groupName).id);
	const existingAssignments = state.assignments.filter(
		(assignment) =>
			assignment.branch_id === state.branch.id &&
			assignment.year === YEAR &&
			groupIds.includes(assignment.group_id),
	);

	let applyResult = null;
	if (APPLY) {
		applyResult = await applyReplacement({ state, rows, groupMap, assignments });
	}

	let taskPlan = null;
	if (REGENERATE_TASKS) {
		if (teacherResult.missingLogins.length > 0) {
			throw new Error(
				`Cannot regenerate tasks while scheduled teachers have no login/user_id:\n- ${teacherResult.missingLogins
					.map((teacher) => `${teacher.id} / ${teacher.name}`)
					.join("\n- ")}`,
			);
		}
		taskPlan = await regenerateTasks(state, assignments);
	}

	const summary = {
		mode: APPLY ? "apply" : "validate",
		sourceFile: INPUT_FILE,
		branch: state.branch,
		year: YEAR,
		sourceRows: rows.length,
		sourceClasses: groupsToRebuild.length,
		teacherAliases: teacherResult.resolved.size,
		scheduledTeachers: teacherResult.scheduledTeachers.length,
		missingTeacherLogins: teacherResult.missingLogins.map((teacher) => ({
			id: teacher.id,
			name: teacher.name,
			login: teacher.login,
			user_id: teacher.user_id,
		})),
		teachersToCreate: planned.teachersToCreate,
		subjectsUsed: subjectMap.size,
		subjectsToCreate: planned.subjectsToCreate.map((subject) => ({
			id: subject.id,
			name: subject.name,
		})),
		existingAssignmentsForClasses: existingAssignments.length,
		newAssignments: assignments.length,
		taskPlan,
		applyResult,
		next: APPLY
			? "Applied. Provision logins for newly-created teachers if any."
			: "Validation passed. Re-run with --apply to rebuild the listed Nəsimi classes.",
	};

	console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
