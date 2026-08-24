-- Paid hosting: a person who checks out through Stripe becomes a customer id
-- on their User row, and billing drives isActive for exactly those rows. The
-- owner and free invitees have an empty id and billing never touches them.
ALTER TABLE "User" ADD COLUMN "stripeCustomerId" TEXT NOT NULL DEFAULT '';
CREATE INDEX "User_stripeCustomerId_idx" ON "User"("stripeCustomerId");

-- A checkout can happen before the person exists: the invite carries the
-- customer id across the gap and acceptInvite copies it onto the new User.
ALTER TABLE "Invite" ADD COLUMN "stripeCustomerId" TEXT NOT NULL DEFAULT '';
