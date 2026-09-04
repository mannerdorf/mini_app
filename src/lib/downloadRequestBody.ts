/** Поля download для CMS и 1С-пользователей. */
export function buildDownloadRequestBody(
  auth: { login: string; password: string; isRegisteredUser?: boolean; inn?: string },
  payload: Record<string, unknown>,
): Record<string, unknown> {
  return {
    login: auth.login,
    password: auth.password,
    ...payload,
    ...(auth.isRegisteredUser ? { isRegisteredUser: true } : {}),
    ...(auth.inn ? { inn: auth.inn } : {}),
  };
}
