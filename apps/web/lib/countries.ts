/* Lista curada de países con código telefónico. No es exhaustiva — son los
 * que un gym en Chihuahua normalmente verá: Latam completo + US/CA + España
 * + algunos más. Si falta alguno, agrégalo acá (digits = longitud típica
 * nacional, usada sólo para validación suave — el backend valida E.164). */

export interface Country {
    code: string; // ISO alpha-2
    name: string;
    dial: string; // con '+'
    flag: string;
    digits: number; // dígitos nacionales esperados (referencia, no estricto)
}

export const COUNTRIES: Country[] = [
    { code: 'MX', name: 'México',          dial: '+52',  flag: '🇲🇽', digits: 10 },
    { code: 'US', name: 'Estados Unidos',  dial: '+1',   flag: '🇺🇸', digits: 10 },
    { code: 'CA', name: 'Canadá',          dial: '+1',   flag: '🇨🇦', digits: 10 },
    { code: 'AR', name: 'Argentina',       dial: '+54',  flag: '🇦🇷', digits: 10 },
    { code: 'BO', name: 'Bolivia',         dial: '+591', flag: '🇧🇴', digits: 8  },
    { code: 'BR', name: 'Brasil',          dial: '+55',  flag: '🇧🇷', digits: 11 },
    { code: 'CL', name: 'Chile',           dial: '+56',  flag: '🇨🇱', digits: 9  },
    { code: 'CO', name: 'Colombia',        dial: '+57',  flag: '🇨🇴', digits: 10 },
    { code: 'CR', name: 'Costa Rica',      dial: '+506', flag: '🇨🇷', digits: 8  },
    { code: 'CU', name: 'Cuba',            dial: '+53',  flag: '🇨🇺', digits: 8  },
    { code: 'DO', name: 'República Dominicana', dial: '+1', flag: '🇩🇴', digits: 10 },
    { code: 'EC', name: 'Ecuador',         dial: '+593', flag: '🇪🇨', digits: 9  },
    { code: 'SV', name: 'El Salvador',     dial: '+503', flag: '🇸🇻', digits: 8  },
    { code: 'ES', name: 'España',          dial: '+34',  flag: '🇪🇸', digits: 9  },
    { code: 'GT', name: 'Guatemala',       dial: '+502', flag: '🇬🇹', digits: 8  },
    { code: 'HN', name: 'Honduras',        dial: '+504', flag: '🇭🇳', digits: 8  },
    { code: 'NI', name: 'Nicaragua',       dial: '+505', flag: '🇳🇮', digits: 8  },
    { code: 'PA', name: 'Panamá',          dial: '+507', flag: '🇵🇦', digits: 8  },
    { code: 'PY', name: 'Paraguay',        dial: '+595', flag: '🇵🇾', digits: 9  },
    { code: 'PE', name: 'Perú',            dial: '+51',  flag: '🇵🇪', digits: 9  },
    { code: 'PR', name: 'Puerto Rico',     dial: '+1',   flag: '🇵🇷', digits: 10 },
    { code: 'UY', name: 'Uruguay',         dial: '+598', flag: '🇺🇾', digits: 8  },
    { code: 'VE', name: 'Venezuela',       dial: '+58',  flag: '🇻🇪', digits: 10 },
    { code: 'FR', name: 'Francia',         dial: '+33',  flag: '🇫🇷', digits: 9  },
    { code: 'GB', name: 'Reino Unido',     dial: '+44',  flag: '🇬🇧', digits: 10 },
    { code: 'DE', name: 'Alemania',        dial: '+49',  flag: '🇩🇪', digits: 11 },
    { code: 'IT', name: 'Italia',          dial: '+39',  flag: '🇮🇹', digits: 10 },
    { code: 'PT', name: 'Portugal',        dial: '+351', flag: '🇵🇹', digits: 9  },
    { code: 'NL', name: 'Países Bajos',    dial: '+31',  flag: '🇳🇱', digits: 9  },
];

export const DEFAULT_COUNTRY: Country =
    COUNTRIES.find((c) => c.code === 'MX') ?? COUNTRIES[0];

/** Parses an E.164 string into { country, national } by longest dial-prefix match. */
export function parseE164(e164: string | null | undefined): {
    country: Country;
    national: string;
} {
    if (!e164 || typeof e164 !== 'string') {
        return { country: DEFAULT_COUNTRY, national: '' };
    }
    const clean = e164.trim();
    if (!clean.startsWith('+')) {
        return { country: DEFAULT_COUNTRY, national: clean.replace(/\D/g, '') };
    }
    // Intentar match más largo primero.
    const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
    for (const c of sorted) {
        if (clean.startsWith(c.dial)) {
            return { country: c, national: clean.slice(c.dial.length).replace(/\D/g, '') };
        }
    }
    return { country: DEFAULT_COUNTRY, national: clean.replace(/\D/g, '') };
}

/** Joins a country + national digits into E.164. Returns '' when empty. */
export function toE164(country: Country, national: string): string {
    const d = (national || '').replace(/\D/g, '');
    if (!d) return '';
    return `${country.dial}${d}`;
}
