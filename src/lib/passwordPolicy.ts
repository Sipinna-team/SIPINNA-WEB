export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_REQUIREMENTS =
  '10–128 caracteres, una mayúscula y un símbolo (como !, @ o #). Se permiten letras, números y espacios.';

/** Cuenta caracteres Unicode y conserva todos los espacios de la contraseña. */
export function passwordError(password: string): string | null {
  const length = Array.from(password).length;
  if (length < PASSWORD_MIN_LENGTH) return 'La contraseña debe tener al menos 10 caracteres.';
  if (length > PASSWORD_MAX_LENGTH) return 'La contraseña admite hasta 128 caracteres.';
  if (!/^[\p{L}\p{M}\p{N}\p{P}\p{S}\p{Zs}]*$/u.test(password)) {
    return 'Usa letras, números, símbolos y espacios en la contraseña.';
  }
  if (!/\p{Lu}/u.test(password)) return 'La contraseña debe incluir al menos una mayúscula.';
  if (!/[\p{P}\p{S}]/u.test(password)) {
    return 'La contraseña debe incluir al menos un símbolo; los espacios no cuentan como símbolo.';
  }
  return null;
}
