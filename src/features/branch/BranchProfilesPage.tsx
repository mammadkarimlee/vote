import { useEffect, useMemo, useState } from "react";
import { useConfirmDialog } from "../../components/ConfirmDialog";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapUserRow } from "../../lib/supabaseMappers";
import type { Role, UserDoc } from "../../lib/types";
import { useAuth } from "../auth/AuthProvider";
import { BranchSelector } from "./BranchSelector";
import { useBranchScope } from "./useBranchScope";
import { provisionEmailUser, provisionLoginUser } from "./userProvisioning";

const roles: Role[] = ["manager", "moderator"];

export const BranchProfilesPage = () => {
	const { user } = useAuth();
	const { confirm, dialog } = useConfirmDialog();
	const { branchId, setBranchId, branches, isSuperAdmin } = useBranchScope();
	const [users, setUsers] = useState<Array<{ id: string; data: UserDoc }>>([]);
	const [name, setName] = useState("");
	const [role, setRole] = useState<Role>("manager");
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [status, setStatus] = useState<string | null>(null);

	const loadUsers = async () => {
		if (!branchId) {
			setUsers([]);
			return;
		}
		const { data, error } = await supabase
			.from("users")
			.select("*")
			.eq("org_id", ORG_ID)
			.eq("branch_id", branchId)
			.in("role", roles)
			.is("deleted_at", null);
		if (error) return;
		const items = (data ?? []).map((row) => ({
			id: row.id,
			data: mapUserRow(row),
		}));
		setUsers(items);
	};

	useEffect(() => {
		void loadUsers();
	}, [branchId]);

	const handleCreate = async () => {
		if (!name.trim() || !branchId) {
			setStatus("Ad tələb olunur");
			return;
		}

		try {
			if (role === "moderator") {
				if (!email.trim() || !password.trim()) {
					setStatus("Email və şifrə tələb olunur");
					return;
				}
				await provisionEmailUser({
					name: name.trim(),
					email: email.trim(),
					password,
					role: "moderator",
					branchId,
				});
				setStatus("Moderator yaradıldı");
			} else {
				const result = await provisionLoginUser({
					name: name.trim(),
					branchId,
					role: "manager",
				});
				setStatus(`Login: ${result.login} • Şifrə: ${result.password}`);
			}

			setName("");
			setEmail("");
			setPassword("");
			await loadUsers();
		} catch (error) {
			setStatus(
				error instanceof Error ? error.message : "Yaratma zamanı xəta oldu",
			);
		}
	};

	const handleDelete = async (userId: string) => {
		const ok = await confirm({
			title: "İstifadəçini sil",
			message: "İstifadəçini silmək istədiyinizə əminsiniz?",
			confirmText: "Sil",
			cancelText: "İmtina",
			tone: "danger",
		});
		if (!ok) return;
		await supabase
			.from("users")
			.update({
				deleted_at: new Date().toISOString(),
				deleted_by: user?.id ?? null,
			})
			.eq("org_id", ORG_ID)
			.eq("id", userId);
		await loadUsers();
	};

	const summary = useMemo(() => users.length, [users]);

	return (
		<div className="panel">
			{isSuperAdmin && (
				<BranchSelector
					branchId={branchId}
					branches={branches}
					onChange={setBranchId}
				/>
			)}

			<div className="panel-header">
				<div>
					<h2>İstifadəçilər</h2>
					<p>Rəhbərlik (login) və moderator (email) profilləri.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="card">
				<h3>Yeni istifadəçi</h3>
				<div className="form-grid">
					<input
						className="input"
						placeholder="Ad Soyad"
						value={name}
						onChange={(event) => setName(event.target.value)}
					/>
					<select
						className="input"
						value={role}
						onChange={(event) => setRole(event.target.value as Role)}
					>
						{roles.map((item) => (
							<option key={item} value={item}>
								{item}
							</option>
						))}
					</select>
					{role === "moderator" && (
						<>
							<input
								className="input"
								placeholder="Email"
								value={email}
								onChange={(event) => setEmail(event.target.value)}
							/>
							<input
								className="input"
								placeholder="Şifrə"
								type="password"
								value={password}
								onChange={(event) => setPassword(event.target.value)}
							/>
						</>
					)}
					<button
						className="btn primary"
						type="button"
						onClick={handleCreate}
						disabled={!branchId}
					>
						Yarat
					</button>
				</div>
				{role === "manager" && (
					<div className="hint">Rəhbərlik üçün şifrə login ilə eynidir.</div>
				)}
				{status && <div className="notice">{status}</div>}
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>Ad</div>
					<div>Rol</div>
					<div>Login/Email</div>
					<div></div>
				</div>
				{users.map((userRow) => (
					<div className="data-row" key={userRow.id}>
						<div>{userRow.data.displayName ?? "-"}</div>
						<div>{userRow.data.role}</div>
						<div>{userRow.data.login ?? userRow.data.email ?? "-"}</div>
						<div>
							<button
								className="btn ghost"
								type="button"
								onClick={() => void handleDelete(userRow.id)}
							>
								Sil
							</button>
						</div>
					</div>
				))}
			</div>
			{dialog}
		</div>
	);
};
