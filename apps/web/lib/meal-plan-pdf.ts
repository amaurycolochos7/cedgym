// ─────────────────────────────────────────────────────────────────
// Client-side meal-plan PDF generator.
//
// Used by the portal "Descargar plan alimenticio" button — produces
// a one-shot, printable plan with the gym logo, target macros, and
// a section per day that bundles the day's shopping list with each
// meal's ingredients + preparation steps.
//
// jsPDF is imported lazily so it stays out of the initial bundle:
// the helper is only loaded the first time the user clicks the
// download button.
// ─────────────────────────────────────────────────────────────────

import type { jsPDF as JsPDFInstance } from 'jspdf';

export type MealType = 'BREAKFAST' | 'SNACK_AM' | 'LUNCH' | 'SNACK_PM' | 'DINNER';

export interface PdfMeal {
  day_of_week: number;
  meal_type: MealType;
  name: string;
  description?: string;
  ingredients?: string[];
  calories?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  prep_time_min?: number;
  order_index?: number;
}

export interface PdfMealPlan {
  id: string;
  name: string;
  goal?: string;
  calories_target?: number;
  protein_g?: number;
  carbs_g?: number;
  fats_g?: number;
  restrictions?: string[];
  meals: PdfMeal[];
}

const MEAL_TYPE_ES: Record<MealType, string> = {
  BREAKFAST: 'Desayuno',
  SNACK_AM: 'Media mañana',
  LUNCH: 'Comida',
  SNACK_PM: 'Antes de entrenar',
  DINNER: 'Cena',
};

const MEAL_ORDER: MealType[] = ['BREAKFAST', 'SNACK_AM', 'LUNCH', 'SNACK_PM', 'DINNER'];

const DAYS_LONG = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

// ─── Ingredient parser (mirrors the backend's `parseIngredient`) ──
const UNIT_ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramos: 'g',
  kg: 'kg',
  ml: 'ml',
  l: 'l', litro: 'l', litros: 'l',
  tz: 'taza', taza: 'taza', tazas: 'taza',
  cda: 'cda', cdas: 'cda', cucharada: 'cda', cucharadas: 'cda',
  cdta: 'cdta', cdtas: 'cdta', cucharadita: 'cdta', cucharaditas: 'cdta',
  pz: 'pieza', pza: 'pieza', pzas: 'pieza', pieza: 'pieza', piezas: 'pieza',
  unidad: 'unidad', unidades: 'unidad',
};

function parseIngredient(raw: string): { qty: number; unit: string; name: string } | null {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return null;
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([a-záéíóúñ]+)?\s+(.+)$/i);
  if (m) {
    const qty = parseFloat(m[1].replace(',', '.'));
    let unit = (m[2] || '').toLowerCase();
    let name = m[3].trim();
    if (unit && UNIT_ALIASES[unit]) {
      unit = UNIT_ALIASES[unit];
    } else if (unit && !UNIT_ALIASES[unit]) {
      name = `${unit} ${name}`.trim();
      unit = 'unidad';
    } else {
      unit = 'unidad';
    }
    return { qty, unit, name: name.replace(/\s+/g, ' ') };
  }
  return { qty: 1, unit: 'unidad', name: s };
}

