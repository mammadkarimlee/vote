import { supabase } from "../../lib/supabase";
import type { Role } from "../../lib/types";

type ProvisionPayload = {
	mode: "login" | "email";
	name: string;
	role: Role;
	branchId?: string | null;
	email?: string;
	password?: string;
	docData?: Record<string, unknown>;
};

const normalizeBaseUrl = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed === "/") return "/api";
	return trimmed.replace(/\/+$/, "");
};

const configuredBaseUrl = import.meta.env.VITE_PROVISION_API_URL?.trim();
const fallbackBaseUrl = import.meta.env.PROD ? "/api" : "http://localhost:8787";

const PROVISION_HTTP_BASES = Array.from(
	new Set(
		["/api", configuredBaseUrl, fallbackBaseUrl]
			.filter((value): value is string => Boolean(value && value.trim()))
			.map((value) => normalizeBaseUrl(value)),
	),
);

const isRetryableStatus = (status: number) =>
	status === 404 ||
	status === 408 ||
	status === 429 ||
	status === 500 ||
	status === 502 ||
	status === 503 ||
	status === 504;

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

const postProvisionHttp = async (
	baseUrl: string,
	token: string,
	payload: ProvisionPayload,
) => {
	const response = await fetch(`${baseUrl}/provision-user`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
		},
		body: JSON.stringify(payload),
	});

	const body = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw {
			retryable: isRetryableStatus(response.status),
			error: await extractFunctionError(
				new Error(`HTTP ${response.status}`),
				body,
			),
		};
	}
	return body;
};

const postProvisionEdgeFunction = async (token: string, payload: ProvisionPayload) => {
	const { data, error } = await supabase.functions.invoke("provision-user", {
		body: payload,
		headers: {
			Authorization: `Bearer ${token}`,
		},
	});

	if (error) {
		throw await extractFunctionError(error, data);
	}
	if (data && typeof data === "object" && "error" in data) {
		throw await extractFunctionError(new Error("Edge function error"), data);
	}
	return data;
};

const provisionViaAnyEndpoint = async (token: string, payload: ProvisionPayload) => {
	let lastError: Error | null = null;

	for (const baseUrl of PROVISION_HTTP_BASES) {
		try {
			return await postProvisionHttp(baseUrl, token, payload);
		} catch (rawError) {
			if (
				typeof rawError === "object" &&
				rawError !== null &&
				"error" in rawError
			) {
				const wrapped = rawError as { retryable?: boolean; error?: unknown };
				const parsed =
					wrapped.error instanceof Error
						? wrapped.error
						: await extractFunctionError(wrapped.error, null);
				lastError = parsed;
				if (!wrapped.retryable) {
					throw parsed;
				}
				continue;
			}
			lastError = await extractFunctionError(rawError, null);
		}
	}

	try {
		return await postProvisionEdgeFunction(token, payload);
	} catch (edgeError) {
		lastError = await extractFunctionError(edgeError, null);
	}

	throw (
		lastError ??
		new Error(
			"Provision xidməti ilə əlaqə qurulmadı. `npm run dev:server` ilə serveri başladın və ya `VITE_PROVISION_API_URL` dəyərini yoxlayın.",
		)
	);
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

	const payload = await provisionViaAnyEndpoint(sessionData.session.access_token, {
		mode: "login",
		name: params.name,
		role: params.role,
		branchId: params.branchId,
		docData: params.docData,
	});

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

	const payload = await provisionViaAnyEndpoint(sessionData.session.access_token, {
		mode: "email",
		name: params.name,
		role: params.role,
		branchId: params.branchId ?? null,
		email: params.email,
		password: params.password,
	});

	return payload as { uid: string };
};
