<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class IndexMembership extends Model
{
    protected $fillable = ['company_id', 'index_code'];

    /**
     * Human-readable names for the PSX index codes we track.
     */
    public const NAMES = [
        'KSE100'    => 'KSE-100',
        'KSE30'     => 'KSE-30',
        'KMI30'     => 'KMI-30',
        'KMIALLSHR' => 'KMI All Share',
        'ALLSHR'    => 'PSX All Share',
    ];

    public function company()
    {
        return $this->belongsTo(Company::class);
    }
}
