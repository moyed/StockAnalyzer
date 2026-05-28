<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Company extends Model
{
    protected $fillable = [
        'symbol', 'name', 'sector', 'exchange_type', 'is_defaulter', 'last_price', 'price_updated_at',
    ];

    protected $casts = [
        'is_defaulter' => 'boolean',
        'last_price' => 'decimal:2',
        'price_updated_at' => 'datetime',
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
}
