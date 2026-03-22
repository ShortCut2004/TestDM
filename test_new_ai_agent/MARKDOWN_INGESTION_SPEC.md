# Markdown Ingestion Specification

This document defines the markdown format requirements for the knowledge base ingestion system.
Follow these conventions to ensure your business knowledge is correctly parsed, chunked, and retrievable.

## Overview

The system automatically splits uploaded markdown files into logical sections based on headings.
Each section is stored separately with metadata, enabling precise retrieval for different question types.

**You do NOT need to upload separate files for pricing, FAQ, services, etc.**
Upload a single well-structured markdown file and the system handles the separation automatically.

---

## Heading Hierarchy Rules

### Valid Heading Formats

```markdown
# Top-Level Section Title
## Second-Level Subsection
### Third-Level Detail
```

### Heading Level Behavior

| Level | Syntax | Behavior |
|-------|--------|----------|
| 1 | `# Heading` | Creates a new top-level section (separate document in vector store) |
| 2 | `## Heading` | Creates a subsection within the parent level-1 section |
| 3 | `### Heading` | Creates detail content within the parent level-2 section |

**Important:**
- Level 1 headings (`#`) define the main document splits
- Levels 2-3 are kept grouped with their parent section
- Each level-1 section becomes its own retrievable document

---

## Recommended Section Names

The system recognizes these section types and uses them for intelligent retrieval:

### Required Sections (Highly Recommended)

| Section Name | Hebrew Alternative | Purpose |
|--------------|-------------------|---------|
| `# Business Info` | `# מידע על העסק` | General business description, mission, values |
| `# Services` | `# שירותים` | What you offer, service descriptions |
| `# Pricing` | `# מחירון` | Prices, packages, rates |
| `# FAQ` | `# שאלות ותשובות` | Common questions with prepared answers |

### Optional Sections

| Section Name | Hebrew Alternative | Purpose |
|--------------|-------------------|---------|
| `# Response Examples` | `# דוגמאות תשובות` | Sample bot responses for specific scenarios |
| `# Policies` | `# מדיניות` | Cancellation, refunds, terms |
| `# Hours` | `# שעות פעילות` | Operating hours, availability |
| `# Contacts` | `# צור קשר` | Contact information, location |

---

## Valid vs Invalid Formats

### VALID Examples

```markdown
# Business Info
We are a fitness studio in Tel Aviv...

# Pricing
## Personal Training
- Single session: 250 NIS
- Package of 10: 2000 NIS

## Group Classes
- Monthly unlimited: 450 NIS

# FAQ
## How much does personal training cost?
Our first introductory session is free! After that, pricing starts at 250 NIS per session.

## What should I bring?
Comfortable workout clothes and a water bottle.

# Services
## Personal Training
One-on-one sessions tailored to your goals...

## Group Fitness
High-energy classes including HIIT, yoga, and spin...
```

### INVALID Examples

```markdown
Business Info                    <!-- Missing # prefix -->

#Business Info                   <!-- Missing space after # -->

# business info                  <!-- OK but prefer Title Case -->

###### Deep Heading              <!-- Too many levels, use max ### -->

**Business Info**                <!-- Bold is not a heading -->

- Business Info                  <!-- List item is not a heading -->
```

---

## FAQ Section Best Practices

The FAQ section gets priority in retrieval for question-like queries.
Structure it as question-answer pairs:

### Recommended FAQ Format

```markdown
# FAQ

## How much does [service] cost?
[Direct answer with pricing info]

## Do you offer discounts?
[Answer about discounts, packages, promotions]

## What is your cancellation policy?
[Clear policy explanation]

## Where are you located?
[Address and directions]
```

### Why This Matters

When a user asks "כמה עולה אימון?" (How much is training?), the system:
1. Detects this is a pricing question
2. Prioritizes FAQ and Pricing sections in search
3. Returns the most relevant prepared answer
4. Avoids flooding context with unrelated information

---

## Response Examples Section

