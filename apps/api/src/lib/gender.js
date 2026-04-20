// ─────────────────────────────────────────────────────────────
// Gender detection from first name — Mexican Spanish focused.
//
// Returns 'M' (masculine), 'F' (feminine), or 'X' (unknown).
// Consumers use this to pick "Bienvenido" / "Bienvenida" /
// "Bienvenid@" in outbound WhatsApp messages.
//
// Matching rules:
//   - Case/accent insensitive.
//   - We split on spaces and take ONLY the first token ("María José"
//     → match "maria"). This handles compound names without the
//     complexity of a full second-pass (compound Spanish names usually
//     follow the gender of the first token; "José María" for a man is
//     rare enough we accept the false miss).
//   - Unknown names fall to 'X' so copy can use the neutral
//     "Bienvenid@" form.
// ─────────────────────────────────────────────────────────────

const MALE = new Set([
    'juan', 'pedro', 'diego', 'carlos', 'luis', 'miguel', 'jose', 'jesus',
    'francisco', 'javier', 'antonio', 'manuel', 'alejandro', 'daniel',
    'fernando', 'ricardo', 'roberto', 'rafael', 'raul', 'ruben', 'sergio',
    'arturo', 'eduardo', 'emilio', 'enrique', 'ernesto', 'felipe', 'gerardo',
    'gilberto', 'gonzalo', 'guillermo', 'gustavo', 'hector', 'hugo',
    'humberto', 'ignacio', 'ivan', 'jaime', 'joaquin', 'jorge', 'julian',
    'julio', 'leonardo', 'leonel', 'marco', 'marcos', 'mario', 'martin',
    'mauricio', 'nicolas', 'omar', 'oscar', 'pablo', 'patricio', 'ramiro',
    'ramon', 'rodrigo', 'salvador', 'santiago', 'saul', 'tomas', 'vicente',
    'victor', 'armando', 'alfredo', 'alberto', 'adrian', 'agustin', 'andres',
    'angel', 'cesar', 'cristian', 'cristobal', 'esteban', 'felix', 'israel',
    'leopoldo', 'lorenzo', 'moises', 'rogelio', 'samuel', 'sebastian',
]);

const FEMALE = new Set([
    'maria', 'sofia', 'guadalupe', 'ana', 'laura', 'andrea', 'carmen',
    'adriana', 'alejandra', 'alicia', 'angelica', 'araceli', 'beatriz',
    'blanca', 'carolina', 'claudia', 'daniela', 'diana', 'elena', 'elisa',
    'elizabeth', 'esperanza', 'estela', 'eva', 'fabiola', 'fatima',
    'fernanda', 'gabriela', 'gloria', 'graciela', 'ines', 'irene', 'isabel',
    'jessica', 'josefina', 'juana', 'julia', 'karina', 'leticia', 'lilia',
    'lourdes', 'lucia', 'luisa', 'luz', 'magdalena', 'margarita', 'mariana',
    'maricela', 'marta', 'martha', 'miriam', 'monica', 'nadia', 'natalia',
    'norma', 'olga', 'patricia', 'paula', 'pilar', 'raquel', 'rebeca',
    'regina', 'reyna', 'rocio', 'rosa', 'rosalia', 'rosario', 'sandra',
    'silvia', 'soledad', 'susana', 'teresa', 'valentina', 'valeria',
    'veronica', 'victoria', 'virginia', 'viviana', 'ximena', 'yolanda',
    'zulema',
]);

function normalize(s) {
    return String(s || '')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

export function detectGender(name) {
    const first = normalize(name).split(/\s+/)[0];
    if (!first) return 'X';
    if (MALE.has(first)) return 'M';
    if (FEMALE.has(first)) return 'F';
    return 'X';
}

export default detectGender;
