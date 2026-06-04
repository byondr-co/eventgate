import { buttonVariants } from "@/components/ui/button";
import { RegistrationSuccess } from "@/components/guests/registration-success";

type Props = {
  params: Promise<{ orgSlug: string; eventSlug: string; guestId: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function RegisteredPage({ searchParams }: Props) {
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;
  const { token } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
      <div className="w-full max-w-md space-y-4">
        <RegistrationSuccess />
        {botUsername && token && (
          <a
            href={`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ variant: "outline", className: "w-full" })}
          >
            Get on Telegram
          </a>
        )}
      </div>
    </main>
  );
}
