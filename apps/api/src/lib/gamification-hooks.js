// ─────────────────────────────────────────────────────────────────
// Gamification hooks — called by other tracks (payments webhook,
// reviews) so every gamification side-effect lives behind one import.
//
// Each helper:
//   • applies XP via awardXP()
//   • re-runs checkAndAwardBadges()
//   • fires a high-level event so automations can pile on
//
// Callers should import these rather than re-implementing the XP
// table inside their own route handlers.
//
// Usage examples:
//   // webhooks.js (payment APPROVED, type = MEMBERSHIP, renewal)
//   await onMembershipActivated(prisma, userId, { renewal: true });
//
//   // webhooks.js (payment APPROVED, type = DIGITAL_PRODUCT)
//   await onProductPurchased(prisma, userId, productId);
//
//   // routes/reviews.js (after creating ProductReview)
//   await onReviewPosted(prisma, userId);
// ─────────────────────────────────────────────────────────────────

import { awardXP } from './xp.js';
import { checkAndAwardBadges } from './badges.js';
import { fireEvent } from './events.js';

// Helper: pulls workspace_id so `fireEvent` can route to automations.
async function getWsId(prisma, userId) {
    const u = await prisma.user.findUnique({
        where: { id: userId },
        select: { workspace_id: true },
    });
    return u?.workspace_id || null;
}

// Called when a membership is activated or renewed by the MP webhook.
// `meta.renewal` selects between first-activation (no XP — onboarding
// doesn't need extra XP) and renewal (awards MEMBERSHIP_RENEWED).
export async function onMembershipActivated(prisma, userId, meta = {}) {
    const workspaceId = await getWsId(prisma, userId);

    if (meta.renewal) {
        await awardXP(prisma, userId, 'MEMBERSHIP_RENEWED');
    } else {
        // Make sure the progress row exists so downstream lookups work.
        await prisma.userProgress.upsert({
            where: { user_id: userId },
            update: {},
            create: { user_id: userId },
        });
    }
    await checkAndAwardBadges(prisma, userId);

    await fireEvent('gamification.membership_activated', {
        workspaceId,
        userId,
        renewal: !!meta.renewal,
    });
}

// Called when a user's purchase of a digital product clears.
export async function onProductPurchased(prisma, userId, productId) {
    const workspaceId = await getWsId(prisma, userId);
    await awardXP(prisma, userId, 'PRODUCT_PURCHASED');
    await checkAndAwardBadges(prisma, userId);
    await fireEvent('gamification.product_purchased', {
        workspaceId,
        userId,
        productId,
    });
}

// Called after a ProductReview is persisted.
export async function onReviewPosted(prisma, userId) {
    const workspaceId = await getWsId(prisma, userId);
    await awardXP(prisma, userId, 'REVIEW_POSTED');
    await checkAndAwardBadges(prisma, userId);
    await fireEvent('gamification.review_posted', { workspaceId, userId });
}

export default {
    onMembershipActivated,
    onProductPurchased,
    onReviewPosted,
};
