import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapUserRow } from "../../lib/supabaseMappers";
import type { UserDoc } from "../../lib/types";

type AuthState = {
	user: User | null;
	userDoc: UserDoc | null;
	loading: boolean;
	signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthState | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
	const [user, setUser] = useState<User | null>(null);
	const [userDoc, setUserDoc] = useState<UserDoc | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		let active = true;

		const loadSession = async () => {
			const { data } = await supabase.auth.getSession();
			if (!active) return;
			const nextUser = data.session?.user ?? null;
			setUser(nextUser);
			if (!nextUser) {
				setLoading(false);
			}
		};

		void loadSession();

		const { data } = supabase.auth.onAuthStateChange((_event, session) => {
			const nextUser = session?.user ?? null;
			setUser(nextUser);
			setUserDoc(null);
			if (!nextUser) {
				setLoading(false);
			}
		});

		return () => {
			active = false;
			data.subscription.unsubscribe();
		};
	}, []);

	useEffect(() => {
		if (!user) return undefined;
		let active = true;

		const loadUserDoc = async () => {
			setLoading(true);
			const { data, error } = await supabase
				.from("users")
				.select("*")
				.eq("org_id", ORG_ID)
				.eq("id", user.id)
				.maybeSingle();

			if (!active) return;
			if (error || !data) {
				setUserDoc(null);
				setLoading(false);
				return;
			}

			setUserDoc(mapUserRow(data));
			setLoading(false);
		};

		void loadUserDoc();

		return () => {
			active = false;
		};
	}, [user]);

	const value = useMemo<AuthState>(
		() => ({
			user,
			userDoc,
			loading,
			signOutUser: async () => {
				await supabase.auth.signOut();
			},
		}),
		[user, userDoc, loading],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within AuthProvider");
	}
	return context;
};
