#!/usr/bin/env python3
"""
Compare Standard vs Agentic Projections for REFINERY Sector

This script:
1. Fetches all REFINERY sector companies
2. Gets their latest filing data
3. Runs BOTH standard and agentic projections
4. Compares the results side-by-side
"""

import json
import time
import sys
from datetime import datetime
import httpx


# Companies
REFINERY_COMPANIES = [
    {"id": 106, "symbol": "ATRL", "name": "Attock Refinery Limited", "last_price": 910.01},
    {"id": 149, "symbol": "BYCO", "name": "Byco Petroleum Pakistan Limited", "last_price": 6.17},
    {"id": 163, "symbol": "CNERGY", "name": "Cnergyico PK Limited", "last_price": 8.22},
    {"id": 478, "symbol": "NRL", "name": "National Refinery Limited", "last_price": 374.49},
    {"id": 539, "symbol": "PRL", "name": "Pakistan Refinery Limited", "last_price": 35.97},
]

AI_ENGINE_URL = "http://localhost:8003"  # AI engine running on 8003
API_URL = "http://localhost:8000"  # Laravel API

def check_ai_engine():
    """Check if AI engine is running."""
    try:
        response = httpx.get(f"{AI_ENGINE_URL}/health", timeout=30)  # Increased timeout
        health = response.json()
        print(f"✓ AI Engine Status: {health['status']}")
        print(f"  Standard: {health['inference']}")
        print(f"  Agentic: {'Configured (' + health.get('agentic_engine', 'unknown') + ')' if health.get('agentic_configured') else 'NOT CONFIGURED'}")
        return health.get('agentic_configured', False)
    except Exception as e:
        print(f"✗ AI Engine not reachable: {e}")
        return False


def get_company_data(company_id):
    """Fetch company data including latest filing from Laravel API."""
    try:
        response = httpx.get(f"{API_URL}/api/companies/{company_id}", timeout=10)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"  ⚠️  Could not fetch company data: {e}")
    return None


def create_projection_payload(company, company_data):
    """Create payload for projection API."""
    # Get latest filing with AI analysis
    filings = company_data.get('filings', [])
    if not filings:
        return None

    latest_filing = None
    for filing in filings:
        if filing.get('ai_analysis') and filing.get('score'):
            latest_filing = filing
            break

    if not latest_filing:
        return None

    ai_analysis = latest_filing['ai_analysis']
    score_data = latest_filing['score']

    return {
        "company": company['name'],
        "symbol": company['symbol'],
        "quarter": latest_filing.get('quarter', 'Q1 FY2026'),
        "target_quarter": "Q2 FY2026",  # Next quarter
        "current_date": datetime.now().isoformat()[:10],
        "signals": ai_analysis.get('signals', {}),
        "score": score_data.get('score', 50),
        "flags": score_data.get('flags', []),
        "summary": ai_analysis.get('summary', ''),
        "current_price": float(company['last_price']),
        "macro_context": company_data.get('macro_risk', {}).get('summary') if company_data.get('macro_risk') else None
    }


def run_projection(payload, endpoint="/project"):
    """Run a projection (standard or agentic)."""
    try:
        timeout = 10 if endpoint == "/project" else 60
        response = httpx.post(
            f"{AI_ENGINE_URL}{endpoint}",
            json=payload,
            timeout=timeout
        )

        if response.status_code == 200:
            return response.json()
        else:
            return {"error": f"HTTP {response.status_code}: {response.text[:200]}"}
    except httpx.TimeoutException:
        return {"error": "Timeout"}
    except Exception as e:
        return {"error": str(e)}


