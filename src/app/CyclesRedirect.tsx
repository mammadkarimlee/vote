import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export const CyclesRedirect = () => {
	const { userDoc, loading } = useAuth();

	if (loading) {
		return (
			<div className="page">
				<div className="card">Yüklənir...</div>
			</div>
		);
	}

	if (!userDoc) {
		return <Navigate to="/login" replace />;
	}

	if (userDoc.role === "superadmin") {
		return <Navigate to="/admin/cycles" replace />;
	}

	if (userDoc.role === "branch_admin" || userDoc.role === "moderator") {
		return <Navigate to="/branch/cycles" replace />;
	}

	return <Navigate to="/vote" replace />;
};
