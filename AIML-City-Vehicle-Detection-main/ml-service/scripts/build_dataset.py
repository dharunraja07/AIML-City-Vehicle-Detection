import sys
import os

sys.path.insert(0, os.path.normpath(os.path.join(os.path.dirname(__file__), "../..")))
from scripts.build_dataset import build_dataset

if __name__ == "__main__":
    build_dataset(target_plates=2400)
