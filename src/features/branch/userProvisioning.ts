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

type WrappedProvisionError = {
	retryable?: boolean;
	error?: unknown;
};

type ProvisionAttempt = {
	run: () => Promise<unknown>;
};

const SESSION_EXPIRED_MESSAGE = "Sessiya bitib. Yenidən daxil olun.";
const PROVISION_UNAVAILABLE_MESSAGE =
	"Provision xidməti ilə əlaqə qurulmadı. `npm run dev:server` ilə serveri başladın və ya `VITE_PROVISION_API_URL` dəyərini yoxlayın.";

const normalizeBaseUrl = (value: string) => {
	const trimmed = value.trim();
	if (!trimmed) return "";
	if (trimmed === "/") return "/api";
	return trimmed.replace(/\/+$/, "");
};

const configuredBaseUrl = import.meta.env.VITE_PROVISION_API_URL?.trim();
const fallbackBaseUrl = import.meta.env.PROD ? "/api" : "http://localhost:8787";
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? "";
const EDGE_FUNCTION_URL = supabaseUrl
	? `${supabaseUrl.replace(/\/+$/, "")}/functions/v1/provision-user`
	: "";

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

const isAuthMessage = (message: string) => {
	const normalized = message.toLowerCase();
	return (
		normalized.includes("unauthorized") ||
		normalized.includes("http 401") ||
		normalized.includes("sessiya bitib")
	);
};

const extractFunctionError = async (error: unknown, data: unknown) => {
	if (data && typeof data === "object" && data !== null && "error" in data) {
		const message = (data as { error?: unknown }).error;
		if (typeof message === "string" && message.trim()) {
			if (isAuthMessage(message)) {
				return new Error(SESSION_EXPIRED_MESSAGE);
			}
			return new Error(message);
		}
	}

	const anyError = error as { context?: unknown; message?: string };
	if (anyError?.context) {
		const context = anyError.context;
		if (typeof context === "string") {
			if (isAuthMessage(context)) {
				return new Error(SESSION_EXPIRED_MESSAGE);
			}
			return new Error(context);
		}
		if (typeof Response !== "undefined" && context instanceof Response) {
			if (context.status === 401) {
				return new Error(SESSION_EXPIRED_MESSAGE);
			}
			try {
				const body = await context.clone().json();
				if (body && typeof body.error === "string") {
					if (isAuthMessage(body.error)) {
						return new Error(SESSION_EXPIRED_MESSAGE);
					}
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
				if (isAuthMessage(ctxError)) {
					return new Error(SESSION_EXPIRED_MESSAGE);
				}
				return new Error(ctxError);
			}
		}
	}

	if (error instanceof Error) {
		if (isAuthMessage(error.message)) {
			return new Error(SESSION_EXPIRED_MESSAGE);
		}
		return error;
	}

	if (typeof anyError?.message === "string") {
		if (isAuthMessage(anyError.message)) {
			return new Error(SESSION_EXPIRED_MESSAGE);
		}
		return new Error(anyError.message);
	}

	return new Error("Yaratma zamanı xəta oldu");
};

const unwrapProvisionError = async (rawError: unknown) => {
	if (typeof rawError === "object" && rawError !== null && "error" in rawError) {
		const wrapped = rawError as WrappedProvisionError;
		return {
			retryable: Boolean(wrapped.retryable),
			error:
				wrapped.error instanceof Error
					? wrapped.error
					: await extractFunctionError(wrapped.error, null),
		};
	}

	return {
		retryable: false,
		error: await extractFunctionError(rawError, null),
	};
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
			error: await extractFunctionError(new Error(`HTTP ${response.status}`), body),
		};
	}

	return body;
};

const postProvisionEdgeFunction = async (
	token: string,
	payload: ProvisionPayload,
) => {
	if (!EDGE_FUNCTION_URL || !supabaseAnonKey) {
		throw {
			retryable: true,
			error: new Error("Supabase konfiqurasiyası natamamdır"),
		};
	}

	const response = await fetch(EDGE_FUNCTION_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Authorization: `Bearer ${token}`,
			apikey: supabaseAnonKey,
		},
		body: JSON.stringify(payload),
	});

	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw {
			retryable: isRetryableStatus(response.status),
			error: await extractFunctionError(new Error(`HTTP ${response.status}`), data),
		};
	}

	if (data && typeof data === "object" && "error" in data) {
		throw {
			retryable: false,
			error: await extractFunctionError(new Error("Edge function error"), data),
		};
	}

	return data;
};

