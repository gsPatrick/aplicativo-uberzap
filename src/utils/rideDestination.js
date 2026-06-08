// Helpers para "corrida sem destino" — destino definido só no fim (taxímetro).
// No backend, ao finalizar, o endereço final é gravado como:
//   "Sem destino • R. Tal, 123, Bairro, Cidade"
// (ou "Sem destino • (local não capturado)" quando o GPS falhou).

const MARK = '•';

export function isSemDestino(addr) {
  const s = (addr || '').toString().toLowerCase();
  return s.includes('sem destino') || s.includes('a combinar');
}

// Extrai o endereço real capturado no fim, ou null se não houver.
export function enderecoFinalReal(addr) {
  const s = (addr || '').toString();
  const idx = s.indexOf(MARK);
  if (idx >= 0) {
    const real = s.slice(idx + 1).trim();
    if (real && !/local n[ãa]o capturado/i.test(real)) return real;
    return null;
  }
  return null;
}

// Texto a exibir no "destino" de uma corrida sem destino.
export function labelDestinoSemDestino(addr) {
  return enderecoFinalReal(addr) || 'Destino definido no fim';
}
