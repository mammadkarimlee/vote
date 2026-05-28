import { useEffect, useMemo, useRef, useState } from "react";
import {
	Link,
	NavLink,
	Outlet,
	useLocation,
	useNavigate,
} from "react-router-dom";
import { useAuth } from "../features/auth/AuthProvider";
import { cn } from "../lib/utils";
import { NotificationBell } from "./NotificationBell";
import { ThemeToggle } from "./theme/ThemeToggle";

type IconName =
	| "home"
	| "dashboard"
	| "pkpd"
	| "reports"
	| "campus"
	| "department"
	| "teacher"
	| "leadership"
	| "survey"
	| "user"
	| "audit"
	| "profile"
	| "vote"
	| "doc"
	| "calculator";

type SidebarItemConfig = {
	to: string;
	label: string;
	icon: IconName;
};

type SidebarGroupConfig = {
	id: string;
	title: string;
	items: SidebarItemConfig[];
};

const roleLabels: Record<string, string> = {
	superadmin: "Superadmin",
	branch_admin: "Filial admini",
	moderator: "Moderator",
	hr: "HR",
	manager: "Rəhbərlik",
	teacher: "Müəllim",
	student: "Şagird",
};

const routeLabels: Array<[RegExp, string]> = [
	[/^\/admin\/dashboard/, "Dashboard"],
	[/^\/admin\/branches/, "Campuslar"],
	[/^\/admin\/leadership/, "Rəhbərlik"],
	[/^\/admin\/users/, "İstifadəçilər"],
	[/^\/admin\/cycles\/[^/]+/, "PKPD qiymətləndirmələri"],
	[/^\/admin\/cycles/, "Sorğu dövrləri"],
	[/^\/admin\/questions/, "Sorğular"],
	[/^\/hr\/cycles\/[^/]+/, "PKPD qiymətləndirmələri"],
	[/^\/hr\/cycles/, "HR dövrləri"],
	[/^\/branch\/pkpd/, "PKPD idarəetməsi"],
	[/^\/branch\/teachers/, "Müəllimlər"],
	[/^\/branch\/departments/, "Kafedralar"],
	[/^\/branch\/leadership/, "Rəhbərlik"],
	[/^\/branch\/management/, "Kafedra müəllimləri"],
	[/^\/branch\/results/, "Hesabatlar"],
	[/^\/branch\/cycles/, "Sorğu dövrləri"],
	[/^\/branch\/profiles/, "İstifadəçi profilləri"],
	[/^\/branch\/audit/, "Audit"],
	[/^\/branch/, "Filial paneli"],
	[/^\/leadership/, "Rəhbərlik qiymətləndirməsi"],
	[/^\/vote/, "Səsvermə"],
	[/^\/pkpd\/doc/, "PKPD sənədi"],
	[/^\/pkpd\/calculator/, "PKPD kalkulyatoru"],
	[/^\/me/, "Profil"],
];

const Icon = ({ name }: { name: IconName }) => {
	const props = {
		className: "sidebar-icon",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
	};

	switch (name) {
		case "home":
			return (
				<svg {...props}>
					<path d="M3 11l9-8 9 8" />
					<path d="M5 10v10h14V10" />
					<path d="M9 20v-6h6v6" />
				</svg>
			);
		case "dashboard":
			return (
				<svg {...props}>
					<path d="M4 13h6V4H4z" />
					<path d="M14 20h6v-9h-6z" />
					<path d="M14 4h6v4h-6z" />
					<path d="M4 17h6v3H4z" />
				</svg>
			);
		case "pkpd":
			return (
				<svg {...props}>
					<path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" />
					<path d="M8.5 12.5l2.2 2.2 4.8-5" />
				</svg>
			);
		case "reports":
			return (
				<svg {...props}>
					<path d="M4 19h16" />
					<path d="M7 16V9" />
					<path d="M12 16V5" />
					<path d="M17 16v-7" />
				</svg>
			);
		case "campus":
			return (
				<svg {...props}>
					<path d="M3 21h18" />
					<path d="M5 21V7l7-4 7 4v14" />
					<path d="M9 21v-6h6v6" />
				</svg>
			);
		case "department":
			return (
				<svg {...props}>
					<path d="M4 4h16v16H4z" />
					<path d="M4 10h16" />
					<path d="M10 20V10" />
				</svg>
			);
		case "teacher":
			return (
				<svg {...props}>
					<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
					<path d="M4 21a8 8 0 0 1 16 0" />
				</svg>
			);
		case "leadership":
			return (
				<svg {...props}>
					<path d="M12 3l7 4v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V7z" />
					<path d="M9 12h6" />
				</svg>
			);
		case "survey":
			return (
				<svg {...props}>
					<path d="M6 3h12v18H6z" />
					<path d="M9 8h6" />
					<path d="M9 12h6" />
					<path d="M9 16h3" />
				</svg>
			);
		case "user":
		case "profile":
			return (
				<svg {...props}>
					<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />
					<path d="M5 20a7 7 0 0 1 14 0" />
				</svg>
			);
		case "audit":
			return (
				<svg {...props}>
					<path d="M5 4h14v16H5z" />
					<path d="M8 8h8" />
					<path d="M8 12h8" />
					<path d="M8 16h5" />
				</svg>
			);
		case "vote":
			return (
				<svg {...props}>
					<path d="M4 11h16v9H4z" />
					<path d="M8 11l4-7 4 7" />
					<path d="M9 16h6" />
				</svg>
			);
		case "doc":
			return (
				<svg {...props}>
					<path d="M6 3h9l4 4v14H6z" />
					<path d="M14 3v5h5" />
					<path d="M9 13h6" />
					<path d="M9 17h6" />
				</svg>
			);
		case "calculator":
			return (
				<svg {...props}>
					<rect x="6" y="3" width="12" height="18" rx="2" />
					<path d="M9 7h6" />
					<path d="M9 11h2" />
					<path d="M13 11h2" />
					<path d="M9 15h2" />
					<path d="M13 15h2" />
				</svg>
			);
		default:
			return (
				<svg {...props}>
					<circle cx="12" cy="12" r="9" />
				</svg>
			);
	}
};

