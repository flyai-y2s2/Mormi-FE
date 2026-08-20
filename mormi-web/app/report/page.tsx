import type { Metadata } from "next";
import { cookies } from "next/headers";
import { localReportAdminConfig } from "../local-report-admin-policy";
import { TEACHER_REPORT_COOKIE, verifyTeacherReportSession } from "../teacher-report-session";
import { ReportDashboard } from "./ReportDashboard";

export const metadata: Metadata = {
  title: "모르미 개인 진단 리포트",
  description: "교사가 학습자의 현재 상태와 변화를 근거와 함께 확인하는 리포트",
};

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ example?: string; teacher?: string }> }) {
  const { example, teacher } = await searchParams;
  const teacherMode = teacher === "1";
  const config = localReportAdminConfig(process.env);
  const teacherAuthRequired = Boolean(config?.auth);
  let teacherAuthenticated = !teacherAuthRequired;
  if (teacherMode && config?.auth) {
    const cookieStore = await cookies();
    teacherAuthenticated = verifyTeacherReportSession(
      cookieStore.get(TEACHER_REPORT_COOKIE)?.value,
      config.auth.sessionSecret,
    );
  }
  return <ReportDashboard
    completeExample={example === "complete"}
    localAdminEnabled={config !== null}
    teacherMode={teacherMode}
    teacherAuthRequired={teacherAuthRequired}
    teacherAuthenticated={teacherAuthenticated}
  />;
}
