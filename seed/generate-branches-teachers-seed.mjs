import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import XLSX from "xlsx";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_INPUT = path.join(__dirname, "branches-teachers.xlsx");
const DEFAULT_OUTPUT = path.join(__dirname, "branches-teachers.seed.sql");

const args = process.argv.slice(2);
const getArg = (name, fallback = "") => {
  const idx = args.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  return fallback;
};

const inputPath = path.resolve(process.cwd(), getArg("input", DEFAULT_INPUT));
const outputPath = path.resolve(process.cwd(), getArg("output", DEFAULT_OUTPUT));

if (!fs.existsSync(inputPath)) {
  console.error(`Input file not found: ${inputPath}`);
  process.exit(1);
}

const SKIP_SHEETS = new Set(["stars", "stars campusu"]);

const compactSpaces = (value) => String(value || "").replace(/\s+/g, " ").trim();

const escapeSql = (value) => compactSpaces(value).replace(/'/g, "''");

const normalizeTr = (value) =>
  String(value || "")
    .replace(/[ıİ]/g, "i")
    .replace(/[şŞ]/g, "s")
    .replace(/[ğĞ]/g, "g")
    .replace(/[çÇ]/g, "c")
    .replace(/[öÖ]/g, "o")
    .replace(/[üÜ]/g, "u")
    .replace(/[əƏ]/g, "e");

const slugify = (value) =>
  normalizeTr(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/--+/g, "-");

const titleWord = (word) => {
  const lower = word.toLocaleLowerCase("az-AZ");
  const parts = lower.split("-");
  return parts
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toLocaleUpperCase("az-AZ") + part.slice(1);
    })
    .join("-");
};

const toTitleCase = (fullName) =>
  compactSpaces(fullName)
    .split(" ")
    .filter(Boolean)
    .map(titleWord)
    .join(" ");

const detectNameKey = (headers) => {
  const normalized = headers.map((h) => ({
    original: h,
    key: normalizeTr(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  }));

  const exact = normalized.find((h) => h.key.includes("ad soyad ata adi") || h.key.includes("ad soyad ata adi"));
  if (exact) return exact.original;

  const byAdSoyad = normalized.find((h) => h.key.includes("ad") && h.key.includes("soyad"));
  if (byAdSoyad) return byAdSoyad.original;

  const byAd = normalized.find((h) => h.key === "ad" || h.key.startsWith("ad "));
  return byAd?.original ?? headers[0] ?? null;
};

const detectPositionKey = (headers) => {
  const normalized = headers.map((h) => ({
    original: h,
    key: normalizeTr(h).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim(),
  }));
  const match = normalized.find((h) => h.key.includes("vezif") || h.key.includes("vazife") || h.key.includes("vif"));
  return match?.original ?? null;
};

const wb = XLSX.readFile(inputPath, { defval: "" });

const branchRows = [];
const teacherRows = [];
const usedTeacherIds = new Set();

for (const sheetName of wb.SheetNames) {
  const sheetKey = normalizeTr(sheetName).toLowerCase().trim();
  if (SKIP_SHEETS.has(sheetKey)) continue;

  const branchBaseName = compactSpaces(sheetName);
  if (!branchBaseName) continue;

  const branchName = /campus(u)?$/i.test(branchBaseName) || /campusu$/i.test(branchBaseName)
    ? branchBaseName
    : `${branchBaseName} Campusu`;

  const branchCode = slugify(branchBaseName).slice(0, 3).toUpperCase() || "BRN";

  branchRows.push({ branchName, branchCode });

  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });
  if (!rows.length) continue;

  const headers = Object.keys(rows[0]);
  const nameKey = detectNameKey(headers);
  const positionKey = detectPositionKey(headers);
  if (!nameKey) continue;

  for (const row of rows) {
    const rawName = compactSpaces(row[nameKey]);
    if (!rawName) continue;

    const hasLetter = /[A-Za-zƏəĞğİıÖöŞşÜüÇç]/.test(rawName);
    if (!hasLetter) continue;

    const teacherName = toTitleCase(rawName);
    if (!teacherName) continue;

    const parts = teacherName.split(" ");
    const firstName = parts[0] || "";
    const lastName = parts[1] || "";

    const branchSlug = slugify(branchBaseName) || "branch";
    const nameSlug = slugify(teacherName) || "teacher";

    let teacherId = `${branchSlug}-teacher-${nameSlug}`;
    if (usedTeacherIds.has(teacherId)) {
      let suffix = 2;
      while (usedTeacherIds.has(`${teacherId}-${suffix}`)) suffix += 1;
      teacherId = `${teacherId}-${suffix}`;
    }
    usedTeacherIds.add(teacherId);

    const position = positionKey ? compactSpaces(row[positionKey]) : "";

    teacherRows.push({
      teacherId,
      teacherName,
      firstName,
      lastName,
      branchName,
      position,
    });
  }
}

