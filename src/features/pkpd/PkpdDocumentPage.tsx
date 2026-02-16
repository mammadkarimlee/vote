import pkpdGuideText from "./pkpd-guide-2026.txt?raw";

export const PkpdDocumentPage = () => {
	return (
		<div className="page">
			<section className="card space-y-4">
				<h1 className="text-2xl font-semibold text-foreground">
					PKPD təlimatı 2026
				</h1>
				<pre className="whitespace-pre-wrap text-sm leading-7 text-foreground">
					{pkpdGuideText}
				</pre>
			</section>
		</div>
	);
};
