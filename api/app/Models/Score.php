<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Score extends Model
{
    protected $fillable = ['filing_id', 'score', 'flags', 'price_at_filing'];

    protected $casts = [
        'score' => 'integer',
    ];

    public function getFlagsAttribute($value): array
    {
        if (is_array($value)) return $value;
        if (empty($value)) return [];
        $decoded = json_decode($value, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function filing()
    {
        return $this->belongsTo(Filing::class);
    }
}
