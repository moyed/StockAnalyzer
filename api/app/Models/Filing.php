<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Filing extends Model
{
    protected $fillable = [
        'company_id', 'quarter', 'filing_date', 'pdf_url', 'pdf_path', 'raw_text', 'ai_analysis', 'status',
        'eps', 'revenue', 'net_profit', 'shares_outstanding',
    ];

    protected $casts = [
        'filing_date' => 'date',
        'ai_analysis' => 'array',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function score()
    {
        return $this->hasOne(Score::class);
    }
}
