export type PkpdFinalReviewComponent = {
	key: string;
	label: string;
	value: number | null | undefined;
	max: number;
};

export type PkpdFinalReviewInput = {
	isComplete: boolean;
	baseTotalScore: number | null;
	finalMaxScore?: number;
	currentEnteredScore: number;
	leadershipComplete: boolean;
	missingFields: string[];
	components: PkpdFinalReviewComponent[];
};

export type GeneratedPkpdFinalReview = {
	reviewText: string;
	recommendationText: string;
};

const formatScore = (score: number) => score.toFixed(2);

const getCategory = (score: number) => {
	if (score >= 90) return "Tələblərə tam cavab verən";
	if (score >= 80) return "Tələblərə cavab verən";
	if (score >= 60) return "Tələblərə əsasən cavab verən";
	if (score >= 50) return "İnkişaf etdirilməsi zəruri olan";
	if (score >= 30) return "İnkişafı aşağı olan";
	return "İnkişafı çox aşağı olan / tutduğu vəzifəyə uyğun deyil";
};

const getReviewBaseText = (
	score: number,
	categoryScore: number,
	category: string,
	finalMaxScore: number,
) => {
	const scoreText = `${formatScore(score)} / ${finalMaxScore}`;
	if (categoryScore >= 90) {
		return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Qiymətləndirmə dövrü üzrə göstəricilər müəllimin vəzifə funksiyalarını yüksək səviyyədə icra etdiyini, pedaqoji fəaliyyətində sabit və nümunəvi nəticələr nümayiş etdirdiyini göstərir.`;
	}
	if (categoryScore >= 80) {
		return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Müəllim qiymətləndirmə dövrü üzrə əsas vəzifə funksiyalarını tələb olunan səviyyədə yerinə yetirmişdir.`;
	}
	if (categoryScore >= 60) {
		return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Nəticələr müəllimin ümumi fəaliyyətinin qənaətbəxş olduğunu göstərsə də, bəzi istiqamətlər üzrə inkişaf ehtiyacı mövcuddur.`;
	}
	if (categoryScore >= 50) {
		return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Qiymətləndirmə nəticələri göstərir ki, müəllimin bir sıra fəaliyyət istiqamətlərində inkişaf ehtiyacı var.`;
	}
	if (categoryScore >= 30) {
		return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Nəticələr müəllimin vəzifə funksiyalarının icrasında ciddi inkişaf ehtiyacının olduğunu göstərir.`;
	}
	return `Müəllimin PKPD yekun nəticəsi ${scoreText} bal təşkil edir və "${category}" kateqoriyasına uyğundur. Nəticələr müəllimin mövcud vəzifə tələblərini ödəmədiyini göstərir.`;
};

const getRecommendationBaseText = (score: number) => {
	if (score >= 90) {
		return "Müəllimin təcrübəsinin kafedra və kampus daxilində paylaşılması, metodiki fəaliyyətlərə və mentorluq proseslərinə cəlb olunması tövsiyə olunur.";
	}
	if (score >= 80) {
		return "Növbəti qiymətləndirmə dövründə daha yüksək nəticə üçün zəif komponentlər üzrə inkişaf planının hazırlanması və portfolio fəaliyyətlərinin gücləndirilməsi tövsiyə olunur.";
	}
	if (score >= 60) {
		return "Müəllim üçün fərdi inkişaf istiqamətlərinin müəyyənləşdirilməsi, zəif nəticə göstərən komponentlər üzrə metodiki dəstək və dövri monitorinq tövsiyə olunur.";
	}
	if (score >= 50) {
		return "Müəllim üçün fərdi inkişaf planı hazırlanmalı, rəhbərlik tərəfindən aylıq monitorinq aparılmalı və növbəti qiymətləndirmə dövrünə qədər konkret inkişaf hədəfləri müəyyən edilməlidir.";
	}
	if (score >= 30) {
		return "Müəllimlə şərtli əməkdaşlıq, ciddi monitorinq və qısa müddətli inkişaf planı tətbiq olunmalıdır. Növbəti dövrdə nəticələr yenidən qiymətləndirilməlidir.";
	}
	return "Attestasiya komissiyasının qərarına əsasən müəllimin tutduğu vəzifəyə uyğunluğu ilə bağlı rəhbərlik səviyyəsində müvafiq tədbirlərin görülməsi tövsiyə olunur.";
};

const getComponentInsight = (
	component: PkpdFinalReviewComponent,
	isStrong: boolean,
) => {
	if (component.key === "studentSurveyScore") {
		return isStrong
			? "Balabilgə sorğusu üzrə nəticə müsbət göstərici kimi qiymətləndirilir."
			: "Balabilgə sorğusu üzrə nəticələrin yüksəldilməsi üçün dərsin izah modeli və sinif idarəetməsi üzrə inkişaf tədbirləri planlaşdırılmalıdır.";
	}
	if (component.key === "portfolioScore") {
		return isStrong
			? "Portfolio fəaliyyəti üzrə nəticə müəllimin peşəkar aktivliyini müsbət şəkildə göstərir."
			: "Portfolio fəaliyyəti üzrə inkişaf ehtiyacı müşahidə olunur.";
	}
	if (component.key === "subjectMasteryScore") {
		return isStrong
			? "Fənn mənimsəmə nəticələri müəllimin akademik göstəricilərinin güclü olduğunu göstərir."
			: "Fənn mənimsəmə nəticələrinin yüksəldilməsi prioritet inkişaf istiqaməti kimi müəyyən edilməlidir.";
	}
	if (component.key === "leadershipEvaluationScore") {
		return isStrong
			? "Rəhbərlik qiymətləndirməsi müəllimin təşkilati və peşəkar davranış göstəricilərinin müsbət olduğunu göstərir."
			: "Rəhbərlik qiymətləndirməsi üzrə müəyyən edilən inkişaf sahələri üçün dövri monitorinq planlaşdırılmalıdır.";
	}
	return isStrong
		? `${component.label} üzrə nəticə güclü göstərici kimi qiymətləndirilir.`
		: `${component.label} üzrə nəticənin yüksəldilməsi üçün inkişaf tədbirləri planlaşdırılmalıdır.`;
};

export const buildRuleBasedPkpdFinalReview = ({
	baseTotalScore,
	finalMaxScore = 100,
	currentEnteredScore,
	leadershipComplete,
	missingFields,
	components,
}: PkpdFinalReviewInput): GeneratedPkpdFinalReview => {
	const uniqueMissingFields = Array.from(
		new Set([
			...missingFields,
			...(leadershipComplete ? [] : ["Rəhbərlik səslərinin tamamlanması"]),
		]),
	);

	if (baseTotalScore === null) {
		return {
			reviewText: `Müəllim üzrə PKPD qiymətləndirməsi hələ tamamlanmayıb. Hazırda daxil edilmiş göstəricilər əsasında cari bal ${formatScore(currentEnteredScore)} / ${finalMaxScore} təşkil edir. Yekun nəticə və qərar bütün tələb olunan qiymətləndirmə sahələri daxil edildikdən sonra formalaşdırılacaq.`,
			recommendationText: `Qiymətləndirmənin tamamlanması üçün çatışmayan sahələrin daxil edilməsi tövsiyə olunur: ${uniqueMissingFields.join(", ") || "tələb olunan qiymətləndirmə məlumatları"}. Yekun rəy və inkişaf istiqamətləri qiymətləndirmə tamamlandıqdan sonra yenilənməlidir.`,
		};
	}

	const availableComponents = components.filter(
		(component) =>
			component.value !== null &&
			component.value !== undefined &&
			!Number.isNaN(component.value) &&
			component.max > 0,
	);
	const strongInsights = availableComponents
		.filter((component) => ((component.value ?? 0) / component.max) * 100 >= 85)
		.map((component) => getComponentInsight(component, true));
	const weakInsights = availableComponents
		.filter((component) => ((component.value ?? 0) / component.max) * 100 < 60)
		.map((component) => getComponentInsight(component, false));
	const comparableScore =
		finalMaxScore === 70 ? (baseTotalScore / 70) * 100 : baseTotalScore;
	const category = getCategory(comparableScore);
	const reviewParts = [
		getReviewBaseText(baseTotalScore, comparableScore, category, finalMaxScore),
	];
	const recommendationParts = [getRecommendationBaseText(comparableScore)];

	if (strongInsights.length > 0) {
		reviewParts.push(strongInsights.join(" "));
	}
	if (weakInsights.length > 0) {
		recommendationParts.push(weakInsights.join(" "));
	}

	return {
		reviewText: reviewParts.join(" "),
		recommendationText: recommendationParts.join(" "),
	};
};
