/**
 * Validacao de digito verificador de CNPJ e CPF (algoritmo oficial RFB).
 * Usado na importacao de clientes para nao gravar documentos invalidos que
 * quebrariam a captura fiscal (chave de acesso, DistDFe) depois.
 */

function digits(value: string): string {
  return (value || "").replace(/\D/g, "");
}

export function isValidCpf(raw: string): boolean {
  const cpf = digits(raw);
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // rejeita repetidos (000..., 111...)

  const calc = (len: number): number => {
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cpf[i]) * (len + 1 - i);
    }
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };

  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function isValidCnpj(raw: string): boolean {
  const cnpj = digits(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calc = (len: number): number => {
    const weights =
      len === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < len; i++) {
      sum += Number(cnpj[i]) * weights[i];
    }
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

/** Aceita CPF (11) ou CNPJ (14) validos. */
export function isValidCpfCnpj(raw: string): boolean {
  const d = digits(raw);
  if (d.length === 11) return isValidCpf(d);
  if (d.length === 14) return isValidCnpj(d);
  return false;
}

/**
 * Parser de CSV que respeita campos entre aspas duplas (inclusive com o
 * separador dentro das aspas e aspas escapadas como ""). O split ingenuo por
 * separador quebrava razoes sociais que contem virgula/ponto-e-virgula.
 */
export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((c) => c.trim());
}