Use this section to provide example responses the bot should use:

```markdown
# Response Examples

## Greeting Response
היי! מה נשמע? איך אפשר לעזור לך היום?

## Price Inquiry Response
אימון היכרות ראשון הוא בחינם! אחרי זה יש לנו מגוון חבילות. רוצה לשמוע?

## Booking Confirmation Response
מעולה! קבעתי לך אימון ל[תאריך]. נתראה!
```

---

## Metadata Generated

When you upload a markdown file, each section gets this metadata:

```json
{
  "client_id": "your-business-id",
  "namespace": "your-business-id",
  "source_file": "business_knowledge.md",
  "upload_id": "abc123xyz",
  "section_title": "Pricing",
  "section_type": "pricing",
  "heading_level": 1,
  "parent_section": "",
  "chunk_index": 0
}
```

This metadata enables:
- Filtering by section type (e.g., only search FAQ)
- Prioritizing specific sections for certain queries
- Tracking which file each chunk came from
- Maintaining parent-child relationships

---

## Complete Example File

```markdown
# Business Info

FitLife Studio is a boutique fitness center in central Tel Aviv.
We specialize in personal training and small group classes.

## Our Mission
Help everyone find their path to a healthier lifestyle.

## Our Team
- Yoni - Head Trainer (10 years experience)
- Maya - Yoga & Pilates Instructor
- Dan - HIIT & Strength Coach

# Services

## Personal Training
One-on-one sessions customized to your fitness goals.
Sessions are 60 minutes and include a personalized workout plan.

## Group Classes
- HIIT (Mon/Wed/Fri 7:00, 18:00)
- Yoga (Tue/Thu 8:00, 19:00)
- Spin (Daily 6:00, 17:00)

## Nutrition Counseling
Work with our certified nutritionist for meal planning.

# Pricing

## Personal Training
| Package | Price | Per Session |
|---------|-------|-------------|
| Single | 250 NIS | 250 NIS |
| 10 Pack | 2,000 NIS | 200 NIS |
| 20 Pack | 3,600 NIS | 180 NIS |

## Group Classes
- Drop-in: 50 NIS
- Monthly unlimited: 450 NIS
- Annual: 4,500 NIS

# FAQ

## How much does the first session cost?
The first introductory session is FREE! No commitment required.

## Can I freeze my membership?
Yes, you can freeze up to 30 days per year with advance notice.

## What should I bring to class?
Comfortable workout clothes, a towel, and a water bottle. We provide mats.

## Do you have parking?
Yes, free parking is available in the building's underground lot.

# Policies

## Cancellation Policy
Cancel at least 24 hours before your session to avoid charges.
Late cancellations are charged 50% of the session fee.

## Refund Policy
Unused sessions from packages can be refunded within 6 months of purchase.

# Hours

## Regular Hours
- Sunday-Thursday: 6:00-22:00
- Friday: 6:00-14:00
- Saturday: Closed

## Holiday Hours
Check our Instagram @fitlife_tlv for holiday schedule updates.

# Contact

## Location
123 Dizengoff Street, Tel Aviv
(Enter from the side street, 2nd floor)

## Contact Info
- Phone: 03-123-4567
- WhatsApp: 054-123-4567
- Email: info@fitlife.co.il
- Instagram: @fitlife_tlv
```

---

## Backward Compatibility

If you have existing markdown files without proper section headings:
- The system will still ingest them correctly
- Content before the first heading becomes an "Introduction" section
- Large blocks without headings are split by paragraphs
- You can re-upload with proper headings anytime to improve retrieval

---

## Tips for Best Results

1. **Use clear, descriptive headings** - "Pricing" is better than "Costs and Fees"
2. **Put the most important info in FAQ** - Direct questions get priority
3. **Keep sections focused** - One topic per level-1 heading
4. **Use Hebrew headings for Hebrew content** - Detection works in both languages
5. **Include example responses** - Helps the bot match your brand voice
6. **Update regularly** - Re-upload when prices or info changes