def compare_projections(symbol, standard, agentic):
    """Compare two projections and show differences."""
    print(f"\n{'='*80}")
    print(f"  {symbol} - COMPARISON")
    print(f"{'='*80}")

    if 'error' in standard:
        print(f"  ✗ Standard: {standard['error']}")
    else:
        print(f"\n  📊 STANDARD PROJECTION (Fast, $0.01)")
        print(f"     Recommendation: {standard.get('recommendation', 'N/A')}")
        print(f"     Confidence: {standard.get('confidence', 'N/A')}")
        print(f"     Upside: {standard.get('target_upside_min_pct', '?')}% to {standard.get('target_upside_max_pct', '?')}%")
        print(f"     Revenue Growth: {standard.get('projected_revenue_growth_min', '?')}% to {standard.get('projected_revenue_growth_max', '?')}%")
        print(f"     Profit Growth: {standard.get('projected_profit_growth_min', '?')}% to {standard.get('projected_profit_growth_max', '?')}%")

    if 'error' in agentic:
        print(f"\n  ✗ Agentic: {agentic['error']}")
    else:
        print(f"\n  🤖 AGENTIC PROJECTION (Deep Research, $0.08)")
        print(f"     Recommendation: {agentic.get('recommendation', 'N/A')}")
        print(f"     Confidence: {agentic.get('confidence', 'N/A')}")
        print(f"     Upside: {agentic.get('target_upside_min_pct', '?')}% to {agentic.get('target_upside_max_pct', '?')}%")
        print(f"     Revenue Growth: {agentic.get('projected_revenue_growth_min', '?')}% to {agentic.get('projected_revenue_growth_max', '?')}%")
        print(f"     Profit Growth: {agentic.get('projected_profit_growth_min', '?')}% to {agentic.get('projected_profit_growth_max', '?')}%")

        metadata = agentic.get('metadata', {})
        print(f"\n     Agent Performance:")
        print(f"       • Rounds: {metadata.get('rounds_completed', 'N/A')}")
        print(f"       • Tool Calls: {metadata.get('tool_calls_made', 'N/A')}")

        if agentic.get('reasoning_summary'):
            print(f"\n     Reasoning Summary:")
            summary = agentic['reasoning_summary']
            if len(summary) > 200:
                print(f"       {summary[:200]}...")
            else:
                print(f"       {summary}")

        if agentic.get('tool_calls'):
            print(f"\n     Research Performed ({len(agentic['tool_calls'])} tools):")
            for i, call in enumerate(agentic['tool_calls'][:5], 1):
                print(f"       {i}. {call['tool']}: {call.get('reason', '')}")

    # Show key differences
    if 'error' not in standard and 'error' not in agentic:
        print(f"\n  📈 KEY DIFFERENCES:")

        if standard.get('recommendation') != agentic.get('recommendation'):
            print(f"     ⚠️  RECOMMENDATION CHANGED: {standard.get('recommendation')} → {agentic.get('recommendation')}")
        else:
            print(f"     ✓ Recommendation: Same ({standard.get('recommendation')})")

        if standard.get('confidence') != agentic.get('confidence'):
            print(f"     ⚠️  CONFIDENCE CHANGED: {standard.get('confidence')} → {agentic.get('confidence')}")
        else:
            print(f"     ✓ Confidence: Same ({standard.get('confidence')})")

        std_upside_mid = (standard.get('target_upside_min_pct', 0) + standard.get('target_upside_max_pct', 0)) / 2
        agent_upside_mid = (agentic.get('target_upside_min_pct', 0) + agentic.get('target_upside_max_pct', 0)) / 2
        diff = agent_upside_mid - std_upside_mid

        if abs(diff) > 2:
            print(f"     ⚠️  UPSIDE ADJUSTMENT: {diff:+.1f}% (more {'optimistic' if diff > 0 else 'conservative'})")
        else:
            print(f"     ✓ Upside: Similar (±{abs(diff):.1f}%)")


