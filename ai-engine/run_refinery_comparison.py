#!/usr/bin/env python3
"""Quick REFINERY comparison - skips health check, runs directly"""

import sys
import os

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import and run
from compare_projections import *

# Override health check
def quick_check():
    print("✓ Skipping health check, running comparison directly...")
    return True

# Run main with overridden check
if __name__ == "__main__":
    check_ai_engine_backup = check_ai_engine
    # Monkey patch
    import compare_projections
    compare_projections.check_ai_engine = quick_check

    main()
