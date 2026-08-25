/**
 * Ukrainian strings produced OUTSIDE React (PROJECT_PROMPT.md §8).
 *
 * This is not an i18n layer and must not grow into one. UI copy belongs inline
 * in the components. This file exists for the three places that cannot hold
 * JSX: pure engine rule errors, server-action/zod errors, and bot replies.
 *
 * Pure functions return the KEY plus params, never a formatted sentence — that
 * is what lets `lib/*.test.ts` assert on a stable key instead of on prose, and
 * lets the same error render as a toast in the browser and as plain text in
 * Telegram.
 */

export const MESSAGES = {
  // --- stock engine (§3.3) ---
  // `missing`/`available` arrive already formatted with a declined unit
  // ("0,5 літра"), so this template must NOT append its own unit — the compact
  // labels end in a dot ("шт.") and would render "5 шт.." mid-sentence.
  "stock.shortfall":
    "Не вистачає {missing} — доступно (не прострочено) лише {available}",
  "stock.quantityPositive": "Кількість має бути більшою за нуль.",
  "stock.nothingToConsume": "У цього товару немає запасу.",
  "stock.allExpired":
    "Усе прострочено. Візьміть із конкретної партії або спишіть її.",
  "stock.batchShortfall": "У цій партії лише {available}",
  "stock.batchNotFound": "Партію не знайдено.",
  "stock.batchEmpty": "Ця партія вже порожня.",
  "stock.correctionNegative": "Кількість не може бути від'ємною.",

  // --- items (§3.2) ---
  "item.unitLocked":
    "Не можна змінити одиницю виміру: у товару вже є партії. Створіть окремий товар.",
  "item.duplicateBarcode": "Товар із таким штрихкодом уже існує: {name}.",
  "item.barcodeInvalid": "Це не схоже на штрихкод (потрібно 6–14 цифр).",
  "item.nameRequired": "Вкажіть назву товару.",
  "item.locationNotFound": "Такого місця зберігання немає.",
  "item.notFound": "Товар не знайдено.",
  "item.archived": "Товар в архіві — спочатку поверніть його з архіву.",

  // --- batches / add stock (Feature 4) ---
  "batch.rowsRequired": "Додайте хоча б один рядок.",
  "batch.expiryInPast": "Дата придатності вже минула.",
  "batch.openedInFuture": "Дата відкриття не може бути в майбутньому.",

  // --- shopping list (Feature 6) ---
  "shopping.rowInvalid": "Вкажіть або товар зі списку, або довільний текст.",
  "shopping.alreadyOnList": "Цей товар уже є в списку покупок.",
  "shopping.notFound": "Рядок списку не знайдено.",
  "shopping.textRequired": "Назва не може бути порожньою.",
  "shopping.nameFromItem":
    "Назва береться з товару — перейменуйте його на сторінці запасів.",

  // --- shopping list groups (Feature 11) ---
  "shoppingGroup.nameRequired": "Вкажіть назву групи.",
  "shoppingGroup.nameTooLong": "Назва групи задовга (максимум 40 символів).",
  "shoppingGroup.nameTaken": "Група з такою назвою вже існує.",
  "shoppingGroup.notFound": "Групу не знайдено.",

  // --- auth / household (Feature 1) ---
  "auth.invalidCredentials": "Невірна пошта або пароль.",
  "auth.emailTaken": "Користувач із такою поштою вже існує.",
  "auth.emailInvalid": "Вкажіть коректну адресу пошти.",
  "auth.passwordTooShort": "Пароль має містити щонайменше 8 символів.",
  "auth.nameRequired": "Вкажіть ім'я.",
  "auth.currentPasswordWrong": "Поточний пароль невірний.",
  "auth.inviteInvalid": "Запрошення недійсне або вже використане.",
  "auth.inviteExpired": "Термін дії запрошення минув.",
  "auth.sessionRequired": "Потрібно увійти.",
  "auth.forbidden": "Немає доступу до цих даних.",

  // --- settings ---
  "settings.warnDaysRange": "Кількість днів має бути від 0 до 365.",
  "settings.digestHourRange": "Година має бути від 0 до 23.",
  "settings.categoryNameTaken": "Категорія з такою назвою вже існує.",
  "settings.locationNameTaken": "Місце зберігання з такою назвою вже існує.",
  "settings.categoryInUse": "Категорію не можна видалити: у ній є товари.",
  "settings.locationInUse": "Місце зберігання не можна видалити: там є товари.",

  // --- telegram bot (Feature 9) ---
  "bot.notLinked":
    "Цей чат не прив'язано. Відкрийте налаштування у застосунку та скористайтеся кнопкою «Прив'язати Telegram».",
  "bot.linkInvalid": "Посилання недійсне або вже використане.",
  "bot.linked": "Готово! Чат прив'язано до акаунта {name}.",
  "bot.nothingLow": "Усе на місці — нічого не закінчується.",
  "bot.nothingExpiring": "Нічого не псується найближчим часом.",
  "bot.listEmpty": "Список покупок порожній.",
  "bot.cancelled": "Скасовано.",
  "bot.unknownCommand": "Не знаю такої команди.",

  // --- digest (Feature 19.1) ---
  "digest.botNotConfigured": "Telegram-бот не налаштований.",
  "digest.noChats": "Немає жодного прив'язаного чату — спершу прив'яжіть Telegram.",
  "digest.failed": "Не вдалося надіслати. Спробуйте ще раз.",

  // --- generic ---
  "error.unexpected": "Щось пішло не так. Спробуйте ще раз.",
} as const;

export type MessageKey = keyof typeof MESSAGES;

export type RuleMessage = {
  key: MessageKey;
  params?: Record<string, string | number>;
};

/** Build a rule message. Keeps call sites honest about the key type. */
export function ruleMessage(
  key: MessageKey,
  params?: Record<string, string | number>,
): RuleMessage {
  return params ? { key, params } : { key };
}

/**
 * Render a rule message to Ukrainian text. `{name}` placeholders are replaced
 * from `params`; an unknown placeholder is left as-is rather than printing
 * "undefined" at the user.
 */
export function renderMessage(message: RuleMessage): string {
  const template: string = MESSAGES[message.key];
  const params = message.params;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
