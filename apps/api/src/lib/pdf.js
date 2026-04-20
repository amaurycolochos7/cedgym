// ─────────────────────────────────────────────────────────────────
// PDF generation helpers — wraps pdfkit.
//
// Exports:
//   generateReceipt(payment, user, items)           → { url, buffer }
//   generateMembershipCard(user, membership, ws, qrToken)
//                                                    → { url, buffer }
//   generateRoutinePDF(product, user)                → { url, buffer }
//
// Each helper returns the raw Buffer *and* uploads it to MinIO via
// `storage.js`. If MinIO is not configured the `url` is an inline
// base64 data URL (dev fallback).
//
// Dependencies:
//   - pdfkit     (required)
// ─────────────────────────────────────────────────────────────────

import PDFDocument from 'pdfkit';
import crypto from 'node:crypto';
import { putObject } from './storage.js';

// ────────────────────────────────────────────────────────────────
// Internal: render a pdfkit doc into a Buffer.
// ────────────────────────────────────────────────────────────────
function renderToBuffer(buildFn) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: 'LETTER', margin: 40 });
            const chunks = [];
            doc.on('data', (c) => chunks.push(c));
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
            buildFn(doc);
            doc.end();
        } catch (e) {
            reject(e);
        }
    });
}

function fmtMxn(n) {
    const num = Number(n || 0);
    return `$${num.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MXN`;
}

function fmtDate(d) {
    if (!d) return '—';
    const dt = d instanceof Date ? d : new Date(d);
    return dt.toLocaleString('es-MX', {
        dateStyle: 'long',
        timeStyle: 'short',
    });
}

