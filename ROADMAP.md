# SetterAI Roadmap

## Scoreboard
| Metric | Current | Next Milestone |
|--------|---------|----------------|
| MRR | $500 | $2,000 |
| Clients | 7 | 20 |
| Avg Price | ~$71/mo | $150-200/mo |
| Bottleneck | Bot quality + reliability | Phase 1 complete |

---

## Phase 1: Product Worth Paying For → $2K MRR
> 20 clients at $100-150 | Progress: 0/6

- [ ] `TODO` **Fix silent bot failures** — Bot returns null on API error, user gets ghosted. Add fallback reply + admin alert on consecutive failures. *Metric: Zero silent drops in 7 days*
- [ ] `TODO` **Start charging real prices** — Manual invoicing (Bit/PayBox/transfer) for next 20 clients at $150-200/mo. Simple pricing page. *Metric: All new clients invoiced on signup*
- [ ] `TODO` **Basic analytics dashboard** — Conversations/week, leads qualified, CTA sent, booking rate. Clients need to SEE the value. *Metric: Every client sees weekly stats*
- [ ] `IN PROGRESS` **Onboarding wizard (chat-based)** — Users skip voice/KB setup → bot sounds generic. Chat wizard plays customer, user replies naturally. AI extracts voice profile + FAQ + objection handling in 2-3 min. Business-type-specific scenarios. Reuses existing `analyzeVoice()` + settings/KB endpoints. *Metric: 90% of new clients complete wizard, bot quality jump from day 1*
- [ ] `TODO` **Bot tone consistency** — Bot doesn't adapt to user's style across conversation. Track message patterns, adjust response length. *Metric: Review 10 conversations/week*
- [ ] `TODO` **Instagram token expiry alerts** — 60-day token dies silently. Track expiry, alert 7 days before, notify admin on auth failures. *Metric: Zero surprise token deaths*

---

## Phase 2: Scalable Onboarding → $5K MRR
> 25-30 clients at $200 | Progress: 0/4

- [ ] `TODO` **"Keep teaching" mode** — Wizard covers basics, but power users want to go deeper. Let them add more scenarios, paste real conversations (reuse analyzeVoice), and refine KB anytime from dashboard. *Metric: 30% of clients use "keep teaching" in first week*
- [ ] `TODO` **"Test my bot" button** — No way to confirm bot works. Send real test message to admin's IG + webhook health check. *Metric: 100% verify before going live*
- [ ] `TODO` **Automated billing** — Manual invoicing breaks at 30 clients. Stripe/Lemon Squeezy: subscriptions, payment page, auto-pause on failed payment. *Metric: All clients on auto-billing*
- [ ] `TODO` **Email touchpoints** — Zero communication after signup. Welcome email, setup reminder (24h), weekly stats, token expiry warning. *Metric: Reduce "forgot about it" churn*

---

## Phase 3: Retention & Expansion → $15K MRR
> 60-75 clients at $200-250 | Progress: 0/5

- [ ] `TODO` **Follow-up automation** — Cold leads die after 1 conversation. Automated re-engagement: 24h, 72h, 7d sequences. *Metric: 15% cold lead reactivation*
- [ ] `TODO` **Lead pipeline** — Clients see leads but can't manage them. Pipeline: New → Qualified → CTA Sent → Booked → Closed. *Metric: Clients use pipeline daily*
- [ ] `TODO` **Scalable acquisition channel** — Personal network maxes at ~20 clients. Pick ONE: IG content, FB groups, or outbound automation. Case studies. *Metric: 10+ inbound leads/month*
- [ ] `TODO` **WhatsApp channel** — Instagram only = limited reach. ManyChat was removed (2026-03-09) to reduce attack surface — re-add when needed, or build direct WhatsApp Business API integration. *Metric: 20% of new clients use WhatsApp*
- [ ] `TODO` **WhatsApp escalation to owner** — Bot detects low confidence (scoring 0-10), pauses auto-replies, sends owner a WhatsApp notification with context + dashboard link. Owner resolves from dashboard. Twilio REST API via existing axios. *Metric: Zero unanswered complex questions*
- [ ] `TODO` **WhatsApp manual scheduling** — When lead wants to book but no link configured, bot asks preferred time, notifies owner via WhatsApp. New actions: `needs_human`, `manual_schedule`. *Metric: All scheduling requests reach owner within 30s*
- [ ] `TODO` **Referral system** — Happy clients don't bring friends. "Give 1 month free, get 1 month free." Track in dashboard. *Metric: 20% of new clients from referrals*

---

## Phase 4: Scale → $50K+ MRR
> 200+ clients | Progress: 0/5

- [ ] `TODO` **Admin tooling** — Can't manage 200 clients manually. Health scores, churn flags, bulk ops, usage dashboards. *Metric: Handle 200 clients in 1hr/day*
- [ ] `TODO` **Tiered pricing** — One price leaves money on table. Starter $150, Pro $300, Agency $500. *Metric: ARPU $250+*
- [ ] `TODO` **Team features** — Businesses want multiple users. Invite members, roles (admin/viewer). *Metric: Enterprise readiness*
- [ ] `TODO` **Bot learns from outcomes** — No feedback loop. Mark leads booked/lost → AI learns what converts per business type. *Metric: 20% conversion improvement in 3mo*
- [ ] `TODO` **Multi-language** — Hebrew only limits market. English + Arabic support. *Metric: 10% non-Hebrew clients*

---

## Cost Savings
> Not urgent — bot quality comes first. Tackle these when unit economics matter.

- [ ] `TODO` **Use Haiku for Voice DNA import** — `importVoiceDNA()` currently runs on Sonnet 4.5 (same as the bot). It's a one-time structured JSON extraction per tenant — Haiku handles this fine at ~5x cheaper. Add a model override param to `callOpenRouter()`. *Metric: Voice DNA cost per tenant drops from ~$0.15 to ~$0.03*
- [ ] `TODO` **Use Haiku for `analyzeVoice()`** — Same logic: one-time voice profile extraction, structured output. Doesn't need Sonnet-level reasoning. *Metric: Voice analysis cost cut ~5x*

---

## Backlog
> Future ideas — validated but not prioritized into a phase yet. Pull into a phase when the time is right.

- [x] `DONE` **Typing indicator on Instagram** — Send `typing_on` action while bot generates reply. User sees "typing..." bubble instead of dead silence.
- [ ] Voice input for teaching bot (Web Speech API)
- [ ] AI-generated knowledge base from business website
- [ ] Instagram story reply automation
- [ ] Comment-to-DM automation
- [ ] A/B testing bot conversation strategies
- [ ] Client mobile app (React Native)
- [ ] Zapier/Make integration
- [ ] Agency/white-label version
- [ ] Automatic appointment confirmation via IG
- [ ] WhatsApp helper bot — two-way WhatsApp bot for owners to manage their bot, give instructions, ask questions

---

## Inbox
> Raw ideas/user requests dumped here before we discuss and place them.

- **Update Meta webhook VERIFY_TOKEN** — Token was rotated (2026-03-09) for security. Update in Meta Developer Dashboard → Webhooks → Verify Token. Not urgent (only needed if Meta re-verifies subscription), but do it soon. New value is in `.env`.

---

## Killed Ideas
> Ideas we discussed and rejected. WHY matters — prevents revisiting.

(empty — add with reason when we kill something)
