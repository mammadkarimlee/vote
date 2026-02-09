import { useCallback, useEffect, useMemo, useState } from "react";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapNotificationRow } from "../../lib/supabaseMappers";
import type { NotificationDoc } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";

type NotificationEntry = { id: string; data: NotificationDoc };

export const useNotifications = () => {
	const { user } = useAuth();
	const [items, setItems] = useState<NotificationEntry[]>([]);
	const [loading, setLoading] = useState(false);

	const refresh = useCallback(async () => {
		if (!user) {
			setItems([]);
			return;
		}

		setLoading(true);
		const { data, error } = await supabase
			.from("notifications")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("user_id", user.id)
			.order("created_at", { ascending: false })
			.limit(30);

		if (!error) {
			setItems(
				(data ?? []).map((row) => ({
					id: row.id,
					data: mapNotificationRow(row),
				})),
			);
		}

		setLoading(false);
	}, [user]);

	useEffect(() => {
		void refresh();
	}, [refresh]);

	useEffect(() => {
		if (!user) return undefined;
		const timer = window.setInterval(() => {
			void refresh();
		}, 45_000);
		return () => window.clearInterval(timer);
	}, [refresh, user]);

	const unreadCount = useMemo(
		() => items.filter((item) => !item.data.isRead).length,
		[items],
	);

	const markAsRead = useCallback(async (notificationId: string) => {
		const { data, error } = await supabase.rpc("mark_notification_read", {
			p_notification_id: notificationId,
		});
		if (error) return false;

		if (data) {
			setItems((prev) =>
				prev.map((item) =>
					item.id === notificationId
						? {
								...item,
								data: {
									...item.data,
									isRead: true,
									readAt: new Date().toISOString(),
								},
							}
						: item,
				),
			);
		}

		return Boolean(data);
	}, []);

	const markAllAsRead = useCallback(async () => {
		if (!user) return 0;
		const ids = items.filter((item) => !item.data.isRead).map((item) => item.id);
		if (ids.length === 0) return 0;

		const readAt = new Date().toISOString();
		const { error } = await supabase
			.from("notifications")
			.update({ is_read: true, read_at: readAt })
			.eq("org_id", ORG_ID)
			.eq("user_id", user.id)
			.in("id", ids);

		if (error) return 0;

		setItems((prev) =>
			prev.map((item) =>
				ids.includes(item.id)
					? { ...item, data: { ...item.data, isRead: true, readAt } }
					: item,
			),
		);

		return ids.length;
	}, [items, user]);

	return {
		items,
		loading,
		unreadCount,
		refresh,
		markAsRead,
		markAllAsRead,
	};
};
