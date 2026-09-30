const fs = require('fs');
const path = require('path');

let rulesData = null;
try {
  const rulesPath = path.join(__dirname, '../../../data/indian_plate_rules.json');
  if (fs.existsSync(rulesPath)) {
    rulesData = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
  }
} catch (e) {
  // Fallback to default constants if file read fails
}

const INDIAN_STATE_CODES = new Set(
  rulesData?.stateCodes || [
    'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN',
    'GA', 'GJ', 'HR', 'HP', 'JH', 'JK', 'KA', 'KL', 'LA', 'LD',
    'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ',
    'SK', 'TN', 'TR', 'TS', 'UK', 'UP', 'WB'
  ]
);

const DIGIT_TO_LETTER = rulesData?.digitToLetter || {
  '0': 'O',
  '1': 'I',
  '2': 'Z',
  '5': 'S',
  '6': 'G',
  '7': 'T',
  '8': 'B'
};

const LETTER_TO_DIGIT = rulesData?.letterToDigit || {
  'O': '0',
  'I': '1',
  'Z': '2',
  'S': '5',
  'G': '6',
  'T': '7',
  'B': '8',
  'D': '0',
  'Q': '0'
};

const STANDARD_PLATE_REGEX = new RegExp(rulesData?.standardRegex || '^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$');
const BH_PLATE_REGEX = new RegExp(rulesData?.bhRegex || '^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$');

function normalizePlateText(rawText) {
  if (!rawText) return '';
  return rawText.toUpperCase().replace(/[^A-Z0-9]/g, '').trim();
}

function correctIndianPlate(rawText) {
  const clean = normalizePlateText(rawText);
  if (!clean || clean.length < 7) return { corrected: clean, isValid: false };

  if (BH_PLATE_REGEX.test(clean)) {
    return { corrected: clean, isValid: true };
  }

  let chars = clean.split('');

  // 1. First 2 characters must be State Code (Letters)
  for (let i = 0; i < 2; i++) {
    if (DIGIT_TO_LETTER[chars[i]]) {
      chars[i] = DIGIT_TO_LETTER[chars[i]];
    }
  }

  const stateCode = chars.slice(0, 2).join('');
  const isValidState = INDIAN_STATE_CODES.has(stateCode);

  // 2. Last 4 characters must be Digits
  for (let i = chars.length - 4; i < chars.length; i++) {
    if (LETTER_TO_DIGIT[chars[i]]) {
      chars[i] = LETTER_TO_DIGIT[chars[i]];
    }
  }

  const corrected = chars.join('');
  const isValidFormat = STANDARD_PLATE_REGEX.test(corrected) || BH_PLATE_REGEX.test(corrected);
  const isValid = isValidState && isValidFormat;

  return {
    corrected,
    isValid
  };
}

function ocrLevenshteinDistance(str1, str2) {
  const s1 = normalizePlateText(str1);
  const s2 = normalizePlateText(str2);
  if (s1 === s2) return 0;

  const m = s1.length;
  const n = s2.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const char1 = s1[i - 1];
      const char2 = s2[j - 1];

      let cost = 1;
      if (char1 === char2) {
        cost = 0;
      } else if (
        (DIGIT_TO_LETTER[char1] === char2 || LETTER_TO_DIGIT[char1] === char2) ||
        (DIGIT_TO_LETTER[char2] === char1 || LETTER_TO_DIGIT[char2] === char1)
      ) {
        cost = 0.5;
      }

      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[m][n];
}

module.exports = {
  INDIAN_STATE_CODES,
  DIGIT_TO_LETTER,
  LETTER_TO_DIGIT,
  STANDARD_PLATE_REGEX,
  BH_PLATE_REGEX,
  normalizePlateText,
  correctIndianPlate,
  ocrLevenshteinDistance
};
