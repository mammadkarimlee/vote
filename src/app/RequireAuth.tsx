import { Navigate } from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";

export const RequireAuth = ({ children }: { children: React.ReactNode }) => {
	const { user, loading } = useAuth();
	if (loading) {
		return (
			<div className="page">
				<div className="card">Yüklənir...</div>
			</div>
		);
	}
	if (!user) {
		return <Navigate to="/login" replace />;
	}
	return <>{children}</>;
};