const uniqueBranches = Array.from(
  new Map(branchRows.map((b) => [b.branchName, b])).values(),
);

const header = `-- Multi-branch teachers seed generated from workbook
-- Source: ${path.basename(inputPath)}
-- Generated at: ${new Date().toISOString()}
-- Rules: sheet name => branch name (<Sheet> Campusu), Stars sheet skipped.

begin;

insert into public.orgs (id, name)
values ('default', 'Default Org')
on conflict (id) do nothing;
`;

const branchSeed = `
create temporary table tmp_import_branches (
  branch_name text primary key,
  branch_code text
) on commit drop;

insert into tmp_import_branches (branch_name, branch_code)
values
${uniqueBranches
  .map((b) => `  ('${escapeSql(b.branchName)}', '${escapeSql(b.branchCode)}')`)
  .join(",\n")};

insert into public.branches (id, org_id, name, code, deleted_at, archived_at)
select
  coalesce((
    select br.id
    from public.branches br
    where br.org_id = 'default' and br.name = b.branch_name
    limit 1
  ), gen_random_uuid()::text),
  'default',
  b.branch_name,
  b.branch_code,
  null,
  null
from tmp_import_branches b
on conflict (org_id, name) do update
set code = excluded.code,
    deleted_at = null,
    archived_at = null;

insert into public.departments (id, org_id, branch_id, name, deleted_at, archived_at)
select
  coalesce((
    select d.id
    from public.departments d
    where d.org_id = 'default' and d.branch_id = br.id and d.name = 'Umumi'
    limit 1
  ), gen_random_uuid()::text),
  'default',
  br.id,
  'Umumi',
  null,
  null
from public.branches br
join tmp_import_branches b on b.branch_name = br.name
where br.org_id = 'default'
on conflict (org_id, branch_id, name) do update
set deleted_at = null,
    archived_at = null;
`;

const teacherSeed = `
create temporary table tmp_import_teachers (
  teacher_id text primary key,
  teacher_name text not null,
  first_name text,
  last_name text,
  branch_name text not null,
  position text
) on commit drop;

insert into tmp_import_teachers (teacher_id, teacher_name, first_name, last_name, branch_name, position)
values
${teacherRows
  .map(
    (t) =>
      `  ('${escapeSql(t.teacherId)}', '${escapeSql(t.teacherName)}', '${escapeSql(
        t.firstName,
      )}', '${escapeSql(t.lastName)}', '${escapeSql(t.branchName)}', '${escapeSql(t.position)}')`,
  )
  .join(",\n")};

insert into public.teachers (
  id,
  org_id,
  name,
  first_name,
  last_name,
  department_id,
  branch_id,
  branch_ids,
  teacher_category,
  deleted_at,
  archived_at
)
select
  t.teacher_id,
  'default',
  t.teacher_name,
  nullif(t.first_name, ''),
  nullif(t.last_name, ''),
  coalesce((
    select d.id from public.departments d
    where d.org_id = 'default'
      and d.branch_id = br.id
      and d.name = 'Umumi'
      and d.deleted_at is null
    limit 1
  ), (
    select d2.id from public.departments d2
    where d2.org_id = 'default'
      and d2.branch_id = br.id
    limit 1
  )) as department_id,
  br.id,
  array[br.id],
  'standard'::public.teacher_category,
  null,
  null
from tmp_import_teachers t
join public.branches br
  on br.org_id = 'default' and br.name = t.branch_name
on conflict (id) do update
set name = excluded.name,
    first_name = excluded.first_name,
    last_name = excluded.last_name,
    department_id = excluded.department_id,
    branch_id = excluded.branch_id,
    branch_ids = excluded.branch_ids,
    teacher_category = excluded.teacher_category,
    deleted_at = null,
    archived_at = null;
`;

const footer = `
commit;
`;

const sql = `${header}${branchSeed}${teacherSeed}${footer}`;
fs.writeFileSync(outputPath, sql, "utf8");

console.log(`Generated: ${outputPath}`);
console.log(`Branches: ${uniqueBranches.length}`);
console.log(`Teachers: ${teacherRows.length}`);
