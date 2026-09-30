const { correctIndianPlate, ocrLevenshteinDistance } = require('../src/utils/indianPlateValidator');

function runUnitTests() {
  console.log('==============================================');
  console.log('   NetraTrack Automated System Unit Tests     ');
  console.log('==============================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName) {
    if (condition) {
      console.log(`  [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${testName}`);
      failed++;
    }
  }

  // Test 1: Indian Standard Plate Post-Processing
  const test1 = correctIndianPlate('TN37AB1234');
  assert(test1.corrected === 'TN37AB1234' && test1.isValid === true, 'Standard Indian Plate Validation (TN37AB1234)');

  // Test 2: Position-Aware Character Repair (Digit to Letter in State Slot)
  const test2 = correctIndianPlate('7N37AB1234');
  assert(test2.corrected === 'TN37AB1234', 'State Slot Repair (7N -> TN)');

  // Test 3: Position-Aware Character Repair (Letter to Digit in Number Slot)
  const test3 = correctIndianPlate('TN37AB123O');
  assert(test3.corrected === 'TN37AB1230', 'Number Slot Repair (123O -> 1230)');

  // Test 4: BH Series Validation
  const test4 = correctIndianPlate('22BH9876AA');
  assert(test4.isValid === true, 'BH-Series Plate Validation (22BH9876AA)');

  // Test 5: OCR-Aware Levenshtein Distance (O vs 0 confusable swap cost)
  const dist1 = ocrLevenshteinDistance('TN37AB123O', 'TN37AB1230');
  assert(dist1 <= 0.5, 'OCR Confusion Cost (O/0 swap distance <= 0.5)');

  // Test 6: Distance for completely different plates
  const dist2 = ocrLevenshteinDistance('TN37AB1234', 'TN38XY9999');
  assert(dist2 > 2.0, 'Different Plates Distance');

  console.log(`\nResults: ${passed} passed, ${failed} failed.`);
  if (failed > 0) process.exit(1);
}

runUnitTests();
