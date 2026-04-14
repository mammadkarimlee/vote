import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type PropsWithChildren,
	type SetStateAction,
} from "react";
import { createPortal } from "react-dom";

type ToastTone = "info" | "success" | "error";

type ToastItem = {
	id: string;
	message: string;
	tone: ToastTone;
	durationMs: number | null;
};

type ToastOptions = {
	tone?: ToastTone;
	durationMs?: number | null;
};

type FeedbackContextValue = {
	pushToast: (message: string, options?: ToastOptions) => void;
	dismissToast: (id: string) => void;
};

const DEFAULT_TOAST_DURATION_MS = 4500;
const ERROR_TOAST_DURATION_MS: number | null = null;

const ERROR_HINTS = [
	"xeta",
	"yanlis",
	"tapilmadi",
	"secilmeyib",
	"teleb olunur",
	"mumkun deyil",
	"saxlanmadi",
	"yuklenmedi",
	"alinmadi",
	"silinmedi",
	"yaradilmadi",
	"yenilenmedi",
	"duzgun",
	"deaktiv",
	"baglidir",
	"yoxdur",
	"icazeniz yoxdur",
];

const SUCCESS_HINTS = [
	"yaradildi",
	"yenilendi",
	"saxlanildi",
	"elave edildi",
	"ugurla",
	"silindi",
	"gonderildi",
	"hazirdir",
	"kocuruldu",
	"acildi",
	"temizlendi",
];

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

const normalizeMessage = (message: string) =>
	message
		.trim()
		.toLocaleLowerCase("az")
		.replace(/[ə]/g, "e")
		.replace(/[ı]/g, "i")
		.replace(/[ş]/g, "s")
		.replace(/[ç]/g, "c")
		.replace(/[ğ]/g, "g")
		.replace(/[ö]/g, "o")
		.replace(/[ü]/g, "u");

const inferToastTone = (message: string): ToastTone => {
	const normalized = normalizeMessage(message);
	if (ERROR_HINTS.some((hint) => normalized.includes(hint))) {
		return "error";
	}
	if (SUCCESS_HINTS.some((hint) => normalized.includes(hint))) {
		return "success";
	}
	return "info";
};

const createToastId = () => {
	if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
		return crypto.randomUUID();
	}
	return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const ToastCard = ({
	toast,
	onDismiss,
}: {
	toast: ToastItem;
	onDismiss: (id: string) => void;
}) => {
	useEffect(() => {
		if (toast.durationMs == null) return;
		const timeoutId = window.setTimeout(() => {
			onDismiss(toast.id);
		}, toast.durationMs);
		return () => window.clearTimeout(timeoutId);
	}, [onDismiss, toast.durationMs, toast.id]);

	return (
		<div
			className={`app-toast ${toast.tone}`}
			role={toast.tone === "error" ? "alert" : "status"}
		>
			<div className="app-toast__message">{toast.message}</div>
			<button
				className="app-toast__close"
				type="button"
				onClick={() => onDismiss(toast.id)}
				aria-label="Bagla"
			>
				x
			</button>
		</div>
	);
};

export const FeedbackProvider = ({ children }: PropsWithChildren) => {
	const [toasts, setToasts] = useState<ToastItem[]>([]);

	const dismissToast = useCallback((id: string) => {
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	const pushToast = useCallback((message: string, options?: ToastOptions) => {
		const trimmedMessage = message.trim();
		if (!trimmedMessage) return;

		const tone = options?.tone ?? inferToastTone(trimmedMessage);
		const durationMs =
			options?.durationMs ??
			(tone === "error" ? ERROR_TOAST_DURATION_MS : DEFAULT_TOAST_DURATION_MS);

		setToasts((current) => {
			const nextToast: ToastItem = {
				id: createToastId(),
				message: trimmedMessage,
				tone,
				durationMs,
			};

			const deduped = current.filter(
				(toast) =>
					!(toast.message === nextToast.message && toast.tone === nextToast.tone),
			);

			return [...deduped.slice(-3), nextToast];
		});
	}, []);

	const contextValue = useMemo(
		() => ({
			pushToast,
			dismissToast,
		}),
		[dismissToast, pushToast],
	);

	return (
		<FeedbackContext.Provider value={contextValue}>
			{children}
			{typeof document === "undefined"
				? null
				: createPortal(
						<div className="app-toast-viewport" aria-live="polite">
							{toasts.map((toast) => (
								<ToastCard key={toast.id} toast={toast} onDismiss={dismissToast} />
							))}
						</div>,
						document.body,
				  )}
		</FeedbackContext.Provider>
	);
};

export const useFeedback = () => useContext(FeedbackContext);

export const useFeedbackState = (initialValue: string | null = null) => {
	const [value, setValueState] = useState<string | null>(initialValue);
	const valueRef = useRef<string | null>(initialValue);
	const feedback = useFeedback();

	const setValue = useCallback(
		(nextValue: SetStateAction<string | null>) => {
			const resolvedValue =
				typeof nextValue === "function"
					? (nextValue as (prevState: string | null) => string | null)(
							valueRef.current,
					  )
					: nextValue;

			valueRef.current = resolvedValue;
			setValueState(resolvedValue);

			if (resolvedValue) {
				feedback?.pushToast(resolvedValue);
			}
		},
		[feedback],
	);

	return [value, setValue] as const satisfies readonly [
		string | null,
		(value: SetStateAction<string | null>) => void,
	];
};
