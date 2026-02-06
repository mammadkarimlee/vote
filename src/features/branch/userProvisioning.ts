import { supabase } from "../../lib/supabase";
import type { Role } from "../../lib/types";

const PROVISION_API_URL =
	import.meta.env.VITE_PROVISION_API_URL ||
	(import.meta.env.PROD ? "/api" : "http://localhost:8787");

const extractFunctionError = async (error: unknown, data: unknown) => {
	if (data && typeof data === "object" && data !== null && "error" in data) {
		const message = (data as { error?: unknown }).error;
		if (typeof message === "string" && message.trim()) {
			return new Error(message);
		}
	}

	const anyError = error as { context?: unknown; message?: string };
	if (anyError?.context) {
		const context = anyError.context;
		if (typeof context === "string") {
			return new Error(context);
		}
		if (typeof Response !== "undefined" && context instanceof Response) {
			try {
				const body = await context.clone().json();
				if (body && typeof body.error === "string") {
					return new Error(body.error);
				}
			} catch {
				// ignore parse error
			}
			return new Error(`HTTP ${context.status}`);
		}
		if (typeof context === "object" && context !== null && "error" in context) {
			const ctxError = (context as { error?: unknown }).error;
			if (typeof ctxError === "string" && ctxError.trim()) {
				return new Error(ctxError);
			}
		}
	}

	if (error instanceof Error) return error;
	if (anyError?.message) return new Error(anyError.message);
	return new Error("Yaratma zamanı xəta oldu");
};

export const provisionLoginUser = async (params: {
	name: string;
	branchId: string;
	role: Role;
	collection?: "students" | "teachers";
	docData?: Record<string, unknown>;
}) => {
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	if (sessionError || !sessionData.session?.access_token) {
		throw new Error("Sessiya bitib. Yenidən daxil olun.");
	}

	const response = await fetch(`${PROVISION_API_URL}/provision-user`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionData.session.access_token}`,
		},
		body: JSON.stringify({
			mode: "login",
			name: params.name,
			role: params.role,
			branchId: params.branchId,
			docData: params.docData,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw await extractFunctionError(
			new Error(`HTTP ${response.status}`),
			payload,
		);
	}

	return payload as {
		uid: string;
		login: string;
		password: string;
		email: string;
	};
};

export const provisionEmailUser = async (params: {
	name: string;
	email: string;
	password: string;
	role: Role;
	branchId?: string | null;
}) => {
	const { data: sessionData, error: sessionError } =
		await supabase.auth.getSession();
	if (sessionError || !sessionData.session?.access_token) {
		throw new Error("Sessiya bitib. Yenidən daxil olun.");
	}

	const response = await fetch(`${PROVISION_API_URL}/provision-user`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${sessionData.session.access_token}`,
		},
		body: JSON.stringify({
			mode: "email",
			name: params.name,
			role: params.role,
			branchId: params.branchId ?? null,
			email: params.email,
			password: params.password,
		}),
	});

	const payload = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw await extractFunctionError(
			new Error(`HTTP ${response.status}`),
			payload,
		);
	}

	return payload as { uid: string };
};
