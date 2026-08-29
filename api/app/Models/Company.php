<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;

class Company extends Model
{
    protected $fillable = [
        'symbol', 'name', 'sector', 'exchange_type', 'is_defaulter', 'is_sharia_compliant',
        'is_active', 'last_price', 'price_updated_at', 'pe_ratio', 'pe_updated_at', 'last_scanned_at',
    ];

    protected static function booted(): void
    {
        // Exclude delisted companies from every query unless explicitly opted out with ->withInactive()
        static::addGlobalScope('active', fn (Builder $q) => $q->where('companies.is_active', true));
    }

    public function scopeWithInactive(Builder $query): Builder
    {
        return $query->withoutGlobalScope('active');
    }

    // Normalise sector to uppercase on every write so mixed-case PSX scrape
    // results (e.g. "Fertilizer" vs "FERTILIZER") never create duplicate rows.
    public function setSectorAttribute(?string $value): void
    {
        $this->attributes['sector'] = $value !== null ? strtoupper(trim($value)) : null;
    }

    protected $casts = [
        'is_defaulter'         => 'boolean',
        'is_sharia_compliant'  => 'boolean',
        'is_active'            => 'boolean',
        'last_price'           => 'decimal:2',
        'price_updated_at'     => 'datetime',
        'pe_ratio'             => 'decimal:2',
        'pe_updated_at'        => 'datetime',
        'last_scanned_at'      => 'datetime',
        'volume_analysis'      => 'array',
        'movement_explanation' => 'array',
    ];

    public function filings()
    {
        return $this->hasMany(Filing::class);
    }

    public function latestFiling()
    {
        return $this->hasOne(Filing::class)->latestOfMany('filing_date');
    }

    public function watchlists()
    {
        return $this->hasMany(Watchlist::class);
    }

    public function macroRisk()
    {
        return $this->hasOne(MacroRisk::class);
    }

    public function indexMemberships()
    {
        return $this->hasMany(IndexMembership::class);
    }

    /**
     * Calculate P/E ratio from latest filing's EPS and current price.
     * Returns null if either EPS or price is missing/invalid.
     */
    public function getPeRatioAttribute(): ?float
    {
        $price = (float) ($this->last_price ?? 0);
        if ($price <= 0) return null;

        $latestFiling = $this->latestFiling ?? $this->filings()->orderByDesc('filing_date')->first();
        $eps = (float) ($latestFiling?->eps ?? 0);

        if ($eps <= 0) return null;

        return round($price / $eps, 2);
    }
}
