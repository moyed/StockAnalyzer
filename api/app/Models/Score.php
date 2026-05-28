<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Score extends Model
{
    protected $fillable = ['filing_id', 'score', 'flags', 'price_at_filing'];

    protected $casts = [
        'flags' => 'array',
        'score' => 'integer',
    ];

    public function filing()
    {
        return $this->belongsTo(Filing::class);
    }
}
