#!/usr/bin/env python3
"""
Quick verification script to check if agentic system is properly set up.
Run this before attempting to use /project-agentic.
"""

import os
import sys
from pathlib import Path


def check_file(path: str, description: str) -> bool:
    """Check if a file exists."""
    if Path(path).exists():
        print(f"✓ {description}")
        return True
    else:
        print(f"✗ {description} - MISSING")
        return False


def check_env_var(var: str, description: str) -> bool:
    """Check if environment variable is set."""
    from dotenv import load_dotenv
    load_dotenv()

    value = os.getenv(var)
    if value and value != f"your_{var.lower()}_here":
        print(f"✓ {description}")
        return True
    else:
        print(f"✗ {description} - NOT SET")
        return False


def check_import(module: str, description: str) -> bool:
    """Check if module can be imported."""
    try:
        __import__(module)
        print(f"✓ {description}")
        return True
    except ImportError:
        print(f"✗ {description} - NOT INSTALLED")
        return False


def main():
    print("=" * 60)
    print("Agentic Projection System - Setup Verification")
    print("=" * 60)

    checks = []

    print("\n📁 Files:")
    checks.append(check_file("agentic_projection.py", "agentic_projection.py exists"))
    checks.append(check_file("AGENTIC_PROJECTION.md", "Documentation exists"))
    checks.append(check_file("test_agentic.py", "Test suite exists"))

    print("\n📦 Dependencies:")
    checks.append(check_import("anthropic", "anthropic SDK installed"))
    checks.append(check_import("ddgs", "ddgs (DuckDuckGo) installed"))
    checks.append(check_import("fastapi", "FastAPI installed"))

    print("\n🔑 Environment:")
    checks.append(check_env_var("GRADIENT_ACCESS_TOKEN", "GRADIENT_ACCESS_TOKEN set"))
    checks.append(check_env_var("ANTHROPIC_API_KEY", "ANTHROPIC_API_KEY set"))

    print("\n" + "=" * 60)

    passed = sum(checks)
    total = len(checks)

    if passed == total:
        print(f"✅ All checks passed ({passed}/{total})")
        print("\n✓ Agentic system is ready!")
        print("\nNext steps:")
        print("  1. Start AI engine: uvicorn main:app --reload")
        print("  2. Run tests: python test_agentic.py")
        print("  3. Check health: curl http://localhost:8001/health")
        return 0
    else:
        print(f"❌ {total - passed} check(s) failed ({passed}/{total} passed)")
        print("\nFixes:")

        if not Path("agentic_projection.py").exists():
            print("  - Agentic projection not implemented yet")

        try:
            __import__("anthropic")
        except ImportError:
            print("  - Install anthropic: pip install anthropic>=0.40.0")

        from dotenv import load_dotenv
        load_dotenv()

        if not os.getenv("ANTHROPIC_API_KEY") or os.getenv("ANTHROPIC_API_KEY") == "your_anthropic_api_key_here":
            print("  - Set ANTHROPIC_API_KEY in .env file")
            print("    Get key from: https://console.anthropic.com/")

        return 1


if __name__ == "__main__":
    sys.exit(main())
