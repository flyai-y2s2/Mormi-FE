import type { Metadata } from "next";
import { localReportAdminConfig } from "../local-report-admin-policy";
import { ReportDashboard } from "./ReportDashboard";

export const metadata: Metadata = {
  title: "모르미 개인 진단 리포트",
  description: "교사가 학습자의 현재 상태와 변화를 근거와 함께 확인하는 리포트",
};

export default async function ReportPage({ searchParams }: { searchParams: Promise<{ example?: string }> }) {
  const { example } = await searchParams;
  const localAdminEnabled = localReportAdminConfig(process.env) !== null;
  return <ReportDashboard completeExample={example === "complete"} localAdminEnabled={localAdminEnabled} />;
}
