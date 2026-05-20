import { RegistrationSuccess } from "@/components/guests/registration-success";

export default function RegisteredPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md">
        <RegistrationSuccess />
      </div>
    </main>
  );
}
