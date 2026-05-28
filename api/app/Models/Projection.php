<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Projection extends Model
{
    protected $fillable = ['company_id', 'filing_id', 'status', 'result', 'error'];

    protected $casts = [
        'result' => 'array',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }

    public function filing()
    {
        return $this->belongsTo(Filing::class);
    }
}