def main():
    print("\n" + "="*80)
    print("  REFINERY SECTOR: Standard vs Agentic Projection Comparison")
    print("="*80)

    # Check AI engine
    print("\n1. Checking AI Engine...")
    agentic_available = check_ai_engine()

    if not agentic_available:
        print("\n✗ Agentic projection not configured!")
        print("  Set ANTHROPIC_API_KEY in ai-engine/.env")
        print("  Run: echo 'ANTHROPIC_API_KEY=sk-ant-xxx' >> ai-engine/.env")
        sys.exit(1)

    print("\n2. Running Projections...")
    print(f"   Companies: {len(REFINERY_COMPANIES)}")
    print(f"   Endpoints: /project (standard) + /project-agentic")

    results = []

    for i, company in enumerate(REFINERY_COMPANIES, 1):
        print(f"\n{'─'*80}")
        print(f"   [{i}/{len(REFINERY_COMPANIES)}] {company['symbol']} - {company['name']}")
        print(f"{'─'*80}")

        # Get company data
        print(f"   Fetching data from API...")
        company_data = get_company_data(company['id'])

        if not company_data:
            print(f"   ✗ Could not fetch company data")
            continue

        # Create payload
        payload = create_projection_payload(company, company_data)

        if not payload:
            print(f"   ✗ No filing data available for projection")
            continue

        print(f"   ✓ Using filing: {payload['quarter']}")
        print(f"   ✓ Score: {payload['score']}/100")

        # Run standard projection
        print(f"\n   Running STANDARD projection... ", end='', flush=True)
        start = time.time()
        standard = run_projection(payload, "/project")
        std_time = time.time() - start
        print(f"Done ({std_time:.1f}s)")

        # Run agentic projection
        print(f"   Running AGENTIC projection (this may take 15-30s)... ", end='', flush=True)
        start = time.time()
        agentic = run_projection(payload, "/project-agentic")
        agent_time = time.time() - start
        print(f"Done ({agent_time:.1f}s)")

        # Store results
        results.append({
            'symbol': company['symbol'],
            'name': company['name'],
            'standard': standard,
            'agentic': agentic,
            'standard_time': std_time,
            'agentic_time': agent_time
        })

        # Compare
        compare_projections(company['symbol'], standard, agentic)

    # Final summary
    print(f"\n\n{'='*80}")
    print("  SUMMARY")
    print(f"{'='*80}")

    successful_standard = sum(1 for r in results if 'error' not in r['standard'])
    successful_agentic = sum(1 for r in results if 'error' not in r['agentic'])

    print(f"\n  Companies analyzed: {len(results)}")
    print(f"  Standard projections: {successful_standard}/{len(results)} successful")
    print(f"  Agentic projections: {successful_agentic}/{len(results)} successful")

    if successful_standard > 0:
        avg_std_time = sum(r['standard_time'] for r in results) / len(results)
        print(f"\n  Average Standard time: {avg_std_time:.1f}s")

    if successful_agentic > 0:
        avg_agent_time = sum(r['agentic_time'] for r in results) / len(results)
        avg_rounds = sum(r['agentic'].get('metadata', {}).get('rounds_completed', 0)
                        for r in results if 'error' not in r['agentic']) / successful_agentic
        avg_tools = sum(r['agentic'].get('metadata', {}).get('tool_calls_made', 0)
                       for r in results if 'error' not in r['agentic']) / successful_agentic

        print(f"  Average Agentic time: {avg_agent_time:.1f}s")
        print(f"  Average rounds: {avg_rounds:.1f}")
        print(f"  Average tool calls: {avg_tools:.1f}")

    # Recommendation changes
    rec_changes = sum(1 for r in results
                     if 'error' not in r['standard'] and 'error' not in r['agentic']
                     and r['standard'].get('recommendation') != r['agentic'].get('recommendation'))

    conf_changes = sum(1 for r in results
                      if 'error' not in r['standard'] and 'error' not in r['agentic']
                      and r['standard'].get('confidence') != r['agentic'].get('confidence'))

    print(f"\n  Recommendation changes: {rec_changes}/{successful_agentic}")
    print(f"  Confidence changes: {conf_changes}/{successful_agentic}")

    # Save results
    output_file = f"refinery_comparison_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    with open(output_file, 'w') as f:
        json.dump(results, f, indent=2)

    print(f"\n  📄 Full results saved to: {output_file}")

    print(f"\n{'='*80}")
    print("  ✓ Comparison Complete!")
    print(f"{'='*80}\n")


if __name__ == "__main__":
    main()
