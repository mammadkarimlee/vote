import { useCallback, useEffect, useState } from "react";

type ConfirmOptions = {
	title?: string;
	message: string;
	confirmText?: string;
	cancelText?: string;
	tone?: "default" | "danger";
};

type ConfirmState = ConfirmOptions & {
	resolve: (value: boolean) => void;
};

export const useConfirmDialog = () => {
	const [state, setState] = useState<ConfirmState | null>(null);

	const confirm = useCallback((options: ConfirmOptions) => {
		return new Promise<boolean>((resolve) => {
			setState({ ...options, resolve });
		});
	}, []);

	const close = useCallback(
		(value: boolean) => {
			if (!state) return;
			state.resolve(value);
			setState(null);
		},
		[state],
	);

	useEffect(() => {
		if (!state) return;
		const previous = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = previous;
		};
	}, [state]);

	const dialog = state ? (
		<div className="modal-overlay" role="dialog" aria-modal="true">
			<div className="modal-card">
				<div className="modal-title">{state.title ?? "Təsdiq"}</div>
				<p className="modal-message">{state.message}</p>
				<div className="actions">
					<button
						className="btn ghost"
						type="button"
						onClick={() => close(false)}
					>
						{state.cancelText ?? "İmtina"}
					</button>
					<button
						className={state.tone === "danger" ? "btn danger" : "btn primary"}
						type="button"
						onClick={() => close(true)}
					>
						{state.confirmText ?? "Bəli"}
					</button>
				</div>
			</div>
		</div>
	) : null;

	return { confirm, dialog };
};
