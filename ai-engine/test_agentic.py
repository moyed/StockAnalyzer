#!/usr/bin/env python3
"""
Test script for Agentic Projection System

This script tests the /project-agentic endpoint with sample data
and displays the results including the reasoning chain.

Usage:
    python test_agentic.py
"""

import requests
import json
import sys
from datetime import date


# Test data - sample PSX company
TEST_PROJECTION = {
    "company": "Lucky Cement Limited",
    "symbol": "LUCK",
    "quarter": "Q3 FY2026",
    "target_quarter": "Q4 FY2026",
    "current_date": date.today().isoformat(),
    "signals": {
        "revenue_growth_pct": 35,
        "profit_growth_pct": 45,
        "gross_margin_direction": "up",
        "gross_margin_reason": "Better pricing power and operational efficiency",
        "exports_milestone": "Exported to Afghanistan market, 15% of revenue",
        "new_projects": "New grinding unit in Hub, Balochistan - 2M tons capacity",
        "exchange_gain_loss_pkr_million": -50,
        "defaulter_status_change": None,
        "management_tone": "positive"
    },
    "score": 78,
    "flags": ["HIGH_PROFIT_GROWTH", "HIGH_REVENUE_GROWTH", "NEW_PROJECT", "EXPORT_EXPANSION"],
    "summary": "Lucky Cement posted exceptional Q3 results with 45% profit growth driven by strong demand from infrastructure projects and export expansion to Afghanistan. New grinding unit will add 2M tons capacity.",
    "current_price": 850.50,
    "macro_context": "Pakistan construction sector showing resilience with CPEC Phase-II projects picking up. PKR relatively stable, SBP policy rate at 15%. Cement sector benefiting from infrastructure push."
}


def test_health():
    """Test health endpoint to verify agentic is available."""
    print("=" * 60)
    print("TESTING: Health Check")
    print("=" * 60)

    try:
        response = requests.get("http://localhost:8001/health", timeout=10)
        response.raise_for_status()
        health = response.json()

        print(f"API Status: {health['status']}")
        print(f"Gradient Configured: {health['gradient_configured']}")
        print(f"Standard Inference: {health['inference']}")
        print(f"Agentic Available: {health['agentic_available']}")
        print(f"Agentic Configured: {health['agentic_configured']}")

        if not health.get('agentic_configured'):
            print("\n❌ ERROR: Agentic projection not configured!")
            print("   Set ANTHROPIC_API_KEY in .env file")
            return False

        print("\n✓ All systems ready for agentic projection")
        return True

    except requests.exceptions.RequestException as e:
        print(f"❌ ERROR: Could not reach AI engine: {e}")
        print("   Make sure the AI engine is running on port 8001")
        return False


