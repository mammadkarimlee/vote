import { Outlet } from "react-router-dom";

export const BranchLayout = (_props: { isAdmin?: boolean; isHr?: boolean }) => (
	<div className="layout-shell">
		<Outlet />
	</div>
);
