import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ORG_ID, supabase } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

export const ProfilePage = () => {
	const navigate = useNavigate();
	const { user, userDoc, signOutUser } = useAuth();
	const [displayName, setDisplayName] = useState("");
	const [branchName, setBranchName] = useState<string>("");
	const [status, setStatus] = useState<string | null>(null);
	const [password, setPassword] = useState("");
	const [passwordConfirm, setPasswordConfirm] = useState("");
	const [passwordStatus, setPasswordStatus] = useState<string | null>(null);

	useEffect(() => {
		if (!user) return;
		if (!userDoc) return;
		if (userDoc.displayName) {
			setDisplayName(userDoc.displayName);
		}
	}, [user, userDoc]);

	useEffect(() => {
		const fetchBranch = async () => {
			if (!userDoc?.branchId) return;
			const { data, error } = await supabase
				.from("branches")
				.select("name")
				.eq("org_id", ORG_ID)
				.eq("id", userDoc.branchId)
				.is("deleted_at", null)
				.maybeSingle();
			if (error || !data) return;
			setBranchName(data.name ?? "");
		};
		void fetchBranch();
	}, [userDoc?.branchId]);

	const handleSave = async () => {
		if (!user || !userDoc) return;
		setStatus(null);
		const { error } = await supabase
			.from("users")
			.update({ display_name: displayName.trim() })
			.eq("org_id", ORG_ID)
			.eq("id", user.id);
		if (error) {
			setStatus("Yeniləmə zamanı xəta oldu");
			return;
		}
		setStatus("Profil yeniləndi");
	};

	const handlePasswordChange = async () => {
		if (!password.trim()) {
			setPasswordStatus("Yeni şifrə daxil edin");
			return;
		}
		if (password !== passwordConfirm) {
			setPasswordStatus("Şifrələr uyğun deyil");
			return;
		}
		const { error } = await supabase.auth.updateUser({ password });
		if (error) {
			setPasswordStatus("Şifrə yenilənmədi");
			return;
		}
		setPassword("");
		setPasswordConfirm("");
		setPasswordStatus("Şifrə yeniləndi");
	};

	if (!user || !userDoc) {
		return (
			<div className="page">
				<div className="card">
					<h2>Profil tapılmadı</h2>
					<button
						className="btn"
						type="button"
						onClick={() => navigate("/login")}
					>
						Girişə qayıt
					</button>
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="card">
				<h1>Mənim profilim</h1>
				<div className="grid two">
					<div>
						<div className="label">Rol</div>
						<div className="value">{userDoc.role}</div>
					</div>
					<div>
						<div className="label">Filial</div>
						<div className="value">
							{userDoc.branchId ? branchName || "Filial tapılmadı" : "-"}
						</div>
					</div>
					<div>
						<div className="label">Login</div>
						<div className="value">{userDoc.login ?? "-"}</div>
					</div>
					<div>
						<div className="label">Email</div>
						<div className="value">{userDoc.email ?? "-"}</div>
					</div>
				</div>
				<label className="field">
					<span>Ad və Soyad</span>
					<input
						className="input"
						value={displayName}
						onChange={(event) => setDisplayName(event.target.value)}
					/>
				</label>
				<div className="actions">
					<button className="btn primary" onClick={handleSave} type="button">
						Yadda saxla
					</button>
					<button
						className="btn ghost"
						onClick={() => signOutUser()}
						type="button"
					>
						Çıxış
					</button>
				</div>
				{status && <div className="notice">{status}</div>}
				<div className="divider" />
				<div className="stack">
					<h3>Şifrəni dəyiş</h3>
					<label className="field">
						<span>Yeni şifrə</span>
						<input
							className="input"
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
						/>
					</label>
					<label className="field">
						<span>Yeni şifrənin təkrarı</span>
						<input
							className="input"
							type="password"
							value={passwordConfirm}
							onChange={(event) => setPasswordConfirm(event.target.value)}
						/>
					</label>
					<div className="actions">
						<button
							className="btn"
							type="button"
							onClick={handlePasswordChange}
						>
							Şifrəni yenilə
						</button>
					</div>
					{passwordStatus && <div className="notice">{passwordStatus}</div>}
				</div>
			</div>
		</div>
	);
};
