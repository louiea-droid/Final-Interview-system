/*
 * Turns ALL-CAPS text copied from a spreadsheet into normal capitals, for a
 * candidate's name or course: "JUAN DELA CRUZ III" -> "Juan Dela Cruz III",
 * "BS INFORMATION TECHNOLOGY (BSIT)" -> "BS Information Technology (BSIT)".
 *
 * A word that already has lowercase letters is left alone, so a name fixed
 * by hand ("McArthur") survives running this again. No rule gets every
 * surname right, so it only runs when the admin clicks the Aa button.
 */

/* Suffixes and middle initials that are written in capitals. */
const ROMAN = new Set(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']);

/* Degree prefixes that stay in capitals. */
const DEGREES = new Set([
  'AB', 'BA', 'BS', 'BSA', 'BSBA', 'BSC', 'BSCS', 'BSCE', 'BSEE', 'BSME', 'BSED', 'BEED',
  'BSE', 'BSIT', 'BSIS', 'BSN', 'BSHM', 'BSTM', 'BSHRM', 'BSCRIM', 'BSPSYCH',
  'MA', 'MS', 'MBA', 'MAED', 'PHD', 'EDD',
]);

/* Joining words kept lowercase inside a course name. */
const SMALL_WORDS = new Set(['a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'of', 'on', 'or', 'the', 'to', 'with', 'major', 'minor']);

function capitalizeWord(word) {
  return word
    .toLowerCase()
    .replace(/(^|[-/(])(\p{Ll})/gu, (match, before, letter) => before + letter.toUpperCase())
    // O'Neil, D'Angelo - but not Women's
    .replace(/^(\p{L})'(\p{Ll})/u, (match, first, next) => `${first.toUpperCase()}'${next.toUpperCase()}`);
}

/** `kind` is 'name' or 'course'. */
export function properCase(text, kind = 'name') {
  let wordIndex = 0;
  let inParens = false;

  return text
    .split(/(\s+)/)
    .map((token) => {
      if (!token || /^\s+$/.test(token)) return token;

      const index = wordIndex++;
      if (token.includes('(')) inParens = true;
      const core = token.replace(/[^\p{L}]/gu, '').toUpperCase();

      let result;
      if (token !== token.toUpperCase()) result = token;
      else if (inParens || ROMAN.has(core) || (kind === 'course' && DEGREES.has(core))) result = token;
      else if (kind === 'course' && index > 0 && SMALL_WORDS.has(core.toLowerCase())) result = token.toLowerCase();
      else result = capitalizeWord(token);

      if (token.includes(')')) inParens = false;
      return result;
    })
    .join('');
}