def test_agentic_projection():
    """Test the agentic projection endpoint."""
    print("\n" + "=" * 60)
    print("TESTING: Agentic Projection")
    print("=" * 60)
    print(f"Company: {TEST_PROJECTION['company']} ({TEST_PROJECTION['symbol']})")
    print(f"Source Quarter: {TEST_PROJECTION['quarter']}")
    print(f"Target Quarter: {TEST_PROJECTION['target_quarter']}")
    print(f"Score: {TEST_PROJECTION['score']}/100")
    print(f"Flags: {', '.join(TEST_PROJECTION['flags'])}")
    print("\nStarting agentic research (this may take 15-30 seconds)...")

    try:
        response = requests.post(
            "http://localhost:8001/project-agentic",
            json=TEST_PROJECTION,
            timeout=60  # Agentic takes longer
        )
        response.raise_for_status()
        result = response.json()

        print("\n" + "=" * 60)
        print("RESULTS")
        print("=" * 60)

        # Core projection
        print(f"\n📊 RECOMMENDATION: {result['recommendation']}")
        print(f"   Confidence: {result['confidence']}")
        print(f"   Target Upside: {result['target_upside_min_pct']}% to {result['target_upside_max_pct']}%")

        print(f"\n📈 GROWTH PROJECTIONS:")
        print(f"   Revenue: {result['projected_revenue_growth_min']}% to {result['projected_revenue_growth_max']}%")
        print(f"   Profit: {result['projected_profit_growth_min']}% to {result['projected_profit_growth_max']}%")

        print(f"\n💡 OUTLOOK:")
        print(f"   {result['next_quarter_outlook']}")

        print(f"\n✅ KEY CATALYSTS:")
        for catalyst in result['key_catalysts']:
            print(f"   • {catalyst}")

        print(f"\n⚠️  KEY RISKS:")
        for risk in result['key_risks']:
            print(f"   • {risk}")

        # Metadata
        metadata = result.get('metadata', {})
        print(f"\n🤖 AGENT PERFORMANCE:")
        print(f"   Rounds: {metadata.get('rounds_completed', 'N/A')}")
        print(f"   Tool Calls: {metadata.get('tool_calls_made', 'N/A')}")
        print(f"   Model: {metadata.get('model', 'N/A')}")

        # Tool calls made
        print(f"\n🔧 RESEARCH PERFORMED:")
        tool_calls = result.get('tool_calls', [])
        for i, call in enumerate(tool_calls, 1):
            print(f"   {i}. {call['tool']}: {call.get('reason', 'No reason given')}")

        # Reasoning chain
        print(f"\n🧠 REASONING CHAIN:")
        reasoning = result.get('reasoning_chain', [])
        for step in reasoning[:3]:  # Show first 3 rounds
            print(f"\n   Round {step['round']}:")
            summary = step['summary'][:200] + "..." if len(step['summary']) > 200 else step['summary']
            print(f"   {summary}")

        if len(reasoning) > 3:
            print(f"\n   ... (showing 3 of {len(reasoning)} rounds)")

        # Evidence trail
        evidence = result.get('evidence_trail', [])
        print(f"\n📚 EVIDENCE TRAIL:")
        print(f"   {len(evidence)} searches performed")
        for i, ev in enumerate(evidence[:3], 1):
            print(f"\n   Search {i}:")
            print(f"   Query: {ev.get('query', 'N/A')}")
            print(f"   Reason: {ev.get('reason', 'N/A')}")
            print(f"   Results: {ev.get('results_count', 0)} found")

        print("\n" + "=" * 60)
        print("✓ Agentic projection completed successfully!")
        print("=" * 60)

        # Save full results to file
        with open('test_agentic_results.json', 'w') as f:
            json.dump(result, f, indent=2)
        print("\n📄 Full results saved to: test_agentic_results.json")

        return True

    except requests.exceptions.Timeout:
        print("\n❌ ERROR: Request timed out (>60 seconds)")
        print("   Agentic projection is taking longer than expected")
        return False

    except requests.exceptions.HTTPError as e:
        print(f"\n❌ ERROR: HTTP {e.response.status_code}")
        try:
            error = e.response.json()
            print(f"   {error.get('detail', 'Unknown error')}")
        except:
            print(f"   {e.response.text}")
        return False

    except requests.exceptions.RequestException as e:
        print(f"\n❌ ERROR: Request failed: {e}")
        return False


def compare_with_standard():
    """Compare agentic with standard projection."""
    print("\n" + "=" * 60)
    print("BONUS: Comparing with Standard Projection")
    print("=" * 60)

    try:
        response = requests.post(
            "http://localhost:8001/project",
            json=TEST_PROJECTION,
            timeout=10
        )
        response.raise_for_status()
        standard = response.json()

        print("\n📊 STANDARD PROJECTION:")
        print(f"   Recommendation: {standard['recommendation']}")
        print(f"   Confidence: {standard['confidence']}")
        print(f"   Upside: {standard['target_upside_min_pct']}% to {standard['target_upside_max_pct']}%")
        print(f"   (No evidence trail, no reasoning chain)")

        print("\n💡 Key Difference:")
        print("   Standard = Fast (2s), cheap ($0.01), no research")
        print("   Agentic = Thorough (15-30s), moderate cost ($0.05-0.15), full research")

    except Exception as e:
        print(f"\n⚠️  Could not fetch standard projection: {e}")


def main():
    """Run all tests."""
    print("\n🚀 StockAnalyzer - Agentic Projection Test Suite")
    print("=" * 60)

    # Test 1: Health check
    if not test_health():
        print("\n❌ Health check failed. Cannot proceed with tests.")
        sys.exit(1)

    # Test 2: Agentic projection
    input("\nPress Enter to start agentic projection test...")
    if not test_agentic_projection():
        print("\n❌ Agentic projection test failed.")
        sys.exit(1)

    # Test 3: Compare with standard
    input("\nPress Enter to compare with standard projection...")
    compare_with_standard()

    print("\n" + "=" * 60)
    print("✓ All tests completed!")
    print("=" * 60)
    print("\nNext steps:")
    print("1. Review test_agentic_results.json for full output")
    print("2. Try with different companies in your database")
    print("3. Integrate /project-agentic into your Laravel API")
    print("4. See AGENTIC_PROJECTION.md for integration guide")


if __name__ == "__main__":
    main()
