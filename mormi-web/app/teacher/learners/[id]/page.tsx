import { TeacherLearnerReport } from "../../TeacherPortal";

export default async function TeacherLearnerPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ cohort?: string }>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  return <TeacherLearnerReport learnerId={Number(id)} cohortId={Number(query.cohort)} />;
}
