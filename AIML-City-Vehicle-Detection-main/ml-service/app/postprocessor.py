import re
import os
import json
from typing import Dict, Any, List, Tuple, Optional

RULES_FILE = os.path.normpath(os.path.join(os.path.dirname(__file__), "../../../data/indian_plate_rules.json"))

INDIAN_STATE_CODES = {
    'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN',
    'GA', 'GJ', 'HR', 'HP', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
    'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ',
    'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB'
}

# Strict slot-wise conversion dictionaries
DIGIT_TO_LETTER = {
    '0': 'O', '1': 'I', '2': 'Z', '3': 'E', '4': 'A', '5': 'S', '6': 'G', '7': 'T', '8': 'B', '9': 'P'
}

LETTER_TO_DIGIT = {
    'O': '0', 'I': '1', 'Z': '2', 'E': '3', 'A': '4', 'S': '5', 'G': '6', 'T': '7', 'B': '8', 'P': '9', 'D': '0', 'Q': '0'
}

STANDARD_PLATE_REGEX = re.compile(r'^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$')
BH_PLATE_REGEX = re.compile(r'^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$')

if os.path.exists(RULES_FILE):
    try:
        with open(RULES_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            if "stateCodes" in data:
                INDIAN_STATE_CODES = set(data["stateCodes"])
    except Exception as e:
        pass


def normalize_text(text: str) -> str:
    """Strip whitespace and non-alphanumeric characters, convert to uppercase."""
    if not text:
        return ""
    return re.sub(r'[^A-Z0-9]', '', str(text).upper()).strip()


def process_two_row_plate(rows: List[str]) -> str:
    """Combines top and bottom text lines of a 2-row Indian license plate."""
    if not rows:
        return ""
    if len(rows) == 1:
        return normalize_text(rows[0])
    top = normalize_text(rows[0])
    bottom = normalize_text(rows[1])
    return top + bottom


def force_slot_letters(segment: str) -> str:
    """Grammar constraint: Force all characters in a letter slot to be valid A-Z uppercase letters."""
    res = []
    for c in segment:
        if c.isdigit():
            res.append(DIGIT_TO_LETTER.get(c, 'A'))
        else:
            res.append(c)
    return "".join(res)


def force_slot_digits(segment: str) -> str:
    """Grammar constraint: Force all characters in a digit slot to be valid 0-9 digits."""
    res = []
    for c in segment:
        if c.isalpha():
            res.append(LETTER_TO_DIGIT.get(c, '0'))
        else:
            res.append(c)
    return "".join(res)


def try_bh_parse(clean: str) -> Optional[Dict[str, Any]]:
    """Grammar-constrained BH Series parser: 2 digits + BH + 4 digits + 1-2 letters."""
    candidates_to_try = [clean]
    if len(clean) > 9:
        candidates_to_try.append(clean[1:])
        candidates_to_try.append(clean[:-1])
    if len(clean) > 10:
        candidates_to_try.append(clean[1:-1])

    for text in candidates_to_try:
        if len(text) not in (9, 10):
            continue
        yy = force_slot_digits(text[:2])
        bh = force_slot_letters(text[2:4])
        seq = force_slot_digits(text[4:8])
        series = force_slot_letters(text[8:])

        cand = f"{yy}{bh}{seq}{series}"
        if BH_PLATE_REGEX.match(cand):
            return {
                "corrected": cand,
                "isValid": True,
                "stateCode": "BH",
                "plateType": "BH_SERIES"
            }
    return None


def _parse_candidate_splits(clean_str: str) -> Optional[Tuple[str, str, bool, bool, int]]:
    """Slot-wise Grammar-Constrained parsing:
    State (2 letters) | District (1-2 digits) | Series (1-3 letters) | Number (4 digits)
    """
    L = len(clean_str)
    if not (8 <= L <= 11):
        return None

    best_candidate = None
    highest_score = -1

    middle = clean_str[2:-4]
    mid_len = len(middle)

    for d_len in (1, 2):
        s_len = mid_len - d_len
        if 1 <= s_len <= 3:
            # Enforce grammar slot constraints strictly
            state_part = force_slot_letters(clean_str[:2])
            dist_part = force_slot_digits(middle[:d_len])
            series_part = force_slot_letters(middle[d_len:])
            num_part = force_slot_digits(clean_str[-4:])

            cand = f"{state_part}{dist_part}{series_part}{num_part}"

            is_valid_state = state_part in INDIAN_STATE_CODES
            is_regex_match = bool(STANDARD_PLATE_REGEX.match(cand))

            score = 0
            if is_valid_state:
                score += 60
            if is_regex_match:
                score += 40

            mutations = sum(1 for a, b in zip(clean_str, cand) if a != b)
            score -= mutations * 2

            if score > highest_score:
                highest_score = score
                best_candidate = (cand, state_part, is_valid_state, is_regex_match, highest_score)

    return best_candidate


def post_process_indian_plate(raw_text: str) -> Dict[str, Any]:
    clean = normalize_text(raw_text)
    if not clean or len(clean) < 7:
        return {
            "rawPlateText": raw_text,
            "correctedPlateText": clean,
            "isValid": False,
            "stateCode": "",
            "plateType": "INVALID"
        }

    # 1. BH Series Grammar Check
    bh_res = try_bh_parse(clean)
    if bh_res:
        return {
            "rawPlateText": raw_text,
            "correctedPlateText": bh_res["corrected"],
            "isValid": True,
            "stateCode": "BH",
            "plateType": "BH_SERIES"
        }

    # 2. Candidate Splits with Grammar Slot Constraints
    variants_to_test = [clean]
    if len(clean) > 8:
        variants_to_test.append(clean[1:])
        variants_to_test.append(clean[:-1])
    if len(clean) > 9:
        variants_to_test.append(clean[1:-1])

    best_global = None
    best_global_score = -1

    for var in variants_to_test:
        res = _parse_candidate_splits(var)
        if res:
            cand, state_code, is_valid_state, is_regex_match, score = res
            if is_valid_state and is_regex_match:
                score += 50
            if score > best_global_score:
                best_global_score = score
                best_global = (cand, state_code, is_valid_state, is_regex_match)

    if best_global and best_global_score >= 80:
        cand, state_code, is_valid_state, is_regex_match = best_global
        return {
            "rawPlateText": raw_text,
            "correctedPlateText": cand,
            "isValid": is_valid_state and is_regex_match,
            "stateCode": state_code if is_valid_state else "",
            "plateType": "STANDARD"
        }

    # Fallback grammar slot enforcement
    state_code = force_slot_letters(clean[:2])
    num_part = force_slot_digits(clean[-4:]) if len(clean) >= 6 else ""
    mid_part = clean[2:-4] if len(clean) >= 6 else clean[2:]

    corrected = f"{state_code}{mid_part}{num_part}"
    is_valid_state = state_code in INDIAN_STATE_CODES
    is_valid_format = bool(STANDARD_PLATE_REGEX.match(corrected) or BH_PLATE_REGEX.match(corrected))

    return {
        "rawPlateText": raw_text,
        "correctedPlateText": corrected,
        "isValid": is_valid_state and is_valid_format,
        "stateCode": state_code if is_valid_state else "",
        "plateType": "STANDARD" if is_valid_format else "UNKNOWN"
    }
