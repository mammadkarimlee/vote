import { useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { toLoginEmail } from "../../lib/authUtils";
import { supabase } from "../../lib/supabase";
import { useAuth } from "./AuthProvider";

type IconName =
	| "alert"
	| "arrow"
	| "chart"
	| "check"
	| "eye"
	| "eyeOff"
	| "file"
	| "lock"
	| "shield"
	| "user";

type LoginStatus = {
	tone: "error" | "success";
	title: string;
	description: string;
};

const Icon = ({ name, className = "" }: { name: IconName; className?: string }) => {
	const iconProps = {
		className,
		fill: "none",
		stroke: "currentColor",
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		strokeWidth: 1.8,
		viewBox: "0 0 24 24",
		"aria-hidden": true,
	};

	switch (name) {
		case "alert":
			return (
				<svg {...iconProps}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 8v4" />
					<path d="M12 16h.01" />
				</svg>
			);
		case "arrow":
			return (
				<svg {...iconProps}>
					<path d="M5 12h13" />
					<path d="m14 7 5 5-5 5" />
				</svg>
			);
		case "chart":
			return (
				<svg {...iconProps}>
					<path d="M4 19V5" />
					<path d="M4 19h16" />
					<path d="m7 15 4-5 3 3 5-7" />
				</svg>
			);
		case "check":
			return (
				<svg {...iconProps}>
					<path d="m5 12 4 4L19 6" />
				</svg>
			);
		case "eye":
			return (
				<svg {...iconProps}>
					<path d="M2.5 12s3.5-5 9.5-5 9.5 5 9.5 5-3.5 5-9.5 5-9.5-5-9.5-5Z" />
					<circle cx="12" cy="12" r="2" />
				</svg>
			);
		case "eyeOff":
			return (
				<svg {...iconProps}>
					<path d="m4 4 16 16" />
					<path d="M10.6 7.1A11.4 11.4 0 0 1 12 7c6 0 9.5 5 9.5 5a16.7 16.7 0 0 1-3.1 3.2" />
					<path d="M6.1 8.1A16.5 16.5 0 0 0 2.5 12s3.5 5 9.5 5c.8 0 1.6-.1 2.3-.3" />
				</svg>
			);
		case "file":
			return (
				<svg {...iconProps}>
					<path d="M6 3h8l4 4v14H6z" />
					<path d="M14 3v5h5" />
					<path d="M9 13h6" />
					<path d="M9 17h4" />
				</svg>
			);
		case "lock":
			return (
				<svg {...iconProps}>
					<rect width="15" height="11" x="4.5" y="10" rx="2" />
					<path d="M8 10V7a4 4 0 0 1 8 0v3" />
				</svg>
			);
		case "shield":
			return (
				<svg {...iconProps}>
					<path d="M12 3 19 6v5c0 4.5-2.8 8-7 10-4.2-2-7-5.5-7-10V6z" />
					<path d="m9.5 12 1.7 1.7 3.6-3.9" />
				</svg>
			);
		case "user":
			return (
				<svg {...iconProps}>
					<circle cx="12" cy="8" r="3.5" />
					<path d="M5 20a7 7 0 0 1 14 0" />
				</svg>
			);
	}
};

const BrandLogo = ({ compact = false }: { compact?: boolean }) => (
	<img
		className={compact ? "auth-brand-logo compact" : "auth-brand-logo"}
		src="/hedef-steam-liseyi-logo.png"
		alt="Hədəf STEAM Liseyi"
	/>
);

const AuthStateScreen = ({
	title,
	description,
	action,
}: {
	title: string;
	description: string;
	action?: ReactNode;
}) => (
	<div className="auth-shell auth-shell--centered">
		<div className="auth-background-grid" aria-hidden="true" />
		<div className="auth-state-card">
			<BrandLogo compact />
			<span className="auth-kicker">Hədəf STEAM Liseyi</span>
			<h1>{title}</h1>
			<p>{description}</p>
			{action ?? <span className="auth-loader" aria-label="Yüklənir" />}
		</div>
	</div>
);

const benefits: Array<{ icon: IconName; text: string }> = [
	{ icon: "chart", text: "Müəllim performansının sistemli izlənməsi" },
	{ icon: "check", text: "Rəhbərlik və portfolio qiymətləndirmələrinin idarəsi" },
	{ icon: "file", text: "PDF və Excel hesabatlarının hazırlanması" },
];

const quickLinks = [
	{ label: "Hədəf Şirkətlər Qrupu", href: "https://hedefgroup.az/" },
	{ label: "Hədəf Kursları", href: "https://hedef.edu.az/" },
	{ label: "Hədəf STEAM Liseyi", href: "https://hedefliseyi.edu.az/" },
	{ label: "Hədəf Nəşrləri", href: "https://hedefnesrleri.az/" },
	{ label: "XAN Nəşriyyatı", href: "https://xannesriyyati.az/" },
	{ label: "Bala Bilgə", href: "https://bilge.az/" },
	{ label: "Senet.az", href: "https://senet.az/" },
];

const QuickLinks = ({ compact = false }: { compact?: boolean }) => (
	<div className={compact ? "auth-quick-links compact" : "auth-quick-links"}>
		<div className="auth-quick-links__title">Sürətli keçidlər</div>
		<nav className="auth-quick-links__list" aria-label="Hədəf Şirkətlər Qrupu sürətli keçidləri">
			{quickLinks.map((link) => (
				<a key={link.href} href={link.href} target="_blank" rel="noreferrer">
					{link.label}
					<span aria-hidden="true">↗</span>
				</a>
			))}
		</nav>
	</div>
);

export const LoginPage = () => {
	const navigate = useNavigate();
	const { user, userDoc, loading, signOutUser } = useAuth();
	const [login, setLogin] = useState("");
	const [password, setPassword] = useState("");
	const [showPassword, setShowPassword] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [status, setStatus] = useState<LoginStatus | null>(null);

	useEffect(() => {
		if (!user) return;
		if (userDoc) {
			navigate("/", { replace: true });
		}
	}, [user, userDoc, navigate]);

	const clearStatus = () => {
		if (status) setStatus(null);
	};

	const handleLogin = async () => {
		if (isSubmitting) return;

		setStatus(null);
		if (!login.trim() || !password.trim()) {
			setStatus({
				tone: "error",
				title: "Məlumatları tamamlayın",
				description: "Davam etmək üçün login və şifrənizi daxil edin.",
			});
			return;
		}

		setIsSubmitting(true);
		try {
			const { error } = await supabase.auth.signInWithPassword({
				email: toLoginEmail(login),
				password,
			});

			if (error) {
				setStatus({
					tone: "error",
					title: "Giriş mümkün olmadı",
					description: "Login və ya şifrə yanlışdır. Məlumatları yoxlayıb yenidən cəhd edin.",
				});
				return;
			}

			setStatus({
				tone: "success",
				title: "Giriş uğurludur",
				description: "Hesabınız yoxlanılır, paneliniz hazırlanır...",
			});
		} catch {
			setStatus({
				tone: "error",
				title: "Giriş mümkün olmadı",
				description: "Hazırda sorğunu tamamlamaq mümkün deyil. Bir qədər sonra yenidən cəhd edin.",
			});
		} finally {
			setIsSubmitting(false);
		}
	};

	if (loading) {
		return (
			<AuthStateScreen
				title={user ? "Paneliniz hazırlanır..." : "Sistem yüklənir..."}
				description={
					user
						? "Hesabınız yoxlanılır. Bir neçə saniyə gözləyin."
						: "Giriş səhifəsi hazırlanır. Bir neçə saniyə gözləyin."
				}
			/>
		);
	}

	if (user && !userDoc) {
		return (
			<AuthStateScreen
				title="Profil tapılmadı"
				description="Bu istifadəçi üçün sistemdə profil yaradılmayıb. Zəhmət olmasa, administratora müraciət edin."
				action={
					<button className="auth-secondary-button" type="button" onClick={() => signOutUser()}>
						Çıxış
					</button>
				}
			/>
		);
	}

	return (
		<div className="auth-shell">
			<div className="auth-background-grid" aria-hidden="true" />
			<main className="auth-layout">
				<section className="auth-brand-panel" aria-label="Platforma haqqında">
					<div>
						<div className="auth-brand-heading">
							<BrandLogo />
							<div className="auth-brand-caption">Daxili idarəetmə platforması</div>
						</div>

						<div className="auth-brand-copy">
							<span className="auth-platform-pill">
								<span />
								Daxili platforma
							</span>
							<h1>PKPD İdarəetmə Sistemi</h1>
							<p>
								Pedaqoji kadrların performans dəyərləndirilməsi, rəhbərlik
								qiymətləndirməsi və hesabatların idarə olunması üçün daxili platforma.
							</p>
						</div>

						<ul className="auth-benefit-list">
							{benefits.map((benefit) => (
								<li key={benefit.text}>
									<span className="auth-benefit-icon">
										<Icon name={benefit.icon} />
									</span>
									<span>{benefit.text}</span>
								</li>
							))}
						</ul>
					</div>

					<div className="auth-brand-visual" aria-hidden="true">
						<div className="auth-visual-head">
							<span>2025 / 2026 tədris ili</span>
							<span className="auth-visual-status">Aktiv</span>
						</div>
						<div className="auth-visual-title">Vahid idarəetmə paneli</div>
						<div className="auth-visual-bars">
							<span />
							<span />
							<span />
							<span />
							<span />
							<span />
							<span />
						</div>
						<div className="auth-visual-footer">
							<span>Performans</span>
							<span>Qiymətləndirmə</span>
							<span>Hesabat</span>
						</div>
					</div>

					<div className="auth-brand-footer">
						<QuickLinks />
						<p>© 2026 Hədəf STEAM Liseyi MMC</p>
					</div>
				</section>

				<section className="auth-form-panel" aria-label="Sistemə giriş">
					<div className="auth-login-card">
						<div className="auth-mobile-brand">
							<BrandLogo compact />
							<div className="auth-mobile-brand__caption">PKPD İdarəetmə Sistemi</div>
						</div>

						<div className="auth-card-heading">
							<span className="auth-kicker">Daxili platforma</span>
							<h1>Sistemə giriş</h1>
							<p>Davam etmək üçün hesab məlumatlarınızı daxil edin.</p>
						</div>

						<form
							className="auth-form"
							onKeyDown={(event) => {
								if (event.key !== "Enter") return;
								event.preventDefault();
								event.currentTarget.requestSubmit();
							}}
							onSubmit={(event) => {
								event.preventDefault();
								void handleLogin();
							}}
						>
							<label className="auth-field" htmlFor="login">
								<span className="auth-field__label">Login və ya email</span>
								<span className="auth-input-wrap">
									<Icon name="user" className="auth-input-icon" />
									<input
										id="login"
										name="email"
										type="text"
										autoComplete="email"
										placeholder="email@hedef.edu.az"
										value={login}
										onChange={(event) => {
											setLogin(event.target.value);
											clearStatus();
										}}
										disabled={isSubmitting}
										spellCheck={false}
									/>
								</span>
							</label>

							<label className="auth-field" htmlFor="password">
								<span className="auth-field__label">Şifrə</span>
								<span className="auth-input-wrap">
									<Icon name="lock" className="auth-input-icon" />
									<input
										id="password"
										name="password"
										type={showPassword ? "text" : "password"}
										autoComplete="current-password"
										placeholder="Şifrənizi daxil edin"
										value={password}
										onChange={(event) => {
											setPassword(event.target.value);
											clearStatus();
										}}
										disabled={isSubmitting}
									/>
									<button
										className="auth-password-toggle"
										type="button"
										onClick={() => setShowPassword((current) => !current)}
										aria-label={showPassword ? "Şifrəni gizlət" : "Şifrəni göstər"}
										aria-pressed={showPassword}
									>
										<Icon name={showPassword ? "eyeOff" : "eye"} />
									</button>
								</span>
							</label>

							{status && (
								<div className={`auth-alert ${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
									<Icon name={status.tone === "error" ? "alert" : "shield"} />
									<div>
										<strong>{status.title}</strong>
										<span>{status.description}</span>
									</div>
								</div>
							)}

							<button className="auth-submit-button" type="submit" disabled={isSubmitting}>
								{isSubmitting ? (
									<>
										<span className="auth-button-spinner" aria-hidden="true" />
										Daxil olunur...
									</>
								) : (
									<>
										Daxil ol
										<Icon name="arrow" />
									</>
								)}
							</button>
						</form>

						<div className="auth-security-note">
							<Icon name="shield" />
							<span>Giriş məlumatlarınız qorunan bağlantı üzərindən yoxlanılır.</span>
						</div>
					</div>

					<div className="auth-mobile-footer">
						<QuickLinks compact />
						<p>© 2026 Hədəf STEAM Liseyi MMC</p>
					</div>
				</section>
			</main>
		</div>
	);
};
