import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ORG_ID, supabase } from "../../lib/supabase";
import { mapSurveyCycleRow } from "../../lib/supabaseMappers";
import type { SurveyCycleDoc } from "../../lib/types";

type DocEntry<T> = { id: string; data: T };

export const HrCyclesPage = () => {
	const [cycles, setCycles] = useState<Array<DocEntry<SurveyCycleDoc>>>([]);

	useEffect(() => {
		const loadCycles = async () => {
			const { data } = await supabase
				.from("survey_cycles")
				.select("*")
				.eq("org_id", ORG_ID);

			const items = (data ?? [])
				.map((row) => ({ id: row.id, data: mapSurveyCycleRow(row) }))
				.sort((a, b) => b.data.year - a.data.year);

			setCycles(items);
		};

		void loadCycles();
	}, []);

	const summary = useMemo(() => cycles.length, [cycles.length]);

	return (
		<div className="panel">
			<div className="panel-header">
				<div>
					<h2>HR sorğu dövrləri</h2>
					<p>Bütün filiallar üzrə müəllim özünüqiymətləndirmə və HR qiymətləndirməsi.</p>
				</div>
				<div className="stat-pill">Cəmi: {summary}</div>
			</div>

			<div className="data-table">
				<div className="data-row header">
					<div>İl</div>
					<div>Vəziyyət</div>
					<div></div>
				</div>
				{cycles.map((cycle) => (
					<div className="data-row" key={cycle.id}>
						<div>{cycle.data.year}</div>
						<div>{cycle.data.status}</div>
						<div>
							<Link className="btn ghost" to={`/hr/cycles/${cycle.id}`}>
								Detallara bax
							</Link>
						</div>
					</div>
				))}
				{cycles.length === 0 && <div className="empty">Sorğu dövrü tapılmadı.</div>}
			</div>
		</div>
	);
};
