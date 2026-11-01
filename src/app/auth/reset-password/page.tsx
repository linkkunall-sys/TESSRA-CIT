import type { Metadata } from "next";
import { PRODUCT } from "@/lib/constants";
import ResetPasswordForm from "./reset-password-form";

export const metadata: Metadata = { title: "Reset Password — " + PRODUCT.name };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  return <ResetPasswordForm token={searchParams.token ?? ""} />;
}
