const WEAK_PASSWORDS = new Set([
  "123",
  "1234",
  "12345",
  "123456",
  "1234567",
  "12345678",
  "password",
  "qwerty",
  "admin",
  "letmein",
]);

export function isPasswordStrongEnough(p: string): { ok: boolean; message?: string } {
  if (p.length < 8) return { ok: false, message: "Минимум 8 символов" };
  if (WEAK_PASSWORDS.has(p.toLowerCase())) return { ok: false, message: "Пароль слишком простой" };
  const hasLetter = /[a-zA-Z]/.test(p);
  const hasDigit = /\d/.test(p);
  if (!hasLetter || !hasDigit) return { ok: false, message: "Нужны буквы и цифры" };
  return { ok: true };
}
