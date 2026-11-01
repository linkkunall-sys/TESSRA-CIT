import type { Metadata } from "next";
import { PRODUCT } from "@/lib/constants";
import ForgotPasswordForm from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot Password — " + PRODUCT.name };

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
