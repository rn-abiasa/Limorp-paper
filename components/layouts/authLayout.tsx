export default function AuthLayout({ children }: { children: any }) {
  return (
    <>
      <main className="h-screen flex justify-center items-center">
        {children}
      </main>
    </>
  );
}
