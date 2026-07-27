/**
 * cUFAutor (Código da UF do Autor) — usado no distDFeInt tanto de NF-e
 * quanto de CT-e. Em ambos os schemas o campo é do tipo `TCodUfIBGE`
 * (confirmado nos XSDs oficiais distDFeInt_v1.01.xsd), que só aceita
 * códigos de UF REAIS (11-53). O valor 91 (código reservado para
 * "Ambiente Nacional"/SVC, usado em outros campos como `cOrgao` de
 * eventos) NÃO é um TCodUfIBGE válido e é rejeitado com
 * "215-Rejeição: Falha no esquema xml" em AMBOS os serviços.
 *
 * O campo é opcional (minOccurs=0) em ambos, mas todos os exemplos reais
 * (ACBr, sped-nfe, manuais de fornecedores) sempre enviam um código de UF
 * real — por isso resolvemos para uma UF configurável em vez de omitir.
 */
const VALID_UF_CODES = new Set([
  "11", "12", "13", "14", "15", "16", "17", // Norte
  "21", "22", "23", "24", "25", "26", "27", "28", "29", // Nordeste
  "31", "32", "33", "35", // Sudeste
  "41", "42", "43", // Sul
  "50", "51", "52", "53", // Centro-Oeste
]);

const DEFAULT_UF = "35"; // SP

/**
 * `SEFAZ_CUF_AUTOR` é a variável recomendada (vale para NF-e e CT-e).
 * `CTE_CUF_AUTOR` é mantida por compatibilidade com configurações
 * anteriores que só ajustavam o CT-e.
 */
export function resolveCufAutor(): string {
  const env =
    process.env.SEFAZ_CUF_AUTOR?.trim() || process.env.CTE_CUF_AUTOR?.trim();
  return env && VALID_UF_CODES.has(env) ? env : DEFAULT_UF;
}