const buildProvisionAttempts = (
	token: string,
	payload: ProvisionPayload,
): ProvisionAttempt[] => {
	const httpAttempts: ProvisionAttempt[] = PROVISION_HTTP_BASES.map((baseUrl) => ({
		run: () => postProvisionHttp(baseUrl, token, payload),
	}));
	const edgeAttempts: ProvisionAttempt[] =
		EDGE_FUNCTION_URL && supabaseAnonKey
			? [
					{
						run: () => postProvisionEdgeFunction(token, payload),
					},
				]
			: [];

	return import.meta.env.DEV
		? [...httpAttempts, ...edgeAttempts]
		: [...edgeAttempts, ...httpAttempts];
};

const shouldTryNextEndpoint = (error: Error, retryable: boolean) =>
	retryable || isAuthMessage(error.message);

const provisionViaAnyEndpoint = async (token: string, payload: ProvisionPayload) => {
	let lastError: Error | null = null;
	let sawAuthError = false;
	let sawNonAuthError = false;

	for (const attempt of buildProvisionAttempts(token, payload)) {
		try {
			return await attempt.run();
		} catch (rawError) {
			const { retryable, error } = await unwrapProvisionError(rawError);
			lastError = error;
			const authError = isAuthMessage(error.message);
			sawAuthError = sawAuthError || authError;
			sawNonAuthError = sawNonAuthError || !authError;
			if (!shouldTryNextEndpoint(error, retryable)) {
				throw error;
			}
		}
	}

	if (sawAuthError && !sawNonAuthError) {
		throw new Error(SESSION_EXPIRED_MESSAGE);
	}

	throw lastError ?? new Error(PROVISION_UNAVAILABLE_MESSAGE);
};

const readCurrentAccessToken = async () => {
	const { data, error } = await supabase.auth.getSession();
	if (error || !data.session?.access_token) {
		return null;
	}

	return {
		accessToken: data.session.access_token,
		expiresAt: data.session.expires_at ?? null,
	};
};

const getAccessToken = async (forceRefresh = false): Promise<string> => {
	if (forceRefresh) {
		const { data, error } = await supabase.auth.refreshSession();
		if (!error && data.session?.access_token) {
			return data.session.access_token;
		}

		const current = await readCurrentAccessToken();
		if (current?.accessToken) {
			return current.accessToken;
		}

		throw new Error(SESSION_EXPIRED_MESSAGE);
	}

	const current = await readCurrentAccessToken();
	if (!current?.accessToken) {
		throw new Error(SESSION_EXPIRED_MESSAGE);
	}

	const expiresAtSeconds = current.expiresAt;
	if (expiresAtSeconds) {
		const expiresAtMs = expiresAtSeconds * 1000;
		const nearExpiry = expiresAtMs - Date.now() < 60_000;
		if (nearExpiry) {
			try {
				return await getAccessToken(true);
			} catch {
				// ignore and fall back to current token
			}
		}
	}

	return current.accessToken;
};

const runProvisionWithSessionRetry = async (payload: ProvisionPayload) => {
	let token = await getAccessToken(false);

	try {
		return await provisionViaAnyEndpoint(token, payload);
	} catch (firstError) {
		const normalized =
			firstError instanceof Error
				? firstError
				: await extractFunctionError(firstError, null);
		if (!isAuthMessage(normalized.message)) {
			throw normalized;
		}

		token = await getAccessToken(true);
		return await provisionViaAnyEndpoint(token, payload);
	}
};

export const provisionLoginUser = async (params: {
	name: string;
	branchId: string;
	role: Role;
	collection?: "students" | "teachers";
	docData?: Record<string, unknown>;
}) => {
	const payload = await runProvisionWithSessionRetry({
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
	const payload = await runProvisionWithSessionRetry({
		mode: "email",
		name: params.name,
		role: params.role,
		branchId: params.branchId ?? null,
		email: params.email,
		password: params.password,
	});

	return payload as { uid: string };
};
