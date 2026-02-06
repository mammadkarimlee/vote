import type { BranchDoc } from "../../lib/types";

export const BranchSelector = ({
	branchId,
	branches,
	onChange,
}: {
	branchId: string;
	branches: Array<{ id: string; data: BranchDoc }>;
	onChange: (value: string) => void;
}) => {
	return (
		<div className="card">
			<div className="form-row">
				<label className="field">
					<span>Filial seçin</span>
					<select
						className="input"
						value={branchId}
						onChange={(event) => onChange(event.target.value)}
					>
						<option value="">Filial seçin</option>
						{branches.map((branch) => (
							<option key={branch.id} value={branch.id}>
								{branch.data.name}
							</option>
						))}
					</select>
				</label>
			</div>
		</div>
	);
};