const getSidebarGroups = (role?: string | null): SidebarGroupConfig[] => {
	const base: SidebarGroupConfig[] = [
		{
			id: "personal",
			title: "Əsas",
			items: [{ to: "/me", label: "Mənim profilim", icon: "profile" }],
		},
	];

	if (role && ["student", "teacher", "manager"].includes(role)) {
		base[0].items.push({ to: "/vote", label: "Səs ver", icon: "vote" });
	}
	if (role && ["teacher", "manager"].includes(role)) {
		base.push({
			id: "evaluation",
			title: "Qiymətləndirmə",
			items: [
				{
					to: "/leadership",
					label: "Rəhbərlik qiymətləndirməsi",
					icon: "leadership",
				},
			],
		});
	}

	if (role && ["branch_admin", "moderator", "superadmin"].includes(role)) {
		base.push(
			{
				id: "branch-main",
				title: "Filial",
				items: [
					{ to: "/branch/cycles", label: "Sorğu dövrləri", icon: "survey" },
					{ to: "/branch/pkpd", label: "PKPD qiymətləndirmələri", icon: "pkpd" },
					{ to: "/branch/results/teachers", label: "PKPD hesabatları", icon: "reports" },
				],
			},
			{
				id: "branch-management",
				title: "İdarəetmə",
				items: [
					{ to: "/branch/teachers", label: "Müəllimlər", icon: "teacher" },
					{ to: "/branch/departments", label: "Kafedralar", icon: "department" },
					{ to: "/branch/management", label: "Kafedra müəllimləri", icon: "leadership" },
					...(role === "branch_admin" || role === "superadmin"
						? [{ to: "/branch/leadership", label: "Rəhbərlik", icon: "leadership" as const }]
						: []),
					{ to: "/branch/profiles", label: "İstifadəçi profilləri", icon: "user" },
				],
			},
			{
				id: "pkpd-reference",
				title: "PKPD",
				items: [
					{ to: "/pkpd/doc", label: "PKPD sənədi", icon: "doc" },
					{ to: "/pkpd/calculator", label: "PKPD kalkulyatoru", icon: "calculator" },
				],
			},
		);
	}

	if (role === "hr") {
		base.push({
			id: "hr",
			title: "HR",
			items: [
				{ to: "/hr/cycles", label: "PKPD qiymətləndirmələri", icon: "pkpd" },
			],
		});
	}

	if (role === "superadmin") {
		base.push(
			{
				id: "admin",
				title: "Mərkəzi idarəetmə",
				items: [
					{ to: "/admin/dashboard/overview", label: "Dashboard", icon: "dashboard" },
					{ to: "/admin/cycles", label: "PKPD qiymətləndirmələri", icon: "pkpd" },
					{ to: "/admin/branches", label: "Campuslar", icon: "campus" },
					{ to: "/admin/leadership", label: "Campus rəhbərliyi", icon: "leadership" },
					{ to: "/admin/users", label: "İstifadəçilər", icon: "user" },
				],
			},
			{
				id: "system",
				title: "Sistem",
				items: [
					{ to: "/admin/questions", label: "Sorğular", icon: "survey" },
					{ to: "/branch/audit", label: "Audit / Export tarixçəsi", icon: "audit" },
				],
			},
		);
	}

	return base;
};

