/**
 * Locale-aware formatting utilities.
 *
 * Reads the browser's lang-locale (navigator.language) to apply
 * the correct linguistic and currency experience to the user.
 */

// Map language/locale tags to their most-likely local currency.
// Falls back to USD if the locale cannot be mapped.
const LOCALE_CURRENCY_MAP: Record<string, string> = {
  // Americas
  'en-US': 'USD',
  'en-CA': 'CAD',
  'es-MX': 'MXN',
  'pt-BR': 'BRL',
  'es-AR': 'ARS',
  'es-CO': 'COP',
  'es-CL': 'CLP',
  'es-PE': 'PEN',
  // Europe
  'en-GB': 'GBP',
  'de-DE': 'EUR',
  'fr-FR': 'EUR',
  'es-ES': 'EUR',
  'it-IT': 'EUR',
  'nl-NL': 'EUR',
  'pt-PT': 'EUR',
  'de-AT': 'EUR',
  'fr-BE': 'EUR',
  'de-CH': 'CHF',
  'fr-CH': 'CHF',
  'sv-SE': 'SEK',
  'nb-NO': 'NOK',
  'da-DK': 'DKK',
  'pl-PL': 'PLN',
  'cs-CZ': 'CZK',
  'ro-RO': 'RON',
  'hu-HU': 'HUF',
  'tr-TR': 'TRY',
  // Africa
  'en-ZA': 'ZAR',
  'en-NG': 'NGN',
  'en-KE': 'KES',
  'sw-KE': 'KES',
  'sw-TZ': 'TZS',
  'fr-SN': 'XOF',
  'fr-CI': 'XOF',
  'ar-EG': 'EGP',
  'ar-MA': 'MAD',
  'en-GH': 'GHS',
  'en-RW': 'RWF',
  'am-ET': 'ETB',
  // Asia & Oceania
  'ja-JP': 'JPY',
  'zh-CN': 'CNY',
  'zh-TW': 'TWD',
  'ko-KR': 'KRW',
  'hi-IN': 'INR',
  'en-IN': 'INR',
  'en-AU': 'AUD',
  'en-NZ': 'NZD',
  'th-TH': 'THB',
  'vi-VN': 'VND',
  'id-ID': 'IDR',
  'ms-MY': 'MYR',
  'en-SG': 'SGD',
  'en-PH': 'PHP',
  'ar-AE': 'AED',
  'ar-SA': 'SAR',
  // Short-form fallbacks (language-only)
  'en': 'USD',
  'es': 'MXN',
  'fr': 'EUR',
  'de': 'EUR',
  'pt': 'BRL',
  'ar': 'EGP',
  'sw': 'KES',
  'ja': 'JPY',
  'zh': 'CNY',
  'ko': 'KRW',
  'hi': 'INR',
};

/**
 * Resolves the user's effective locale from the browser environment.
 * Prefers navigator.language, falling back to 'en-US'.
 */
export function getUserLocale(): string {
  if (typeof navigator !== 'undefined' && navigator.language) {
    return navigator.language;
  }
  return 'en-US';
}

/**
 * Resolves the ISO 4217 currency code for a given locale string.
 */
export function getCurrencyForLocale(locale: string): string {
  // Try exact match first: "en-US"
  if (LOCALE_CURRENCY_MAP[locale]) return LOCALE_CURRENCY_MAP[locale];

  // Try language-only fallback: "en"
  const lang = locale.split('-')[0].toLowerCase();
  if (LOCALE_CURRENCY_MAP[lang]) return LOCALE_CURRENCY_MAP[lang];

  return 'USD';
}

// Cached formatter instance — recreated if the locale changes.
let cachedLocale: string = '';
let cachedCurrency: string = '';
let cachedFormatter: Intl.NumberFormat | null = null;

function getFormatter(locale: string, currency: string): Intl.NumberFormat {
  if (cachedFormatter && cachedLocale === locale && cachedCurrency === currency) {
    return cachedFormatter;
  }
  cachedLocale = locale;
  cachedCurrency = currency;
  cachedFormatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return cachedFormatter;
}

/**
 * Formats a numeric price value using the browser's locale and its
 * corresponding local currency symbol.
 *
 * Example outputs:
 *   formatPrice(12.5)          → "$12.50"   (en-US)
 *   formatPrice(12.5)          → "R12,50"   (en-ZA)
 *   formatPrice(12.5)          → "KSh12.50" (sw-KE)
 *   formatPrice(12.5)          → "R$12,50"  (pt-BR)
 */
export function formatPrice(amount: number, overrideLocale?: string): string {
  const locale = overrideLocale || getUserLocale();
  const currency = getCurrencyForLocale(locale);
  try {
    return getFormatter(locale, currency).format(amount);
  } catch {
    // Fallback if the browser doesn't support the currency/locale combo
    return `$${amount.toFixed(2)}`;
  }
}
