import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

const getLastPath = (role: string) => {
	const stored = localStorage.getItem(`last_path_${role}`);
	if (!stored) return null;
	if (role === "superadmin") {
		return stored.startsWith("/admin") ||
			stored.startsWith("/branch") ||
			stored.startsWith("/pkpd") ||
			stored.startsWith("/me")
			? stored
			: null;
	}
	if (role === "branch_admin" || role === "moderator") {
		return stored.startsWith("/branch") ||
			stored.startsWith("/pkpd") ||
			stored.startsWith("/me")
			? stored
			: null;
	}
	if (role === "student" || role === "teacher" || role === "manager") {
		return stored.startsWith("/vote") || stored.startsWith("/me")
			? stored
			: null;
	}
	return null;
};

export const HomeRedirect = () => {
	const { userDoc } = useAuth();
	if (!userDoc) {
		return <Navigate to="/login" replace />;
	}
	const lastPath = getLastPath(userDoc.role);
	if (lastPath) {
		return <Navigate to={lastPath} replace />;
	}
	if (userDoc.role === "superadmin") {
		return <Navigate to="/admin/dashboard/overview" replace />;
	}
	if (userDoc.role === "branch_admin") {
		return <Navigate to="/branch" replace />;
	}
	if (userDoc.role === "moderator") {
		return <Navigate to="/branch" replace />;
	}
	return <Navigate to="/vote" replace />;
};
