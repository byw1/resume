-- A fourth ending: silence.
--
-- Most applications do not get rejected, they get no answer, and recording
-- that as REJECTED makes the funnel read as though people are saying no when
-- they are saying nothing. The two need different responses — a rejection is
-- feedback, a ghosting is a follow-up you never sent — so they are different
-- states rather than one "closed".
ALTER TYPE "Stage" ADD VALUE 'GHOSTED';
