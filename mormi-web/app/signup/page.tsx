import type { Metadata } from "next";
import { SignupExperience } from "./SignupExperience";

export const metadata: Metadata = {
  title: "가입하기 | 내가 가르쳐 줄게!",
};

export default function SignupPage() {
  return <SignupExperience />;
}
