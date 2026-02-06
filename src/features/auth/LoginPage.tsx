import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toLoginEmail } from "../../lib/authUtils";
import { supabase } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

export const LoginPage = () => {
	const navigate = useNavigate();
	const { user, userDoc, loading, signOutUser } = useAuth();
	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState<string | null>(null);

	useEffect(() => {
		if (!user) return;
		if (userDoc) {
			navigate("/", { replace: true });
		}
	}, [user, userDoc, navigate]);

	const handleLogin = async () => {
		setStatus(null);
		if (!login.trim() || !password.trim()) {
			setStatus("Login və şifrə daxil edin");
			return;
		}

		const { error } = await supabase.auth.signInWithPassword({
			email: toLoginEmail(login),
			password,
		});

		if (error) {
			setStatus("Login və ya şifrə yanlışdır");
			return;
		}

		setStatus("Giriş uğurludur");
	};

	if (loading) {
		return (
			<div className="page">
				<div className="card">Yüklənir...</div>
			</div>
		);
	}

	if (user && !userDoc) {
		return (
			<div className="page auth-page">
				<div className="card auth-card">
					<h1>Profil tapılmadı</h1>
					<p>
						Bu istifadəçi üçün sistemdə profil yaradılmayıb. Adminə müraciət
						edin.
					</p>
					<button className="btn" type="button" onClick={() => signOutUser()}>
						Çıxış
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="page auth-page">
			<div className="card auth-card">
				<div className="auth-header">
					<span className="badge">Müəllim Qiymətləndirmə Sorğusu</span>
					<h1>Sistemə giriş</h1>
					<p>
						Login və şifrə ilə daxil olun. Adminlər email istifadə edir, səs
						verənlər isə sistemin verdiyi login ilə daxil olur.
					</p>
				</div>

				<div className="stack">
					<label className="field">
						<span>Login və ya email</span>
						<input
							className="input"
							placeholder="nümunə: emilra"
							value={login}
							onChange={(event) => setLogin(event.target.value)}
						/>
					</label>
					<label className="field">
						<span>Şifrə</span>
						<input
							className="input"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</label>
					<button className="btn primary" onClick={handleLogin} type="button">
						Daxil ol
					</button>
				</div>

				{status && <div className="notice">{status}</div>}
			</div>
		</div>
	);
};
