<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NewsArticle extends Model
{
    protected $fillable = [
        'headline',
        'body',
        'source',
        'url',
        'published_at',
        'sentiment',
        'impact',
        'mentioned_symbols',
        'category',
        'ai_summary',
    ];

    protected $casts = [
        'mentioned_symbols' => 'array',
        'published_at'      => 'datetime',
    ];

    /**
     * Scope to articles that mention a given PSX symbol.
     */
    public function scopeForSymbol(\Illuminate\Database\Eloquent\Builder $query, string $symbol): \Illuminate\Database\Eloquent\Builder
    {
        return $query->whereJsonContains('mentioned_symbols', strtoupper($symbol));
    }
}
