import type { Metadata } from "next";
import { ReportDashboard } from "./ReportDashboard";

export const metadata: Metadata = {
  title: "모르미 학습 리포트",
  description: "보호자와 교사를 위한 모르미 세션 요약",
};

export default function ReportPage() {
  return <ReportDashboard />;
}
