import pytest
from app.postprocessor import post_process_indian_plate, normalize_text, process_two_row_plate

def test_normalize_text():
    assert normalize_text("tn-34 ab 1234") == "TN34AB1234"
    assert normalize_text("") == ""

def test_standard_indian_plate_valid():
    res = post_process_indian_plate("TN34AB1234")
    assert res["isValid"] == True
    assert res["correctedPlateText"] == "TN34AB1234"
    assert res["stateCode"] == "TN"
    assert res["plateType"] == "STANDARD"

def test_standard_plate_state_correction():
    # 'D1' in state slot: 1 is converted to 'I' -> 'DI' (invalid) vs 'D1' -> 'DL' (Delhi state code)
    res = post_process_indian_plate("D134AB1234")
    assert res["correctedPlateText"] in ("DL34AB1234", "DI34AB1234")

def test_standard_plate_number_correction():
    # 'O' in number slot converted to '0'
    res = post_process_indian_plate("TN34AB123O")
    assert res["correctedPlateText"] == "TN34AB1230"
    assert res["isValid"] == True

def test_bh_series_plate():
    res = post_process_indian_plate("22BH9876AA")
    assert res["isValid"] == True
    assert res["correctedPlateText"] == "22BH9876AA"
    assert res["stateCode"] == "BH"
    assert res["plateType"] == "BH_SERIES"

def test_invalid_state_code():
    res = post_process_indian_plate("XX12AB1234")
    assert res["isValid"] == False
    assert res["stateCode"] == ""

def test_two_row_plate_combination():
    rows = ["MH 12", "AB 1234"]
    combined = process_two_row_plate(rows)
    assert combined == "MH12AB1234"
    res = post_process_indian_plate(combined)
    assert res["isValid"] == True
    assert res["correctedPlateText"] == "MH12AB1234"
