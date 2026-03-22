import json
import os
import re
from typing import Any, Dict, List, Optional, Tuple

from services.openrouter_client import OpenRouterClient


class GenderAgent:
    """
    Gender classification agent that uses:
    1. Hebrew linguistic markers (verb conjugations, adjectives) for rule-based pre-classification
    2. LLM for ambiguous cases or confirmation
    3. Conversation history analysis for accumulated signals
    """
    
    # Hebrew feminine verb endings and words (נקבה - female speech patterns)
    FEMININE_MARKERS = {
        # Feminine verb conjugations (present tense - בינוני)
        "הולכת", "יודעת", "חושבת", "מרגישה", "אומרת",
        "שומעת", "לוקחת", "נותנת", "באה", "יוצאת", "נכנסת", "קוראת", "כותבת",
        "אוכלת", "שותה", "ישנה", "קמה", "יושבת", "עומדת", "רצה", "צוחקת",
        "שרה", "רוקדת", "משחקת", "לומדת", "עובדת", "נוסעת", "חוזרת",
        "מדברת", "שואלת", "מבינה", "זוכרת", "שוכחת", "מחפשת", "מוצאת",
        "מתחילה", "מסיימת", "ממשיכה", "מפסיקה", "מצליחה", "נכשלת",
        "מאמינה", "חוששת", "פוחדת", "אוהבת", "שונאת", "מעדיפה",
        "בוחרת", "מחליטה", "מסכימה", "מתנגדת", "מבקשת", "דורשת", "צריכה",
        "יכולה", "חייבת", "מעוניינת", "מתעניינת", "מתכננת", "מארגנת",
        "מכינה", "מבשלת", "מוכרת", "משלמת", "מקבלת", "שולחת",
        "מזמינה", "מגיעה", "עוזבת", "נשארת", "ממתינה", "נהנית", "סובלת",
        
        # Feminine adjectives (תארים בנקבה)
        "עייפה", "רעבה", "צמאה", "שמחה", "עצובה", "כועסת", "מאושרת", "מתוסכלת",
        "מבולבלת", "מופתעת", "מודאגת", "לחוצה", "רגועה", "עסוקה", "פנויה",
        "מוכנה", "בטוחה", "מסופקת", "מאוכזבת", "נרגשת", "מעוצבנת",
        "בריאה", "חזקה", "חלשה", "גבוהה", "נמוכה", "שמנה",
        "חכמה", "טיפשה", "זקנה", "צעירה", "חדשה", "ישנה", "טובה", "רעה",
        "גדולה", "קטנה", "ראשונה", "אחרונה", "יחידה", "ביישנית", "חברותית",
        "סקרנית", "זהירה", "אמיצה", "פחדנית", "אופטימית", "פסימית",
        
        # Explicit feminine self-references
        "אני בת", "אני אישה", "אני בחורה", "אני נערה", "אני גברת",
        "בתור אישה", "בתור בת", "בתור בחורה", "כאישה", "כבת", "כבחורה",
        
        # Feminine imperative addressed to speaker (suggesting they're female)
        "תבואי", "תעשי", "תגידי", "תראי", "תשמעי", "תלכי", "תקחי", "תתני",
        
        # Common feminine expressions
        "לא יודעת", "לא מבינה", "לא זוכרת", "לא יכולה", "לא צריכה",
        "אני מעוניינת", "אני מתעניינת", "אני מחפשת", "אני צריכה",
        "אני חושבת", "אני מרגישה", "אני מאמינה", "אני בטוחה",
    }
    
    # Hebrew masculine verb endings and words (זכר - male speech patterns)
    MASCULINE_MARKERS = {
        # Masculine verb conjugations (present tense - בינוני)
        "הולך", "יודע", "חושב", "מרגיש", "אומר",
        "שומע", "לוקח", "נותן", "בא", "יוצא", "נכנס", "קורא", "כותב",
        "אוכל", "שותה", "ישן", "קם", "יושב", "עומד", "רץ", "צוחק",
        "שר", "רוקד", "משחק", "לומד", "עובד", "נוסע", "חוזר",
        "מדבר", "שואל", "מבין", "זוכר", "שוכח", "מחפש", "מוצא",
        "מתחיל", "מסיים", "ממשיך", "מפסיק", "מצליח", "נכשל",
        "מאמין", "חושש", "פוחד", "אוהב", "שונא", "מעדיף",
        "בוחר", "מחליט", "מסכים", "מתנגד", "מבקש", "דורש", "צריך",
        "יכול", "חייב", "מעוניין", "מתעניין", "מתכנן", "מארגן",
        "מכין", "מבשל", "מוכר", "משלם", "מקבל", "שולח",
        "מזמין", "מגיע", "עוזב", "נשאר", "ממתין", "נהנה", "סובל",
        
        # Masculine adjectives (תארים בזכר)
        "עייף", "רעב", "צמא", "שמח", "עצוב", "כועס", "מאושר", "מתוסכל",
        "מבולבל", "מופתע", "מודאג", "לחוץ", "רגוע", "עסוק", "פנוי",
        "מוכן", "בטוח", "מסופק", "מאוכזב", "נרגש", "מעוצבן",
        "בריא", "חזק", "חלש", "גבוה", "נמוך", "שמן",
        "חכם", "טיפש", "זקן", "צעיר", "חדש", "ישן", "טוב", "רע",
        "גדול", "קטן", "ראשון", "אחרון", "יחיד", "ביישן", "חברותי",
        "סקרן", "זהיר", "אמיץ", "פחדן", "אופטימי", "פסימי",
        
        # Explicit masculine self-references
        "אני בן", "אני גבר", "אני בחור", "אני נער", "אני אדון",
        "בתור גבר", "בתור בן", "בתור בחור", "כגבר", "כבן", "כבחור",
        
        # Masculine imperative addressed to speaker (suggesting they're male)
        "תבוא", "תעשה", "תגיד", "תראה", "תשמע", "תלך", "תקח", "תתן",
        
        # Common masculine expressions
        "לא יודע", "לא מבין", "לא זוכר", "לא יכול", "לא צריך",
        "אני מעוניין", "אני מתעניין", "אני מחפש", "אני צריך",
        "אני חושב", "אני מרגיש", "אני מאמין", "אני בטוח",
    }
    
    # Words that are identical in both genders (to avoid false positives)
    GENDER_NEUTRAL_WORDS = {
        "רוצה", "עושה", "מקנה", "קונה", "מנסה", "מקווה", "מחכה", "מרוצה", "חולה", "רזה", "יפה", "לבד", "לא רוצה", "לא קונה", "לא מנסה", "לא מקווה", "לא מחכה", "לא מרוצה", "לא חולה", "לא רזה", "לא יפה", "לא לבד",   # Some words need context
    }

    # Hebrew 1st-person past (אני Xתי) is gender-neutral — never use for rules/LLM hints
    GENDER_NEUTRAL_FIRST_PERSON_PAST = frozenset({
        "הלכתי", "רציתי", "ידעתי", "חשבתי", "הרגשתי", "עשיתי", "אמרתי", "ראיתי",
        "ביקשתי", "שאלתי", "עניתי", "כתבתי", "שלחתי", "קניתי", "מכרתי",
    })

    def __init__(self, openrouter_client: OpenRouterClient):
        self.client = openrouter_client
        self.model = os.environ.get("AI_GENDER_MODEL", "anthropic/claude-haiku-4.5")
        self.temperature = float(os.environ.get("AI_GENDER_TEMPERATURE", "0.1"))
        self.threshold = float(os.environ.get("GENDER_CONFIDENCE_THRESHOLD", "0.7"))
        
        # Pre-compile regex patterns for efficient matching
        self._feminine_pattern = self._build_pattern(self.FEMININE_MARKERS)
        self._masculine_pattern = self._build_pattern(self.MASCULINE_MARKERS)
    
    def _build_pattern(self, words: set) -> re.Pattern:
        """Build a regex pattern that matches whole words from the set."""
        # Sort by length (longest first) to match longer phrases before shorter ones
        sorted_words = sorted(words, key=len, reverse=True)
        # Escape special regex characters and join with |
        escaped = [re.escape(word) for word in sorted_words]
        # Use word boundaries for single words, but allow phrases
        pattern = r'(?:^|[\s\.,!?\-:])(' + '|'.join(escaped) + r')(?:[\s\.,!?\-:]|$)'
        return re.compile(pattern, re.UNICODE | re.IGNORECASE)

    def _analyze_hebrew_markers(self, text: str) -> Tuple[int, int, List[str], List[str]]:
        """
        Analyze text for Hebrew gender markers.
        Returns: (feminine_count, masculine_count, feminine_signals, masculine_signals)
        """
        if not text:
            return 0, 0, [], []
        
        feminine_matches = set()
        masculine_matches = set()
        
        # Find all matches
        for match in self._feminine_pattern.finditer(text):
            w = match.group(1)
            if w in self.GENDER_NEUTRAL_FIRST_PERSON_PAST:
                continue
            feminine_matches.add(w)
        
        for match in self._masculine_pattern.finditer(text):
            w = match.group(1)
            if w in self.GENDER_NEUTRAL_FIRST_PERSON_PAST:
                continue
            masculine_matches.add(w)
        
        # Remove matches that appear in both (ambiguous words like "רוצה")
        # Only keep unique gender-specific markers
        common = feminine_matches & masculine_matches
        feminine_matches -= common
        masculine_matches -= common
        
        return (
            len(feminine_matches),
            len(masculine_matches),
            list(feminine_matches)[:5],  # Limit to 5 signals
            list(masculine_matches)[:5]
        )

    def _normalize_gender(self, value: Any) -> str:
        if value is None:
            return "unknown"
        v = str(value).strip().lower()

        if v in {"male", "m", "זכר", "בן", "גבר"}:
            return "male"
        if v in {"female", "f", "נקבה", "בת", "אישה", "אשה"}:
            return "female"
        return "unknown"

    def _extract_json(self, text: str) -> Optional[dict]:
        if not text:
            return None

        text = text.strip()
        start = text.find("{")
        end = text.rfind("}")
        if start == -1 or end == -1 or end <= start:
            return None

        try:
            data = json.loads(text[start:end + 1])
            return data if isinstance(data, dict) else None
        except Exception:
            return None
    
    def _analyze_all_messages(self, current_message: str, conversation_history: list) -> Dict[str, Any]:
        """
        Analyze all messages in conversation for gender markers.
        Returns aggregated analysis results.
        """
        total_feminine = 0
        total_masculine = 0
        all_feminine_signals = []
        all_masculine_signals = []
        
        # Analyze current message (with higher weight)
        f_count, m_count, f_signals, m_signals = self._analyze_hebrew_markers(current_message)
        total_feminine += f_count * 2  # Current message weighted 2x
        total_masculine += m_count * 2
        all_feminine_signals.extend(f_signals)
        all_masculine_signals.extend(m_signals)
        
        # Analyze conversation history (user messages only)
        for msg in (conversation_history or []):
            role = getattr(msg, "role", None) if not isinstance(msg, dict) else msg.get("role")
            content = getattr(msg, "content", None) if not isinstance(msg, dict) else msg.get("content")
            
            if role == "user" and content:
                f_count, m_count, f_signals, m_signals = self._analyze_hebrew_markers(content)
                total_feminine += f_count
                total_masculine += m_count
                all_feminine_signals.extend(f_signals)
                all_masculine_signals.extend(m_signals)
        
        # Deduplicate signals
        all_feminine_signals = list(set(all_feminine_signals))[:5]
        all_masculine_signals = list(set(all_masculine_signals))[:5]
        
        return {
            "feminine_count": total_feminine,
            "masculine_count": total_masculine,
            "feminine_signals": all_feminine_signals,
            "masculine_signals": all_masculine_signals,
        }

    async def classify_gender(
        self,
        *,
        current_message: str,
        conversation_history: list,
        sender_name: Optional[str] = None,
        instagram_username: Optional[str] = None,
        locale: str = "he-IL",
    ) -> Dict[str, Any]:
        """
        Classify gender using a hybrid approach:
        1. First, analyze Hebrew linguistic markers (rule-based)
        2. If clear signals exist, use rule-based result (faster, more accurate for Hebrew)
        3. If ambiguous, fall back to LLM classification
        """
        
        # Step 1: Rule-based analysis of Hebrew linguistic markers
        marker_analysis = self._analyze_all_messages(current_message, conversation_history)
        feminine_count = marker_analysis["feminine_count"]
        masculine_count = marker_analysis["masculine_count"]
        feminine_signals = marker_analysis["feminine_signals"]
        masculine_signals = marker_analysis["masculine_signals"]

        # Clear female signal: feminine markers dominate
        if feminine_count >= 2 and feminine_count > masculine_count * 2:
            confidence = min(0.95, 0.7 + (feminine_count - masculine_count) * 0.05)
            return {
                "gender": "female",
                "confidence": confidence,
                "signals": feminine_signals[:3] if feminine_signals else ["rule_based_feminine_markers"],
                "usage": None,  # No LLM call needed
                "threshold": self.threshold,
                "method": "rule_based",
                "marker_analysis": marker_analysis,
            }
        
        # Clear male signal: masculine markers dominate
        if masculine_count >= 2 and masculine_count > feminine_count * 2:
            confidence = min(0.95, 0.7 + (masculine_count - feminine_count) * 0.05)
            return {
                "gender": "male",
                "confidence": confidence,
                "signals": masculine_signals[:3] if masculine_signals else ["rule_based_masculine_markers"],
                "usage": None,  # No LLM call needed
                "threshold": self.threshold,
                "method": "rule_based",
                "marker_analysis": marker_analysis,
            }
        
        # Step 3: If rule-based is ambiguous, use LLM
        recent_user_messages = []
        for msg in (conversation_history or [])[-8:]:
            role = getattr(msg, "role", None) if not isinstance(msg, dict) else msg.get("role")
            content = getattr(msg, "content", None) if not isinstance(msg, dict) else msg.get("content")
            if role == "user" and content:
                recent_user_messages.append(content)

        # Enhanced system prompt with explicit Hebrew marker guidance
        system_prompt = """
אתה מסווג מגדר של הלקוח לפי הטקסט בלבד.

המטרה:
- לזהות אם הלקוח מדבר על עצמו בלשון זכר או נקבה.
- להשתמש בסימנים לשוניים חזקים.

## סימנים לנקבה (female):
- פעלים בלשון נקבה: הולכת, יודעת, חושבת, מרגישה, רוצה (כשמלווה בתואר נקבה), מתעניינת, מתכננת, מחפשת
- תארים בנקבה: עייפה, שמחה, מעוניינת, בטוחה, מוכנה
- ביטויים: "אני בת", "אני אישה", "לא יודעת", "אני מתעניינת", "אני חושבת ש..."

## סימנים לזכר (male):
- פעלים בלשון זכר: הולך, יודע, חושב, מרגיש, מתעניין, מתכנן, מחפש
- תארים בזכר: עייף, שמח, מעוניין, בטוח, מוכן
- ביטויים: "אני בן", "אני גבר", "לא יודע", "אני מתעניין", "אני חושב ש..."

כללים:
- אסור לסווג לפי עבר של גוף ראשון (רציתי, חשבתי, הלכתי, ידעתי וכו') — אלה ניטרליים בדרך כלל בעברית ואינם מעידים על מגדר הדובר.
- אם יש סימנים ברורים לנקבה (פעלים/תארים בנקבה בהווה, או ביטוי מפורש כמו "אני בת") — החזר female.
- אם יש סימנים ברורים לזכר (פעלים/תארים בזכר בהווה, או ביטוי מפורש כמו "אני בן") — החזר male.
- אל תנחש לפי שמות לא מוכרים.
- אם יש רק שם באנגלית בלי הקשר מגדרי — החזר "unknown".
- אם יש גם רמזים לזכר וגם רמזים לנקבה — החזר "unknown".
- אם אין ביטחון גבוה — עדיף unknown.
- תשיב JSON בלבד, בלי טקסט נוסף.

פורמט:
{
  "gender": "male" | "female" | "unknown",
  "confidence": 0.0-1.0,
  "signals": ["תיאור קצר של הסימנים המרכזיים בעברית"]
}
""".strip()

        # Include marker analysis in the prompt to help LLM
        marker_hint = ""
        if feminine_signals or masculine_signals:
            marker_hint = f"""

ניתוח מקדים של סימנים לשוניים:
- סימנים לנקבה שזוהו ({feminine_count}): {', '.join(feminine_signals) if feminine_signals else 'אין'}
- סימנים לזכר שזוהו ({masculine_count}): {', '.join(masculine_signals) if masculine_signals else 'אין'}
"""

        user_content = f"""
הודעות אחרונות של הלקוח:
{chr(10).join(recent_user_messages) if recent_user_messages else '(אין היסטוריה)'}

הודעה נוכחית:
{current_message}

פרופיל:
- name: {sender_name or 'לא ידוע'}
- username: {instagram_username or 'לא ידוע'}
- locale: {locale}
{marker_hint}
""".strip()

        result = await self.client.chat(
            model=self.model,
            temperature=self.temperature,
            max_tokens=250,
            title="SetterAI-Gender-Classifier",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
        )

        raw = (result.get("content") or "").strip()
        parsed = self._extract_json(raw)

        if not parsed:
            # Only use rule fallback when markers are as strong as rule_based branch (avoid weak guesses)
            if feminine_count >= 2 and feminine_count > masculine_count * 2:
                return {
                    "gender": "female",
                    "confidence": 0.55,
                    "signals": feminine_signals[:3] if feminine_signals else ["fallback_feminine_markers"],
                    "usage": result.get("usage"),
                    "threshold": self.threshold,
                    "method": "fallback_rule_based",
                    "marker_analysis": marker_analysis,
                }
            if masculine_count >= 2 and masculine_count > feminine_count * 2:
                return {
                    "gender": "male",
                    "confidence": 0.55,
                    "signals": masculine_signals[:3] if masculine_signals else ["fallback_masculine_markers"],
                    "usage": result.get("usage"),
                    "threshold": self.threshold,
                    "method": "fallback_rule_based",
                    "marker_analysis": marker_analysis,
                }

            return {
                "gender": "unknown",
                "confidence": 0.0,
                "signals": ["llm_failure"],
                "usage": result.get("usage"),
                "threshold": self.threshold,
                "method": "llm_failed",
            }

        gender = self._normalize_gender(parsed.get("gender"))
        try:
            confidence = float(parsed.get("confidence", 0.0))
        except Exception:
            confidence = 0.0

        confidence = max(0.0, min(1.0, confidence))
        signals = parsed.get("signals")
        if not isinstance(signals, list):
            signals = []

        # Boost confidence if LLM agrees with rule-based markers
        if gender == "female" and feminine_count > masculine_count:
            confidence = min(1.0, confidence + 0.1)
        elif gender == "male" and masculine_count > feminine_count:
            confidence = min(1.0, confidence + 0.1)

        if gender == "unknown":
            confidence = min(confidence, 0.3)

        return {
            "gender": gender,
            "confidence": confidence,
            "signals": signals[:3],
            "usage": result.get("usage"),
            "threshold": self.threshold,
            "method": "llm",
            "marker_analysis": marker_analysis,
        }
