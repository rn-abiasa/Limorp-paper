import { SignUp } from "@clerk/nextjs";
import AuthLayout from "@/components/layouts/authLayout";

export default function Register() {
  return (
    <>
      <AuthLayout>
        <SignUp />
      </AuthLayout>
    </>
  );
}
