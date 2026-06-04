import { Button } from "@/components/ui/button";
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
          <Button
            variant="outline"
            className="w-full"
            render={
              <a
                href={`https://t.me/${botUsername}?start=${encodeURIComponent(token)}`}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            Get on Telegram
          </Button>
        )}
      </div>
    </main>
  );
}
