<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MacroRisk extends Model
{
    protected $fillable = [
        'company_id',
        'adjustment',
        'factors',
        'severity',
        'outlook',
        'summary',
        'assessed_at',
    ];

    protected $casts = [
        'adjustment'  => 'integer',
        'factors'     => 'array',
        'assessed_at' => 'datetime',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
