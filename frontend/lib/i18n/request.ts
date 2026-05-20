import { getRequestConfig } from "next-intl/server";

import { defaultLocale, type Locale, locales } from "./config";

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (locales as readonly string[]).includes(requested ?? "")
    ? (requested as Locale)
    : defaultLocale;
  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});
