import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export const chunkArray = <T>(items: T[], size: number): T[][] => {
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
};

export const createId = () => {
	if (
		typeof crypto !== "undefined" &&
		typeof crypto.randomUUID === "function"
	) {
		return crypto.randomUUID();
	}
	return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export const toNumber = (value: unknown) => {
	if (typeof value === "number") return value;
	if (typeof value === "string") {
		const trimmed = value.trim();
		if (trimmed.length === 0) return null;
		const parsed = Number(trimmed);
		return Number.isNaN(parsed) ? null : parsed;
	}
	return null;
};

export const formatDate = (value?: Date | string | null) => {
	if (!value) return "-";
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("az-Latn-AZ", {
		dateStyle: "medium",
	}).format(date);
};

export const formatShortDate = (value?: Date | string | null) => {
	if (!value) return "-";
	const date = typeof value === "string" ? new Date(value) : value;
	if (Number.isNaN(date.getTime())) return "-";
	return new Intl.DateTimeFormat("az-Latn-AZ", {
		day: "2-digit",
		month: "2-digit",
		year: "numeric",
	}).format(date);
};

export const toJsDate = (value: unknown) => {
	if (!value) return null;
	if (value instanceof Date) return value;
	if (
		typeof value === "object" &&
		"toDate" in (value as { toDate?: () => Date })
	) {
		const date = (value as { toDate: () => Date }).toDate();
		return Number.isNaN(date.getTime()) ? null : date;
	}
	if (typeof value === "string" || typeof value === "number") {
		const date = new Date(value);
		return Number.isNaN(date.getTime()) ? null : date;
	}
	return null;
};

export const cn = (...inputs: ClassValue[]) => {
	return twMerge(clsx(inputs));
};
