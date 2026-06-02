/** Remove tudo que não for dígito */
export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

/** Máscara CPF: 000.000.000-00 */
export function formatCpf(value) {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9, 11)}`;
}

/** Máscara telefone BR: (00) 00000-0000 ou (00) 0000-0000 */
export function formatPhoneBr(value) {
  const d = digitsOnly(value).slice(0, 11);
  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/** Normaliza telefone para envio à API (somente dígitos) */
export function normalizePhoneForApi(value) {
  return digitsOnly(value);
}

/** Normaliza CPF para envio à API (somente dígitos — servidor compara ignorando pontuação) */
export function normalizeCpfForApi(value) {
  return digitsOnly(value);
}

export function isValidPhoneDigits(value) {
  const d = digitsOnly(value);
  return d.length >= 10 && d.length <= 11;
}

export function isValidCpfDigits(value) {
  const d = digitsOnly(value);
  return d.length === 11;
}
