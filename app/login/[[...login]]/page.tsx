import { SignIn } from "@clerk/nextjs";
import AuthLayout from "@/components/layouts/authLayout";

export default function Login() {
  return (
    <>
      <AuthLayout>
        <SignIn />
      </AuthLayout>
    </>
  );
}
