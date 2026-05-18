import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = path.resolve("outputs/biq-template");
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();

const rules = workbook.worksheets.add("Qaydalar");
const classBiq = workbook.worksheets.add("biq_sinif_fenn");
const teacherBiq = workbook.worksheets.add("biq_muellim");

const theme = {
	green: "#0F766E",
	greenDark: "#134E4A",
	greenLight: "#CCFBF1",
	blue: "#1D4ED8",
	blueLight: "#DBEAFE",
	amber: "#FEF3C7",
	border: "#CBD5E1",
	text: "#0F172A",
	muted: "#475569",
};

const styleTitle = (sheet, range) => {
	sheet.getRange(range).format = {
		fill: theme.greenDark,
		font: { bold: true, color: "#FFFFFF", size: 16 },
		wrapText: true,
	};
};

const styleHeader = (sheet, range, fill = theme.green) => {
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

rules.getRange("A1:F1").merge();
rules.getRange("A1").values = [["BİQ nəticələri üçün Excel template"]];
styleTitle(rules, "A1:F1");

rules.getRange("A3:F10").values = [
	["Nə üçün istifadə olunur?", "", "", "", "", ""],
	[
		"Bu fayl rəhbərlik tərəfindən doldurulur və sonra sistemə import olunur. Hər nəticə ayrıca sətir yazılmalıdır.",
		"",
		"",
		"",
		"",
		"",
	],
	["Sheet", "Nə vaxt doldurulur?", "Mütləq sütunlar", "Bal aralığı", "Vacib qeyd", ""],
	[
		"biq_sinif_fenn",
		"Sinif + fənn üzrə ümumi BİQ nəticəsi varsa",
		"sinif, fenn, bal",
		"0-100",
		"Bu nəticə həmin sinif/fənn təyinatlarına əsas kimi istifadə olunur.",
		"",
	],
	[
		"biq_muellim",
		"Konkret müəllimin balı ümumi nəticədən fərqlidirsə",
		"muellim, sinif, fenn, bal",
		"0-100",
		"Login məlumdursa mütləq yazın. Eyni adlı müəllimlərdə login vacibdir.",
		"",
	],
	["", "", "", "", "", ""],
	["Doldurma qaydaları", "", "", "", "", ""],
	[
		"Başlıqları dəyişməyin. Merge edilmiş xanalar istifadə etməyin. Əlavə başlıq/sətir/subtotal yazmayın. Sistem necə yazırsa, sinif, fənn və müəllim adlarını elə yazın.",
		"",
		"",
		"",
		"",
		"",
	],
];
rules.getRange("A3:F3").merge();
rules.getRange("A4:F4").merge();
styleHeader(rules, "A5:E5", theme.blue);
styleNote(rules, "A4:F4", theme.blueLight);
styleHeader(rules, "A9:F9", theme.green);
rules.getRange("A10:F10").merge();
styleNote(rules, "A10:F10");
rules.getRange("A3:F3").format = {
	font: { bold: true, color: theme.greenDark, size: 13 },
};
rules.getRange("A6:E7").format = {
	wrapText: true,
	verticalAlignment: "top",
};
rules.getRange("A:A").format.columnWidthPx = 150;
rules.getRange("B:B").format.columnWidthPx = 290;
rules.getRange("C:C").format.columnWidthPx = 180;
rules.getRange("D:D").format.columnWidthPx = 100;
rules.getRange("E:E").format.columnWidthPx = 380;
rules.getRange("F:F").format.columnWidthPx = 20;
rules.getRange("A1:F5").format.rowHeightPx = 30;
rules.getRange("A6:F7").format.rowHeightPx = 46;
rules.getRange("A9:F9").format.rowHeightPx = 30;
rules.getRange("A10:F10").format.rowHeightPx = 52;

classBiq.getRange("A:A").format.numberFormat = "@";
classBiq.getRange("B:B").format.numberFormat = "@";
classBiq.getRange("D:D").format.numberFormat = "@";
classBiq.getRange("A1:D1").values = [["sinif", "fenn", "bal", "qeyd"]];
styleHeader(classBiq, "A1:D1");
classBiq.getRange("A2:D8").values = [
	["7A5", "Riyaziyyat", 84, "Nümunə sətirdir, dəyişdirin"],
	["6R4", "Fizika", 76, "Nümunə sətirdir, dəyişdirin"],
	["4A4", "İngilis dili", 91, "Nümunə sətirdir, dəyişdirin"],
	["", "", "", ""],
	["", "", "", ""],
	["", "", "", ""],
	["", "", "", ""],
];
const classTable = classBiq.tables.add("A1:D8", true, "BiqSinifFennTemplate");
classTable.style = "TableStyleMedium4";
classBiq.getRange("A:A").format.columnWidthPx = 120;
classBiq.getRange("B:B").format.columnWidthPx = 190;
classBiq.getRange("C:C").format.columnWidthPx = 90;
classBiq.getRange("D:D").format.columnWidthPx = 250;
classBiq.getRange("C2:C500").format.numberFormat = "0.00";
classBiq.getRange("A2:D500").format = {
	wrapText: true,
	verticalAlignment: "center",
};
classBiq.getRange("F1:H6").values = [
	["Qısa qayda", "", ""],
	["sinif", "Sistemdəki sinif adı", "məs: 7A5"],
	["fenn", "Sistemdəki fənn adı", "məs: Riyaziyyat"],
	["bal", "0-100 arası rəqəm", "məs: 84"],
	["qeyd", "İstəyə bağlıdır", "import üçün vacib deyil"],
	["", "", ""],
];
styleHeader(classBiq, "F1:H1", theme.blue);
styleNote(classBiq, "F2:H5", theme.blueLight);
classBiq.getRange("F:F").format.columnWidthPx = 120;
classBiq.getRange("G:G").format.columnWidthPx = 180;
classBiq.getRange("H:H").format.columnWidthPx = 180;

teacherBiq.getRange("A:D").format.numberFormat = "@";
teacherBiq.getRange("F:F").format.numberFormat = "@";
teacherBiq.getRange("A1:F1").values = [
	["muellim", "login", "sinif", "fenn", "bal", "qeyd"],
];
styleHeader(teacherBiq, "A1:F1");
teacherBiq.getRange("A2:F8").values = [
	[
		"Heyran Məmmədova",
		"",
		"7A5",
		"Riyaziyyat",
		88,
		"Nümunə sətirdir, dəyişdirin",
	],
	[
		"Aysel Əliyeva",
		"",
		"6R4",
		"Fizika",
		79,
		"Nümunə sətirdir, dəyişdirin",
	],
	[
		"Kamran Həsənov",
		"",
		"4A4",
		"İngilis dili",
		93,
		"Nümunə sətirdir, dəyişdirin",
	],
	["", "", "", "", "", ""],
	["", "", "", "", "", ""],
	["", "", "", "", "", ""],
	["", "", "", "", "", ""],
];
const teacherTable = teacherBiq.tables.add("A1:F8", true, "BiqMuellimTemplate");
teacherTable.style = "TableStyleMedium2";
teacherBiq.getRange("A:A").format.columnWidthPx = 190;
teacherBiq.getRange("B:B").format.columnWidthPx = 120;
teacherBiq.getRange("C:C").format.columnWidthPx = 100;
teacherBiq.getRange("D:D").format.columnWidthPx = 180;
teacherBiq.getRange("E:E").format.columnWidthPx = 90;
teacherBiq.getRange("F:F").format.columnWidthPx = 250;
teacherBiq.getRange("E2:E500").format.numberFormat = "0.00";
teacherBiq.getRange("A2:F500").format = {
	wrapText: true,
	verticalAlignment: "center",
};
teacherBiq.getRange("H1:J7").values = [
	["Qısa qayda", "", ""],
	["muellim", "Sistemdəki ad-soyad", "məs: Heyran Məmmədova"],
	["login", "İstəyə bağlı, amma tövsiyə olunur", "məs: h.mammadova"],
	["sinif", "Sistemdəki sinif adı", "məs: 7A5"],
	["fenn", "Sistemdəki fənn adı", "məs: Riyaziyyat"],
	["bal", "0-100 arası rəqəm", "məs: 88"],
	["qeyd", "İstəyə bağlıdır", "import üçün vacib deyil"],
];
styleHeader(teacherBiq, "H1:J1", theme.blue);
styleNote(teacherBiq, "H2:J7", theme.blueLight);
teacherBiq.getRange("H:H").format.columnWidthPx = 140;
teacherBiq.getRange("I:I").format.columnWidthPx = 230;
teacherBiq.getRange("J:J").format.columnWidthPx = 220;

for (const sheet of [classBiq, teacherBiq]) {
	sheet.getRange("A1:J1").format.rowHeightPx = 32;
	sheet.getRange("A2:J500").format.rowHeightPx = 24;
}

const renderTargets = [
	{ sheetName: "Qaydalar", range: "A1:F10" },
	{ sheetName: "biq_sinif_fenn", range: "A1:H8" },
	{ sheetName: "biq_muellim", range: "A1:J8" },
];

for (const target of renderTargets) {
	const preview = await workbook.render({
		sheetName: target.sheetName,
		range: target.range,
		autoCrop: "all",
		scale: 1,
		format: "png",
	});
	await fs.writeFile(
		path.join(outputDir, `${target.sheetName}.png`),
		new Uint8Array(await preview.arrayBuffer()),
	);
}

const errors = await workbook.inspect({
	kind: "match",
	searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
	options: { useRegex: true, maxResults: 50 },
	summary: "formula error scan",
});
console.log(errors.ndjson);

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(path.join(outputDir, "biq_import_template.xlsx"));

console.log(path.join(outputDir, "biq_import_template.xlsx"));
