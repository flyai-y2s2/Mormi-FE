import { TeacherCohortDetail } from "../../TeacherPortal";

export default async function TeacherCohortPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TeacherCohortDetail cohortId={Number(id)} />;
}