function aggregateShoppingList(meals: PdfMeal[]): { name: string; total: string }[] {
  const bucket = new Map<string, { name: string; unit: string; qty: number }>();
  for (const m of meals) {
    for (const raw of m.ingredients || []) {
      const p = parseIngredient(raw);
      if (!p) continue;
      const key = `${p.name}::${p.unit}`;
      const existing = bucket.get(key);
      if (existing) existing.qty += p.qty;
      else bucket.set(key, { name: p.name, unit: p.unit, qty: p.qty });
    }
  }
  return Array.from(bucket.values())
    .map(({ name, qty, unit }) => {
      const rounded = Math.round(qty * 100) / 100;
      const total =
        unit === 'unidad'
          ? `${rounded} ${rounded === 1 ? 'pieza' : 'piezas'}`
          : `${rounded} ${unit}`;
      return { name: name.charAt(0).toUpperCase() + name.slice(1), total };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

// ─── Logo loader — fetches /logo.png and converts to data URL ────
async function loadLogoDataUrl(): Promise<{ data: string; w: number; h: number } | null> {
  try {
    const res = await fetch('/logo.png');
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
    // Decode dimensions so we keep the logo's aspect ratio in the PDF.
    const dims = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = reject;
      img.src = dataUrl;
    });
    return { data: dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

// ─── Main entry point ────────────────────────────────────────────
export async function downloadMealPlanPdf(
  plan: PdfMealPlan,
  options: { firstName?: string | null } = {},
): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 40;
  const contentW = pageW - M * 2;

  // ── State ────────────────────────────────────────────────────
  let y = M;
  let pageNumber = 1;

  // Group meals by day, sorted by order_index.
  const byDay = new Map<number, PdfMeal[]>();
  for (const meal of plan.meals ?? []) {
    const arr = byDay.get(meal.day_of_week) ?? [];
    arr.push(meal);
    byDay.set(meal.day_of_week, arr);
  }
  for (const arr of byDay.values()) {
    arr.sort((a, b) => {
      const oa = a.order_index ?? MEAL_ORDER.indexOf(a.meal_type);
      const ob = b.order_index ?? MEAL_ORDER.indexOf(b.meal_type);
      return oa - ob;
    });
  }
  const sortedDays = Array.from(byDay.keys()).sort((a, b) => a - b);

  const logo = await loadLogoDataUrl();

  // ── Helpers ──────────────────────────────────────────────────
  const ensureSpace = (needed: number) => {
    if (y + needed > pageH - M) {
      addFooter();
      pdf.addPage();
      pageNumber += 1;
      y = M;
    }
  };

  const addFooter = () => {
    const prev = y;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(160);
    pdf.text(
      `CED·GYM · Plan alimenticio · Página ${pageNumber}`,
      pageW / 2,
      pageH - 18,
      { align: 'center' },
    );
    pdf.setTextColor(0);
    y = prev;
  };

  const text = (
    s: string,
    x: number,
    yPos: number,
    opts: { size?: number; color?: number | [number, number, number]; bold?: boolean; align?: 'left' | 'center' | 'right' } = {},
  ) => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 11);
    if (opts.color !== undefined) {
      if (typeof opts.color === 'number') pdf.setTextColor(opts.color);
      else pdf.setTextColor(opts.color[0], opts.color[1], opts.color[2]);
    } else {
      pdf.setTextColor(0);
    }
    pdf.text(s, x, yPos, { align: opts.align });
    pdf.setTextColor(0);
  };

  const wrapped = (
    s: string,
    width: number,
    opts: { size?: number; bold?: boolean } = {},
  ): string[] => {
    pdf.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    pdf.setFontSize(opts.size ?? 11);
    return pdf.splitTextToSize(s, width) as string[];
  };

  // ── Header (first page) ──────────────────────────────────────
  if (logo) {
    // Fit the logo inside a 60pt-tall slot, preserving aspect ratio.
    const slotH = 56;
    const ratio = logo.w / logo.h;
    const drawH = slotH;
    const drawW = drawH * ratio;
    pdf.addImage(logo.data, 'PNG', M, y, drawW, drawH);
    text('CED·GYM', M + drawW + 14, y + 24, { size: 22, bold: true, color: 15 });
    text(
      'Plan alimenticio personalizado',
      M + drawW + 14,
      y + 44,
      { size: 11, color: 110 },
    );
    y += slotH + 18;
  } else {
    text('CED·GYM', M, y + 22, { size: 22, bold: true });
    text('Plan alimenticio personalizado', M, y + 42, { size: 11, color: 110 });
    y += 60;
  }

  // Divider
  pdf.setDrawColor(220);
  pdf.setLineWidth(0.6);
  pdf.line(M, y, pageW - M, y);
  y += 16;

  // Plan title
  const titleText = options.firstName
    ? `Plan de ${options.firstName}`
    : plan.name || 'Tu plan alimenticio';
  text(titleText, M, y, { size: 18, bold: true });
  y += 20;

  // Target macros line
  const target = [
    plan.calories_target != null ? `${plan.calories_target} kcal/día` : null,
    plan.protein_g != null ? `${plan.protein_g}g proteína` : null,
    plan.carbs_g != null ? `${plan.carbs_g}g carbos` : null,
    plan.fats_g != null ? `${plan.fats_g}g grasas` : null,
  ]
    .filter(Boolean)
    .join('  ·  ');
  if (target) {
    text(target, M, y, { size: 10, color: 90 });
    y += 16;
  }

  if (plan.restrictions && plan.restrictions.length > 0) {
    text(`Restricciones: ${plan.restrictions.join(', ')}`, M, y, {
      size: 9,
      color: 110,
    });
    y += 14;
  }
  y += 8;

  // ── Per-day sections ─────────────────────────────────────────
  for (let idx = 0; idx < sortedDays.length; idx++) {
    const d = sortedDays[idx];
    const meals = byDay.get(d) ?? [];
    if (meals.length === 0) continue;

    // New page per day (except the first, which continues the
    // header). Keeps each day self-contained — easy to print just
    // the page you'll cook from.
    if (idx > 0) {
      addFooter();
      pdf.addPage();
      pageNumber += 1;
      y = M;
    }

    // Day heading bar
    const dayLabel = DAYS_LONG[d] ?? `Día ${d + 1}`;
    pdf.setFillColor(15, 23, 42); // slate-900
    pdf.rect(M, y, contentW, 28, 'F');
    text(dayLabel, M + 14, y + 19, { size: 13, bold: true, color: 255 });
    const dayCals = meals.reduce((acc, m) => acc + (m.calories ?? 0), 0);
    if (dayCals > 0) {
      text(
        `${dayCals} kcal · ${meals.length} comida${meals.length === 1 ? '' : 's'}`,
        pageW - M - 14,
        y + 19,
        { size: 10, color: 200, align: 'right' },
      );
    }
    y += 28 + 14;

    // ── Day shopping list ────────────────────────────────────
    const shopping = aggregateShoppingList(meals);
    if (shopping.length > 0) {
      ensureSpace(40);
      text('LISTA DE COMPRAS DEL DÍA', M, y, {
        size: 9,
        bold: true,
        color: [37, 99, 235],
      });
      y += 14;

      // Two-column layout
      const colW = (contentW - 12) / 2;
      const rowH = 14;
      let col = 0;
      let leftY = y;
      let rightY = y;
      for (const item of shopping) {
        const targetY = col === 0 ? leftY : rightY;
        ensureSpace(rowH + 10);
        const x = col === 0 ? M : M + colW + 12;
        const yLine = col === 0 ? leftY : rightY;
        // Bullet
        pdf.setFillColor(37, 99, 235);
        pdf.circle(x + 3, yLine - 3, 1.5, 'F');
        // Name + total
        const line = `${item.name} — ${item.total}`;
        const wrapping = wrapped(line, colW - 12, { size: 10 });
        text(wrapping[0], x + 10, yLine, { size: 10 });
        // We deliberately keep the shopping list compact (single line
        // per item) — long names just get clipped via splitTextToSize
        // taking the first row.
        if (col === 0) leftY += rowH;
        else rightY += rowH;
        col = 1 - col;
      }
      y = Math.max(leftY, rightY) + 10;
    }

    // Divider before recipes
    pdf.setDrawColor(230);
    pdf.line(M, y, pageW - M, y);
    y += 14;

    text('RECETAS', M, y, { size: 9, bold: true, color: [37, 99, 235] });
    y += 16;

    // ── Each meal of the day ─────────────────────────────────
    for (let mi = 0; mi < meals.length; mi++) {
      const meal = meals[mi];

      // Estimate vertical space needed: header line + macros line +
      // ingredients + description (each line ~13pt). If we run out,
      // jump to a new page.
      const ingrLines = (meal.ingredients ?? []).length;
      const descLines = wrapped(
        meal.description ?? '',
        contentW - 24,
        { size: 10 },
      ).length;
      const estimate = 60 + ingrLines * 13 + descLines * 13;
      ensureSpace(estimate);

      // Card-like background
      const cardTop = y;
      const cardPadding = 12;
      // We don't know the final height yet, so draw the body first
      // and then a thin border once we have it.
      const startY = y;

      // Meal type badge + name
      const badge = MEAL_TYPE_ES[meal.meal_type] ?? meal.meal_type;
      const badgeW =
        pdf.getTextWidth(badge.toUpperCase()) * (8 / pdf.getFontSize()) + 16;
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      const realBadgeW = pdf.getTextWidth(badge.toUpperCase()) + 16;
      pdf.setFillColor(239, 246, 255); // blue-50
      pdf.roundedRect(M + cardPadding, y, realBadgeW, 16, 8, 8, 'F');
      text(badge.toUpperCase(), M + cardPadding + 8, y + 11, {
        size: 8,
        bold: true,
        color: [37, 99, 235],
      });
      // Avoid unused-var lint flag.
      void badgeW;
      y += 22;

      text(meal.name, M + cardPadding, y, { size: 13, bold: true });
      y += 18;

      // Macros
      const macros = [
        meal.calories != null ? `${meal.calories} kcal` : null,
        meal.protein_g != null ? `${meal.protein_g}g prot` : null,
        meal.carbs_g != null ? `${meal.carbs_g}g carb` : null,
        meal.fats_g != null ? `${meal.fats_g}g grasa` : null,
        meal.prep_time_min != null ? `${meal.prep_time_min} min` : null,
      ]
        .filter(Boolean)
        .join('  ·  ');
      if (macros) {
        text(macros, M + cardPadding, y, { size: 9, color: 110 });
        y += 14;
      }

      y += 6;

      // Ingredients
      if (meal.ingredients && meal.ingredients.length > 0) {
        text('Ingredientes', M + cardPadding, y, {
          size: 9,
          bold: true,
          color: [71, 85, 105],
        });
        y += 13;
        for (const ing of meal.ingredients) {
          ensureSpace(14);
          // Bullet
          pdf.setFillColor(148, 163, 184); // slate-400
          pdf.circle(M + cardPadding + 3, y - 3, 1.2, 'F');
          const lines = wrapped(ing, contentW - cardPadding * 2 - 14, {
            size: 10,
          });
          text(lines[0], M + cardPadding + 10, y, { size: 10 });
          y += 13;
          for (let li = 1; li < lines.length; li++) {
            ensureSpace(13);
            text(lines[li], M + cardPadding + 10, y, { size: 10 });
            y += 13;
          }
        }
        y += 6;
      }

      // Preparation (description from the AI — may be a short
      // paragraph or numbered steps). We render whatever we got
      // verbatim, with line-wrapping.
      if (meal.description && meal.description.trim()) {
        text('Preparación', M + cardPadding, y, {
          size: 9,
          bold: true,
          color: [71, 85, 105],
        });
        y += 13;
        const paragraphs = meal.description.split(/\r?\n/);
        for (const para of paragraphs) {
          if (!para.trim()) {
            y += 6;
            continue;
          }
          const lines = wrapped(para, contentW - cardPadding * 2, {
            size: 10,
          });
          for (const line of lines) {
            ensureSpace(13);
            text(line, M + cardPadding, y, { size: 10 });
            y += 13;
          }
        }
        y += 6;
      }

      // Card border
      const cardBottom = y + 6;
      pdf.setDrawColor(226, 232, 240); // slate-200
      pdf.setLineWidth(0.5);
      pdf.roundedRect(M, cardTop - 4, contentW, cardBottom - cardTop + 4, 6, 6, 'S');
      y = cardBottom + 12;

      // Voids for unused-var lint flag.
      void startY;
    }
  }

  addFooter();

  // ── Save ─────────────────────────────────────────────────────
  const safeName = (options.firstName || 'plan')
    .toString()
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .slice(0, 40);
  pdf.save(`Plan_alimenticio_${safeName}.pdf`);
}
