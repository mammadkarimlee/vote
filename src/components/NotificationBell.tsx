import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { formatShortDate, toJsDate } from "../lib/utils";
import { useNotifications } from "../features/notifications/useNotifications";

export const NotificationBell = () => {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement | null>(null);
	const { items, loading, unreadCount, refresh, markAsRead, markAllAsRead } =
		useNotifications();

	useEffect(() => {
		const onClickOutside = (event: MouseEvent) => {
			if (!rootRef.current) return;
			if (rootRef.current.contains(event.target as Node)) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", onClickOutside);
		return () => {
			document.removeEventListener("mousedown", onClickOutside);
		};
	}, []);

	useEffect(() => {
		if (!open) return;
		void refresh();
	}, [open, refresh]);

	const handleOpen = () => setOpen((prev) => !prev);

	const handleRowClick = async (id: string, actionPath?: string | null) => {
		await markAsRead(id);
		if (actionPath) {
			navigate(actionPath);
		}
		setOpen(false);
	};

	const handleMarkAll = async () => {
		await markAllAsRead();
	};

	return (
		<div className="notification" ref={rootRef}>
			<button
				type="button"
				className="notification-toggle"
				onClick={handleOpen}
				aria-label="Bildirişlər"
			>
				<svg viewBox="0 0 24 24" fill="none" aria-hidden>
					<path
						d="M15 17h5l-1.4-1.4a2 2 0 0 1-.6-1.4V10a6 6 0 1 0-12 0v4.2c0 .5-.2 1-.6 1.4L4 17h5"
						stroke="currentColor"
						strokeWidth="1.7"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
					<path
						d="M9 17a3 3 0 0 0 6 0"
						stroke="currentColor"
						strokeWidth="1.7"
						strokeLinecap="round"
					/>
				</svg>
				{unreadCount > 0 && (
					<span className="notification-badge">
						{unreadCount > 9 ? "9+" : unreadCount}
					</span>
				)}
			</button>

			{open && (
				<div className="notification-panel">
					<div className="notification-header">
						<div>
							<div className="notification-title">Bildirişlər</div>
							<div className="notification-subtitle">
								{unreadCount > 0
									? `${unreadCount} oxunmamış`
									: "Hamısı oxunub"}
							</div>
						</div>
						<button
							type="button"
							className="btn ghost"
							onClick={handleMarkAll}
							disabled={unreadCount === 0}
						>
							Hamısını oxu
						</button>
					</div>

					{loading && <div className="notification-empty">Yüklənir...</div>}
					{!loading && items.length === 0 && (
						<div className="notification-empty">Bildiriş yoxdur.</div>
					)}

					{!loading && items.length > 0 && (
						<div className="notification-list">
							{items.map((item) => (
								<button
									key={item.id}
									type="button"
									className={`notification-item${item.data.isRead ? "" : " unread"}`}
									onClick={() =>
										handleRowClick(item.id, item.data.actionPath ?? null)
									}
								>
									<div className="notification-item__head">
										<span>{item.data.title}</span>
										<span>{formatShortDate(toJsDate(item.data.createdAt))}</span>
									</div>
									<div className="notification-item__body">{item.data.message}</div>
								</button>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
};
