import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="h-screen flex justify-center items-center">
      <div>
        <h1 className="text-xl font-semibold">Welcome To Limorp!</h1>
        <p className="text-sm font-normal text-black/50 mb-5">
          Replace your ideas into paper.
        </p>
        <Button asChild>
          <a href="/login">Get Started</a>
        </Button>
      </div>
    </main>
  );
}
