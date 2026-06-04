"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Registered } from "@/lib/illustrations";

export function RegistrationSuccess() {
  const t = useTranslations("register");
  return (
    <Card>
      <CardHeader className="text-center">
        <Registered className="mx-auto size-10 text-success" />
        <CardTitle>{t("success_title")}</CardTitle>
        <CardDescription>{t("success_email_note")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-center text-sm text-muted-foreground">{t("success_check_spam")}</p>
      </CardContent>
    </Card>
  );
}
