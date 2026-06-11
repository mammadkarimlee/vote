export type ZipFile = {
	name: string;
	content: string | Uint8Array;
};

const encoder = new TextEncoder();

const crcTable = (() => {
	const table = new Uint32Array(256);
	for (let i = 0; i < 256; i += 1) {
		let value = i;
		for (let bit = 0; bit < 8; bit += 1) {
			value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
		}
		table[i] = value >>> 0;
	}
	return table;
})();

const crc32 = (bytes: Uint8Array) => {
	let crc = 0xffffffff;
	for (const byte of bytes) {
		crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
	}
	return (crc ^ 0xffffffff) >>> 0;
};

const toBytes = (content: string | Uint8Array) =>
	typeof content === "string" ? encoder.encode(content) : content;

const pushUint16 = (target: number[], value: number) => {
	target.push(value & 0xff, (value >>> 8) & 0xff);
};

const pushUint32 = (target: number[], value: number) => {
	const unsigned = value >>> 0;
	target.push(
		unsigned & 0xff,
		(unsigned >>> 8) & 0xff,
		(unsigned >>> 16) & 0xff,
		(unsigned >>> 24) & 0xff,
	);
};

const getDosTime = (date: Date) =>
	(date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);

const getDosDate = (date: Date) =>
	((date.getFullYear() - 1980) << 9) |
	((date.getMonth() + 1) << 5) |
	date.getDate();

const concatBytes = (parts: Uint8Array[]) => {
	const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
	const output = new Uint8Array(totalLength);
	let offset = 0;
	for (const part of parts) {
		output.set(part, offset);
		offset += part.length;
	}
	return output;
};

export const buildZipBlob = (files: ZipFile[]) => {
	const now = new Date();
	const dosTime = getDosTime(now);
	const dosDate = getDosDate(now);
	const localParts: Uint8Array[] = [];
	const centralParts: Uint8Array[] = [];
	let offset = 0;

	for (const file of files) {
		const nameBytes = encoder.encode(file.name);
		const data = toBytes(file.content);
		const checksum = crc32(data);

		const localHeader: number[] = [];
		pushUint32(localHeader, 0x04034b50);
		pushUint16(localHeader, 20);
		pushUint16(localHeader, 0x0800);
		pushUint16(localHeader, 0);
		pushUint16(localHeader, dosTime);
		pushUint16(localHeader, dosDate);
		pushUint32(localHeader, checksum);
		pushUint32(localHeader, data.length);
		pushUint32(localHeader, data.length);
		pushUint16(localHeader, nameBytes.length);
		pushUint16(localHeader, 0);

		const localPart = concatBytes([
			new Uint8Array(localHeader),
			nameBytes,
			data,
		]);
		localParts.push(localPart);

		const centralHeader: number[] = [];
		pushUint32(centralHeader, 0x02014b50);
		pushUint16(centralHeader, 20);
		pushUint16(centralHeader, 20);
		pushUint16(centralHeader, 0x0800);
		pushUint16(centralHeader, 0);
		pushUint16(centralHeader, dosTime);
		pushUint16(centralHeader, dosDate);
		pushUint32(centralHeader, checksum);
		pushUint32(centralHeader, data.length);
		pushUint32(centralHeader, data.length);
		pushUint16(centralHeader, nameBytes.length);
		pushUint16(centralHeader, 0);
		pushUint16(centralHeader, 0);
		pushUint16(centralHeader, 0);
		pushUint16(centralHeader, 0);
		pushUint32(centralHeader, 0);
		pushUint32(centralHeader, offset);
		centralParts.push(concatBytes([new Uint8Array(centralHeader), nameBytes]));

		offset += localPart.length;
	}

	const centralDirectory = concatBytes(centralParts);
	const endRecord: number[] = [];
	pushUint32(endRecord, 0x06054b50);
	pushUint16(endRecord, 0);
	pushUint16(endRecord, 0);
	pushUint16(endRecord, files.length);
	pushUint16(endRecord, files.length);
	pushUint32(endRecord, centralDirectory.length);
	pushUint32(endRecord, offset);
	pushUint16(endRecord, 0);

	const zipBytes = concatBytes([
		...localParts,
		centralDirectory,
		new Uint8Array(endRecord),
	]);
	const blobPart = zipBytes.buffer.slice(
		zipBytes.byteOffset,
		zipBytes.byteOffset + zipBytes.byteLength,
	) as ArrayBuffer;
	return new Blob([blobPart], { type: "application/zip" });
};

export const downloadZip = (fileName: string, files: ZipFile[]) => {
	const blob = buildZipBlob(files);
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = fileName;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
