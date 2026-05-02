/**
 * Parser di JSON parziale, tollerante: dato un buffer che cresce
 * (es. `{"file_path":"src/app.py","content":"from flask`),
 * tenta di "chiudere" il JSON aggiungendo i delimitatori mancanti
 * per ottenere un oggetto utilizzabile man mano che i delta arrivano.
 *
 * Non è perfetto, ma copre il caso d'uso (estrarre `file_path`,
 * `content`, `old_string`, `new_string` dai tool input di Claude).
 */
export function parsePartial(input: string): unknown {
  if (!input) return null;
  try { return JSON.parse(input); } catch { /* incompleto */ }

  let openCurly = 0;
  let openSquare = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (escape) { escape = false; continue; }
    if (c === '\\') { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') openCurly++;
    else if (c === '}') openCurly--;
    else if (c === '[') openSquare++;
    else if (c === ']') openSquare--;
  }

  let attempt = input;
  if (escape) attempt = attempt.slice(0, -1); // backslash incompleto in coda
  if (inString) attempt += '"';

  // sistema strutture incomplete come `"key":` o `"key":{`
  attempt = attempt.replace(/:\s*$/, ':null');
  attempt = attempt.replace(/,\s*$/, '');

  while (openSquare-- > 0) attempt += ']';
  while (openCurly-- > 0) attempt += '}';

  // virgole sospese prima di una chiusura
  attempt = attempt.replace(/,(\s*[}\]])/g, '$1');

  try { return JSON.parse(attempt); } catch { return null; }
}