const getCurrentPageTitle = (pathname: string) =>
	routeLabels.find(([pattern]) => pattern.test(pathname))?.[1] ?? "İdarə paneli";

const Breadcrumbs = () => {
	const location = useLocation();
	const title = getCurrentPageTitle(location.pathname);
	const root =
		location.pathname.startsWith("/admin")
			? "Mərkəzi idarəetmə"
			: location.pathname.startsWith("/hr")
				? "HR"
				: location.pathname.startsWith("/branch")
					? "Filial"
					: "Platforma";

	return (
		<nav className="breadcrumbs" aria-label="Breadcrumb">
			<Link to="/" className="breadcrumbs__item">
				{root}
			</Link>
			<span className="breadcrumbs__separator">/</span>
			<span className="breadcrumbs__current">{title}</span>
		</nav>
	);
};

const SidebarItem = ({
	item,
	collapsed,
	onNavigate,
}: {
	item: SidebarItemConfig;
	collapsed: boolean;
	onNavigate?: () => void;
}) => (
	<NavLink
		to={item.to}
		title={collapsed ? item.label : undefined}
		onClick={onNavigate}
		className={({ isActive }) => cn("sidebar-item", isActive && "active")}
	>
		<span className="sidebar-item__icon">
			<Icon name={item.icon} />
		</span>
		<span className="sidebar-item__label">{item.label}</span>
		{collapsed && <span className="sidebar-tooltip">{item.label}</span>}
	</NavLink>
);