// ────────────────────────────────────────────────────────────────
// generateReceipt — for POS sales and digital product purchases.
// ────────────────────────────────────────────────────────────────
export async function generateReceipt(payment, user, items = []) {
    const buffer = await renderToBuffer((doc) => {
        // Header
        doc.fontSize(20).fillColor('#000').text('CED-GYM', { align: 'left' });
        doc.fontSize(10).fillColor('#555').text('Recibo de compra', { align: 'left' });
        doc.moveDown(0.5);
        doc.strokeColor('#bbb').moveTo(40, doc.y).lineTo(572, doc.y).stroke();
        doc.moveDown();

        // Meta
        doc.fontSize(10).fillColor('#000');
        doc.text(`Recibo ID: ${payment.id}`);
        doc.text(`Fecha: ${fmtDate(payment.paid_at || payment.created_at || new Date())}`);
        if (user) {
            doc.text(`Cliente: ${user.full_name || user.name || '—'}`);
            doc.text(`Email:   ${user.email || '—'}`);
        }
        if (payment.reference) doc.text(`Referencia: ${payment.reference}`);
        doc.moveDown();

        // Items table
        doc.fontSize(11).fillColor('#000').text('Detalle', { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(10);

        const safeItems = items && items.length ? items : [{
            description: payment.description || 'Pago',
            qty: 1,
            unit_price: payment.amount,
            subtotal: payment.amount,
        }];

        const startY = doc.y;
        doc.text('Descripción', 40, startY);
        doc.text('Cant.', 340, startY, { width: 50, align: 'right' });
        doc.text('Precio', 400, startY, { width: 80, align: 'right' });
        doc.text('Subtotal', 490, startY, { width: 82, align: 'right' });
        doc.moveTo(40, doc.y + 4).lineTo(572, doc.y + 4).strokeColor('#ddd').stroke();
        doc.moveDown(0.5);

        let total = 0;
        for (const it of safeItems) {
            const qty = Number(it.qty || 1);
            const unit = Number(it.unit_price || it.price_mxn || 0);
            const sub = Number(it.subtotal != null ? it.subtotal : qty * unit);
            total += sub;
            const rowY = doc.y;
            doc.text(String(it.description || it.name || it.sku || '—'), 40, rowY, { width: 290 });
            doc.text(String(qty), 340, rowY, { width: 50, align: 'right' });
            doc.text(fmtMxn(unit), 400, rowY, { width: 80, align: 'right' });
            doc.text(fmtMxn(sub), 490, rowY, { width: 82, align: 'right' });
            doc.moveDown(0.5);
        }

        doc.moveDown();
        doc.moveTo(40, doc.y).lineTo(572, doc.y).strokeColor('#aaa').stroke();
        doc.moveDown(0.5);
        doc.fontSize(12).fillColor('#000').text(
            `TOTAL: ${fmtMxn(total || payment.amount)}`,
            { align: 'right' }
        );

        doc.moveDown(2);
        doc.fontSize(8).fillColor('#888').text(
            'CED-GYM — Este documento es un comprobante de la operación registrada en el sistema. No es un CFDI; solicita tu factura por separado.',
            { align: 'center' }
        );
    });

    const key = `receipts/${payment.workspace_id || 'default'}/${payment.id}.pdf`;
    const uploaded = await putObject({
        key,
        body: buffer,
        contentType: 'application/pdf',
    });
    return { buffer, url: uploaded.url, key: uploaded.key, storage: uploaded.storage };
}

// ────────────────────────────────────────────────────────────────
// generateMembershipCard — printable carnet w/ QR.
//
// The QR token is embedded as a URL the scanner app opens. We don't
// render a real QR image here (avoids a native dep) — we print the
// token string in a monospaced box. If `qrcode` is installed we use
// it; otherwise we skip the image and keep the token text.
// ────────────────────────────────────────────────────────────────
export async function generateMembershipCard(user, membership, workspace, qrToken) {
    let qrDataUrl = null;
    try {
        const qrcode = await import('qrcode');
        qrDataUrl = await qrcode.toDataURL(qrToken || user.id, { margin: 1, width: 180 });
    } catch {
        // no qr lib — fall through, print token as text.
    }

    const buffer = await renderToBuffer((doc) => {
        doc.rect(40, 40, 532, 300).fillAndStroke('#0b1020', '#0b1020');
        doc.fillColor('#f4d03f').fontSize(24).text('CED-GYM', 60, 60);
        doc.fillColor('#fff').fontSize(10).text(workspace?.name || 'Centro Deportivo', 60, 90);

        doc.fillColor('#fff').fontSize(14).text(user.full_name || user.name || '—', 60, 150);
        doc.fontSize(10).fillColor('#cfd8dc').text(user.email || '', 60, 170);
        doc.text(user.phone || '', 60, 185);

        doc.fillColor('#f4d03f').fontSize(11).text(`PLAN: ${membership?.plan || '—'}`, 60, 220);
        doc.fillColor('#fff').fontSize(10).text(
            `Vigencia: ${fmtDate(membership?.expires_at)}`,
            60,
            240
        );
        doc.text(`Estatus: ${membership?.status || '—'}`, 60, 258);

        // QR box (right side)
        if (qrDataUrl) {
            const b64 = qrDataUrl.split(',')[1];
            const img = Buffer.from(b64, 'base64');
            doc.image(img, 400, 150, { width: 150, height: 150 });
        } else {
            doc.rect(400, 150, 150, 150).fillAndStroke('#fff', '#fff');
            doc.fillColor('#000').fontSize(8).text(
                qrToken || user.id,
                405,
                215,
                { width: 140, align: 'center' }
            );
        }

        doc.fillColor('#888').fontSize(8).text(
            `ID: ${user.id}`,
            60,
            310
        );
    });

    const key = `cards/${workspace?.id || 'default'}/${user.id}.pdf`;
    const uploaded = await putObject({ key, body: buffer, contentType: 'application/pdf' });
    return { buffer, url: uploaded.url, key: uploaded.key, storage: uploaded.storage };
}

// ────────────────────────────────────────────────────────────────
// generateRoutinePDF — renders the routine content with a diagonal
// watermark on every page ("{email} | {timestamp}").
// ────────────────────────────────────────────────────────────────
export async function generateRoutinePDF(product, user) {
    const timestamp = new Date().toISOString();
    const watermark = `${user.email || user.id} | ${timestamp}`;

    const paintWatermark = (doc) => {
        doc.save();
        doc.fillColor('#e0e0e0').fontSize(36);
        // Rotate around page center, big diagonal text.
        const { width, height } = doc.page;
        doc.rotate(-30, { origin: [width / 2, height / 2] });
        doc.text(watermark, 0, height / 2 - 20, {
            width,
            align: 'center',
        });
        doc.restore();
        // Footer stamp
        doc.save();
        doc.fillColor('#999').fontSize(8);
        doc.text(watermark, 40, doc.page.height - 30, {
            width: doc.page.width - 80,
            align: 'center',
        });
        doc.restore();
    };

    const buffer = await renderToBuffer((doc) => {
        doc.on('pageAdded', () => paintWatermark(doc));
        paintWatermark(doc);

        // Cover
        doc.fontSize(22).fillColor('#000').text(product.title || 'Rutina', { align: 'left' });
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#555').text(
            `Tipo: ${product.type || '—'} · Nivel: ${product.level || '—'} · Duración: ${product.duration_weeks || '—'} semanas`
        );
        doc.moveDown();
        doc.fontSize(11).fillColor('#000').text(product.description || '', { align: 'justify' });
        doc.moveDown();

        // Render content JSON.
        const content = product.content || {};
        const weeks = Array.isArray(content.weeks) ? content.weeks : null;

        if (weeks) {
            for (const [wi, week] of weeks.entries()) {
                if (wi > 0) doc.addPage();
                doc.fontSize(16).fillColor('#000').text(`Semana ${wi + 1}${week.title ? ' — ' + week.title : ''}`);
                doc.moveDown(0.5);
                const days = Array.isArray(week.days) ? week.days : [];
                for (const [di, day] of days.entries()) {
                    doc.fontSize(12).fillColor('#000').text(`Día ${di + 1}${day.name ? ' — ' + day.name : ''}`);
                    doc.moveDown(0.2);
                    const exercises = Array.isArray(day.exercises) ? day.exercises : [];
                    for (const ex of exercises) {
                        doc.fontSize(10).fillColor('#222').text(
                            `• ${ex.name || '—'} — ${ex.sets || '?'}×${ex.reps || '?'}${ex.rest ? ' · descanso ' + ex.rest : ''}${ex.notes ? ' · ' + ex.notes : ''}`
                        );
                    }
                    doc.moveDown(0.5);
                }
            }
        } else {
            // Generic JSON dump fallback
            doc.fontSize(10).fillColor('#222').text(JSON.stringify(content, null, 2), {
                align: 'left',
            });
        }

        // Appendix: video links if any
        if (Array.isArray(product.video_urls) && product.video_urls.length) {
            doc.addPage();
            doc.fontSize(16).fillColor('#000').text('Videos de referencia');
            doc.moveDown();
            for (const url of product.video_urls) {
                doc.fontSize(10).fillColor('#0645ad').text(url, { link: url, underline: true });
            }
        }
    });

    const hash = crypto.createHash('sha1').update(`${product.id}:${user.id}:${timestamp}`).digest('hex').slice(0, 8);
    const key = `routines/${product.workspace_id || 'default'}/${product.id}/${user.id}-${hash}.pdf`;
    const uploaded = await putObject({ key, body: buffer, contentType: 'application/pdf' });
    return { buffer, url: uploaded.url, key: uploaded.key, storage: uploaded.storage };
}

export default {
    generateReceipt,
    generateMembershipCard,
    generateRoutinePDF,
};
