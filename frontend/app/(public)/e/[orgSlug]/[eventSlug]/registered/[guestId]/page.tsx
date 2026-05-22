import { RegistrationSuccess } from "@/components/guests/registration-success";

export default function RegisteredPage() {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-4">
        <RegistrationSuccess />
        {botUsername && (
          <a
            href={`https://t.me/${botUsername}`}
            className="inline-flex w-full items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
            target="_blank"
            rel="noopener noreferrer"
          >
            Get on Telegram
          </a>
        )}
      </div>
    </main>
  );
}
