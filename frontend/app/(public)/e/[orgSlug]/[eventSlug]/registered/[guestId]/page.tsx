import { RegistrationSuccess } from "@/components/guests/registration-success";

type Props = {
  params: Promise<{ orgSlug: string; eventSlug: string; guestId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function RegisteredPage({ searchParams }: Props) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const { token } = await searchParams;
  return (
    <main className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-4">
        <RegistrationSuccess />
        {botUsername && token && (
          <a
            href={`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`}
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