const Sidebar = ({
	groups,
	collapsed,
	mobileOpen,
	onCollapseToggle,
	onMobileClose,
}: {
	groups: SidebarGroupConfig[];
	collapsed: boolean;
	mobileOpen: boolean;
	onCollapseToggle: () => void;
	onMobileClose: () => void;
}) => {
	const location = useLocation();
	const [openGroups, setOpenGroups] = useState<Set<string>>(
		() => new Set(groups.map((group) => group.id)),
	);

	useEffect(() => {
		setOpenGroups((previous) => {
			const next = new Set(previous);
			for (const group of groups) {
				if (group.items.some((item) => location.pathname.startsWith(item.to))) {
					next.add(group.id);
				}
			}
			return next;
		});
	}, [groups, location.pathname]);

	const toggleGroup = (groupId: string) => {
		setOpenGroups((previous) => {
			const next = new Set(previous);
			if (next.has(groupId)) next.delete(groupId);
			else next.add(groupId);
			return next;
		});
	};

	return (
		<aside
			className={cn(
				"app-sidebar",
				collapsed && "collapsed",
				mobileOpen && "mobile-open",
			)}
		>
			<div className="sidebar-brand">
				<Link className="brand min-w-0" to="/" onClick={onMobileClose}>
					<div className="brand-mark" />
					<div className="sidebar-brand__text">
						<div className="brand-title">Hədəf STEAM</div>
						<div className="brand-subtitle">PKPD Platforması</div>
					</div>
				</Link>
				<button
					className="sidebar-collapse"
					type="button"
					onClick={onCollapseToggle}
					aria-label={collapsed ? "Sidebar aç" : "Sidebar yığ"}
				>
					{collapsed ? "›" : "‹"}
				</button>
			</div>
			<div className="sidebar-scroll">
				{groups.map((group) => {
					const isOpen = collapsed || openGroups.has(group.id);
					return (
						<div className="sidebar-group" key={group.id}>
							<button
								className="sidebar-group__button"
								type="button"
								onClick={() => toggleGroup(group.id)}
								aria-expanded={isOpen}
							>
								<span>{group.title}</span>
								<span aria-hidden>{isOpen ? "−" : "+"}</span>
							</button>
							{isOpen && (
								<div className="sidebar-group__items">
									{group.items.map((item) => (
										<SidebarItem
											key={item.to}
											item={item}
											collapsed={collapsed}
											onNavigate={onMobileClose}
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</aside>
	);
};

const UserMenu = () => {
	const { userDoc, signOutUser } = useAuth();
	const [open, setOpen] = useState(false);
	const menuRef = useRef<HTMLDivElement | null>(null);
	const location = useLocation();

	useEffect(() => {
		setOpen(false);
	}, [location.pathname]);

	useEffect(() => {
		if (!open) return;
		const handlePointerDown = (event: PointerEvent) => {
			if (!menuRef.current?.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div className="user-menu" ref={menuRef}>
			<button
				className="user-menu__button"
				type="button"
				onClick={() => setOpen((value) => !value)}
				aria-expanded={open}
				aria-haspopup="menu"
			>
				<span className="user-avatar" aria-hidden>
					{(userDoc?.displayName ?? userDoc?.login ?? "U").slice(0, 1).toUpperCase()}
				</span>
				<span className="user-menu__text">
					<span>{userDoc?.displayName ?? userDoc?.login ?? "İstifadəçi"}</span>
					<span>{roleLabels[userDoc?.role ?? ""] ?? userDoc?.role ?? "-"}</span>
				</span>
			</button>
			{open && (
				<div className="user-dropdown" role="menu">
					<div className="user-dropdown__header">
						<div className="font-semibold">{userDoc?.displayName ?? "İstifadəçi"}</div>
						<div className="text-xs text-muted-foreground">
							{roleLabels[userDoc?.role ?? ""] ?? userDoc?.role ?? "-"}
						</div>
					</div>
					<Link className="user-dropdown__item" to="/me" role="menuitem">
						Profil
					</Link>
					<button
						className="user-dropdown__item danger"
						type="button"
						role="menuitem"
						onClick={() => void signOutUser()}
					>
						Çıxış
					</button>
				</div>
			)}
		</div>
	);
};

const Topbar = ({
	onMobileOpen,
	canGoBack,
	onBack,
}: {
	onMobileOpen: () => void;
	canGoBack: boolean;
	onBack: () => void;
}) => {
	const { userDoc } = useAuth();
	const location = useLocation();
	const title = getCurrentPageTitle(location.pathname);

	return (
		<header className="app-topbar">
			<div className="topbar-left">
				<button
					className="mobile-menu-button"
					type="button"
					onClick={onMobileOpen}
					aria-label="Menyunu aç"
				>
					☰
				</button>
				<div>
					<Breadcrumbs />
					<div className="topbar-title">{title}</div>
				</div>
			</div>
			<div className="topbar-center">
				<div className="global-search" aria-label="Axtarış qısayolu">
					<span aria-hidden>⌕</span>
					<span>Axtarış</span>
					<kbd>Ctrl K</kbd>
				</div>
			</div>
			<div className="topbar-actions">
				<span className="role-badge">
					{roleLabels[userDoc?.role ?? ""] ?? userDoc?.role ?? "-"}
				</span>
				<NotificationBell />
				<button
					className="back-button"
					type="button"
					onClick={onBack}
					aria-label="Geri"
					disabled={!canGoBack}
				>
					<span aria-hidden>←</span>
					Geri
				</button>
				<ThemeToggle />
				<UserMenu />
			</div>
		</header>
	);
};

export const AppShell = () => {
	const { userDoc } = useAuth();
	const role = userDoc?.role;
	const navigate = useNavigate();
	const location = useLocation();
	const [canGoBack, setCanGoBack] = useState(false);
	const [mobileOpen, setMobileOpen] = useState(false);
	const [collapsed, setCollapsed] = useState(() => {
		if (typeof localStorage === "undefined") return false;
		return localStorage.getItem("app_sidebar_collapsed") === "true";
	});
	const groups = useMemo(() => getSidebarGroups(role), [role]);

	useEffect(() => {
		if (!role) return;
		const path = `${location.pathname}${location.search}${location.hash}`;
		if (path !== "/login" && path !== "/") {
			localStorage.setItem(`last_path_${role}`, path);
		}
	}, [role, location.pathname, location.search, location.hash]);

	useEffect(() => {
		const idx =
			typeof window !== "undefined" ? (window.history.state?.idx ?? 0) : 0;
		setCanGoBack(idx > 0);
		setMobileOpen(false);
	}, [location.pathname, location.search, location.hash]);

	useEffect(() => {
		localStorage.setItem("app_sidebar_collapsed", String(collapsed));
	}, [collapsed]);

	useEffect(() => {
		if (!mobileOpen) return;
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setMobileOpen(false);
		};
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [mobileOpen]);

	const handleBack = () => {
		if (canGoBack) navigate(-1);
	};

	return (
		<div className={cn("app-shell-layout", collapsed && "sidebar-collapsed")}>
			<div
				className={cn("sidebar-overlay", mobileOpen && "visible")}
				onClick={() => setMobileOpen(false)}
				aria-hidden="true"
			/>
			<Sidebar
				groups={groups}
				collapsed={collapsed}
				mobileOpen={mobileOpen}
				onCollapseToggle={() => setCollapsed((value) => !value)}
				onMobileClose={() => setMobileOpen(false)}
			/>
			<div className="app-main">
				<Topbar
					onMobileOpen={() => setMobileOpen(true)}
					canGoBack={canGoBack}
					onBack={handleBack}
				/>
				<main className="content app-content">
					<Outlet />
				</main>
			</div>
		</div>
	);
};
