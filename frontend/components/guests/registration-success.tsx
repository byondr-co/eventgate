"use client";

import { useTranslations } from "next-intl";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function RegistrationSuccess() {
  const t = useTranslations("register");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("success_title")}</CardTitle>
        <CardDescription>{t("success_email_note")}</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{t("success_check_spam")}</p>
      </CardContent>
    </Card>
  );
}
